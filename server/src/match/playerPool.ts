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
import { QUEUE_COUNTS } from "../config.js";

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
 * Build one match's auction queue:
 *   3 GK + 10 DEF + 10 MID + 10 ATT, jumbled across categories.
 *
 * Future hook: a formation-aware variant may bias positional needs (e.g. 5-3-2
 * draws more defenders). For now the composition is fixed per spec §6.
 */
export function buildQueue(): Player[] {
  const drawn = [
    ...pickN(pool.GK, QUEUE_COUNTS.GK),
    ...pickN(pool.DEF, QUEUE_COUNTS.DEF),
    ...pickN(pool.MID, QUEUE_COUNTS.MID),
    ...pickN(pool.ATT, QUEUE_COUNTS.ATT),
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
