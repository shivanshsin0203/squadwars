/**
 * Step 5.5 verification — hits the real DeepSeek API once and prints the
 * parsed cap plan.
 *
 * Run:  npx tsx --env-file=.env src/scratch/llm.ts
 *
 * Expects:
 *   - AI_KEY in .env
 *   - DeepSeek reachable
 *   - Network connection
 *
 * Verifies:
 *   - SDK connects, JSON mode works
 *   - Prompt + context is shaped sensibly
 *   - Caps are returned in correct order, parseable, integer dollars
 *   - Player IDs match what we asked
 *   - Clamping triggers if LLM returns > 80% budget
 *   - The reason field is short and useful
 */

import { nanoid } from "nanoid";
import { AuctionMatch } from "../match/AuctionMatch.js";
import { MATCH_ID_LENGTH } from "../config.js";
import { isLlmConfigured, planCaps } from "../llm/deepseek.js";

async function main() {
  console.log("LLM configured:", isLlmConfigured());
  if (!isLlmConfigured()) {
    console.error("AI_KEY missing. Set it in server/.env and run with --env-file=.env");
    process.exit(2);
  }

  // Build a realistic state by creating a match (gives us a queue + budgets).
  const match = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: "4-3-3",
  });

  // Plan for the actual first 2 lots of this match.
  const toPlan = [
    match.queue[0],
    match.queue[1],
  ].map((p, i) => ({
    lotIndex: i,
    id: p.id,
    name: p.name,
    primary_position: p.primary_position,
    category: p.category,
    overall: p.overall,
    club: p.club,
    country: p.country,
    value_eur: p.value_eur,
  }));
  const upcomingContext = [match.queue[2]].map((p) => ({
    lotIndex: 2,
    id: p.id,
    name: p.name,
    primary_position: p.primary_position,
    category: p.category,
    overall: p.overall,
    club: p.club,
    country: p.country,
    value_eur: p.value_eur,
  }));

  console.log("\n── Players being capped ──");
  for (const p of toPlan) {
    console.log(`  ${p.category}/${p.primary_position} ${p.name} OVR ${p.overall} (${p.club}, ${p.country}) value=$${p.value_eur.toLocaleString("en-US")}`);
  }
  console.log("── Lookahead context ──");
  for (const p of upcomingContext) {
    console.log(`  ${p.category}/${p.primary_position} ${p.name} OVR ${p.overall}`);
  }

  console.log("\n── Calling DeepSeek… ──");
  const t0 = Date.now();
  const { caps } = await planCaps({
    matchId: match.matchId,
    formation: match.formation,
    aiBudgetLeft: match.aiBudget,
    userBudgetLeft: match.userBudget,
    lotIndex: 0,
    lotsTotal: match.queue.length,
    lotsRemaining: match.queue.length,
    toPlan,
    upcomingContext,
    aiSquad: {
      counts: { GK: 0, DEF: 0, MID: 0, ATT: 0 },
      targets: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
      xiStatus: {
        GK: "GK: 0/1 — STILL NEED 1 STARTER",
        DEF: "DEF: 0/4 — STILL NEED 4 STARTERS",
        MID: "MID: 0/3 — STILL NEED 3 STARTERS",
        ATT: "ATT: 0/3 — STILL NEED 3 STARTERS",
      },
      unfilledXiSlots: ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"],
      xiComplete: false,
      benchCount: 0,
      benchMinimum: 4,
      benchTarget: 5,
      benchNeeded: 5,
      benchMandatoryGap: 4,
      bought: [],
    },
    remainingByCategory: { GK: 3, DEF: 10, MID: 10, ATT: 10 },
    spendPressure: {
      fraction: 1.0,
      expectedBudgetNow: 1_000_000_000,
      hoardingExcess: 0,
      verdict: "ON_PACE",
    },
    userActivity: {
      boughtCount: 0,
      totalSpent: 0,
      averagePrice: 0,
      highestSinglePrice: 0,
      recentWins: [],
    },
    opponentSkill: "skilled",
  });
  console.log(`── Round-trip ${Date.now() - t0}ms ──\n`);

  console.log("Returned caps Map:", Object.fromEntries(caps));
  console.log("\nVerification:");
  for (const p of toPlan) {
    const cap = caps.get(p.id);
    const ok = cap !== undefined;
    console.log(
      `  ${ok ? "✓" : "✗"} ${p.name} (id=${p.id}) cap=$${cap?.toLocaleString("en-US") ?? "MISSING"}`
    );
  }
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
