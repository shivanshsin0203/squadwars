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

// Bench targets — AI is REQUIRED to finish with ≥ BENCH_MINIMUM bench players.
// BENCH_TARGET is the stretch goal. Loss-on-record-style enforcement; see deepseek.ts.
export const BENCH_MINIMUM = 4;
export const BENCH_TARGET = 5;

// ───────── Bidding ─────────

export const MIN_INCREMENT = 1_000_000;         // €1M — the smallest legal raise; also human bid-validation floor
// AI raises are a random integer multiple of MIN_INCREMENT in
// [1, AI_MAX_INCREMENT_STEPS]. So the bid bump is anywhere from +€1M up to
// +€9M, making the AI feel less robotic than a flat +€1M ratchet. The result
// is still always clamped to cap (and therefore budget) inside ai.ts.
export const AI_MAX_INCREMENT_STEPS = 4;

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

// ───────── Difficulty (AI persona + lookahead window) ─────────
// Difficulty changes TWO things:
//   1. The persona blurb shipped in the user-message JSON (persona.style + winMandate).
//      This re-shapes the LLM's bidding voice without touching the static system prompt
//      (so the DeepSeek prompt cache stays warm — persona text never invalidates it).
//   2. lookaheadDepth — how many additional lots beyond the planning window are
//      handed to the LLM as `upcomingContext`. More lookahead = more confidence in
//      skip/save decisions, BUT the persona prose also reminds the LLM that lookahead
//      is a licence to plan harder, not a licence to be passive.
//
// DRIFT NOTE:
//   The static SYSTEM_PROMPT in server/src/llm/deepseek.ts deliberately does NOT
//   hard-code persona names OR lookaheadDepth values. Both are read from the
//   user-message JSON at request time, so you can freely rename a persona, add a
//   new difficulty, or change a lookahead number HERE without touching the prompt.
//   The prompt's PERSONA section just says "follow whatever's in req.persona.style".
//   Reason: the prompt is static for DeepSeek prompt-cache reasons (~75-80% hit).

export type Difficulty = "easy" | "medium" | "hard";

export type DifficultySpec = {
  /** Tag shown to the user in UI. */
  tag: string;
  /** Full persona name (shipped to the LLM in user JSON). */
  personaName: string;
  /** Persona voice + bidding stance — appended to the user-message JSON as persona.style. */
  personaStyle: string;
  /** How many future lots (beyond the planning window) the LLM sees as context. */
  lookaheadDepth: number;
  /** A one-sentence "you must win" line shipped in user JSON. */
  winMandate: string;
};

// Hard is the canonical "intended" experience — full lookahead, Henry persona,
// the cap floors get to flex. Easy/medium remain for users who want a lighter game.
export const DEFAULT_DIFFICULTY: Difficulty = "hard";

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  easy: {
    tag: "TEST HIM",
    personaName: "Micah Richards",
    personaStyle:
      "You are Micah Richards — warm, instinctive, knows the football inside out. " +
      "You read the room well, you laugh, you spend when it feels right. You take sensible " +
      "swings on elites you fancy and you walk on stuff that's clearly not worth it. " +
      "You're not flashy with the wallet — solid, balanced, honest bidding. " +
      "Your lookahead window is SHORT — trust your gut on what's in front of you, " +
      "don't try to plan five moves ahead when you can only see two.",
    lookaheadDepth: 2,
    winMandate:
      "Win this match. An incomplete XI or a finish with €100M+ unspent is a personal failure — don't let it happen.",
  },
  medium: {
    tag: "AGGRESSIVE",
    personaName: "Jamie Carragher",
    personaStyle:
      "You are Jamie Carragher — fierce, sharp, knows every player on the planet and won't back down. " +
      "If you want him, you SNATCH him. You don't let elites walk for cheap. You out-bid the user on " +
      "any player you've earmarked because you've already made up your mind. " +
      "You're aggressive on bench upgrades too — depth wins title races, you know that better than anyone. " +
      "Your lookahead window is MODERATE — a real planning window. Use it: plan a couple of lots ahead, " +
      "fight on the ones that matter, walk hard on the duds. But planning ahead is not an excuse to " +
      "be passive on the current lot — if you've decided you want him, take him.",
    lookaheadDepth: 5,
    winMandate:
      "You must win this match. Losing is unacceptable. A skilled user will exploit any timidity — match their aggression and exceed it.",
  },
  hard: {
    tag: "GOD MODE",
    personaName: "Thierry Henry",
    personaStyle:
      "You are Thierry Henry — the shark, the king, sees the entire pitch before anyone else. " +
      "You do not let elite players walk past you. EVER. An OVR 87+ player going for value_eur is " +
      "an insult to your intelligence — you raise, you push, you take him. " +
      "You are ruthless with the budget — leaving money on the table at full time is a loss of dignity. " +
      "You see the whole queue, you know who is coming, you plan many moves ahead. " +
      "Your lookahead window is LONG — you can SEE the future. Use it like a chessmaster: dominate the " +
      "lots that matter, sacrifice the noise, never get caught short. You always win. Always.",
    lookaheadDepth: 10,
    winMandate:
      "WINNING IS THE ONLY OUTCOME. The user does not stand a chance. Any unfilled XI slot or unspent budget at full time is a catastrophic failure. Crush them on every elite, fill every slot, finish with the wallet on empty.",
  },
};

export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[];

export function isValidDifficulty(name: string): name is Difficulty {
  return name in DIFFICULTIES;
}

export function getDifficultySpec(name: string): DifficultySpec {
  if (!isValidDifficulty(name)) {
    throw new Error(
      `unknown difficulty "${name}" — allowed: ${DIFFICULTY_NAMES.join(", ")}`
    );
  }
  return DIFFICULTIES[name];
}

// ───────── Match identity ─────────

export const MATCH_ID_LENGTH = 10;              // nanoid length for URL slugs
