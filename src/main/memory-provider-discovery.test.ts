// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import {
  discoverMemoryProviderDirectories,
  memoryProviderDiscoveryScript,
} from "./memory-provider-discovery";

const homes: string[] = [];
function home(): string {
  const path = mkdtempSync(join(tmpdir(), "memory-discovery-"));
  homes.push(path);
  return path;
}

/**
 * The discovery script runs on the remote POSIX host over SSH, where
 * `os.path.expanduser("~")` resolves through `$HOME`. On Windows the
 * interpreter derives the home directory from `USERPROFILE` and ignores
 * `HOME`, so point both at the fixture root to reproduce the remote layout.
 */
function remoteEnv(
  root: string,
  overrides: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: root,
    USERPROFILE: root,
    ...overrides,
  };
}
function plugin(
  root: string,
  name: string,
  source = "class Plugin(MemoryProvider): pass",
): void {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "__init__.py"), source);
}
afterEach(() => {
  for (const path of homes.splice(0))
    rmSync(path, { recursive: true, force: true });
});

describe("external memory provider directory discovery", () => {
  // @lat: [[external-memory-providers-tests#Recall Local and SSH identities]]
  it("recognizes both Recall names on Local and the actual named-profile SSH script", () => {
    const root = home();
    const profile = join(root, ".hermes", "profiles", "work");
    for (const name of ["recall", "recall-memory-hermes"])
      plugin(join(profile, "plugins"), name);
    const expected = [
      {
        name: "recall-memory-hermes",
        description: "memory.providers.recall",
        envVars: [],
        installed: true,
        active: true,
      },
      {
        name: "recall",
        description: "memory.providers.recall",
        envVars: [],
        installed: true,
        active: false,
      },
    ];
    expect(
      discoverMemoryProviderDirectories(
        join(root, "missing"),
        profile,
        "recall-memory-hermes",
      ),
    ).toEqual(expected);
    expect(
      JSON.parse(
        execFileSync("python3", ["-c", memoryProviderDiscoveryScript()], {
          input: JSON.stringify({
            profile: "work",
            active: "recall-memory-hermes",
          }),
          env: remoteEnv(root, { HERMES_HOME: "" }),
          encoding: "utf8",
        }),
      ),
    ).toEqual(expected);
  });
  // @lat: [[external-memory-providers-tests#Local user plugin discovery]]
  it("finds a flat Graphnosis install without a bundled repo and never executes source", () => {
    const root = home();
    plugin(
      join(root, "plugins"),
      "graphnosis",
      "register_memory_provider\nraise RuntimeError('must not run')",
    );
    plugin(join(root, "plugins"), "ordinary", "print('not a memory provider')");
    expect(
      discoverMemoryProviderDirectories(
        join(root, "missing"),
        root,
        "graphnosis",
      ),
    ).toEqual([
      {
        name: "graphnosis",
        description: "memory.providers.graphnosis",
        envVars: [],
        installed: true,
        active: true,
      },
    ]);
  });

  // @lat: [[external-memory-providers-tests#Profile plugin isolation]]
  it("does not expose default-profile plugins to a named profile and marks missing configured code unavailable", () => {
    const root = home();
    const named = join(root, "profiles", "work");
    plugin(join(root, "plugins"), "graphnosis");
    plugin(join(named, "plugins"), "custom-memory");
    expect(
      discoverMemoryProviderDirectories(
        join(root, "missing"),
        named,
        "graphnosis",
      ),
    ).toEqual([
      {
        name: "graphnosis",
        description: "memory.providers.graphnosis",
        envVars: [],
        installed: false,
        active: true,
      },
      {
        name: "custom-memory",
        description: "custom-memory",
        envVars: [],
        installed: true,
        active: false,
      },
    ]);
  });

  // @lat: [[external-memory-providers-tests#SSH discovery parity]]
  it("executes the actual SSH discovery script against isolated default and named homes", () => {
    const root = home();
    const base = join(root, ".hermes");
    plugin(join(base, "hermes-agent", "plugins", "memory"), "honcho");
    plugin(join(base, "plugins"), "graphnosis");
    plugin(join(base, "profiles", "work", "plugins"), "custom-memory");
    const discover = (
      profile: string,
    ): Array<{
      name: string;
      active: boolean;
      installed: boolean;
      description: string;
    }> =>
      JSON.parse(
        execFileSync("python3", ["-c", memoryProviderDiscoveryScript()], {
          input: JSON.stringify({ profile, active: "graphnosis" }),
          env: remoteEnv(root, { HERMES_HOME: "" }),
          encoding: "utf8",
        }),
      );
    expect(discover("default").map((p) => p.name)).toEqual([
      "graphnosis",
      "honcho",
    ]);
    expect(discover("work")).toEqual([
      {
        name: "graphnosis",
        description: "memory.providers.graphnosis",
        envVars: [],
        installed: false,
        active: true,
      },
      {
        name: "custom-memory",
        description: "custom-memory",
        envVars: [],
        installed: true,
        active: false,
      },
      {
        name: "honcho",
        description: "memory.providers.honcho",
        envVars: ["HONCHO_API_KEY"],
        installed: true,
        active: false,
      },
    ]);
    expect(
      readFileSync(join(base, "plugins", "graphnosis", "__init__.py"), "utf8"),
    ).toBe("class Plugin(MemoryProvider): pass");
  });
  // @lat: [[external-memory-providers-tests#Managed SSH discovery refusal]]
  it.each(["launcher", "custom-home"])(
    "refuses unverified %s roots without executing them",
    (kind) => {
      const root = home();
      if (kind === "launcher") {
        const directory = join(root, ".config", "hermes-desktop");
        mkdirSync(directory, { recursive: true });
        const launcher = join(directory, "remote-hermes");
        writeFileSync(launcher, "#!/bin/sh\nexit 99\n");
        chmodSync(launcher, 0o700);
      }
      expect(() =>
        execFileSync("python3", ["-c", memoryProviderDiscoveryScript()], {
          input: JSON.stringify({ profile: "work" }),
          env: remoteEnv(root, {
            HERMES_HOME: kind === "custom-home" ? join(root, "managed") : "",
          }),
          stdio: ["pipe", "pipe", "pipe"],
        }),
      ).toThrow(/Memory provider discovery is unavailable/);
    },
  );
});
