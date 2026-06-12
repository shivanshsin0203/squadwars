"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Category, LotStateDTO, MatchStateDTO } from "@/lib/types";
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

/** Bucket fill tier color per user spec: <half red, =half orange, >half green, full/surplus green. */
function bucketColor(filled: number, target: number): string {
  if (filled >= target) return "var(--neon)"; // full or surplus
  if (target % 2 === 0 && filled === target / 2) return "var(--amber)"; // exactly half (even targets only)
  if (filled * 2 > target) return "var(--neon)"; // strictly more than half
  return "var(--red)"; // less than half
}

const tokens = `
  .sw-auction {
    --bg-page: #0A0E14;
    --bg-card: #141B24;
    --bg-chip: #1F2A38;
    --neon: #22FF88;
    --neon-soft: rgba(34, 255, 136, 0.12);
    --amber: #FFB020;
    --red: #FF3D5A;
    --red-soft: rgba(255, 61, 90, 0.4);
    --text: #EAEEF5;
    --muted: #8B97A8;
    --dim: #5A6573;
    --r-md: 8px;
    --r-lg: 12px;
    background: var(--bg-page);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    padding: 24px;
  }
  .sw-auction button { font-family: inherit; cursor: pointer; }
  .sw-auction button:disabled { opacity: 0.4; cursor: not-allowed; }
  .sw-card { background: var(--bg-card); border: 0.5px solid var(--bg-chip); border-radius: var(--r-lg); padding: 14px; }
  .sw-chip { background: var(--bg-chip); border-radius: var(--r-md); padding: 3px 8px; font-size: 12px; color: var(--muted); }
  .sw-num { font-variant-numeric: tabular-nums; }
  .sw-btn {
    padding: 8px 12px; font-size: 13px;
    background: var(--bg-chip); color: var(--text);
    border: 0.5px solid var(--bg-chip);
    border-radius: var(--r-md);
  }
  .sw-btn:hover:not(:disabled) { filter: brightness(1.15); }
  .sw-btn-primary {
    background: var(--neon); color: var(--bg-page); border: 0.5px solid var(--neon);
    font-weight: 600;
  }
`;

export default function AuctionRoom({ matchId }: { matchId: string }) {
  const [state, setState] = useState<MatchStateDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bootStatus, setBootStatus] = useState<string>("connecting…");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [, force] = useState(0);
  const [lastResult, setLastResult] = useState<LotEndResp["lotResult"] | null>(null);

  // Refs so timers see the latest values without stale closures
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
      <div style={{ padding: 24, color: "#FF3D5A" }}>
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
        <p>{bootStatus}</p>
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
        <p>between lots…</p>
      </div>
    );
  }

  const userCounts = countByCategory(state.user.bought.map((b) => b.player.category));
  const slotsLeftYou =
    BUCKETS.reduce((s, b) => s + Math.max(0, b.target - (userCounts[b.key] ?? 0)), 0);
  const avgLeftPerSlot = slotsLeftYou > 0 ? Math.floor(state.user.budget / slotsLeftYou) : 0;
  const msLeft = Math.max(0, lot.expiresAt - Date.now());
  const lowTime = msLeft < 5000;

  return (
    <div className="sw-auction">
      <style dangerouslySetInnerHTML={{ __html: tokens }} />

      {/* connection banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          padding: "6px 12px",
          background: "var(--bg-card)",
          border: "0.5px solid var(--bg-chip)",
          borderRadius: 8,
          fontSize: 11,
          color: "var(--dim)",
          fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        }}
      >
        <span>
          match <code style={{ color: "var(--muted)" }}>{matchId}</code> · lot {lot.lotIndex + 1}/{state.lotsTotal}
        </span>
        <Link href="/" style={{ color: "var(--neon)", textDecoration: "none" }}>
          ← home
        </Link>
      </div>

      <div style={{ background: "var(--bg-chip)", borderRadius: 12, padding: 12 }}>
        {/* HEADER */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <SideCell label="You" budget={state.user.budget} bought={state.user.bought.length} alignRight={false} extra={`${BUCKETS.reduce((s, b) => s + b.target, 0) - state.user.bought.length} slots left`} />
          <TimerCell lot={lot} state={state} lowTime={lowTime} msLeft={msLeft} />
          <SideCell label="AI" budget={state.ai.budget} bought={state.ai.boughtCount} alignRight={true} extra="hidden squad" />
        </div>

        {/* MAIN */}
        <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
          <PlayerCard
            lot={lot}
            userBudget={state.user.budget}
            onBid={doBid}
            bidError={bidError}
            customAmount={customAmount}
            setCustomAmount={setCustomAmount}
          />
          <BucketsPanel bought={state.user.bought} counts={userCounts} />
        </div>

        {/* BOTTOM */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <div className="sw-card" style={{ flex: 1.4, padding: "8px 10px", fontSize: 12, color: "var(--muted)" }}>
            <span style={{ color: "var(--text)" }}>recent: </span>
            {lastResult
              ? `${lastResult.winner === "user" ? "You" : lastResult.winner === "ai" ? "AI" : "Nobody"} won the last lot for ${fmtMoney(lastResult.price)}${lastResult.reconShotFired ? " · close call" : ""}`
              : "—"}
          </div>
          <div className="sw-card" style={{ flex: 1, padding: "8px 10px", fontSize: 12, color: "var(--muted)", textAlign: "right" }}>
            avg {fmtMoney(avgLeftPerSlot)} left per slot
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── sub-components ───────────────────────

function SideCell({
  label,
  budget,
  bought,
  alignRight,
  extra,
}: {
  label: string;
  budget: number;
  bought: number;
  alignRight: boolean;
  extra: string;
}) {
  return (
    <div
      className="sw-card"
      style={{
        flex: 1,
        padding: "8px 10px",
        textAlign: alignRight ? "right" : "left",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
      <div className="sw-num" style={{ fontSize: 20, fontWeight: 500 }}>
        {fmtMoney(budget)}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {bought} bought · {extra}
      </div>
    </div>
  );
}

function TimerCell({
  lot,
  state,
  lowTime,
  msLeft,
}: {
  lot: LotStateDTO;
  state: MatchStateDTO;
  lowTime: boolean;
  msLeft: number;
}) {
  return (
    <div
      className="sw-card"
      style={{
        flex: 0.9,
        padding: "8px 10px",
        textAlign: "center",
        border: `0.5px solid ${lowTime ? "var(--red-soft)" : "var(--bg-chip)"}`,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        on the block · lot {lot.lotIndex + 1}/{state.lotsTotal}
      </div>
      <div
        className="sw-num"
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: lowTime ? "var(--red)" : "var(--text)",
        }}
      >
        {fmtCountdown(msLeft)}
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        {lowTime ? "going once…" : msLeft <= 0 ? "closing…" : "live"}
      </div>
    </div>
  );
}

function PlayerCard({
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
      { key: "phy", label: "PHY" },
      { key: "dri", label: "DRI" },
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

  return (
    <div className="sw-card" style={{ flex: 1.25 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.photo_path}
          alt={p.name}
          width={64}
          height={64}
          style={{ borderRadius: 8, background: "var(--bg-chip)", objectFit: "cover" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                {p.primary_position} · {p.club} · {p.country} · OVR {p.overall}
              </div>
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                background: "var(--neon-soft)",
                color: "var(--neon)",
                borderRadius: 8,
                padding: "4px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {p.category}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {positionStats[p.category].map((s) => (
          <span key={s.key} className="sw-chip">
            {s.label} {p.stats[s.key]}
          </span>
        ))}
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
        current bid · held by{" "}
        <span
          style={{
            color: lot.highBidder === "user" ? "var(--neon)" : lot.highBidder === "ai" ? "var(--amber)" : "var(--muted)",
            fontWeight: 600,
          }}
        >
          {lot.highBidder ?? "nobody"}
        </span>
      </div>
      <div className="sw-num" style={{ fontSize: 28, fontWeight: 500, marginBottom: 12 }}>
        {fmtMoney(lot.currentBid)}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button
          className="sw-btn"
          style={{ flex: 1 }}
          disabled={userIsHigh}
          onClick={() => onBid(Math.max(minLegal, lot.currentBid + 1_000_000))}
        >
          +1M
        </button>
        <button
          className="sw-btn"
          style={{ flex: 1 }}
          disabled={userIsHigh}
          onClick={() => onBid(Math.max(minLegal, lot.currentBid + 5_000_000))}
        >
          +5M
        </button>
        <button
          className="sw-btn"
          style={{ flex: 1 }}
          disabled={userIsHigh}
          onClick={() => onBid(Math.max(minLegal, lot.currentBid + 10_000_000))}
        >
          +10M
        </button>
      </div>

      {(() => {
        const inputN = Number(customAmount);
        const inputValid = customAmount !== "" && Number.isFinite(inputN) && inputN > 0;
        const bidEuros = inputValid ? Math.round(inputN * 1_000_000) : 0;
        const tooLow = inputValid && bidEuros < minLegal;
        return (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min="0"
                  placeholder={`amount in M, e.g. 70  (min ${(minLegal / 1_000_000).toFixed(0)})`}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 32px 8px 8px",
                    background: "var(--bg-page)",
                    color: "var(--text)",
                    border: "0.5px solid var(--bg-chip)",
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontSize: 13,
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--dim)",
                    fontSize: 12,
                    pointerEvents: "none",
                  }}
                >
                  M €
                </span>
              </div>
              <button
                className="sw-btn sw-btn-primary"
                style={{ minWidth: 100 }}
                disabled={userIsHigh || !inputValid || tooLow}
                onClick={() => {
                  if (inputValid && bidEuros >= minLegal) {
                    onBid(bidEuros);
                    setCustomAmount("");
                  }
                }}
              >
                bid
              </button>
            </div>
            <div style={{ fontSize: 11, color: tooLow ? "var(--red)" : "var(--dim)", marginBottom: 8 }}>
              {inputValid
                ? `you bid ${fmtMoney(bidEuros)}${tooLow ? ` — below min ${fmtMoney(minLegal)}` : ""}`
                : "type a number in millions (e.g. 70 = €70M)"}
            </div>
          </>
        );
      })()}

      <div style={{ fontSize: 11, color: "var(--dim)" }}>
        min legal {fmtMoney(minLegal)} · your budget {fmtMoney(userBudget)} ·{" "}
        {userIsHigh ? <span style={{ color: "var(--neon)" }}>you are leading</span> : "raise to take the lead"}
      </div>

      {bidError && (
        <div style={{ marginTop: 8, color: "var(--red)", fontSize: 12 }}>{bidError}</div>
      )}
    </div>
  );
}

function BucketsPanel({
  bought,
  counts,
}: {
  bought: Array<{ player: { name: string; category: Category } }>;
  counts: Record<Category, number>;
}) {
  return (
    <div className="sw-card" style={{ flex: 1, padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>your buys</div>
      {BUCKETS.map((b, i) => {
        const count = counts[b.key] ?? 0;
        const color = bucketColor(count, b.target);
        return (
          <div key={b.key} style={{ marginBottom: i === BUCKETS.length - 1 ? 0 : 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12,
                marginBottom: 4,
              }}
            >
              <span style={{ fontWeight: 500 }}>{b.label}</span>
              <span style={{ color }}>
                {count} / {b.target}
              </span>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {bought
                .filter((bp) => bp.player.category === b.key)
                .map((bp, idx) => (
                  <span key={idx} className="sw-chip" style={{ fontSize: 11, padding: "3px 7px" }}>
                    {bp.player.name}
                  </span>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompleteView({ state }: { state: MatchStateDTO }) {
  const userTotalSpent = state.user.bought.reduce((s, b) => s + b.price, 0);
  return (
    <div className="sw-auction">
      <style dangerouslySetInnerHTML={{ __html: tokens }} />
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 12px" }}>Match complete</h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          All {state.lotsTotal} lots resolved. Squad building is the next phase (not built yet).
        </p>

        <div className="sw-card" style={{ marginTop: 24 }}>
          <h3 style={{ marginTop: 0 }}>Your squad — {state.user.bought.length} players</h3>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            spent {fmtMoney(userTotalSpent)} · remaining {fmtMoney(state.user.budget)}
          </p>
          {BUCKETS.map((b) => {
            const players = state.user.bought.filter((bp) => bp.player.category === b.key);
            return (
              <div key={b.key} style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>
                  {b.label} <span style={{ color: "var(--muted)" }}>({players.length}/{b.target})</span>
                </div>
                <ul style={{ margin: "4px 0 0", padding: 0, listStyle: "none" }}>
                  {players.map((p, i) => (
                    <li key={i} style={{ fontSize: 13, color: "var(--muted)" }}>
                      {p.player.name} <span style={{ color: "var(--dim)" }}>· OVR {p.player.overall} · {fmtMoney(p.price)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="sw-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>AI</h3>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>
            bought {state.ai.boughtCount} · remaining {fmtMoney(state.ai.budget)} · squad hidden until result screen
          </p>
        </div>

        <p style={{ marginTop: 24 }}>
          <Link href="/" style={{ color: "var(--neon)" }}>← back to home</Link>
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
