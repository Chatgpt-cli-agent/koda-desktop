// Ratchet: every translation key the app asks for must actually exist.
//
// Renaming a locale key is a silent break. The locale files and the code
// that consumes them are two different places, and nothing in the type
// system connects them: `t("settings.nav.groups.koda")` compiles fine
// whether or not that key exists. When the key disappears, i18next falls
// back to rendering the raw key path as the visible label — the settings
// nav renders the literal text "settings.nav.groups.koda" to the user.
//
// That happened during the Koda rebrand: the locale keys were renamed
// (hermes -> koda, hermesAgent -> kodaAgent) but the consumers were not,
// so several labels silently rendered as raw key paths.
//
// This check closes that hole. It resolves every key the app can ask for
// against the English resource bundle. A key that does not resolve is a
// build failure.
//
// Two rules, because a key can reach i18next two ways:
//
//   1. Direct   — a string literal passed to a translate call:
//                 t("chat.worktree.loading")
//   2. Indirect — a string literal that names a bundle namespace, passed
//                 through a property and translated later:
//                 { labelKey: "settings.nav.groups.koda" }
//                 { label: "constants.kodaCloudApiKey", hint: "…" }
//
// Rule 2 exists because the rebrand's worst breakage hid there: the
// settings nav group id and the provider's API-key label/hint are
// translated a second later, from a property, so a direct-call scan
// never saw them.
//
// Keys are resolved against the *English* bundle only. The English bundle
// is the source of truth and the fallback every other locale defers to;
// the translated bundles legitimately lag it by hundreds of keys, and
// i18next's fallbackLng is what covers that gap. A key missing from
// English is a real bug; a key missing from a translation is not.
//
// Only literal keys are checked — a key built at runtime cannot be
// verified statically, and i18next's fallback behaviour is the safety net
// there.
//
// @lat: [[koda-rebrand#Translation key ratchet]]
// Run: node scripts/check-i18n-keys.mjs
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The translation function names that resolve against the shared bundle.
 *
 * The renderer has its own `useI18n` hook, which returns a `t` that shares
 * this same resource bundle, so a literal passed to it resolves the same
 * way. The shared module also exports a standalone `t`.
 */
const TRANSLATE_FNS = new Set(["t", "i18n.t", "sharedT", "translate"]);

/**
 * Keys that are deliberately absent from the bundle.
 *
 * Each one is a test asserting that i18next renders the key path when
 * nothing matches — the fallback behaviour itself. Every entry says why.
 */
const ALLOWED_MISSING = new Map([
  [
    "common.missingKey",
    "asserts the raw-key fallback in shared/i18n/index.test.ts",
  ],
  [
    "nonExistent.fallbackKey",
    "asserts the raw-key fallback in shared/i18n/index.test.ts",
  ],
  [
    "providers.openrouter",
    "test fixture in ModelPicker.test.tsx; never rendered",
  ],
  ["providers.ollama", "test fixture in ModelPicker.test.tsx; never rendered"],
]);

/**
 * Property names that carry a translation key.
 *
 * A key stored in one of these slots is translated later, in another file —
 * which is exactly how the rebrand's worst breakage hid: the settings nav
 * group id and the provider's API-key label/hint are translated a second
 * later, from a property, so a scan of `t(...)` arguments never saw them.
 *
 * The list is deliberately narrow. A property called `file` or `type` also
 * holds dotted strings ("gateway.log", "gateway.disconnected"), but those
 * are file names and protocol types, not keys.
 */
const KEY_PROPERTIES = new Set([
  "name",
  "label",
  "hint",
  "desc",
  "description",
  "labelKey",
  "descriptionKey",
  "title",
  "tag",
  "i18nKey",
  "providerLabel",
]);

/**
 * Key namespaces that are NOT part of the shared locale bundle.
 *
 * A few components build their own local message catalogues (e.g. a
 * per-screen error table) and use `t` from a local hook. Those keys are
 * resolved by that local bundle, not by shared/i18n, so the shared bundle
 * has no record of them and they must not be reported here.
 */
const LOCAL_NAMESPACES = new Set([
  // Claw3D / office has its own message tables.
  "office",
  "claw3d",
]);

/** Recursively collect every leaf key path of a resource bundle. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function collectLeafKeys(node, prefix = "") {
  const keys = new Set();
  if (!node || typeof node !== "object") return keys;
  for (const [name, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${name}` : name;
    if (value && typeof value === "object") {
      for (const nested of collectLeafKeys(value, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

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
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(p);
  }
  return out;
}

// --- Load the English bundle -------------------------------------------------
// The locale files are TypeScript modules that default-export a plain object.
// Strip the types with esbuild (already a dependency) and evaluate them.
const { build } = await import("esbuild");

const EN_DIR = join(ROOT, "src/shared/i18n/locales/en");
const enFiles = readdirSync(EN_DIR).filter((f) => f.endsWith(".ts"));
const enBundle = {};
for (const file of enFiles) {
  const source = readFileSync(join(EN_DIR, file), "utf8");
  const out = await build({
    stdin: {
      contents: source,
      loader: "ts",
      resolveDir: EN_DIR,
    },
    write: false,
    format: "cjs",
    platform: "node",
  });
  const module = { exports: {} };
  new Function("module", "exports", out.outputFiles[0].text)(
    module,
    module.exports,
  );
  const value = module.exports.default ?? module.exports;
  enBundle[file.replace(/\.ts$/, "")] = value;
}

const knownKeys = collectLeafKeys(enBundle);

/** The top-level namespace of every bundle file, e.g. "settings". */
const namespaces = new Set(Object.keys(enBundle));

// --- Extract every key the app can ask for -----------------------------------
// The locale bundles themselves are excluded: they *are* the source of truth,
// so scanning them would only find the keys they define.
const files = [
  ...walk(join(ROOT, "src/main")),
  ...walk(join(ROOT, "src/renderer/src")),
  ...walk(join(ROOT, "src/preload")),
  ...walk(join(ROOT, "src/shared")),
].filter((f) => !f.replace(/\\/g, "/").includes("src/shared/i18n/locales/"));

const missing = [];
/** Every key the app asked for, whether or not it resolved. */
const asked = new Set();

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = sf.getLineAndCharacterOfPosition.bind(sf);
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const report = (node, key, rule) => {
    if (key.includes("{{")) return; // template literal with interpolation
    if (key.includes("*")) return; // wildcard / partial key
    if (LOCAL_NAMESPACES.has(key.split(".")[0])) return;
    if (ALLOWED_MISSING.has(key)) return;
    asked.add(key);
    if (knownKeys.has(key)) return;
    missing.push({
      file: relative(ROOT, file).replace(/\\/g, "/"),
      line: lineOf(node.getStart(sf)).line + 1,
      key,
      rule,
    });
  };
  /**
   * A literal stored in a key-carrying property is a translation key even
   * when it is not an argument to `t(...)` — that is how the nav group id,
   * and the provider's label/hint, reach i18next.
   */
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const looksLikeKey = (node) => {
    if (!ts.isStringLiteral(node)) return;
    const key = node.text;
    const parts = key.split(".");
    if (parts.length < 2) return;
    if (parts.some((part) => part.length === 0)) return;
    if (!namespaces.has(parts[0])) return;
    report(node, key, "indirect");
  };
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TRANSLATE_FNS.has(node.expression.text) &&
      node.arguments.length > 0
    ) {
      const first = node.arguments[0];
      if (ts.isStringLiteral(first)) report(node, first.text, "direct");
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      if (KEY_PROPERTIES.has(node.name.text)) looksLikeKey(node.initializer);
      // A lookup table keyed by slug: `labels: { openrouter: "constants.openrouterName" }`.
      if (
        node.name.text === "labels" &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        for (const entry of node.initializer.properties) {
          if (ts.isPropertyAssignment(entry)) looksLikeKey(entry.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (missing.length === 0) {
  console.log(
    `check-i18n-keys: OK — ${asked.size} translation key(s) checked, all resolve.`,
  );
  process.exit(0);
}

console.error(
  `check-i18n-keys: ${missing.length} translation key(s) do not exist in the English bundle.\n`,
);
console.error(
  "A missing key renders as its own raw path in the UI. Either restore the",
);
console.error(
  "key in src/shared/i18n/locales/en/, or update the call site to the key",
);
console.error(
  "that actually exists. The key is resolved against the English bundle,",
);
console.error("so every locale needs the same key added.\n");
for (const m of missing) {
  console.error(`  ${m.file}:${m.line}  ${m.key}  (${m.rule})`);
}
process.exit(1);
