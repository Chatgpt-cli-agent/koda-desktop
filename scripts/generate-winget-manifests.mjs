// scripts/generate-winget-manifests.mjs
//
// Fills the YAML templates in build/winget/ with the current version,
// installer URL, and SHA256 of the NSIS installer in dist/, and writes
// the result under dist/winget/manifests/c/Chatgpt-cli-agent/KodaDesktop/<version>/.
//
// The publish owner is Koda's own GitHub account, never upstream's: a
// manifest that resolves to upstream's release would install an upstream
// build over Koda.
//
// Run from CLI: VERSION=0.2.3 PUBLISH_OWNER=Chatgpt-cli-agent node scripts/generate-winget-manifests.mjs
// Or import as ESM and call generateWingetManifests({ rootDir, version, name, publishOwner }).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function generateWingetManifests({
  rootDir,
  version,
  name,
  publishOwner,
}) {
  const exePath = join(rootDir, "dist", `${name}-${version}-setup.exe`);
  if (!existsSync(exePath)) {
    throw new Error(
      `NSIS installer not found at ${exePath}. ` +
        `Run electron-builder --win nsis first, or download the windows-artifacts CI artifact into dist/.`,
    );
  }

  const sha256 = createHash("sha256")
    .update(readFileSync(exePath))
    .digest("hex")
    .toUpperCase();
  const releaseDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const installerUrl = `https://github.com/${publishOwner}/koda-desktop/releases/download/v${version}/${name}-${version}-setup.exe`;
  const releaseNotesUrl = `https://github.com/${publishOwner}/koda-desktop/releases/tag/v${version}`;

  const replacements = {
    VERSION: version,
    INSTALLER_URL: installerUrl,
    INSTALLER_SHA256: sha256,
    RELEASE_DATE: releaseDate,
    RELEASE_NOTES_URL: releaseNotesUrl,
  };

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const fillTemplate = (str) =>
    Object.entries(replacements).reduce(
      (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
      str,
    );

  const templateDir = join(rootDir, "build", "winget");
  if (!existsSync(templateDir)) {
    throw new Error(
      `Winget templates not found at ${templateDir}. ` +
        `This script must be run from the repo root.`,
    );
  }
  // winget-pkgs lays manifests out as
  // manifests/<publisher's first letter>/<Publisher>/<Package>/<version>/.
  // The letter is derived from the publisher so it cannot drift away from the
  // directory name; the package segment must match the PackageIdentifier in
  // the templates.
  const packageName = "KodaDesktop";
  const outDir = join(
    rootDir,
    "dist",
    "winget",
    "manifests",
    publishOwner.slice(0, 1).toLowerCase(),
    publishOwner,
    packageName,
    version,
  );
  mkdirSync(outDir, { recursive: true });

  const identifier = `${publishOwner}.${packageName}`;
  const files = [
    ["Installer.template.yaml", `${identifier}.installer.yaml`],
    ["Locale.en-US.template.yaml", `${identifier}.locale.en-US.yaml`],
    ["Version.template.yaml", `${identifier}.yaml`],
  ];

  for (const [tmplName, outName] of files) {
    const tmpl = readFileSync(join(templateDir, tmplName), "utf-8");
    const filled = fillTemplate(tmpl);
    // Prettier rewrites `{{TOKEN}}` in YAML into the flow mapping
    // `{ { TOKEN } }`, which this script does not substitute. A manifest
    // with a literal placeholder in it is worse than no manifest, so fail
    // loudly instead of publishing it.
    const leftover = filled.match(/\{\{?[A-Z_]+\}\}?/);
    if (leftover) {
      throw new Error(
        `Unsubstituted placeholder ${leftover[0]} in ${tmplName}. ` +
          "The template must keep the {{TOKEN}} spelling (build/winget/ is " +
          "prettier-ignored for this reason).",
      );
    }
    writeFileSync(join(outDir, outName), filled);
  }

  return { outDir, sha256, installerUrl };
}

// CLI entrypoint
const isCli =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const rootDir = process.cwd();
  const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
  const result = generateWingetManifests({
    rootDir,
    version: process.env.VERSION || pkg.version,
    name: pkg.name,
    publishOwner: process.env.PUBLISH_OWNER || "Chatgpt-cli-agent",
  });
  console.log(`Winget manifests generated in ${result.outDir}`);
  console.log(`InstallerSha256: ${result.sha256}`);
  console.log(`InstallerUrl: ${result.installerUrl}`);
}
