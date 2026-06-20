"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ViewportGate from "../_components/ViewportGate";
import { useToast } from "../_components/Toast";
import { apiFetch, ApiError, toastFromApiError } from "../_lib/apiClient";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

type CreateMatchResp = {
  matchId: string;
  formation: string;
  difficulty?: string;
  status: string;
  lotsTotal: number;
  llmSeeded?: boolean;
};

// ─────────────────────────── difficulty data (mirrors server DIFFICULTIES) ───────────────────────────

type DifficultyName = "easy" | "medium" | "hard";

type DifficultyCard = {
  name: DifficultyName;
  /** Pundit identity (always suffixed " AI" in display). */
  pundit: string;
  /** Short tactical tag. */
  tag: string;
  /** One-line voice — what to expect at the floor. */
  blurb: string;
  /** 2-3 word punch-line distilled from the blurb. Surfaced inline in the
   *  bottom bar on viewports where the diff-card blurb is hidden, so the
   *  pundit's flavour still reaches the player on a compact screen. */
  short: string;
  /** Public asset path (under /public). */
  photo: string;
  /** Surfaces a small "RECOMMENDED" badge on the tile. The canonical experience. */
  recommended?: boolean;
};

const DIFFICULTIES: DifficultyCard[] = [
  {
    name: "easy",
    pundit: "Micah Richards AI",
    tag: "TEST HIM",
    blurb: "warm, instinctive, plays the room. balanced bidder — honest and fair on the floor.",
    short: "warm, instinctive.",
    photo: "/easy.webp",
  },
  {
    name: "medium",
    pundit: "Jamie Carragher AI",
    tag: "AGGRESSIVE",
    blurb: "fierce, opinionated. if he wants him, he SNATCHES him. won't back down on his picks.",
    short: "fierce, opinionated.",
    photo: "/medium.jpg",
  },
  {
    name: "hard",
    pundit: "Thierry Henry AI",
    tag: "GOD MODE",
    blurb: "the shark. never lets an elite walk. ruthless with the wallet. always wins.",
    short: "the shark.",
    photo: "/hard.jpg",
    recommended: true,
  },
];

// Hard is the canonical experience — full lookahead + Henry persona + every server
// cap-floor gets to flex. Easy/medium kept for lighter games.
const DEFAULT_DIFFICULTY: DifficultyName = "hard";

// ─────────────────────────── formation data (mirrors server FORMATIONS) ───────────────────────────

type Category = "GK" | "DEF" | "MID" | "ATT";

type FormationData = {
  name: string;
  label: string;
  blurb: string;
  targets: { GK: number; DEF: number; MID: number; ATT: number };
  queue:   { GK: number; DEF: number; MID: number; ATT: number };
  /** Marker positions on a vertical pitch (viewBox 0 0 100 140). Own goal at bottom (y near 134), opposition box at top (y near 15). */
  markers: Array<{ cat: Category; x: number; y: number }>;
};

const FORMATIONS: FormationData[] = [
  {
    name: "4-3-3",
    label: "THE ORTHODOXY",
    blurb: "balanced. width on both wings, three up top.",
    targets: { GK: 1, DEF: 4, MID: 3, ATT: 3 },
    queue:   { GK: 3, DEF: 12, MID: 9, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 13, y: 108 }, { cat: "DEF", x: 36, y: 112 },
      { cat: "DEF", x: 64, y: 112 }, { cat: "DEF", x: 87, y: 108 },
      { cat: "MID", x: 28, y: 75 }, { cat: "MID", x: 50, y: 70 }, { cat: "MID", x: 72, y: 75 },
      { cat: "ATT", x: 18, y: 26 }, { cat: "ATT", x: 50, y: 18 }, { cat: "ATT", x: 82, y: 26 },
    ],
  },
  {
    name: "4-4-2",
    label: "THE TWO BANKS",
    blurb: "two flat lines of four. classic strike pair up top.",
    targets: { GK: 1, DEF: 4, MID: 4, ATT: 2 },
    queue:   { GK: 3, DEF: 11, MID: 11, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 13, y: 108 }, { cat: "DEF", x: 36, y: 112 },
      { cat: "DEF", x: 64, y: 112 }, { cat: "DEF", x: 87, y: 108 },
      { cat: "MID", x: 13, y: 68 }, { cat: "MID", x: 36, y: 72 },
      { cat: "MID", x: 64, y: 72 }, { cat: "MID", x: 87, y: 68 },
      { cat: "ATT", x: 36, y: 24 }, { cat: "ATT", x: 64, y: 24 },
    ],
  },
  {
    name: "3-5-2",
    label: "THE WING-BACK",
    blurb: "wing-backs push high, midfield diamond, two strikers.",
    targets: { GK: 1, DEF: 3, MID: 5, ATT: 2 },
    queue:   { GK: 3, DEF: 9, MID: 13, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 }, { cat: "DEF", x: 72, y: 112 },
      { cat: "MID", x: 8,  y: 78 }, { cat: "MID", x: 30, y: 70 }, { cat: "MID", x: 50, y: 62 },
      { cat: "MID", x: 70, y: 70 }, { cat: "MID", x: 92, y: 78 },
      { cat: "ATT", x: 36, y: 24 }, { cat: "ATT", x: 64, y: 24 },
    ],
  },
  {
    name: "5-3-2",
    label: "THE SHELL",
    blurb: "back five, compact mid, counter-attack on two.",
    targets: { GK: 1, DEF: 5, MID: 3, ATT: 2 },
    queue:   { GK: 3, DEF: 13, MID: 9, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 8,  y: 104 }, { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 },
      { cat: "DEF", x: 72, y: 112 }, { cat: "DEF", x: 92, y: 104 },
      { cat: "MID", x: 28, y: 72 }, { cat: "MID", x: 50, y: 66 }, { cat: "MID", x: 72, y: 72 },
      { cat: "ATT", x: 36, y: 24 }, { cat: "ATT", x: 64, y: 24 },
    ],
  },
  {
    name: "3-4-3",
    label: "THE FRONT FOOT",
    blurb: "high press, three at the back, three up top.",
    targets: { GK: 1, DEF: 3, MID: 4, ATT: 3 },
    queue:   { GK: 3, DEF: 9, MID: 12, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 }, { cat: "DEF", x: 72, y: 112 },
      { cat: "MID", x: 13, y: 68 }, { cat: "MID", x: 36, y: 72 },
      { cat: "MID", x: 64, y: 72 }, { cat: "MID", x: 87, y: 68 },
      { cat: "ATT", x: 18, y: 26 }, { cat: "ATT", x: 50, y: 18 }, { cat: "ATT", x: 82, y: 26 },
    ],
  },
  {
    name: "4-2-3-1",
    label: "THE MODERN",
    blurb: "two holding, three behind a lone striker.",
    targets: { GK: 1, DEF: 4, MID: 5, ATT: 1 },
    queue:   { GK: 3, DEF: 11, MID: 11, ATT: 10 },
    markers: [
      { cat: "GK",  x: 50, y: 134 },
      { cat: "DEF", x: 13, y: 108 }, { cat: "DEF", x: 36, y: 112 },
      { cat: "DEF", x: 64, y: 112 }, { cat: "DEF", x: 87, y: 108 },
      { cat: "MID", x: 35, y: 86 }, { cat: "MID", x: 65, y: 86 },
      { cat: "MID", x: 18, y: 48 }, { cat: "MID", x: 50, y: 44 }, { cat: "MID", x: 82, y: 48 },
      { cat: "ATT", x: 50, y: 22 },
    ],
  },
];

const DEFAULT_FORMATION = "4-3-3";

// ─────────────────────────── design tokens (mirror AuctionRoom) ───────────────────────────

const tokens = `

  html, body { margin: 0; padding: 0; height: 100%; }

  .sw-chalkboard {
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

    --font-display: var(--font-saira), 'Arial Narrow', sans-serif;
    --font-body: var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-jetbrains), ui-monospace, Menlo, Consolas, monospace;

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
  .sw-chalkboard *, .sw-chalkboard *::before, .sw-chalkboard *::after { box-sizing: border-box; }
  .sw-chalkboard button { font-family: inherit; cursor: pointer; }
  .sw-chalkboard button:disabled { opacity: 0.5; cursor: not-allowed; }

  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

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

  .sw-btn-bid {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-size: 13px;
    padding: 13px 18px;
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    border-radius: var(--r-md);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 6px 18px rgba(242, 237, 224, 0.18);
    width: 100%;
    transition: background 0.12s ease, transform 0.05s ease;
  }
  .sw-btn-bid:hover:not(:disabled) { background: #FFFCF2; }
  .sw-btn-bid:active:not(:disabled) { transform: translateY(1px); }
  .sw-btn-bid:disabled {
    background: var(--surface-3);
    color: var(--dim);
    border-color: var(--hairline);
    box-shadow: none;
  }

  /* the chalk pitch */
  .sw-pitch-svg { display: block; width: 100%; height: 100%; }
  .sw-pitch-line { stroke: var(--chalk-soft); stroke-width: 0.35; fill: none; }
  .sw-pitch-line-strong { stroke: rgba(242, 237, 224, 0.18); stroke-width: 0.4; fill: none; }
  .sw-pitch-spot { fill: rgba(242, 237, 224, 0.30); }

  @keyframes sw-chalk-on {
    0%   { opacity: 0; transform: scale(0.4); }
    60%  { opacity: 1; }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes sw-tick-in {
    0%   { transform: translateY(-12px); opacity: 0; clip-path: inset(0 0 100% 0); }
    100% { transform: translateY(0); opacity: 1; clip-path: inset(0 0 0% 0); }
  }
  .sw-tick { animation: sw-tick-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }

  /* top bar */
  .sw-top {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 4px 8px;
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
  .sw-status-strip {
    display: flex; align-items: center; gap: 12px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--dim); letter-spacing: 0.08em;
  }
  .sw-status-ok { color: var(--chalk-dim); }
  .sw-status-bad { color: var(--whistle); }

  /* hero header — thin one-liner */
  .sw-hero {
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
    padding: 0 4px 8px;
    flex: 0 0 auto;
  }
  .sw-hero h1 {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 22px;
    letter-spacing: 0.16em;
    color: var(--chalk);
    text-transform: uppercase;
    margin: 0;
    line-height: 1;
  }
  .sw-hero-sub {
    font-family: var(--font-body);
    font-size: 12px; color: var(--muted);
  }

  /* main 2-col grid — fills remaining viewport */
  .sw-board-grid {
    display: grid;
    grid-template-columns: minmax(420px, 1.45fr) minmax(340px, 1fr);
    gap: 10px;
    flex: 1; min-height: 0;
  }
  @media (max-width: 1080px) {
    .sw-board-grid { grid-template-columns: 1fr; }
  }
  .sw-board-left, .sw-board-right {
    display: flex; flex-direction: column; gap: 10px;
    min-width: 0; min-height: 0;
  }
  /* Hard clip — content is now sized to fit at every viewport via clamp() +
     breakpoint compression, so any residual overflow is a layout bug to fix,
     not something to silently scroll past. */
  .sw-board-right { overflow: hidden; }

  /* big pitch card */
  .sw-pitch-card {
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 12px 14px 12px;
    position: relative;
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
  }
  .sw-pitch-frame {
    flex: 1; min-height: 0;
    background:
      radial-gradient(ellipse 60% 35% at 50% 70%, rgba(242, 237, 224, 0.025), transparent 70%),
      var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
    padding: 6px;
    margin: 6px 0 8px;
    display: flex; justify-content: center; align-items: stretch;
  }
  .sw-pitch-wrap {
    height: 100%;
    aspect-ratio: 100 / 140;
    max-width: 100%;
    position: relative;
  }
  .sw-formation-bar {
    display: flex; align-items: baseline; gap: 12px;
    flex: 0 0 auto;
  }
  .sw-fn-big {
    font-family: var(--font-display);
    font-size: 30px; font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--chalk);
    line-height: 1;
  }
  .sw-fn-label {
    font-family: var(--font-display);
    font-size: 12px; font-weight: 700;
    letter-spacing: 0.20em;
    color: var(--floodlight);
    text-transform: uppercase;
  }
  .sw-formation-blurb {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--muted);
    margin-top: 2px;
    line-height: 1.4;
  }

  /* tile grid */
  .sw-tiles {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
  }
  @media (max-width: 1080px) {
    .sw-tiles { grid-template-columns: 1fr 1fr; }
  }
  .sw-tile {
    position: relative;
    background: var(--surface-1);
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--r-md);
    padding: 7px 7px 8px;
    display: flex; flex-direction: column; gap: 3px;
    cursor: pointer;
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .sw-tile:hover {
    border-style: solid;
    border-color: var(--chalk-soft);
    background: #161F2C;
  }
  .sw-tile.is-selected {
    background: var(--chalk);
    border: 1px solid var(--chalk);
    color: var(--ink);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 4px 14px rgba(242, 237, 224, 0.14);
  }
  .sw-tile-mini {
    width: 100%;
    aspect-ratio: 100 / 140;
    display: block;
    /* Fluid cap: shrinks with viewport so two rows of tiles always leave
       headroom for queue + diff cards below. 9vh ≈ 86px at 960h, 72px at 800h, 54px at 600h. */
    max-height: clamp(54px, 9vh, 100px);
  }
  .sw-tile-name {
    font-family: var(--font-mono);
    font-size: 11px; font-weight: 700;
    color: var(--text);
    margin-top: 1px;
    line-height: 1;
  }
  .sw-tile-label {
    font-family: var(--font-display);
    font-size: 8px; font-weight: 700;
    letter-spacing: 0.20em;
    color: var(--muted);
    text-transform: uppercase;
    line-height: 1;
  }
  .sw-tile.is-selected .sw-tile-name { color: var(--ink); }
  .sw-tile.is-selected .sw-tile-label { color: rgba(11, 16, 24, 0.65); }

  /* readout panel */
  .sw-readout {
    flex: 1; min-height: 0;
    padding: 12px 14px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .sw-readout-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
    padding: 5px 0;
    border-bottom: 1px solid var(--hairline);
  }
  .sw-readout-row:last-child { border-bottom: none; }
  .sw-readout-key {
    font-family: var(--font-display);
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.20em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .sw-readout-val {
    font-family: var(--font-mono);
    font-size: 13px; font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
    text-align: right;
  }

  /* queue composition strip */
  .sw-queue-card {
    flex: 0 0 auto;
    padding: 12px 14px;
  }
  .sw-queue-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
    gap: 12px;
  }
  .sw-eyebrow-with-info {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  /* info icon */
  .sw-info-btn {
    width: 22px; height: 22px;
    border-radius: 50%;
    background: transparent;
    border: 1.5px solid var(--chalk-dim);
    color: var(--chalk);
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 13px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    padding: 0;
    position: relative;
    transition: color 0.12s, border-color 0.12s, background 0.12s, transform 0.12s;
    flex: 0 0 auto;
  }
  .sw-info-btn::before {
    /* ambient chalk-halo pulse — draws the eye without bouncing the icon */
    content: "";
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(242,237,224,0.22), transparent 65%);
    animation: sw-info-pulse 1.8s ease-in-out infinite;
    pointer-events: none;
    z-index: -1;
  }
  .sw-info-btn::after {
    /* outer ring for extra signal */
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 1px solid rgba(242,237,224,0.18);
    animation: sw-info-pulse 1.8s ease-in-out infinite;
    pointer-events: none;
  }
  .sw-info-btn:hover, .sw-info-btn:focus-visible, .sw-info-btn.is-open {
    color: var(--ink);
    background: var(--chalk);
    border-color: var(--chalk);
    outline: none;
    transform: scale(1.06);
  }
  .sw-info-btn:hover::before, .sw-info-btn.is-open::before,
  .sw-info-btn:hover::after, .sw-info-btn.is-open::after {
    animation-play-state: paused;
    opacity: 0;
  }
  @keyframes sw-info-pulse {
    0%, 100% { opacity: 0.55; transform: scale(0.92); }
    50%      { opacity: 1;    transform: scale(1.18); }
  }

  /* info popover */
  .sw-info-popover {
    position: absolute;
    top: calc(100% + 10px);
    left: -12px;
    z-index: 20;
    width: 290px;
    background: var(--surface-2);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    padding: 11px 13px 12px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4);
    animation: sw-tick-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sw-info-popover::before {
    /* little chalk arrow pointing up to the icon */
    content: "";
    position: absolute;
    top: -5px; left: 18px;
    width: 9px; height: 9px;
    background: var(--surface-2);
    border-top: 1px solid var(--hairline-strong);
    border-left: 1px solid var(--hairline-strong);
    transform: rotate(45deg);
  }
  .sw-info-popover .sw-info-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: var(--chalk-dim);
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .sw-info-popover p {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--text);
    line-height: 1.5;
    margin: 0;
  }
  .sw-info-popover p + p { margin-top: 6px; color: var(--muted); }
  .sw-info-popover strong {
    color: var(--chalk);
    font-weight: 700;
  }
  .sw-queue-total {
    font-family: var(--font-mono);
    font-size: 12px; font-weight: 700;
    color: var(--text);
    letter-spacing: 0.04em;
  }
  .sw-queue-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .sw-queue-cell {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-top: 2px solid currentColor;
    border-radius: var(--r-sm);
    padding: 8px 4px 6px;
    text-align: center;
    display: flex; flex-direction: column; gap: 2px;
  }
  .sw-queue-cell-label {
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    line-height: 1;
  }
  .sw-queue-cell-num {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 20px;
    color: var(--text);
    letter-spacing: 0;
    line-height: 1.1;
  }
  .sw-queue-cell-tag {
    font-family: var(--font-display);
    font-size: 8px; font-weight: 700;
    letter-spacing: 0.10em;
    color: var(--dim);
    text-transform: uppercase;
    line-height: 1;
  }

  /* difficulty card row */
  .sw-diff-card {
    flex: 0 0 auto;
    padding: 12px 14px;
  }
  .sw-diff-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 8px; gap: 12px;
  }
  .sw-diff-headline {
    font-family: var(--font-mono);
    font-size: 11px; font-weight: 700;
    color: var(--text);
    letter-spacing: 0.02em;
  }
  .sw-diff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 7px;
  }
  .sw-diff-tile {
    position: relative;
    background: var(--surface-2);
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--r-md);
    padding: 8px 8px 10px;
    display: flex; flex-direction: column; gap: 5px;
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s ease, background 0.12s ease, transform 0.12s ease;
    color: inherit;
    overflow: hidden;
  }
  .sw-diff-tile:hover {
    border-style: solid;
    border-color: var(--chalk-soft);
    background: #161F2C;
  }
  .sw-diff-tile.is-selected {
    /* pure sharp chalk — no warm cream wash; brighter than tile-default */
    background: #FFFFFF;
    border: 1px solid #FFFFFF;
    color: var(--ink);
    box-shadow:
      0 0 0 1.5px var(--ink),
      0 0 0 3px var(--chalk),
      0 8px 22px rgba(242, 237, 224, 0.22);
  }
  .sw-diff-tile.is-selected .sw-diff-pundit { color: var(--ink); }
  .sw-diff-tile.is-selected .sw-diff-tag    { color: var(--whistle); }
  .sw-diff-tile.is-selected .sw-diff-blurb  { color: rgba(11, 16, 24, 0.78); }
  .sw-diff-portrait {
    position: relative;
    width: 100%;
    /* Fluid height (replaces the rigid 4:3 lock + per-breakpoint pixel
       override). Scales smoothly with viewport so the whole right-column
       stack fits without snapping. 13vh ≈ 125px at 960h, 104px at 800h,
       78px at 600h. Capped both ends so portraits stay flattering and the
       diff card always leaves breathing room for the bottom bar. */
    height: clamp(74px, 13vh, 168px);
    overflow: hidden;
    border-radius: var(--r-sm);
    background: var(--surface-3);
    border: 1px solid var(--hairline);
  }
  .sw-diff-portrait img {
    width: 100%; height: 100%;
    object-fit: cover;
    /* All three pundit photos have the head in the upper portion of the source
       image. Default 50%/50% centering crops the top of the head. 30% nudges
       the visible window upward so faces stay framed at any aspect ratio. */
    object-position: 50% 30%;
    display: block;
    filter: grayscale(0.10) contrast(1.05);
    transition: filter 0.18s ease;
  }
  .sw-diff-tile.is-selected .sw-diff-portrait {
    border-color: rgba(11, 16, 24, 0.55);
  }
  .sw-diff-tile.is-selected .sw-diff-portrait img {
    filter: brightness(1.05) contrast(1.10) saturate(1.05);
  }
  .sw-diff-portrait::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(180deg, transparent 55%, rgba(11,16,24,0.55) 100%);
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  /* no dark wash on selected — let the portrait stay crisp */
  .sw-diff-tile.is-selected .sw-diff-portrait::after { opacity: 0; }
  .sw-diff-tag {
    font-family: var(--font-display);
    font-size: 9px; font-weight: 800;
    letter-spacing: 0.22em;
    color: var(--floodlight);
    text-transform: uppercase;
    line-height: 1;
  }
  .sw-diff-pundit {
    font-family: var(--font-mono);
    font-size: 12px; font-weight: 700;
    color: var(--text);
    line-height: 1.1;
  }
  .sw-diff-blurb {
    font-family: var(--font-body);
    font-size: 10.5px;
    color: var(--muted);
    line-height: 1.35;
    /* clip to 2 lines without imposing a hard min-height so layout stays tight */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* "RECOMMENDED" badge on the canonical-experience tile (hard). Floodlight
     reads well against both the dark default tile bg and the chalk selected bg. */
  .sw-diff-recommended {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 3;
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 8px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ink);
    background: var(--floodlight);
    padding: 3px 6px 2px;
    border-radius: var(--r-sm);
    line-height: 1;
    box-shadow: 0 2px 10px rgba(255, 182, 39, 0.35);
    pointer-events: none;
  }
  .sw-diff-tile.is-selected .sw-diff-recommended {
    /* on the chalk-bright selected tile, keep the badge legible by deepening it */
    box-shadow: 0 2px 12px rgba(255, 182, 39, 0.55), 0 0 0 1px rgba(11, 16, 24, 0.20);
  }

  /* bottom bar — pinned commit row */
  .sw-bottom-bar {
    flex: 0 0 auto;
    margin-top: 10px;
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 11px 14px;
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 16px;
  }
  .sw-bottom-summary {
    display: flex; flex-direction: column; gap: 4px; min-width: 0;
  }
  .sw-bottom-line-1 {
    display: flex;
    align-items: center;
    gap: 14px;
    font-family: var(--font-display);
    font-size: 13px; font-weight: 800;
    letter-spacing: 0.10em;
    color: var(--chalk);
    text-transform: uppercase;
    line-height: 1.1;
    flex-wrap: wrap;
  }
  .sw-bottom-line-1 .sep {
    color: var(--dim);
    padding: 0 8px;
    font-weight: 500;
  }
  .sw-bottom-line-1 .accent { color: var(--floodlight); }

  /* meta chunk on the right of line-1 — visually distinct so it doesn't
     blur into the formation phrase */
  .sw-bottom-divider {
    width: 1px;
    height: 18px;
    background: var(--chalk-dim);
    display: inline-block;
    flex: 0 0 auto;
  }
  .sw-bottom-meta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }
  .sw-bottom-meta .opp-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.30em;
    color: var(--dim);
    text-transform: uppercase;
  }
  .sw-bottom-meta .opp-tag {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: var(--whistle);
    text-transform: uppercase;
    background: var(--whistle-soft);
    border: 1px solid rgba(230, 57, 70, 0.30);
    border-radius: var(--r-sm);
    padding: 3px 7px 2px;
    line-height: 1;
  }
  .sw-bottom-meta .opp-pundit {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text);
    text-transform: none;
  }
  /* Punch-line distilled from the pundit blurb. Hidden by default; surfaces
     only on shorter viewports (≤820h) where the full blurb in the diff card
     is dropped — gives the laptop view its flavour back without overloading
     the bottom bar on big screens. Quiet body italic so it grace-notes
     instead of competing with the opp-pundit name. */
  .sw-bottom-meta .opp-flavor {
    display: none;
    font-family: var(--font-body);
    font-style: italic;
    font-weight: 500;
    font-size: 10.5px;
    letter-spacing: 0.01em;
    color: var(--muted);
    text-transform: lowercase;
    padding-left: 8px;
    border-left: 1px solid var(--hairline-strong);
    margin-left: 2px;
    line-height: 1.1;
  }
  .sw-bottom-line-2 {
    font-family: var(--font-body);
    font-size: 11px;
    color: var(--muted);
    line-height: 1.3;
  }
  .sw-bottom-cta {
    min-width: 240px;
  }
  .sw-bottom-cta .sw-btn-bid {
    width: 100%;
    padding: 14px 22px;
    font-size: 14px;
  }
  .sw-commit-err {
    grid-column: 1 / -1;
    margin-top: 6px;
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--whistle);
    background: var(--whistle-soft);
    border: 1px solid rgba(230, 57, 70, 0.30);
    border-radius: var(--r-sm);
    padding: 7px 9px;
  }

  /* ─── Responsive: laptop heights (≤820px). The locked 100vh layout was
     pushing the bottom bar off-screen because the chain (top · main · diff
     card · commit bar) summed to more than the viewport. Compress paddings +
     font sizes so the whole stack fits. For pundit portraits: drop the 4:3
     aspect lock, give them an explicit shorter height, and use
     object-position: 50% 25% so the FACE/HEAD stays visible — only the
     shoulders/mic get cropped. ─── */
  @media (max-height: 820px) {
    .sw-chalkboard { padding: 8px 12px; }

    .sw-tile { padding: 6px 6px 7px; gap: 2px; }
    .sw-readout { padding: 10px 12px; gap: 7px; }

    .sw-queue-card { padding: 9px 12px; }
    .sw-queue-head { margin-bottom: 6px; }
    .sw-queue-cell { padding: 6px 4px 5px; }
    .sw-queue-cell-num { font-size: 17px; }

    .sw-diff-card { padding: 9px 12px; }
    .sw-diff-head { margin-bottom: 6px; }
    .sw-diff-grid { gap: 6px; }
    .sw-diff-tile { padding: 6px 6px 8px; gap: 4px; }
    .sw-diff-portrait img {
      object-position: 50% 25%; /* face stays framed; only mic/shoulders crop */
    }
    /* Blurb is the lowest-value diff-card content (the tag + face + name + the
       opponent line in the bottom bar already communicate the pick). Drop it on
       shorter viewports so portraits + names stay fully visible without scroll. */
    .sw-diff-blurb { display: none; }
    .sw-diff-pundit { font-size: 11px; }
    .sw-diff-tag { font-size: 8.5px; }

    .sw-bottom-bar { padding: 8px 12px; margin-top: 8px; }
    .sw-bottom-cta { min-width: 200px; }
    .sw-bottom-cta .sw-btn-bid { padding: 11px 18px; font-size: 13px; }
    .sw-bottom-line-1 { font-size: 12px; gap: 10px; }
    .sw-bottom-line-2 { font-size: 10.5px; }

    /* Flavour tag becomes visible on the laptop breakpoint — this is where
       we hid the in-card blurb, so the bottom bar carries the voice instead. */
    .sw-bottom-meta .opp-flavor { display: inline-block; }
  }
  /* Even tighter for very short laptops (~720p) — same shape, smaller numbers. */
  @media (max-height: 720px) {
    .sw-chalkboard { padding: 6px 10px; }
    .sw-diff-card { padding: 7px 10px; }
    .sw-queue-card { padding: 7px 10px; }
    .sw-queue-cell-num { font-size: 15px; }
    .sw-bottom-bar { padding: 7px 10px; margin-top: 6px; }
    .sw-bottom-cta .sw-btn-bid { padding: 9px 14px; font-size: 12px; }
  }

  /* ─── Tablet (≤900px wide) — collapse the two-column main grid to a single
     column so the formation tiles + readout don't fight for width. Bottom bar
     stacks. ViewportGate handles below 600px wide and shows a rotate hint for
     600-1023 portrait. This rule only kicks in if the user dismissed the hint
     and continued in portrait. ─── */
  @media (max-width: 900px) {
    .sw-board-grid { grid-template-columns: 1fr; }
    .sw-bottom-bar { grid-template-columns: 1fr; gap: 10px; }
    .sw-bottom-cta { min-width: 0; }
    .sw-bottom-cta .sw-btn-bid { width: 100%; }
  }
`;

// ─────────────────────────── helpers ───────────────────────────

function categoryStroke(cat: Category): string {
  switch (cat) {
    case "ATT": return "var(--whistle)";
    case "MID": return "var(--floodlight)";
    case "DEF": return "var(--keeper-blue)";
    case "GK":  return "var(--chalk)";
  }
}
function categoryLetter(cat: Category): string {
  return cat[0];
}
function categoryFullName(cat: Category): string {
  return { GK: "GOALKEEPERS", DEF: "DEFENDERS", MID: "MIDFIELDERS", ATT: "ATTACKERS" }[cat];
}
function markerDelayMs(cat: Category, indexInCat: number): number {
  const base = { GK: 0, DEF: 80, MID: 220, ATT: 360 }[cat];
  return base + indexInCat * 40;
}
function fmtBuckets(b: { GK: number; DEF: number; MID: number; ATT: number }): string {
  return `${b.GK}-${b.DEF}-${b.MID}-${b.ATT}`;
}
function queueTotal(q: FormationData["queue"]): number {
  return q.GK + q.DEF + q.MID + q.ATT;
}

// ─────────────────────────── pitch SVG ───────────────────────────

function PitchLines() {
  return (
    <g>
      <rect x="2" y="2" width="96" height="136" className="sw-pitch-line-strong" />
      <line x1="2" y1="70" x2="98" y2="70" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="11" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="0.9" className="sw-pitch-spot" />
      {/* top (opposition) penalty area + goal area + spot + goal line */}
      <rect x="22" y="2" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="2" width="28" height="9" className="sw-pitch-line" />
      <circle cx="50" cy="15" r="0.7" className="sw-pitch-spot" />
      <line x1="42" y1="2" x2="58" y2="2" stroke="rgba(242,237,224,0.30)" strokeWidth="0.6" />
      {/* bottom (own) penalty area + goal area + spot + goal line */}
      <rect x="22" y="118" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="129" width="28" height="9" className="sw-pitch-line" />
      <circle cx="50" cy="125" r="0.7" className="sw-pitch-spot" />
      <line x1="42" y1="138" x2="58" y2="138" stroke="rgba(242,237,224,0.30)" strokeWidth="0.6" />
      {/* corner arcs */}
      <path d="M 2 4 A 2 2 0 0 1 4 2" className="sw-pitch-line" />
      <path d="M 96 2 A 2 2 0 0 1 98 4" className="sw-pitch-line" />
      <path d="M 2 136 A 2 2 0 0 0 4 138" className="sw-pitch-line" />
      <path d="M 96 138 A 2 2 0 0 0 98 136" className="sw-pitch-line" />
    </g>
  );
}

function Marker({
  cat, x, y, r, withLabel, delayMs,
}: {
  cat: Category; x: number; y: number; r: number;
  withLabel: boolean; delayMs: number;
}) {
  const stroke = categoryStroke(cat);
  return (
    <g
      style={{
        transformOrigin: `${x}px ${y}px`,
        transformBox: "fill-box",
        animation: `sw-chalk-on 0.46s cubic-bezier(0.2, 0.8, 0.2, 1) ${delayMs}ms both`,
      }}
    >
      <circle cx={x} cy={y} r={r + 1.2} fill="transparent" stroke={stroke} strokeOpacity={0.30} strokeWidth={0.8} />
      <circle cx={x} cy={y} r={r} fill="var(--chalk)" stroke={stroke} strokeWidth={1.1} />
      {withLabel && (
        <text
          x={x} y={y + r * 0.42} textAnchor="middle"
          fontFamily="var(--font-display)" fontWeight={800}
          fontSize={r * 1.25} letterSpacing={0.04}
          fill="var(--ink)"
        >
          {categoryLetter(cat)}
        </text>
      )}
    </g>
  );
}

function BigPitch({ formation }: { formation: FormationData }) {
  const indexed = useMemo(() => {
    const counts: Record<Category, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    return formation.markers.map((m) => {
      const i = counts[m.cat]++;
      return { ...m, indexInCat: i };
    });
  }, [formation]);
  return (
    <svg
      viewBox="0 0 100 140"
      preserveAspectRatio="xMidYMid meet"
      className="sw-pitch-svg"
      key={formation.name}
    >
      <PitchLines />
      {indexed.map((m, i) => (
        <Marker key={i} cat={m.cat} x={m.x} y={m.y} r={3.8} withLabel delayMs={markerDelayMs(m.cat, m.indexInCat)} />
      ))}
    </svg>
  );
}

function MiniPitch({ formation, selected }: { formation: FormationData; selected: boolean }) {
  const lineColor = selected ? "rgba(11, 16, 24, 0.28)" : "var(--chalk-soft)";
  return (
    <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" className="sw-tile-mini">
      <g>
        <rect x="3" y="3" width="94" height="134" fill="none" stroke={lineColor} strokeWidth="0.5" />
        <line x1="3" y1="70" x2="97" y2="70" stroke={lineColor} strokeWidth="0.5" />
        <circle cx="50" cy="70" r="9" fill="none" stroke={lineColor} strokeWidth="0.5" />
        <rect x="24" y="3" width="52" height="17" fill="none" stroke={lineColor} strokeWidth="0.5" />
        <rect x="24" y="120" width="52" height="17" fill="none" stroke={lineColor} strokeWidth="0.5" />
      </g>
      {formation.markers.map((m, i) => (
        <circle
          key={i} cx={m.x} cy={m.y} r={2.7}
          fill={selected ? "var(--ink)" : "var(--chalk)"}
          stroke={selected ? "transparent" : categoryStroke(m.cat)}
          strokeWidth={selected ? 0 : 0.9}
        />
      ))}
    </svg>
  );
}

function FormationTile({ formation, selected, onSelect, disabled }: {
  formation: FormationData; selected: boolean; onSelect: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`sw-tile${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
    >
      <MiniPitch formation={formation} selected={selected} />
      <div className="sw-tile-name">{formation.name}</div>
      <div className="sw-tile-label">{formation.label}</div>
    </button>
  );
}

// ─────────────────────────── queue composition strip ───────────────────────────

function QueueCell({ cat, count }: { cat: Category; count: number }) {
  return (
    <div className="sw-queue-cell" style={{ color: categoryStroke(cat) }}>
      <span className="sw-queue-cell-label">{cat}</span>
      <span className="sw-queue-cell-num">{count}</span>
      <span className="sw-queue-cell-tag">{categoryFullName(cat)}</span>
    </div>
  );
}

// ─────────────────────────── difficulty tile ───────────────────────────

function DifficultyTile({
  diff, selected, onSelect, disabled,
}: {
  diff: DifficultyCard; selected: boolean; onSelect: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`sw-diff-tile${selected ? " is-selected" : ""}`}
      aria-pressed={selected}
      aria-label={`${diff.tag} — ${diff.pundit} AI${diff.recommended ? " (recommended)" : ""}`}
    >
      {diff.recommended && <span className="sw-diff-recommended">RECOMMENDED</span>}
      <div className="sw-diff-portrait">
        {/* plain <img>: assets live under /public so the relative path resolves at root */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={diff.photo} alt={`${diff.pundit} portrait`} />
      </div>
      <div className="sw-diff-tag">{diff.tag}</div>
      <div className="sw-diff-pundit">{diff.pundit}</div>
      <div className="sw-diff-blurb">{diff.blurb}</div>
    </button>
  );
}

// ─────────────────────────── page ───────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const { push } = useToast();
  const [selected, setSelected] = useState<string>(DEFAULT_FORMATION);
  const [difficulty, setDifficulty] = useState<DifficultyName>(DEFAULT_DIFFICULTY);
  const [health, setHealth] = useState<"loading" | "ok" | "bad">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // queue-composition info popover — hover OR click toggles
  const [infoHover, setInfoHover] = useState(false);
  const [infoClicked, setInfoClicked] = useState(false);
  const infoOpen = infoHover || infoClicked;

  const formation = useMemo(
    () => FORMATIONS.find((f) => f.name === selected) ?? FORMATIONS[0],
    [selected]
  );
  const diffCard = useMemo(
    () => DIFFICULTIES.find((d) => d.name === difficulty) ?? DIFFICULTIES[0],
    [difficulty]
  );

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/health`, { credentials: "include" })
      .then((r) => r.json())
      .then(() => { if (!cancelled) setHealth("ok"); })
      .catch(() => { if (!cancelled) setHealth("bad"); });
    return () => { cancelled = true; };
  }, []);

  async function takeToTheFloor() {
    if (busy) return;
    setBusy(true);
    setError(null);
    console.log(
      `[CLIENT:createMatch] requesting POST /api/match formation=${selected} difficulty=${difficulty}`
    );
    const t0 = performance.now();
    try {
      const data = await apiFetch<CreateMatchResp>(`${BACKEND_URL}/api/match`, {
        method: "POST",
        body: JSON.stringify({ formation: selected, difficulty }),
      });
      const ms = Math.round(performance.now() - t0);
      console.log(
        `[CLIENT:createMatch] ${ms}ms → matchId=${data.matchId} formation=${data.formation} ` +
          `difficulty=${data.difficulty ?? "?"} llmSeeded=${data.llmSeeded}`
      );
      router.push(`/auctionroom/${encodeURIComponent(data.matchId)}`);
    } catch (e) {
      console.error("[CLIENT:createMatch] FAILED", e);
      // Toast surfaces the real reason (429 rate limit, Zod validation, 5xx,
      // network). Keep the inline error visible too — it sits next to the
      // commit button and tells the user the form didn't submit.
      toastFromApiError(e, push);
      const msg =
        e instanceof ApiError
          ? e.body.message ?? e.body.error ?? `Failed (${e.status})`
          : String(e);
      setError(msg);
      setBusy(false);
    }
  }

  const qTotal = queueTotal(formation.queue);

  return (
    <ViewportGate pageLabel="MATCH SETUP">
      <style>{tokens}</style>
      <div className="sw-chalkboard">
        {/* top bar */}
        <div className="sw-top">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link href="/" className="sw-btn" aria-label="back to landing">
              ← BACK
            </Link>
            <div>
              <div className="sw-brand">SQUADWARS</div>
              <div className="sw-brand-tag">LIVE FOOTBALL AUCTION · SOLO VS AI</div>
            </div>
          </div>
          <div className="sw-status-strip">
            <span>
              BACKEND&nbsp;
              <span className={health === "ok" ? "sw-status-ok" : health === "bad" ? "sw-status-bad" : ""}>
                {health === "ok" ? "ONLINE" : health === "bad" ? "OFFLINE" : "…"}
              </span>
            </span>
          </div>
        </div>

        {/* hero header */}
        <div className="sw-hero">
          <h1>CHALK THE LINE</h1>
          <span className="sw-hero-sub">
            pick the shape the house will fill in tonight&apos;s auction.
          </span>
        </div>

        {/* main grid */}
        <div className="sw-board-grid">
          {/* ───── LEFT: big chalk pitch ───── */}
          <div className="sw-board-left">
            <div className="sw-pitch-card">
              <span className="sw-tick-tl" /><span className="sw-tick-tr" />
              <span className="sw-tick-bl" /><span className="sw-tick-br" />
              <div className="sw-corner-mark">CHALKBOARD · A</div>
              <div className="sw-eyebrow">XI · SHAPE PREVIEW</div>

              <div className="sw-pitch-frame">
                <div className="sw-pitch-wrap">
                  <BigPitch formation={formation} />
                </div>
              </div>

              <div className="sw-formation-bar">
                <span className="sw-fn-big sw-mono">{formation.name}</span>
                <span className="sw-fn-label">{formation.label}</span>
              </div>
              <div className="sw-formation-blurb">{formation.blurb}</div>
            </div>
          </div>

          {/* ───── RIGHT: tiles + queue composition + commit ───── */}
          <div className="sw-board-right">
            {/* tile grid card */}
            <div className="sw-card">
              <span className="sw-tick-tl" /><span className="sw-tick-tr" />
              <span className="sw-tick-bl" /><span className="sw-tick-br" />
              <div className="sw-corner-mark">BOARD · B</div>
              <div className="sw-eyebrow" style={{ marginBottom: 8 }}>FORMATION · PICK ONE</div>
              <div className="sw-tiles">
                {FORMATIONS.map((f) => (
                  <FormationTile
                    key={f.name}
                    formation={f}
                    selected={f.name === selected}
                    onSelect={() => setSelected(f.name)}
                    disabled={busy}
                  />
                ))}
              </div>
            </div>

            {/* queue composition card */}
            <div className="sw-card sw-queue-card">
              <span className="sw-tick-tl" /><span className="sw-tick-tr" />
              <span className="sw-tick-bl" /><span className="sw-tick-br" />
              <div className="sw-corner-mark"></div>
              <div className="sw-queue-head">
                <div
                  className="sw-eyebrow-with-info"
                  onMouseEnter={() => setInfoHover(true)}
                  onMouseLeave={() => setInfoHover(false)}
                >
                  <span className="sw-eyebrow">QUEUE COMPOSITION</span>
                  <button
                    type="button"
                    className={`sw-info-btn${infoOpen ? " is-open" : ""}`}
                    onClick={() => setInfoClicked((v) => !v)}
                    onFocus={() => setInfoHover(true)}
                    onBlur={() => setInfoHover(false)}
                    aria-expanded={infoOpen}
                    aria-label="about queue composition — pre-match only"
                    title="pre-match only"
                  >
                    i
                  </button>
                  {infoOpen && (
                    <div className="sw-info-popover" role="dialog">
                      <div className="sw-info-eyebrow">PRE-MATCH ONLY</div>
                      <p>
                        these counts show you the <strong>auction queue makeup</strong>{" "}
                        — how many goalkeepers, defenders, midfielders, and attackers
                        will come up tonight.
                      </p>
                      <p>
                        once you take the floor, lots open one at a time. the rest of
                        the queue stays hidden until each one comes up. you only see
                        this view here.
                      </p>
                    </div>
                  )}
                </div>
                <div className="sw-queue-total sw-mono" key={`qt-${formation.name}`}>
                  {qTotal} LOTS · XI {fmtBuckets(formation.targets)}
                </div>
              </div>
              <div className="sw-queue-grid" key={`qg-${formation.name}`}>
                <QueueCell cat="GK"  count={formation.queue.GK} />
                <QueueCell cat="DEF" count={formation.queue.DEF} />
                <QueueCell cat="MID" count={formation.queue.MID} />
                <QueueCell cat="ATT" count={formation.queue.ATT} />
              </div>
            </div>

            {/* difficulty card — replaces the old commit card; take-to-floor lives in the bottom bar */}
            <div className="sw-card sw-diff-card">
              <span className="sw-tick-tl" /><span className="sw-tick-tr" />
              <span className="sw-tick-bl" /><span className="sw-tick-br" />
              <div className="sw-corner-mark"></div>
              <div className="sw-diff-head">
                <span className="sw-eyebrow">PICK YOUR AI PUNDIT AS OPPONENT</span>
                <span className="sw-diff-headline sw-mono">
                  {diffCard.pundit.toUpperCase()}
                </span>
              </div>
              <div className="sw-diff-grid">
                {DIFFICULTIES.map((d) => (
                  <DifficultyTile
                    key={d.name}
                    diff={d}
                    selected={d.name === difficulty}
                    onSelect={() => setDifficulty(d.name)}
                    disabled={busy}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* bottom bar — pinned take-to-floor strip */}
        <div className="sw-bottom-bar">
          <span className="sw-tick-tl" /><span className="sw-tick-tr" />
          <span className="sw-tick-bl" /><span className="sw-tick-br" />
          <div className="sw-bottom-summary">
            <div className="sw-bottom-line-1">
              <span>{formation.name}</span>
              <span className="sep">·</span>
              <span className="accent">{formation.label}</span>
              <span className="sw-bottom-divider" aria-hidden />
              <span className="sw-bottom-meta">
                <span className="opp-eyebrow">VS</span>
                <span className="opp-tag">{diffCard.tag}</span>
                <span className="opp-pundit">{diffCard.pundit}</span>
                <span className="opp-flavor" aria-hidden>{diffCard.short}</span>
              </span>
            </div>
            <div className="sw-bottom-line-2">
              {busy
                ? "the house is seeding the AI cap plan via DeepSeek — usually 1–3 seconds."
                : `lot 1 opens the moment you take the floor. €1B treasury · 20s on the block · ${qTotal} lots tonight.`}
            </div>
          </div>
          <div className="sw-bottom-cta">
            <button
              type="button"
              className="sw-btn-bid"
              onClick={takeToTheFloor}
              disabled={busy}
            >
              {busy ? "PREPARING THE FLOOR…" : "▶ TAKE TO THE FLOOR"}
            </button>
          </div>
          {error && <div className="sw-commit-err">{error}</div>}
        </div>
      </div>
    </ViewportGate>
  );
}
