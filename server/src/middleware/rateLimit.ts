/**
 * Rate limiting via `hono-rate-limiter` with the default MemoryStore.
 *
 * Why memory store: user explicitly opted out of Redis. At indie launch volume
 * (≤ ~100 IPs/day) a single Node process is fine. Trade-off: the counter
 * resets on server restart. If you redeploy mid-launch an attacker gets a
 * fresh window — acceptable for now.
 *
 * If you ever want persistence: swap `store: new MemoryStore()` for
 * `new UnstorageStore({ storage: ... })` (Cloudflare KV / R2 / fs-driver) or
 * `new RedisStore({ client: upstashClient })`. No other code needs to change.
 *
 * Tier table (per IP):
 *   POST  /api/match               → 4   / 2 min  (LLM seed call) [DEV — bump to 2h pre-launch]
 *   POST  /:id/result              → 10  / 10 min (squad-pick + verdict LLMs)
 *   POST  /:id/lot-end             → 60  / 1 min  (kicks async cap-planning LLM)
 *   POST  /:id/bid                 → 120 / 1 min  (no LLM, anti-spam)
 *   POST  /:id/ai-fire             → 60  / 1 min  (no LLM, anti-spam)
 *   POST  /:id/start               → 20  / 1 min  (cheap, defensive)
 *   *  catch-all                   → 300 / 1 min  (global safety net)
 *
 * Every limiter returns 429 with body { error, scope, message, retryAfterMs }
 * and a Retry-After header (seconds). Client surfaces retryAfterMs in a toast.
 */

import { rateLimiter } from "hono-rate-limiter";
import type { Context } from "hono";

// ─────────────────────────── dev/test bypass ───────────────────────────

/**
 * In dev/test (NODE_ENV !== "production"), skip rate limiting for clearly-local
 * callers. Avoids the "every restart eats my budget" problem without weakening
 * the production path. Detection: no real CDN headers present AND IP resolves
 * to localhost / loopback / our "local-dev" sentinel.
 *
 * Set RATE_LIMIT_FORCE=1 to disable the bypass (useful for testing 429 paths
 * locally without standing up a CDN).
 */
function shouldSkipForLocalDev(c: Context): boolean {
  if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod") {
    return false;
  }
  if (process.env.RATE_LIMIT_FORCE === "1") {
    return false;
  }
  // Real CDN headers present → trust them, apply the limit.
  if (c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")) {
    return false;
  }
  return true;
}

// ─────────────────────────── IP extraction ───────────────────────────

/**
 * Pull the client IP from the most-trusted header first. Behind Cloudflare we
 * trust cf-connecting-ip; behind any standard proxy/CDN we fall back to the
 * first IP in X-Forwarded-For. On localhost dev all of these are absent and we
 * collapse every caller to "local-dev" — fine because the limit windows are
 * large enough that no honest dev triggers them.
 */
export function getClientIp(c: Context): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = c.req.header("x-real-ip");
  if (realIp) return realIp;
  return "local-dev";
}

// ─────────────────────────── handler builder ───────────────────────────

/**
 * Custom 429 handler — sets Retry-After header (seconds, RFC 7231 §7.1.3) and
 * a JSON body with retryAfterMs so the client can show a precise countdown.
 *
 * `c.get("rateLimit")` (set by the middleware) exposes the resetTime as a
 * Date — turn it into ms-from-now. Fall back to windowMs if anything is off.
 */
function build429Handler(scope: string, windowMs: number, message: string) {
  return (c: Context) => {
    const info = c.get("rateLimit") as { resetTime?: Date } | undefined;
    const resetTime = info?.resetTime;
    const retryAfterMs = resetTime
      ? Math.max(0, resetTime.getTime() - Date.now())
      : windowMs;
    c.header("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return c.json(
      {
        error: "rate_limit",
        scope,
        message,
        retryAfterMs,
      },
      429
    );
  };
}

// ─────────────────────────── individual limiters ───────────────────────────

// DEV WINDOW — short so manual testing doesn't lock you out for 2 hours.
// Before public launch, change CREATE_MATCH_WINDOW_MS → TWO_HOURS and update
// the user-facing copy ("come back in a couple of hours").
const TWO_HOURS = 2 * 60 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const TWO_MIN = 2 * 60 * 1000;
const ONE_MIN = 60 * 1000;
const CREATE_MATCH_WINDOW_MS = TWO_MIN;

export const createMatchLimiter = rateLimiter({
  windowMs: CREATE_MATCH_WINDOW_MS,
  limit: 4,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "create_match",
    CREATE_MATCH_WINDOW_MS,
    "Too many matches started. Try again in a minute or two."
  ),
});

export const resultLimiter = rateLimiter({
  windowMs: TEN_MIN,
  limit: 10,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "submit_result",
    TEN_MIN,
    "Slow down on the result submissions."
  ),
});

export const lotEndLimiter = rateLimiter({
  windowMs: ONE_MIN,
  limit: 60,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "lot_end",
    ONE_MIN,
    "Lot-end requests are throttled."
  ),
});

export const bidLimiter = rateLimiter({
  windowMs: ONE_MIN,
  limit: 120,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "bid",
    ONE_MIN,
    "Easy on the bid button — slow down for a second."
  ),
});

export const aiFireLimiter = rateLimiter({
  windowMs: ONE_MIN,
  limit: 60,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "ai_fire",
    ONE_MIN,
    "AI-fire requests are throttled."
  ),
});

export const startLimiter = rateLimiter({
  windowMs: ONE_MIN,
  limit: 20,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "start_lot",
    ONE_MIN,
    "Too many match-start attempts."
  ),
});

export const globalLimiter = rateLimiter({
  windowMs: ONE_MIN,
  limit: 300,
  standardHeaders: "draft-6",
  keyGenerator: getClientIp,
  skip: shouldSkipForLocalDev,
  handler: build429Handler(
    "global",
    ONE_MIN,
    "Too many requests. Pause for a moment."
  ),
});
