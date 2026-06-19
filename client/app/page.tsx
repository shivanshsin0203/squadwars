"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8787";

// ─────────────────────────── design tokens ───────────────────────────

const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

  html, body { margin: 0; padding: 0; height: 100%; }

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
    --keeper-blue: #6FB1FF;
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
      radial-gradient(ellipse 60% 40% at 50% 38%, rgba(255, 182, 39, 0.06), transparent 70%),
      radial-gradient(ellipse 70% 50% at 20% 100%, rgba(242, 237, 224, 0.025), transparent 70%),
      radial-gradient(ellipse 60% 40% at 85% 0%, rgba(111, 177, 255, 0.035), transparent 70%),
      var(--ink);
    color: var(--text);
    font-family: var(--font-body);
    height: 100vh;
    width: 100%;
    padding: 22px 28px;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .sw-landing *, .sw-landing *::before, .sw-landing *::after { box-sizing: border-box; }
  .sw-landing button, .sw-landing a { font-family: inherit; cursor: pointer; }

  .sw-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .sw-eyebrow {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.22em;
    color: var(--muted);
    text-transform: uppercase;
  }
  .sw-tick-tl, .sw-tick-tr, .sw-tick-bl, .sw-tick-br {
    position: absolute; width: 12px; height: 12px;
    border-color: var(--hairline-strong);
    pointer-events: none;
  }
  .sw-tick-tl { top: 12px; left: 12px; border-top: 1px solid; border-left: 1px solid; }
  .sw-tick-tr { top: 12px; right: 12px; border-top: 1px solid; border-right: 1px solid; }
  .sw-tick-bl { bottom: 12px; left: 12px; border-bottom: 1px solid; border-left: 1px solid; }
  .sw-tick-br { bottom: 12px; right: 12px; border-bottom: 1px solid; border-right: 1px solid; }

  /* topbar with catalog stamp */
  .sw-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex: 0 0 auto;
  }
  .sw-top-left {
    font-family: var(--font-display);
    font-size: 10px; font-weight: 700;
    letter-spacing: 0.30em;
    color: var(--dim);
    text-transform: uppercase;
  }
  .sw-status-strip {
    display: flex; align-items: center; gap: 14px;
    font-family: var(--font-mono); font-size: 10px;
    color: var(--dim); letter-spacing: 0.08em;
  }
  .sw-status-ok { color: var(--chalk-dim); }
  .sw-status-bad { color: var(--whistle); }

  /* hero */
  .sw-hero {
    flex: 1; min-height: 0;
    display: grid;
    grid-template-columns: 1fr;
    align-content: center;
    justify-items: start;
    gap: 18px;
    padding: 6px 0;
    max-width: 880px;
  }
  .sw-wordmark {
    font-family: var(--font-display);
    font-weight: 800;
    font-size: clamp(72px, 13vw, 168px);
    line-height: 0.86;
    letter-spacing: -0.005em;
    color: var(--chalk);
    text-transform: uppercase;
    margin: 0;
    text-shadow: 0 0 32px rgba(255, 182, 39, 0.10);
    animation: sw-wordmark-in 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  @keyframes sw-wordmark-in {
    0%   { opacity: 0; transform: translateY(14px); clip-path: inset(0 0 100% 0); }
    100% { opacity: 1; transform: translateY(0);    clip-path: inset(0 0 0% 0); }
  }
  .sw-wordmark-floodlight {
    color: var(--floodlight);
  }

  .sw-tagline {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.32em;
    color: var(--floodlight);
    text-transform: uppercase;
    margin: 0;
    animation: sw-fade-in 0.7s ease-out 0.20s both;
  }
  .sw-pitch-meta {
    font-family: var(--font-body);
    font-size: 14px;
    color: var(--muted);
    max-width: 560px;
    line-height: 1.55;
    margin: 0;
    animation: sw-fade-in 0.7s ease-out 0.30s both;
  }
  @keyframes sw-fade-in {
    0%   { opacity: 0; transform: translateY(8px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* commit row */
  .sw-commit-row {
    display: flex; align-items: center; gap: 16px;
    margin-top: 8px;
    animation: sw-fade-in 0.7s ease-out 0.40s both;
  }
  .sw-btn-bid {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: 0.20em;
    text-transform: uppercase;
    font-size: 16px;
    padding: 18px 36px;
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    border-radius: var(--r-md);
    box-shadow: 0 0 0 1px rgba(0,0,0,0.6), 0 10px 30px rgba(242, 237, 224, 0.22);
    transition: background 0.12s ease, transform 0.05s ease;
    cursor: pointer;
  }
  .sw-btn-bid:hover:not(:disabled) { background: #FFFCF2; }
  .sw-btn-bid:active:not(:disabled) { transform: translateY(1px); }
  .sw-btn-bid:disabled {
    background: var(--surface-3);
    color: var(--dim);
    border-color: var(--hairline);
    box-shadow: none;
    cursor: wait;
  }
  .sw-commit-helper {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--dim);
    letter-spacing: 0.06em;
  }
  .sw-commit-err {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--whistle);
    background: rgba(230, 57, 70, 0.16);
    border: 1px solid rgba(230, 57, 70, 0.30);
    border-radius: var(--r-sm);
    padding: 6px 9px;
  }

  /* spec strip — broadsheet-style stat line */
  .sw-spec-strip {
    flex: 0 0 auto;
    display: flex; align-items: center; gap: 20px;
    padding: 16px 0 4px;
    border-top: 1px solid var(--hairline);
    font-family: var(--font-display);
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    flex-wrap: wrap;
  }
  .sw-spec-strip .sw-spec-val {
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--chalk-dim);
    letter-spacing: 0.04em;
    margin-left: 6px;
  }
  .sw-spec-strip .sw-spec-sep {
    color: var(--dim); font-family: var(--font-mono); font-size: 10px;
  }
`;

// ─────────────────────────── component ───────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const [health, setHealth] = useState<"loading" | "ok" | "bad">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${BACKEND_URL}/health`, { credentials: "include" })
      .then((r) => r.json())
      .then(() => { if (!cancelled) setHealth("ok"); })
      .catch(() => { if (!cancelled) setHealth("bad"); });
    return () => { cancelled = true; };
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
        <span className="sw-tick-tl" /><span className="sw-tick-tr" />
        <span className="sw-tick-bl" /><span className="sw-tick-br" />

        {/* top bar — catalog stamp + backend status */}
        <div className="sw-top">
          <div className="sw-top-left">SQUADWARS · MATCHDAY 01 · PRE-GAME</div>
          <div className="sw-status-strip">
            <span>
              BACKEND&nbsp;
              <span className={health === "ok" ? "sw-status-ok" : health === "bad" ? "sw-status-bad" : ""}>
                {health === "ok" ? "ONLINE" : health === "bad" ? "OFFLINE" : "CHECKING…"}
              </span>
            </span>
          </div>
        </div>

        {/* hero */}
        <div className="sw-hero">
          <h1 className="sw-wordmark">
            SQUAD<span className="sw-wordmark-floodlight">WARS</span>
          </h1>

          <p className="sw-tagline">LIVE FOOTBALL AUCTION · 1 V 1 VS AI</p>

          <p className="sw-pitch-meta">
            you and the AI take turns at the rostrum, bidding live on real footballers across
            thirty-plus lots — then field a starting XI in the shape you choose. the side
            with the better XI wins the night.
          </p>

          <div className="sw-commit-row">
            <button
              type="button"
              className="sw-btn-bid"
              onClick={startGame}
              disabled={busy}
            >
              {busy ? "ENTERING THE FLOOR…" : "▶ START GAME"}
            </button>
            <span className="sw-commit-helper">
              {busy ? "loading setup…" : "next: chalk the line (pick formation)"}
            </span>
            {error && <span className="sw-commit-err">{error}</span>}
          </div>
        </div>

        {/* spec strip */}
        <div className="sw-spec-strip">
          <span>TREASURY<span className="sw-spec-val">€1B</span></span>
          <span className="sw-spec-sep">·</span>
          <span>QUEUE<span className="sw-spec-val">33–35 LOTS</span></span>
          <span className="sw-spec-sep">·</span>
          <span>ON THE BLOCK<span className="sw-spec-val">20s / LOT</span></span>
          <span className="sw-spec-sep">·</span>
          <span>STARTING XI<span className="sw-spec-val">11</span></span>
          <span className="sw-spec-sep">·</span>
          <span>SHAPES<span className="sw-spec-val">6</span></span>
        </div>
      </div>
    </>
  );
}
