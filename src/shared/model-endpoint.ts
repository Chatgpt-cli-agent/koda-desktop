/**
 * Canonical form used when comparing model endpoint identities.
 *
 * URL schemes and host names are case-insensitive, while paths, queries, and
 * fragments may be case-sensitive and must be preserved. Trailing path slashes
 * are ignored so an endpoint remains idempotent when a form adds one.
 */
export function normalizeModelEndpointUrl(
  value: string | null | undefined,
): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return trimmed.replace(/\/+$/, "");
    const credentials =
      parsed.username || parsed.password
        ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ""}@`
        : "";
    const lowerHostname = parsed.hostname.toLowerCase();
    const hostname =
      lowerHostname.includes(":") && !lowerHostname.startsWith("[")
        ? `[${lowerHostname}]`
        : lowerHostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol.toLowerCase()}//${credentials}${hostname}${port}${path}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Whether an endpoint is served by this machine.
 *
 * The main process and the renderer have to agree on this: the main process
 * decides whether an endpoint may be reached without a key, and the renderer
 * decides whether an endpoint's live catalogue replaces the curated model
 * list. A local Studio answers on loopback under whatever provider name the
 * engine gave it — `unsloth`, `custom`, anything — so the host, not the
 * provider's name, is what identifies it.
 */
export function isLoopbackModelEndpoint(
  value: string | null | undefined,
): boolean {
  const trimmed = (value || "").trim();
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}
