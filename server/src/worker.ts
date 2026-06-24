/**
 * Worker entry — the stateless front door.
 *
 * Responsibilities:
 *   - CORS (credentialed; exact origin from env.CORS_ORIGIN)
 *   - native global rate limit on /api/match/:id/* (no KV writes)
 *   - POST /api/match: KV-backed create limiter → mint matchId → forward to its DO
 *   - /api/match/:id/<action>: forward straight to that match's DO
 *   - /health, /auctionroom, /
 *
 * All live state lives in the MatchDO (one per matchId). The worker never holds
 * match state — every per-match request is routed to env.MATCH.idFromName(id).
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { health } from "./routes/health.js";
import { auctionroom } from "./routes/auctionroom.js";
import { MATCH_ID_LENGTH } from "./config.js";
import { corsOrigins, type Env } from "./env.js";
import { getClientIp } from "./middleware/clientIp.js";
import { enforceCreateRateLimit } from "./middleware/kvRateLimit.js";

const app = new Hono<{ Bindings: Env }>();

// ── CORS: credentials require an exact origin echo (no wildcard). Echo the
//    request's Origin when it's in the allow-list (covers apex + www). ──
app.use("*", cors({
  origin: (origin, c) => {
    const allowed = corsOrigins(c.env as Env);
    if (origin && allowed.includes(origin)) return origin;
    return allowed[0]; // not allowed → return primary (≠ Origin) so the browser blocks it
  },
  allowHeaders: ["content-type", "x-sw-session"],
  credentials: true,
}));

// ── Native global rate limit (catch-all DoS net) on the per-match routes. ──
// Fails OPEN — a limiter must never take down the feature.
app.use("/api/match/*", async (c, next) => {
  try {
    const { success } = await c.env.RATE_LIMIT.limit({ key: getClientIp(c) });
    if (!success) {
      c.header("Retry-After", "60");
      return c.json(
        { error: "rate_limit", scope: "global", message: "Too many requests. Pause for a moment.", retryAfterMs: 60_000 },
        429
      );
    }
  } catch (err) {
    console.log(`[RL:global] binding error (failing open): ${(err as Error).message}`);
  }
  await next();
});

// ── Static / stateless routes ──
app.route("/health", health);
app.route("/auctionroom", auctionroom);
app.get("/", (c) => c.json({ name: "squadwars-server", ok: true }));

// ── POST /api/match → create. KV limit, mint id, hand off to the DO. ──
app.post("/api/match", async (c) => {
  const blocked = await enforceCreateRateLimit(c, c.env);
  if (blocked) return blocked;

  const matchId = nanoid(MATCH_ID_LENGTH);
  const stub = c.env.MATCH.get(c.env.MATCH.idFromName(matchId));
  const url = new URL(c.req.url);
  url.pathname = "/__create";
  url.searchParams.set("matchId", matchId);
  // new Request(url, raw) preserves method + headers + JSON body (formation/difficulty).
  return stub.fetch(new Request(url, c.req.raw));
});

// ── /api/match/:id/<action> → forward to that match's DO. ──
app.all("/api/match/:id/:action", (c) => forwardToMatchDO(c, c.req.param("action") ?? ""));

function forwardToMatchDO(c: Context<{ Bindings: Env }>, action: string): Promise<Response> {
  const id = c.req.param("id") ?? "";
  const stub = c.env.MATCH.get(c.env.MATCH.idFromName(id));
  const url = new URL(c.req.url);
  url.pathname = `/${action}`;
  return stub.fetch(new Request(url, c.req.raw));
}

export default { fetch: app.fetch };
export { MatchDO } from "./do/MatchDO.js";
