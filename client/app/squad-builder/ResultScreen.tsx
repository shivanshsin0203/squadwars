"use client";

/**
 * ResultScreen · post-squad-builder verdict.
 *
 * Rendered by AuctionRoom when `match.status === "result"`. It is a TERMINAL state:
 * there is no back-button to SquadBuilder; refresh re-renders the same screen from
 * server state so a tampered client cannot re-roll the verdict.
 *
 * Data: server owns everything. Verdict numbers are deterministic, prose is LLM-
 * written (with a canned fallback). AI roster is HIDDEN throughout the auction
 * and is REVEALED here via `payload.aiBought` per spec §4.
 *
 * Sections (top→bottom):
 *   1. brand bar
 *   2. verdict banner (You · score · AI)
 *   3. squads compared side-by-side (mini pitch + bench, chalk vs floodlight)
 *   4. category comparison bars (5 rows)
 *   5. match report card + persona roast card
 *   6. shareable strip
 *
 * Design rules from design.md:
 *   - YOU = chalk, AI = floodlight (never swap)
 *   - whistle reserved for danger
 *   - Saira Condensed display, Inter body, JetBrains Mono numerals
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  BoughtPlayer,
  Category,
  ResultPayload,
  Squad,
  VerdictCategory,
} from "@/lib/types";
import { FORMATIONS, type XISlotDef } from "./SquadBuilder";

type ResultScreenProps = {
  payload: ResultPayload;
  /** The user's bought list — parent passes through `match.user.bought`. */
  userBought: BoughtPlayer[];
  formation: string;
  difficulty: string;
  matchId: string;
};

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

type StarterCell = {
  slot: XISlotDef;
  bp: BoughtPlayer | null;
};

function resolveStarters(
  squad: Squad,
  bought: BoughtPlayer[],
  formation: string
): StarterCell[] {
  const def = FORMATIONS[formation];
  if (!def) return [];
  const byId = new Map(bought.map((b) => [b.player.id, b]));
  const slotPick = new Map<string, BoughtPlayer>();
  for (const entry of squad.xi) {
    const bp = byId.get(entry.playerId);
    if (bp) slotPick.set(entry.slotId, bp);
  }
  return def.slots.map((slot) => ({ slot, bp: slotPick.get(slot.id) ?? null }));
}

function resolveBench(
  squad: Squad,
  bought: BoughtPlayer[]
): (BoughtPlayer | null)[] {
  const byId = new Map(bought.map((b) => [b.player.id, b]));
  const out: (BoughtPlayer | null)[] = [null, null, null, null, null];
  for (const entry of squad.bench) {
    if (entry.index < 0 || entry.index > 4) continue;
    const bp = byId.get(entry.playerId);
    if (bp) out[entry.index] = bp;
  }
  return out;
}

// ─────────────────────────── player chip ───────────────────────────

function PlayerChip({
  bp,
  side,
  size = 48,
  tipBelow = false,
}: {
  bp: BoughtPlayer | null;
  side: "user" | "ai";
  size?: number;
  /** When true, hover tooltip pops BELOW the chip instead of above. Set this
   *  for chips in the top half of the pitch so the tooltip stays inside the
   *  frame and doesn't collide with the card header. */
  tipBelow?: boolean;
}) {
  const ringColor = side === "user" ? "var(--chalk)" : "var(--floodlight)";
  if (!bp) {
    return (
      <div
        className="sw-pchip-empty"
        style={{ width: size, height: size }}
        title="empty slot"
      />
    );
  }
  const cat = bp.player.category;
  return (
    <div
      className="sw-pchip"
      style={{ width: size + 12, ["--ring" as string]: ringColor }}
      data-side={side}
    >
      <div
        className="sw-pchip-photo"
        style={{
          width: size,
          height: size,
          boxShadow: `0 0 0 1.5px ${ringColor}`,
        }}
      >
        <img
          src={bp.player.photo_path}
          alt=""
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <span
          className="sw-pchip-ovr sw-mono"
          style={{ borderColor: categoryAccent(cat), color: categoryAccent(cat) }}
        >
          {bp.player.overall}
        </span>
      </div>
      <span className="sw-pchip-name" title={bp.player.name}>
        {bp.player.name}
      </span>
      <div className={`sw-pchip-tip ${tipBelow ? "is-below" : "is-above"}`}>
        <span className="sw-pchip-tip-name">{bp.player.name}</span>
        <span className="sw-pchip-tip-meta sw-mono">
          {bp.player.primary_position} · OVR {bp.player.overall} · {fmtMoney(bp.price)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────── mini chalk pitch ───────────────────────────

function MiniPitch({
  starters,
  side,
}: {
  starters: StarterCell[];
  side: "user" | "ai";
}) {
  return (
    <div className="sw-mp" data-side={side}>
      <div className="sw-mp-lines" aria-hidden="true">
        <div className="sw-mp-mid" />
        <div className="sw-mp-circ" />
        <div className="sw-mp-box-top" />
        <div className="sw-mp-box-bot" />
      </div>
      {starters.map(({ slot, bp }, idx) => (
        <div
          key={slot.id}
          className="sw-mp-slot"
          // Slot coords come from a 100×140 grid (the same one SquadBuilder uses).
          // Scale y down to 0..100% so it lands inside our 1:1.35 mini-pitch frame.
          style={{
            left: `${slot.x}%`,
            top: `${(slot.y / 140) * 100}%`,
            animationDelay: `${idx * 40}ms`,
          }}
        >
          {/* Slot above the pitch midline → tooltip below (so it doesn't collide
              with the squad card header). Below midline → tooltip above. */}
          <PlayerChip bp={bp} side={side} size={46} tipBelow={slot.y < 70} />
          <span
            className="sw-mp-pos"
            style={{ color: categoryAccent(slot.cat) }}
          >
            {slot.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── bench strip ───────────────────────────

function BenchStrip({
  bench,
  side,
}: {
  bench: (BoughtPlayer | null)[];
  side: "user" | "ai";
}) {
  return (
    <div className="sw-bench">
      {bench.map((bp, i) => (
        <div key={i} className="sw-bench-cell">
          <PlayerChip bp={bp} side={side} size={38} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────── comparison bar (one category) ───────────────────────────

function CategoryBar({
  cat,
  revealed,
  delayMs,
}: {
  cat: VerdictCategory;
  revealed: boolean;
  delayMs: number;
}) {
  const total = Math.max(1, cat.user + cat.ai);
  const userPct = Math.round((cat.user / total) * 100);
  const aiPct = 100 - userPct;
  const winsUser = cat.winner === "user";
  const winsAi = cat.winner === "ai";
  const rowClass = `sw-cmp-row ${winsUser ? "is-win-user" : winsAi ? "is-win-ai" : ""}`;
  return (
    <div className={rowClass} style={{ transitionDelay: `${delayMs}ms` }}>
      <span className="sw-cmp-label">{cat.name}</span>
      <span
        className={`sw-cmp-num sw-mono ${winsUser ? "sw-cmp-num-win-user" : ""}`}
      >
        {cat.user}
      </span>
      <div className="sw-cmp-bar">
        <div
          className="sw-cmp-fill-user"
          style={{
            width: revealed ? `${userPct}%` : "0%",
            opacity: winsUser ? 1 : 0.45,
            transitionDelay: `${delayMs}ms`,
          }}
        />
        <div className="sw-cmp-gap" />
        <div
          className="sw-cmp-fill-ai"
          style={{
            width: revealed ? `${aiPct}%` : "0%",
            opacity: winsAi ? 1 : 0.45,
            transitionDelay: `${delayMs}ms`,
          }}
        />
      </div>
      <span
        className={`sw-cmp-num sw-mono ${winsAi ? "sw-cmp-num-win-ai" : ""}`}
        style={{ textAlign: "left" }}
      >
        {cat.ai}
      </span>
      <span
        className="sw-cmp-arrow"
        style={{
          color: winsUser
            ? "var(--chalk)"
            : winsAi
            ? "var(--floodlight)"
            : "var(--dim)",
          transform: winsAi ? "scaleX(1)" : "scaleX(-1)",
        }}
      >
        →
      </span>
    </div>
  );
}

// ─────────────────────────── shareable card ───────────────────────────

function ShareableCard({
  matchId,
  verdict,
  formation,
  topSignings,
}: {
  matchId: string;
  verdict: { winner: "user" | "ai" | "draw"; score: { user: number; ai: number }; userChem: number };
  formation: string;
  topSignings: BoughtPlayer[];     // user's 3 priciest, for the flex chips
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    const text =
      verdict.winner === "user"
        ? `Won my SquadWars match ${verdict.score.user}-${verdict.score.ai} (${formation}, chem ${verdict.userChem}). match: ${matchId}`
        : verdict.winner === "ai"
        ? `Lost my SquadWars match ${verdict.score.ai}-${verdict.score.user} (${formation}). match: ${matchId}`
        : `Drew my SquadWars match (${formation}). match: ${matchId}`;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }).catch(() => undefined);
    }
  };

  const medal =
    verdict.winner === "user" ? "★" : verdict.winner === "ai" ? "✕" : "≈";
  const medalClass =
    verdict.winner === "user" ? "is-win" : verdict.winner === "ai" ? "is-lose" : "is-draw";

  return (
    <div className="sw-share">
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-share-medal-wrap">
        <span className={`sw-share-medal ${medalClass}`}>{medal}</span>
      </div>
      <div className="sw-share-body">
        <div className="sw-eyebrow">SHAREABLE CARD</div>
        <div className="sw-share-line">
          <span style={{ color: "var(--chalk)", fontWeight: 800 }}>YOU</span>
          <span className="sw-mono" style={{ margin: "0 8px" }}>
            {verdict.score.user}–{verdict.score.ai}
          </span>
          <span style={{ color: "var(--floodlight)", fontWeight: 800 }}>AI</span>
          <span style={{ color: "var(--muted)", marginLeft: 12 }}>
            · {formation} · CHEM {verdict.userChem}
          </span>
        </div>
        {topSignings.length > 0 && (
          <div className="sw-share-chips">
            <span className="sw-eyebrow sw-eyebrow-dim" style={{ fontSize: 9 }}>
              MARQUEE SIGNINGS
            </span>
            {topSignings.map((b) => (
              <span key={b.player.id} className="sw-share-chip">
                <span className="sw-share-chip-name">{b.player.name}</span>
                <span className="sw-share-chip-price sw-mono">{fmtMoney(b.price)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`sw-btn sw-share-btn ${copied ? "is-copied" : ""}`}
        onClick={onCopy}
        aria-live="polite"
      >
        {copied ? "COPIED  ✓" : "COPY MATCH CARD"}
      </button>
    </div>
  );
}

// ─────────────────────────── banner side ───────────────────────────

function BannerSide({
  label,
  formation,
  ovr,
  chem,
  wins,
  accent,
  align = "left",
}: {
  label: string;
  formation: string;
  ovr: number;
  chem: number;
  wins: boolean;
  accent: "chalk" | "floodlight";
  align?: "left" | "right";
}) {
  const color = accent === "chalk" ? "var(--chalk)" : "var(--floodlight)";
  return (
    <div
      className="sw-banner-side"
      style={{
        textAlign: align,
        background: wins
          ? accent === "chalk"
            ? "var(--chalk-soft)"
            : "var(--floodlight-soft)"
          : "var(--surface-2)",
        borderColor: wins ? color : "var(--hairline-strong)",
      }}
    >
      <div className="sw-banner-side-eyebrow" style={{ color }}>{label}</div>
      <div className="sw-banner-side-fmt">{formation}</div>
      <div className="sw-banner-side-stats sw-mono">
        OVR <span style={{ color: "var(--text)", fontWeight: 700 }}>{ovr}</span>
        <span style={{ color: "var(--dim)", margin: "0 6px" }}>·</span>
        CHEM <span style={{ color: "var(--text)", fontWeight: 700 }}>{chem}</span>
      </div>
    </div>
  );
}

// ─────────────────────────── squad column ───────────────────────────

function SquadColumn({
  title,
  accent,
  starters,
  bench,
  side,
  totalSpent,
  isWinner,
}: {
  title: string;
  accent: "chalk" | "floodlight";
  starters: StarterCell[];
  bench: (BoughtPlayer | null)[];
  side: "user" | "ai";
  totalSpent: number;
  isWinner: boolean;
}) {
  const color = accent === "chalk" ? "var(--chalk)" : "var(--floodlight)";
  return (
    <div className={`sw-squad-card ${isWinner ? "is-winner" : ""}`} data-side={side}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-squad-header">
        <span className="sw-eyebrow" style={{ color }}>{title}</span>
        <span className="sw-squad-spent sw-mono">SPENT {fmtMoney(totalSpent)}</span>
      </div>
      <MiniPitch starters={starters} side={side} />
      <div className="sw-bench-row">
        <span className="sw-eyebrow sw-eyebrow-dim" style={{ marginRight: 8 }}>BENCH</span>
        <BenchStrip bench={bench} side={side} />
      </div>
    </div>
  );
}

// ─────────────────────────── main ───────────────────────────

export default function ResultScreen({
  payload,
  userBought,
  formation,
  difficulty,
  matchId,
}: ResultScreenProps) {
  const { verdict, userSquad, aiSquad, userTotalSpent, aiTotalSpent } = payload;

  const userStarters = resolveStarters(userSquad, userBought, formation);
  const aiStarters = resolveStarters(aiSquad, payload.aiBought, formation);
  const userBench = resolveBench(userSquad, userBought);
  const aiBench = resolveBench(aiSquad, payload.aiBought);

  const winText =
    verdict.winner === "user" ? "YOU WIN" : verdict.winner === "ai" ? "AI WINS" : "DRAW";
  const winColor =
    verdict.winner === "user"
      ? "var(--chalk)"
      : verdict.winner === "ai"
      ? "var(--floodlight)"
      : "var(--muted)";

  // Drives the comparison-bar fill animation. Mount → false; tick later → true.
  // Each bar reads this and transitions width from 0 → target with stagger.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setRevealed(true), 240);
    return () => window.clearTimeout(t);
  }, []);

  // Top-3 user signings by price → flexed on the share card.
  const topSignings = [...userBought]
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  return (
    <div className="sw-result">
      <style>{tokens}</style>
      <div className="sw-result-page">

        {/* ─── TOP BAR ─── */}
        <div className="sw-top">
          <div>
            <div className="sw-brand">SQUADWARS</div>
            <div className="sw-brand-tag">MATCH · RESULT</div>
          </div>
          <div className="sw-top-meta">
            <span className="v">{formation}</span>
            <span className="v v-flood">{difficulty.toUpperCase()}</span>
            <span className="v v-mono">{matchId}</span>
            <Link href="/" className="sw-btn">HOME</Link>
          </div>
        </div>

        {/* ─── VERDICT BANNER ─── */}
        <div className="sw-banner sw-reveal" style={{ animationDelay: "60ms" }}>
          <BannerSide
            label="YOU"
            formation={formation}
            ovr={verdict.userOverall}
            chem={verdict.userChem}
            wins={verdict.winner === "user"}
            accent="chalk"
          />
          <div
            className={`sw-banner-mid ${verdict.winner !== "draw" ? "sw-banner-mid-pulse" : ""}`}
            data-winner={verdict.winner}
          >
            <div className="sw-eyebrow">VERDICT</div>
            <div className="sw-banner-win" style={{ color: winColor }}>
              {winText}
            </div>
            <div className="sw-banner-score sw-mono">
              {verdict.score.user} – {verdict.score.ai}
            </div>
            <div className="sw-banner-shimmer" aria-hidden="true" />
          </div>
          <BannerSide
            label="AI"
            formation={formation}
            ovr={verdict.aiOverall}
            chem={verdict.aiChem}
            wins={verdict.winner === "ai"}
            accent="floodlight"
            align="right"
          />
        </div>

        {/* ─── BOTH SQUADS SIDE-BY-SIDE ─── */}
        <div className="sw-squads sw-reveal" style={{ animationDelay: "140ms" }}>
          <SquadColumn
            title="YOUR XI"
            accent="chalk"
            starters={userStarters}
            bench={userBench}
            side="user"
            totalSpent={userTotalSpent}
            isWinner={verdict.winner === "user"}
          />
          <SquadColumn
            title="AI XI"
            accent="floodlight"
            starters={aiStarters}
            bench={aiBench}
            side="ai"
            totalSpent={aiTotalSpent}
            isWinner={verdict.winner === "ai"}
          />
        </div>

        {/* ─── COMPARISON BARS ─── */}
        <div className="sw-cmp sw-reveal" style={{ animationDelay: "220ms" }}>
          <span className="sw-tick-tl" /><span className="sw-tick-tr" />
          <span className="sw-tick-bl" /><span className="sw-tick-br" />
          <div className="sw-eyebrow" style={{ marginBottom: 10 }}>HEAD TO HEAD</div>
          {verdict.categories.map((c, i) => (
            <CategoryBar
              key={c.name}
              cat={c}
              revealed={revealed}
              delayMs={i * 90}
            />
          ))}
        </div>

        {/* ─── REPORT + ROAST ─── */}
        <div className="sw-prose sw-reveal" style={{ animationDelay: "320ms" }}>
          <div className="sw-report sw-card">
            <span className="sw-tick-tl" /><span className="sw-tick-tr" />
            <span className="sw-tick-bl" /><span className="sw-tick-br" />
            <div className="sw-eyebrow">SQUAD REPORT</div>
            <p className="sw-report-body">{verdict.report || "— no report available —"}</p>
          </div>
          <div className="sw-roast sw-card">
            <span className="sw-tick-tl" /><span className="sw-tick-tr" />
            <span className="sw-tick-bl" /><span className="sw-tick-br" />
            <div className="sw-eyebrow" style={{ color: "var(--floodlight)" }}>
              {verdict.personaName.toUpperCase()} ·{" "}
              {verdict.winner === "ai" ? "ROAST" : verdict.winner === "user" ? "TIPS HIS CAP" : "TAKEAWAY"}
            </div>
            <p className="sw-roast-body">{verdict.roast || "— no remarks —"}</p>
          </div>
        </div>

        {/* ─── SHAREABLE ─── */}
        <div className="sw-reveal" style={{ animationDelay: "420ms" }}>
          <ShareableCard
            matchId={matchId}
            verdict={verdict}
            formation={formation}
            topSignings={topSignings}
          />
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────── style tokens ───────────────────────────

const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
  html, body { margin: 0; padding: 0; }

  .sw-result {
    --ink: #0B1018;
    --surface-1: #131A24;
    --surface-2: #0F1620;
    --surface-3: #1A2230;
    --chalk: #F2EDE0;
    --chalk-soft: rgba(242, 237, 224, 0.10);
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
    --r-sm: 4px; --r-md: 8px; --r-lg: 12px;

    background:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(255, 182, 39, 0.035), transparent 70%),
      radial-gradient(ellipse 70% 50% at 85% 100%, rgba(242, 237, 224, 0.025), transparent 70%),
      var(--ink);
    color: var(--text);
    font-family: var(--font-body);
    min-height: 100vh;
    width: 100%;
    padding: 18px 22px 28px;
    box-sizing: border-box;
  }
  .sw-result *, .sw-result *::before, .sw-result *::after { box-sizing: border-box; }
  .sw-result button { font-family: inherit; cursor: pointer; }

  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .sw-eyebrow {
    font-family: var(--font-display); font-weight: 700;
    font-size: 10px; letter-spacing: 0.22em;
    color: var(--muted); text-transform: uppercase;
  }
  .sw-eyebrow-dim { color: var(--dim); }
  .sw-card {
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 12px;
    position: relative;
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
    font-family: var(--font-display); font-weight: 700;
    letter-spacing: 0.10em; text-transform: uppercase; font-size: 11px;
    padding: 7px 12px; background: var(--surface-3); color: var(--text);
    border: 1px solid var(--hairline-strong); border-radius: var(--r-md);
    transition: background 0.12s ease;
    text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
  }
  .sw-btn:hover { background: #232C3D; }

  .sw-result-page {
    max-width: 1280px; margin: 0 auto;
    display: flex; flex-direction: column; gap: 14px;
  }

  .sw-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 4px 4px; }
  .sw-brand {
    font-family: var(--font-display); font-size: 22px; font-weight: 800;
    letter-spacing: 0.16em; color: var(--chalk); text-transform: uppercase; line-height: 1;
  }
  .sw-brand-tag {
    font-family: var(--font-display); font-size: 9px; font-weight: 700;
    letter-spacing: 0.30em; color: var(--dim); text-transform: uppercase; margin-top: 4px;
  }
  .sw-top-meta {
    display: inline-flex; align-items: center; gap: 10px;
    font-family: var(--font-display); font-size: 10px; letter-spacing: 0.18em;
    color: var(--muted); text-transform: uppercase;
  }
  .sw-top-meta .v {
    color: var(--chalk); background: var(--chalk-soft);
    border: 1px solid var(--hairline-strong); border-radius: var(--r-sm);
    padding: 4px 8px; font-weight: 700;
  }
  .sw-top-meta .v-flood {
    color: var(--floodlight); background: var(--floodlight-soft);
    border-color: rgba(255,182,39,0.30);
  }
  .sw-top-meta .v-mono {
    font-family: var(--font-mono); text-transform: none;
    letter-spacing: 0.02em; font-size: 10px;
  }

  /* ─── verdict banner ─── */
  .sw-banner {
    display: grid;
    grid-template-columns: 1fr 0.85fr 1fr;
    gap: 12px;
    align-items: stretch;
  }
  .sw-banner-side {
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    padding: 14px 16px;
    transition: border-color 0.18s ease;
  }
  .sw-banner-side-eyebrow {
    font-family: var(--font-display); font-weight: 800;
    letter-spacing: 0.26em; font-size: 11px; text-transform: uppercase;
  }
  .sw-banner-side-fmt {
    font-family: var(--font-display); font-weight: 700;
    font-size: 22px; letter-spacing: 0.10em;
    color: var(--text); margin-top: 4px;
  }
  .sw-banner-side-stats {
    font-size: 13px; color: var(--muted); margin-top: 8px;
  }
  .sw-banner-mid {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 4px;
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-lg);
    padding: 10px 14px;
    position: relative;
    overflow: hidden;
  }
  .sw-banner-mid[data-winner="user"] {
    background: var(--chalk-soft);
    border-color: rgba(242,237,224,0.45);
  }
  .sw-banner-mid[data-winner="ai"] {
    background: var(--floodlight-soft);
    border-color: rgba(255,182,39,0.45);
  }
  .sw-banner-mid[data-winner="draw"] {
    background: var(--surface-2);
  }
  .sw-banner-win {
    font-family: var(--font-display); font-weight: 800;
    letter-spacing: 0.18em; font-size: 30px; line-height: 1.05;
    text-transform: uppercase;
    position: relative; z-index: 2;
  }
  .sw-banner-mid-pulse .sw-banner-win {
    animation: sw-pulse 2.2s cubic-bezier(.4,0,.2,1) infinite;
  }
  .sw-banner-score {
    font-size: 17px; color: var(--text); font-weight: 700;
    position: relative; z-index: 2;
  }
  /* slow diagonal sheen that rakes across the winner cell */
  .sw-banner-shimmer {
    position: absolute; inset: 0;
    background:
      linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%);
    background-size: 300% 100%;
    background-position: 200% 50%;
    pointer-events: none;
    z-index: 1;
  }
  .sw-banner-mid-pulse .sw-banner-shimmer {
    animation: sw-sheen 4.5s linear infinite;
  }
  @keyframes sw-pulse {
    0%, 100% { transform: scale(1); }
    50%      { transform: scale(1.03); }
  }
  @keyframes sw-sheen {
    0%   { background-position: 200% 50%; }
    100% { background-position: -100% 50%; }
  }

  /* ─── squads ─── */
  .sw-squads {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  @media (max-width: 980px) { .sw-squads { grid-template-columns: 1fr; } }
  .sw-squad-card {
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px;
    position: relative;
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
  }
  .sw-squad-card.is-winner[data-side="user"] {
    border-color: rgba(242,237,224,0.32);
    box-shadow: 0 0 0 1px rgba(242,237,224,0.08), 0 12px 36px rgba(242,237,224,0.05);
  }
  .sw-squad-card.is-winner[data-side="ai"] {
    border-color: rgba(255,182,39,0.32);
    box-shadow: 0 0 0 1px rgba(255,182,39,0.10), 0 12px 36px rgba(255,182,39,0.07);
  }
  .sw-squad-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 8px;
  }
  .sw-squad-spent { font-size: 11px; color: var(--muted); letter-spacing: 0.12em; }

  /* ─── mini pitch ─── */
  .sw-mp {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1.35;
    max-height: 460px;
    background:
      linear-gradient(180deg, rgba(15,22,32,0.30) 0%, rgba(15,22,32,0.0) 8%, rgba(15,22,32,0.0) 92%, rgba(15,22,32,0.30) 100%),
      var(--surface-2);
    border: 1px dashed var(--hairline-strong);
    border-radius: var(--r-md);
    /* overflow stays visible so hover tooltips on edge slots aren't clipped.
       Chalk lines are positioned with explicit insets so they can't escape. */
  }
  .sw-mp[data-side="user"] {
    box-shadow: inset 0 0 0 1px rgba(242, 237, 224, 0.06);
  }
  .sw-mp[data-side="ai"] {
    box-shadow: inset 0 0 0 1px rgba(255, 182, 39, 0.06);
  }
  .sw-mp-lines { position: absolute; inset: 0; pointer-events: none; opacity: 0.16; }
  .sw-mp-mid {
    position: absolute; left: 0; right: 0; top: 50%;
    border-top: 1px dashed var(--chalk);
  }
  .sw-mp-circ {
    position: absolute; left: 50%; top: 50%;
    width: 78px; height: 78px;
    transform: translate(-50%, -50%);
    border: 1px dashed var(--chalk);
    border-radius: 50%;
  }
  .sw-mp-box-top {
    position: absolute; left: 22%; right: 22%; top: 0; height: 14%;
    border: 1px dashed var(--chalk); border-top: none;
  }
  .sw-mp-box-bot {
    position: absolute; left: 22%; right: 22%; bottom: 0; height: 14%;
    border: 1px dashed var(--chalk); border-bottom: none;
  }
  .sw-mp-slot {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    opacity: 0;
    animation: sw-chip-pop 0.42s cubic-bezier(.34,1.56,.64,1) forwards;
    will-change: transform, opacity;
  }
  @keyframes sw-chip-pop {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.7); }
    60%  { opacity: 1; transform: translate(-50%, -50%) scale(1.06); }
    100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }
  .sw-mp-pos {
    font-family: var(--font-display); font-weight: 700;
    font-size: 9px; letter-spacing: 0.16em;
    margin-top: -3px;
    background: rgba(11,16,24,0.55);
    padding: 1px 5px 0;
    border-radius: 3px;
  }

  /* ─── player chip ─── */
  .sw-pchip {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    position: relative;
    transition: transform 0.18s ease, filter 0.18s ease;
    cursor: default;
  }
  .sw-pchip:hover {
    transform: translateY(-2px) scale(1.06);
    filter: drop-shadow(0 6px 14px rgba(0,0,0,0.55))
            drop-shadow(0 0 10px var(--ring));
    z-index: 4;
  }
  .sw-pchip-photo {
    border-radius: 50%; overflow: hidden;
    background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, #F2EDE0 45%, #DCD7C8 100%);
    display: flex; align-items: center; justify-content: center;
    position: relative;
    transition: box-shadow 0.18s ease;
  }
  .sw-pchip-photo img {
    width: 112%; height: 112%; object-fit: cover; object-position: 50% 25%;
    display: block;
  }
  .sw-pchip-ovr {
    position: absolute; right: -3px; bottom: -3px;
    background: var(--ink);
    border: 1px solid;
    border-radius: 6px;
    padding: 0 4px;
    font-size: 9.5px; font-weight: 700; line-height: 14px;
    min-width: 18px; text-align: center;
  }
  .sw-pchip-name {
    font-family: var(--font-display); font-weight: 700;
    font-size: 9.5px; letter-spacing: 0.06em;
    color: var(--text); text-transform: uppercase;
    max-width: 84px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sw-pchip-empty {
    border-radius: 50%;
    border: 1px dashed var(--hairline-strong);
    background: var(--surface-2);
  }
  /* hover tooltip — direction-aware to avoid clipping at pitch edges */
  .sw-pchip-tip {
    position: absolute;
    left: 50%;
    background: rgba(11,16,24,0.97);
    border: 1px solid var(--ring, var(--hairline-strong));
    border-radius: var(--r-md);
    padding: 6px 10px;
    display: flex; flex-direction: column; gap: 2px;
    white-space: nowrap;
    opacity: 0; pointer-events: none;
    transition: opacity 0.16s ease, transform 0.16s ease;
    z-index: 10;
    box-shadow: 0 12px 32px rgba(0,0,0,0.6);
  }
  /* Top-half slot (ATT / upper MID) — pop tooltip BELOW the chip+name+pos. */
  .sw-pchip-tip.is-below {
    top: calc(100% + 4px);
    transform: translateX(-50%) translateY(-4px);
  }
  .sw-pchip:hover .sw-pchip-tip.is-below {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  /* Bottom-half slot (DEF / GK / lower MID) — pop tooltip ABOVE the chip. */
  .sw-pchip-tip.is-above {
    bottom: calc(100% + 6px);
    transform: translateX(-50%) translateY(4px);
  }
  .sw-pchip:hover .sw-pchip-tip.is-above {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
  .sw-pchip-tip-name {
    font-family: var(--font-display); font-weight: 800;
    font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
    color: var(--text);
  }
  .sw-pchip-tip-meta {
    font-size: 10px;
    color: var(--muted);
  }

  /* ─── bench ─── */
  .sw-bench-row {
    display: flex; align-items: center; gap: 10px;
    margin-top: 12px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
  }
  .sw-bench {
    display: flex; gap: 12px; flex: 1; justify-content: space-around;
  }
  .sw-bench-cell {
    display: flex; align-items: center; justify-content: center;
  }

  /* ─── comparison bars ─── */
  .sw-cmp {
    position: relative;
    background: var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 16px 20px;
  }
  .sw-cmp-row {
    display: grid;
    grid-template-columns: 110px 38px 1fr 38px 18px;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    font-size: 13px;
    margin: 0 -10px;
    border-radius: var(--r-md);
    background: transparent;
    transition: background 0.4s ease;
  }
  .sw-cmp-row.is-win-user {
    background: linear-gradient(90deg, rgba(242,237,224,0.06), rgba(242,237,224,0.0) 75%);
  }
  .sw-cmp-row.is-win-ai {
    background: linear-gradient(270deg, rgba(255,182,39,0.06), rgba(255,182,39,0.0) 75%);
  }
  .sw-cmp-label {
    font-family: var(--font-display); font-weight: 700;
    font-size: 11px; letter-spacing: 0.18em;
    color: var(--muted); text-transform: uppercase;
  }
  .sw-cmp-num {
    font-size: 14px; color: var(--text); text-align: right;
  }
  .sw-cmp-num-win-user { color: var(--chalk); font-weight: 700; }
  .sw-cmp-num-win-ai { color: var(--floodlight); font-weight: 700; }
  .sw-cmp-bar {
    display: flex; height: 9px;
    border-radius: 5px; overflow: hidden;
    background: var(--surface-2);
    box-shadow: inset 0 1px 0 rgba(0,0,0,0.25);
  }
  .sw-cmp-fill-user {
    background: linear-gradient(90deg, var(--chalk) 60%, #FFFFFF);
    transition: width 0.9s cubic-bezier(.22,1,.36,1), opacity 0.4s ease;
    box-shadow: 0 0 8px rgba(242,237,224,0.25);
  }
  .sw-cmp-fill-ai {
    background: linear-gradient(270deg, var(--floodlight) 60%, #FFD976);
    transition: width 0.9s cubic-bezier(.22,1,.36,1), opacity 0.4s ease;
    box-shadow: 0 0 8px rgba(255,182,39,0.30);
  }
  .sw-cmp-gap { width: 2px; background: var(--ink); }
  .sw-cmp-arrow {
    display: inline-block; font-family: var(--font-display);
    font-weight: 800; font-size: 18px;
    transition: text-shadow 0.4s ease;
  }
  .sw-cmp-row.is-win-user .sw-cmp-arrow {
    text-shadow: 0 0 12px rgba(242,237,224,0.5);
  }
  .sw-cmp-row.is-win-ai .sw-cmp-arrow {
    text-shadow: 0 0 12px rgba(255,182,39,0.55);
  }

  /* ─── prose ─── */
  .sw-prose {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  @media (max-width: 980px) { .sw-prose { grid-template-columns: 1fr; } }
  .sw-report-body, .sw-roast-body {
    font-size: 14px; line-height: 1.55;
    margin: 8px 0 0; color: var(--text);
  }
  .sw-roast-body {
    font-style: italic;
    color: var(--chalk);
  }

  /* ─── shareable strip ─── */
  .sw-share {
    background:
      radial-gradient(ellipse 80% 60% at 0% 0%, rgba(242,237,224,0.06), transparent 60%),
      radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,182,39,0.06), transparent 60%),
      var(--surface-1);
    border: 1px solid var(--hairline);
    border-radius: var(--r-lg);
    padding: 14px 18px;
    display: flex; align-items: center; gap: 18px;
    position: relative;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }
  .sw-share:hover {
    transform: translateY(-2px);
    border-color: var(--hairline-strong);
    box-shadow: 0 14px 38px rgba(0,0,0,0.45);
  }
  .sw-share-medal-wrap {
    display: flex; align-items: center; justify-content: center;
    width: 54px; height: 54px;
    border-radius: 50%;
    background: var(--surface-2);
    border: 1px solid var(--hairline-strong);
    flex: 0 0 auto;
    position: relative;
  }
  .sw-share-medal {
    font-family: var(--font-display);
    font-size: 26px;
    line-height: 1;
    font-weight: 800;
  }
  .sw-share-medal.is-win {
    color: var(--chalk);
    text-shadow: 0 0 14px rgba(242,237,224,0.6);
  }
  .sw-share-medal.is-lose {
    color: var(--floodlight);
    text-shadow: 0 0 14px rgba(255,182,39,0.55);
  }
  .sw-share-medal.is-draw {
    color: var(--muted);
  }
  .sw-share-body { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .sw-share-line {
    font-family: var(--font-display); font-size: 17px;
    letter-spacing: 0.10em; text-transform: uppercase;
    margin-top: 2px;
  }
  .sw-share-chips {
    display: flex; align-items: center; flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }
  .sw-share-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 8px 2px;
    background: var(--surface-2);
    border: 1px solid var(--hairline-strong);
    border-radius: 999px;
    font-family: var(--font-display); font-weight: 700;
    font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--text);
    transition: border-color 0.16s ease, transform 0.16s ease;
  }
  .sw-share-chip:hover {
    border-color: rgba(242,237,224,0.40);
    transform: translateY(-1px);
  }
  .sw-share-chip-price {
    color: var(--floodlight);
    font-size: 10px;
  }
  .sw-share-btn {
    padding: 10px 18px;
    font-size: 11px;
    min-width: 170px;
    position: relative;
    overflow: hidden;
    flex: 0 0 auto;
  }
  .sw-share-btn.is-copied {
    background: var(--chalk);
    color: var(--ink);
    border-color: var(--chalk);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 8px 26px rgba(242,237,224,0.30);
  }

  /* ─── reveal animation (used on top-level sections) ─── */
  .sw-reveal {
    opacity: 0;
    transform: translateY(14px);
    animation: sw-rev-in 0.55s cubic-bezier(.22,1,.36,1) forwards;
  }
  @keyframes sw-rev-in {
    to { opacity: 1; transform: translateY(0); }
  }

  /* respect reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sw-reveal, .sw-mp-slot, .sw-banner-mid-pulse .sw-banner-win,
    .sw-banner-mid-pulse .sw-banner-shimmer {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
    .sw-cmp-fill-user, .sw-cmp-fill-ai, .sw-cmp-row, .sw-share {
      transition: none !important;
    }
  }
`;
