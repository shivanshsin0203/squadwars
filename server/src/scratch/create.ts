/**
 * Step 2 verification script.
 *
 * Run:  npx tsx src/scratch/create.ts
 *
 * Expected output:
 *   - [POOL] line: pool loaded with 300 players (30/90/90/90)
 *   - [MATCH:create] x3 lines: creation summary, breakdown, first-5 sample
 *   - toDebug() dump
 *   - Per-category sample of the 33-player queue
 *   - Sanity check: every queue player has a photo_path
 */

import { nanoid } from "nanoid";
import { AuctionMatch } from "../match/AuctionMatch.js";
import { poolStats } from "../match/playerPool.js";
import {
  MATCH_ID_LENGTH,
  DEFAULT_FORMATION,
  getQueueCounts,
  getQueueTotal,
} from "../config.js";

const formation = DEFAULT_FORMATION;

console.log("─".repeat(72));
console.log("Pool stats:", poolStats());
console.log("Config:", {
  formation,
  queueCounts: getQueueCounts(formation),
  queueTotal: getQueueTotal(formation),
  MATCH_ID_LENGTH,
});
console.log("─".repeat(72));

const match = new AuctionMatch({
  matchId: nanoid(MATCH_ID_LENGTH),
  formation,
});

console.log("─".repeat(72));
console.log("toDebug():", match.toDebug());

console.log("─".repeat(72));
console.log("Queue by category:");
for (const cat of ["GK", "DEF", "MID", "ATT"] as const) {
  const players = match.queue.filter((p) => p.category === cat);
  const names = players.map((p) => `${p.name}(${p.overall})`).join(", ");
  console.log(`  ${cat} [${players.length}]: ${names}`);
}

console.log("─".repeat(72));
console.log("Full queue order (proves cross-category jumble):");
match.queue.forEach((p, i) => {
  console.log(
    `  ${String(i).padStart(2)}. ${p.category} ${p.name.padEnd(24)} ` +
      `OVR ${p.overall}  ${p.club} / ${p.country}  ${p.photo_path}`
  );
});

console.log("─".repeat(72));
// Sanity: every player has a photo_path and a non-zero overall
const missing = match.queue.filter((p) => !p.photo_path || !p.overall);
if (missing.length) {
  console.error(`FAIL: ${missing.length} queue entries missing photo_path/overall`);
  process.exit(1);
}
console.log(`OK: all ${match.queue.length} queue players have photo_path and overall.`);
console.log("─".repeat(72));
