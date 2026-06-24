/**
 * KV-backed rate limiter for POST /api/match (match creation).
 *
 * Why KV here specifically: create-match is the ONE expensive route (it fires
 * the synchronous DeepSeek seed call) and the only limiter that genuinely needs
 * cross-isolate shared state with a long window. It fires rarely (a few per IP
 * per window), so its KV write volume is tiny — well within the free tier's
 * 1,000 writes/day. (Per-match spam routes use the in-DO limiter; the global
 * catch-all uses the native binding — both avoid KV writes entirely.)
 *
 * It's a coarse fixed-window counter. KV has no atomic increment and is
 * eventually consistent, so two simultaneous creates could both slip through a
 * boundary — acceptable for an abuse/cost guard, not a correctness gate.
 *
 * 429 contract matches the rest of the app (client decodes retryAfterMs):
 *   body:   { error:"rate_limit", scope:"create_match", message, retryAfterMs }
 *   header: Retry-After (seconds)
 */

import type { Context } from "hono";
import type { Env } from "../env.js";
import { isProd } from "../env.js";
import { getClientIp } from "./clientIp.js";

// 10 creates per 10-minute window per IP. Generous enough that legit users —
// including several behind one shared NAT (office/café/dorm) — never hit it,
// while still bounding LLM-seed cost from a scripted abuser (~60/hr/IP max).
// Short window so it self-clears quickly (no 2-hour lockouts while testing).
const LIMIT = 10;
const PROD_WINDOW_MS = 10 * 60 * 1000;
const DEV_WINDOW_MS = 2 * 60 * 1000;

/**
 * Returns a 429 Response if the caller is over the create-match limit, else null.
 * Fails OPEN: if KV itself errors, we allow the request (a rate limiter must
 * never take down the actual feature).
 */
export async function enforceCreateRateLimit(
  c: Context,
  env: Env
): Promise<Response | null> {
  const windowMs = isProd(env) ? PROD_WINDOW_MS : DEV_WINDOW_MS;
  const ip = getClientIp(c);
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const key = `rl:create:${ip}:${windowStart}`;

  try {
    const raw = await env.KV.get(key);
    const count = raw ? Number.parseInt(raw, 10) || 0 : 0;

    if (count >= LIMIT) {
      const retryAfterMs = Math.max(0, windowStart + windowMs - Date.now());
      c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
      console.log(`[RL:create] id-ip=${ip} BLOCKED count=${count}/${LIMIT}`);
      return c.json(
        {
          error: "rate_limit",
          scope: "create_match",
          message: "Too many matches started. Try again in a little while.",
          retryAfterMs,
        },
        429
      );
    }

    // expirationTtl minimum is 60s; pad past the window so the key self-cleans.
    await env.KV.put(key, String(count + 1), {
      expirationTtl: Math.ceil(windowMs / 1000) + 60,
    });
    return null;
  } catch (err) {
    console.log(`[RL:create] KV error (failing open): ${(err as Error).message}`);
    return null;
  }
}
