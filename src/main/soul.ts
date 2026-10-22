import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { profileHome, safeWriteFile } from "./utils";
import { KODA_PERSONA } from "../shared/koda-persona";

// The persona the "Reset" button restores is the same text the app seeds on
// first run and the same text the engine's own default carries — one
// persona, so a reset cannot put back something else.
const DEFAULT_SOUL = KODA_PERSONA;

export function readSoul(profile?: string): string {
  const soulFile = join(profileHome(profile), "SOUL.md");
  if (!existsSync(soulFile)) return "";

  try {
    return readFileSync(soulFile, "utf-8");
  } catch {
    return "";
  }
}

export function writeSoul(content: string, profile?: string): boolean {
  const soulFile = join(profileHome(profile), "SOUL.md");

  try {
    safeWriteFile(soulFile, content);
    return true;
  } catch {
    return false;
  }
}

export function resetSoul(profile?: string): string {
  writeSoul(DEFAULT_SOUL, profile);
  return DEFAULT_SOUL;
}
