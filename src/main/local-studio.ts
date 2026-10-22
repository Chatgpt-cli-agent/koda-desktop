import { spawn, type ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import { closeSync, existsSync, mkdirSync, openSync } from "fs";
import http from "http";
import { homedir } from "os";
import { join } from "path";
import type { LocalStudioBackendStatus } from "../shared/local-studio";
import { stopDashboardProcess } from "./dashboard-process-stop";
import { HIDDEN_SUBPROCESS_OPTIONS } from "./process-options";

/**
 * The local Unsloth Studio backend.
 *
 * Koda can run the Studio backend itself, so the app does not depend on the
 * standalone Studio desktop being open. The Studio is installed once into
 * `~/.unsloth/studio`; from then on this module starts the backend as a plain
 * headless server on the port a provider points at, and stops it again when
 * Koda quits.
 *
 * The contract with the Studio is deliberately narrow:
 *
 *  - the backend is an OpenAI-compatible server on 127.0.0.1, and its health
 *    endpoint is the readiness signal;
 *  - a backend that is already healthy is reused as-is and is never stopped by
 *    Koda, because Koda did not start it;
 *  - on Windows the managed CLI is reached through the interpreter beside it.
 *    The generated `unsloth.exe` is an unsigned PE wrapper that Windows
 *    Application Control denies, while the `python.exe` beside it is a signed
 *    CPython binary that runs. The interpreter is spawned directly so the
 *    process tree Koda owns is the backend's own tree.
 */

const IS_WINDOWS = process.platform === "win32";

/** The port a provider points at when nothing else is configured. */
export const DEFAULT_LOCAL_STUDIO_PORT = 8888;

/** How long the backend gets to answer its health endpoint after a spawn. */
const READY_TIMEOUT_MS = 180_000;

/** How often the health endpoint is polled while the backend boots. */
const READY_POLL_MS = 750;

/** The per-request timeout for a single health probe. */
const PROBE_TIMEOUT_MS = 2_500;

/**
 * The Studio's own Windows launcher entrypoint. The leading `sys.path` edit
 * drops the implicit working-directory entry that `python -c` adds, so a
 * stray `unsloth_cli` next to the caller cannot shadow the managed package.
 */
const WINDOWS_CLI_ENTRYPOINT =
  "import sys, os; sys.path[:1] = [x for x in sys.path[:1] if getattr(sys.flags, 'safe_path', False) or x not in ('', os.getcwd())]; sys.argv[0] = 'unsloth'; from unsloth_cli import app; sys.exit(app())";

interface StudioLaunch {
  program: string;
  args: string[];
}

interface ManagedBackend {
  proc: ChildProcess;
  port: number;
}

let owned: ManagedBackend | null = null;
let starting: Promise<LocalStudioBackendStatus> | null = null;

/** Where the Studio keeps its install, its data and its logs. */
export function localStudioHome(): string {
  return join(homedir(), ".unsloth", "studio");
}

/**
 * The OpenAI-compatible base URL a loopback provider points at, or null when
 * the URL names a remote host. A provider on 127.0.0.1 is served by a Studio
 * backend, so this is how a caller decides the local backend has to be up.
 */
export function localStudioTargetFor(
  baseUrl: string | undefined | null,
): { baseUrl: string; port: number } | null {
  if (!baseUrl) return null;
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    return null;
  }
  const port = url.port ? Number(url.port) : DEFAULT_LOCAL_STUDIO_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  const origin = `http://127.0.0.1:${port}`;
  return { baseUrl: `${origin}/v1`, port };
}

/**
 * The managed interpreter (Windows) or launcher script (POSIX) for the Studio
 * CLI. The new `unsloth_studio` layout is preferred; the legacy `.venv`
 * layout is still honoured so an install made before the rename still works.
 */
function resolveStudioLaunch(port: number): StudioLaunch | null {
  const studio = localStudioHome();
  if (IS_WINDOWS) {
    const interpreters = [
      join(studio, "unsloth_studio", "Scripts", "python.exe"),
      join(studio, ".venv", "Scripts", "python.exe"),
    ];
    const interpreter = interpreters.find((candidate) => existsSync(candidate));
    if (!interpreter) return null;
    return {
      program: interpreter,
      args: [
        "-X",
        "utf8",
        "-c",
        WINDOWS_CLI_ENTRYPOINT,
        "studio",
        "--api-only",
        "-H",
        "127.0.0.1",
        "-p",
        String(port),
      ],
    };
  }
  const launchers = [
    join(studio, "unsloth_studio", "bin", "unsloth"),
    join(studio, ".venv", "bin", "unsloth"),
  ];
  const launcher = launchers.find((candidate) => existsSync(candidate));
  if (!launcher) return null;
  return {
    program: launcher,
    args: ["studio", "--api-only", "-H", "127.0.0.1", "-p", String(port)],
  };
}

/** A managed Studio install is present when the CLI can be reached. */
export function isLocalStudioInstalled(): boolean {
  return resolveStudioLaunch(DEFAULT_LOCAL_STUDIO_PORT) !== null;
}

/**
 * Ask the backend whether it is up. The health endpoint answers before the
 * model catalogue is populated, which is exactly the readiness signal wanted:
 * the socket is bound and the API is serving.
 */
function probeHealth(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        method: "GET",
        hostname: "127.0.0.1",
        port,
        path: "/api/health",
        headers: { Accept: "application/json" },
        timeout: PROBE_TIMEOUT_MS,
      },
      (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode < 500));
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function waitForHealth(port: number, deadline: number): Promise<boolean> {
  for (;;) {
    if (await probeHealth(port)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
  }
}

/** The log the backend's stderr is written to, so a failed boot is readable. */
function backendLogPath(): string {
  const logs = join(localStudioHome(), "logs");
  try {
    mkdirSync(logs, { recursive: true });
  } catch {
    return join(localStudioHome(), "koda-desktop-backend.log");
  }
  return join(logs, "koda-desktop-backend.log");
}

function status(
  target: { baseUrl: string; port: number },
  running: boolean,
  isOwned: boolean,
  error?: string,
): LocalStudioBackendStatus {
  return {
    installed: isLocalStudioInstalled(),
    running,
    owned: isOwned,
    baseUrl: target.baseUrl,
    port: target.port,
    pid: isOwned && owned ? owned.proc.pid : undefined,
    error,
  };
}

/** The current state of the local Studio backend, without starting anything. */
export async function getLocalStudioBackendStatus(
  target?: { baseUrl: string; port: number } | null,
): Promise<LocalStudioBackendStatus> {
  const resolved = target ?? {
    baseUrl: `http://127.0.0.1:${DEFAULT_LOCAL_STUDIO_PORT}/v1`,
    port: DEFAULT_LOCAL_STUDIO_PORT,
  };
  const running = await probeHealth(resolved.port);
  const isOwned = Boolean(owned && owned.port === resolved.port);
  return status(
    resolved,
    running,
    isOwned,
    running ? undefined : "The local Studio backend is not running.",
  );
}

/**
 * Make sure a Studio backend is serving `target`. A backend that is already
 * healthy is left running by whoever started it. Otherwise Koda starts one and
 * owns it until `stopLocalStudioBackend` runs.
 */
export async function ensureLocalStudioBackend(
  target?: { baseUrl: string; port: number } | null,
): Promise<LocalStudioBackendStatus> {
  const resolved = target ?? {
    baseUrl: `http://127.0.0.1:${DEFAULT_LOCAL_STUDIO_PORT}/v1`,
    port: DEFAULT_LOCAL_STUDIO_PORT,
  };
  if (starting) return starting;
  starting = ensureLocalStudioBackendInner(resolved).finally(() => {
    starting = null;
  });
  return starting;
}

async function ensureLocalStudioBackendInner(target: {
  baseUrl: string;
  port: number;
}): Promise<LocalStudioBackendStatus> {
  if (await probeHealth(target.port)) {
    const isOwned = Boolean(owned && owned.port === target.port);
    return status(target, true, isOwned);
  }

  const launch = resolveStudioLaunch(target.port);
  if (!launch) {
    return status(
      target,
      false,
      false,
      "The Unsloth Studio is not installed. Run the Studio installer once, then retry.",
    );
  }

  const logPath = backendLogPath();
  let stderrFd: number;
  try {
    stderrFd = openSync(logPath, "a");
  } catch (err) {
    return status(
      target,
      false,
      false,
      `Could not open the Studio backend log at ${logPath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  let proc: ChildProcess;
  try {
    proc = spawn(launch.program, launch.args, {
      cwd: localStudioHome(),
      env: {
        ...process.env,
        // The Studio reads this to tell a desktop-managed launch from a user
        // typing the same command in a shell.
        UNSLOTH_DESKTOP_MANAGED: "1",
        // The backend's owner handshake. The Studio only accepts the "tauri"
        // kind, and with it the backend watches the owner process and exits
        // when that process dies, so a crash of Koda cannot leave the port
        // held by an orphan.
        UNSLOTH_STUDIO_DESKTOP_OWNER_KIND: "tauri",
        UNSLOTH_STUDIO_DESKTOP_OWNER_TOKEN: randomBytes(32).toString("hex"),
        UNSLOTH_STUDIO_DESKTOP_OWNER_PID: String(process.pid),
      },
      stdio: ["ignore", "ignore", stderrFd],
      detached: false,
      ...HIDDEN_SUBPROCESS_OPTIONS,
    });
  } catch (err) {
    closeSync(stderrFd);
    return status(
      target,
      false,
      false,
      `Could not start the Studio backend: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
  closeSync(stderrFd);

  const managed: ManagedBackend = { proc, port: target.port };
  owned = managed;
  proc.once("exit", () => {
    if (owned === managed) owned = null;
  });

  const ready = await waitForHealth(target.port, Date.now() + READY_TIMEOUT_MS);
  if (!ready) {
    // A backend that came up late is still a backend this app started, so it
    // stays owned; the caller sees the failure and can retry.
    const stillRunning = await probeHealth(target.port);
    return status(
      target,
      stillRunning,
      true,
      `The Studio backend did not become ready within ${Math.round(
        READY_TIMEOUT_MS / 1000,
      )}s. See ${logPath}.`,
    );
  }
  return status(target, true, true);
}

/**
 * Stop the backend Koda started. A backend that was already running when
 * Koda started is left alone: it belongs to whoever started it.
 */
export async function stopLocalStudioBackend(): Promise<boolean> {
  const managed = owned;
  if (!managed) return true;
  owned = null;
  return stopDashboardProcess(managed.proc);
}
