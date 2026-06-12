/**
 * AI bidder — valuation (caps) and bid-amount execution.
 *
 * KEPT PURE: no platform deps, no time, no I/O. Inputs in, numbers out.
 * That's the spec §15 "portable engine" rule — when we wire DeepSeek for
 * real LLM caps, only `computeHeuristicCap` becomes a fallback path; the
 * call sites don't change.
 */

import type { Player } from "../types.js";
import {
  HEURISTIC_CAP_DIVISOR,
  HEURISTIC_CAP_BUDGET_FRACTION,
  MIN_INCREMENT,
} from "../config.js";

/**
 * Heuristic cap formula (spec §13):
 *   raw  = floor(player.overall^2 / DIVISOR) × $1M     (euros, not millions)
 *   clamp = floor(remainingBudget × BUDGET_FRACTION)
 *   cap  = min(raw, clamp)
 *
 * Examples at DIVISOR=80, budget=$300M:
 *   OVR 78 → raw $76M  clamp $240M  → cap $76M
 *   OVR 85 → raw $90M  clamp $240M  → cap $90M
 *   OVR 91 → raw $103M clamp $240M  → cap $103M
 */
export function computeHeuristicCap(
  player: Player,
  remainingBudget: number
): number {
  const raw =
    Math.floor((player.overall * player.overall) / HEURISTIC_CAP_DIVISOR) *
    1_000_000;
  const clamp = Math.floor(remainingBudget * HEURISTIC_CAP_BUDGET_FRACTION);
  return Math.min(raw, clamp);
}

/**
 * Compute the amount the AI would bid right now, given current lot state and
 * its cap. Returns null if the AI would walk (cap can't reach the next bid).
 *
 * Bid policy: always the minimum amount that takes the lead — currentBid + $1M,
 * or $1M to open. If that exceeds cap, walk.
 */
export function computeAiBidAmount(opts: {
  currentBid: number;
  cap: number;
}): number | null {
  const { currentBid, cap } = opts;
  const desired = currentBid === 0 ? MIN_INCREMENT : currentBid + MIN_INCREMENT;
  if (desired > cap) return null; // walk
  return desired;
}
