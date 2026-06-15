/**
 * Server-side formation slot tables (id, position, category) — the source of
 * truth for which XI slots exist per formation and what role each one plays.
 *
 * The CLIENT keeps a parallel table in `client/app/squad-builder/SquadBuilder.tsx`
 * that adds visual coordinates (x, y, label) for the pitch render. The two tables
 * MUST agree on `id`, `pos`, `cat` for every slot — verdict math, AI squad-plan
 * validation and user submission all key off these ids.
 *
 * Discipline: if you add/rename a formation or slot, change BOTH files in the
 * same commit. There is no runtime check that verifies they match.
 */
import type { Category } from "../types.js";

export type SlotDef = {
  id: string;
  pos: string;
  cat: Category;
};

export const SLOT_TABLES: Record<string, SlotDef[]> = {
  "4-3-3": [
    { id: "gk",  pos: "GK",  cat: "GK" },
    { id: "lb",  pos: "LB",  cat: "DEF" },
    { id: "lcb", pos: "CB",  cat: "DEF" },
    { id: "rcb", pos: "CB",  cat: "DEF" },
    { id: "rb",  pos: "RB",  cat: "DEF" },
    { id: "cm1", pos: "CM",  cat: "MID" },
    { id: "cdm", pos: "CDM", cat: "MID" },
    { id: "cm2", pos: "CM",  cat: "MID" },
    { id: "lw",  pos: "LW",  cat: "ATT" },
    { id: "st",  pos: "ST",  cat: "ATT" },
    { id: "rw",  pos: "RW",  cat: "ATT" },
  ],
  "4-4-2": [
    { id: "gk",  pos: "GK", cat: "GK" },
    { id: "lb",  pos: "LB", cat: "DEF" },
    { id: "lcb", pos: "CB", cat: "DEF" },
    { id: "rcb", pos: "CB", cat: "DEF" },
    { id: "rb",  pos: "RB", cat: "DEF" },
    { id: "lm",  pos: "LM", cat: "MID" },
    { id: "cm1", pos: "CM", cat: "MID" },
    { id: "cm2", pos: "CM", cat: "MID" },
    { id: "rm",  pos: "RM", cat: "MID" },
    { id: "st1", pos: "ST", cat: "ATT" },
    { id: "st2", pos: "ST", cat: "ATT" },
  ],
  "3-5-2": [
    { id: "gk",  pos: "GK",  cat: "GK" },
    { id: "lcb", pos: "CB",  cat: "DEF" },
    { id: "ccb", pos: "CB",  cat: "DEF" },
    { id: "rcb", pos: "CB",  cat: "DEF" },
    { id: "lwb", pos: "LB",  cat: "MID" },
    { id: "lcm", pos: "CM",  cat: "MID" },
    { id: "cam", pos: "CAM", cat: "MID" },
    { id: "rcm", pos: "CM",  cat: "MID" },
    { id: "rwb", pos: "RB",  cat: "MID" },
    { id: "st1", pos: "ST",  cat: "ATT" },
    { id: "st2", pos: "ST",  cat: "ATT" },
  ],
  "5-3-2": [
    { id: "gk",  pos: "GK",  cat: "GK" },
    { id: "lwb", pos: "LB",  cat: "DEF" },
    { id: "lcb", pos: "CB",  cat: "DEF" },
    { id: "ccb", pos: "CB",  cat: "DEF" },
    { id: "rcb", pos: "CB",  cat: "DEF" },
    { id: "rwb", pos: "RB",  cat: "DEF" },
    { id: "cdm", pos: "CDM", cat: "MID" },
    { id: "cam", pos: "CAM", cat: "MID" },
    { id: "cm",  pos: "CM",  cat: "MID" },
    { id: "st1", pos: "ST",  cat: "ATT" },
    { id: "st2", pos: "ST",  cat: "ATT" },
  ],
  "3-4-3": [
    { id: "gk",  pos: "GK", cat: "GK" },
    { id: "lcb", pos: "CB", cat: "DEF" },
    { id: "ccb", pos: "CB", cat: "DEF" },
    { id: "rcb", pos: "CB", cat: "DEF" },
    { id: "lm",  pos: "LM", cat: "MID" },
    { id: "cm1", pos: "CM", cat: "MID" },
    { id: "cm2", pos: "CM", cat: "MID" },
    { id: "rm",  pos: "RM", cat: "MID" },
    { id: "lw",  pos: "LW", cat: "ATT" },
    { id: "st",  pos: "ST", cat: "ATT" },
    { id: "rw",  pos: "RW", cat: "ATT" },
  ],
  "4-2-3-1": [
    { id: "gk",   pos: "GK",  cat: "GK" },
    { id: "lb",   pos: "LB",  cat: "DEF" },
    { id: "lcb",  pos: "CB",  cat: "DEF" },
    { id: "rcb",  pos: "CB",  cat: "DEF" },
    { id: "rb",   pos: "RB",  cat: "DEF" },
    { id: "cdm1", pos: "CDM", cat: "MID" },
    { id: "cdm2", pos: "CDM", cat: "MID" },
    { id: "lam",  pos: "LM",  cat: "MID" },
    { id: "cam",  pos: "CAM", cat: "MID" },
    { id: "ram",  pos: "RM",  cat: "MID" },
    { id: "st",   pos: "ST",  cat: "ATT" },
  ],
};

export function getSlots(formation: string): SlotDef[] {
  const slots = SLOT_TABLES[formation];
  if (!slots) {
    throw new Error(
      `squadFormations: unknown formation "${formation}" — must match config.ts FORMATIONS`
    );
  }
  return slots;
}
