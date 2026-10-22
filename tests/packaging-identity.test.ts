// @vitest-environment node
import { readFileSync } from "fs";
import { join } from "path";
import { load } from "js-yaml";
import { minimatch } from "minimatch";
import { DebugLogger } from "builder-util";
import { AppInfo } from "app-builder-lib/out/appInfo";
import type { Packager } from "app-builder-lib/out/packager";
import type { Configuration } from "app-builder-lib/out/configuration";
import { validateConfiguration } from "app-builder-lib/out/util/config/config";
import { expandMacro } from "app-builder-lib/out/util/macroExpander";
import { installPrefix } from "app-builder-lib/out/targets/LinuxTargetHelper";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const config = load(
  readFileSync(join(root, "electron-builder.yml"), "utf8"),
) as Configuration;
const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const packager = { config, metadata } as Packager;

describe("platform packaging identity", () => {
  it("accepts the configuration with the installed builder schema", async () => {
    await expect(
      validateConfiguration(config, new DebugLogger()),
    ).resolves.toBeUndefined();
  });

  // @lat: [[desktop-updates#Desktop Updates#Stable and beta release channels#Platform package identity]]
  it("retains the macOS bundle name used by release verification", () => {
    const app = new AppInfo(packager, undefined, config.mac);
    expect(`${app.productFilename}.app`).toBe("Koda.app");
    const verifier = readFileSync(
      join(root, "scripts/verify-native-module-architecture.sh"),
      "utf8",
    );
    expect(verifier).toContain(`${app.productFilename}.app`);
  });

  it("keeps the Linux install path space-free and delegates package setup to the builder", () => {
    const app = new AppInfo(packager, undefined, config.linux);
    const installPath = `${installPrefix}/${app.sanitizedProductName}`;
    expect(installPath).toBe("/opt/Koda");
    expect(config.deb?.afterInstall).toBeUndefined();
    expect(config.rpm?.afterInstall).toBeUndefined();
  });

  it("produces an RPM filename matched by release upload globs", () => {
    const app = new AppInfo(packager, undefined, config.linux);
    const filename = expandMacro(config.rpm!.artifactName!, "x64", app, {
      ext: "rpm",
      os: "linux",
    });
    expect(filename).toBe(`${metadata.name}-${metadata.version}.rpm`);
  });

  // @lat: [[desktop-updates#Stable and beta release channels#Platform package identity#The display name distinguishes the application]]
  it("names the application 'Koda Desktop' everywhere the user sees it", () => {
    // `productName` stays space-free — it decides the Linux install path and
    // the macOS bundle name, and whitespace there crashes Chromium's zygote.
    // The display name is a separate field, and it says "Koda Desktop".
    expect(config.productName).toBe("Koda");
    expect(config.nsis?.shortcutName).toBe("Koda Desktop");
    expect(config.nsis?.uninstallDisplayName).toBe("Koda Desktop");
    expect(config.linux?.desktop?.entry?.Name).toBe("Koda Desktop");
    const extendInfo = config.mac?.extendInfo as
      | Array<{ CFBundleDisplayName?: string }>
      | undefined;
    expect(
      extendInfo?.find((entry) => entry.CFBundleDisplayName)
        ?.CFBundleDisplayName,
    ).toBe("Koda Desktop");
  });

  // @lat: [[desktop-updates#Stable and beta release channels#Platform package identity#The window title names the application]]
  it("titles the window 'Koda Desktop'", () => {
    const html = readFileSync(join(root, "src/renderer/index.html"), "utf8");
    expect(html).toMatch(/<title>Koda Desktop<\/title>/);
    // The runtime fallback must agree with the shell, or a build without the
    // env override would retitle the window back to the ambiguous name.
    const entry = readFileSync(join(root, "src/renderer/src/main.tsx"), "utf8");
    expect(entry).toContain('document.title = appName || "Koda Desktop"');
  });

  // @lat: [[desktop-updates#Stable and beta release channels#Platform package identity#The package carries no build caches]]
  it("keeps the TypeScript build caches out of the package", () => {
    // `npm run build` type-checks first, and `tsc -b` writes an incremental
    // cache next to the sources. The node one was excluded; the web one was
    // missed, so a 350 kB build cache shipped inside the asar.
    const patterns = (config.files ?? []) as string[];
    const excluded = (name: string): boolean =>
      patterns.some(
        (pattern) =>
          pattern.startsWith("!") &&
          minimatch(name, pattern.slice(1), { dot: true }),
      );
    expect(excluded("tsconfig.node.tsbuildinfo")).toBe(true);
    expect(excluded("tsconfig.web.tsbuildinfo")).toBe(true);
  });
});
