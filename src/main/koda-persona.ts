import { createHash } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { HERMES_HOME, HERMES_REPO } from "./installer";
import { writeCompatFileAtomically } from "./hermes-agent-compat";
import { profileHome } from "./utils";
import { readSoul, writeSoul } from "./soul";
import {
  KODA_PERSONA,
  isStockPersona,
  normalizeSoulText,
} from "../shared/koda-persona";

/**
 * Koda owns the assistant's identity.
 *
 * Two files decide what the assistant says it is:
 *
 *   1. `SOUL.md` in the engine's home — the engine reads it as identity slot
 *      #1, so this is the persona a real conversation runs on.
 *   2. `agent/prompt_builder.py`'s `DEFAULT_AGENT_IDENTITY` — the fallback
 *      for sessions that load no persona at all, plus the two help-guidance
 *      blocks injected into every prompt.
 *
 * The engine seeds both, and it seeds the old product's name into them. So
 * the desktop seeds and repairs the persona file, and rewrites the engine's
 * fallback constants in the installed source — the same launch-time
 * injection the model-library endpoints already use, so an engine update
 * cannot bring the old identity back.
 */

/** The engine's help guidance, rebranded. */
export const KODA_HELP_GUIDANCE =
  "You run on Koda, the assistant in Koda Desktop. When the user needs help with Koda itself — configuring, setting up, using, extending, or troubleshooting it — or when you need to understand your own features, tools, or capabilities, the documentation at https://github.com/Chatgpt-cli-agent/koda-desktop is your authoritative reference and always holds the latest, most up-to-date information. The `hermes-agent` skill has the actual commands and proven workflows — load it with skill_view(name='hermes-agent') before configuring, modifying, or troubleshooting Koda so you don't guess or invent workarounds.";

/** The same guidance for sessions without the skills toolset. */
export const KODA_HELP_GUIDANCE_NO_SKILLS =
  "You run on Koda, the assistant in Koda Desktop. When the user needs help with Koda itself — configuring, setting up, using, extending, or troubleshooting it — or when you need to understand your own features, tools, or capabilities, the documentation at https://github.com/Chatgpt-cli-agent/koda-desktop is your authoritative reference and always holds the latest, most up-to-date information. Point the user there (or read it yourself if you have a way to fetch web content).";

/** The engine's comment-only persona scaffold, rebranded. */
export const KODA_SCAFFOLD_HEAD =
  "# Koda Persona\n\n<!--\nThis file defines the agent's personality and tone.\nThe agent will embody whatever you write here.\nEdit this to customize how Koda communicates with you.\n\n";

export interface PersonaPatchResult {
  /** Every constant the patcher was asked to rewrite was found. */
  compatible: boolean;
  changed: boolean;
  source: string;
  detail: string;
}

export interface PersonaCompatResult {
  ok: boolean;
  changed: boolean;
  detail: string;
  paths: string[];
}

/* -------------------------------------------------------------------------- */
/* Python source patching                                                     */
/* -------------------------------------------------------------------------- */

/** A Python string literal, escaped. */
export function pythonLiteral(text: string): string {
  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

/**
 * A Python assignment of a long string, split over several lines the way the
 * engine writes its own constants.
 */
export function pythonAssignment(name: string, text: string): string {
  const words = text.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && current.length + word.length + 1 > 96) {
      // The space that joined the two words belongs to the text, so it goes
      // with the chunk that ends there.
      chunks.push(`${current} `);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) chunks.push(current);
  const body = chunks.map((chunk) => `    ${pythonLiteral(chunk)}`).join("\n");
  return `${name} = (\n${body}\n)`;
}

function isIdentifierChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

/** Skip a Python string literal starting at `start`; returns the index after it. */
function skipPythonString(source: string, start: number): number {
  const quote = source[start];
  const triple = source.startsWith(quote.repeat(3), start)
    ? quote.repeat(3)
    : quote;
  let i = start + triple.length;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source.startsWith(triple, i)) return i + triple.length;
    if (triple.length === 1 && source[i] === "\n") return i;
    i++;
  }
  return source.length;
}

/** Skip a Python comment; returns the index of the next line. */
function skipPythonComment(source: string, start: number): number {
  const newline = source.indexOf("\n", start);
  return newline < 0 ? source.length : newline + 1;
}

/** The index of the `)` that closes the `(` at `open`, or -1. */
function matchPythonParen(source: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const char = source[i];
    if (char === "#") {
      i = skipPythonComment(source, i);
      continue;
    }
    if (char === '"' || char === "'") {
      i = skipPythonString(source, i);
      continue;
    }
    if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Locate a module-level constant assignment: `NAME = (...)`.
 *
 * The scan is string- and comment-aware, so a constant named in a docstring
 * or a comment is never mistaken for the assignment itself.
 */
export function findPythonAssignment(
  source: string,
  name: string,
): { start: number; end: number } | null {
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === "#") {
      i = skipPythonComment(source, i);
      continue;
    }
    if (char === '"' || char === "'") {
      i = skipPythonString(source, i);
      continue;
    }
    if (
      source.startsWith(name, i) &&
      !isIdentifierChar(source[i - 1]) &&
      !isIdentifierChar(source[i + name.length])
    ) {
      let j = i + name.length;
      while (j < source.length && (source[j] === " " || source[j] === "\t"))
        j++;
      if (source[j] !== "=") {
        i = j;
        continue;
      }
      j++;
      while (j < source.length && /\s/.test(source[j])) j++;
      if (source[j] !== "(") {
        i = j;
        continue;
      }
      const close = matchPythonParen(source, j);
      if (close < 0) return null;
      return { start: i, end: close + 1 };
    }
    i++;
  }
  return null;
}

/** Rewrite one module-level string constant. */
export function patchPythonConstant(
  source: string,
  name: string,
  value: string,
): { found: boolean; changed: boolean; source: string } {
  const span = findPythonAssignment(source, name);
  if (!span) return { found: false, changed: false, source };
  const patched =
    source.slice(0, span.start) +
    pythonAssignment(name, value) +
    source.slice(span.end);
  return { found: true, changed: patched !== source, source: patched };
}

/** Rewrite the engine's identity constants in `agent/prompt_builder.py`. */
export function patchPromptBuilderPersonaSource(
  source: string,
): PersonaPatchResult {
  const targets: [string, string][] = [
    ["DEFAULT_AGENT_IDENTITY", KODA_PERSONA],
    ["HERMES_AGENT_HELP_GUIDANCE", KODA_HELP_GUIDANCE],
    ["HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS", KODA_HELP_GUIDANCE_NO_SKILLS],
  ];
  let patched = source;
  const missing: string[] = [];
  let changed = false;
  for (const [name, value] of targets) {
    const result = patchPythonConstant(patched, name, value);
    if (!result.found) {
      missing.push(name);
      continue;
    }
    patched = result.source;
    changed ||= result.changed;
  }
  if (missing.length > 0) {
    return {
      compatible: false,
      changed,
      source: patched,
      detail: `Could not find ${missing.join(", ")} in the engine's prompt builder.`,
    };
  }
  return {
    compatible: true,
    changed,
    source: patched,
    detail: changed
      ? "Installed Koda's identity in the engine's prompt builder."
      : "Koda's identity is already installed in the engine's prompt builder.",
  };
}

/** Rewrite the engine's seeded persona in `hermes_cli/default_soul.py`. */
export function patchDefaultSoulSource(source: string): PersonaPatchResult {
  const targets: [string, string][] = [
    ["DEFAULT_SOUL_MD", KODA_PERSONA],
    ["_SCAFFOLD_HEAD", KODA_SCAFFOLD_HEAD],
  ];
  let patched = source;
  const missing: string[] = [];
  let changed = false;
  for (const [name, value] of targets) {
    const result = patchPythonConstant(patched, name, value);
    if (!result.found) {
      missing.push(name);
      continue;
    }
    patched = result.source;
    changed ||= result.changed;
  }
  if (missing.length > 0) {
    return {
      compatible: false,
      changed,
      source: patched,
      detail: `Could not find ${missing.join(", ")} in the engine's default persona.`,
    };
  }
  return {
    compatible: true,
    changed,
    source: patched,
    detail: changed
      ? "Installed Koda's persona as the engine's seeded default."
      : "Koda's persona is already the engine's seeded default.",
  };
}

/**
 * Install Koda's identity in the engine's source.
 *
 * The engine is replaced by its own updater, so any patch in it is gone after
 * an update. The desktop re-applies this at every launch, exactly as it
 * re-applies the model-library endpoints.
 */
export function ensureLocalPersonaCompatibility(): PersonaCompatResult {
  const targets: {
    path: string;
    patch: (source: string) => PersonaPatchResult;
  }[] = [
    {
      path: join(HERMES_REPO, "agent", "prompt_builder.py"),
      patch: patchPromptBuilderPersonaSource,
    },
    {
      path: join(HERMES_REPO, "hermes_cli", "default_soul.py"),
      patch: patchDefaultSoulSource,
    },
  ];

  const details: string[] = [];
  const paths: string[] = [];
  let changed = false;
  let compatible = true;

  for (const target of targets) {
    if (!existsSync(target.path)) {
      compatible = false;
      details.push("The engine is not installed yet.");
      continue;
    }
    try {
      const source = readFileSync(target.path, "utf-8");
      const patched = target.patch(source);
      details.push(patched.detail);
      if (!patched.compatible) {
        compatible = false;
        continue;
      }
      if (patched.changed) {
        writeCompatFileAtomically(target.path, patched.source);
        paths.push(target.path);
        changed = true;
      }
    } catch (err) {
      compatible = false;
      details.push(
        err instanceof Error ? err.message : "Could not patch the engine.",
      );
    }
  }

  const result: PersonaCompatResult = {
    ok: compatible,
    changed,
    detail: details.join(" "),
    paths,
  };
  writePersonaMarker(result);
  return result;
}

/* -------------------------------------------------------------------------- */
/* The persona file                                                            */
/* -------------------------------------------------------------------------- */

interface SoulSeedRecord {
  /** sha256 of the persona the desktop wrote. */
  hash: string;
  seededAt: string;
}

function soulSeedMarkerPath(): string {
  return join(HERMES_HOME, "desktop-compat", "soul-seed.json");
}

function readSoulSeedMarkers(): Record<string, SoulSeedRecord> {
  try {
    const path = soulSeedMarkerPath();
    if (!existsSync(path)) return {};
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeSoulSeedMarkers(markers: Record<string, SoulSeedRecord>): void {
  try {
    const path = soulSeedMarkerPath();
    mkdirSync(join(HERMES_HOME, "desktop-compat"), { recursive: true });
    writeFileSync(path, JSON.stringify(markers, null, 2), "utf-8");
  } catch {
    // The marker is bookkeeping only; a failed write must not block the app.
  }
}

function personaHash(text: string): string {
  return createHash("sha256").update(normalizeSoulText(text)).digest("hex");
}

/**
 * True when the persona on disk is still exactly what the desktop wrote.
 *
 * That is the only case where a persona may be upgraded silently: the user
 * has not touched it. Any other content is the user's own work.
 */
function isSeededByKoda(profile: string | undefined, text: string): boolean {
  const markers = readSoulSeedMarkers();
  const record = markers[profileKey(profile)];
  if (!record) return false;
  return record.hash === personaHash(text);
}

function profileKey(profile?: string): string {
  return profile?.trim() || "default";
}

/**
 * Seed or repair the persona file for one profile.
 *
 * The persona is replaced when it is missing, when the engine seeded it
 * (auto-seeded text carries no user intent), or when it is still exactly the
 * persona this desktop wrote (so an improved default can be delivered). A
 * persona the user wrote is never touched.
 */
export function ensureKodaPersona(profile?: string): {
  repaired: boolean;
  path: string;
} {
  const path = join(profileHome(profile), "SOUL.md");
  const existing = readSoul(profile);
  const untouched =
    !existing || isStockPersona(existing) || isSeededByKoda(profile, existing);
  if (!untouched) return { repaired: false, path };
  if (normalizeSoulText(existing) === normalizeSoulText(KODA_PERSONA)) {
    return { repaired: false, path };
  }
  if (!writeSoul(KODA_PERSONA, profile)) return { repaired: false, path };
  const markers = readSoulSeedMarkers();
  markers[profileKey(profile)] = {
    hash: personaHash(KODA_PERSONA),
    seededAt: new Date().toISOString(),
  };
  writeSoulSeedMarkers(markers);
  return { repaired: true, path };
}

/** Every profile the engine home holds. */
export function listProfiles(): string[] {
  const profiles = ["default"];
  try {
    const dir = join(HERMES_HOME, "profiles");
    if (!existsSync(dir)) return profiles;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) profiles.push(entry.name);
    }
  } catch {
    // A missing or unreadable profile directory leaves the default profile.
  }
  return profiles;
}

/** Seed or repair the persona of every profile. */
export function ensureAllKodaPersonas(): {
  repaired: string[];
  preserved: string[];
} {
  const repaired: string[] = [];
  const preserved: string[] = [];
  for (const profile of listProfiles()) {
    const result = ensureKodaPersona(
      profile === "default" ? undefined : profile,
    );
    (result.repaired ? repaired : preserved).push(profile);
  }
  return { repaired, preserved };
}

/* -------------------------------------------------------------------------- */
/* Marker                                                                      */
/* -------------------------------------------------------------------------- */

function writePersonaMarker(result: PersonaCompatResult): void {
  try {
    const dir = join(HERMES_HOME, "desktop-compat");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "persona.json"),
      JSON.stringify(
        {
          ok: result.ok,
          changed: result.changed,
          detail: result.detail,
          paths: result.paths,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch {
    // The marker is diagnostic only.
  }
}
