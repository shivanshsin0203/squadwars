/**
 * In-Durable-Object rate limiter for the per-match spam routes
 * (bid / ai-fire / lot-end / start / result).
 *
 * Why in-DO memory works here (and didn't on a stateless Worker): each MatchDO
 * is ONE long-lived isolate handling ONE match, so an in-memory counter is an
 * accurate per-match-per-IP count — no shared store, no KV writes, no timers.
 * The counter naturally dies with the DO (which self-deletes after 24h anyway);
 * a hibernation/reset just clears the window, same as the old MemoryStore on a
 * process restart. Lazy windows (reset on read) avoid relying on setInterval,
 * which is unreliable inside a DO.
 *
 * Mirrors the legacy tier table (architecture §5.7), minus the create + global
 * limiters which moved to KV and the native binding respectively.
 */

export type DoLimitScope = "bid" | "ai-fire" | "lot-end" | "start" | "result";

const ONE_MIN = 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;

const LIMITS: Record<
  DoLimitScope,
  { limit: number; windowMs: number; message: string }
> = {
  bid: { limit: 120, windowMs: ONE_MIN, message: "Easy on the bid button — slow down for a second." },
  "ai-fire": { limit: 60, windowMs: ONE_MIN, message: "AI-fire requests are throttled." },
  "lot-end": { limit: 60, windowMs: ONE_MIN, message: "Lot-end requests are throttled." },
  start: { limit: 20, windowMs: ONE_MIN, message: "Too many match-start attempts." },
  result: { limit: 10, windowMs: TEN_MIN, message: "Slow down on the result submissions." },
};

type Bucket = { count: number; resetAt: number };

export type DoLimitResult =
  | { allowed: true }
  | { allowed: false; scope: DoLimitScope; message: string; retryAfterMs: number };

export class PerMatchRateLimiter {
  private buckets = new Map<string, Bucket>();

  /** Count one hit for (scope, ip). Lazy fixed window — resets on first read after expiry. */
  check(scope: DoLimitScope, ip: string): DoLimitResult {
    const cfg = LIMITS[scope];
    const now = Date.now();
    const key = `${scope}:${ip}`;
    let b = this.buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + cfg.windowMs };
      this.buckets.set(key, b);
    }
    if (b.count >= cfg.limit) {
      return {
        allowed: false,
        scope,
        message: cfg.message,
        retryAfterMs: Math.max(0, b.resetAt - now),
      };
    }
    b.count += 1;
    return { allowed: true };
  }
}
