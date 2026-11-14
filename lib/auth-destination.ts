/** Keep successful credentials navigation on the browser's current origin.
 * NEXTAUTH_URL may name a different development host/port. The callback has
 * already been restricted by the auth page; validate again at the client edge. */
export function authDestination(callback: string, fallback = "/auth/continue") {
  if (!callback.startsWith("/") || callback.startsWith("//") || /[\\\r\n\t]/.test(callback)) return fallback;
  try {
    const url = new URL(callback, "https://haven.invalid");
    return url.origin === "https://haven.invalid" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}
