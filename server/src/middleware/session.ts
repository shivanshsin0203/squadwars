/**
 * Session-cookie binding for matchId routes.
 *
 * The model: matchId is a bearer token in the URL — anyone with the URL can
 * play. We bind that matchId to a server-issued session cookie at match
 * creation; subsequent requests for the same matchId must present the same
 * cookie or get 403.
 *
 *   POST /api/match               → issueSession(token) — Set-Cookie
 *   POST /api/match/:id/*         → sessionMatches()     — validates cookie
 *
 * What this stops:
 *   - URL pasted into a different browser/device (cookie absent → 403)
 *   - URL leaked via referer / OG preview / chat snippet (same)
 *
 * What this does NOT stop:
 *   - Two tabs in the same browser (cookies are shared by design)
 *   - Cookie stolen via XSS (httpOnly mitigates non-XHR access; CSP is the real fix)
 *
 * Dev vs prod cookie attributes (the `prod` flag, derived from env.NODE_ENV):
 *   - Dev (prod=false): secure=false, sameSite=Lax. Localhost is http: so Secure
 *     would suppress the cookie; localhost:3000 ↔ :8787 are same-site so Lax works.
 *   - Prod (prod=true): secure=true, sameSite=None — required because the deployed
 *     client (squadwars.online) and worker (*.workers.dev / api.squadwars.online)
 *     are different registrable domains. Browsers reject SameSite=None without Secure.
 *
 * This module is store-agnostic and reads no process.env — the caller (the
 * MatchDO / worker) passes the expected token and the prod flag explicitly,
 * because on Workers there is no ambient environment at module scope.
 */

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE_NAME = "sw_session";
/** Header carrying the per-match token — the primary auth path (cookie is fallback).
 *  Needed because the *.workers.dev cookie is third-party and blocked by many browsers. */
export const SESSION_HEADER = "x-sw-session";

const SESSION_MAX_AGE_S = 24 * 60 * 60; // 24h — matches stay playable for a day.

/**
 * Set the session cookie on a freshly-created match. Call from the create
 * handler right after the AuctionMatch is constructed.
 */
export function issueSession(c: Context, token: string, prod: boolean): void {
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: prod,
    sameSite: prod ? "None" : "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** The raw sw_session cookie value, if present. */
export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE_NAME);
}

/**
 * True when the request's sw_session cookie matches the match's bound token.
 * The caller is responsible for the match-not-found (404) case; this only
 * answers the cookie question (403 vs allowed).
 */
export function sessionMatches(c: Context, expectedToken: string): boolean {
  // Header first (primary path; survives third-party-cookie blocking)…
  const headerToken = c.req.header(SESSION_HEADER);
  if (headerToken && headerToken === expectedToken) return true;
  // …then the cookie (fallback for browsers that still send it).
  const cookieToken = getCookie(c, SESSION_COOKIE_NAME);
  return !!cookieToken && cookieToken === expectedToken;
}
