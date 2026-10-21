// Ratchet: no user-visible "Hermes" may reappear in the Koda app.
//
// Upstream Hermes Desktop can still merge into this repo, and a merge can
// bring the old brand back with it. This check turns that into a build
// failure instead of a silent regression.
//
// How it works: every string literal in src/main, src/renderer/src,
// src/preload and src/shared is extracted with the TypeScript compiler API
// (which resolves template interpolations and never mistakes a regex or a
// comment for a string), then searched for the old brand. JSX text nodes
// (`>Hermes<`) and the renderer's HTML shell are searched too — the string
// literal pass cannot see either, and both are places a merge can put the
// brand straight back into the UI.
//
// The brand is spelled "Hermes" — capital H, lowercase rest. That casing is
// what distinguishes the *product name* from every technical spelling of the
// same word:
//
//   "Hermes"                       -> the brand            (rejected)
//   "Hermes One" / "Hermes Agent"  -> the brand            (rejected)
//   "X-Hermes-Session-Token"       -> a wire-protocol name (allowed)
//   "hermes-agent", "hermes.service" -> binaries           (allowed)
//   "HERMES_PYTHON", "HERMESONE_API_KEY" -> env vars        (allowed)
//   "hermesone.org"                -> the cloud endpoint   (allowed)
//
// A word is only the brand if it stands alone: it must not be glued to
// letters, digits, dashes or underscores on either side. So "Hermes" and
// "Hermes One" are rejected, while "X-Hermes-Session-Token" is not.
//
// The allowlist below matches WHOLE literals, never substrings. A
// substring allowlist is unsafe here: a single allowed token (say
// "HERMES_") would silently excuse every other brand mention in the same
// literal, which is exactly how brand text used to survive this check.
//
// @lat: [[koda-rebrand#Brand ratchet]]
// Run: node scripts/check-no-hermes-brand.mjs
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The old brand, as a standalone word.
 *
 * Capital H, lowercase rest: that is how the product name is always
 * written, and it is what separates it from the many technical spellings
 * ("hermes-agent", "HERMES_PYTHON", "hermes.service", "X-Hermes-Session-Token")
 * that must keep their exact form to stay compatible with the Python
 * engine, the wire protocol, the on-disk layout and remote hosts.
 */
const BRAND = /(?<![A-Za-z0-9_-])Hermes(?![A-Za-z0-9_-])/;

/**
 * Whole literals that legitimately contain the old brand.
 *
 * Every entry says why. Adding an entry is a deliberate act: it says "this
 * exact string is a contract, not branding". Prefer renaming the string —
 * this list exists for the cases where the spelling cannot change.
 */
const ALLOWED = new Map([
  // The upstream project this app was forked from, named where the
  // provenance is the point.
  ["https://github.com/fathah/hermes-desktop", "upstream project URL"],
  // The Python engine's package and entry-point names. The engine is
  // installed from NousResearch/hermes-agent and provides `hermes` as its
  // CLI; renaming these breaks the install and the update path.
  ["hermes-agent", "the Python engine's package name"],
  ["hermes_cli", "the Python engine's console script"],
]);

// Plain Node scripts are linted with the TypeScript preset, which cannot infer
// JavaScript return types without converting the script to TS.
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

/** Every HTML file under a directory — the renderer's shell, if it changes. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function walkHtml(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkHtml(p, out);
    else if (entry.endsWith(".html")) out.push(p);
  }
  return out;
}

/** A literal is acceptable when it is on the allowlist, verbatim. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function isAllowed(text) {
  return ALLOWED.has(text);
}

const files = [
  ...walk(join(ROOT, "src/main")),
  ...walk(join(ROOT, "src/renderer/src")),
  ...walk(join(ROOT, "src/preload")),
  ...walk(join(ROOT, "src/shared")),
];

const violations = [];
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
  const report = (node, value) => {
    if (!BRAND.test(value)) return;
    if (isAllowed(value)) return;
    violations.push({
      file: relative(ROOT, file).replace(/\\/g, "/"),
      line: lineOf(node.getStart(sf)).line + 1,
      text: value.replace(/\s+/g, " ").slice(0, 160),
    });
  };
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      report(node, node.head.text);
      for (const span of node.templateSpans) report(node, span.literal.text);
    } else if (ts.isJsxText(node)) {
      // Text between tags is not a string literal, so the pass above never
      // sees it — but it is exactly what a user reads.
      report(node, node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// The renderer's HTML shell: <title> and any inline markup.
const htmlFiles = walkHtml(join(ROOT, "src"));
for (const file of htmlFiles) {
  const text = readFileSync(file, "utf8");
  if (!BRAND.test(text)) continue;
  const line = text.slice(0, text.search(BRAND)).split("\n").length;
  violations.push({
    file: relative(ROOT, file).replace(/\\/g, "/"),
    line,
    text: text.replace(/\s+/g, " ").slice(0, 160),
  });
}

if (violations.length === 0) {
  console.log(
    `check-no-hermes-brand: OK — no user-visible "Hermes" in ${files.length + htmlFiles.length} files.`,
  );
  process.exit(0);
}

console.error(
  `check-no-hermes-brand: ${violations.length} user-visible "Hermes" string(s) found.\n`,
);
console.error(
  "This app is Koda. Rename these strings, or — if the literal names",
);
console.error(
  "a protocol/identity contract that must keep its spelling — add it",
);
console.error(
  "to ALLOWED in scripts/check-no-hermes-brand.mjs with a reason.\n",
);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.text}`);
}
process.exit(1);
