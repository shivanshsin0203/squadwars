"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Category, LotStateDTO, MatchStateDTO } from "@/lib/types";
import { fmtCountdown, fmtMoney } from "@/lib/format";
import SquadBuilder from "../../squad-builder/SquadBuilder";
import ResultScreen from "../../squad-builder/ResultScreen";
import { useToast } from "../../_components/Toast";
import { apiFetch, ApiError, toastFromApiError } from "../../_lib/apiClient";
import { getSessionToken, SESSION_HEADER } from "../../_lib/session";

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

type Bucket = { key: Category; label: string; target: number };

// XI composition per formation. Mirrors server config.FORMATIONS[name].targets.
// Categories must sum to 11. Order = display order in the dressing room (ATT first, GK last).
const FORMATION_BUCKETS: Record<string, Bucket[]> = {
  "4-3-3":   [{ key: "ATT", label: "Attack", target: 3 }, { key: "MID", label: "Midfield", target: 3 }, { key: "DEF", label: "Defence", target: 4 }, { key: "GK", label: "Goalkeeper", target: 1 }],
  "4-4-2":   [{ key: "ATT", label: "Attack", target: 2 }, { key: "MID", label: "Midfield", target: 4 }, { key: "DEF", label: "Defence", target: 4 }, { key: "GK", label: "Goalkeeper", target: 1 }],
  "3-5-2":   [{ key: "ATT", label: "Attack", target: 2 }, { key: "MID", label: "Midfield", target: 5 }, { key: "DEF", label: "Defence", target: 3 }, { key: "GK", label: "Goalkeeper", target: 1 }],
  "5-3-2":   [{ key: "ATT", label: "Attack", target: 2 }, { key: "MID", label: "Midfield", target: 3 }, { key: "DEF", label: "Defence", target: 5 }, { key: "GK", label: "Goalkeeper", target: 1 }],
  "3-4-3":   [{ key: "ATT", label: "Attack", target: 3 }, { key: "MID", label: "Midfield", target: 4 }, { key: "DEF", label: "Defence", target: 3 }, { key: "GK", label: "Goalkeeper", target: 1 }],
  "4-2-3-1": [{ key: "ATT", label: "Attack", target: 1 }, { key: "MID", label: "Midfield", target: 5 }, { key: "DEF", label: "Defence", target: 4 }, { key: "GK", label: "Goalkeeper", target: 1 }],
};
function bucketsFor(formation: string | undefined): Bucket[] {
  return FORMATION_BUCKETS[formation ?? "4-3-3"] ?? FORMATION_BUCKETS["4-3-3"];
}

/** Bucket fill tier color per user spec. */
function bucketFillColor(filled: number, target: number): string {
  if (filled >= target) return "var(--chalk)";
  if (target % 2 === 0 && filled === target / 2) return "var(--floodlight)";
  if (filled * 2 > target) return "var(--chalk)";
  return "var(--whistle)";
}

const tokens = `

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
    --keeper-blue: #6FB1FF;
    --keeper-blue-soft: rgba(111, 177, 255, 0.12);
    --text: #EFEFEF;
    --muted: #9099A8;
    --dim: #5C6573;
    --hairline: rgba(255, 255, 255, 0.06);
    --hairline-strong: rgba(255, 255, 255, 0.10);

    /* type — Saira Condensed for displays/numerals, Inter body, JetBrains Mono for tabular prices */
    --font-display: var(--font-saira), 'Arial Narrow', sans-serif;
    --font-body: var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif;
    --font-mono: var(--font-jetbrains), ui-monospace, Menlo, Consolas, monospace;

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
  /* The grid's column minimums sum to ~1070px, so 1080 is the practical floor
     before the layout would actually overflow. iPad Mini (1133) and iPad Pro 11"
     (1194) in landscape keep the 3-column broadcast layout. iPad 10.2" (1080)
     and below collapse to a single readable column. */
  @media (max-width: 1080px) {
    .sw-grid { grid-template-columns: 1fr; height: auto; }
  }
  .sw-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
  .sw-scroll {
    overflow-y: auto;
    min-height: 0;
    scrollbar-width: none;       /* Firefox */
    -ms-overflow-style: none;    /* old Edge / IE */
  }
  .sw-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }  /* WebKit */

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
  // Bumped by the boot-error "Retry" button to re-run the boot effect.
  const [bootNonce, setBootNonce] = useState(0);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [, force] = useState(0);
  const [lastResult, setLastResult] = useState<LotEndResp["lotResult"] | null>(null);

  const stateRef = useRef<MatchStateDTO | null>(null);
  const endedLotsRef = useRef<Set<number>>(new Set());
  // Clock skew correction: the auction timer compares the server's absolute
  // `expiresAt` against the browser clock. Those two clocks can differ in prod
  // (locally they're the same machine, which is why this never showed in dev) —
  // a fast or slow browser clock makes the countdown wrong and the /lot-end
  // trigger fire too early (server 425s → lot stuck) or never. Every response
  // carries `serverNow`; we keep the offset (server − client) and add it to
  // Date.now() wherever we time against expiresAt. Network latency leaves a
  // ~100ms residual, which is well inside the server's 1s lot-end tolerance.
  const clockOffsetRef = useRef<number>(0);
  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // ─────────────────────── API helpers ───────────────────────

  const { push } = useToast();

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      try {
        // Auth via the per-match token header (cookie is an unreliable
        // third-party fallback on *.workers.dev). Token was stored at create.
        const token = getSessionToken(matchId);
        const res = await apiFetch<MatchStateDTO | LotEndResp>(
          `${BACKEND_URL}/api/match/${matchId}${path}`,
          {
            ...init,
            headers: {
              ...(init?.headers ?? {}),
              ...(token ? { [SESSION_HEADER]: token } : {}),
            },
          }
        );
        // Re-sync the server↔client clock offset on every response.
        if (res && typeof (res as MatchStateDTO).serverNow === "number") {
          clockOffsetRef.current = (res as MatchStateDTO).serverNow - Date.now();
        }
        return res;
      } catch (err) {
        // Critical statuses → toast immediately, so the user sees the
        // rate-limit countdown / session-expired notice / network drop even
        // if the local catch swallows the error silently (fireAi, callLotEnd).
        // 400 / 409 / 425 are bid-loop noise — surfaced inline by callers.
        if (err instanceof ApiError) {
          const inline =
            err.status === 400 || err.status === 409 || err.status === 425;
          if (!inline) toastFromApiError(err, push);
        } else {
          toastFromApiError(err, push);
        }
        throw err;
      }
    },
    [matchId, push]
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
        if (s0.status === "complete" || s0.status === "result") {
          // No lot to open — squad-builder / result-screen takes over.
          // result is refresh-safe because the server keeps the verdict cached.
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
  }, [matchId, api, bootNonce]);

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
        // Resolving the lot is the one call that, if it silently fails, freezes
        // the auction at 0:00 forever (the countdown tick won't re-fire because
        // the lot is already marked ended). Re-arm it after a short delay so the
        // tick loop auto-retries — a transient network blip self-heals instead
        // of stranding the user. (The api() wrapper already toasted the error.)
        setTimeout(() => { endedLotsRef.current.delete(lotIdx); }, 1200);
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
      const msLeft = curLot.expiresAt - serverNow();
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
      <div className="sw-auction" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <style dangerouslySetInnerHTML={{ __html: tokens }} />
        <div className="sw-card" style={{ maxWidth: 420, width: "100%", margin: 18, textAlign: "center", padding: "26px 24px" }}>
          <span className="sw-tick-tl" /><span className="sw-tick-tr" />
          <span className="sw-tick-bl" /><span className="sw-tick-br" />
          <div className="sw-eyebrow" style={{ color: "var(--whistle)", justifyContent: "center" }}>Connection lost</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 24, letterSpacing: "0.02em", textTransform: "uppercase", color: "var(--chalk)", margin: "10px 0 0" }}>
            Couldn&apos;t reach the floor
          </h2>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--muted)", lineHeight: 1.55, margin: "12px 0 0" }}>
            We lost contact with the match server. Check your connection and try again — your match is still live on the server.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", alignItems: "center", marginTop: 22 }}>
            <button
              type="button"
              className="sw-btn-bid"
              onClick={() => { setError(null); setBootStatus("reconnecting…"); setBootNonce((n) => n + 1); }}
            >
              ↻ Retry
            </button>
            <Link href="/" className="sw-btn">← Home</Link>
          </div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--dim)", marginTop: 16, wordBreak: "break-word" }}>{error}</p>
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

  if (state.status === "result" && state.result) {
    // Terminal phase. Refresh-safe: server holds the verdict so a reload re-renders
    // the same screen. No back-button to SquadBuilder — placement is frozen forever.
    return (
      <ResultScreen
        payload={state.result}
        userBought={state.user.bought}
        formation={state.formation}
        difficulty={state.difficulty}
        matchId={state.matchId}
      />
    );
  }

  if (state.status === "complete") {
    // Post-whistle: same URL, hand the squad-builder the same server-fetched data.
    // Placement state is client-local — refresh re-fetches from the server and resets,
    // which is what the spec asks for (no client-side tamper surface beyond placement).
    // onSubmit: POST the frozen XI to the server, then drop the verdict DTO into
    // local state. AuctionRoom flips into the "result" branch on the next render
    // and ResultScreen takes over — no extra polling needed.
    return (
      <SquadBuilder
        bought={state.user.bought}
        formation={state.formation}
        difficulty={state.difficulty}
        matchId={state.matchId}
        onSubmit={async (xi, bench) => {
          const dto = (await api("/result", {
            method: "POST",
            body: JSON.stringify({ xi, bench }),
          })) as MatchStateDTO;
          setState(dto);
        }}
      />
    );
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
  const msLeft = Math.max(0, lot.expiresAt - serverNow());
  const lowTime = msLeft < 5000;

  return (
    <div className="sw-auction">
      <style dangerouslySetInnerHTML={{ __html: tokens }} />

      <TopBar matchId={matchId} lotIndex={lot.lotIndex} lotsTotal={state.lotsTotal} lotsDone={state.lotsDone} />

      <div className="sw-grid">
        {/* LEFT — Treasury + Ledger + Chemistry */}
        <div className="sw-col">
          <Treasury
            youBudget={state.user.budget}
            youBought={state.user.bought.length}
            aiBudget={state.ai.budget}
            aiBought={state.ai.boughtCount}
            aiName={aiPersonaShort(state.difficulty)}
            totalSlots={16}
          />
          <Ledger
            bought={state.user.bought}
            budget={state.user.budget}
            totalSlots={16}
          />
          <Chemistry bought={state.user.bought} />
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

        {/* RIGHT — Highest bid + Dressing Room */}
        <div className="sw-col">
          <HighestBidBoard lot={lot} lastResult={lastResult} />
          <DressingRoom bought={state.user.bought} counts={userCounts} formation={state.formation} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── PlayerPhoto — fallback-safe ───────────────────────
// Some entries in the player pool have photo_path="/players/placeholder.webp",
// which doesn't ship. The old onError handler dimmed the broken image (the bug
// you saw mid-to-late game). This component detects the known placeholder path
// up front AND falls back on any 404, rendering the player's initials on the
// same chalk pedestal — never a dim broken image.

function PlayerPhoto({
  src,
  name,
  size,
  rounded = 8,
  pedestal,
  boxShadow,
}: {
  src: string;
  name: string;
  size: number;
  rounded?: number;
  pedestal: string;
  boxShadow?: string;
}) {
  const knownMissing = !src || src.includes("placeholder");
  const [failed, setFailed] = useState(knownMissing);

  // Reset the failed flag when src changes — one PlayerPhoto instance is reused
  // across lots/cards, so a missing image on player N must not stick to N+1.
  useEffect(() => {
    setFailed(!src || src.includes("placeholder"));
  }, [src]);

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?";

  const shared: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: rounded,
    background: pedestal,
    boxShadow,
    flex: "0 0 auto",
  };

  const initialsStyle: React.CSSProperties = {
    fontFamily: "var(--font-display)",
    fontWeight: 800,
    fontSize: Math.max(10, Math.round(size * 0.42)),
    letterSpacing: "0.04em",
    color: "#3F3A2E",
  };

  if (failed) {
    return (
      <div
        style={{
          ...shared,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...initialsStyle,
        }}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      style={{
        ...shared,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Initials sit BEHIND the photo as a placeholder. While the image is still
          loading it's transparent so the initials show through; once it paints it
          covers them. We deliberately do NOT gate visibility on an onLoad state —
          cached images (e.g. a bought player already shown in the dossier) often
          never fire onLoad, which previously left the photo stuck invisible on
          tablet/laptop. */}
      <span style={{ ...initialsStyle, position: "absolute" }}>{initials}</span>
      {/* key={src} → fresh <img> per player so the prior photo can't linger. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt={name}
        width={size}
        height={size}
        fetchPriority="high"
        style={{
          position: "absolute",
          inset: 0,
          width: size,
          height: size,
          borderRadius: rounded,
          objectFit: "cover",
        }}
        onError={() => setFailed(true)}
      />
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

/** Short opponent label by difficulty — shown on the OPPOSITION pill. */
function aiPersonaShort(difficulty: string): string {
  switch (difficulty) {
    case "easy":   return "Richards AI";
    case "medium": return "Carragher AI";
    case "hard":   return "Henry AI";
    default:       return "the AI";
  }
}

function Treasury({
  youBudget,
  youBought,
  aiBudget,
  aiBought,
  aiName,
  totalSlots,
}: {
  youBudget: number;
  youBought: number;
  aiBudget: number;
  aiBought: number;
  aiName: string;
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
        sub={`${youBought} signed · ${Math.max(0, totalSlots - youBought)} slots open`}
        highlight={youAhead}
      />
      <div style={{ height: 8 }} />
      <Pill
        side="ai"
        budget={aiBudget}
        sub={`${aiBought} signed · vs ${aiName}`}
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
  formation,
}: {
  bought: Array<{
    player: { name: string; category: Category; primary_position: string; overall: number; photo_path: string };
    price: number;
  }>;
  counts: Record<Category, number>;
  formation: string;
}) {
  const BUCKETS = useMemo(() => bucketsFor(formation), [formation]);
  const catAccent: Record<Category, string> = {
    ATT: "var(--whistle)",
    MID: "var(--floodlight)",
    DEF: "var(--keeper-blue)",
    GK: "var(--chalk)",
  };

  return (
    <div className="sw-card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-corner-mark">FORMATION · {formation}</div>
      <div className="sw-eyebrow" style={{ marginBottom: 10 }}>Dressing Room</div>

      <div className="sw-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        {BUCKETS.map((b) => {
          const count = counts[b.key] ?? 0;
          const fillColor = bucketFillColor(count, b.target);
          const players = bought.filter((bp) => bp.player.category === b.key);
          const open = Math.max(0, b.target - count);
          const accent = catAccent[b.key];

          return (
            <div key={b.key}>
              {/* section header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 3,
                      height: 12,
                      background: accent,
                      borderRadius: 1.5,
                    }}
                  />
                  <span
                    className="sw-display"
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      letterSpacing: "0.16em",
                      color: "var(--text)",
                    }}
                  >
                    {b.label.toUpperCase()}
                  </span>
                </div>
                <span className="sw-mono" style={{ color: fillColor, fontWeight: 700, fontSize: 12 }}>
                  {count}
                  <span style={{ color: "var(--dim)", fontWeight: 500 }}>/{b.target}</span>
                </span>
              </div>

              {/* pip row */}
              <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
                {Array.from({ length: b.target }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 3,
                      borderRadius: 1,
                      background: i < count ? fillColor : "var(--surface-3)",
                      transition: "background 0.3s ease",
                    }}
                  />
                ))}
              </div>

              {/* card grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                  gap: 6,
                }}
              >
                {players.map((bp, idx) => (
                  <SignedCard key={idx} bp={bp} accent={accent} />
                ))}
                {Array.from({ length: open }).map((_, i) => (
                  <OpenSlotCard key={`open-${i}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SignedCard({
  bp,
  accent,
}: {
  bp: {
    player: { name: string; primary_position: string; overall: number; photo_path: string };
    price: number;
  };
  accent: string;
}) {
  const p = bp.player;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-2)",
        border: "1px solid var(--hairline)",
        borderRadius: 6,
        overflow: "hidden",
        position: "relative",
        animation: "sw-tick-in 0.36s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
    >
      {/* left accent stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 2,
          background: accent,
        }}
      />
      <div style={{ display: "flex", gap: 7, padding: "6px 7px 6px 9px", alignItems: "center" }}>
        <PlayerPhoto
          src={p.photo_path}
          name={p.name}
          size={32}
          rounded={4}
          pedestal="linear-gradient(160deg, var(--chalk) 0%, #DCD7C8 100%)"
          boxShadow="inset 0 0 0 1px rgba(0,0,0,0.20)"
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="sw-display"
            style={{
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.02em",
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              lineHeight: 1.1,
            }}
          >
            {p.name}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginTop: 1,
            }}
          >
            <span
              className="sw-display"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.10em",
                color: accent,
              }}
            >
              {p.primary_position}
            </span>
            <span style={{ color: "var(--dim)", fontSize: 9 }}>·</span>
            <span
              className="sw-mono"
              style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)" }}
            >
              {p.overall}
            </span>
          </div>
        </div>
      </div>
      <div
        className="sw-mono"
        style={{
          padding: "3px 8px 5px 11px",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--chalk)",
          borderTop: "1px solid var(--hairline)",
          background: "var(--ink)",
          letterSpacing: "-0.01em",
        }}
      >
        {fmtMoney(bp.price)}
      </div>
    </div>
  );
}

function OpenSlotCard() {
  return (
    <div
      style={{
        minHeight: 64,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        background: "transparent",
        border: "1px dashed var(--hairline-strong)",
        borderRadius: 6,
        padding: "10px 6px",
      }}
    >
      <span
        className="sw-display"
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.20em",
          color: "var(--dim)",
        }}
      >
        OPEN
      </span>
      <span
        className="sw-mono"
        style={{ fontSize: 9, color: "var(--dim)" }}
      >
        slot
      </span>
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
    DEF: "rgba(111, 177, 255, 0.10)",
    GK: "rgba(242, 237, 224, 0.08)",
  };
  const catAccent: Record<Category, string> = {
    ATT: "var(--whistle)",
    MID: "var(--floodlight)",
    DEF: "var(--keeper-blue)",
    GK: "var(--chalk)",
  };
  const catAccentSoft: Record<Category, string> = {
    ATT: "var(--whistle-soft)",
    MID: "var(--floodlight-soft)",
    DEF: "var(--keeper-blue-soft)",
    GK: "var(--chalk-soft)",
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
          <PlayerPhoto
            src={p.photo_path}
            name={p.name}
            size={84}
            rounded={8}
            pedestal="radial-gradient(circle at 50% 35%, #FFFFFF 0%, var(--chalk) 45%, #DCD7C8 100%)"
            boxShadow="0 6px 18px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.25), inset 0 0 0 1px rgba(255, 255, 255, 0.4)"
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
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              {/* PRIMARY POSITION — bigger, filled, in category accent */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 14,
                  letterSpacing: "0.16em",
                  padding: "5px 10px",
                  borderRadius: 5,
                  background: catAccentSoft[p.category],
                  color: catAccent[p.category],
                  border: `1px solid ${catAccent[p.category]}`,
                }}
              >
                {p.primary_position}
              </span>
              {/* CLUB + COUNTRY — display type, chalk, weighted differently to read at a glance */}
              <span
                className="sw-display"
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  color: "var(--chalk)",
                  letterSpacing: "0.02em",
                }}
              >
                {p.club}
              </span>
              <span style={{ color: "var(--dim)", fontSize: 14 }}>·</span>
              <span
                className="sw-display"
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: "var(--chalk)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  opacity: 0.85,
                }}
              >
                {p.country}
              </span>
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

      {/* ALSO PLAYS — outlined ghost chips, intentionally quieter than the primary position */}
      <div
        style={{
          padding: "8px 16px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <span className="sw-eyebrow sw-eyebrow-dim">Also plays</span>
        {altPositions.length === 0 ? (
          <span
            className="sw-mono"
            style={{ fontSize: 10, color: "var(--dim)", fontStyle: "italic" }}
          >
            specialist · {p.primary_position} only
          </span>
        ) : (
          altPositions.map((pos) => (
            <span
              key={pos}
              style={{
                display: "inline-flex",
                alignItems: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: "0.14em",
                padding: "2px 7px",
                borderRadius: 3,
                color: "var(--muted)",
                border: "1px dashed var(--hairline-strong)",
                background: "transparent",
              }}
            >
              {pos}
            </span>
          ))
        )}
      </div>

      {/* bid console */}
      <div style={{ padding: "12px 16px 14px", marginTop: "auto" }}>
        {/* BID-HOLDER BANNER — impossible-to-miss who holds the current bid */}
        <BidHolderBanner highBidder={lot.highBidder} currentBid={lot.currentBid} />

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

// ─────────────────────── BidHolderBanner — distinctive three-state ───────────────────────

function BidHolderBanner({
  highBidder,
  currentBid,
}: {
  highBidder: "user" | "ai" | null;
  currentBid: number;
}) {
  if (highBidder === null) {
    // STATE 1 — no bids yet · dashed neutral
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          marginBottom: 10,
          background: "var(--surface-2)",
          border: "1.5px dashed var(--hairline-strong)",
          borderRadius: 6,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 50,
              background: "transparent",
              border: "1.5px dashed var(--muted)",
            }}
          />
          <span
            className="sw-display"
            style={{
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            No bids yet · opening
          </span>
        </div>
        <span
          className="sw-mono"
          style={{ fontSize: 20, fontWeight: 700, color: "var(--muted)" }}
        >
          {fmtMoney(currentBid)}
        </span>
      </div>
    );
  }

  const isUser = highBidder === "user";
  const bg = isUser ? "var(--chalk)" : "var(--floodlight)";
  const label = isUser ? "You lead" : "AI leading";
  const stripeColor = isUser ? "#9F9A8C" : "#A3741A";

  // STATE 2 / 3 — chalk or floodlight, ink text, weighty fill
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        marginBottom: 10,
        background: bg,
        borderRadius: 6,
        overflow: "hidden",
        boxShadow: `0 6px 18px ${isUser ? "rgba(242, 237, 224, 0.16)" : "rgba(255, 182, 39, 0.18)"}`,
        animation: "sw-tick-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)",
      }}
      key={`${highBidder}-${currentBid}`}
    >
      <div style={{ width: 6, background: stripeColor, flex: "0 0 auto" }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          color: "var(--ink)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 50,
              background: "var(--ink)",
              boxShadow: "0 0 0 2px rgba(0,0,0,0.15)",
            }}
          />
          <span
            className="sw-display"
            style={{
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--ink)",
            }}
          >
            {label}
          </span>
        </div>
        <span
          className="sw-mono"
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--ink)",
            letterSpacing: "-0.01em",
          }}
        >
          {fmtMoney(currentBid)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────── HighestBidBoard (right column top) ───────────────────────

function HighestBidBoard({
  lot,
  lastResult,
}: {
  lot: LotStateDTO;
  lastResult: LotEndResp["lotResult"] | null;
}) {
  const high = lot.highBidder;
  const bidCount = lot.bidLog.length;
  const opening = bidCount === 0;
  // overlay the gavel banner only between lots (new lot just opened, no bids yet)
  const showGavel = lastResult && opening;

  // three matched states
  const state =
    high === "user" ? "you" : high === "ai" ? "ai" : "none";
  const accent =
    state === "you" ? "var(--chalk)" : state === "ai" ? "var(--floodlight)" : "var(--muted)";
  const tint =
    state === "you"
      ? "rgba(242, 237, 224, 0.06)"
      : state === "ai"
        ? "rgba(255, 182, 39, 0.08)"
        : "transparent";
  const stateLabel =
    state === "you" ? "YOU LEAD" : state === "ai" ? "AI LEADING" : "OPENING PRICE";

  return (
    <div
      className="sw-card"
      style={{
        background: `linear-gradient(180deg, ${tint} 0%, var(--surface-1) 60%)`,
        borderColor: state === "none" ? "var(--hairline)" : accent,
        boxShadow: state === "none" ? "none" : `inset 4px 0 0 ${accent}, 0 0 32px ${state === "you" ? "rgba(242, 237, 224, 0.05)" : "rgba(255, 182, 39, 0.07)"}`,
        transition: "box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease",
      }}
    >
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div className="sw-eyebrow">Hammer price · live</div>
        <span
          className="sw-mono"
          style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.08em" }}
        >
          {bidCount} {bidCount === 1 ? "bid" : "bids"}
        </span>
      </div>

      {/* state label sits right above the price — the second place you confirm who's winning */}
      <div
        className="sw-display"
        style={{
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "0.22em",
          color: accent,
          marginTop: 6,
          marginBottom: 2,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: 50,
            background: state === "none" ? "transparent" : accent,
            border: state === "none" ? "1.5px dashed var(--muted)" : "none",
            boxShadow: state === "none" ? "none" : `0 0 8px ${accent}`,
          }}
        />
        {stateLabel}
      </div>

      <div
        className="sw-mono"
        key={`${state}-${lot.currentBid}`}
        style={{
          fontSize: 44,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: state === "none" ? "var(--text)" : accent,
          lineHeight: 0.95,
          padding: "2px 0",
          animation: "sw-tick-in 0.32s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {fmtMoney(lot.currentBid)}
      </div>

      {opening && !showGavel && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
          floor set by the house · awaiting first bid
        </div>
      )}

      {showGavel && lastResult && (
        <div
          className="sw-tick"
          style={{
            marginTop: 10,
            padding: "8px 10px",
            background: "var(--surface-2)",
            border: "1px solid var(--hairline-strong)",
            borderLeft: `3px solid ${lastResult.winner === "user" ? "var(--chalk)" : lastResult.winner === "ai" ? "var(--floodlight)" : "var(--muted)"}`,
            borderRadius: 4,
          }}
        >
          <div
            className="sw-display"
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.22em",
              color: lastResult.winner === "user" ? "var(--chalk)" : lastResult.winner === "ai" ? "var(--floodlight)" : "var(--muted)",
            }}
          >
            GAVEL ·{" "}
            {lastResult.winner === "user"
              ? "YOU TOOK IT"
              : lastResult.winner === "ai"
                ? "AI TOOK IT"
                : "PASSED"}
          </div>
          <div className="sw-mono" style={{ color: "var(--muted)", marginTop: 2, fontSize: 11 }}>
            {fmtMoney(lastResult.price)}
            {lastResult.reconShotFired ? " · recon shot" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────── Ledger (left column) ───────────────────────

function Ledger({
  bought,
  budget,
  totalSlots,
}: {
  bought: Array<{ player: { name: string }; price: number }>;
  budget: number;
  totalSlots: number;
}) {
  const spent = bought.reduce((s, b) => s + b.price, 0);
  const count = bought.length;
  const avg = count > 0 ? Math.floor(spent / count) : 0;
  const highest =
    bought.length > 0
      ? bought.reduce((max, b) => (b.price > max.price ? b : max))
      : null;
  const remainingSlots = Math.max(0, totalSlots - count);
  const proj = remainingSlots > 0 ? Math.floor(budget / remainingSlots) : 0;

  return (
    <div className="sw-card">
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div className="sw-corner-mark">PAGE 2 · YOU</div>
      <div className="sw-eyebrow" style={{ marginBottom: 10 }}>Ledger · treasury detail</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <LedgerRow label="Spent" value={fmtMoney(spent)} accent="var(--chalk)" />
        <LedgerRow
          label="Avg per signing"
          value={count > 0 ? fmtMoney(avg) : "—"}
          accent="var(--text)"
        />
        <LedgerRow
          label="Highest bid"
          value={highest ? fmtMoney(highest.price) : "—"}
          aux={highest ? highest.player.name : undefined}
          accent="var(--text)"
        />
        <LedgerRow
          label="Per slot left"
          value={remainingSlots > 0 ? fmtMoney(proj) : "—"}
          aux={remainingSlots > 0 ? `${remainingSlots} slots open` : "squad full"}
          accent="var(--chalk)"
        />
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  aux,
  accent,
}: {
  label: string;
  value: string;
  aux?: string;
  accent: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <span
        className="sw-display"
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.16em",
          color: "var(--muted)",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 0 }}>
        <span
          className="sw-mono"
          style={{ fontSize: 13, fontWeight: 700, color: accent, lineHeight: 1.1 }}
        >
          {value}
        </span>
        {aux && (
          <span
            style={{
              fontSize: 10,
              color: "var(--dim)",
              fontFamily: "var(--font-mono)",
              maxWidth: 140,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {aux}
          </span>
        )}
      </span>
    </div>
  );
}

// ─────────────────────── Chemistry (left column bottom) ───────────────────────

function Chemistry({
  bought,
}: {
  bought: Array<{ player: { name: string; country: string; club: string } }>;
}) {
  const countries = new Map<string, string[]>();
  const clubs = new Map<string, string[]>();
  for (const bp of bought) {
    const c = bp.player.country;
    if (!countries.has(c)) countries.set(c, []);
    countries.get(c)!.push(bp.player.name);
    const k = bp.player.club;
    if (!clubs.has(k)) clubs.set(k, []);
    clubs.get(k)!.push(bp.player.name);
  }
  const countryClusters = [...countries.entries()]
    .filter(([, n]) => n.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  const clubClusters = [...clubs.entries()]
    .filter(([, n]) => n.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);
  const totalLinks = [...countryClusters, ...clubClusters].reduce(
    (s, [, n]) => s + (n.length * (n.length - 1)) / 2,
    0
  );
  const empty = countryClusters.length === 0 && clubClusters.length === 0;

  return (
    <div className="sw-card" style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <span className="sw-tick-tl" /><span className="sw-tick-tr" />
      <span className="sw-tick-bl" /><span className="sw-tick-br" />
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
      >
        <div className="sw-eyebrow">Chemistry · brewing</div>
        <span
          className="sw-mono"
          style={{ fontSize: 10, color: "var(--dim)", letterSpacing: "0.06em" }}
        >
          {totalLinks} {totalLinks === 1 ? "link" : "links"}
        </span>
      </div>

      <div className="sw-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        {empty ? (
          <div
            style={{
              padding: "14px 4px",
              fontSize: 11,
              color: "var(--dim)",
              fontFamily: "var(--font-mono)",
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            no links forming yet · sign players from a shared nation or club to build chemistry
          </div>
        ) : (
          <>
            {countryClusters.length > 0 && (
              <ClusterGroup label="By country" entries={countryClusters} accent="var(--chalk)" />
            )}
            {clubClusters.length > 0 && (
              <ClusterGroup label="By club" entries={clubClusters} accent="var(--floodlight)" />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ClusterGroup({
  label,
  entries,
  accent,
}: {
  label: string;
  entries: Array<[string, string[]]>;
  accent: string;
}) {
  return (
    <div>
      <div className="sw-eyebrow sw-eyebrow-dim" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {entries.map(([name, players]) => {
          const links = (players.length * (players.length - 1)) / 2;
          return (
            <div
              key={name}
              style={{
                padding: "7px 9px",
                background: "var(--surface-2)",
                border: "1px solid var(--hairline)",
                borderLeft: `2px solid ${accent}`,
                borderRadius: 4,
                animation: "sw-tick-in 0.36s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 3,
                  gap: 8,
                }}
              >
                <span
                  className="sw-display"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    color: "var(--text)",
                    textTransform: "uppercase",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {name}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}>
                  <span
                    className="sw-mono"
                    style={{ fontSize: 11, color: accent, fontWeight: 700 }}
                  >
                    ×{players.length}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--dim)",
                      letterSpacing: "0.06em",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    · {links} {links === 1 ? "link" : "links"}
                  </span>
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.01em",
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {players.join(" · ")}
              </div>
            </div>
          );
        })}
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
