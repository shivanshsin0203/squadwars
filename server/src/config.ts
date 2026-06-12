/**
 * SquadWars server tunables — single source of truth for all numeric constants.
 *
 * Every value here is meant to be edited. The auction logic reads from this file;
 * never hard-code these numbers anywhere else.
 *
 * Dev vs prod: swap the constants below when going to production.
 *   Dev:  STARTING_BUDGET = 300_000_000, LOT_DURATION_MS = 20_000
 *   Prod: STARTING_BUDGET = 1_000_000_000, LOT_DURATION_MS = 30_000
 */

// ───────── Match parameters ─────────

export const STARTING_BUDGET = 1_000_000_000;   // €1B
export const LOT_DURATION_MS = 20_000;          // 20s per lot
export const ANTI_SNIPE_MS = 7_000;             // bid in last 5s → extend by 7s
export const ANTI_SNIPE_TRIGGER_MS = 5_000;     // threshold to trigger anti-snipe extension
export const LOT_END_TOLERANCE_MS = 1_000;      // clock-skew slack for /lot-end

// ───────── AI bidder ─────────

export const AI_DELAY_MIN_MS = 1_200;           // earliest the AI may fire
export const AI_DELAY_MAX_MS = 4_700;          // latest the AI may fire
export const AI_DELAY_SAFETY_MS = 1_200;        // never schedule within 1.5s of expiresAt

// Heuristic cap (LLM fallback — and the only valuation source until we wire DeepSeek).
// cap = floor(player.overall^2 / HEURISTIC_CAP_DIVISOR), then clamped to
// HEURISTIC_CAP_BUDGET_FRACTION × remaining AI budget.
export const HEURISTIC_CAP_DIVISOR = 80;
export const HEURISTIC_CAP_BUDGET_FRACTION = 0.8;

// ───────── Bidding ─────────

export const MIN_INCREMENT = 1_000_000;         // flat $1M increment for MVP

// ───────── Queue composition (per match — depth of the auction pool) ─────────

export const QUEUE_COUNTS = { GK: 3, DEF: 10, MID: 10, ATT: 10 } as const;
export const QUEUE_TOTAL =
  QUEUE_COUNTS.GK + QUEUE_COUNTS.DEF + QUEUE_COUNTS.MID + QUEUE_COUNTS.ATT; // 33

// ───────── Formation targets (XI to fill — drives buckets + AI need ranking) ─────────
// 4-3-3 starting XI = 1 GK + 4 DEF + 3 MID + 3 ATT = 11 players.
// Buying more than these is allowed (depth) but adds no scoring value.

export const FORMATION_TARGETS = { GK: 1, DEF: 4, MID: 3, ATT: 3 } as const;
export const FORMATION_TOTAL =
  FORMATION_TARGETS.GK + FORMATION_TARGETS.DEF + FORMATION_TARGETS.MID + FORMATION_TARGETS.ATT; // 11

// ───────── Match identity ─────────

export const MATCH_ID_LENGTH = 10;              // nanoid length for URL slugs
