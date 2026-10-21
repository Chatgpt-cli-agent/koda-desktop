import type { RemoteSessionConfig } from "./remote-sessions";

function normalizeRemoteDashboardBaseUrl(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error("Remote Koda dashboard URL is not configured.");
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  if (url.pathname === "/v1" || url.pathname === "/api") {
    url.pathname = "";
  }
  return url.toString().replace(/\/+$/, "");
}

// Exported so every dashboard request — including remote-metadata's /api/status
// probe — shares ONE URL builder and gets the same `?profile=` scoping.
export function dashboardApiUrl(
  config: RemoteSessionConfig,
  path: string,
): string {
  const base = normalizeRemoteDashboardBaseUrl(config.remoteUrl);
  const url = new URL(path, `${base}/`);
  // Scope to the requested profile on the unified machine dashboard, unless the
  // path already carries an explicit profile (e.g. the sessions list uses
  // `profile=all`). "default"/empty needs no param.
  const profile = config.profile?.trim();
  if (profile && profile !== "default" && !url.searchParams.has("profile")) {
    url.searchParams.set("profile", profile);
  }
  return url.toString();
}
