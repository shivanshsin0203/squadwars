"use client";

/**
 * ViewportGate · viewport-aware splash for devices that can't deliver the
 * laptop-grade experience the game is built for.
 *
 * Three modes, checked in priority order:
 *
 *   1. width < 600px                          → PHONE SPLASH.
 *      Drag-drop on tiny screens is fundamentally broken; show a "use a larger
 *      screen" message with a continue-anyway escape hatch.
 *
 *   2. 600px ≤ width < 1024px AND portrait    → ROTATE HINT.
 *      Tablet held vertically. Landscape is much friendlier for this game's
 *      wide layouts (auction strip, side-by-side squad comparison). Show a
 *      lightweight "rotate to landscape" hint, dismissable.
 *
 *   3. otherwise                              → PASS THROUGH.
 *      Renders children normally. Tablets in landscape are supported — the
 *      squad-builder uses mobile-drag-drop polyfill (see SquadBuilder.tsx) so
 *      touch DnD works, and the auction-room collapses at 1080px instead of
 *      1180px so iPad Mini and iPad Pro 11" keep the 3-column broadcast layout.
 *
 * Once a user clicks "Continue anyway" the override sticks for the session.
 */

import { useEffect, useState } from "react";

type Mode = "phone" | "rotate" | "ok";

function detect(): Mode {
  if (typeof window === "undefined") return "ok";
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w < 600) return "phone";
  if (w < 1024 && h > w) return "rotate";
  return "ok";
}

export default function ViewportGate({
  children,
  pageLabel = "SQUADWARS",
}: {
  children: React.ReactNode;
  /** Short label shown in the splash for page context (e.g. "AUCTION ROOM"). */
  pageLabel?: string;
}) {
  // null until first effect runs (avoids SSR/CSR mismatch flicker).
  const [mode, setMode] = useState<Mode | null>(null);
  const [overridden, setOverridden] = useState(false);

  useEffect(() => {
    const update = () => setMode(detect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  // Phone splash — full takeover.
  if (mode === "phone" && !overridden) {
    return (
      <>
        <style>{tokens}</style>
        <div className="sw-gate">
          <div className="sw-gate-card">
            <div className="sw-gate-eyebrow">{pageLabel}</div>
            <h1 className="sw-gate-headline">
              Best played on a<br />tablet or laptop.
            </h1>
            <p className="sw-gate-body">
              SquadWars leans hard on drag-and-drop, side-by-side comparisons,
              and fast bidding. Phone screens compress the layout to the point
              of unplayability — open this on a wider screen for the proper game.
            </p>
            <div className="sw-gate-actions">
              <button
                type="button"
                className="sw-gate-btn-primary"
                onClick={() => setOverridden(true)}
              >
                CONTINUE ANYWAY →
              </button>
              <span className="sw-gate-hint">
                Layout may break. You've been warned.
              </span>
            </div>
            <div className="sw-gate-foot">
              <span className="sw-gate-foot-eyebrow">RECOMMENDED</span>
              <span className="sw-gate-foot-val">768 PX +</span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Tablet portrait — rotate hint (dismissable).
  if (mode === "rotate" && !overridden) {
    return (
      <>
        <style>{tokens}</style>
        <div className="sw-gate sw-gate-rotate">
          <div className="sw-gate-card sw-gate-card-rotate">
            <div className="sw-gate-rotate-icon" aria-hidden="true">
              <svg viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect
                  x="3" y="9" width="28" height="40" rx="3"
                  stroke="currentColor" strokeWidth="2"
                  className="sw-gate-rot-portrait"
                />
                <rect
                  x="22" y="14" width="40" height="28" rx="3"
                  stroke="currentColor" strokeWidth="2"
                />
                <path
                  d="M14 6 Q 27 1, 36 6"
                  stroke="currentColor" strokeWidth="1.6" fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M14 6 L 11 3 M14 6 L 17 3"
                  stroke="currentColor" strokeWidth="1.6" fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div className="sw-gate-eyebrow">{pageLabel}</div>
            <h1 className="sw-gate-headline sw-gate-headline-sm">
              Rotate to landscape.
            </h1>
            <p className="sw-gate-body">
              The auction strip and the side-by-side squad comparison need a
              wide screen. Flip your tablet sideways — the layout snaps into
              place immediately.
            </p>
            <div className="sw-gate-actions">
              <button
                type="button"
                className="sw-gate-btn-primary"
                onClick={() => setOverridden(true)}
              >
                CONTINUE IN PORTRAIT →
              </button>
              <span className="sw-gate-hint">
                Some sections will stack vertically — playable but not pretty.
              </span>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Pass through — desktop / laptop / tablet landscape / iPad Pro portrait.
  return <>{children}</>;
}

const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@500;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');
  .sw-gate {
    --ink: #0B1018;
    --surface-1: #131A24;
    --surface-2: #0F1620;
    --surface-3: #1A2230;
    --chalk: #F2EDE0;
    --chalk-soft: rgba(242, 237, 224, 0.10);
    --floodlight: #FFB627;
    --floodlight-soft: rgba(255, 182, 39, 0.12);
    --whistle: #E63946;
    --text: #EFEFEF;
    --muted: #9099A8;
    --dim: #5C6573;
    --hairline-strong: rgba(255, 255, 255, 0.10);

    background:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(255, 182, 39, 0.04), transparent 70%),
      radial-gradient(ellipse 70% 50% at 85% 100%, rgba(242, 237, 224, 0.03), transparent 70%),
      var(--ink);
    color: var(--text);
    font-family: 'Inter', ui-sans-serif, system-ui, sans-serif;
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 22px 18px;
    box-sizing: border-box;
  }
  .sw-gate * { box-sizing: border-box; }
  .sw-gate-card {
    width: 100%;
    max-width: 460px;
    background: var(--surface-1);
    border: 1px solid var(--hairline-strong);
    border-radius: 14px;
    padding: 28px 24px 22px;
    text-align: left;
    position: relative;
  }
  .sw-gate-card-rotate {
    text-align: center;
  }
  .sw-gate-eyebrow {
    font-family: 'Saira Condensed', sans-serif;
    font-weight: 800;
    font-size: 10px;
    letter-spacing: 0.30em;
    color: var(--floodlight);
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .sw-gate-rotate-icon {
    color: var(--chalk);
    width: 80px;
    height: 60px;
    margin: 0 auto 12px;
    opacity: 0.85;
  }
  .sw-gate-rotate-icon svg {
    width: 100%;
    height: 100%;
  }
  /* gentle rotation tease */
  .sw-gate-rot-portrait {
    transform-origin: center;
    animation: sw-gate-tilt 2.6s ease-in-out infinite;
  }
  @keyframes sw-gate-tilt {
    0%, 65%, 100% { transform: rotate(0deg); }
    80%, 92%      { transform: rotate(-12deg) translate(2px, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sw-gate-rot-portrait { animation: none; }
  }
  .sw-gate-headline {
    font-family: 'Saira Condensed', sans-serif;
    font-weight: 800;
    font-size: 30px;
    letter-spacing: 0.04em;
    line-height: 1.05;
    color: var(--chalk);
    text-transform: uppercase;
    margin: 0 0 16px;
  }
  .sw-gate-headline-sm { font-size: 26px; }
  .sw-gate-body {
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--muted);
    margin: 0 0 22px;
  }
  .sw-gate-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin-bottom: 18px;
  }
  .sw-gate-card-rotate .sw-gate-actions {
    align-items: center;
  }
  .sw-gate-btn-primary {
    font-family: 'Saira Condensed', sans-serif;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-size: 12px;
    padding: 12px 18px;
    background: var(--chalk);
    color: var(--ink);
    border: 1px solid var(--chalk);
    border-radius: 8px;
    cursor: pointer;
    width: 100%;
    box-shadow: 0 8px 24px rgba(242, 237, 224, 0.18);
    transition: filter 0.15s ease, transform 0.05s ease;
  }
  .sw-gate-btn-primary:hover { filter: brightness(1.05); }
  .sw-gate-btn-primary:active { transform: translateY(1px); }
  .sw-gate-hint {
    font-size: 11px;
    color: var(--dim);
    line-height: 1.3;
    text-align: inherit;
  }
  .sw-gate-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--hairline-strong);
  }
  .sw-gate-foot-eyebrow {
    font-family: 'Saira Condensed', sans-serif;
    font-weight: 700;
    font-size: 9px;
    letter-spacing: 0.30em;
    color: var(--dim);
    text-transform: uppercase;
  }
  .sw-gate-foot-val {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--chalk);
  }
`;
