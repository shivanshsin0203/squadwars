/**
 * SquadWars types — single source of truth for both internal and wire-format shapes.
 *
 * Two layers:
 *   1. Domain types        — used inside AuctionMatch and across server modules.
 *   2. Wire-format DTOs    — what we send to the browser. These intentionally OMIT
 *                            server secrets (AI cap, AI plan amount, due timestamps,
 *                            the full queue, the bid amounts of unfired plans).
 *
 * Discipline: routes return DTOs only. Never spread an AuctionMatch directly into a
 * response — it leaks the cap.
 */

// ─────────────────────────── Player ───────────────────────────

export type Category = "GK" | "DEF" | "MID" | "ATT";

export type PlayerStats = {
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
};

export type Player = {
  id: number;
  name: string;
  positions: string[];           // e.g. ["ST", "CF"]
  primary_position: string;      // first in positions
  category: Category;
  overall: number;
  club: string;
  country: string;
  value_eur: number;
  stats: PlayerStats;
  photo_url: string;             // original sofifa CDN
  photo_path: string;            // local "/players/<id>.webp" served by client /public
};

// ─────────────────────────── Bidding primitives ───────────────────────────

export type Side = "user" | "ai";

export type BoughtPlayer = {
  lotIndex: number;
  player: Player;
  price: number;
};

export type BidEntry = {
  t: number;                     // unix ms
  by: Side;
  amount: number;
};

// ─────────────────────────── AI plan (server-only) ───────────────────────────

/**
 * Server-internal tracking of when the AI's setTimeout-driven /ai-fire is expected.
 * `dueAt` and `cap` are SECRETS — never leaked to the client. The client only sees
 * AiPlanDTO below ({ planId, delayMs }).
 */
export type AiPlanState = {
  planId: string;
  dueAt: number;                 // absolute timestamp ms
  status: "pending" | "fired" | "cancelled";
};

// ─────────────────────────── Lot (server-internal) ───────────────────────────

export type LotState = {
  lotIndex: number;
  player: Player;
  startedAt: number;
  expiresAt: number;
  cap: number;                   // SERVER SECRET — AI's max for this lot
  currentBid: number;
  highBidder: Side | null;
  bidLog: BidEntry[];
  pendingAiPlan: AiPlanState | null;
};

export type MatchStatus = "in_progress" | "complete";

// ─────────────────────────── Wire DTOs (client-facing) ───────────────────────────

/** What the client sees for the AI's pending fire — no due timestamp, no amount. */
export type AiPlanDTO = {
  planId: string;
  delayMs: number;               // relative to NOW; client passes to setTimeout
};

export type LotStateDTO = {
  lotIndex: number;
  player: Player;
  currentBid: number;
  highBidder: Side | null;
  expiresAt: number;             // absolute ms — client renders countdown from this
  bidLog: BidEntry[];            // post-hoc record of bids placed (safe to expose)
  aiPlan: AiPlanDTO | null;
};

/**
 * Top-level match snapshot for the client. Per spec §4 the AI's actual bought
 * players are HIDDEN during the auction — only the count is shared.
 */
export type MatchStateDTO = {
  matchId: string;
  formation: string;
  status: MatchStatus;
  user: {
    budget: number;
    bought: BoughtPlayer[];
  };
  ai: {
    budget: number;
    boughtCount: number;         // count only — names hidden until result screen
  };
  lotsTotal: number;
  lotsDone: number;              // = lotIndex (or queue.length when complete)
  lotState: LotStateDTO | null;
};
