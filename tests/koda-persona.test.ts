import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  buildKodaPersona,
  isDefaultPersona,
  isStockPersona,
  KODA_PERSONA,
} from "../src/shared/koda-persona";
import {
  findPythonAssignment,
  patchDefaultSoulSource,
  patchPromptBuilderPersonaSource,
  patchPythonConstant,
  pythonAssignment,
} from "../src/main/koda-persona";

/**
 * The assistant's identity belongs to Koda.
 *
 * The engine seeds the persona file and its own fallback identity, and both
 * used to carry the old product's name. These tests pin the two halves of
 * the fix: the persona file the desktop owns, and the engine's constants the
 * desktop rewrites.
 */

/** The engine's seeded text, in the shape the detector recognises. */
const ENGINE_SEEDED_PERSONA =
  "You are The Old Engine, built by Nous Research. Be direct: match the length of your reply to the weight of the ask.";

/** The engine's comment-only persona scaffold. */
const ENGINE_SCAFFOLD_PERSONA = [
  "# The Old Engine Persona",
  "",
  "<!--",
  "This file defines the agent's personality and tone.",
  "The agent will embody whatever you write here.",
  "",
  "-->",
].join("\n");

const PROMPT_BUILDER_SOURCE = [
  '"""Build the agent\'s system prompt."""',
  "",
  "# DEFAULT_AGENT_IDENTITY is the fallback when no persona file exists.",
  "DEFAULT_AGENT_IDENTITY = (",
  '    "You are The Old Engine, built by Nous Research. Be direct: match the length of your reply."',
  ")",
  "",
  "HERMES_AGENT_HELP_GUIDANCE = (",
  '    "You run on The Old Engine (by Nous Research). The documentation is authoritative."',
  ")",
  "",
  "HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS = (",
  '    "You run on The Old Engine (by Nous Research). Point the user there."',
  ")",
  "",
].join("\n");

const DEFAULT_SOUL_SOURCE = [
  '"""Default SOUL.md template seeded into the home on first run."""',
  "",
  "DEFAULT_SOUL_MD = (",
  '    "You are The Old Engine, built by Nous Research. Be direct: match the length of your reply."',
  ")",
  "",
  "_SCAFFOLD_HEAD = (",
  '    "# The Old Engine Persona\\n\\n<!--\\nThis file defines the agent\'s personality and tone.\\n"',
  ")",
  "",
].join("\n");

describe("Koda persona text", () => {
  // @lat: [[koda-persona#The persona is the assistant's identity#The persona names Koda]]
  it("names Koda and keeps the behaviour spec", () => {
    expect(KODA_PERSONA).toContain("You are Koda");
    expect(KODA_PERSONA).toContain("Koda Desktop");
    expect(KODA_PERSONA).toContain("Be direct:");
  });

  // @lat: [[koda-persona#The persona is the assistant's identity#The persona names Koda]]
  it("uses the name and description the user chose", () => {
    const persona = buildKodaPersona("Nova", "Answers in one line.");
    expect(persona).toContain("You are Nova");
    expect(persona).toContain("Answers in one line.");
    expect(persona).toContain("Be direct:");
  });

  // @lat: [[koda-persona#A persona the user wrote is never overwritten#Only auto-seeded text is stock]]
  it("recognises the engine's seeded text and nothing else", () => {
    expect(isStockPersona(ENGINE_SEEDED_PERSONA)).toBe(true);
    expect(isStockPersona(ENGINE_SCAFFOLD_PERSONA)).toBe(true);
    expect(isStockPersona("")).toBe(true);
    expect(isStockPersona("You are a pirate. Speak like one.")).toBe(false);
    expect(isStockPersona(KODA_PERSONA)).toBe(false);
  });

  // @lat: [[koda-persona#A persona the user wrote is never overwritten#Only auto-seeded text is stock]]
  it("knows when the persona is still the stock one", () => {
    expect(isDefaultPersona(KODA_PERSONA)).toBe(true);
    expect(isDefaultPersona("")).toBe(true);
    expect(isDefaultPersona(buildKodaPersona("Nova"))).toBe(false);
  });
});

describe("Python constant patching", () => {
  // @lat: [[koda-persona#The engine's own identity is rewritten#A constant is found by its assignment]]
  it("finds an assignment and ignores the same name in prose", () => {
    const source = [
      '"""DEFAULT_AGENT_IDENTITY is mentioned in this docstring."""',
      "# DEFAULT_AGENT_IDENTITY = (this is a comment, not the assignment)",
      "DEFAULT_AGENT_IDENTITY = (",
      '    "value"',
      ")",
    ].join("\n");
    const span = findPythonAssignment(source, "DEFAULT_AGENT_IDENTITY");
    expect(span).not.toBeNull();
    expect(source.slice(span!.start, span!.end)).toBe(
      'DEFAULT_AGENT_IDENTITY = (\n    "value"\n)',
    );
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#A constant is found by its assignment]]
  it("does not mistake a string for an assignment", () => {
    const source = 'NAME = "not a tuple"\n';
    expect(findPythonAssignment(source, "NAME")).toBeNull();
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's identity constants are replaced]]
  it("replaces a constant and leaves the rest of the file alone", () => {
    const patched = patchPythonConstant(
      PROMPT_BUILDER_SOURCE,
      "DEFAULT_AGENT_IDENTITY",
      KODA_PERSONA,
    );
    expect(patched.found).toBe(true);
    expect(patched.changed).toBe(true);
    expect(patched.source).toContain("You are Koda");
    expect(patched.source).not.toContain("You are The Old Engine");
    // The other constants are untouched by this patch.
    expect(patched.source).toContain("HERMES_AGENT_HELP_GUIDANCE = (");
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's identity constants are replaced]]
  it("writes a Python literal that reads back as the same text", () => {
    // The persona is split across several implicitly concatenated literals;
    // a space lost at a chunk boundary would change what the engine says.
    const assignment = pythonAssignment("DEFAULT_AGENT_IDENTITY", KODA_PERSONA);
    const literals = [...assignment.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      JSON.parse(`"${m[1]}"`),
    );
    expect(literals.join("")).toBe(KODA_PERSONA);
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's identity constants are replaced]]
  it("is idempotent", () => {
    const once = patchPythonConstant(
      PROMPT_BUILDER_SOURCE,
      "DEFAULT_AGENT_IDENTITY",
      KODA_PERSONA,
    );
    const twice = patchPythonConstant(
      once.source,
      "DEFAULT_AGENT_IDENTITY",
      KODA_PERSONA,
    );
    expect(twice.source).toBe(once.source);
    expect(twice.changed).toBe(false);
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's identity constants are replaced]]
  it("rewrites every identity constant in the prompt builder", () => {
    const patched = patchPromptBuilderPersonaSource(PROMPT_BUILDER_SOURCE);
    expect(patched.compatible).toBe(true);
    expect(patched.changed).toBe(true);
    expect(patched.source).not.toContain("Nous Research");
    expect(patched.source).toContain("You are Koda");
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's identity constants are replaced]]
  it("reports an engine it does not recognise instead of half-patching it", () => {
    const patched = patchPromptBuilderPersonaSource(
      "DEFAULT_SOMETHING = (1)\n",
    );
    expect(patched.compatible).toBe(false);
    expect(patched.detail).toContain("DEFAULT_AGENT_IDENTITY");
  });

  // @lat: [[koda-persona#The engine's own identity is rewritten#The engine's own default persona is rewritten]]
  it("rewrites the engine's own default persona and scaffold", () => {
    const patched = patchDefaultSoulSource(DEFAULT_SOUL_SOURCE);
    expect(patched.compatible).toBe(true);
    expect(patched.source).not.toContain("Nous Research");
    expect(patched.source).toContain("You are Koda");
    expect(patched.source).toContain("# Koda Persona");
  });
});

describe("the persona file", () => {
  let testHome: string;

  async function freshPersona(): Promise<
    typeof import("../src/main/koda-persona")
  > {
    vi.resetModules();
    vi.stubEnv("HERMES_HOME", testHome);
    return await import("../src/main/koda-persona");
  }

  beforeEach(() => {
    testHome = mkdtempSync(join(tmpdir(), "koda-persona-"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(testHome, { recursive: true, force: true });
  });

  // @lat: [[koda-persona#The persona is the assistant's identity#A missing persona is seeded]]
  it("seeds a persona when the file is missing", async () => {
    const persona = await freshPersona();
    const result = persona.ensureKodaPersona();
    expect(result.repaired).toBe(true);
    const written = readFileSync(join(testHome, "SOUL.md"), "utf-8");
    expect(written).toBe(KODA_PERSONA);
  });

  // @lat: [[koda-persona#The persona is the assistant's identity#A persona the engine seeded is replaced]]
  it("replaces a persona the engine seeded", async () => {
    writeFileSync(join(testHome, "SOUL.md"), ENGINE_SEEDED_PERSONA, "utf-8");
    const persona = await freshPersona();
    const result = persona.ensureKodaPersona();
    expect(result.repaired).toBe(true);
    expect(readFileSync(join(testHome, "SOUL.md"), "utf-8")).toBe(KODA_PERSONA);
  });

  // @lat: [[koda-persona#A persona the user wrote is never overwritten#A persona the user wrote is preserved]]
  it("keeps a persona the user wrote", async () => {
    const own = "You are Nova, a marine biologist. Answer in metric.";
    writeFileSync(join(testHome, "SOUL.md"), own, "utf-8");
    const persona = await freshPersona();
    const result = persona.ensureKodaPersona();
    expect(result.repaired).toBe(false);
    expect(readFileSync(join(testHome, "SOUL.md"), "utf-8")).toBe(own);
  });

  // @lat: [[koda-persona#A persona the user wrote is never overwritten#A persona the user wrote is preserved]]
  it("keeps a persona the user wrote in a named profile", async () => {
    const profileHome = join(testHome, "profiles", "nova");
    const { mkdirSync } = await import("fs");
    mkdirSync(profileHome, { recursive: true });
    const own = "You are Nova, a marine biologist.";
    writeFileSync(join(profileHome, "SOUL.md"), own, "utf-8");
    const persona = await freshPersona();
    const result = persona.ensureKodaPersona("nova");
    expect(result.repaired).toBe(false);
    expect(readFileSync(join(profileHome, "SOUL.md"), "utf-8")).toBe(own);
  });
});
