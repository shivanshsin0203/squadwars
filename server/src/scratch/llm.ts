/**
 * Step 5.5 verification — hits the real DeepSeek API once and prints the
 * parsed cap plan.
 *
 * Run:  npx tsx --env-file=.env src/scratch/llm.ts
 *       SW_FORMATION=4-4-2 SW_DIFFICULTY=hard npx tsx --env-file=.env src/scratch/llm.ts
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
 *
 * Why this script does NOT hand-build the LlmCapRequest:
 *   Earlier versions of this scratch hand-typed targets / xiStatus /
 *   unfilledXiSlots / remainingByCategory / spendPressure / persona — all
 *   of which the server derives from FORMATIONS + DIFFICULTIES + match
 *   state. The hand-typed copies drifted (e.g. remainingByCategory was
 *   stuck at the pre-formation-system numbers), and the persona block
 *   was a frozen stub. So we now drive the real path: create a match,
 *   call seedForwardPlan() (which builds the proper request via
 *   AuctionMatch.runCapPlanning and hits DeepSeek), then inspect the
 *   resulting forwardPlan + usage counters.
 */

import { nanoid } from "nanoid";
import { AuctionMatch } from "../match/AuctionMatch.js";
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FORMATION,
  isValidDifficulty,
  isValidFormation,
  MATCH_ID_LENGTH,
  type Difficulty,
} from "../config.js";
import { isLlmConfigured } from "../llm/deepseek.js";

async function main() {
  console.log("LLM configured:", isLlmConfigured());
  if (!isLlmConfigured()) {
    console.error("AI_KEY missing. Set it in server/.env and run with --env-file=.env");
    process.exit(2);
  }

  // Allow override via env so this script covers all 6×3 configurations
  // without further edits. Defaults match the production defaults.
  const formationArg = process.env.SW_FORMATION?.trim() || DEFAULT_FORMATION;
  const difficultyArg = process.env.SW_DIFFICULTY?.trim() || DEFAULT_DIFFICULTY;

  if (!isValidFormation(formationArg)) {
    console.error(`Bad SW_FORMATION="${formationArg}".`);
    process.exit(2);
  }
  if (!isValidDifficulty(difficultyArg)) {
    console.error(`Bad SW_DIFFICULTY="${difficultyArg}".`);
    process.exit(2);
  }
  const difficulty: Difficulty = difficultyArg;

  const match = new AuctionMatch({
    matchId: nanoid(MATCH_ID_LENGTH),
    formation: formationArg,
    difficulty,
  });

  console.log("\n── Match config ──");
  console.log(`  matchId      : ${match.matchId}`);
  console.log(`  formation    : ${match.formation}`);
  console.log(`  difficulty   : ${match.difficulty}`);
  console.log(`  queueLen     : ${match.queue.length}`);
  console.log(`  aiBudget     : €${match.aiBudget.toLocaleString("en-US")}`);

  console.log("\n── First 5 queue players (what the LLM will see in toPlan + lookahead) ──");
  for (let i = 0; i < Math.min(5, match.queue.length); i++) {
    const p = match.queue[i];
    console.log(
      `  ${String(i).padStart(2)}. ${p.category}/${p.primary_position.padEnd(3)} ` +
        `${p.name.padEnd(24)} OVR ${p.overall} value=€${p.value_eur.toLocaleString("en-US")}`
    );
  }

  console.log("\n── Calling DeepSeek via match.seedForwardPlan() ──");
  const t0 = Date.now();
  await match.seedForwardPlan();
  console.log(`── Round-trip ${Date.now() - t0}ms ──\n`);

  console.log("forwardPlan size:", match.forwardPlan.size);
  console.log("Plan entries:");
  for (const [playerId, cap] of match.forwardPlan) {
    const player = match.queue.find((p) => p.id === playerId);
    const name = player ? `${player.name} (${player.category} OVR ${player.overall})` : `id=${playerId}`;
    console.log(`  cap=€${cap.toLocaleString("en-US").padStart(13)}  ${name}`);
  }

  console.log("\nLLM usage (this run):");
  console.log({
    callCount: match.llmCallCount,
    callsFailed: match.llmCallsFailed,
    promptTokens: match.llmPromptTokens,
    cachedPromptTokens: match.llmCachedPromptTokens,
    completionTokens: match.llmCompletionTokens,
    totalCostUsd: Number(match.llmTotalCostUsd.toFixed(6)),
    latencyMs: match.llmTotalLatencyMs,
  });

  if (match.llmCallsFailed > 0) {
    console.error("\nFAIL: at least one LLM call failed (heuristic fallback covered).");
    process.exit(1);
  }
  if (match.forwardPlan.size === 0) {
    console.error("\nFAIL: forwardPlan is empty — DeepSeek returned no valid entries.");
    process.exit(1);
  }
  console.log("\nOK: cap plan seeded for first 2 lots of this match.");
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
