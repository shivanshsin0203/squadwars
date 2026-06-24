/**
 * MatchDO — one Durable Object instance per matchId.
 *
 * This IS the old in-memory Map entry, made persistent:
 *   - holds exactly one AuctionMatch (the live auction state)
 *   - hydrates it from ctx.storage on cold start (blockConcurrencyWhile)
 *   - persists after every mutation (AuctionMatch.persist → ctx.storage.put)
 *   - keeps itself alive for fire-and-forget LLM work via ctx.waitUntil
 *   - self-deletes 24h after creation via a storage alarm
 *
 * The DO is addressed by `env.MATCH.idFromName(matchId)`, so the same matchId
 * always routes to the same instance. Cloudflare runs one isolate per instance,
 * which is why the per-match rate limiter can safely live in memory here.
 *
 * Routing: the worker forwards `/api/match/:id/<action>` as `/<action>` and
 * `POST /api/match` as `/__create?matchId=...`. A small Hono app dispatches.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { AuctionMatch, type SerializedMatch } from "../match/AuctionMatch.js";
import {
  MATCH_ID_LENGTH,
  DEFAULT_FORMATION,
  DEFAULT_DIFFICULTY,
} from "../config.js";
import {
  CreateMatchSchema,
  BidSchema,
  AiFireSchema,
  LotEndSchema,
  ResultSchema,
} from "../schemas/match.js";
import { issueSession, sessionMatches } from "../middleware/session.js";
import { PerMatchRateLimiter, type DoLimitScope } from "../middleware/doRateLimit.js";
import { getClientIp } from "../middleware/clientIp.js";
import { isProd, type Env } from "../env.js";

const STORAGE_KEY = "match";
const TTL_MS = 24 * 60 * 60 * 1000; // delete the DO 24h after creation

export class MatchDO {
  private ctx: DurableObjectState;
  private env: Env;
  private match: AuctionMatch | null = null;
  private limiter = new PerMatchRateLimiter();
  private app: Hono<{ Bindings: Env }>;
  /** Per-DO mutation mutex — preserves the old withLock serialization semantics. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.app = this.buildApp();

    // Block all incoming requests until the match is hydrated from storage.
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<SerializedMatch>(STORAGE_KEY);
      if (stored) {
        this.match = new AuctionMatch({
          matchId: stored.matchId,
          formation: stored.formation,
          aiKey: env.AI_KEY,
          restore: stored,
        });
        this.wireHooks(this.match);
      }
    });
  }

  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request, this.env);
  }

  /** Fired 24h after creation — wipe the match so the DO ceases to exist. */
  async alarm(): Promise<void> {
    console.log(`[DO:alarm] id=${this.match?.matchId ?? "?"} 24h TTL reached — deleting all storage`);
    await this.ctx.storage.deleteAll();
    this.match = null;
  }

  // ─────────────────────────── internals ───────────────────────────

  private wireHooks(match: AuctionMatch): void {
    match.setHooks({
      onPersist: () => {
        // Not awaited: request-path writes are covered by the DO output gate;
        // background-path writes are kept alive by ctx.waitUntil (runBackground).
        this.ctx.storage
          .put(STORAGE_KEY, match.serialize())
          .catch((e) => console.log(`[DO:persist] error: ${(e as Error).message}`));
      },
      runBackground: (p) => this.ctx.waitUntil(p),
    });
  }

  private withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  /** 429 if the per-match limiter rejects, else null. */
  private rl(c: Context, scope: DoLimitScope): Response | null {
    const res = this.limiter.check(scope, getClientIp(c));
    if (res.allowed) return null;
    c.header("Retry-After", String(Math.ceil(res.retryAfterMs / 1000)));
    return c.json(
      { error: "rate_limit", scope: res.scope, message: res.message, retryAfterMs: res.retryAfterMs },
      429
    );
  }

  /** 404 if no match, 403 if the session cookie doesn't match, else null. */
  private guard(c: Context): Response | null {
    if (!this.match) return c.json({ error: "match_not_found" }, 404);
    if (!sessionMatches(c, this.match.sessionToken)) {
      return c.json(
        {
          error: "session_mismatch",
          message: "This match belongs to a different session. Start a new match.",
        },
        403
      );
    }
    return null;
  }

  private buildApp(): Hono<{ Bindings: Env }> {
    const app = new Hono<{ Bindings: Env }>();

    // ── POST /__create (forwarded from worker's POST /api/match) ──
    app.post("/__create", async (c) => {
      const matchId = c.req.query("matchId") ?? nanoid(MATCH_ID_LENGTH);
      const body = await c.req.json().catch(() => ({}));
      const parsed = CreateMatchSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "invalid request" }, 400);
      }
      const formation = parsed.data.formation ?? DEFAULT_FORMATION;
      const difficulty = parsed.data.difficulty ?? DEFAULT_DIFFICULTY;

      return this.withLock(async () => {
        // Idempotency: if this DO already holds a match (rare id reuse), reject cleanly.
        if (this.match) {
          return c.json({ error: "match already exists" }, 409);
        }
        this.match = new AuctionMatch({ matchId, formation, difficulty, aiKey: this.env.AI_KEY });
        this.wireHooks(this.match);
        // Persist before the (possibly slow) LLM seed so the match exists even if seed fails.
        await this.ctx.storage.put(STORAGE_KEY, this.match.serialize());
        await this.ctx.storage.setAlarm(Date.now() + TTL_MS);

        // Bind this browser to the match via the session cookie.
        issueSession(c, this.match.sessionToken, isProd(this.env));

        // Block on the LLM seed so lot 1 opens with a real cap (heuristic if it fails).
        await this.match.seedForwardPlan();

        return c.json({
          matchId,
          formation,
          difficulty,
          status: this.match.status,
          lotsTotal: this.match.queue.length,
          llmSeeded: this.match.forwardPlan.size > 0,
          // Returned so the client can auth via the x-sw-session header (the
          // *.workers.dev cookie is third-party and blocked by many browsers).
          // Safe: the token only authorizes THIS match and lives in the
          // creator's own browser storage — a shared URL still has no token.
          sessionToken: this.match.sessionToken,
        });
      });
    });

    // ── GET /state ──
    app.get("/state", (c) => {
      const g = this.guard(c);
      if (g) return g;
      return c.json(this.match!.toClientDTO());
    });

    // ── POST /start ──
    app.post("/start", (c) => {
      const limited = this.rl(c, "start");
      if (limited) return limited;
      const g = this.guard(c);
      if (g) return g;
      return this.withLock(() => {
        const m = this.match!;
        if (m.status === "complete") return c.json({ error: "match already complete" }, 400);
        m.startLot();
        return c.json(m.toClientDTO());
      });
    });

    // ── POST /bid ──
    app.post("/bid", async (c) => {
      const limited = this.rl(c, "bid");
      if (limited) return limited;
      const g = this.guard(c);
      if (g) return g;
      const parsed = BidSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "invalid bid" }, 400);
      }
      const { lotIndex, amount } = parsed.data;
      return this.withLock(() => {
        const m = this.match!;
        if (!m.lotState) return c.json({ error: "no active lot" }, 400);
        if (m.lotState.lotIndex !== lotIndex) {
          return c.json({ error: "stale lotIndex", sent: lotIndex, current: m.lotState.lotIndex }, 409);
        }
        const r = m.userBid(amount);
        if (!r.ok) return c.json({ error: r.reason }, 400);
        return c.json(m.toClientDTO());
      });
    });

    // ── POST /ai-fire ──
    app.post("/ai-fire", async (c) => {
      const limited = this.rl(c, "ai-fire");
      if (limited) return limited;
      const g = this.guard(c);
      if (g) return g;
      const parsed = AiFireSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "invalid ai-fire" }, 400);
      }
      const { lotIndex, planId } = parsed.data;
      return this.withLock(() => {
        const m = this.match!;
        if (!m.lotState) return c.json({ error: "no active lot" }, 400);
        // Lot advanced under a stale client timer — just return fresh state (not an error).
        if (m.lotState.lotIndex !== lotIndex) return c.json(m.toClientDTO());
        m.aiFire(planId);
        return c.json(m.toClientDTO());
      });
    });

    // ── POST /lot-end ──
    app.post("/lot-end", async (c) => {
      const limited = this.rl(c, "lot-end");
      if (limited) return limited;
      const g = this.guard(c);
      if (g) return g;
      const parsed = LotEndSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "invalid lot-end" }, 400);
      }
      const { lotIndex } = parsed.data;
      return this.withLock(() => {
        const m = this.match!;
        if (!m.lotState) return c.json({ error: "no active lot (already advanced?)" }, 400);
        if (m.lotState.lotIndex !== lotIndex) {
          return c.json({ error: "stale lotIndex", sent: lotIndex, current: m.lotState.lotIndex }, 409);
        }
        const r = m.endLot();
        if (!r.ok) return c.json({ error: r.reason }, 425); // 425 Too Early
        return c.json({
          ...m.toClientDTO(),
          lotResult: {
            winner: r.winner,
            price: r.price,
            reconShotFired: r.reconShotFired,
            matchComplete: r.matchComplete,
          },
        });
      });
    });

    // ── POST /result ──
    app.post("/result", async (c) => {
      const limited = this.rl(c, "result");
      if (limited) return limited;
      const g = this.guard(c);
      if (g) return g;
      const parsed = ResultSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "invalid result" }, 400);
      }
      const { xi, bench } = parsed.data;
      return this.withLock(async () => {
        const m = this.match!;
        const r = await m.submitUserResult(xi, bench);
        if (!r.ok) return c.json({ error: r.reason }, 400);
        return c.json(r.dto);
      });
    });

    // ── GET /debug (diagnostic; gated by DEBUG_KEY in prod, open in dev) ──
    app.get("/debug", (c) => {
      const configured = this.env.DEBUG_KEY?.trim();
      const dev = !isProd(this.env);
      if (!configured && !dev) return c.json({ error: "debug endpoint disabled" }, 404);
      if (configured) {
        const provided = c.req.header("x-debug-key") ?? c.req.query("debug_key") ?? "";
        if (provided !== configured) return c.json({ error: "debug endpoint forbidden" }, 403);
      }
      const m = this.match;
      if (!m) return c.json({ error: "match not found" }, 404);
      return c.json({
        matchId: m.matchId,
        formation: m.formation,
        status: m.status,
        lotIndex: m.lotIndex,
        lotsTotal: m.queue.length,
        user: { budget: m.userBudget, bought: m.userBought },
        ai: { budget: m.aiBudget, bought: m.aiBought }, // normally hidden
        forwardPlanSize: m.forwardPlan.size,
        llmLastSuccessAt: m.llmLastSuccessAt,
        llmUsage: {
          callCount: m.llmCallCount,
          callsFailed: m.llmCallsFailed,
          promptTokens: m.llmPromptTokens,
          cachedPromptTokens: m.llmCachedPromptTokens,
          completionTokens: m.llmCompletionTokens,
          totalTokens: m.llmTotalTokens,
          totalCostUsd: Number(m.llmTotalCostUsd.toFixed(6)),
          totalLatencyMs: m.llmTotalLatencyMs,
        },
      });
    });

    return app;
  }
}
