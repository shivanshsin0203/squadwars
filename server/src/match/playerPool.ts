/**
 * Player pool — loaded once at module import, shared across every AuctionMatch.
 *
 * Discipline (per user instruction): the per-match instance only stores the 33-player
 * QUEUE, never the full 300-player pool. The pool lives here, in module scope.
 *
 * If/when we move to a Durable Object, this file becomes a bundled asset import
 * inside the worker — same shape, different load mechanism.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Category, Player } from "../types.js";
import { getQueueCounts } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/match/playerPool.ts  →  ../../players.json  →  server/players.json
const POOL_PATH = path.resolve(__dirname, "../../players.json");

const allPlayers: Player[] = JSON.parse(fs.readFileSync(POOL_PATH, "utf8"));

const pool: Record<Category, Player[]> = { GK: [], DEF: [], MID: [], ATT: [] };
for (const p of allPlayers) {
  if (pool[p.category]) pool[p.category].push(p);
}

console.log(
  `[POOL] loaded ${allPlayers.length} players from ${path.basename(POOL_PATH)} · ` +
    `GK:${pool.GK.length} DEF:${pool.DEF.length} ` +
    `MID:${pool.MID.length} ATT:${pool.ATT.length}`
);

// ─────────────────────────── helpers ───────────────────────────

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(arr: T[], n: number): T[] {
  if (arr.length < n) {
    throw new Error(
      `playerPool: requested ${n} but only ${arr.length} available in pool`
    );
  }
  return shuffle(arr).slice(0, n);
}

// ─────────────────────────── public API ───────────────────────────

/**
 * Build one match's auction queue, sized to the chosen formation.
 *
 * Bucket counts come from config.FORMATIONS[formation].queue. The 6 formations
 * yield queues of 33–35 lots: defence-heavy shapes (5-3-2) draw more DEFs,
 * mid-heavy shapes (3-5-2, 4-2-3-1) draw more MIDs, ATT floored at 10 across
 * the board to keep striker drama high regardless of shape.
 */
export function buildQueue(formation: string): Player[] {
  const counts = getQueueCounts(formation);
  const drawn = [
    ...pickN(pool.GK, counts.GK),
    ...pickN(pool.DEF, counts.DEF),
    ...pickN(pool.MID, counts.MID),
    ...pickN(pool.ATT, counts.ATT),
  ];
  return shuffle(drawn);
}

/** Diagnostic — used by scratch runners only. Returns counts, not players. */
export function poolStats() {
  return {
    total: allPlayers.length,
    GK: pool.GK.length,
    DEF: pool.DEF.length,
    MID: pool.MID.length,
    ATT: pool.ATT.length,
  };
}
