"use client";

/**
 * SquadBuilder · post-auction chalkboard component.
 *
 * Used in two places:
 *   1. The canonical flow — `AuctionRoom` renders this when `match.status === "complete"`,
 *      passing the server-fetched `MatchStateDTO.user.bought`, `formation`, `difficulty`.
 *   2. A dev sandbox at `/squad-builder` (page.tsx) that feeds it `DUMMY_BUYS` for
 *      design iteration without playing a full match.
 *
 * IMPORTANT: this component is presentation + client-local arrangement only.
 *   - Player data (overall, positions, price, club, country, photo) comes ENTIRELY
 *     from `bought` props, which trace back to a server fetch. The component never
 *     mutates them.
 *   - Placement (which slot a player occupies) lives ONLY in React `useState`. There
 *     is no localStorage / sessionStorage persistence — refresh re-fetches the bought
 *     list from the server and resets placement, so a tampered client can't poison
 *     the squad. This is intentional per spec.
 *
 * Layout (full-viewport):
 *   TOP   — 2-col grid. LEFT = chalk pitch (XI slots) + bench strip (max height).
 *                         RIGHT = buy list (scrollable).
 *           OVR + CHEM sit as compact chips inline with the pitch eyebrow, NOT as
 *           their own cards.
 *   BOTTOM — full-width horizontal dossier strip: photo · identity · origin · price · 6 stats.
 *
 * Drag-and-drop: native HTML5 + a small custom drag image (transparent photo+name pill,
 * not the entire DOM node). Source dims to 28% while in flight via `is-dragging-source`.
 *
 * Formulas (per user spec):
 *   Overall  — average of 11 starters; per-starter fit bonus:
 *     primary  (slot.pos == player.primary_position):       +2.0
 *     alt      (slot.pos in player.positions, not primary): +0.5
 *     same-cat (player.category == slot.cat, no pos match): -10.0
 *     wrong    (category mismatch):                         -45.0
 *   Empty starters contribute 0 to the sum (still divided by 11). Cap 99.
 *   Hard cap: team_OVR ≤ max(starter_OVR) + 2 (codifies the +2 primary headroom so
 *   a 70-80 squad can never score 90).
 *
 *   Chemistry (max 37) — per-starter links inside XI + small bench bonus:
 *     starter score = clubMates * 2 + nationMates, capped at 3 per starter (max 33)
 *     bench bonus    = +1 per starter sharing club/country with any bench player (cap 4)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BoughtPlayer, Category, Player, SquadBenchEntry, SquadXIEntry } from "@/lib/types";

// ─────────────────────────── slot tables (per formation) ───────────────────────────

export type XISlotDef = {
  id: string;
  pos: string;
  cat: Category;
  label: string;
  x: number;
  y: number;
};

export type FormationDef = {
  name: string;
  label: string;
  slots: XISlotDef[];
};

export const FORMATIONS: Record<string, FormationDef> = {
  "4-3-3": {
    name: "4-3-3",
    label: "THE ORTHODOXY",
    slots: [
      { id: "gk",  pos: "GK",  cat: "GK",  label: "GK",  x: 50, y: 134 },
      { id: "lb",  pos: "LB",  cat: "DEF", label: "LB",  x: 13, y: 108 },
      { id: "lcb", pos: "CB",  cat: "DEF", label: "CB",  x: 36, y: 112 },
      { id: "rcb", pos: "CB",  cat: "DEF", label: "CB",  x: 64, y: 112 },
      { id: "rb",  pos: "RB",  cat: "DEF", label: "RB",  x: 87, y: 108 },
      { id: "cm1", pos: "CM",  cat: "MID", label: "CM",  x: 28, y: 75 },
      { id: "cdm", pos: "CDM", cat: "MID", label: "CDM", x: 50, y: 70 },
      { id: "cm2", pos: "CM",  cat: "MID", label: "CM",  x: 72, y: 75 },
      { id: "lw",  pos: "LW",  cat: "ATT", label: "LW",  x: 18, y: 26 },
      { id: "st",  pos: "ST",  cat: "ATT", label: "ST",  x: 50, y: 18 },
      { id: "rw",  pos: "RW",  cat: "ATT", label: "RW",  x: 82, y: 26 },
    ],
  },
  "4-4-2": {
    name: "4-4-2",
    label: "THE TWO BANKS",
    slots: [
      { id: "gk",  pos: "GK", cat: "GK",  label: "GK", x: 50, y: 134 },
      { id: "lb",  pos: "LB", cat: "DEF", label: "LB", x: 13, y: 108 },
      { id: "lcb", pos: "CB", cat: "DEF", label: "CB", x: 36, y: 112 },
      { id: "rcb", pos: "CB", cat: "DEF", label: "CB", x: 64, y: 112 },
      { id: "rb",  pos: "RB", cat: "DEF", label: "RB", x: 87, y: 108 },
      { id: "lm",  pos: "LM", cat: "MID", label: "LM", x: 13, y: 68 },
      { id: "cm1", pos: "CM", cat: "MID", label: "CM", x: 36, y: 72 },
      { id: "cm2", pos: "CM", cat: "MID", label: "CM", x: 64, y: 72 },
      { id: "rm",  pos: "RM", cat: "MID", label: "RM", x: 87, y: 68 },
      { id: "st1", pos: "ST", cat: "ATT", label: "ST", x: 36, y: 24 },
      { id: "st2", pos: "ST", cat: "ATT", label: "ST", x: 64, y: 24 },
    ],
  },
  "3-5-2": {
    name: "3-5-2",
    label: "THE WING-BACK",
    slots: [
      { id: "gk",   pos: "GK",  cat: "GK",  label: "GK",  x: 50, y: 134 },
      { id: "lcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 28, y: 112 },
      { id: "ccb",  pos: "CB",  cat: "DEF", label: "CB",  x: 50, y: 115 },
      { id: "rcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 72, y: 112 },
      { id: "lwb",  pos: "LB",  cat: "MID", label: "LB",  x: 8,  y: 78 },
      { id: "lcm",  pos: "CM",  cat: "MID", label: "CM",  x: 30, y: 70 },
      { id: "cam",  pos: "CAM", cat: "MID", label: "CAM", x: 50, y: 62 },
      { id: "rcm",  pos: "CM",  cat: "MID", label: "CM",  x: 70, y: 70 },
      { id: "rwb",  pos: "RB",  cat: "MID", label: "RB",  x: 92, y: 78 },
      { id: "st1",  pos: "ST",  cat: "ATT", label: "ST",  x: 36, y: 24 },
      { id: "st2",  pos: "ST",  cat: "ATT", label: "ST",  x: 64, y: 24 },
    ],
  },
  "5-3-2": {
    name: "5-3-2",
    label: "THE SHELL",
    slots: [
      { id: "gk",   pos: "GK",  cat: "GK",  label: "GK",  x: 50, y: 134 },
      { id: "lwb",  pos: "LB",  cat: "DEF", label: "LB",  x: 8,  y: 104 },
      { id: "lcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 28, y: 112 },
      { id: "ccb",  pos: "CB",  cat: "DEF", label: "CB",  x: 50, y: 115 },
      { id: "rcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 72, y: 112 },
      { id: "rwb",  pos: "RB",  cat: "DEF", label: "RB",  x: 92, y: 104 },
      { id: "cdm",  pos: "CDM", cat: "MID", label: "CDM", x: 28, y: 72 },
      { id: "cam",  pos: "CAM", cat: "MID", label: "CAM", x: 50, y: 66 },
      { id: "cm",   pos: "CM",  cat: "MID", label: "CM",  x: 72, y: 72 },
      { id: "st1",  pos: "ST",  cat: "ATT", label: "ST",  x: 36, y: 24 },
      { id: "st2",  pos: "ST",  cat: "ATT", label: "ST",  x: 64, y: 24 },
    ],
  },
  "3-4-3": {
    name: "3-4-3",
    label: "THE FRONT FOOT",
    slots: [
      { id: "gk",  pos: "GK", cat: "GK",  label: "GK", x: 50, y: 134 },
      { id: "lcb", pos: "CB", cat: "DEF", label: "CB", x: 28, y: 112 },
      { id: "ccb", pos: "CB", cat: "DEF", label: "CB", x: 50, y: 115 },
      { id: "rcb", pos: "CB", cat: "DEF", label: "CB", x: 72, y: 112 },
      { id: "lm",  pos: "LM", cat: "MID", label: "LM", x: 13, y: 68 },
      { id: "cm1", pos: "CM", cat: "MID", label: "CM", x: 36, y: 72 },
      { id: "cm2", pos: "CM", cat: "MID", label: "CM", x: 64, y: 72 },
      { id: "rm",  pos: "RM", cat: "MID", label: "RM", x: 87, y: 68 },
      { id: "lw",  pos: "LW", cat: "ATT", label: "LW", x: 18, y: 26 },
      { id: "st",  pos: "ST", cat: "ATT", label: "ST", x: 50, y: 18 },
      { id: "rw",  pos: "RW", cat: "ATT", label: "RW", x: 82, y: 26 },
    ],
  },
  "4-2-3-1": {
    name: "4-2-3-1",
    label: "THE MODERN",
    slots: [
      { id: "gk",   pos: "GK",  cat: "GK",  label: "GK",  x: 50, y: 134 },
      { id: "lb",   pos: "LB",  cat: "DEF", label: "LB",  x: 13, y: 108 },
      { id: "lcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 36, y: 112 },
      { id: "rcb",  pos: "CB",  cat: "DEF", label: "CB",  x: 64, y: 112 },
      { id: "rb",   pos: "RB",  cat: "DEF", label: "RB",  x: 87, y: 108 },
      { id: "cdm1", pos: "CDM", cat: "MID", label: "CDM", x: 35, y: 86 },
      { id: "cdm2", pos: "CDM", cat: "MID", label: "CDM", x: 65, y: 86 },
      { id: "lam",  pos: "LM",  cat: "MID", label: "LM",  x: 18, y: 48 },
      { id: "cam",  pos: "CAM", cat: "MID", label: "CAM", x: 50, y: 44 },
      { id: "ram",  pos: "RM",  cat: "MID", label: "RM",  x: 82, y: 48 },
      { id: "st",   pos: "ST",  cat: "ATT", label: "ST",  x: 50, y: 22 },
    ],
  },
};

const DEFAULT_FORMATION = "4-3-3";
const BENCH_SIZE = 5;

// ─────────────────────────── placement model ───────────────────────────

type Placement =
  | { kind: "pool" }
  | { kind: "xi"; slotId: string }
  | { kind: "bench"; index: number };

type Fit = "primary" | "alt" | "same-cat" | "wrong";

function placementsEqual(a: Placement, b: Placement): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "xi" && b.kind === "xi") return a.slotId === b.slotId;
  if (a.kind === "bench" && b.kind === "bench") return a.index === b.index;
  return true;
}

// ─────────────────────────── helpers ───────────────────────────

function categoryAccent(cat: Category): string {
  switch (cat) {
    case "ATT": return "var(--whistle)";
    case "MID": return "var(--floodlight)";
    case "DEF": return "var(--keeper-blue)";
    case "GK":  return "var(--chalk)";
  }
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `€${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

function evaluateFit(player: Player, slot: XISlotDef): Fit {
  if (slot.pos === player.primary_position) return "primary";
  if (player.positions.includes(slot.pos)) return "alt";
  if (slot.cat === player.category) return "same-cat";
  return "wrong";
}
function fitDelta(fit: Fit): number {
  switch (fit) {
    case "primary":  return   2.0;
    case "alt":      return   0.5;
    case "same-cat": return -10.0;
    case "wrong":    return -45.0;
  }
}
function fitColor(fit: Fit): string {
  switch (fit) {
    case "primary":  return "var(--chalk)";
    case "alt":      return "var(--floodlight)";
    case "same-cat": return "var(--muted)";
    case "wrong":    return "var(--whistle)";
  }
}
function fitLabel(fit: Fit): string {
  switch (fit) {
    case "primary":  return "PERFECT";
    case "alt":      return "ALT POS";
    case "same-cat": return "OUT OF POS";
    case "wrong":    return "WRONG ROLE";
  }
}

function computeOverall(slots: XISlotDef[], starterMap: Map<string, BoughtPlayer>): number {
  let sum = 0;
  let maxStarterOvr = 0;
  for (const slot of slots) {
    const bp = starterMap.get(slot.id);
    if (!bp) continue;
    sum += bp.player.overall + fitDelta(evaluateFit(bp.player, slot));
    if (bp.player.overall > maxStarterOvr) maxStarterOvr = bp.player.overall;
  }
  const raw = Math.round(sum / 11);
  // Math already ensures team_OVR ≤ max(starter_OVR) + 2 (only positive fit is +2).
  // Explicit cap codifies the guarantee so a future tweak can't let a 70-80 team score 90.
  const capped = Math.min(raw, maxStarterOvr + 2);
  return Math.max(0, Math.min(99, capped));
}

type ChemStarterBreakdown = {
  slotId: string;
  slotLabel: string;
  bp: BoughtPlayer;
  stars: number;
  rawScore: number;
  clubMates: BoughtPlayer[];
  nationMates: BoughtPlayer[];
};
type ChemBreakdown = {
  total: number;
  xiTotal: number;
  benchBonus: number;
  perStarter: ChemStarterBreakdown[];
  benchContributors: BoughtPlayer[];
};

function computeChemistry(
  slots: XISlotDef[],
  starterMap: Map<string, BoughtPlayer>,
  benchPlayers: BoughtPlayer[]
): ChemBreakdown {
  const starters = slots
    .map((s) => ({ slot: s, bp: starterMap.get(s.id) }))
    .filter((x): x is { slot: XISlotDef; bp: BoughtPlayer } => !!x.bp);

  const perStarter: ChemStarterBreakdown[] = [];
  let xiTotal = 0;
  for (const { slot, bp } of starters) {
    const clubMates: BoughtPlayer[] = [];
    const nationMates: BoughtPlayer[] = [];
    for (const other of starters) {
      if (other.slot.id === slot.id) continue;
      if (other.bp.player.club === bp.player.club) clubMates.push(other.bp);
      if (other.bp.player.country === bp.player.country) nationMates.push(other.bp);
    }
    const rawScore = clubMates.length * 2 + nationMates.length;
    const stars = Math.min(3, rawScore);
    perStarter.push({ slotId: slot.id, slotLabel: slot.label, bp, stars, rawScore, clubMates, nationMates });
    xiTotal += stars;
  }
  const benchContributors: BoughtPlayer[] = [];
  for (const { bp } of starters) {
    const links = benchPlayers.some(
      (b) => b.player.club === bp.player.club || b.player.country === bp.player.country
    );
    if (links) {
      benchContributors.push(bp);
      if (benchContributors.length >= 4) break;
    }
  }
  const benchBonus = benchContributors.length;
  return { total: Math.min(37, xiTotal + benchBonus), xiTotal, benchBonus, perStarter, benchContributors };
}

// ─────────────────────────── custom drag image ───────────────────────────

function makeDragImage(name: string, photoPath: string): HTMLDivElement {
  const el = document.createElement("div");
  el.setAttribute("data-sw-drag-image", "1");
  el.style.cssText = [
    "position:absolute", "top:-1000px", "left:-1000px",
    "display:flex", "align-items:center", "gap:8px",
    "padding:6px 14px 6px 6px",
    "background:rgba(11,16,24,0.96)",
    "border:1px solid rgba(242,237,224,0.65)",
    "border-radius:999px",
    "color:#F2EDE0",
    "font-family:'Saira Condensed', 'Arial Narrow', sans-serif",
    "font-weight:800", "font-size:12px", "letter-spacing:0.06em",
    "text-transform:uppercase",
    "box-shadow:0 10px 28px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)",
    "pointer-events:none", "white-space:nowrap",
  ].join(";");
  el.innerHTML = `
    <div style="width:30px;height:30px;border-radius:50%;flex:0 0 auto;
                background:radial-gradient(circle at 50% 35%, #FFFFFF 0%, #F2EDE0 45%, #DCD7C8 100%);
                border:1px solid rgba(0,0,0,0.3); overflow:hidden;
                display:flex; align-items:center; justify-content:center;">
      <img src="${photoPath}" alt="" draggable="false"
           onerror="this.style.display='none'"
           style="width:110%;height:110%;object-fit:cover;object-position:50% 25%;" />
    </div>
    <span>${name}</span>
  `;
  document.body.appendChild(el);
  return el;
}

// ─────────────────────────── tokens ───────────────────────────

const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

  html, body { margin: 0; padding: 0; height: 100%; }

  .sw-sb {
    --ink: #0B1018;
    --surface-1: #131A24;
    --surface-2: #0F1620;
    --surface-3: #1A2230;
    --chalk: #F2EDE0;
    --chalk-soft: rgba(242, 237, 224, 0.10);
    --chalk-dim: rgba(242, 237, 224, 0.55);
    --floodlight: #FFB627;
    --floodlight-soft: rgba(255, 182, 39, 0.12);
    --whistle: #E63946;
    --whistle-soft: rgba(230, 57, 70, 0.16);
    --keeper-blue: #6FB1FF;
    --keeper-blue-soft: rgba(111, 177, 255, 0.12);
    --text: #EFEFEF;
    --muted: #9099A8;
    --dim: #5C6573;
    --hairline: rgba(255, 255, 255, 0.06);
    --hairline-strong: rgba(255, 255, 255, 0.10);

    --font-display: 'Saira Condensed', 'Arial Narrow', sans-serif;
    --font-body: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;

    --r-sm: 4px;
    --r-md: 8px;
    --r-lg: 12px;

    background:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(255, 182, 39, 0.035), transparent 70%),
      radial-gradient(ellipse 70% 50% at 85% 100%, rgba(242, 237, 224, 0.025), transparent 70%),
      var(--ink);
    color: var(--text);
    font-family: var(--font-body);
    height: 100vh;
    width: 100%;
    padding: 10px 14px;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .sw-sb *, .sw-sb *::before, .sw-sb *::after { box-sizing: border-box; }
  .sw-sb button { font-family: inherit; cursor: pointer; }

  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .sw-num  { font-variant-numeric: tabular-nums; }

  .sw-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .sw-eyebrow-dim { color: var(--dim); }

  .sw-card {
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 12px;
    position: relative;
  }
  .sw-corner-mark {
    position: absolute; top: 9px; right: 11px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--dim); letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .sw-tick-tl, .sw-tick-tr, .sw-tick-bl, .sw-tick-br {
    position: absolute; width: 9px; height: 9px;
    border-color: var(--hairline-strong);
    pointer-events: none;
  }
  .sw-tick-tl { top: 5px; left: 5px; border-top: 1px solid; border-left: 1px solid; }
  .sw-tick-tr { top: 5px; right: 5px; border-top: 1px solid; border-right: 1px solid; }
  .sw-tick-bl { bottom: 5px; left: 5px; border-bottom: 1px solid; border-left: 1px solid; }
  .sw-tick-br { bottom: 5px; right: 5px; border-bottom: 1px solid; border-right: 1px solid; }

  .sw-btn {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    font-size: 11px;
    padding: 6px 10px;
    background: var(--surface-3);
    color: var(--text);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    transition: background 0.12s ease;
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .sw-btn:hover { background: #232C3D; }

  .sw-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 4px 6px;
    gap: 16px;
    flex: 0 0 auto;
  }
  .sw-brand {
    font-family: var(--font-display);
    font-size: 18px; font-weight: 800;
    letter-spacing: 0.16em;
    color: var(--chalk);
    text-transform: uppercase;
    line-height: 1;
  }
  .sw-brand-tag {
    font-family: var(--font-display);
    font-size: 9px; font-weight: 700;
    letter-spacing: 0.30em;
    color: var(--dim);
    text-transform: uppercase;
    margin-top: 3px;
  }
  .sw-top-meta {
    display: inline-flex; align-items: center; gap: 10px;
    font-family: var(--font-display);
    font-size: 10px; letter-spacing: 0.18em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .sw-top-meta .v {
    color: var(--chalk);
    background: var(--chalk-soft);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm);
    padding: 3px 7px;
    font-weight: 700;
  }
  .sw-top-meta .v-flood {
    color: var(--floodlight);
    background: var(--floodlight-soft);
    border-color: rgba(255,182,39,0.30);
  }
  .sw-top-meta .v-mono {
    font-family: var(--font-mono);
    text-transform: none;
    letter-spacing: 0.02em;
    font-size: 9.5px;
  }

  .sw-page-flex {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    gap: 10px;
  }
  .sw-grid-top {
    display: grid;
    grid-template-columns: minmax(580px, 1.95fr) minmax(330px, 1fr);
    gap: 10px;
    flex: 1;
    min-height: 0;
  }
  @media (max-width: 1180px) {
    .sw-grid-top { grid-template-columns: 1fr; }
  }
  .sw-col {
    display: flex; flex-direction: column; gap: 10px;
    min-width: 0; min-height: 0;
  }

  .sw-pitch-card {
    flex: 1; min-height: 0;
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 10px 14px 12px;
    position: relative;
    display: flex; flex-direction: column;
    gap: 6px;
  }
  .sw-pitch-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
    padding-right: 76px;
    flex: 0 0 auto;
  }
  .sw-pitch-head-left {
    display: inline-flex; align-items: center; gap: 12px;
  }
  .sw-pitch-head-right {
    display: inline-flex; align-items: center; gap: 10px;
    margin-right: 70px;
  }
  .sw-result-cta {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 12px;
    padding: 8px 16px;
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    border-radius: var(--r-md);
    transition: filter 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease;
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 8px 26px rgba(242, 237, 224, 0.18);
    cursor: pointer;
  }
  .sw-result-cta:hover:not(:disabled) {
    filter: brightness(1.05);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 10px 30px rgba(242, 237, 224, 0.28);
  }
  .sw-result-cta:active:not(:disabled) { transform: translateY(1px); }
  .sw-result-cta:disabled {
    background: var(--surface-3);
    color: var(--muted);
    border-color: var(--hairline-strong);
    box-shadow: none;
    cursor: not-allowed;
  }
  .sw-result-err {
    font-family: var(--font-display);
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.10em; text-transform: uppercase;
    color: var(--whistle);
    background: var(--whistle-soft);
    border: 1px solid rgba(230, 57, 70, 0.45);
    padding: 5px 8px;
    border-radius: var(--r-sm);
    max-width: 260px;
  }
  .sw-meter-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 4px 9px 3px 8px;
    background: var(--surface-2);
    border: 1px solid var(--hairline-strong);
    border-radius: 999px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted);
    line-height: 1;
  }
  .sw-meter-chip .v {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0;
    color: var(--chalk);
  }
  .sw-meter-chip.is-chem .v { color: var(--floodlight); }
  .sw-meter-chip .of {
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--dim);
  }
  .sw-meter-chip .mini-bar {
    width: 30px; height: 3px; border-radius: 2px;
    background: var(--surface-3);
    overflow: hidden;
    margin-left: 2px;
  }
  .sw-meter-chip .mini-bar > i {
    display: block; height: 100%;
    background: linear-gradient(90deg, var(--chalk), #FFFFFF);
    transition: width 0.24s cubic-bezier(0.2,0.8,0.2,1);
  }
  .sw-meter-chip.is-chem .mini-bar > i {
    background: linear-gradient(90deg, var(--floodlight), #FFD976);
  }

  .sw-pitch-frame {
    flex: 1; min-height: 0;
    background:
      radial-gradient(ellipse 60% 35% at 50% 70%, rgba(242, 237, 224, 0.025), transparent 70%),
      var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 8px;
    display: flex; justify-content: center; align-items: stretch;
  }
  .sw-pitch-wrap {
    height: 100%;
    aspect-ratio: 100 / 140;
    max-width: 100%;
    position: relative;
  }
  .sw-pitch-svg { display: block; width: 100%; height: 100%; position: absolute; inset: 0; }
  .sw-pitch-line { stroke: var(--chalk-soft); stroke-width: 0.35; fill: none; }
  .sw-pitch-line-strong { stroke: rgba(242, 237, 224, 0.18); stroke-width: 0.4; fill: none; }
  .sw-pitch-spot { fill: rgba(242, 237, 224, 0.30); }

  .sw-xi-slot {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 68px; height: 84px;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
    cursor: pointer;
    z-index: 2;
    user-select: none;
    transition: opacity 0.18s ease;
  }
  .sw-xi-slot.is-dragging-source { opacity: 0.28; }
  .sw-xi-slot.is-drag-over .sw-slot-disc-empty,
  .sw-xi-slot.is-drag-over .sw-slot-photo {
    box-shadow:
      0 0 0 2px var(--chalk),
      0 0 22px rgba(242, 237, 224, 0.40);
    transform: scale(1.05);
  }
  .sw-xi-slot.is-selected .sw-slot-photo,
  .sw-xi-slot.is-selected .sw-slot-disc-empty {
    box-shadow:
      0 0 0 1.5px var(--chalk),
      0 0 16px rgba(242, 237, 224, 0.28);
  }
  .sw-slot-disc-empty {
    width: 42px; height: 42px;
    border-radius: 50%;
    background: var(--surface-1);
    border: 1.5px dashed var(--hairline-strong);
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 11px;
    letter-spacing: 0.10em;
    color: var(--chalk-dim);
    transition: box-shadow 0.14s ease, border-color 0.12s ease, background 0.12s ease, transform 0.14s ease;
  }
  .sw-xi-slot:hover .sw-slot-disc-empty {
    border-style: solid;
    border-color: var(--chalk-soft);
    background: #161F2C;
  }
  .sw-slot-photo {
    width: 50px; height: 50px;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 45%, #DCD7C8 100%);
    border: 1px solid rgba(0,0,0,0.30);
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0,0,0,0.45);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: box-shadow 0.14s ease, transform 0.14s ease;
  }
  .sw-slot-photo img { width: 110%; height: 110%; object-fit: cover; object-position: 50% 25%; display: block; }
  .sw-slot-photo .sw-photo-initials {
    font-family: var(--font-display); font-weight: 800;
    font-size: 14px; color: var(--ink); letter-spacing: 0.04em;
  }
  .sw-slot-accent-ring {
    position: absolute; inset: -3px;
    border-radius: 50%;
    border: 1.5px solid transparent;
    pointer-events: none;
  }
  .sw-slot-cap {
    margin-top: 3px;
    display: flex; flex-direction: column; align-items: center; gap: 1px;
    text-align: center;
    pointer-events: none;
  }
  .sw-slot-cap-name {
    font-family: var(--font-display);
    font-size: 10px; font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--chalk);
    line-height: 1;
    max-width: 70px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-shadow: 0 1px 4px rgba(0,0,0,0.65);
  }
  .sw-slot-cap-row {
    display: inline-flex; align-items: center; gap: 4px;
    font-family: var(--font-mono);
    font-size: 8.5px;
    letter-spacing: 0.04em;
    line-height: 1;
  }
  .sw-slot-cap-ovr { color: var(--chalk); font-weight: 700; }
  .sw-slot-fit-dot { width: 5px; height: 5px; border-radius: 50%; display: inline-block; }

  .sw-bench-card {
    flex: 0 0 auto;
    padding: 10px 14px 12px;
  }
  .sw-bench-head {
    display: flex; align-items: center; gap: 10px;
    padding-right: 76px;
  }
  .sw-bench-strip {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin-top: 8px;
  }
  .sw-bench-slot {
    position: relative;
    background: var(--surface-2);
    border: 1.5px dashed var(--hairline-strong);
    border-radius: var(--r-md);
    height: 68px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, box-shadow 0.12s, opacity 0.18s;
  }
  .sw-bench-slot:hover { border-color: var(--chalk-soft); background: #161F2C; border-style: solid; }
  .sw-bench-slot.is-drag-over {
    border-color: var(--chalk);
    border-style: solid;
    background: rgba(242, 237, 224, 0.05);
    box-shadow: 0 0 0 1px var(--chalk) inset, 0 0 16px rgba(242, 237, 224, 0.22) inset;
  }
  .sw-bench-slot.is-selected { box-shadow: 0 0 0 1.5px var(--chalk) inset; }
  .sw-bench-slot.is-dragging-source { opacity: 0.28; }
  .sw-bench-empty {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    color: var(--dim);
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 9px;
    letter-spacing: 0.20em;
    text-transform: uppercase;
  }
  .sw-bench-empty .num {
    font-family: var(--font-mono);
    color: var(--chalk-dim);
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .sw-bench-filled {
    display: flex; align-items: center; gap: 8px;
    width: 100%; height: 100%;
    padding: 6px 8px;
  }
  .sw-bench-photo {
    width: 48px; height: 48px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 45%, #DCD7C8 100%);
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center;
  }
  .sw-bench-photo img { width: 110%; height: 110%; object-fit: cover; object-position: 50% 25%; display: block; }
  .sw-bench-photo .sw-photo-initials {
    font-family: var(--font-display); font-weight: 800;
    font-size: 14px; color: var(--ink);
  }
  .sw-bench-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sw-bench-name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 11px;
    color: var(--chalk);
    letter-spacing: 0.04em;
    line-height: 1.05;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sw-bench-meta {
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .sw-bench-meta .ovr { color: var(--chalk); font-weight: 700; }

  .sw-pool-card {
    flex: 1; min-height: 0;
    padding: 10px 12px;
    display: flex; flex-direction: column;
    gap: 6px;
    position: relative;
  }
  .sw-pool-head {
    display: flex; align-items: baseline; justify-content: space-between;
    padding-right: 70px;
    gap: 8px;
  }
  .sw-pool-count {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text);
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .sw-pool-filter {
    display: flex; gap: 5px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .sw-pool-chip {
    font-family: var(--font-display);
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 3px 8px 2px;
    background: var(--surface-3);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-sm);
    color: var(--muted);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .sw-pool-chip.is-active {
    color: var(--ink);
    background: var(--chalk);
    border-color: var(--chalk);
  }
  .sw-pool-list {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column; gap: 5px;
    overflow-y: auto;
    padding: 2px 2px 4px;
    scrollbar-width: none;
  }
  .sw-pool-list::-webkit-scrollbar { display: none; }
  .sw-pool-row {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-left: 3px solid currentColor;
    border-radius: var(--r-sm);
    padding: 5px 7px;
    cursor: grab;
    transition: background 0.12s, border-color 0.12s, opacity 0.18s;
  }
  .sw-pool-row:hover { background: #131C28; }
  .sw-pool-row.is-placed { opacity: 0.32; }
  .sw-pool-row.is-selected {
    background: rgba(242, 237, 224, 0.06);
    box-shadow: 0 0 0 1px var(--chalk-dim) inset;
  }
  .sw-pool-row.is-dragging-source { opacity: 0.28; }
  .sw-pool-row:active { cursor: grabbing; }
  .sw-pool-photo {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 45%, #DCD7C8 100%);
    overflow: hidden;
    border: 1px solid rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center;
  }
  .sw-pool-photo img { width: 110%; height: 110%; object-fit: cover; object-position: 50% 25%; }
  .sw-pool-photo .sw-photo-initials { font-family: var(--font-display); font-weight: 800; font-size: 11px; color: var(--ink); }
  .sw-pool-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sw-pool-name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 12px;
    color: var(--chalk);
    letter-spacing: 0.04em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sw-pool-sub {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .sw-pool-sub .pos { color: currentColor; font-weight: 700; }
  .sw-pool-right {
    display: flex; flex-direction: column; align-items: flex-end; gap: 2px;
  }
  .sw-pool-ovr {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 14px;
    color: var(--chalk);
    line-height: 1;
  }
  .sw-pool-price {
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--muted);
    letter-spacing: 0.04em;
  }
  .sw-pool-placed-tag {
    font-family: var(--font-display);
    font-size: 7.5px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--dim);
    margin-top: 1px;
  }
  .sw-pool-list.is-drag-over {
    background: rgba(242, 237, 224, 0.03);
    box-shadow: 0 0 0 1px var(--chalk-soft) inset;
    border-radius: var(--r-sm);
  }

  .sw-dossier-strip {
    flex: 0 0 auto;
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 10px 14px;
    position: relative;
    min-height: 138px;
    max-height: 168px;
    display: grid;
    grid-template-columns: auto minmax(180px, 1.1fr) minmax(180px, 1fr) minmax(180px, 1fr) minmax(290px, 1.35fr);
    gap: 14px;
    align-items: center;
  }
  .sw-dossier-strip.is-idle {
    grid-template-columns: 1fr;
  }
  .sw-dossier-photo-sm {
    width: 110px; height: 110px;
    flex: 0 0 auto;
    border-radius: var(--r-md);
    background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 50%, #DCD7C8 100%);
    border: 1px solid rgba(0,0,0,0.30);
    box-shadow: 0 6px 14px rgba(0,0,0,0.40), inset 0 0 0 1px rgba(255,255,255,0.4);
    overflow: hidden;
    position: relative;
    display: flex; align-items: flex-end; justify-content: center;
  }
  .sw-dossier-photo-sm img {
    width: 100%; height: 100%;
    object-fit: contain;
    object-position: 50% 100%;
    display: block;
  }
  .sw-dossier-photo-sm .sw-photo-initials {
    font-family: var(--font-display); font-weight: 800;
    font-size: 36px; color: var(--ink);
  }
  .sw-dossier-stripe {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 4px;
  }
  .sw-dossier-identity {
    display: flex; flex-direction: column; gap: 6px;
    min-width: 0;
  }
  .sw-dossier-name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 22px;
    color: var(--chalk);
    letter-spacing: 0.01em;
    line-height: 1;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sw-dossier-id {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--dim);
    letter-spacing: 0.06em;
  }
  .sw-dossier-pos-row {
    display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  }
  .sw-pos-chip {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding: 3px 7px 2px;
    border-radius: var(--r-sm);
    color: var(--ink);
    line-height: 1;
  }
  .sw-pos-chip.is-alt {
    background: transparent;
    color: var(--chalk-dim);
    border: 1px dashed var(--hairline-strong);
    padding: 2px 6px 1px;
  }
  .sw-pos-chip.is-fit-perfect {
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    font-weight: 800;
    letter-spacing: 0.22em;
    box-shadow: 0 0 10px rgba(242, 237, 224, 0.20);
  }
  .sw-pos-chip.is-fit-alt {
    background: var(--floodlight-soft);
    color: var(--floodlight);
    border: 1px dashed var(--floodlight);
    font-weight: 700;
    letter-spacing: 0.18em;
  }
  .sw-pos-chip.is-fit-out {
    background: transparent;
    color: var(--muted);
    border: 1px dotted var(--muted);
    font-weight: 500;
    font-style: italic;
    letter-spacing: 0.12em;
    text-transform: lowercase;
  }
  .sw-pos-chip.is-fit-wrong {
    background: var(--whistle-soft);
    color: var(--whistle);
    border: 1.5px solid var(--whistle);
    font-weight: 800;
    letter-spacing: 0.22em;
    box-shadow: 0 0 10px rgba(230, 57, 70, 0.30);
  }
  .sw-dossier-col {
    display: flex; flex-direction: column; gap: 6px; min-width: 0;
  }
  .sw-pill {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    padding: 5px 8px 6px;
    display: flex; flex-direction: column; gap: 1px;
  }
  .sw-pill-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 8.5px;
    letter-spacing: 0.22em;
    color: var(--dim);
    text-transform: uppercase;
    line-height: 1;
  }
  .sw-pill-val {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 12px;
    color: var(--chalk);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    line-height: 1.1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sw-pill-val.is-mono {
    font-family: var(--font-mono);
    text-transform: none;
    letter-spacing: 0.02em;
  }
  .sw-pill-val.is-floodlight { color: var(--floodlight); }
  .sw-stats-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 5px;
  }
  .sw-stat-cell {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-top: 2px solid currentColor;
    border-radius: var(--r-sm);
    padding: 6px 4px 7px;
    text-align: center;
    display: flex; flex-direction: column; gap: 1px;
  }
  .sw-stat-key {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    line-height: 1;
  }
  .sw-stat-val {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 16px;
    color: var(--chalk);
    letter-spacing: -0.01em;
    line-height: 1.05;
  }
  .sw-dossier-idle {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center;
    color: var(--muted);
    gap: 4px;
    padding: 10px 8px;
  }
  .sw-dossier-idle .eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: var(--dim);
    text-transform: uppercase;
  }
  .sw-dossier-idle .body { font-size: 12px; line-height: 1.4; }

  @keyframes sw-tick-in {
    0%   { transform: translateY(-4px); opacity: 0; }
    100% { transform: translateY(0);    opacity: 1; }
  }
  .sw-tick { animation: sw-tick-in 0.30s cubic-bezier(0.2, 0.8, 0.2, 1); }

  .sw-meter-chip-wrap {
    position: relative;
    display: inline-flex;
  }
  .sw-chem-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 322px;
    max-height: 380px;
    background: var(--surface-2);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    padding: 10px 12px 12px;
    box-shadow: 0 14px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4);
    z-index: 60;
    overflow-y: auto;
    scrollbar-width: none;
    animation: sw-tick-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sw-chem-popover::-webkit-scrollbar { display: none; }
  .sw-chem-popover::before {
    content: "";
    position: absolute;
    top: -5px;
    right: 22px;
    width: 9px; height: 9px;
    background: var(--surface-2);
    border-top: 1px solid var(--hairline-strong);
    border-left: 1px solid var(--hairline-strong);
    transform: rotate(45deg);
  }
  .sw-chem-pop-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.22em;
    color: var(--floodlight);
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .sw-chem-pop-section { margin-bottom: 10px; }
  .sw-chem-pop-section:last-child { margin-bottom: 0; }
  .sw-chem-pop-section-label {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.22em;
    color: var(--dim);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .sw-chem-pop-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-top: 1px solid var(--hairline);
  }
  .sw-chem-pop-row:first-of-type { border-top: none; }
  .sw-chem-pop-row .name {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 11px;
    color: var(--chalk);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sw-chem-pop-row .name .slot-tag {
    color: var(--dim);
    font-weight: 700;
    margin-left: 4px;
    font-size: 9px;
    letter-spacing: 0.12em;
  }
  .sw-chem-pop-row .stars {
    font-family: var(--font-display);
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--floodlight);
    line-height: 1;
  }
  .sw-chem-pop-row .stars .dim { color: var(--surface-3); }
  .sw-chem-pop-row .why {
    font-family: var(--font-mono);
    font-size: 9.5px;
    color: var(--muted);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .sw-chem-pop-row .why .strong { color: var(--chalk); font-weight: 700; }
  .sw-chem-pop-row .why .nolink { color: var(--dim); font-style: italic; }
  .sw-chem-pop-empty {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--muted);
    padding: 10px 0;
    text-align: center;
    line-height: 1.5;
  }
  .sw-chem-pop-note {
    font-family: var(--font-body);
    font-size: 10.5px;
    color: var(--muted);
    line-height: 1.45;
  }
  .sw-chem-pop-note .strong { color: var(--chalk); font-weight: 600; }

  /* ─── Responsive: laptop (1024-1366) — give the pitch more vertical room
     by shrinking the dossier strip + bench chip + photo. Pitch frame grows
     naturally because it has flex:1 inside .sw-page-flex.  ─── */
  @media (max-width: 1366px) {
    .sw-sb {
      padding: 8px 12px;
    }
    .sw-dossier-strip {
      min-height: 108px;
      max-height: 130px;
      padding: 8px 12px;
      gap: 12px;
      grid-template-columns: auto minmax(150px, 1fr) minmax(150px, 0.9fr) minmax(150px, 0.9fr) minmax(240px, 1.2fr);
    }
    .sw-dossier-photo-sm { width: 88px; height: 88px; }
    .sw-dossier-name { font-size: 18px; }
    .sw-bench-card { padding: 8px 12px 10px; }
    .sw-bench-slot { height: 56px; }
    .sw-pitch-head { padding-right: 60px; }
    .sw-pitch-head-right { margin-right: 60px; }
    .sw-result-cta { padding: 7px 12px; font-size: 11px; }
  }
  /* ─── Tablet (768-1023) — stack pitch/bench on top, pool below, dossier at bottom. ─── */
  @media (max-width: 1023px) {
    .sw-sb {
      height: auto;
      min-height: 100vh;
      overflow: auto;
      padding: 8px 10px;
    }
    .sw-grid-top {
      grid-template-columns: 1fr;
      min-height: 0;
      flex: none;
    }
    .sw-pitch-wrap {
      max-width: 480px;
      margin: 0 auto;
    }
    .sw-dossier-strip {
      grid-template-columns: 1fr;
      min-height: auto;
      max-height: none;
      gap: 10px;
    }
    .sw-dossier-photo-sm { width: 72px; height: 72px; }
    .sw-bench-slot { height: 52px; }
  }
`;

// ─────────────────────────── reusable bits ───────────────────────────

function PlayerPhoto({ src, name }: { src: string; name: string }) {
  const knownMissing = !src;
  const [failed, setFailed] = useState(knownMissing);
  useEffect(() => { setFailed(!src); }, [src]);
  const initials = useMemo(() => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [name]);
  if (failed) return <span className="sw-photo-initials">{initials}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={name} draggable={false} onError={() => setFailed(true)} />;
}

function PitchLines() {
  return (
    <g>
      <rect x="2" y="2" width="96" height="136" className="sw-pitch-line-strong" />
      <line x1="2" y1="70" x2="98" y2="70" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="11" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="0.9" className="sw-pitch-spot" />
      <rect x="22" y="2" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="2" width="28" height="9" className="sw-pitch-line" />
      <circle cx="50" cy="15" r="0.7" className="sw-pitch-spot" />
      <line x1="42" y1="2" x2="58" y2="2" stroke="rgba(242,237,224,0.30)" strokeWidth="0.6" />
      <rect x="22" y="118" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="129" width="28" height="9" className="sw-pitch-line" />
      <circle cx="50" cy="125" r="0.7" className="sw-pitch-spot" />
      <line x1="42" y1="138" x2="58" y2="138" stroke="rgba(242,237,224,0.30)" strokeWidth="0.6" />
      <path d="M 2 4 A 2 2 0 0 1 4 2" className="sw-pitch-line" />
      <path d="M 96 2 A 2 2 0 0 1 98 4" className="sw-pitch-line" />
      <path d="M 2 136 A 2 2 0 0 0 4 138" className="sw-pitch-line" />
      <path d="M 96 138 A 2 2 0 0 0 98 136" className="sw-pitch-line" />
    </g>
  );
}

function XISlotView({
  slot, bp, dragOver, selected, isDraggingSource,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onClick,
}: {
  slot: XISlotDef;
  bp: BoughtPlayer | undefined;
  dragOver: boolean;
  selected: boolean;
  isDraggingSource: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const fit = bp ? evaluateFit(bp.player, slot) : null;
  const accent = categoryAccent(slot.cat);
  return (
    <div
      className={[
        "sw-xi-slot",
        dragOver && "is-drag-over",
        selected && "is-selected",
        isDraggingSource && "is-dragging-source",
      ].filter(Boolean).join(" ")}
      style={{ left: `${slot.x}%`, top: `${(slot.y / 140) * 100}%` }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      draggable={!!bp}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {bp ? (
        <>
          <div className="sw-slot-photo">
            <span className="sw-slot-accent-ring" style={{ borderColor: fit ? fitColor(fit) : accent }} />
            <PlayerPhoto src={bp.player.photo_path} name={bp.player.name} />
          </div>
          <div className="sw-slot-cap">
            <span className="sw-slot-cap-name">{bp.player.name}</span>
            <span className="sw-slot-cap-row">
              <span className="sw-slot-cap-ovr">{bp.player.overall}</span>
              <span style={{ color: "var(--dim)" }}>·</span>
              <span style={{
                color: fit ? fitColor(fit) : "var(--muted)",
                fontWeight: fit === "wrong" || fit === "primary" ? 800 : 700,
                fontStyle: fit === "same-cat" ? "italic" : "normal",
                textDecoration: fit === "wrong" ? "underline" : "none",
                textDecorationThickness: fit === "wrong" ? "1px" : undefined,
                textUnderlineOffset: fit === "wrong" ? "2px" : undefined,
              }}>
                {slot.label}
              </span>
              <span className="sw-slot-fit-dot" style={{ background: fit ? fitColor(fit) : "transparent" }} />
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="sw-slot-disc-empty" style={{ borderColor: accent, color: accent }}>
            {slot.label}
          </div>
          <div className="sw-slot-cap">
            <span className="sw-slot-cap-name" style={{ color: "var(--dim)" }}>OPEN</span>
          </div>
        </>
      )}
    </div>
  );
}

function BenchSlotView({
  index, bp, dragOver, selected, isDraggingSource,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onClick,
}: {
  index: number;
  bp: BoughtPlayer | undefined;
  dragOver: boolean;
  selected: boolean;
  isDraggingSource: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      className={[
        "sw-bench-slot",
        dragOver && "is-drag-over",
        selected && "is-selected",
        isDraggingSource && "is-dragging-source",
      ].filter(Boolean).join(" ")}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      draggable={!!bp}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-label={bp ? `Bench ${index + 1}: ${bp.player.name}` : `Bench slot ${index + 1} (empty)`}
    >
      {bp ? (
        <div className="sw-bench-filled">
          <div className="sw-bench-photo">
            <PlayerPhoto src={bp.player.photo_path} name={bp.player.name} />
          </div>
          <div className="sw-bench-body">
            <span className="sw-bench-name">{bp.player.name}</span>
            <span className="sw-bench-meta">
              <span className="ovr">OVR {bp.player.overall}</span>
              {" · "}{bp.player.primary_position}
            </span>
          </div>
        </div>
      ) : (
        <div className="sw-bench-empty">
          <span className="num">{String(index + 1).padStart(2, "0")}</span>
          <span>BENCH</span>
        </div>
      )}
    </div>
  );
}

function PoolRow({
  bp, placement, selected, isDraggingSource,
  onDragStart, onDragEnd, onClick,
}: {
  bp: BoughtPlayer;
  placement: Placement;
  selected: boolean;
  isDraggingSource: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const placed = placement.kind !== "pool";
  const accent = categoryAccent(bp.player.category);
  let placedLabel = "";
  if (placement.kind === "xi") placedLabel = `IN XI · ${placement.slotId.toUpperCase()}`;
  else if (placement.kind === "bench") placedLabel = `BENCH ${placement.index + 1}`;
  return (
    <div
      className={[
        "sw-pool-row",
        placed && "is-placed",
        selected && "is-selected",
        isDraggingSource && "is-dragging-source",
      ].filter(Boolean).join(" ")}
      style={{ color: accent }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      aria-label={bp.player.name}
    >
      <div className="sw-pool-photo">
        <PlayerPhoto src={bp.player.photo_path} name={bp.player.name} />
      </div>
      <div className="sw-pool-body">
        <span className="sw-pool-name">{bp.player.name}</span>
        <span className="sw-pool-sub" style={{ color: "var(--muted)" }}>
          <span className="pos" style={{ color: accent }}>{bp.player.primary_position}</span>
          {" · "}{bp.player.club}
          {placed && <span className="sw-pool-placed-tag">· {placedLabel}</span>}
        </span>
      </div>
      <div className="sw-pool-right">
        <span className="sw-pool-ovr">{bp.player.overall}</span>
        <span className="sw-pool-price">{fmtMoney(bp.price)}</span>
      </div>
    </div>
  );
}

function DossierStrip({
  bp, placement, slot, fit,
}: {
  bp: BoughtPlayer | null;
  placement: Placement | null;
  slot: XISlotDef | null;
  fit: Fit | null;
}) {
  if (!bp) {
    return (
      <div className="sw-dossier-strip is-idle">
        <span className="sw-tick-tl" /><span className="sw-tick-tr" />
        <span className="sw-tick-bl" /><span className="sw-tick-br" />
        <div className="sw-corner-mark">DOSSIER · IDLE</div>
        <div className="sw-dossier-idle">
          <div className="eyebrow">SCOUT REPORT</div>
          <div className="body">click any signing — in the buy list, on the pitch, or on the bench — to open their dossier here.</div>
        </div>
      </div>
    );
  }

  const accent = categoryAccent(bp.player.category);
  let placedLabel = "UNPLACED · IN BUY LIST";
  if (placement?.kind === "xi") placedLabel = `IN XI · ${(slot?.label ?? placement.slotId).toUpperCase()}`;
  else if (placement?.kind === "bench") placedLabel = `BENCH · #${placement.index + 1}`;

  const alts = bp.player.positions.filter((p) => p !== bp.player.primary_position);

  return (
    <div className="sw-dossier-strip sw-tick" key={`dossier-${bp.player.id}`}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-corner-mark">DOSSIER · #{bp.player.id}</div>

      <div className="sw-dossier-photo-sm">
        <div className="sw-dossier-stripe" style={{ background: accent }} />
        <PlayerPhoto src={bp.player.photo_path} name={bp.player.name} />
      </div>

      <div className="sw-dossier-identity">
        <span className="sw-eyebrow">SCOUT REPORT · {placedLabel}</span>
        <div className="sw-dossier-name">{bp.player.name}</div>
        <div className="sw-dossier-pos-row">
          <span className="sw-pos-chip" style={{ background: accent }}>{bp.player.primary_position}</span>
          {alts.map((p) => (
            <span key={p} className="sw-pos-chip is-alt" style={{ color: accent, borderColor: accent }}>{p}</span>
          ))}
          {fit && (
            <span className={`sw-pos-chip is-fit-${
              fit === "primary"  ? "perfect" :
              fit === "alt"      ? "alt"     :
              fit === "same-cat" ? "out"     : "wrong"
            }`}>
              {fitLabel(fit)}
            </span>
          )}
        </div>
      </div>

      <div className="sw-dossier-col">
        <div className="sw-pill">
          <span className="sw-pill-eyebrow">CLUB</span>
          <span className="sw-pill-val">{bp.player.club}</span>
        </div>
        <div className="sw-pill">
          <span className="sw-pill-eyebrow">COUNTRY</span>
          <span className="sw-pill-val">{bp.player.country}</span>
        </div>
      </div>

      <div className="sw-dossier-col">
        <div className="sw-pill">
          <span className="sw-pill-eyebrow">BOUGHT FOR</span>
          <span className="sw-pill-val is-mono">{fmtMoney(bp.price)}</span>
        </div>
        <div className="sw-pill">
          <span className="sw-pill-eyebrow">MARKET VALUE</span>
          <span className="sw-pill-val is-mono is-floodlight">{fmtMoney(bp.player.value_eur)}</span>
        </div>
      </div>

      <div className="sw-stats-grid">
        {(["pac", "sho", "pas", "dri", "def", "phy"] as const).map((k) => (
          <div key={k} className="sw-stat-cell" style={{ color: accent }}>
            <span className="sw-stat-key">{k.toUpperCase()}</span>
            <span className="sw-stat-val">{bp.player.stats[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeterChip({
  label, value, max, accent,
}: {
  label: string; value: number; max: number; accent: "chalk" | "chem";
}) {
  return (
    <span className={`sw-meter-chip${accent === "chem" ? " is-chem" : ""}`}>
      <span>{label}</span>
      <span className="v sw-num" key={`${label}-${value}`}>{value}</span>
      <span className="of">/ {max}</span>
      <span className="mini-bar">
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </span>
    </span>
  );
}

function ChemMeterChip({ chem }: { chem: ChemBreakdown }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="sw-meter-chip-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span className="sw-meter-chip is-chem" tabIndex={0}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
        <span>CHEM</span>
        <span className="v sw-num" key={`chem-${chem.total}`}>{chem.total}</span>
        <span className="of">/ 37</span>
        <span className="mini-bar">
          <i style={{ width: `${Math.min(100, (chem.total / 37) * 100)}%` }} />
        </span>
      </span>
      {open && <ChemPopover chem={chem} />}
    </span>
  );
}

function ChemPopover({ chem }: { chem: ChemBreakdown }) {
  const sortedStarters = useMemo(
    () => [...chem.perStarter].sort((a, b) => b.stars - a.stars || b.rawScore - a.rawScore),
    [chem.perStarter]
  );
  return (
    <div className="sw-chem-popover" role="tooltip">
      <div className="sw-chem-pop-eyebrow">CHEMISTRY · {chem.total} / 37</div>
      {sortedStarters.length === 0 ? (
        <div className="sw-chem-pop-empty">
          no starters on the pitch yet · drag players in, and links form via shared club or country.
        </div>
      ) : (
        <>
          <div className="sw-chem-pop-section">
            <div className="sw-chem-pop-section-label">XI LINKS · {chem.xiTotal} / 33 (max 3 per starter)</div>
            {sortedStarters.map((s) => (
              <div key={s.slotId} className="sw-chem-pop-row">
                <span className="name">
                  {s.bp.player.name}
                  <span className="slot-tag">· {s.slotLabel}</span>
                </span>
                <span className="stars">
                  {"★".repeat(s.stars)}<span className="dim">{"★".repeat(3 - s.stars)}</span>
                </span>
                <span className="why">
                  {s.clubMates.length === 0 && s.nationMates.length === 0 ? (
                    <span className="nolink">no links</span>
                  ) : (
                    <>
                      {s.clubMates.length > 0 && (
                        <><span className="strong">{s.clubMates.length}</span> club</>
                      )}
                      {s.clubMates.length > 0 && s.nationMates.length > 0 && " · "}
                      {s.nationMates.length > 0 && (
                        <><span className="strong">{s.nationMates.length}</span> nat</>
                      )}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="sw-chem-pop-section">
            <div className="sw-chem-pop-section-label">BENCH BONUS · +{chem.benchBonus} / 4</div>
            {chem.benchContributors.length === 0 ? (
              <div className="sw-chem-pop-note">no bench player shares a club or country with an XI starter yet.</div>
            ) : (
              <div className="sw-chem-pop-note">
                starters linked to bench:{" "}
                <span className="strong">{chem.benchContributors.map((c) => c.player.name).join(" · ")}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────── component ───────────────────────────

type FilterKey = "ALL" | "GK" | "DEF" | "MID" | "ATT";

export type SquadBuilderProps = {
  /** Server-fetched bought players. Source of truth — never mutated client-side. */
  bought: BoughtPlayer[];
  /** Formation name from MatchStateDTO (e.g. "4-3-3"). Falls back to 4-3-3 if unknown. */
  formation: string;
  /** Difficulty name from MatchStateDTO (e.g. "hard"). Displayed only. */
  difficulty: string;
  /** Optional match ID — surfaced in the top-meta strip. */
  matchId?: string;
  /**
   * Optional submit handler. If provided, the VIEW RESULT button becomes active
   * once all 11 XI slots are filled and clicking it calls this handler with the
   * frozen placement. The parent owns whatever happens next (POST to the server,
   * swap to a dummy result for dev preview, etc.). A rejected promise surfaces
   * its message as an inline error. Omit to hide the button entirely.
   */
  onSubmit?: (xi: SquadXIEntry[], bench: SquadBenchEntry[]) => Promise<void>;
};

export default function SquadBuilder({
  bought,
  formation,
  difficulty,
  matchId,
  onSubmit,
}: SquadBuilderProps) {
  const formationDef = FORMATIONS[formation] ?? FORMATIONS[DEFAULT_FORMATION];

  // Placement: playerId → location. Initial = everyone in the pool.
  // Reset whenever the bought list identity changes (different match → fresh state).
  const initialPlacement = useMemo<Record<number, Placement>>(() => {
    const out: Record<number, Placement> = {};
    for (const b of bought) out[b.player.id] = { kind: "pool" };
    return out;
  }, [bought]);

  const [placement, setPlacement] = useState<Record<number, Placement>>(initialPlacement);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>("ALL");

  // If the `bought` reference changes (different match loaded), reset placement.
  // No persistence — refresh → fresh server fetch → empty XI/bench, just like the spec requires.
  useEffect(() => {
    setPlacement(initialPlacement);
    setSelectedId(null);
  }, [initialPlacement]);

  const buyById = useMemo(() => {
    const m = new Map<number, BoughtPlayer>();
    for (const b of bought) m.set(b.player.id, b);
    return m;
  }, [bought]);

  const starterMap = useMemo(() => {
    const m = new Map<string, BoughtPlayer>();
    for (const [pid, loc] of Object.entries(placement)) {
      if (loc.kind === "xi") {
        const bp = buyById.get(Number(pid));
        if (bp) m.set(loc.slotId, bp);
      }
    }
    return m;
  }, [placement, buyById]);

  const benchMap = useMemo(() => {
    const m = new Map<number, BoughtPlayer>();
    for (const [pid, loc] of Object.entries(placement)) {
      if (loc.kind === "bench") {
        const bp = buyById.get(Number(pid));
        if (bp) m.set(loc.index, bp);
      }
    }
    return m;
  }, [placement, buyById]);

  const benchPlayers = useMemo(() => Array.from(benchMap.values()), [benchMap]);

  const overall = useMemo(
    () => computeOverall(formationDef.slots, starterMap),
    [formationDef, starterMap]
  );
  const chem = useMemo(
    () => computeChemistry(formationDef.slots, starterMap, benchPlayers),
    [formationDef, starterMap, benchPlayers]
  );

  const startersFilled = starterMap.size;
  const benchFilled = benchMap.size;

  const movePlayer = useCallback((draggedId: number, target: Placement) => {
    setPlacement((prev) => {
      const next = { ...prev };
      const src = next[draggedId] ?? { kind: "pool" as const };
      if (placementsEqual(src, target)) return prev;
      if (target.kind !== "pool") {
        for (const [pid, loc] of Object.entries(prev)) {
          if (Number(pid) === draggedId) continue;
          if (placementsEqual(loc, target)) {
            next[Number(pid)] = src;
            break;
          }
        }
      }
      next[draggedId] = target;
      return next;
    });
  }, []);

  const handleDragStart = useCallback((bp: BoughtPlayer) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", String(bp.player.id));
    e.dataTransfer.effectAllowed = "move";
    const ghost = makeDragImage(bp.player.name, bp.player.photo_path);
    e.dataTransfer.setDragImage(ghost, 20, 22);
    requestAnimationFrame(() => ghost.remove());
    setDraggingId(bp.player.id);
    setSelectedId(bp.player.id);
  }, []);

  const handleDragEnd = useCallback((_e: React.DragEvent) => {
    setDraggingId(null);
    setDragOverKey(null);
  }, []);

  const handleDragOver = useCallback((key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) setDragOverKey(key);
  }, [dragOverKey]);

  const handleDragLeave = useCallback((key: string) => (_e: React.DragEvent) => {
    if (dragOverKey === key) setDragOverKey(null);
  }, [dragOverKey]);

  const handleDrop = useCallback((target: Placement) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    const raw = e.dataTransfer.getData("text/plain");
    const id = Number(raw);
    if (!id || !buyById.has(id)) return;
    movePlayer(id, target);
  }, [buyById, movePlayer]);

  const selectedBp = selectedId != null ? buyById.get(selectedId) ?? null : null;
  const selectedPlacement = selectedId != null ? placement[selectedId] ?? null : null;
  const selectedSlot =
    selectedPlacement?.kind === "xi"
      ? formationDef.slots.find((s) => s.id === selectedPlacement.slotId) ?? null
      : null;
  const selectedFit =
    selectedBp && selectedSlot ? evaluateFit(selectedBp.player, selectedSlot) : null;

  const filteredBuys = useMemo(() => {
    if (filter === "ALL") return bought;
    return bought.filter((b) => b.player.category === filter);
  }, [filter, bought]);

  const unplacedCount = useMemo(
    () => bought.filter((b) => (placement[b.player.id] ?? { kind: "pool" }).kind === "pool").length,
    [bought, placement]
  );

  // ─────────────── RESULT submission ───────────────
  // Builds the frozen XI + bench from `placement` and hands it to the parent via
  // `onSubmit`. The parent is responsible for whatever happens next — POSTing to
  // /api/match/:id/result in production, or swapping in a dummy ResultPayload on
  // the dev sandbox. SquadBuilder never knows which is which.
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const allFilled = startersFilled === 11;
  const canSubmit = !!onSubmit && allFilled && !submitting;

  const submitResult = useCallback(async () => {
    if (!onSubmit) {
      setSubmitError("This build can't submit yet.");
      return;
    }
    if (!allFilled) {
      setSubmitError("Place all 11 starters first.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const xi: SquadXIEntry[] = [];
    const bench: SquadBenchEntry[] = [];
    for (const [pidRaw, loc] of Object.entries(placement)) {
      const pid = Number(pidRaw);
      if (loc.kind === "xi") xi.push({ slotId: loc.slotId, playerId: pid });
      else if (loc.kind === "bench") bench.push({ index: loc.index, playerId: pid });
    }
    try {
      await onSubmit(xi, bench);
      // On success, parent should swap us out of the tree — but if not, leave the
      // submitting state on so the button stays disabled to avoid double-submit.
    } catch (err) {
      setSubmitError((err as Error).message || "Result submission failed.");
      setSubmitting(false);
    }
  }, [onSubmit, placement, allFilled]);

  return (
    <>
      <style>{tokens}</style>
      <div className="sw-sb">
        <div className="sw-top">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/" className="sw-btn" aria-label="back to landing">← HOME</Link>
            <div>
              <div className="sw-brand">SQUADWARS</div>
              <div className="sw-brand-tag">DRESSING ROOM · BUILD THE XI</div>
            </div>
          </div>
          <div className="sw-top-meta">
            <span>FORMATION</span>
            <span className="v">{formationDef.name} · {formationDef.label}</span>
            <span>OPPONENT</span>
            <span className="v v-flood">{difficulty.toUpperCase()}</span>
            <span>SIGNINGS</span>
            <span className="v">{bought.length}</span>
            {matchId && (
              <>
                <span>MATCH</span>
                <span className="v v-mono">{matchId}</span>
              </>
            )}
          </div>
        </div>

        <div className="sw-page-flex">
          <div className="sw-grid-top">
            <div className="sw-col">
              <div className="sw-pitch-card">
                <span className="sw-tick-tl" /><span className="sw-tick-tr" />
                <span className="sw-tick-bl" /><span className="sw-tick-br" />
                <div className="sw-corner-mark">PITCH · A</div>
                <div className="sw-pitch-head">
                  <div className="sw-pitch-head-left">
                    <span className="sw-eyebrow">XI · {startersFilled} / 11</span>
                    <MeterChip label="OVR" value={overall} max={99} accent="chalk" />
                    <ChemMeterChip chem={chem} />
                  </div>
                  {onSubmit && (
                    <div className="sw-pitch-head-right">
                      {submitError && (
                        <span className="sw-result-err" role="alert">{submitError}</span>
                      )}
                      <button
                        type="button"
                        className="sw-result-cta"
                        disabled={!canSubmit}
                        onClick={submitResult}
                        title={
                          !allFilled
                            ? `place ${11 - startersFilled} more starter(s)`
                            : submitting
                            ? "submitting…"
                            : "lock the XI and view the result"
                        }
                      >
                        {submitting ? "FINALISING…" : `VIEW RESULT →`}
                      </button>
                    </div>
                  )}
                </div>
                <div className="sw-pitch-frame">
                  <div className="sw-pitch-wrap">
                    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" className="sw-pitch-svg">
                      <PitchLines />
                    </svg>
                    {formationDef.slots.map((slot) => {
                      const bp = starterMap.get(slot.id);
                      const dragKey = `xi:${slot.id}`;
                      const isSel = bp != null && selectedId === bp.player.id;
                      const isDragSrc = bp != null && draggingId === bp.player.id;
                      return (
                        <XISlotView
                          key={slot.id}
                          slot={slot}
                          bp={bp}
                          dragOver={dragOverKey === dragKey}
                          selected={isSel}
                          isDraggingSource={isDragSrc}
                          onDragOver={handleDragOver(dragKey)}
                          onDragLeave={handleDragLeave(dragKey)}
                          onDrop={handleDrop({ kind: "xi", slotId: slot.id })}
                          onDragStart={bp ? handleDragStart(bp) : () => {}}
                          onDragEnd={handleDragEnd}
                          onClick={() => bp && setSelectedId(bp.player.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="sw-card sw-bench-card">
                <span className="sw-tick-tl" /><span className="sw-tick-tr" />
                <span className="sw-tick-bl" /><span className="sw-tick-br" />
                <div className="sw-corner-mark">BENCH · B</div>
                <div className="sw-bench-head">
                  <span className="sw-eyebrow">BENCH · {benchFilled} / {BENCH_SIZE}</span>
                </div>
                <div className="sw-bench-strip">
                  {Array.from({ length: BENCH_SIZE }).map((_, i) => {
                    const bp = benchMap.get(i);
                    const dragKey = `bench:${i}`;
                    const isSel = bp != null && selectedId === bp.player.id;
                    const isDragSrc = bp != null && draggingId === bp.player.id;
                    return (
                      <BenchSlotView
                        key={i}
                        index={i}
                        bp={bp}
                        dragOver={dragOverKey === dragKey}
                        selected={isSel}
                        isDraggingSource={isDragSrc}
                        onDragOver={handleDragOver(dragKey)}
                        onDragLeave={handleDragLeave(dragKey)}
                        onDrop={handleDrop({ kind: "bench", index: i })}
                        onDragStart={bp ? handleDragStart(bp) : () => {}}
                        onDragEnd={handleDragEnd}
                        onClick={() => bp && setSelectedId(bp.player.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="sw-col">
              <div className="sw-card sw-pool-card">
                <span className="sw-tick-tl" /><span className="sw-tick-tr" />
                <span className="sw-tick-bl" /><span className="sw-tick-br" />
                <div className="sw-corner-mark">SIGNED · {bought.length}</div>
                <div className="sw-pool-head">
                  <span className="sw-eyebrow">BUY LIST · DRAG TO PLACE</span>
                  <span className="sw-pool-count">{unplacedCount} UNPLACED</span>
                </div>
                <div className="sw-pool-filter">
                  {(["ALL", "GK", "DEF", "MID", "ATT"] as FilterKey[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={`sw-pool-chip${filter === k ? " is-active" : ""}`}
                      onClick={() => setFilter(k)}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <div
                  className={`sw-pool-list${dragOverKey === "pool" ? " is-drag-over" : ""}`}
                  onDragOver={handleDragOver("pool")}
                  onDragLeave={handleDragLeave("pool")}
                  onDrop={handleDrop({ kind: "pool" })}
                >
                  {filteredBuys.map((bp) => (
                    <PoolRow
                      key={bp.player.id}
                      bp={bp}
                      placement={placement[bp.player.id] ?? { kind: "pool" }}
                      selected={selectedId === bp.player.id}
                      isDraggingSource={draggingId === bp.player.id}
                      onDragStart={handleDragStart(bp)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedId(bp.player.id)}
                    />
                  ))}
                  {filteredBuys.length === 0 && (
                    <div style={{ padding: 18, textAlign: "center", color: "var(--dim)", fontSize: 12 }}>
                      no signings in this band.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DossierStrip
            bp={selectedBp}
            placement={selectedPlacement}
            slot={selectedSlot}
            fit={selectedFit}
          />
        </div>
      </div>
    </>
  );
}
