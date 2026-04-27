const REDIRECT_KEY = "tektra:post-login-redirect";

/**
 * Stores the route the user intended to visit before being forced to /auth.
 * Used so that, after a successful login, we can take them straight to the
 * notification target (e.g. /project/123/signatures) instead of the dashboard.
 */
export function saveIntendedRoute(path: string) {
  if (!path) return;
  if (path === "/" || path === "/auth" || path.startsWith("/auth?")) return;
  if (path.startsWith("/reset-password") || path.startsWith("/unsubscribe")) return;
  try {
    sessionStorage.setItem(REDIRECT_KEY, path);
  } catch {}
}

export function consumeIntendedRoute(): string | null {
  try {
    const v = sessionStorage.getItem(REDIRECT_KEY);
    if (v) sessionStorage.removeItem(REDIRECT_KEY);
    return v;
  } catch {
    return null;
  }
}

export function peekIntendedRoute(): string | null {
  try {
    return sessionStorage.getItem(REDIRECT_KEY);
  } catch {
    return null;
  }
}