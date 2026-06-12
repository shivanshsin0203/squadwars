"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Category, LotStateDTO, MatchStateDTO, BidEntry } from "@/lib/types";
import { fmtCountdown, fmtMoney } from "@/lib/format";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

type LotEndResp = MatchStateDTO & {
  lotResult?: {
    winner: "user" | "ai" | null;
    price: number;
    reconShotFired: boolean;
    matchComplete: boolean;
  };
};

// 4-3-3 starting XI = 1 GK + 4 DEF + 3 MID + 3 ATT = 11 players.
const BUCKETS: Array<{ key: Category; label: string; target: number }> = [
  { key: "ATT", label: "Attack", target: 3 },
  { key: "MID", label: "Midfield", target: 3 },
  { key: "DEF", label: "Defence", target: 4 },
  { key: "GK", label: "Goalkeeper", target: 1 },
];

/** Bucket fill tier color per user spec. */
function bucketFillColor(filled: number, target: number): string {
  if (filled >= target) return "var(--chalk)";
  if (target % 2 === 0 && filled === target / 2) return "var(--floodlight)";
  if (filled * 2 > target) return "var(--chalk)";
  return "var(--whistle)";
}

const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

  .sw-auction {
    /* palette — stadium at night, not generic dashboard */
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
    --text: #EFEFEF;
    --muted: #9099A8;
    --dim: #5C6573;
    --hairline: rgba(255, 255, 255, 0.06);
    --hairline-strong: rgba(255, 255, 255, 0.10);

    /* type — Saira Condensed for displays/numerals, Inter body, JetBrains Mono for tabular prices */
    --font-display: 'Saira Condensed', 'Arial Narrow', sans-serif;
    --font-body: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    --font-mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;

    /* shape */
    --r-sm: 4px;
    --r-md: 8px;
    --r-lg: 12px;

    background:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(255, 182, 39, 0.035), transparent 70%),
      radial-gradient(ellipse 70% 50% at 85% 100%, rgba(242, 237, 224, 0.025), transparent 70%),
      var(--ink);
    color: var(--text);
    font-family: var(--font-body);
    min-height: 100vh;
    width: 100%;
    padding: 10px 14px 12px;
    box-sizing: border-box;
    overflow-x: hidden;
  }
  .sw-auction *, .sw-auction *::before, .sw-auction *::after { box-sizing: border-box; }
  .sw-auction button { font-family: inherit; cursor: pointer; }
  .sw-auction button:disabled { opacity: 0.35; cursor: not-allowed; }

  .sw-display { font-family: var(--font-display); letter-spacing: 0.01em; }
  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* eyebrow — small caps label, encodes section role */
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
    padding: 14px;
    position: relative;
  }
  .sw-sunken {
    background: var(--surface-2);
    border: 1px solid var(--hairline);
    border-radius: var(--r-md);
  }
  .sw-corner-mark {
    position: absolute; top: 10px; right: 12px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--dim); letter-spacing: 0.08em;
  }

  /* signature: split-flap clock */
  .sw-flap {
    display: inline-block; position: relative;
    width: 0.62em; overflow: hidden;
    vertical-align: top;
  }
  .sw-flap-inner {
    display: inline-block;
    animation: sw-flap-down 0.36s cubic-bezier(0.5, 0, 0.5, 1) both;
    transform-origin: 50% 0%;
  }
  @keyframes sw-flap-down {
    0%   { transform: rotateX(-90deg); opacity: 0; }
    60%  { opacity: 1; }
    100% { transform: rotateX(0deg); opacity: 1; }
  }

  /* ticker entry */
  @keyframes sw-tick-in {
    0%   { transform: translateY(-12px); opacity: 0; clip-path: inset(0 0 100% 0); }
    100% { transform: translateY(0); opacity: 1; clip-path: inset(0 0 0% 0); }
  }
  .sw-tick { animation: sw-tick-in 0.42s cubic-bezier(0.2, 0.8, 0.2, 1); }

  /* progress / fill */
  .sw-bar { height: 3px; background: var(--surface-3); border-radius: 1.5px; overflow: hidden; }
  .sw-bar-fill { height: 100%; border-radius: 1.5px; transition: width 0.3s ease; }

  /* buttons */
  .sw-btn {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    font-size: 13px;
    padding: 9px 12px;
    background: var(--surface-3);
    color: var(--text);
    border: 1px solid var(--hairline-strong);
    border-radius: var(--r-md);
    transition: background 0.12s ease, transform 0.05s ease;
  }
  .sw-btn:hover:not(:disabled) { background: #232C3D; }
  .sw-btn:active:not(:disabled) { transform: translateY(1px); }

  .sw-btn-bid {
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 6px 18px rgba(242, 237, 224, 0.18);
    letter-spacing: 0.18em;
  }
  .sw-btn-bid:hover:not(:disabled) { background: #FFFCF2; }

  /* chip — used for alt positions, micro-stats */
  .sw-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 8px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.10em;
    text-transform: uppercase;
    background: var(--surface-3);
    border: 1px solid var(--hairline);
    border-radius: var(--r-sm);
    color: var(--muted);
  }

  /* live dot */
  .sw-live-dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--whistle);
    box-shadow: 0 0 8px var(--whistle);
    animation: sw-pulse 1.4s ease-in-out infinite;
    flex: 0 0 auto;
  }
  @keyframes sw-pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.9); }
    50%      { opacity: 1; transform: scale(1.15); }
  }

  /* layout: full viewport, 3 columns */
  .sw-grid {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(520px, 2.05fr) minmax(290px, 1.05fr);
    gap: 10px;
    height: calc(100vh - 70px);
    min-height: 620px;
  }
  @media (max-width: 1180px) {
    .sw-grid { grid-template-columns: 1fr; height: auto; }
  }
  .sw-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
  .sw-scroll { overflow-y: auto; min-height: 0; }
  .sw-scroll::-webkit-scrollbar { width: 5px; }
  .sw-scroll::-webkit-scrollbar-track { background: transparent; }
  .sw-scroll::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 2.5px; }

  /* hairline frame — corner ticks, broadcast lower-third feel */
  .sw-tick-tl, .sw-tick-tr, .sw-tick-bl, .sw-tick-br {
    position: absolute; width: 10px; height: 10px;
    border-color: var(--hairline-strong);
    pointer-events: none;
  }
  .sw-tick-tl { top: 6px; left: 6px; border-top: 1px solid; border-left: 1px solid; }
  .sw-tick-tr { top: 6px; right: 6px; border-top: 1px solid; border-right: 1px solid; }
  .sw-tick-bl { bottom: 6px; left: 6px; border-bottom: 1px solid; border-left: 1px solid; }
  .sw-tick-br { bottom: 6px; right: 6px; border-bottom: 1px solid; border-right: 1px solid; }
`;

export default function AuctionRoom({ matchId }: { matchId: string }) {
  const [state, setState] = useState<MatchStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bootStatus, setBootStatus] = useState<string>("connecting…");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [, force] = useState(0);
  const [lastResult, setLastResult] = useState<LotEndResp["lotResult"] | null>(null);

  const stateRef = useRef<MatchStateDTO | null>(null);
  const endedLotsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─────────────────────── API helpers ───────────────────────

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${BACKEND_URL}/api/match/${matchId}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      return data as MatchStateDTO | LotEndResp;
    },
    [matchId]
  );

  // ─────────────────────── boot ───────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        console.log(`[CLIENT:boot] matchId=${matchId} → GET /state`);
        setBootStatus("loading state…");
        const s0 = (await api("/state")) as MatchStateDTO;
        if (cancelled) return;
        console.log(`[CLIENT:state] status=${s0.status} lotState=${s0.lotState ? `lot ${s0.lotState.lotIndex}` : "null"}`);
        if (s0.status === "complete") {
          setState(s0);
          return;
        }
        if (!s0.lotState) {
          console.log("[CLIENT:boot] no lot open → POST /start");
          setBootStatus("opening lot 1…");
          const s1 = (await api("/start", { method: "POST", body: "{}" })) as MatchStateDTO;
          if (cancelled) return;
          console.log(`[CLIENT:start] lotIndex=${s1.lotState?.lotIndex} player=${s1.lotState?.player.name}`);
          setState(s1);
        } else {
          setState(s0);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, api]);

  // ─────────────────────── bid ───────────────────────

  const doBid = useCallback(
    async (amount: number) => {
      const cur = stateRef.current;
      if (!cur?.lotState) return;
      const lotIdx = cur.lotState.lotIndex;
      console.log(`[CLIENT:bid req] lot=${lotIdx} amount=${fmtMoney(amount)}`);
      try {
        const s = (await api("/bid", {
          method: "POST",
          body: JSON.stringify({ lotIndex: lotIdx, amount }),
        })) as MatchStateDTO;
        console.log(`[CLIENT:bid res] currentBid=${fmtMoney(s.lotState?.currentBid ?? 0)} highBidder=${s.lotState?.highBidder}`);
        setState(s);
      } catch (e) {
        const msg = String(e);
        console.warn(`[CLIENT:bid rej] ${msg}`);
        setBidError(msg);
        setTimeout(() => setBidError(null), 2500);
      }
    },
    [api]
  );

  const fireAi = useCallback(
    async (lotIdx: number, planId: string) => {
      console.log(`[CLIENT:aiFire req] lot=${lotIdx} planId=${planId}`);
      try {
        const s = (await api("/ai-fire", {
          method: "POST",
          body: JSON.stringify({ lotIndex: lotIdx, planId }),
        })) as MatchStateDTO;
        console.log(`[CLIENT:aiFire res] currentBid=${fmtMoney(s.lotState?.currentBid ?? 0)} highBidder=${s.lotState?.highBidder}`);
        setState(s);
      } catch (e) {
        console.warn(`[CLIENT:aiFire err]`, e);
      }
    },
    [api]
  );

  const callLotEnd = useCallback(
    async (lotIdx: number) => {
      console.log(`[CLIENT:lotEnd req] lot=${lotIdx}`);
      try {
        const s = (await api("/lot-end", {
          method: "POST",
          body: JSON.stringify({ lotIndex: lotIdx }),
        })) as LotEndResp;
        console.log(`[CLIENT:lotEnd res] winner=${s.lotResult?.winner} price=${fmtMoney(s.lotResult?.price ?? 0)} matchComplete=${s.lotResult?.matchComplete}`);
        setLastResult(s.lotResult ?? null);
        setTimeout(() => setLastResult(null), 4000);
        setState(s);
      } catch (e) {
        console.warn(`[CLIENT:lotEnd err]`, e);
      }
    },
    [api]
  );

  // ─────────────────────── AI timer (server-driven) ───────────────────────

  useEffect(() => {
    const plan = state?.lotState?.aiPlan;
    const lotIdx = state?.lotState?.lotIndex;
    if (!plan || lotIdx === undefined) return;
    console.log(`[CLIENT:aiFire scheduled] planId=${plan.planId} delayMs=${plan.delayMs}`);
    const t = window.setTimeout(() => {
      fireAi(lotIdx, plan.planId);
    }, plan.delayMs);
    return () => clearTimeout(t);
  }, [state?.lotState?.aiPlan?.planId, state?.lotState?.lotIndex, fireAi]);

  // ─────────────────────── countdown + lot-end trigger ───────────────────────

  useEffect(() => {
    const lot = state?.lotState;
    if (!lot) return;
    const lotIdx = lot.lotIndex;
    const tick = () => {
      force((n) => n + 1);
      const cur = stateRef.current;
      const curLot = cur?.lotState;
      if (!curLot || curLot.lotIndex !== lotIdx) return;
      const msLeft = curLot.expiresAt - Date.now();
      if (msLeft <= 0 && !endedLotsRef.current.has(lotIdx)) {
        endedLotsRef.current.add(lotIdx);
        callLotEnd(lotIdx);
      }
    };
    const i = window.setInterval(tick, 200);
    tick();
    return () => clearInterval(i);
  }, [state?.lotState?.lotIndex, state?.lotState?.expiresAt, callLotEnd]);

  // ─────────────────────── render ───────────────────────

  if (error) {
    return (
      <div style={{ padding: 24, color: "#E63946", fontFamily: "Inter, sans-serif" }}>
        Error: {error}
        <div>
          <Link href="/">← home</Link>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="sw-auction">
        <style dangerouslySetInnerHTML={{ __html: tokens }} />
        <p className="sw-eyebrow" style={{ padding: 12 }}>{bootStatus}</p>
      </div>
    );
  }

  if (state.status === "complete") {
    return <CompleteView state={state} />;
  }

  const lot = state.lotState;
  if (!lot) {
    return (
      <div className="sw-auction">
        <style dangerouslySetInnerHTML={{ __html: tokens }} />
        <p className="sw-eyebrow" style={{ padding: 12 }}>between lots…</p>
      </div>
    );
  }

  const userCounts = countByCategory(state.user.bought.map((b) => b.player.category));
  const msLeft = Math.max(0, lot.expiresAt - Date.now());
  const lowTime = msLeft < 5000;

  return (
    <div className="sw-auction">
      <style dangerouslySetInnerHTML={{ __html: tokens }} />

      <TopBar matchId={matchId} lotIndex={lot.lotIndex} lotsTotal={state.lotsTotal} lotsDone={state.lotsDone} />

      <div className="sw-grid">
        {/* LEFT — Dressing Room */}
        <div className="sw-col">
          <Treasury
            youBudget={state.user.budget}
            youBought={state.user.bought.length}
            aiBudget={state.ai.budget}
            aiBought={state.ai.boughtCount}
            totalSlots={BUCKETS.reduce((s, b) => s + b.target, 0)}
          />
          <DressingRoom bought={state.user.bought} counts={userCounts} />
        </div>

        {/* CENTRE — The Floor */}
        <div className="sw-col">
          <CountdownClock msLeft={msLeft} lowTime={lowTime} lotIndex={lot.lotIndex} lotsTotal={state.lotsTotal} />
          <DossierAndConsole
            lot={lot}
            userBudget={state.user.budget}
            onBid={doBid}
            bidError={bidError}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
          />
        </div>

        {/* RIGHT — The Ticker */}
        <div className="sw-col">
          <HighestBidBoard lot={lot} />
          <Ticker lot={lot} lastResult={lastResult} lowTime={lowTime} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── TopBar ───────────────────────

function TopBar({
  matchId,
  lotIndex,
  lotsTotal,
  lotsDone,
}: {
  matchId: string;
  lotIndex: number;
  lotsTotal: number;
  lotsDone: number;
}) {
  const progress = (lotsDone / lotsTotal) * 100;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "8px 14px",
        marginBottom: 8,
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12, minWidth: 0 }}>
        <span
          className="sw-display"
          style={{
            fontWeight: 800,
            letterSpacing: "0.16em",
            fontSize: 14,
            color: "var(--chalk)",
          }}
        >
          SQUADWARS
        </span>
        <span style={{ color: "var(--dim)" }}>·</span>
        <span className="sw-eyebrow">match</span>
        <code
          style={{
            fontFamily: "var(--font-mono)",
            color: "var(--muted)",
            fontSize: 11,
            letterSpacing: "0.05em",
          }}
        >
          {matchId}
        </code>
        <span style={{ color: "var(--dim)" }}>·</span>
        <span className="sw-eyebrow">lot</span>
        <span className="sw-mono" style={{ color: "var(--text)", fontWeight: 600, fontSize: 13 }}>
          {String(lotIndex + 1).padStart(2, "0")}
          <span style={{ color: "var(--dim)" }}> / {String(lotsTotal).padStart(2, "0")}</span>
        </span>
        <div style={{ width: 140, marginLeft: 4 }}>
          <div className="sw-bar">
            <div className="sw-bar-fill" style={{ width: `${progress}%`, background: "var(--chalk)" }} />
          </div>
        </div>
      </div>
      <Link
        href="/"
        className="sw-eyebrow"
        style={{ textDecoration: "none", color: "var(--muted)" }}
      >
        ← home
      </Link>
    </div>
  );
}

// ─────────────────────── Treasury (left column top) ───────────────────────

function Treasury({
  youBudget,
  youBought,
  aiBudget,
  aiBought,
  totalSlots,
}: {
  youBudget: number;
  youBought: number;
  aiBudget: number;
  aiBought: number;
  totalSlots: number;
}) {
  const youAhead = youBudget > aiBudget;
  return (
    <div className="sw-card">
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-corner-mark">EXCHEQUER · L01</div>
      <div className="sw-eyebrow" style={{ marginBottom: 10 }}>Treasury</div>
      <Pill
        side="you"
        budget={youBudget}
        sub={`${youBought} signed · ${totalSlots - youBought} slots open`}
        highlight={youAhead}
      />
      <div style={{ height: 8 }} />
      <Pill
        side="ai"
        budget={aiBudget}
        sub={`${aiBought} signed · dossier sealed`}
        highlight={!youAhead}
      />
    </div>
  );
}

function Pill({
  side,
  budget,
  sub,
  highlight,
}: {
  side: "you" | "ai";
  budget: number;
  sub: string;
  highlight: boolean;
}) {
  const accent = side === "you" ? "var(--chalk)" : "var(--floodlight)";
  const label = side === "you" ? "YOU" : "OPPOSITION";
  return (
    <div
      className="sw-sunken"
      style={{
        padding: "10px 12px",
        borderColor: highlight ? accent : "var(--hairline)",
        boxShadow: highlight ? `inset 3px 0 0 ${accent}` : "inset 3px 0 0 transparent",
        transition: "box-shadow 0.3s ease, border-color 0.3s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="sw-eyebrow" style={{ color: accent, letterSpacing: "0.18em" }}>{label}</span>
        {highlight && (
          <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: "0.12em" }}>LEAD</span>
        )}
      </div>
      <div
        className="sw-mono"
        style={{
          fontSize: 24,
          fontWeight: 700,
          marginTop: 4,
          color: "var(--text)",
          lineHeight: 1.05,
        }}
      >
        {fmtMoney(budget)}
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</div>
    </div>
  );
}

// ─────────────────────── DressingRoom (left column bottom) ───────────────────────

function DressingRoom({
  bought,
  counts,
}: {
  bought: Array<{ player: { name: string; category: Category } }>;
  counts: Record<Category, number>;
}) {
  return (
    <div className="sw-card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-corner-mark">FORMATION · 4-3-3</div>
      <div className="sw-eyebrow" style={{ marginBottom: 10 }}>Dressing Room</div>
      <div className="sw-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 11 }}>
        {BUCKETS.map((b) => {
          const count = counts[b.key] ?? 0;
          const color = bucketFillColor(count, b.target);
          const pct = Math.min(100, (count / b.target) * 100);
          const players = bought.filter((bp) => bp.player.category === b.key);
          return (
            <div key={b.key}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 5,
                }}
              >
                <span
                  className="sw-display"
                  style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.04em", color: "var(--text)" }}
                >
                  {b.label.toUpperCase()}
                </span>
                <span className="sw-mono" style={{ color, fontWeight: 700, fontSize: 13 }}>
                  {count}
                  <span style={{ color: "var(--dim)", fontWeight: 500 }}>/{b.target}</span>
                </span>
              </div>
              {/* pip row — encodes formation positions */}
              <div style={{ display: "flex", gap: 3, marginBottom: 6 }}>
                {Array.from({ length: b.target }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 4,
                      borderRadius: 1,
                      background: i < count ? color : "var(--surface-3)",
                      transition: "background 0.3s ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {players.length === 0 ? (
                  <span style={{ fontSize: 11, color: "var(--dim)", fontStyle: "italic" }}>—</span>
                ) : (
                  players.map((bp, idx) => (
                    <span key={idx} className="sw-chip" style={{ color: "var(--text)", fontSize: 10 }}>
                      {bp.player.name}
                    </span>
                  ))
                )}
              </div>
              <div style={{ marginTop: 10, height: 1, background: "var(--hairline)" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────── CountdownClock — SIGNATURE ───────────────────────

function CountdownClock({
  msLeft,
  lowTime,
  lotIndex,
  lotsTotal,
}: {
  msLeft: number;
  lowTime: boolean;
  lotIndex: number;
  lotsTotal: number;
}) {
  const totalMs = 20000;
  const pct = Math.min(100, (msLeft / totalMs) * 100);
  const time = fmtCountdown(msLeft); // "0:17"
  const [mm, ss] = time.split(":");
  const digits = [...mm, ":", ...ss]; // ["0", ":", "1", "7"]

  const accent = lowTime ? "var(--whistle)" : "var(--chalk)";

  return (
    <div
      className="sw-card"
      style={{
        padding: "14px 16px",
        borderColor: lowTime ? "var(--whistle)" : "var(--hairline)",
        boxShadow: lowTime
          ? "0 0 0 1px var(--whistle), 0 0 36px var(--whistle-soft)"
          : "none",
        transition: "box-shadow 0.18s ease, border-color 0.18s ease",
      }}
    >
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div className="sw-eyebrow">On the block</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
            lot{" "}
            <span className="sw-mono" style={{ color: "var(--text)", fontWeight: 600 }}>
              {String(lotIndex + 1).padStart(2, "0")}
            </span>{" "}
            of {String(lotsTotal).padStart(2, "0")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="sw-live-dot" style={{ background: accent, boxShadow: `0 0 8px ${accent}` }} />
          <span className="sw-eyebrow" style={{ color: accent }}>
            {lowTime ? "going once" : "live"}
          </span>
        </div>
      </div>

      {/* the flap clock */}
      <div
        className="sw-display"
        style={{
          fontWeight: 800,
          fontSize: 84,
          lineHeight: 0.92,
          letterSpacing: "-0.01em",
          color: accent,
          fontVariantNumeric: "tabular-nums",
          textShadow: lowTime ? "0 0 24px var(--whistle-soft)" : "none",
          padding: "4px 0 6px",
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        {digits.map((d, i) => (
          <span key={`${i}-${d}`} className="sw-flap">
            <span className="sw-flap-inner">{d}</span>
          </span>
        ))}
      </div>

      <div className="sw-bar" style={{ height: 4 }}>
        <div
          className="sw-bar-fill"
          style={{
            width: `${pct}%`,
            background: lowTime
              ? "linear-gradient(90deg, var(--whistle), #FF7585)"
              : "linear-gradient(90deg, var(--chalk), #FFF7E6)",
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────── DossierAndConsole — player + bid ───────────────────────

function DossierAndConsole({
  lot,
  userBudget,
  onBid,
  bidError,
  customAmount,
  setCustomAmount,
}: {
  lot: LotStateDTO;
  userBudget: number;
  onBid: (amount: number) => void;
  bidError: string | null;
  customAmount: string;
  setCustomAmount: (s: string) => void;
}) {
  const p = lot.player;
  const minLegal = Math.max(lot.currentBid + 1_000_000, 1_000_000);
  const userIsHigh = lot.highBidder === "user";

  const positionStats: Record<Category, Array<{ key: keyof typeof p.stats; label: string }>> = {
    ATT: [
      { key: "sho", label: "SHO" },
      { key: "pac", label: "PAC" },
      { key: "dri", label: "DRI" },
      { key: "phy", label: "PHY" },
    ],
    MID: [
      { key: "pas", label: "PAS" },
      { key: "dri", label: "DRI" },
      { key: "phy", label: "PHY" },
      { key: "pac", label: "PAC" },
    ],
    DEF: [
      { key: "def", label: "DEF" },
      { key: "phy", label: "PHY" },
      { key: "pac", label: "PAC" },
      { key: "pas", label: "PAS" },
    ],
    GK: [
      { key: "def", label: "DEF" },
      { key: "phy", label: "PHY" },
      { key: "pac", label: "PAC" },
      { key: "pas", label: "PAS" },
    ],
  };

  const catTint: Record<Category, string> = {
    ATT: "rgba(230, 57, 70, 0.10)",
    MID: "rgba(255, 182, 39, 0.10)",
    DEF: "rgba(106, 153, 255, 0.10)",
    GK: "rgba(242, 237, 224, 0.08)",
  };

  const stats = positionStats[p.category];
  const altPositions = p.positions.filter((pos) => pos !== p.primary_position);

  return (
    <div
      className="sw-card"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />

      {/* dossier header */}
      <div
        style={{
          padding: "14px 16px 12px",
          background: `linear-gradient(180deg, ${catTint[p.category]} 0%, transparent 100%)`,
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span className="sw-eyebrow">Dossier · scout report</span>
          <span className="sw-eyebrow sw-eyebrow-dim sw-mono" style={{ letterSpacing: "0.10em" }}>
            #{p.id}
          </span>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.photo_path}
            alt={p.name}
            width={84}
            height={84}
            style={{
              borderRadius: 6,
              background: "var(--surface-3)",
              objectFit: "cover",
              border: "1px solid var(--hairline-strong)",
              flex: "0 0 auto",
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              className="sw-display"
              style={{
                fontWeight: 800,
                fontSize: 28,
                lineHeight: 1,
                letterSpacing: "0.005em",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {p.name.toUpperCase()}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12 }}>
              <span className="sw-chip" style={{ color: "var(--text)" }}>{p.primary_position}</span>
              <span style={{ color: "var(--muted)" }}>{p.club}</span>
              <span style={{ color: "var(--dim)" }}>·</span>
              <span style={{ color: "var(--muted)" }}>{p.country}</span>
            </div>
          </div>
          <div style={{ textAlign: "right", flex: "0 0 auto" }}>
            <div className="sw-eyebrow sw-eyebrow-dim">OVR</div>
            <div
              className="sw-display sw-mono"
              style={{
                fontWeight: 800,
                fontSize: 44,
                lineHeight: 1,
                color: "var(--chalk)",
              }}
            >
              {p.overall}
            </div>
          </div>
        </div>
      </div>

      {/* stat bars */}
      <div style={{ padding: "12px 16px 6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px" }}>
        {stats.map((s) => {
          const v = p.stats[s.key];
          const barColor = v >= 85 ? "var(--chalk)" : v >= 75 ? "var(--floodlight)" : "var(--muted)";
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                className="sw-display"
                style={{
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  color: "var(--muted)",
                  width: 28,
                  flex: "0 0 auto",
                }}
              >
                {s.label}
              </span>
              <div style={{ flex: 1 }}>
                <div className="sw-bar" style={{ height: 3 }}>
                  <div className="sw-bar-fill" style={{ width: `${v}%`, background: barColor }} />
                </div>
              </div>
              <span
                className="sw-mono"
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  color: barColor,
                  minWidth: 22,
                  textAlign: "right",
                }}
              >
                {v}
              </span>
            </div>
          );
        })}
      </div>

      {/* ALSO PLAYS — alt positions strip */}
      <div
        style={{
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <span className="sw-eyebrow">Also plays</span>
        {altPositions.length === 0 ? (
          <span
            className="sw-mono"
            style={{ fontSize: 11, color: "var(--dim)", fontStyle: "italic" }}
          >
            specialist · {p.primary_position} only
          </span>
        ) : (
          altPositions.map((pos) => (
            <span
              key={pos}
              className="sw-chip"
              style={{
                color: "var(--chalk)",
                borderColor: "var(--chalk-soft)",
                background: "var(--chalk-soft)",
              }}
            >
              {pos}
            </span>
          ))
        )}
      </div>

      {/* bid console */}
      <div style={{ padding: "12px 16px 14px", marginTop: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 10,
            borderBottom: "1px solid var(--hairline)",
            marginBottom: 10,
          }}
        >
          <div>
            <div className="sw-eyebrow">Current bid · held by</div>
            <div
              className="sw-display"
              style={{
                fontSize: 14,
                fontWeight: 700,
                marginTop: 2,
                letterSpacing: "0.10em",
                textTransform: "uppercase",
                color:
                  lot.highBidder === "user"
                    ? "var(--chalk)"
                    : lot.highBidder === "ai"
                      ? "var(--floodlight)"
                      : "var(--dim)",
              }}
            >
              {lot.highBidder ?? "nobody yet"}
            </div>
          </div>
          <div
            className="sw-mono"
            style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}
          >
            {fmtMoney(lot.currentBid)}
          </div>
        </div>

        {/* quick increments */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {[1, 5, 10].map((inc) => (
            <button
              key={inc}
              className="sw-btn"
              style={{ flex: 1 }}
              disabled={userIsHigh}
              onClick={() => onBid(Math.max(minLegal, lot.currentBid + inc * 1_000_000))}
            >
              + {inc}M
            </button>
          ))}
        </div>

        {/* custom */}
        {(() => {
          const inputN = Number(customAmount);
          const inputValid = customAmount !== "" && Number.isFinite(inputN) && inputN > 0;
          const bidEuros = inputValid ? Math.round(inputN * 1_000_000) : 0;
          const tooLow = inputValid && bidEuros < minLegal;
          return (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    placeholder={`Amount in M · min ${(minLegal / 1_000_000).toFixed(0)}`}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 38px 10px 12px",
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      border: `1px solid ${tooLow ? "var(--whistle)" : "var(--hairline-strong)"}`,
                      borderRadius: 8,
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      fontWeight: 500,
                      outline: "none",
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--dim)",
                      fontSize: 11,
                      fontFamily: "var(--font-display)",
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      pointerEvents: "none",
                    }}
                  >
                    M €
                  </span>
                </div>
                <button
                  className="sw-btn sw-btn-bid"
                  style={{ minWidth: 116 }}
                  disabled={userIsHigh || !inputValid || tooLow}
                  onClick={() => {
                    if (inputValid && bidEuros >= minLegal) {
                      onBid(bidEuros);
                      setCustomAmount("");
                    }
                  }}
                >
                  Lodge bid
                </button>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: tooLow ? "var(--whistle)" : "var(--dim)",
                  marginBottom: 6,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {inputValid
                  ? `you bid ${fmtMoney(bidEuros)}${tooLow ? ` — below min ${fmtMoney(minLegal)}` : ""}`
                  : "type a number in millions (e.g. 70 = €70M)"}
              </div>
            </>
          );
        })()}

        <div
          style={{
            fontSize: 11,
            color: "var(--dim)",
            display: "flex",
            justifyContent: "space-between",
            fontFamily: "var(--font-mono)",
          }}
        >
          <span>min legal {fmtMoney(minLegal)} · budget {fmtMoney(userBudget)}</span>
          <span>
            {userIsHigh ? (
              <span style={{ color: "var(--chalk)", fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "0.10em" }}>
                ▸ YOU LEAD
              </span>
            ) : (
              "raise to lead"
            )}
          </span>
        </div>

        {bidError && (
          <div style={{ marginTop: 8, color: "var(--whistle)", fontSize: 12 }}>{bidError}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────── HighestBidBoard (right column top) ───────────────────────

function HighestBidBoard({ lot }: { lot: LotStateDTO }) {
  const high = lot.highBidder;
  const accent = high === "user" ? "var(--chalk)" : high === "ai" ? "var(--floodlight)" : "var(--muted)";
  const bidCount = lot.bidLog.length;
  const opening = bidCount === 0;
  return (
    <div
      className="sw-card"
      style={{
        borderColor: high ? accent : "var(--hairline)",
        boxShadow: high ? `inset 3px 0 0 ${accent}` : "inset 3px 0 0 transparent",
        transition: "box-shadow 0.3s ease",
      }}
    >
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div className="sw-eyebrow">Hammer price · live</div>
        <span
          className="sw-mono"
          style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {bidCount} {bidCount === 1 ? "bid" : "bids"}
        </span>
      </div>

      <div
        className="sw-mono"
        style={{
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: accent,
          lineHeight: 0.95,
          padding: "2px 0",
        }}
      >
        {fmtMoney(lot.currentBid)}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>
          {opening ? "opening price" : "held by"}{" "}
          <span
            className="sw-display"
            style={{
              color: accent,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {high ?? "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────── Ticker (right column bottom) ───────────────────────

function Ticker({
  lot,
  lastResult,
  lowTime,
}: {
  lot: LotStateDTO;
  lastResult: LotEndResp["lotResult"] | null;
  lowTime: boolean;
}) {
  // last 5, newest first
  const last5: BidEntry[] = lot.bidLog.slice(-5).reverse();
  const now = Date.now();

  return (
    <div
      className="sw-card"
      style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="sw-eyebrow">Ticker · last five</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="sw-live-dot" />
          <span className="sw-eyebrow" style={{ color: "var(--whistle)" }}>{lowTime ? "stoppage" : "live"}</span>
        </div>
      </div>

      {lastResult && (
        <div
          className="sw-tick"
          style={{
            padding: "8px 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--hairline-strong)",
            borderLeft: "3px solid var(--chalk)",
            borderRadius: 4,
            fontSize: 12,
            marginBottom: 10,
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            className="sw-display"
            style={{
              color: "var(--chalk)",
              fontWeight: 700,
              letterSpacing: "0.14em",
              fontSize: 10,
            }}
          >
            GAVEL ·{" "}
            {lastResult.winner === "user"
              ? "YOU TOOK IT"
              : lastResult.winner === "ai"
                ? "AI TOOK IT"
                : "PASSED"}
          </span>
          <div style={{ color: "var(--muted)", marginTop: 2 }}>
            {fmtMoney(lastResult.price)}
            {lastResult.reconShotFired ? " · recon shot" : ""}
          </div>
        </div>
      )}

      <div className="sw-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {last5.length === 0 ? (
          <div
            style={{
              padding: "30px 10px",
              textAlign: "center",
              color: "var(--dim)",
              fontSize: 11,
              fontStyle: "italic",
              fontFamily: "var(--font-mono)",
            }}
          >
            waiting for the first bid…
          </div>
        ) : (
          last5.map((b, i) => {
            const isUser = b.by === "user";
            const accent = isUser ? "var(--chalk)" : "var(--floodlight)";
            const ago = Math.max(0, Math.round((now - b.t) / 1000));
            const opacity = 1 - i * 0.14;
            return (
              <div
                key={`${b.t}-${b.by}-${i}`}
                className="sw-tick"
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 0,
                  padding: 0,
                  background: i === 0 ? "var(--surface-2)" : "transparent",
                  border: `1px solid ${i === 0 ? "var(--hairline-strong)" : "var(--hairline)"}`,
                  borderRadius: 6,
                  opacity,
                  overflow: "hidden",
                }}
              >
                <div style={{ width: 3, background: accent, flex: "0 0 auto" }} />
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    minWidth: 0,
                  }}
                >
                  <div
                    className="sw-display"
                    style={{
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: "0.18em",
                      color: accent,
                      width: 26,
                      flex: "0 0 auto",
                    }}
                  >
                    {isUser ? "YOU" : "AI"}
                  </div>
                  <div
                    className="sw-mono"
                    style={{
                      fontWeight: 700,
                      fontSize: 16,
                      color: "var(--text)",
                      flex: 1,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {fmtMoney(b.amount)}
                  </div>
                  <div
                    className="sw-mono"
                    style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap" }}
                  >
                    {ago < 1 ? "now" : `${ago}s`}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────── Complete view ───────────────────────

function CompleteView({ state }: { state: MatchStateDTO }) {
  const userTotalSpent = state.user.bought.reduce((s, b) => s + b.price, 0);
  return (
    <div className="sw-auction">
      <style dangerouslySetInnerHTML={{ __html: tokens }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 0" }}>
        <div className="sw-eyebrow" style={{ marginBottom: 6 }}>FULL TIME</div>
        <h1 className="sw-display" style={{ margin: "0 0 12px", fontSize: 48, fontWeight: 800, letterSpacing: "0.02em" }}>
          MATCH COMPLETE
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 0, fontSize: 13 }}>
          All {state.lotsTotal} lots resolved. Squad building is the next phase (not built yet).
        </p>

        <div className="sw-card" style={{ marginTop: 24 }}>
          <span className="sw-tick-tl" /><span className="sw-tick-tr" />
          <span className="sw-tick-bl" /><span className="sw-tick-br" />
          <div className="sw-eyebrow" style={{ marginBottom: 6 }}>Your squad</div>
          <h3 className="sw-display" style={{ marginTop: 0, fontSize: 22, letterSpacing: "0.02em" }}>
            {state.user.bought.length} PLAYERS
          </h3>
          <p style={{ fontSize: 12, color: "var(--muted)" }} className="sw-mono">
            spent {fmtMoney(userTotalSpent)} · remaining {fmtMoney(state.user.budget)}
          </p>
          {BUCKETS.map((b) => {
            const players = state.user.bought.filter((bp) => bp.player.category === b.key);
            return (
              <div key={b.key} style={{ marginTop: 12 }}>
                <div className="sw-display" style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.10em" }}>
                  {b.label.toUpperCase()}{" "}
                  <span style={{ color: "var(--muted)", fontWeight: 500 }}>({players.length}/{b.target})</span>
                </div>
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
                  {players.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, color: "var(--muted)" }} className="sw-mono">
                      {p.player.name} <span style={{ color: "var(--dim)" }}>· OVR {p.player.overall} · {fmtMoney(p.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="sw-card" style={{ marginTop: 16 }}>
          <span className="sw-tick-tl" /><span className="sw-tick-tr" />
          <span className="sw-tick-bl" /><span className="sw-tick-br" />
          <div className="sw-eyebrow" style={{ marginBottom: 6 }}>Opposition</div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }} className="sw-mono">
            bought {state.ai.boughtCount} · remaining {fmtMoney(state.ai.budget)} · dossier sealed until result screen
          </p>
        </div>

        <p style={{ marginTop: 24 }}>
          <Link href="/" className="sw-eyebrow" style={{ color: "var(--chalk)" }}>
            ← back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────── helpers ───────────────────────

function countByCategory(cats: Category[]): Record<Category, number> {
  const out: Record<Category, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  for (const c of cats) out[c]++;
  return out;
}
