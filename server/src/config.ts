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

// ───────── Formations (queue + XI targets per shape) ─────────
// Each formation defines:
//   - queue: how many lots of each category appear in this match's auction pool
//   - targets: how many of each category the XI needs (always sums to 11)
//
// Queue sizing rule used: GK=3 fixed (pool is small), each outfield bucket =
// max(7, formationCount × 3), ATT floored to 10 to keep striker drama high,
// then total trimmed to ≤35 by removing from the largest bucket.
// Totals land in [33, 35] — every formation feels different in the queue.

export type Category = "GK" | "DEF" | "MID" | "ATT";
export type Buckets = { GK: number; DEF: number; MID: number; ATT: number };

export type FormationSpec = {
  /** Tactical label (e.g. "THE ORTHODOXY") used in UI. */
  label: string;
  /** Per-side XI composition. Always sums to 11. */
  targets: Buckets;
  /** Per-match queue composition. Sums to 33–35. */
  queue: Buckets;
};

export const DEFAULT_FORMATION = "4-3-3" as const;

export const FORMATIONS = {
  "4-3-3": {
    label: "THE ORTHODOXY",
    targets: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
    queue:   { GK: 3, DEF: 12, MID: 9, ATT: 10 }, // 34
  },
  "4-4-2": {
    label: "THE TWO BANKS",
    targets: { GK: 1, DEF: 4, MID: 4, ATT: 2 },
    queue:   { GK: 3, DEF: 11, MID: 11, ATT: 10 }, // 35
  },
  "3-5-2": {
    label: "THE WING-BACK",
    targets: { GK: 1, DEF: 3, MID: 5, ATT: 2 },
    queue:   { GK: 3, DEF: 9, MID: 13, ATT: 10 }, // 35
  },
  "5-3-2": {
    label: "THE SHELL",
    targets: { GK: 1, DEF: 5, MID: 3, ATT: 2 },
    queue:   { GK: 3, DEF: 13, MID: 9, ATT: 10 }, // 35
  },
  "3-4-3": {
    label: "THE FRONT FOOT",
    targets: { GK: 1, DEF: 3, MID: 4, ATT: 3 },
    queue:   { GK: 3, DEF: 9, MID: 12, ATT: 10 }, // 34
  },
  "4-2-3-1": {
    label: "THE MODERN",
    targets: { GK: 1, DEF: 4, MID: 5, ATT: 1 },
    queue:   { GK: 3, DEF: 11, MID: 11, ATT: 10 }, // 35
  },
} as const satisfies Record<string, FormationSpec>;

export type FormationName = keyof typeof FORMATIONS;
export const FORMATION_NAMES = Object.keys(FORMATIONS) as FormationName[];

export function isValidFormation(name: string): name is FormationName {
  return name in FORMATIONS;
}

export function getFormationSpec(name: string): FormationSpec {
  if (!isValidFormation(name)) {
    throw new Error(
      `unknown formation "${name}" — allowed: ${FORMATION_NAMES.join(", ")}`
    );
  }
  return FORMATIONS[name];
}

export function getQueueCounts(name: string): Buckets {
  return getFormationSpec(name).queue;
}

export function getFormationTargets(name: string): Buckets {
  return getFormationSpec(name).targets;
}

export function getQueueTotal(name: string): number {
  const q = getQueueCounts(name);
  return q.GK + q.DEF + q.MID + q.ATT;
}

// ───────── Match identity ─────────

export const MATCH_ID_LENGTH = 10;              // nanoid length for URL slugs
