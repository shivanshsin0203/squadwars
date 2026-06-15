/**
 * SquadWars wire-format types — what the client receives from the server.
 *
 * KEEP IN SYNC with server/src/types.ts. Discipline: this file contains only
 * the DTO subset (Player, BoughtPlayer, BidEntry, AiPlanDTO, LotStateDTO,
 * MatchStateDTO). Internal server types (LotState with `cap`, AiPlanState with
 * `dueAt`) are deliberately absent — the client must not depend on them.
 *
 * Update protocol: when you edit a wire shape on the server, edit it here too.
 * If the two drift, TS won't catch it at compile time but the runtime parse
 * will surface the mismatch as a hydration error.
 */

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
  positions: string[];
  primary_position: string;
  category: Category;
  overall: number;
  club: string;
  country: string;
  value_eur: number;
  stats: PlayerStats;
  photo_url: string;
  photo_path: string;
};

export type Side = "user" | "ai";

export type BoughtPlayer = {
  lotIndex: number;
  player: Player;
  price: number;
};

export type BidEntry = {
  t: number;
  by: Side;
  amount: number;
};

export type AiPlanDTO = {
  planId: string;
  delayMs: number;
};

export type LotStateDTO = {
  lotIndex: number;
  player: Player;
  currentBid: number;
  highBidder: Side | null;
  expiresAt: number;
  bidLog: BidEntry[];
  aiPlan: AiPlanDTO | null;
};

export type MatchStatus = "in_progress" | "complete" | "result";

// ─────────────────────────── Squad / result phase ───────────────────────────

/** Mirror of the placement model used by SquadBuilder for drag-drop state. */
export type Placement =
  | { kind: "pool" }
  | { kind: "xi"; slotId: string }
  | { kind: "bench"; index: number };

export type SquadXIEntry = { slotId: string; playerId: number };
export type SquadBenchEntry = { index: number; playerId: number };
export type Squad = {
  xi: SquadXIEntry[];
  bench: SquadBenchEntry[];
};

export type CategoryName = "Attack" | "Midfield" | "Defence" | "Chemistry" | "Budget eff.";

export type VerdictCategory = {
  name: CategoryName;
  user: number;
  ai: number;
  winner: "user" | "ai" | "draw";
};

export type Verdict = {
  winner: "user" | "ai" | "draw";
  score: { user: number; ai: number };
  categories: VerdictCategory[];
  report: string;
  roast: string;
  personaName: string;
  userOverall: number;
  aiOverall: number;
  userChem: number;
  aiChem: number;
};

export type ResultPayload = {
  userSquad: Squad;
  aiSquad: Squad;
  aiBought: BoughtPlayer[];     // revealed only when status === "result"
  userTotalSpent: number;
  aiTotalSpent: number;
  verdict: Verdict;
};

export type MatchStateDTO = {
  matchId: string;
  formation: string;
  /** Difficulty selected at match-create time. Constant for the match. */
  difficulty: string;
  status: MatchStatus;
  user: {
    budget: number;
    bought: BoughtPlayer[];
  };
  ai: {
    budget: number;
    boughtCount: number;
  };
  lotsTotal: number;
  lotsDone: number;
  lotState: LotStateDTO | null;
  /** Populated when status === "result"; null otherwise. */
  result: ResultPayload | null;
};
