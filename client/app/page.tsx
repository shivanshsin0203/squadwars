"use client";

/**
 * SquadWars · Landing (`/`).
 *
 * A scrolling broadcast-narrative landing. The first viewport is the doorway
 * hero from the design system (wordmark is the signature) — but instead of a
 * dead-end, it now opens onto the story: how the game plays, who you play, and
 * why it's different. Everything below the fold is scroll-revealed.
 *
 * The gameplay is demonstrated with NATIVE animated recreations built from the
 * real design tokens — the split-flap auction clock, the three-state bid
 * banner, the re-chalking pitch, the full-time scoreboard. No screenshots, no
 * video: lighter, alive, on-brand by construction, and they never go stale.
 *
 * Grounded entirely in client/design.md.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

// ─────────────────────────── shared data (mirrors server / setup) ───────────────────────────

type Category = "GK" | "DEF" | "MID" | "ATT";

type DemoFormation = {
  name: string;
  label: string;
  markers: Array<{ cat: Category; x: number; y: number }>;
};

// Marker positions on a vertical pitch (viewBox 0 0 100 140). Mirrors setup/page.tsx.
const FORMATIONS: DemoFormation[] = [
  {
    name: "4-3-3",
    label: "THE ORTHODOXY",
    markers: [
      { cat: "GK", x: 50, y: 134 },
      { cat: "DEF", x: 13, y: 108 }, { cat: "DEF", x: 36, y: 112 },
      { cat: "DEF", x: 64, y: 112 }, { cat: "DEF", x: 87, y: 108 },
      { cat: "MID", x: 28, y: 75 }, { cat: "MID", x: 50, y: 70 }, { cat: "MID", x: 72, y: 75 },
      { cat: "ATT", x: 18, y: 26 }, { cat: "ATT", x: 50, y: 18 }, { cat: "ATT", x: 82, y: 26 },
    ],
  },
  {
    name: "4-4-2",
    label: "THE TWO BANKS",
    markers: [
      { cat: "GK", x: 50, y: 134 },
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
    markers: [
      { cat: "GK", x: 50, y: 134 },
      { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 }, { cat: "DEF", x: 72, y: 112 },
      { cat: "MID", x: 8, y: 78 }, { cat: "MID", x: 30, y: 70 }, { cat: "MID", x: 50, y: 62 },
      { cat: "MID", x: 70, y: 70 }, { cat: "MID", x: 92, y: 78 },
      { cat: "ATT", x: 36, y: 24 }, { cat: "ATT", x: 64, y: 24 },
    ],
  },
  {
    name: "5-3-2",
    label: "THE SHELL",
    markers: [
      { cat: "GK", x: 50, y: 134 },
      { cat: "DEF", x: 8, y: 104 }, { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 },
      { cat: "DEF", x: 72, y: 112 }, { cat: "DEF", x: 92, y: 104 },
      { cat: "MID", x: 28, y: 72 }, { cat: "MID", x: 50, y: 66 }, { cat: "MID", x: 72, y: 72 },
      { cat: "ATT", x: 36, y: 24 }, { cat: "ATT", x: 64, y: 24 },
    ],
  },
  {
    name: "3-4-3",
    label: "THE FRONT FOOT",
    markers: [
      { cat: "GK", x: 50, y: 134 },
      { cat: "DEF", x: 28, y: 112 }, { cat: "DEF", x: 50, y: 115 }, { cat: "DEF", x: 72, y: 112 },
      { cat: "MID", x: 13, y: 68 }, { cat: "MID", x: 36, y: 72 },
      { cat: "MID", x: 64, y: 72 }, { cat: "MID", x: 87, y: 68 },
      { cat: "ATT", x: 18, y: 26 }, { cat: "ATT", x: 50, y: 18 }, { cat: "ATT", x: 82, y: 26 },
    ],
  },
  {
    name: "4-2-3-1",
    label: "THE MODERN",
    markers: [
      { cat: "GK", x: 50, y: 134 },
      { cat: "DEF", x: 13, y: 108 }, { cat: "DEF", x: 36, y: 112 },
      { cat: "DEF", x: 64, y: 112 }, { cat: "DEF", x: 87, y: 108 },
      { cat: "MID", x: 35, y: 86 }, { cat: "MID", x: 65, y: 86 },
      { cat: "MID", x: 18, y: 48 }, { cat: "MID", x: 50, y: 44 }, { cat: "MID", x: 82, y: 48 },
      { cat: "ATT", x: 50, y: 22 },
    ],
  },
];

type Pundit = {
  name: string;
  tag: string;
  blurb: string;
  photo: string;
  accent: string;
  recommended?: boolean;
};

const PUNDITS: Pundit[] = [
  {
    name: "Micah Richards AI",
    tag: "TEST HIM",
    blurb: "warm, instinctive, plays the room. a balanced bidder — honest and fair on the floor.",
    photo: "/easy.webp",
    accent: "var(--keeper-blue)",
  },
  {
    name: "Jamie Carragher AI",
    tag: "AGGRESSIVE",
    blurb: "fierce, opinionated. if he wants him, he SNATCHES him. won't back down on his picks.",
    photo: "/medium.jpg",
    accent: "var(--floodlight)",
  },
  {
    name: "Thierry Henry AI",
    tag: "GOD MODE",
    blurb: "the shark. never lets an elite walk. ruthless with the wallet. always wins.",
    photo: "/hard.jpg",
    accent: "var(--whistle)",
    recommended: true,
  },
];

// ─────────────────────────── helpers ───────────────────────────

function categoryStroke(cat: Category): string {
  switch (cat) {
    case "ATT": return "var(--whistle)";
    case "MID": return "var(--floodlight)";
    case "DEF": return "var(--keeper-blue)";
    case "GK": return "var(--chalk)";
  }
}
function markerDelayMs(cat: Category, indexInCat: number): number {
  const base = { GK: 0, DEF: 80, MID: 220, ATT: 360 }[cat];
  return base + indexInCat * 40;
}

// ─────────────────────────── hooks ───────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Fires once when the element scrolls into view. With reduced motion it's true on mount. */
function useReveal<T extends HTMLElement>(reduced: boolean) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (reduced) { setInView(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { setInView(true); io.disconnect(); }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  return { ref, inView };
}

/** Counts 0 → target over duration once `active`. Jumps to target with reduced motion. */
function useCountUp(target: number, active: boolean, reduced: boolean, durationMs = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) { setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduced, durationMs]);
  return val;
}

// ─────────────────────────── design tokens + landing styles ───────────────────────────

const tokens = `

  html, body { margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }

  .sw-landing {
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

    --r-sm: 4px; --r-md: 8px; --r-lg: 12px;

    background:
      radial-gradient(ellipse 60% 40% at 50% 0%, rgba(255, 182, 39, 0.06), transparent 60%),
      radial-gradient(ellipse 70% 50% at 12% 30%, rgba(111, 177, 255, 0.03), transparent 60%),
      radial-gradient(ellipse 70% 50% at 90% 70%, rgba(242, 237, 224, 0.025), transparent 60%),
      var(--ink);
    color: var(--text);
    font-family: var(--font-body);
    min-height: 100vh;
    width: 100%;
    overflow-x: hidden;
    position: relative;
  }
  .sw-landing *, .sw-landing *::before, .sw-landing *::after { box-sizing: border-box; }
  .sw-landing button, .sw-landing a { font-family: inherit; cursor: pointer; }
  .sw-landing a { color: inherit; text-decoration: none; }

  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .sw-eyebrow {
    font-family: var(--font-display); font-weight: 700; font-size: 10px;
    letter-spacing: 0.22em; color: var(--muted); text-transform: uppercase;
  }
  .sw-eyebrow-dim { color: var(--dim); }

  /* corner ticks */
  .sw-tick-tl, .sw-tick-tr, .sw-tick-bl, .sw-tick-br {
    position: absolute; width: 10px; height: 10px;
    border-color: var(--hairline-strong); pointer-events: none;
  }
  .sw-tick-tl { top: 10px; left: 10px; border-top: 1px solid; border-left: 1px solid; }
  .sw-tick-tr { top: 10px; right: 10px; border-top: 1px solid; border-right: 1px solid; }
  .sw-tick-bl { bottom: 10px; left: 10px; border-bottom: 1px solid; border-left: 1px solid; }
  .sw-tick-br { bottom: 10px; right: 10px; border-bottom: 1px solid; border-right: 1px solid; }

  .sw-card {
    position: relative;
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px;
  }

  /* ── layout shell ── */
  .sw-wrap { max-width: 1180px; margin: 0 auto; padding: 0 28px; }
  .sw-section { padding: 96px 0; position: relative; }
  .sw-section-head { max-width: 720px; margin-bottom: 44px; }
  .sw-section-title {
    font-family: var(--font-display); font-weight: 800;
    font-size: clamp(30px, 4.6vw, 52px); line-height: 1.02;
    letter-spacing: 0.01em; text-transform: uppercase; color: var(--chalk);
    margin: 10px 0 0;
  }
  .sw-section-title .fl { color: var(--floodlight); }
  .sw-section-sub {
    font-family: var(--font-body); font-size: 16px; line-height: 1.6;
    color: var(--muted); margin: 16px 0 0; max-width: 600px;
  }

  /* ── reveal ── */
  .sw-reveal {
    opacity: 0; transform: translateY(26px);
    transition: opacity 0.7s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
    will-change: opacity, transform;
  }
  .sw-reveal.is-in { opacity: 1; transform: none; }

  /* ── sticky nav ── */
  .sw-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 28px;
    background: rgba(11, 16, 24, 0); border-bottom: 1px solid transparent;
    transform: translateY(-100%);
    transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), background 0.4s ease, border-color 0.4s ease;
  }
  .sw-nav.is-visible {
    transform: translateY(0);
    background: rgba(11, 16, 24, 0.82);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--hairline);
  }
  .sw-nav-brand { display: flex; align-items: center; gap: 10px; }
  .sw-nav-word {
    font-family: var(--font-display); font-weight: 800; font-size: 18px;
    letter-spacing: 0.14em; text-transform: uppercase; color: var(--chalk);
  }
  .sw-nav-word .fl { color: var(--floodlight); }
  .sw-nav-links { display: flex; align-items: center; gap: 26px; }
  .sw-nav-link {
    font-family: var(--font-display); font-weight: 700; font-size: 12px;
    letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted);
    transition: color 0.15s ease;
  }
  .sw-nav-link:hover { color: var(--chalk); }

  /* ── buttons ── */
  .sw-btn-bid {
    font-family: var(--font-display); font-weight: 800;
    letter-spacing: 0.18em; text-transform: uppercase; font-size: 15px;
    padding: 15px 30px; background: var(--chalk); color: var(--ink);
    border: 1px solid var(--chalk); border-radius: var(--r-md);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 10px 30px rgba(242, 237, 224, 0.20);
    transition: background 0.12s ease, transform 0.05s ease, box-shadow 0.2s ease;
  }
  .sw-btn-bid:hover:not(:disabled) { background: #FFFCF2; box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 12px 36px rgba(242, 237, 224, 0.3); }
  .sw-btn-bid:active:not(:disabled) { transform: translateY(1px); }
  .sw-btn-bid:disabled { background: var(--surface-3); color: var(--dim); border-color: var(--hairline); box-shadow: none; cursor: wait; }
  .sw-btn-bid.sw-btn-sm { font-size: 12px; padding: 11px 20px; letter-spacing: 0.14em; }

  .sw-btn {
    font-family: var(--font-display); font-weight: 700; letter-spacing: 0.10em;
    text-transform: uppercase; font-size: 13px; padding: 9px 12px;
    background: var(--surface-3); color: var(--text);
    border: 1px solid var(--hairline-strong); border-radius: var(--r-md);
  }

  /* ── hero ── */
  .sw-hero { position: relative; padding: 116px 0 60px; }
  .sw-hero-grid {
    display: grid; grid-template-columns: 1.05fr 0.95fr;
    gap: 48px; align-items: center;
  }
  .sw-eyebrow-row { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .sw-wordmark {
    font-family: var(--font-display); font-weight: 800;
    /* Lives in a ~half-width hero column, so the vw factor stays conservative —
       must never exceed its column at the 2-col→1-col transition (~960px) or
       on the smallest phones (~320px). */
    font-size: clamp(52px, 7.2vw, 120px); line-height: 0.84;
    letter-spacing: -0.01em; color: var(--chalk); text-transform: uppercase;
    margin: 0; text-shadow: 0 0 36px rgba(255, 182, 39, 0.10);
    animation: sw-wordmark-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .sw-wordmark .fl { color: var(--floodlight); }
  @keyframes sw-wordmark-in {
    0% { opacity: 0; transform: translateY(14px); clip-path: inset(0 0 100% 0); }
    100% { opacity: 1; transform: translateY(0); clip-path: inset(0 0 0% 0); }
  }
  .sw-tagline {
    font-family: var(--font-display); font-weight: 700; font-size: 14px;
    letter-spacing: 0.30em; color: var(--floodlight); text-transform: uppercase;
    margin: 22px 0 0; animation: sw-fade-in 0.7s ease-out 0.18s both;
  }
  .sw-hero-pitch {
    font-family: var(--font-body); font-size: 16px; color: var(--muted);
    max-width: 480px; line-height: 1.6; margin: 16px 0 0;
    animation: sw-fade-in 0.7s ease-out 0.28s both;
  }
  @keyframes sw-fade-in { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
  .sw-commit-row {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    margin-top: 28px; animation: sw-fade-in 0.7s ease-out 0.38s both;
  }
  .sw-commit-helper { font-family: var(--font-mono); font-size: 11px; color: var(--dim); letter-spacing: 0.06em; }
  .sw-commit-err {
    font-family: var(--font-body); font-size: 12px; color: var(--whistle);
    background: var(--whistle-soft); border: 1px solid rgba(230, 57, 70, 0.30);
    border-radius: var(--r-sm); padding: 6px 9px;
  }
  .sw-spec-strip {
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    margin-top: 40px; padding-top: 18px; border-top: 1px solid var(--hairline);
    font-family: var(--font-display); font-size: 11px; color: var(--muted);
    letter-spacing: 0.14em; text-transform: uppercase;
    animation: sw-fade-in 0.7s ease-out 0.5s both;
  }
  .sw-spec-strip .v { font-family: var(--font-mono); font-weight: 700; color: var(--chalk-dim); letter-spacing: 0.04em; margin-left: 6px; }
  .sw-spec-strip .sep { color: var(--dim); font-family: var(--font-mono); font-size: 10px; }
  .sw-device-note {
    display: inline-flex; align-items: center; gap: 9px; margin-top: 16px;
    font-family: var(--font-display); font-weight: 700; font-size: 10px;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim);
    animation: sw-fade-in 0.7s ease-out 0.44s both;
  }
  .sw-device-note svg { color: var(--muted); flex: 0 0 auto; }
  .sw-device-note b { color: var(--chalk-dim); font-weight: 700; }
  .sw-hero-monitor-wrap { animation: sw-fade-in 0.8s ease-out 0.45s both; }

  /* ── broadcast monitor frame ── */
  .sw-monitor {
    position: relative; border-radius: 14px; padding: 12px;
    background: linear-gradient(160deg, #1a2230, #0d141d);
    border: 1px solid var(--hairline-strong);
    box-shadow: 0 30px 70px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.03);
  }
  .sw-monitor-bezel {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 4px 9px; font-family: var(--font-mono); font-size: 9px;
    letter-spacing: 0.14em; color: var(--dim); text-transform: uppercase;
  }
  .sw-monitor-dots { display: flex; gap: 5px; }
  .sw-monitor-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--surface-3); display: block; }

  /* ── live auction demo ── */
  .sw-auc { position: relative; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-md); overflow: hidden; }
  .sw-auc-head { display: flex; align-items: center; justify-content: space-between; padding: 11px 14px 9px; border-bottom: 1px solid var(--hairline); }
  .sw-auc-lot { font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.06em; }
  .sw-auc-lot b { color: var(--chalk); font-weight: 700; }
  .sw-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--whistle); box-shadow: 0 0 8px var(--whistle); animation: sw-pulse 1.4s ease-in-out infinite; flex: 0 0 auto; }
  @keyframes sw-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } }

  .sw-auc-player { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding: 13px 14px 8px; }
  .sw-auc-name { font-family: var(--font-display); font-weight: 800; font-size: 26px; line-height: 1; letter-spacing: 0.01em; color: var(--chalk); text-transform: uppercase; }
  .sw-auc-meta { font-family: var(--font-display); font-weight: 600; font-size: 12px; letter-spacing: 0.08em; color: var(--muted); text-transform: uppercase; margin-top: 6px; }
  .sw-auc-ovr-l { font-family: var(--font-display); font-weight: 700; font-size: 9px; letter-spacing: 0.22em; color: var(--dim); text-transform: uppercase; text-align: right; }
  .sw-auc-ovr { font-family: var(--font-mono); font-weight: 800; font-size: 40px; line-height: 0.9; color: var(--chalk); }

  .sw-auc-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 16px; padding: 4px 14px 12px; }
  .sw-stat { display: flex; align-items: center; gap: 8px; }
  .sw-stat-l { font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.16em; color: var(--muted); width: 26px; flex: 0 0 auto; }
  .sw-bar { flex: 1; height: 3px; background: var(--surface-3); border-radius: 1.5px; overflow: hidden; }
  .sw-bar-fill { height: 100%; border-radius: 1.5px; transition: width 0.5s cubic-bezier(0.2,0.8,0.2,1); }
  .sw-stat-v { font-family: var(--font-mono); font-weight: 700; font-size: 11px; min-width: 20px; text-align: right; }

  .sw-clock-wrap { padding: 6px 14px 12px; }
  .sw-clock {
    display: flex; align-items: center; gap: 2px;
    font-family: var(--font-display); font-weight: 800; font-size: 60px; line-height: 0.92;
    letter-spacing: -0.01em; font-variant-numeric: tabular-nums; padding: 2px 0 8px;
  }
  .sw-flap { display: inline-block; position: relative; width: 0.62em; overflow: hidden; vertical-align: top; }
  .sw-flap-inner { display: inline-block; animation: sw-flap-down 0.36s cubic-bezier(0.5, 0, 0.5, 1) both; transform-origin: 50% 0%; }
  @keyframes sw-flap-down { 0% { transform: rotateX(-90deg); opacity: 0; } 60% { opacity: 1; } 100% { transform: rotateX(0deg); opacity: 1; } }
  .sw-clock-bar { height: 4px; background: var(--surface-3); border-radius: 2px; overflow: hidden; }
  .sw-clock-bar > div { height: 100%; border-radius: 2px; transition: width 0.9s linear, background 0.3s ease; }

  /* bid banner — three-state */
  .sw-banner { display: flex; align-items: stretch; margin: 0 14px 9px; border-radius: 6px; overflow: hidden; }
  .sw-banner-none { background: var(--surface-2); border: 1.5px dashed var(--hairline-strong); }
  .sw-banner-body { flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 9px 13px; }
  .sw-banner-stripe { width: 6px; flex: 0 0 auto; }
  .sw-banner-label { font-family: var(--font-display); font-weight: 800; font-size: 13px; letter-spacing: 0.20em; text-transform: uppercase; display: flex; align-items: center; gap: 9px; }
  .sw-banner-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .sw-banner-amt { font-family: var(--font-mono); font-weight: 700; font-size: 19px; letter-spacing: -0.01em; }

  .sw-auc-actions { display: flex; gap: 6px; padding: 0 14px 14px; }
  .sw-auc-inc { flex: 1; font-family: var(--font-display); font-weight: 700; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; padding: 9px 0; text-align: center; background: var(--surface-3); color: var(--text); border: 1px solid var(--hairline-strong); border-radius: var(--r-md); }
  .sw-auc-lodge { flex: 1.4; font-family: var(--font-display); font-weight: 800; font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; padding: 9px 0; text-align: center; background: var(--chalk); color: var(--ink); border-radius: var(--r-md); box-shadow: 0 6px 18px rgba(242,237,224,0.16); }

  .sw-chip-ghost { display: inline-flex; align-items: center; font-family: var(--font-display); font-weight: 600; font-size: 9px; letter-spacing: 0.14em; padding: 2px 7px; border-radius: 3px; color: var(--muted); border: 1px dashed var(--hairline-strong); }

  /* ── how-to steps ── */
  .sw-step { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center; margin-bottom: 86px; }
  .sw-step:last-child { margin-bottom: 0; }
  .sw-step.flip .sw-step-visual { order: -1; }
  .sw-step-index { font-family: var(--font-mono); font-weight: 700; font-size: 13px; color: var(--floodlight); letter-spacing: 0.1em; }
  .sw-step-title { font-family: var(--font-display); font-weight: 800; font-size: clamp(26px, 3.4vw, 38px); line-height: 1.04; letter-spacing: 0.01em; text-transform: uppercase; color: var(--chalk); margin: 8px 0 0; }
  .sw-step-body { font-family: var(--font-body); font-size: 15px; line-height: 1.65; color: var(--muted); margin: 14px 0 0; max-width: 440px; }
  .sw-step-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
  .sw-tag { font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; padding: 5px 10px; border-radius: var(--r-sm); background: var(--surface-3); border: 1px solid var(--hairline); color: var(--chalk-dim); }
  .sw-step-visual { position: relative; }

  /* ── pitch demo ── */
  .sw-pitch-card { position: relative; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 18px; display: flex; flex-direction: column; align-items: center; }
  .sw-pitch-svg { display: block; width: 100%; max-width: 300px; height: auto; }
  .sw-pitch-line { stroke: var(--chalk-soft); stroke-width: 0.35; fill: none; }
  .sw-pitch-line-strong { stroke: rgba(242, 237, 224, 0.18); stroke-width: 0.4; fill: none; }
  .sw-pitch-spot { fill: rgba(242, 237, 224, 0.30); }
  @keyframes sw-chalk-on { 0% { opacity: 0; transform: scale(0.4); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1); } }
  .sw-pitch-caption { display: flex; align-items: baseline; gap: 12px; margin-top: 14px; }
  .sw-pitch-num { font-family: var(--font-mono); font-weight: 700; font-size: 20px; color: var(--chalk); letter-spacing: 0.02em; }
  .sw-pitch-id { font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: 0.20em; text-transform: uppercase; color: var(--floodlight); }

  /* ── chem link draw ── */
  .sw-chem-link { stroke: var(--chalk); stroke-width: 0.5; opacity: 0.5; stroke-dasharray: 60; stroke-dashoffset: 60; }
  .sw-chem-link.is-in { animation: sw-draw 1s ease-out forwards; }
  @keyframes sw-draw { to { stroke-dashoffset: 0; } }

  /* ── scoreboard ── */
  .sw-score { display: grid; grid-template-columns: 1fr auto 1fr; gap: 18px; align-items: center; }
  .sw-score-col { position: relative; background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 20px 18px; text-align: center; overflow: hidden; }
  .sw-score-col.you { box-shadow: inset 0 0 0 1px rgba(242,237,224,0.12); }
  .sw-score-stripe { position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }
  .sw-score-who { font-family: var(--font-display); font-weight: 800; font-size: 13px; letter-spacing: 0.22em; text-transform: uppercase; }
  .sw-score-total { font-family: var(--font-mono); font-weight: 800; font-size: clamp(44px, 7vw, 66px); line-height: 0.95; margin: 8px 0 4px; }
  .sw-score-break { font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.04em; }
  .sw-score-vs { font-family: var(--font-display); font-weight: 800; font-size: 16px; letter-spacing: 0.12em; color: var(--dim); }
  .sw-score-verdict { text-align: center; margin-top: 22px; font-family: var(--font-display); font-weight: 800; font-size: clamp(20px, 3vw, 28px); letter-spacing: 0.12em; text-transform: uppercase; color: var(--chalk); text-shadow: 0 0 24px rgba(242,237,224,0.18); }

  /* ── pundit cards ── */
  .sw-pundits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .sw-pundit { position: relative; background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--r-lg); overflow: hidden; transition: transform 0.25s cubic-bezier(0.2,0.8,0.2,1), border-color 0.25s ease; }
  .sw-pundit:hover { transform: translateY(-4px); border-color: var(--hairline-strong); }
  .sw-pundit-photo { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--surface-3); }
  .sw-pundit-photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 22%; filter: grayscale(0.25) contrast(1.05); }
  .sw-pundit-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 40%, rgba(11,16,24,0.85) 100%); }
  .sw-pundit-rec { position: absolute; top: 10px; right: 10px; z-index: 2; font-family: var(--font-display); font-weight: 800; font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; padding: 4px 8px; border-radius: var(--r-sm); background: var(--chalk); color: var(--ink); }
  .sw-pundit-body { padding: 14px 16px 18px; }
  .sw-pundit-tag { font-family: var(--font-display); font-weight: 800; font-size: 17px; letter-spacing: 0.12em; text-transform: uppercase; }
  .sw-pundit-name { font-family: var(--font-display); font-weight: 700; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--chalk-dim); margin-top: 4px; }
  .sw-pundit-blurb { font-family: var(--font-body); font-size: 13px; line-height: 1.55; color: var(--muted); margin-top: 10px; }

  /* ── feature grid ── */
  .sw-features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .sw-feature { position: relative; padding: 22px 20px; }
  .sw-feature-title { font-family: var(--font-display); font-weight: 800; font-size: 15px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--chalk); margin: 12px 0 0; }
  .sw-feature-body { font-family: var(--font-body); font-size: 13px; line-height: 1.55; color: var(--muted); margin-top: 8px; }
  .sw-feature-ico { width: 26px; height: 26px; }

  /* ── intel / fog of war ── */
  .sw-intel { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .sw-intel-col { display: flex; flex-direction: column; gap: 12px; }
  .sw-intel-colhead { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; font-family: var(--font-display); font-weight: 800; font-size: 13px; letter-spacing: 0.20em; text-transform: uppercase; }
  .sw-intel-colhead .pin { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
  .sw-intel-card { position: relative; flex: 1; background: var(--surface-1); border: 1px solid var(--hairline); border-radius: var(--r-lg); padding: 18px 18px 18px 22px; overflow: hidden; }
  .sw-intel-card.hidden { background: var(--surface-2); border: 1.5px dashed var(--hairline-strong); padding-left: 18px; }
  .sw-intel-stripe { position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }
  .sw-intel-head { display: flex; align-items: center; gap: 9px; margin-bottom: 11px; }
  .sw-intel-dot { width: 9px; height: 9px; border-radius: 50%; flex: 0 0 auto; }
  .sw-intel-card.hidden .sw-intel-dot { background: transparent; border: 1.5px dashed var(--muted); }
  .sw-intel-tag { font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; }
  .sw-intel-title { font-family: var(--font-display); font-weight: 800; font-size: 17px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--chalk); }
  .sw-intel-card.hidden .sw-intel-title { color: var(--muted); }
  .sw-intel-body { font-family: var(--font-body); font-size: 13px; line-height: 1.55; color: var(--muted); margin: 8px 0 0; }
  .sw-intel-motif { display: flex; align-items: center; gap: 7px; margin-top: 14px; }
  .sw-intel-disc { width: 16px; height: 16px; border-radius: 50%; background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 55%, #DCD7C8 100%); border: 1px solid rgba(0,0,0,0.3); flex: 0 0 auto; }
  .sw-intel-chemline { font-family: var(--font-mono); font-size: 11px; color: var(--keeper-blue); letter-spacing: 0.04em; }
  .sw-redact { display: flex; gap: 6px; margin-top: 14px; }
  .sw-redact i { flex: 1; height: 10px; border-radius: 2px; border: 1px dashed var(--hairline-strong); background: repeating-linear-gradient(45deg, var(--surface-3) 0, var(--surface-3) 4px, transparent 4px, transparent 8px); display: block; }
  .sw-redact-q { width: 30px; height: 30px; border-radius: var(--r-sm); border: 1.5px dashed var(--hairline-strong); display: flex; align-items: center; justify-content: center; font-family: var(--font-display); font-weight: 800; font-size: 18px; color: var(--dim); margin-top: 12px; }
  .sw-strategy { position: relative; margin-top: 18px; background: linear-gradient(120deg, rgba(255,182,39,0.05), transparent 60%), var(--surface-1); border: 1px solid var(--hairline); border-left: 4px solid var(--floodlight); border-radius: var(--r-lg); padding: 22px 26px; }
  .sw-strategy-l { font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--floodlight); }
  .sw-strategy-t { font-family: var(--font-body); font-size: 15px; line-height: 1.65; color: var(--text); margin: 10px 0 0; }
  .sw-strategy-t b { color: var(--chalk); font-weight: 700; }

  /* ── final CTA ── */
  .sw-cta { position: relative; text-align: center; padding: 80px 0 96px; }
  .sw-cta-title { font-family: var(--font-display); font-weight: 800; font-size: clamp(36px, 6vw, 76px); line-height: 0.92; letter-spacing: 0; text-transform: uppercase; color: var(--chalk); margin: 0 auto; max-width: 12ch; }
  .sw-cta-title .fl { color: var(--floodlight); }
  .sw-cta-sub { font-family: var(--font-body); font-size: 16px; color: var(--muted); margin: 18px auto 30px; max-width: 480px; line-height: 1.6; }

  /* ── footer ── */
  .sw-footer { border-top: 1px solid var(--hairline); padding: 26px 0 40px; }
  .sw-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
  .sw-footer-stamp { font-family: var(--font-display); font-size: 10px; font-weight: 700; letter-spacing: 0.26em; color: var(--dim); text-transform: uppercase; }
  .sw-footer-note { font-family: var(--font-mono); font-size: 10px; color: var(--dim); letter-spacing: 0.06em; }

  /* ── scroll cue ── */
  .sw-scrollcue { display: flex; align-items: center; gap: 8px; margin-top: 36px; font-family: var(--font-display); font-weight: 700; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--dim); }
  .sw-scrollcue i { display: inline-block; width: 1px; height: 22px; background: linear-gradient(var(--floodlight), transparent); animation: sw-cue 1.8s ease-in-out infinite; }
  @keyframes sw-cue { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(4px); } }

  /* ── responsive ── */
  /* tablet / small laptop — single-column story, but keep grids that read fine in 2-up */
  @media (max-width: 940px) {
    .sw-hero-grid { grid-template-columns: 1fr; gap: 36px; }
    .sw-hero-monitor-wrap { max-width: 460px; margin: 0 auto; width: 100%; }
    .sw-step { grid-template-columns: 1fr; gap: 28px; margin-bottom: 64px; }
    .sw-step.flip .sw-step-visual { order: 0; }
    .sw-step-visual { max-width: 460px; margin: 0 auto; width: 100%; }
    .sw-pundits { grid-template-columns: 1fr 1fr; }
    .sw-features { grid-template-columns: 1fr 1fr; }
    .sw-nav-links { gap: 16px; }
  }
  /* phone — single column everything, tighter chrome, smaller signature numerals */
  @media (max-width: 620px) {
    .sw-wrap { padding: 0 18px; }
    .sw-section { padding: 64px 0; }
    .sw-nav { padding: 10px 18px; }
    .sw-nav-anchor { display: none; }
    .sw-pundits { grid-template-columns: 1fr; }
    .sw-features { grid-template-columns: 1fr; }
    .sw-intel { grid-template-columns: 1fr; }
    .sw-score { grid-template-columns: 1fr; }
    .sw-score-vs { display: none; }
    .sw-hero { padding: 96px 0 40px; }
    .sw-clock { font-size: 50px; }
    .sw-auc-name { font-size: 22px; }
    .sw-auc-ovr { font-size: 34px; }
    .sw-auc-lodge { letter-spacing: 0.10em; }
  }

  @media (prefers-reduced-motion: reduce) {
    html { scroll-behavior: auto; }
    .sw-landing *, .sw-landing *::before, .sw-landing *::after {
      animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
    .sw-reveal { opacity: 1 !important; transform: none !important; }
  }
`;

// ─────────────────────────── medallion mark ───────────────────────────

function Medallion({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <radialGradient id="swm-glow" cx="0.5" cy="0.30" r="0.62">
          <stop offset="0" stopColor="#FFB627" stopOpacity="0.24" />
          <stop offset="1" stopColor="#FFB627" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0B1018" />
      <rect width="32" height="32" rx="7" fill="url(#swm-glow)" />
      <path d="M16 5 A11 11 0 0 0 16 27 Z" fill="#F2EDE0" />
      <path d="M16 5 A11 11 0 0 1 16 27 Z" fill="#FFB627" />
      <circle cx="16" cy="16" r="11" stroke="#0B1018" strokeOpacity="0.22" strokeWidth="0.6" fill="none" />
      <path d="M7.5 10.5 L11.5 21.5 L16 14.5 L20.5 21.5 L24.5 10.5"
        stroke="#0B1018" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// ─────────────────────────── reveal wrapper ───────────────────────────

function Reveal({
  children, reduced, delay = 0, className = "",
}: {
  children: React.ReactNode; reduced: boolean; delay?: number; className?: string;
}) {
  const { ref, inView } = useReveal<HTMLDivElement>(reduced);
  return (
    <div
      ref={ref}
      className={`sw-reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────── live auction demo ───────────────────────────

type AucFrame = { sec: number; bidder: "user" | "ai" | null; amount: string; sold?: boolean; pct: number };

const AUCTION_FRAMES: AucFrame[] = [
  { sec: 12, bidder: null, amount: "€1.0M", pct: 100 },
  { sec: 11, bidder: "ai", amount: "€40M", pct: 90 },
  { sec: 9, bidder: "user", amount: "€45M", pct: 74 },
  { sec: 7, bidder: "ai", amount: "€52M", pct: 56 },
  { sec: 5, bidder: "user", amount: "€58M", pct: 40 },
  { sec: 3, bidder: "ai", amount: "€66M", pct: 24 },
  { sec: 1, bidder: "user", amount: "€74M", pct: 8 },
  { sec: 0, bidder: "user", amount: "€74M", sold: true, pct: 0 },
];

const MBAPPE_STATS = [
  { l: "SHO", v: 90 }, { l: "PAC", v: 97 }, { l: "DRI", v: 92 }, { l: "PHY", v: 76 },
];

function LiveAuctionDemo({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useReveal<HTMLDivElement>(reduced);
  // Frame 6 ("You lead · going once · €74M") is the most informative still for reduced motion.
  const [idx, setIdx] = useState(reduced ? 6 : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % AUCTION_FRAMES.length), 1150);
    return () => clearInterval(id);
  }, [reduced, inView]);

  const f = AUCTION_FRAMES[idx];
  const lowTime = !f.sold && f.sec <= 4;
  const accent = f.sold ? "var(--chalk)" : lowTime ? "var(--whistle)" : "var(--chalk)";
  const ss = String(f.sec).padStart(2, "0");
  const digits = ["0", ":", ss[0], ss[1]];

  const stripeColor = f.bidder === "user" ? "#9F9A8C" : "#A3741A";
  const bannerBg = f.bidder === "user" ? "var(--chalk)" : "var(--floodlight)";

  return (
    <div ref={ref} className={`sw-auc sw-reveal ${inView ? "is-in" : ""}`}>
      <div className="sw-auc-head">
        <span className="sw-auc-lot">LOT <b>14</b> / 33 · ON THE BLOCK</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="sw-live-dot" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <span className="sw-eyebrow" style={{ color: accent }}>{f.sold ? "took it" : lowTime ? "going once" : "live"}</span>
        </span>
      </div>

      <div className="sw-auc-player">
        <div>
          <div className="sw-auc-name">K. Mbappé</div>
          <div className="sw-auc-meta">ST · Real Madrid · France</div>
        </div>
        <div>
          <div className="sw-auc-ovr-l">OVR</div>
          <div className="sw-auc-ovr">91</div>
        </div>
      </div>

      <div className="sw-auc-stats">
        {MBAPPE_STATS.map((s) => {
          const c = s.v >= 85 ? "var(--chalk)" : s.v >= 75 ? "var(--floodlight)" : "var(--muted)";
          return (
            <div key={s.l} className="sw-stat">
              <span className="sw-stat-l">{s.l}</span>
              <div className="sw-bar"><div className="sw-bar-fill" style={{ width: `${s.v}%`, background: c }} /></div>
              <span className="sw-stat-v" style={{ color: c }}>{s.v}</span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 14px 6px" }}>
        <span className="sw-eyebrow sw-eyebrow-dim">Also plays</span>
        <span className="sw-chip-ghost">LW</span>
        <span className="sw-chip-ghost">LM</span>
      </div>

      <div className="sw-clock-wrap">
        <div className="sw-clock" style={{ color: accent, textShadow: lowTime ? "0 0 24px var(--whistle-soft)" : "none" }}>
          {digits.map((d, i) => (
            <span key={`${i}-${d}`} className="sw-flap"><span className="sw-flap-inner">{d}</span></span>
          ))}
        </div>
        <div className="sw-clock-bar">
          <div style={{ width: `${f.pct}%`, background: lowTime ? "linear-gradient(90deg, var(--whistle), #FF7585)" : "linear-gradient(90deg, var(--chalk), #FFF7E6)" }} />
        </div>
      </div>

      {/* bid-holder banner — three states */}
      {f.bidder === null ? (
        <div className="sw-banner sw-banner-none">
          <div className="sw-banner-body">
            <span className="sw-banner-label" style={{ color: "var(--muted)" }}>
              <span className="sw-banner-dot" style={{ background: "transparent", border: "1.5px dashed var(--muted)" }} />
              No bids · opening
            </span>
            <span className="sw-banner-amt" style={{ color: "var(--muted)" }}>{f.amount}</span>
          </div>
        </div>
      ) : (
        <div className="sw-banner" key={`${f.bidder}-${f.amount}`} style={{ background: bannerBg, boxShadow: `0 6px 18px ${f.bidder === "user" ? "rgba(242,237,224,0.16)" : "rgba(255,182,39,0.18)"}`, animation: reduced ? "none" : "sw-fade-in 0.3s ease-out" }}>
          <span className="sw-banner-stripe" style={{ background: stripeColor }} />
          <div className="sw-banner-body">
            <span className="sw-banner-label" style={{ color: "var(--ink)" }}>
              <span className="sw-banner-dot" style={{ background: "var(--ink)" }} />
              {f.sold ? "Took it" : f.bidder === "user" ? "You lead" : "AI leading"}
            </span>
            <span className="sw-banner-amt" style={{ color: "var(--ink)" }}>{f.amount}</span>
          </div>
        </div>
      )}

      <div className="sw-auc-actions">
        <span className="sw-auc-inc">+1M</span>
        <span className="sw-auc-inc">+5M</span>
        <span className="sw-auc-inc">+10M</span>
        <span className="sw-auc-lodge">Lodge bid</span>
      </div>
    </div>
  );
}

// ─────────────────────────── re-chalking pitch demo ───────────────────────────

function PitchLines() {
  return (
    <g>
      <rect x="2" y="2" width="96" height="136" className="sw-pitch-line-strong" />
      <line x1="2" y1="70" x2="98" y2="70" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="11" className="sw-pitch-line" />
      <circle cx="50" cy="70" r="0.9" className="sw-pitch-spot" />
      <rect x="22" y="2" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="2" width="28" height="9" className="sw-pitch-line" />
      <rect x="22" y="118" width="56" height="20" className="sw-pitch-line" />
      <rect x="36" y="129" width="28" height="9" className="sw-pitch-line" />
      <path d="M 2 4 A 2 2 0 0 1 4 2" className="sw-pitch-line" />
      <path d="M 96 2 A 2 2 0 0 1 98 4" className="sw-pitch-line" />
      <path d="M 2 136 A 2 2 0 0 0 4 138" className="sw-pitch-line" />
      <path d="M 96 138 A 2 2 0 0 0 98 136" className="sw-pitch-line" />
    </g>
  );
}

function ChalkPitchDemo({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useReveal<HTMLDivElement>(reduced);
  const [fi, setFi] = useState(0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = setInterval(() => setFi((i) => (i + 1) % FORMATIONS.length), 2600);
    return () => clearInterval(id);
  }, [reduced, inView]);

  const formation = FORMATIONS[fi];
  const indexed = useMemo(() => {
    const counts: Record<Category, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
    return formation.markers.map((m) => ({ ...m, i: counts[m.cat]++ }));
  }, [formation]);

  return (
    <div ref={ref} className={`sw-pitch-card sw-reveal ${inView ? "is-in" : ""}`}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" className="sw-pitch-svg" key={formation.name}>
        <PitchLines />
        {indexed.map((m, i) => {
          const stroke = categoryStroke(m.cat);
          const delay = reduced ? 0 : markerDelayMs(m.cat, m.i);
          return (
            <g key={i} style={{ transformOrigin: `${m.x}px ${m.y}px`, transformBox: "fill-box", animation: `sw-chalk-on 0.46s cubic-bezier(0.2,0.8,0.2,1) ${delay}ms both` }}>
              <circle cx={m.x} cy={m.y} r={5} fill="transparent" stroke={stroke} strokeOpacity={0.3} strokeWidth={0.8} />
              <circle cx={m.x} cy={m.y} r={3.8} fill="var(--chalk)" stroke={stroke} strokeWidth={1.1} />
              <text x={m.x} y={m.y + 1.6} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={4.75} fill="var(--ink)">
                {m.cat[0]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="sw-pitch-caption">
        <span className="sw-pitch-num">{formation.name}</span>
        <span className="sw-pitch-id">{formation.label}</span>
      </div>
    </div>
  );
}

// ─────────────────────────── squad + chemistry demo ───────────────────────────

function SquadChemDemo({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useReveal<HTMLDivElement>(reduced);
  const formation = FORMATIONS[0]; // 4-3-3
  const chem = useCountUp(31, inView, reduced, 1100);
  const ovr = useCountUp(87, inView, reduced, 1100);

  // A few chemistry links between markers that "share club / nation".
  const m = formation.markers;
  const links: Array<[number, number]> = [[1, 2], [5, 6], [6, 9], [9, 10], [2, 5]];

  return (
    <div ref={ref} className={`sw-pitch-card sw-reveal ${inView ? "is-in" : ""}`}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid meet" className="sw-pitch-svg">
        <PitchLines />
        {links.map(([a, b], i) => (
          <line key={i} x1={m[a].x} y1={m[a].y} x2={m[b].x} y2={m[b].y} className={`sw-chem-link ${inView ? "is-in" : ""}`} style={{ animationDelay: `${300 + i * 160}ms` }} />
        ))}
        {m.map((mk, i) => {
          const stroke = categoryStroke(mk.cat);
          return (
            <g key={i}>
              <circle cx={mk.x} cy={mk.y} r={5} fill="transparent" stroke={stroke} strokeOpacity={0.3} strokeWidth={0.8} />
              <circle cx={mk.x} cy={mk.y} r={3.8} fill="var(--chalk)" stroke={stroke} strokeWidth={1.1} />
              <text x={mk.x} y={mk.y + 1.6} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={800} fontSize={4.75} fill="var(--ink)">{mk.cat[0]}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 26, marginTop: 16 }}>
        <div style={{ textAlign: "center" }}>
          <div className="sw-eyebrow sw-eyebrow-dim">Team OVR</div>
          <div className="sw-mono" style={{ fontWeight: 800, fontSize: 32, color: "var(--chalk)", lineHeight: 1 }}>{ovr}</div>
        </div>
        <div style={{ width: 1, background: "var(--hairline)" }} />
        <div style={{ textAlign: "center" }}>
          <div className="sw-eyebrow sw-eyebrow-dim">Chemistry</div>
          <div className="sw-mono" style={{ fontWeight: 800, fontSize: 32, color: "var(--floodlight)", lineHeight: 1 }}>{chem}<span style={{ fontSize: 15, color: "var(--dim)" }}>/37</span></div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── full-time scoreboard demo ───────────────────────────

function ScoreboardDemo({ reduced }: { reduced: boolean }) {
  const { ref, inView } = useReveal<HTMLDivElement>(reduced);
  const youTotal = useCountUp(118, inView, reduced, 1200); // 87 OVR + 31 CHEM
  const aiTotal = useCountUp(109, inView, reduced, 1200);  // 85 OVR + 24 CHEM

  return (
    <div ref={ref} className={`sw-reveal ${inView ? "is-in" : ""}`}>
      <div className="sw-score">
        <div className="sw-score-col you">
          <span className="sw-score-stripe" style={{ background: "var(--chalk)" }} />
          <div className="sw-score-who" style={{ color: "var(--chalk)" }}>You</div>
          <div className="sw-score-total" style={{ color: "var(--chalk)" }}>{youTotal}</div>
          <div className="sw-score-break">OVR 87 · CHEM 31</div>
        </div>
        <div className="sw-score-vs">VS</div>
        <div className="sw-score-col">
          <span className="sw-score-stripe" style={{ background: "var(--floodlight)" }} />
          <div className="sw-score-who" style={{ color: "var(--floodlight)" }}>AI · Henry</div>
          <div className="sw-score-total" style={{ color: "var(--floodlight)" }}>{aiTotal}</div>
          <div className="sw-score-break">OVR 85 · CHEM 24</div>
        </div>
      </div>
      <div className="sw-score-verdict">▶ You take the night</div>
    </div>
  );
}

// ─────────────────────────── feature icons ───────────────────────────

function FeatureIcon({ kind }: { kind: string }) {
  const common = { fill: "none", stroke: "var(--floodlight)", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "players":
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><circle cx="12" cy="7" r="3.4" {...common} /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" {...common} /></svg>;
    case "ai":
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="12" rx="2" {...common} /><path d="M9 11h0M15 11h0M9 15h6M12 6V3" {...common} /></svg>;
    case "chem":
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><circle cx="7" cy="7" r="2.4" {...common} /><circle cx="17" cy="17" r="2.4" {...common} /><path d="M9 9l6 6" {...common} /></svg>;
    case "shapes":
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1.5" {...common} /><circle cx="12" cy="12" r="3" {...common} /><path d="M4 12h16" {...common} /></svg>;
    case "tension":
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><circle cx="12" cy="13" r="7" {...common} /><path d="M12 13V9M12 4h0M9 4h6" {...common} /></svg>;
    default:
      return <svg className="sw-feature-ico" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" {...common} /></svg>;
  }
}

const FEATURES = [
  { kind: "players", title: "Real footballers", body: "FC-accurate ratings, clubs and nations across a deep pool of elite players — the names you actually know." },
  { kind: "ai", title: "An AI that schemes", body: "It reads the board, hunts the gaps in your shape and snipes at the death. Three pundit personas, three temperaments." },
  { kind: "chem", title: "Chemistry links", body: "Shared club and nation wire your XI together for bonus points. A balanced side can beat a more expensive one." },
  { kind: "shapes", title: "Six tactical shapes", body: "From the orthodox 4-3-3 to a back-five shell. Pick an identity, then sign the players to fill it." },
  { kind: "tension", title: "Twenty-second lots", body: "Every player is on the block for twenty seconds. Going once. Going twice. Real auction-house pressure." },
  { kind: "win", title: "Built to win", body: "The better starting XI — overall rating plus chemistry — takes the night. One match, one verdict." },
];

// ─────────────────────────── page ───────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const reduced = usePrefersReducedMotion();
  const [health, setHealth] = useState<"loading" | "ok" | "bad">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [navVisible, setNavVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/health`, { credentials: "include" })
      .then((r) => r.json())
      .then(() => { if (!cancelled) setHealth("ok"); })
      .catch(() => { if (!cancelled) setHealth("bad"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onScroll = () => setNavVisible(window.scrollY > 560);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function startGame() {
    if (busy) return;
    if (health === "bad") {
      setError("backend offline — start the server and refresh.");
      return;
    }
    setBusy(true);
    setError(null);
    router.push("/setup");
  }

  return (
    <>
      <style>{tokens}</style>
      <div className="sw-landing">
        {/* ── sticky nav ── */}
        <nav className={`sw-nav ${navVisible ? "is-visible" : ""}`}>
          <div className="sw-nav-brand">
            <Medallion size={26} />
            <span className="sw-nav-word">SQUAD<span className="fl">WARS</span></span>
          </div>
          <div className="sw-nav-links">
            <a className="sw-nav-link sw-nav-anchor" href="#how">How it works</a>
            <a className="sw-nav-link sw-nav-anchor" href="#opponents">Opponents</a>
            <button type="button" className="sw-btn-bid sw-btn-sm" onClick={startGame} disabled={busy}>
              {busy ? "Loading…" : "▶ Play"}
            </button>
          </div>
        </nav>

        {/* ── hero ── */}
        <header className="sw-hero">
          <div className="sw-wrap">
            <div className="sw-hero-grid">
              <div>
                <div className="sw-eyebrow-row">
                  <Medallion size={22} />
                  <span className="sw-eyebrow">SquadWars · Matchday 01 · Pre-game</span>
                </div>
                <h1 className="sw-wordmark">SQUAD<span className="fl">WARS</span></h1>
                <p className="sw-tagline">Live football auction · 1 v 1 vs AI</p>
                <p className="sw-hero-pitch">
                  You and an AI manager take turns at the rostrum, bidding live on real footballers
                  across thirty-plus lots — then field a starting XI in the shape you choose. The
                  side with the better XI wins the night.
                </p>
                <div className="sw-commit-row">
                  <button type="button" className="sw-btn-bid" onClick={startGame} disabled={busy}>
                    {busy ? "Entering the floor…" : "▶ Start game"}
                  </button>
                  <span className="sw-commit-helper">
                    {busy ? "loading setup…"
                      : health === "bad" ? "backend offline"
                      : "next: chalk the line (pick formation)"}
                  </span>
                  {error && <span className="sw-commit-err">{error}</span>}
                </div>
                <div className="sw-device-note">
                  <svg width="30" height="16" viewBox="0 0 30 16" fill="none" aria-hidden>
                    <rect x="0.75" y="1.25" width="17" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 14.5h7M9.25 12.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <rect x="21.5" y="0.75" width="8" height="14.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M25.5 13h0.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span>Currently playable on <b>PC &amp; tablet</b></span>
                </div>
                <div className="sw-spec-strip">
                  <span>TREASURY<span className="v">€1B</span></span>
                  <span className="sep">·</span>
                  <span>QUEUE<span className="v">33–35 LOTS</span></span>
                  <span className="sep">·</span>
                  <span>ON THE BLOCK<span className="v">20s / LOT</span></span>
                  <span className="sep">·</span>
                  <span>SQUAD<span className="v">11 + 5</span></span>
                  <span className="sep">·</span>
                  <span>SHAPES<span className="v">6</span></span>
                </div>
              </div>

              {/* broadcast monitor — instant comprehension above the fold */}
              <div className="sw-hero-monitor-wrap">
                <div className="sw-monitor">
                  <div className="sw-monitor-bezel">
                    <span className="sw-monitor-dots"><i /><i /><i /></span>
                    <span>SQUADWARS · LIVE FLOOR</span>
                  </div>
                  <LiveAuctionDemo reduced={reduced} />
                </div>
                <div className="sw-scrollcue"><i /> scroll · how it works</div>
              </div>
            </div>
          </div>
        </header>

        {/* ── how to play ── */}
        <section className="sw-section" id="how">
          <div className="sw-wrap">
            <Reveal reduced={reduced} className="sw-section-head">
              <span className="sw-eyebrow">The matchday</span>
              <h2 className="sw-section-title">Four steps to <span className="fl">the night</span></h2>
              <p className="sw-section-sub">
                No tutorial, no grind. From kickoff to full-time is one sitting — here is the whole game.
              </p>
            </Reveal>

            {/* step 1 */}
            <div className="sw-step">
              <Reveal reduced={reduced}>
                <div className="sw-step-index">01</div>
                <h3 className="sw-step-title">Chalk your shape</h3>
                <p className="sw-step-body">
                  Pick one of six formations and the opponent you want to face. The pitch re-chalks
                  itself as you switch — your shape decides which positions you need to fill at the floor.
                </p>
                <div className="sw-step-tags">
                  <span className="sw-tag">6 formations</span>
                  <span className="sw-tag">3 opponents</span>
                  <span className="sw-tag">Pick your identity</span>
                </div>
              </Reveal>
              <div className="sw-step-visual"><ChalkPitchDemo reduced={reduced} /></div>
            </div>

            {/* step 2 */}
            <div className="sw-step flip">
              <Reveal reduced={reduced}>
                <div className="sw-step-index">02</div>
                <h3 className="sw-step-title">Take to the floor</h3>
                <p className="sw-step-body">
                  Players come up one lot at a time, twenty seconds each. Lodge a bid, the AI fires
                  back, and the chalk banner flips to whoever leads. Your signings bank on the right
                  as you win them — but you never see the AI&apos;s squad, or who comes up next.
                  Outbid the machine, or let it overpay and save your treasury for a player you
                  actually need.
                </p>
                <div className="sw-step-tags">
                  <span className="sw-tag">Live bidding</span>
                  <span className="sw-tag">€1B treasury</span>
                  <span className="sw-tag">Bid blind</span>
                </div>
              </Reveal>
              <div className="sw-step-visual"><LiveAuctionDemo reduced={reduced} /></div>
            </div>

            {/* step 3 */}
            <div className="sw-step">
              <Reveal reduced={reduced}>
                <div className="sw-step-index">03</div>
                <h3 className="sw-step-title">Build the XI</h3>
                <p className="sw-step-body">
                  Drag your signings into your shape — a starting XI of eleven plus a five-man bench,
                  sixteen players in all. Links form between shared clubs and nations, brewing
                  chemistry that lifts the whole side. A clever, well-linked sixteen can outscore a
                  pile of mismatched superstars.
                </p>
                <div className="sw-step-tags">
                  <span className="sw-tag">XI + 5 bench</span>
                  <span className="sw-tag">Chemistry up to 37</span>
                  <span className="sw-tag">Team overall</span>
                </div>
              </Reveal>
              <div className="sw-step-visual"><SquadChemDemo reduced={reduced} /></div>
            </div>

            {/* step 4 */}
            <div className="sw-step flip">
              <Reveal reduced={reduced}>
                <div className="sw-step-index">04</div>
                <h3 className="sw-step-title">Full time</h3>
                <p className="sw-step-body">
                  Both XIs are scored on overall rating plus chemistry. The better side takes the
                  night. No grind, no second legs — one auction, one squad, one verdict.
                </p>
                <div className="sw-step-tags">
                  <span className="sw-tag">OVR + chemistry</span>
                  <span className="sw-tag">One verdict</span>
                </div>
              </Reveal>
              <div className="sw-step-visual"><ScoreboardDemo reduced={reduced} /></div>
            </div>
          </div>
        </section>

        {/* ── the fog of war — hidden information & strategy ── */}
        <section className="sw-section" id="strategy">
          <div className="sw-wrap">
            <Reveal reduced={reduced} className="sw-section-head">
              <span className="sw-eyebrow">Read the room</span>
              <h2 className="sw-section-title">Half the floor is <span className="fl">hidden</span></h2>
              <p className="sw-section-sub">
                You bid on instinct and the little you can piece together. What you can see — and
                what you can&apos;t — is the whole game.
              </p>
            </Reveal>

            <div className="sw-intel">
              {/* what you see */}
              <Reveal reduced={reduced}>
                <div className="sw-intel-col">
                  <div className="sw-intel-colhead" style={{ color: "var(--chalk)" }}>
                    <span className="pin" style={{ background: "var(--chalk)", boxShadow: "0 0 8px var(--chalk)" }} />
                    You see
                  </div>
                  <div className="sw-intel-card">
                    <span className="sw-intel-stripe" style={{ background: "var(--chalk)" }} />
                    <div className="sw-intel-head">
                      <span className="sw-intel-dot" style={{ background: "var(--chalk)", boxShadow: "0 0 8px var(--chalk)" }} />
                      <span className="sw-intel-tag" style={{ color: "var(--chalk)" }}>Visible</span>
                    </div>
                    <div className="sw-intel-title">Your dressing room</div>
                    <p className="sw-intel-body">
                      Every player you win banks on the right — your squad, in full view, all
                      night. You always know exactly what you&apos;ve got and where the gaps are.
                    </p>
                    <div className="sw-intel-motif">
                      <span className="sw-intel-disc" /><span className="sw-intel-disc" />
                      <span className="sw-intel-disc" /><span className="sw-intel-disc" />
                      <span className="sw-intel-chemline" style={{ color: "var(--dim)" }}>· 4 signed</span>
                    </div>
                  </div>
                  <div className="sw-intel-card">
                    <span className="sw-intel-stripe" style={{ background: "var(--keeper-blue)" }} />
                    <div className="sw-intel-head">
                      <span className="sw-intel-dot" style={{ background: "var(--keeper-blue)", boxShadow: "0 0 8px var(--keeper-blue)" }} />
                      <span className="sw-intel-tag" style={{ color: "var(--keeper-blue)" }}>Visible</span>
                    </div>
                    <div className="sw-intel-title">Live chemistry</div>
                    <p className="sw-intel-body">
                      Club and country links update on the left as you sign. Chase chemistry in real
                      time, or pay up for raw rating — your call, mid-auction.
                    </p>
                    <div className="sw-intel-motif">
                      <span className="sw-intel-chemline">CLUB ●●● · COUNTRY ●● · CHEM 31/37</span>
                    </div>
                  </div>
                </div>
              </Reveal>

              {/* what you don't */}
              <Reveal reduced={reduced} delay={120}>
                <div className="sw-intel-col">
                  <div className="sw-intel-colhead" style={{ color: "var(--dim)" }}>
                    <span className="pin" style={{ background: "transparent", border: "1.5px dashed var(--muted)" }} />
                    You don&apos;t
                  </div>
                  <div className="sw-intel-card hidden">
                    <div className="sw-intel-head">
                      <span className="sw-intel-dot" />
                      <span className="sw-intel-tag" style={{ color: "var(--dim)" }}>Hidden</span>
                    </div>
                    <div className="sw-intel-title">The opposition&apos;s squad</div>
                    <p className="sw-intel-body">
                      You never see what the AI has bought. Loading up on strikers? Thin at the back?
                      You&apos;re reading the bidding, not a team sheet.
                    </p>
                    <div className="sw-redact"><i /><i /><i /></div>
                  </div>
                  <div className="sw-intel-card hidden">
                    <div className="sw-intel-head">
                      <span className="sw-intel-dot" />
                      <span className="sw-intel-tag" style={{ color: "var(--dim)" }}>Hidden</span>
                    </div>
                    <div className="sw-intel-title">The next lot</div>
                    <p className="sw-intel-body">
                      No queue, no preview. You don&apos;t know who comes up next — commit your
                      treasury now, or gamble that someone better walks out.
                    </p>
                    <div className="sw-redact-q">?</div>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal reduced={reduced}>
              <div className="sw-strategy">
                <span className="sw-tick-tr" /><span className="sw-tick-br" />
                <div className="sw-strategy-l">The play</div>
                <p className="sw-strategy-t">
                  So strategise. You&apos;re filling a <b>16-man squad</b> — a starting <b>XI of 11</b>{" "}
                  and a <b>5-man bench</b> — from roughly <b>33 lots</b> and a <b>€1B treasury</b>.
                  Blow it on three galácticos and you&apos;ll field cast-offs behind them. Bank it,
                  watch the chemistry, and build a side that <i>links</i>.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── opponents ── */}
        <section className="sw-section" id="opponents" style={{ background: "linear-gradient(180deg, transparent, rgba(255,182,39,0.02), transparent)" }}>
          <div className="sw-wrap">
            <Reveal reduced={reduced} className="sw-section-head">
              <span className="sw-eyebrow">In the away dugout</span>
              <h2 className="sw-section-title">Meet the <span className="fl">opponents</span></h2>
              <p className="sw-section-sub">
                Three AI managers, three temperaments at the rostrum. Pick your fight — Henry is the
                full-fat experience.
              </p>
            </Reveal>
            <div className="sw-pundits">
              {PUNDITS.map((p, i) => (
                <Reveal reduced={reduced} delay={i * 90} key={p.name}>
                  <article className="sw-pundit">
                    <span className="sw-tick-tl" /><span className="sw-tick-tr" />
                    <div className="sw-pundit-photo">
                      {p.recommended && <span className="sw-pundit-rec">Recommended</span>}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo} alt={`${p.name} portrait`} />
                    </div>
                    <div className="sw-pundit-body">
                      <div className="sw-pundit-tag" style={{ color: p.accent }}>{p.tag}</div>
                      <div className="sw-pundit-name">{p.name}</div>
                      <p className="sw-pundit-blurb">{p.blurb}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── features ── */}
        <section className="sw-section">
          <div className="sw-wrap">
            <Reveal reduced={reduced} className="sw-section-head">
              <span className="sw-eyebrow">Under the floodlights</span>
              <h2 className="sw-section-title">Why it <span className="fl">hits different</span></h2>
            </Reveal>
            <div className="sw-features">
              {FEATURES.map((f, i) => (
                <Reveal reduced={reduced} delay={(i % 3) * 80} key={f.title}>
                  <div className="sw-card sw-feature">
                    <span className="sw-tick-tl" /><span className="sw-tick-tr" />
                    <span className="sw-tick-bl" /><span className="sw-tick-br" />
                    <FeatureIcon kind={f.kind} />
                    <h3 className="sw-feature-title">{f.title}</h3>
                    <p className="sw-feature-body">{f.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── final CTA ── */}
        <section className="sw-cta">
          <div className="sw-wrap">
            <Reveal reduced={reduced}>
              <h2 className="sw-cta-title">Take to <span className="fl">the floor</span></h2>
              <p className="sw-cta-sub">
                Chalk your shape, outbid the machine, and build a side that wins the night. One sitting
                — start to full-time.
              </p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <button type="button" className="sw-btn-bid" onClick={startGame} disabled={busy} style={{ fontSize: 17, padding: "18px 40px" }}>
                  {busy ? "Entering the floor…" : "▶ Start game"}
                </button>
                <span className="sw-commit-helper">
                  {health === "bad" ? "backend offline — start the server and refresh" : "free to play · no sign-up · PC & tablet"}
                </span>
                {error && <span className="sw-commit-err">{error}</span>}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── footer ── */}
        <footer className="sw-footer">
          <div className="sw-wrap">
            <div className="sw-footer-row">
              <div className="sw-nav-brand">
                <Medallion size={22} />
                <span className="sw-footer-stamp">SQUADWARS</span>
              </div>
              <span className="sw-footer-note">a real-time 1v1 football auction · made for the love of the game</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
