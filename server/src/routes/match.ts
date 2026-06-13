/**
 * /api/match routes — thin wrappers around AuctionMatch methods.
 *
 * Discipline (per DO-emulation rules):
 *   - Each handler: validate input → withLock → look up match → call ONE method → return DTO.
 *   - Handlers never touch match fields directly.
 *   - All mutations are inside withLock so concurrent requests for the same matchId serialize.
 *   - We return MatchStateDTO (toClientDTO) for any state-changing endpoint so the client
 *     always gets a fresh snapshot without a separate /state round-trip.
 *
 * Endpoints:
 *   POST   /api/match                 → create match (no lot opened yet)
 *   GET    /api/match/:id/state       → snapshot
 *   POST   /api/match/:id/start       → open lot 1 (called when auction page mounts)
 *   POST   /api/match/:id/bid         → user bid
 *   POST   /api/match/:id/ai-fire     → frontend's setTimeout-triggered AI bid
 *   POST   /api/match/:id/lot-end     → close current lot, resolve, advance
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import { AuctionMatch } from "../match/AuctionMatch.js";
import { getMatch, putMatch, withLock } from "../store.js";
import {
  MATCH_ID_LENGTH,
  DEFAULT_FORMATION,
  FORMATION_NAMES,
  isValidFormation,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_NAMES,
  isValidDifficulty,
} from "../config.js";

export const matchRoutes = new Hono();

// ─────────────────────────── request/response logging ───────────────────────────

matchRoutes.use("*", async (c, next) => {
  const t0 = Date.now();
  let bodyRepr = "<none>";
  if (c.req.method !== "GET") {
    try {
      const b = await c.req.json();
      bodyRepr = JSON.stringify(b);
    } catch {
      bodyRepr = "<no/invalid body>";
    }
  }
  console.log(`→ [HTTP] ${c.req.method} ${c.req.path} body=${bodyRepr}`);
  await next();
  const ms = Date.now() - t0;
  console.log(`← [HTTP] ${c.req.method} ${c.req.path} status=${c.res.status} (${ms}ms)`);
});

// ─────────────────────────── helpers ───────────────────────────

async function safeJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function isNonNegativeInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}
/** Bid amounts MUST be positive integers in raw euros — fractional euros are rejected. */
function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

// ─────────────────────────── POST /api/match ───────────────────────────

matchRoutes.post("/", async (c) => {
  const body = (await safeJson(c)) as
    | { formation?: unknown; difficulty?: unknown }
    | null;
  const rawF =
    body && typeof body.formation === "string" && body.formation.trim()
      ? body.formation.trim()
      : DEFAULT_FORMATION;

  if (!isValidFormation(rawF)) {
    return c.json(
      {
        error: `unknown formation "${rawF}"`,
        allowed: FORMATION_NAMES,
      },
      400
    );
  }
  const formation = rawF;

  const rawD =
    body && typeof body.difficulty === "string" && body.difficulty.trim()
      ? body.difficulty.trim()
      : DEFAULT_DIFFICULTY;
  if (!isValidDifficulty(rawD)) {
    return c.json(
      {
        error: `unknown difficulty "${rawD}"`,
        allowed: DIFFICULTY_NAMES,
      },
      400
    );
  }
  const difficulty = rawD;

  const matchId = nanoid(MATCH_ID_LENGTH);
  const match = new AuctionMatch({ matchId, formation, difficulty });
  putMatch(match);

  // Block on LLM seed so lot 1 opens with a real cap, not heuristic.
  // If LLM is misconfigured or fails, seedForwardPlan logs and returns — heuristic covers.
  await match.seedForwardPlan();

  return c.json({
    matchId,
    formation,
    difficulty,
    status: match.status,
    lotsTotal: match.queue.length,
    llmSeeded: match.forwardPlan.size > 0,
  });
});

// ─────────────────────────── GET /api/match/:id/state ───────────────────────────

matchRoutes.get("/:id/state", async (c) => {
  const id = c.req.param("id");
  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    return c.json(m.toClientDTO());
  });
});

// ─────────────────────────── POST /api/match/:id/start ───────────────────────────

matchRoutes.post("/:id/start", async (c) => {
  const id = c.req.param("id");
  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    if (m.status === "complete") {
      return c.json({ error: "match already complete" }, 400);
    }
    m.startLot();
    return c.json(m.toClientDTO());
  });
});

// ─────────────────────────── POST /api/match/:id/bid ───────────────────────────

matchRoutes.post("/:id/bid", async (c) => {
  const id = c.req.param("id");
  const body = (await safeJson(c)) as { lotIndex?: unknown; amount?: unknown } | null;

  if (!body || !isNonNegativeInt(body.lotIndex) || !isPositiveInt(body.amount)) {
    return c.json(
      { error: "body must be { lotIndex: int, amount: positive integer in raw euros }" },
      400
    );
  }
  const lotIndex = body.lotIndex;
  const amount = body.amount;

  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    if (!m.lotState) return c.json({ error: "no active lot" }, 400);
    if (m.lotState.lotIndex !== lotIndex) {
      return c.json(
        {
          error: "stale lotIndex",
          sent: lotIndex,
          current: m.lotState.lotIndex,
        },
        409
      );
    }
    const r = m.userBid(amount);
    if (!r.ok) return c.json({ error: r.reason }, 400);
    return c.json(m.toClientDTO());
  });
});

// ─────────────────────────── POST /api/match/:id/ai-fire ───────────────────────────

matchRoutes.post("/:id/ai-fire", async (c) => {
  const id = c.req.param("id");
  const body = (await safeJson(c)) as
    | { lotIndex?: unknown; planId?: unknown }
    | null;

  if (
    !body ||
    !isNonNegativeInt(body.lotIndex) ||
    typeof body.planId !== "string"
  ) {
    return c.json(
      { error: "body must be { lotIndex: int, planId: string }" },
      400
    );
  }
  const lotIndex = body.lotIndex;
  const planId = body.planId;

  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    if (!m.lotState) return c.json({ error: "no active lot" }, 400);
    if (m.lotState.lotIndex !== lotIndex) {
      // Lot advanced under us — client's setTimeout is stale; just return fresh state.
      return c.json(m.toClientDTO());
    }
    // Stale planId or already resolved → just return current state (not an error).
    m.aiFire(planId);
    return c.json(m.toClientDTO());
  });
});

// ─────────────────────────── GET /api/match/:id/debug ───────────────────────────
// TEST / DIAGNOSTIC ONLY. Exposes the AI's full bought list — which is normally
// hidden during the auction (spec §4). Gated by DEBUG_KEY env var: required as
// X-Debug-Key header (or ?debug_key=... query param). If DEBUG_KEY is unset,
// the endpoint is fully disabled in any non-dev environment.

matchRoutes.get("/:id/debug", async (c) => {
  const id = c.req.param("id");

  const configured = process.env.DEBUG_KEY?.trim();
  const isDev =
    process.env.NODE_ENV !== "production" &&
    process.env.NODE_ENV !== "prod";

  if (!configured && !isDev) {
    return c.json({ error: "debug endpoint disabled" }, 404);
  }
  if (configured) {
    const provided =
      c.req.header("x-debug-key") ?? c.req.query("debug_key") ?? "";
    if (provided !== configured) {
      return c.json({ error: "debug endpoint forbidden" }, 403);
    }
  }

  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    return c.json({
      matchId: m.matchId,
      formation: m.formation,
      status: m.status,
      lotIndex: m.lotIndex,
      lotsTotal: m.queue.length,
      user: { budget: m.userBudget, bought: m.userBought },
      ai: { budget: m.aiBudget, bought: m.aiBought }, // <-- normally hidden
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
});

// ─────────────────────────── POST /api/match/:id/lot-end ───────────────────────────

matchRoutes.post("/:id/lot-end", async (c) => {
  const id = c.req.param("id");
  const body = (await safeJson(c)) as { lotIndex?: unknown } | null;

  if (!body || !isNonNegativeInt(body.lotIndex)) {
    return c.json({ error: "body must be { lotIndex: int }" }, 400);
  }
  const lotIndex = body.lotIndex;

  return withLock(id, () => {
    const m = getMatch(id);
    if (!m) return c.json({ error: "match not found" }, 404);
    if (!m.lotState) {
      return c.json({ error: "no active lot (already advanced?)" }, 400);
    }
    if (m.lotState.lotIndex !== lotIndex) {
      return c.json(
        {
          error: "stale lotIndex",
          sent: lotIndex,
          current: m.lotState.lotIndex,
        },
        409
      );
    }
    const r = m.endLot();
    if (!r.ok) {
      return c.json({ error: r.reason }, 425); // 425 Too Early
    }
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
