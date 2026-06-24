/**
 * Cloudflare Worker bindings + environment.
 *
 * These are injected per-request by the runtime (NOT available at module scope —
 * that's why the LLM client and session helpers take values explicitly instead
 * of reading process.env).
 *
 *   MATCH       — Durable Object namespace; one MatchDO instance per matchId.
 *   KV          — Workers KV; used ONLY by the create-match rate limiter.
 *   RATE_LIMIT  — native Workers rate-limiting binding (global catch-all).
 *   AI_KEY      — DeepSeek API key (secret). Absent → heuristic caps only.
 *   CORS_ORIGIN — exact allowed frontend origin (credentialed CORS).
 *   NODE_ENV    — "production" flips the session cookie to SameSite=None; Secure.
 *   DEBUG_KEY   — optional; gates GET /:id/debug in production.
 */

/** Minimal shape of the native Workers rate-limiting binding (env.RATE_LIMIT). */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  MATCH: DurableObjectNamespace;
  KV: KVNamespace;
  RATE_LIMIT: RateLimitBinding;
  AI_KEY?: string;
  CORS_ORIGIN?: string;
  NODE_ENV?: string;
  DEBUG_KEY?: string;
}

/** True when the worker is running in production (controls cookie attributes). */
export function isProd(env: Env): boolean {
  return env.NODE_ENV === "production" || env.NODE_ENV === "prod";
}

/**
 * Allowed CORS origins. CORS_ORIGIN may be a comma-separated list so we can
 * accept both the apex and the www host (the site serves from www.squadwars.online
 * — the apex 308-redirects to it — and credentialed CORS requires the
 * Access-Control-Allow-Origin to EXACTLY equal the request's Origin).
 */
export function corsOrigins(env: Env): string[] {
  return (env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
