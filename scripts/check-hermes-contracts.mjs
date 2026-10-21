// Ratchet: the engine's technical spellings must survive an upstream merge.
//
// The brand ratchet (scripts/check-no-hermes-brand.mjs) only knows about a
// standalone capital-H "Hermes", because that is how the product name is
// written. Every other spelling of the same word — `hermes-agent`, `~/.hermes`,
// `HERMES_HOME`, `hermesone.org` — names a path, a package, an environment
// variable or a hostname. Those are contracts: the Python engine installs
// itself under one name, writes its state under another, and the gateway
// rejects requests whose header is spelled differently.
//
// A find-and-replace over the tree breaks them silently. The app still
// builds, the tests still pass, and then the engine is not found, the GPU
// fallback cannot be turned off, or the remote launcher is never probed.
//
// So this check works in both directions:
//
//   REQUIRED   — a spelling that must still exist somewhere in the tree. If
//                an upstream merge renames it, the check fails.
//   FORBIDDEN  — the exact wrong spellings a rename produces. If one appears,
//                the check fails.
//
// Both lists are deliberately small and each entry says why.
//
// @lat: [[koda-rebrand#Contract ratchet]]
// Run: node scripts/check-hermes-contracts.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Spellings that must exist verbatim somewhere in the scanned tree.
 *
 * Each is a name the engine, the wire protocol or the on-disk layout
 * depends on. If it cannot be found, something renamed it.
 */
const REQUIRED = [
  {
    token: "hermes-agent",
    why: "the Python engine's install folder and package name",
  },
  {
    token: "hermes_cli",
    why: "the Python engine's console-script module",
  },
  {
    token: '"hermes"',
    why: "the console script users type on the command line",
  },
  {
    token: "~/.hermes",
    why: "the engine's home directory on this machine and on remote hosts",
  },
  {
    token: "HERMES_HOME",
    why: "the environment variable that points at the engine's home",
  },
  {
    token: "HERMES_DISABLE_GPU",
    why: "the environment variable that gates the GPU fallback",
  },
  {
    token: "hermesone.org",
    why: "the service hostnames the desktop has to reach",
  },
  {
    token: "X-Hermes-Session-Token",
    why: "the wire-protocol header the gateway checks",
  },
  {
    token: "hermes-account-login",
    why: "the IPC handler and localStorage key for account sign-in",
  },
  {
    token: "hermes-one",
    why: "the IPC handler the account flow uses",
  },
  {
    token: "remote-hermes",
    why: "the managed remote launcher the remote host looks for",
  },
  {
    token: "Chatgpt-cli-agent/koda-desktop",
    why: "the repository the update feed and the release publisher point at",
  },
];

/**
 * The wrong spellings a rename produces. None of them may appear.
 *
 * These are the exact shapes that broke when the tree was rebranded with a
 * blind find-and-replace: a folder the engine never creates, a flag the
 * upstream installer does not accept, a hostname that does not resolve.
 */
const FORBIDDEN = [
  {
    token: "Koda-agent",
    why: "the engine's install folder is `hermes-agent`, not `Koda-agent`",
  },
  {
    token: "Koda mcp",
    why: "the console script is `hermes`, not `Koda`",
  },
  {
    token: "KodaHome",
    why: "upstream's install.ps1 only accepts -HermesHome",
  },
  {
    token: "Koda_HOME",
    why: "the environment variable is HERMES_HOME",
  },
  {
    token: "Koda_DISABLE_GPU",
    why: "the environment variable is HERMES_DISABLE_GPU",
  },
  {
    token: "Kodaone",
    why: "the service hostname is hermesone.org",
  },
  {
    token: "Koda-cli",
    why: "the package is hermes-cli",
  },
  {
    token: "Koda-one",
    why: "the IPC handler is hermes-one",
  },
  {
    token: "Koda-account-login",
    why: "the IPC handler and localStorage key is hermes-account-login",
  },
  {
    token: "X-Koda-Session-Token",
    why: "the gateway checks the X-Hermes-Session-Token header",
  },
  {
    token: "~/.Koda",
    why: "the engine's home directory is ~/.hermes",
  },
  {
    token: "docker exec -it koda",
    why: "the container example names the upstream image's service user",
  },
  {
    token: ".config/Koda-desktop",
    why: "the managed remote launcher lives under ~/.config/hermes-desktop",
  },
  {
    token: "Chatgpt-cli-agent/hermes-desktop",
    why: "Koda's repository is Chatgpt-cli-agent/koda-desktop since the rename",
  },
  {
    token: "repo: hermes-desktop",
    why: "the update feed and the release publisher must name koda-desktop",
  },
];

// The ratchets name the spellings they police, so they cannot police
// themselves.
const SELF = new Set([
  "scripts/check-hermes-contracts.mjs",
  "scripts/check-no-hermes-brand.mjs",
]);

const ROOTS = ["src", "tests", "scripts", "build", ".github"];
const ROOT_FILES = [
  "electron-builder.yml",
  "dev-app-update.yml",
  "package.json",
];

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = [];
for (const dir of ROOTS) files.push(...walk(join(ROOT, dir)));
for (const file of ROOT_FILES) files.push(join(ROOT, file));

const texts = [];
for (const file of files) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (SELF.has(rel)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue; // binary
  texts.push({ rel, text });
}

const missing = [];
for (const { token, why } of REQUIRED) {
  if (!texts.some(({ text }) => text.includes(token))) {
    missing.push({ token, why });
  }
}

const present = [];
for (const { token, why } of FORBIDDEN) {
  for (const { rel, text } of texts) {
    if (!text.includes(token)) continue;
    const line = text.slice(0, text.indexOf(token)).split("\n").length;
    present.push({ token, why, rel, line });
  }
}

if (missing.length === 0 && present.length === 0) {
  console.log(
    `check-hermes-contracts: OK — ${REQUIRED.length} contract(s) intact across ${texts.length} files.`,
  );
  process.exit(0);
}

if (missing.length > 0) {
  console.error(
    `check-hermes-contracts: ${missing.length} contract(s) no longer in the tree.\n`,
  );
  for (const { token, why } of missing) {
    console.error(`  missing: ${token}  — ${why}`);
  }
  console.error(
    "\nThese are names the engine, the wire protocol or the on-disk layout",
  );
  console.error(
    "depends on. Restore the spelling; a renamed one breaks the feature",
  );
  console.error("silently, long after the merge that broke it.\n");
}

if (present.length > 0) {
  console.error(
    `check-hermes-contracts: ${present.length} renamed contract(s) found.\n`,
  );
  for (const { token, why, rel, line } of present) {
    console.error(`  ${rel}:${line}  "${token}"  — ${why}`);
  }
  console.error(
    "\nA find-and-replace rewrote a technical spelling. Put the original",
  );
  console.error("back: the engine, the gateway or the installer expects it.\n");
}

process.exit(1);
