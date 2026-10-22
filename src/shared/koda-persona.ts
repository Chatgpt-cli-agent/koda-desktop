/**
 * Koda's identity.
 *
 * The assistant's voice is not a desktop string — it is the engine's persona
 * file (`SOUL.md`) and the engine's fallback identity constant. Both are
 * seeded by the engine itself, and both used to carry the old product's name,
 * so a Koda install could answer "You are <old brand>, built by <vendor>".
 *
 * This module owns the text Koda answers with, in one place, so the desktop
 * (which seeds `SOUL.md`) and the engine patch (which rewrites the fallback
 * identity) can never drift apart.
 */

/** The name the assistant answers with until the user picks another. */
export const KODA_DEFAULT_NAME = "Koda";

/**
 * The behavior spec. This is the part that is not branding: how long an
 * answer should be, what it must not contain, when depth is earned. It is
 * kept verbatim so rebranding the identity does not silently change how the
 * assistant behaves.
 */
export const KODA_BEHAVIOR_SPEC =
  "Be direct: match the length of your reply to the weight of the ask — a one-line question gets a one-line answer, and finished work gets a short report of what changed, what's verified, and what's left, never a replay of the process. No filler (\"Great question,\" \"I'd be happy to\"), no restating the request back, no re-summarizing what you already said, no narrating tool calls the user can see. Plain claims over adjectives; when unsure, say so plainly. Agree because it's right, not because the user said it. Depth is earned — give it when the user asks for detail, teaches, or the stakes demand it, not by default.";

/**
 * Build the persona file from the user's choices.
 *
 * `name` is the name the assistant answers with; `description` is the user's
 * own sentence about how it should behave. Both are optional — an empty
 * result is the stock Koda persona, which is what the engine seeds.
 */
export function buildKodaPersona(name?: string, description?: string): string {
  const who = name?.trim() || KODA_DEFAULT_NAME;
  const lead = `You are ${who}, the AI assistant in Koda Desktop.`;
  const about = description?.trim() ? ` ${description.trim()}` : "";
  return `${lead}${about}\n\n${KODA_BEHAVIOR_SPEC}`;
}

/** The persona Koda ships with. */
export const KODA_PERSONA = buildKodaPersona();

/**
 * Markers of an auto-seeded persona — a file the engine wrote, not one the
 * user wrote.
 *
 * The engine seeds its own default text and a comment-only scaffold. Both
 * carry zero user intent, so replacing them with Koda's persona is safe; any
 * other content was written by the user and is left alone.
 */
const STOCK_PERSONA_MARKERS = [
  // The engine's seeded default text names its vendor in the opening line.
  "Nous Research",
  // The engine's comment-only scaffold.
  "This file defines the agent's personality",
];

/** Normalize like the engine's own comparison does: one BOM, one newline. */
export function normalizeSoulText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^\uFEFF/, "")
    .trim();
}

/**
 * True when the persona carries no user intent and may be replaced.
 *
 * The test is deliberately narrow. A persona the user wrote almost never
 * opens with "You are " and names a vendor, and never is the engine's
 * comment-only scaffold — so both are recognised as auto-seeded, and
 * everything else is treated as the user's own work and preserved.
 */
export function isStockPersona(text: string): boolean {
  const normalized = normalizeSoulText(text);
  if (!normalized) return true;
  if (normalized.includes(STOCK_PERSONA_MARKERS[1])) return true;
  return (
    normalized.startsWith("You are ") &&
    normalized.includes(STOCK_PERSONA_MARKERS[0])
  );
}

/** True when the persona is still the stock one, so the user has not made it theirs. */
export function isDefaultPersona(text: string): boolean {
  const normalized = normalizeSoulText(text);
  if (!normalized) return true;
  return normalized === normalizeSoulText(KODA_PERSONA);
}
