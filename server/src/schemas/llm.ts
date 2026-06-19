/**
 * Zod schemas for LLM JSON output.
 *
 * One schema per LLM call. Structural only — the parsed entry is then handed
 * to a validator that runs the SEMANTIC checks Zod can't express:
 *
 *   - cap-planning: 7 cap floors (SERVER-FLOORED, SEVERE-BOOST, MUST-BUY,
 *     ENDGAME-FLOOR, BENCH-ELITE-FLOOR, TERMINAL-DUMP, BARGAIN-FLOOR) in
 *     server/src/llm/deepseek.ts → validatePlan.
 *
 *   - squad pick: roster/slot cross-reference, duplicate detection, and the
 *     wrong-category repair pass in server/src/llm/squadBuilder.ts →
 *     validateSquadJson + repairWrongPlacements.
 *
 *   - verdict prose: caller's own length/voice fallback rules.
 *
 * Per-entry parsing: cap-planning + squad-pick deliberately parse the OUTER
 * shape strictly, then iterate the inner array and safeParse each entry.
 * Rationale: an LLM returning one malformed cap entry should NOT kill the
 * whole batch — the bad entry is dropped and the heuristic fallback fires
 * for that player only. This matches the pre-Zod behavior.
 */

import { z } from "zod";

// ─────────────────────────── cap planning (deepseek.ts) ───────────────────────────

/**
 * One row of the LLM's plan[] array. Required fields are the ones validatePlan
 * actually uses for cap math; optional fields (xi_status_quote, value_eur_seen,
 * reason) are soft-validated by validatePlan with warn-only logs.
 */
export const CapPlanEntrySchema = z.object({
  player_id: z.number().int(),
  cap: z.number().int().nonnegative(),
  xi_status_quote: z.string().optional(),
  value_eur_seen: z.number().optional(),
  reason: z.string().optional(),
});

export const CapPlanResponseSchema = z.object({
  plan: z.array(z.unknown()),
});

export type CapPlanEntry = z.infer<typeof CapPlanEntrySchema>;

// ─────────────────────────── squad pick (squadBuilder.ts → planAiSquad) ───────────────────────────

export const SquadXiEntrySchema = z.object({
  slotId: z.string().min(1),
  playerId: z.number().int(),
});

export const SquadBenchEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  playerId: z.number().int(),
});

export const SquadResponseSchema = z.object({
  xi: z.array(z.unknown()),
  bench: z.array(z.unknown()),
});

export type SquadXiEntry = z.infer<typeof SquadXiEntrySchema>;
export type SquadBenchEntry = z.infer<typeof SquadBenchEntrySchema>;

// ─────────────────────────── verdict prose (squadBuilder.ts → writeVerdictProse) ───────────────────────────

export const ProseResponseSchema = z.object({
  report: z.string().min(1),
  roast: z.string().min(1),
});

export type ProseResponse = z.infer<typeof ProseResponseSchema>;
