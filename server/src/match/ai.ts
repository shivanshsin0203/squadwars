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
  AI_MAX_INCREMENT_STEPS,
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
 * Bid policy:
 *   - The smallest legal raise is currentBid + MIN_INCREMENT (or just
 *     MIN_INCREMENT to open). If even that exceeds the cap, walk.
 *   - Otherwise pick a random raise of N × MIN_INCREMENT where
 *     N ∈ [1, AI_MAX_INCREMENT_STEPS]. Random > deterministic +€1M because
 *     it makes the auction feel like a real bidder pushing rather than a
 *     ratchet machine, and it shortens lots when the AI feels strongly.
 *   - Hard-clamp the resulting bid to cap so we never overpay relative to
 *     the player's valuation. Cap is already budget-aware (computeHeuristicCap
 *     clamps to a fraction of remaining budget), so a bid ≤ cap is also ≤
 *     budget — the upstream checkValidBid pass will not reject this.
 */
export function computeAiBidAmount(opts: {
  currentBid: number;
  cap: number;
}): number | null {
  const { currentBid, cap } = opts;

  const minDesired =
    currentBid === 0 ? MIN_INCREMENT : currentBid + MIN_INCREMENT;
  if (minDesired > cap) return null; // walk — can't even afford the floor raise

  // Random raise in [1, AI_MAX_INCREMENT_STEPS] × MIN_INCREMENT.
  const steps = 1 + Math.floor(Math.random() * AI_MAX_INCREMENT_STEPS);
  const desired = currentBid + steps * MIN_INCREMENT;

  // Never exceed cap. Because minDesired ≤ cap and desired ≥ minDesired, the
  // clamped result is always a valid legal raise.
  return Math.min(desired, cap);
}
