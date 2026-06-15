/**
 * Deterministic verdict math — what makes a match "won 3-2" without asking the LLM.
 *
 * The 5 categories are computed identically for user and AI from raw squad data:
 *   1. Attack    — average effective OVR of ATT-category starters
 *   2. Midfield  — average effective OVR of MID-category starters
 *   3. Defence   — average effective OVR of DEF + GK starters (GK is defensive line)
 *   4. Chemistry — same formula as client SquadBuilder.computeChemistry (max 37)
 *   5. Budget eff. — OVR-per-€M, scaled so the better side reads ~88-95
 *
 * "Effective OVR" applies the same fit penalty the client shows: a player out of
 * their primary role costs OVR proportional to how wrong the placement is. This
 * is the user-spec formula — keep it in sync with `SquadBuilder.fitDelta()`.
 *
 *   primary  (slot.pos == player.primary_position):       +2.0
 *   alt      (slot.pos in player.positions, non-primary): +0.5
 *   same-cat (player.category == slot.cat, no pos match): -10.0
 *   wrong    (category mismatch):                         -45.0
 *
 * Category-tally wins are counted as 1 each. Draws give 0.5 each — but the
 * displayed score is integer (Math.round), so a draw in one category shows as
 * either 3-3 or shared depending on rounding. Empirically rare with 5 cats.
 *
 * Winner of the match: side with more category-wins. Tie ⇒ "draw".
 */
import type {
  BoughtPlayer,
  Squad,
  Verdict,
  VerdictCategory,
  CategoryName,
  Category,
  Player,
} from "../types.js";
import { getSlots, type SlotDef } from "./squadFormations.js";

// ─────────────────────────── fit / OVR math ───────────────────────────

type Fit = "primary" | "alt" | "same-cat" | "wrong";

function evaluateFit(player: Player, slot: SlotDef): Fit {
  if (slot.pos === player.primary_position) return "primary";
  if (player.positions.includes(slot.pos)) return "alt";
  if (slot.cat === player.category) return "same-cat";
  return "wrong";
}

function fitDelta(fit: Fit): number {
  switch (fit) {
    case "primary":  return   2.0;
    case "alt":      return   0.5;
    case "same-cat": return -10.0;
    case "wrong":    return -45.0;
  }
}

/** Pull starters (slot + player) from a squad. Drops slots whose playerId isn't in bought. */
type Starter = { slot: SlotDef; player: Player; price: number };

function resolveStarters(
  formation: string,
  squad: Squad,
  bought: BoughtPlayer[]
): Starter[] {
  const slots = getSlots(formation);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const playerById = new Map<number, BoughtPlayer>(
    bought.map((b) => [b.player.id, b])
  );
  const out: Starter[] = [];
  for (const entry of squad.xi) {
    const slot = slotById.get(entry.slotId);
    const bp = playerById.get(entry.playerId);
    if (!slot || !bp) continue;
    out.push({ slot, player: bp.player, price: bp.price });
  }
  return out;
}

function resolveBench(squad: Squad, bought: BoughtPlayer[]): BoughtPlayer[] {
  const playerById = new Map<number, BoughtPlayer>(
    bought.map((b) => [b.player.id, b])
  );
  const out: BoughtPlayer[] = [];
  for (const entry of squad.bench) {
    const bp = playerById.get(entry.playerId);
    if (bp) out.push(bp);
  }
  return out;
}

/** Effective per-starter contribution: OVR + fit delta. Empty slots return 0. */
function effectiveOvr(starter: Starter): number {
  return starter.player.overall + fitDelta(evaluateFit(starter.player, starter.slot));
}

/** Match the client's computeOverall: average over 11, cap at maxStarterOvr + 2, ≤99. */
function computeXIOverall(starters: Starter[]): number {
  let sum = 0;
  let maxRaw = 0;
  for (const s of starters) {
    sum += effectiveOvr(s);
    if (s.player.overall > maxRaw) maxRaw = s.player.overall;
  }
  const raw = Math.round(sum / 11);
  const capped = Math.min(raw, maxRaw + 2);
  return Math.max(0, Math.min(99, capped));
}

/** Avg effective OVR of starters whose slot.cat ∈ allowedCats. 0 if no such starter. */
function zoneAverage(
  starters: Starter[],
  allowedCats: Category[]
): number {
  const allow = new Set<Category>(allowedCats);
  const filtered = starters.filter((s) => allow.has(s.slot.cat));
  if (filtered.length === 0) return 0;
  const sum = filtered.reduce((a, s) => a + effectiveOvr(s), 0);
  return Math.max(0, Math.min(99, Math.round(sum / filtered.length)));
}

// ─────────────────────────── chemistry (mirrors client) ───────────────────────────

function computeChemistry(starters: Starter[], bench: BoughtPlayer[]): number {
  let xiTotal = 0;
  for (const starter of starters) {
    let clubMates = 0;
    let nationMates = 0;
    for (const other of starters) {
      if (other.player.id === starter.player.id) continue;
      if (other.player.club === starter.player.club) clubMates++;
      if (other.player.country === starter.player.country) nationMates++;
    }
    xiTotal += Math.min(3, clubMates * 2 + nationMates);
  }
  let benchBonus = 0;
  for (const starter of starters) {
    const links = bench.some(
      (b) =>
        b.player.club === starter.player.club ||
        b.player.country === starter.player.country
    );
    if (links) benchBonus++;
    if (benchBonus >= 4) break;
  }
  return Math.min(37, xiTotal + benchBonus);
}

// ─────────────────────────── budget efficiency ───────────────────────────

/**
 * OVR-per-€M, scaled so the better side reads ~88 and the worse side scales
 * down proportionally. We return values in [40, 95] so the bar always has
 * visible mass for both sides. If one side spent €0 (impossible past lot 1
 * but defensively handled), they get the floor.
 */
function computeBudgetEff(
  userStarters: Starter[],
  aiStarters: Starter[]
): { user: number; ai: number } {
  const userOvr = userStarters.reduce((a, s) => a + effectiveOvr(s), 0);
  const aiOvr = aiStarters.reduce((a, s) => a + effectiveOvr(s), 0);
  const userSpent = Math.max(1, userStarters.reduce((a, s) => a + s.price, 0));
  const aiSpent = Math.max(1, aiStarters.reduce((a, s) => a + s.price, 0));
  const userRaw = userOvr / (userSpent / 1_000_000);
  const aiRaw = aiOvr / (aiSpent / 1_000_000);
  const peak = Math.max(userRaw, aiRaw, 0.0001);
  const scale = (v: number) => {
    const norm = v / peak;             // 0..1
    return Math.round(40 + norm * 55); // 40..95
  };
  return { user: scale(userRaw), ai: scale(aiRaw) };
}

// ─────────────────────────── orchestration ───────────────────────────

function classifyWinner(user: number, ai: number): "user" | "ai" | "draw" {
  if (user > ai) return "user";
  if (ai > user) return "ai";
  return "draw";
}

function buildCategory(
  name: CategoryName,
  user: number,
  ai: number
): VerdictCategory {
  return { name, user, ai, winner: classifyWinner(user, ai) };
}

export type VerdictInput = {
  formation: string;
  userSquad: Squad;
  aiSquad: Squad;
  userBought: BoughtPlayer[];
  aiBought: BoughtPlayer[];
  personaName: string;
};

/**
 * Compute everything EXCEPT the LLM prose. `report` and `roast` are stubbed
 * with placeholders and overwritten by writeVerdictProse(). This lets the
 * prose step take the verdict facts as input — it can't disagree with them.
 */
export function computeVerdict(input: VerdictInput): Verdict {
  const userStarters = resolveStarters(input.formation, input.userSquad, input.userBought);
  const aiStarters = resolveStarters(input.formation, input.aiSquad, input.aiBought);
  const userBench = resolveBench(input.userSquad, input.userBought);
  const aiBench = resolveBench(input.aiSquad, input.aiBought);

  const userAtt = zoneAverage(userStarters, ["ATT"]);
  const aiAtt = zoneAverage(aiStarters, ["ATT"]);
  const userMid = zoneAverage(userStarters, ["MID"]);
  const aiMid = zoneAverage(aiStarters, ["MID"]);
  const userDef = zoneAverage(userStarters, ["DEF", "GK"]);
  const aiDef = zoneAverage(aiStarters, ["DEF", "GK"]);
  const userChem = computeChemistry(userStarters, userBench);
  const aiChem = computeChemistry(aiStarters, aiBench);
  const budget = computeBudgetEff(userStarters, aiStarters);

  const categories: VerdictCategory[] = [
    buildCategory("Attack", userAtt, aiAtt),
    buildCategory("Midfield", userMid, aiMid),
    buildCategory("Defence", userDef, aiDef),
    buildCategory("Chemistry", userChem, aiChem),
    buildCategory("Budget eff.", budget.user, budget.ai),
  ];

  let userWins = 0;
  let aiWins = 0;
  for (const c of categories) {
    if (c.winner === "user") userWins++;
    else if (c.winner === "ai") aiWins++;
  }
  const matchWinner = classifyWinner(userWins, aiWins);

  return {
    winner: matchWinner,
    score: { user: userWins, ai: aiWins },
    categories,
    report: "", // filled by writeVerdictProse
    roast: "",  // filled by writeVerdictProse
    personaName: input.personaName,
    userOverall: computeXIOverall(userStarters),
    aiOverall: computeXIOverall(aiStarters),
    userChem,
    aiChem,
  };
}
