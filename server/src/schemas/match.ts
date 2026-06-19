/**
 * Zod schemas for /api/match request bodies.
 *
 * One source of truth per route. Wired into Hono via @hono/zod-validator
 * (server/src/routes/match.ts). On failure, zValidator returns 400 with the
 * Zod issue tree — no hand-rolled error messages required.
 *
 * Shape only. Business rules (MIN_INCREMENT, lot-index freshness, budget
 * sanity, etc.) live in AuctionMatch — these schemas just guarantee the
 * inputs are well-typed before the route hands them off.
 */

import { z } from "zod";
import {
  isValidFormation,
  isValidDifficulty,
  FORMATION_NAMES,
  DIFFICULTY_NAMES,
} from "../config.js";

const ZFormation = z
  .string()
  .transform((s) => s.trim())
  .refine(isValidFormation, {
    message: `formation must be one of: ${FORMATION_NAMES.join(", ")}`,
  });

const ZDifficulty = z
  .string()
  .transform((s) => s.trim())
  .refine(isValidDifficulty, {
    message: `difficulty must be one of: ${DIFFICULTY_NAMES.join(", ")}`,
  });

const ZLotIndex = z.number().int().nonnegative();
const ZAmount = z.number().int().positive();
const ZPlayerId = z.number().int();

export const CreateMatchSchema = z.object({
  formation: ZFormation.optional(),
  difficulty: ZDifficulty.optional(),
});

export const BidSchema = z.object({
  lotIndex: ZLotIndex,
  amount: ZAmount,
});

export const AiFireSchema = z.object({
  lotIndex: ZLotIndex,
  planId: z.string().min(1),
});

export const LotEndSchema = z.object({
  lotIndex: ZLotIndex,
});

export const ResultSchema = z.object({
  xi: z.array(
    z.object({
      slotId: z.string().min(1),
      playerId: ZPlayerId,
    })
  ),
  bench: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      playerId: ZPlayerId,
    })
  ),
});

export type CreateMatchInput = z.infer<typeof CreateMatchSchema>;
export type BidInput = z.infer<typeof BidSchema>;
export type AiFireInput = z.infer<typeof AiFireSchema>;
export type LotEndInput = z.infer<typeof LotEndSchema>;
export type ResultInput = z.infer<typeof ResultSchema>;
