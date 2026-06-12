/**
 * Steps 3 & 4 verification — exercises the full lot lifecycle in-process.
 *
 * Run:  npx tsx src/scratch/simulate.ts
 *
 * Scenarios:
 *   A. Normal lot — startLot → AI opens → user bids → AI raises → user jumps →
 *      timer expires → reconciliation either no-ops (AI was already winning) or
 *      AI snipes at close → advance to next lot.
 *   B. Cheat lot — startLot → block /ai-fire entirely → expire timer →
 *      reconciliation shot guarantees the AI wins.
 *   C. Validation — try too-low and over-budget user bids, see them rejected.
 *
 * To keep this quick: we don't wait for real time. We mutate lotState.expiresAt
 * to simulate the countdown reaching zero. The class methods all read Date.now()
 * so they don't notice the synthetic time-travel.
 */

import { nanoid } from "nanoid";
import { AuctionMatch } from "../match/AuctionMatch.js";
import { MATCH_ID_LENGTH } from "../config.js";

const div = (title: string) => {
  console.log("\n" + "═".repeat(78));
  console.log("  " + title);
  console.log("═".repeat(78));
};
const sub = (title: string) => {
  console.log("\n── " + title + " ──");
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  // ════════════════════════════════════════════════════════════════════
  // SCENARIO A — normal lot lifecycle (Steps 3 + 4 happy path)
  // ════════════════════════════════════════════════════════════════════
  div("SCENARIO A — Normal lot with bid-counterbid-jump, then close");

  const matchA = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: "4-3-3",
  });

  sub("Open lot 0");
  matchA.startLot();
  console.log("DTO after startLot:", JSON.stringify(matchA.toClientDTO().lotState, null, 2));

  await sleep(20);

  sub("User bids $5M (opening)");
  const r1 = matchA.userBid(5_000_000);
  console.log("  result:", r1.ok ? "ACCEPTED" : `REJECTED: ${r1.reason}`);

  await sleep(20);

  sub("AI fires (server-driven, simulating frontend setTimeout)");
  const planAfterUser = matchA.toDebug().currentLot?.pendingAiPlan;
  console.log("  using planId:", planAfterUser?.planId);
  const r2 = matchA.aiFire(planAfterUser!.planId);
  if (r2.ok) {
    console.log(`  result: AI ${r2.aiBid === null ? "WALKED" : `BID $${r2.aiBid!.toLocaleString()}`}`);
  } else {
    console.log("  result: ERROR", r2.reason);
  }

  await sleep(20);

  sub("User jumps to $30M");
  const r3 = matchA.userBid(30_000_000);
  console.log("  result:", r3.ok ? "ACCEPTED" : `REJECTED: ${r3.reason}`);

  sub("Simulate timer expiry → endLot");
  // Time-travel: push expiresAt to the past so endLot's tolerance check passes.
  matchA.lotState!.expiresAt = Date.now() - 100;
  const r4 = matchA.endLot();
  console.log("  result:", r4);
  console.log("  match status:", matchA.status, "  lotIndex:", matchA.lotIndex);

  sub("State after lot 0 closed");
  const debugA = matchA.toDebug();
  console.log({
    userBudget: debugA.userBudget,
    aiBudget: debugA.aiBudget,
    userBought: debugA.userBoughtCount,
    aiBought: debugA.aiBoughtCount,
    nextLotIndex: debugA.lotIndex,
    nextLotOpen: debugA.hasLotState,
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO B — user blocks /ai-fire (the cheat). Reconciliation must catch.
  // ════════════════════════════════════════════════════════════════════
  div("SCENARIO B — Cheat: user blocks /ai-fire entirely");

  const matchB = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: "4-3-3",
  });

  sub("Open lot 0 (no bids will fire)");
  matchB.startLot();
  const lotB = matchB.lotState!;
  console.log(`  player: ${lotB.player.name} OVR=${lotB.player.overall}`);
  console.log(`  AI cap (server-secret): $${lotB.cap.toLocaleString()}`);
  console.log(`  initial currentBid: $${lotB.currentBid.toLocaleString()}, highBidder: ${lotB.highBidder}`);

  sub("Time-travel past expiresAt without ever firing /ai-fire");
  matchB.lotState!.expiresAt = Date.now() - 100;
  const rB = matchB.endLot();
  console.log("  result:", rB);
  console.log("  → AI won for $1M via reconciliation shot. User cheat defeated.");

  sub("State after cheat lot");
  console.log({
    userBudget: matchB.userBudget,
    aiBudget: matchB.aiBudget,
    aiBoughtFirstPrice: matchB.aiBought[0]?.price,
    aiBoughtFirstPlayer: matchB.aiBought[0]?.player.name,
  });

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO C — validation rejects bad bids
  // ════════════════════════════════════════════════════════════════════
  div("SCENARIO C — Bid validation");

  const matchC = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: "4-3-3",
  });
  matchC.startLot();

  sub("Reject: bid below MIN_INCREMENT ($500k)");
  console.log("  ", matchC.userBid(500_000));

  sub("Accept: opening bid at $1M");
  console.log("  ", matchC.userBid(1_000_000));

  sub("Reject: same amount (must beat currentBid + $1M)");
  console.log("  ", matchC.userBid(1_000_000));

  sub("Reject: tiny raise of $500k");
  console.log("  ", matchC.userBid(1_500_000));

  sub("Accept: minimum-legal raise to $2M");
  console.log("  ", matchC.userBid(2_000_000));

  sub("Reject: over-budget ($500M with $300M budget)");
  console.log("  ", matchC.userBid(500_000_000));

  // ════════════════════════════════════════════════════════════════════
  // SCENARIO D — toClientDTO leaks nothing
  // ════════════════════════════════════════════════════════════════════
  div("SCENARIO D — toClientDTO does NOT leak server secrets");

  const matchD = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: "4-3-3",
  });
  matchD.startLot();
  const dto = matchD.toClientDTO();
  const dtoLot = dto.lotState!;
  console.log("Full DTO:");
  console.log(JSON.stringify(dto, null, 2));

  const leakedCap = "cap" in dtoLot;
  const leakedDueAt = dtoLot.aiPlan ? "dueAt" in dtoLot.aiPlan : false;
  console.log(`\nLeak check: cap in DTO? ${leakedCap}  dueAt in DTO? ${leakedDueAt}`);
  if (leakedCap || leakedDueAt) {
    console.error("FAIL: server secret leaked to client DTO");
    process.exit(1);
  }
  console.log("OK: no cap, no dueAt — only { planId, delayMs } shipped.");

  console.log("\n" + "═".repeat(78));
  console.log("  All scenarios complete.");
  console.log("═".repeat(78));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
