/**
 * Per-match session token storage (header-based auth).
 *
 * Why not just the cookie: the backend lives on a different registrable domain
 * (*.workers.dev) than the site (squadwars.online), so the `sw_session` cookie
 * is third-party — Firefox/Edge/Safari block it by default, which 403s every
 * game action ("this match belongs to a different session"). So the match-create
 * response also returns the token; we keep it here and send it as a header
 * (x-sw-session) on every /api/match/:id/* call. The server accepts the header
 * OR the cookie.
 *
 * Security model is unchanged: the token is per-match and lives only in this
 * browser's localStorage — pasting the match URL into another browser still
 * yields no token → 403. localStorage (not sessionStorage) so a refresh AND
 * other tabs in the same browser keep working, mirroring the old cookie's scope.
 */

export const SESSION_HEADER = "x-sw-session";

const key = (matchId: string) => `sw_sess_${matchId}`;

export function storeSessionToken(matchId: string, token: string): void {
  try {
    localStorage.setItem(key(matchId), token);
  } catch {
    /* private mode / storage disabled — falls back to the cookie path */
  }
}

export function getSessionToken(matchId: string): string | null {
  try {
    return localStorage.getItem(key(matchId));
  } catch {
    return null;
  }
}
