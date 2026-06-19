/**
 * Session-cookie binding for matchId routes.
 *
 * The model: matchId is a bearer token in the URL — anyone with the URL can
 * play. We bind that matchId to a server-issued session cookie at match
 * creation; subsequent requests for the same matchId must present the same
 * cookie or get 403.
 *
 *   POST /api/match               → issueSession(token) — Set-Cookie
 *   POST /api/match/:id/*         → requireSession      — validates cookie
 *
 * What this stops:
 *   - URL pasted into a different browser/device (cookie absent → 403)
 *   - URL leaked via referer / OG preview / chat snippet (same)
 *
 * What this does NOT stop:
 *   - Two tabs in the same browser (cookies are shared by design)
 *   - Cookie stolen via XSS (httpOnly mitigates this for non-XHR access; CSP is the real fix)
 *
 * Dev vs prod cookie attributes:
 *   - Dev (NODE_ENV != "production"): secure=false, sameSite=Lax
 *     Localhost is http: so Secure would suppress the cookie.
 *     localhost:3000 ↔ localhost:8787 are same-site under the eTLD+1 rule,
 *     so Lax is fine for the cross-port fetch the client does.
 *   - Prod: secure=true, sameSite=None — required if the deployed client
 *     and server live on different registrable domains (e.g. vercel.app +
 *     workers.dev). Browsers reject SameSite=None without Secure.
 */

import type { Context, Next } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getMatch } from "../store.js";

export const SESSION_COOKIE_NAME = "sw_session";

const SESSION_MAX_AGE_S = 24 * 60 * 60; // 24h — matches stay playable for a day.

function isProd(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod";
}

/**
 * Set the session cookie on a freshly-created match. Call from POST /api/match
 * right after the AuctionMatch is constructed and stored.
 */
export function issueSession(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? "None" : "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/**
 * Validate that the caller's sw_session cookie matches the match's bound
 * token. Mounted as middleware in front of every /api/match/:id/* route.
 *
 * Failure responses:
 *   404 → matchId not found at all (don't leak "session mismatch" since the
 *         caller might just have a typo)
 *   403 → match exists but cookie is absent or wrong (someone else's match)
 *
 * Note: this middleware does its own getMatch() lookup outside the per-match
 * lock. That's safe because sessionToken is readonly — set once in the
 * constructor, never mutated. The route handler does a second getMatch()
 * inside withLock() for the actual mutation, but the small extra Map lookup
 * is cheap.
 */
export async function requireSession(c: Context, next: Next): Promise<Response | void> {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "missing_match_id" }, 400);
  }
  const m = getMatch(id);
  if (!m) {
    return c.json({ error: "match_not_found" }, 404);
  }
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!cookieToken || cookieToken !== m.sessionToken) {
    return c.json(
      {
        error: "session_mismatch",
        message: "This match belongs to a different session. Start a new match.",
      },
      403
    );
  }
  await next();
}
