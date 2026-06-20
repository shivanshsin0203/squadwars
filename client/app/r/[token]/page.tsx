/**
 * Public shared-result page (`/r/[token]`).
 *
 * Stateless: the whole result is decoded from the URL token — no backend call,
 * no session. This is the surface a shared link unfurls to, and the viral loop:
 * its primary action is "Play your own night" → /setup.
 *
 * Server Component. The only interactive affordances are plain links (the X
 * intent and the Play CTA), so no client JS is needed here.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import {
  decodeShareData,
  winnerWord,
  buildShareText,
  buildTweetIntent,
  type ShareData,
} from "@/lib/shareCard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const d = decodeShareData(token);
  if (!d) {
    return { title: "Match card · SquadWars", description: "A real-time 1v1 football auction." };
  }
  const [u, a] = d.s;
  const verb = d.w === "u" ? "won" : d.w === "a" ? "lost" : "drew";
  const title = `${winnerWord(d.w)} ${u}–${a} · ${d.f} vs ${d.p}`;
  const description = `Someone ${verb} their SquadWars night ${u}–${a} in a ${d.f} vs ${d.p}. Play your own.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// ─────────────────────────── presentation ───────────────────────────

const tokens = `
  html, body { margin: 0; padding: 0; }

  .sw-rp {
    --ink:#0B1018; --surface-1:#131A24; --surface-2:#0F1620; --surface-3:#1A2230;
    --chalk:#F2EDE0; --chalk-soft:rgba(242,237,224,0.10);
    --floodlight:#FFB627; --floodlight-soft:rgba(255,182,39,0.12);
    --whistle:#E63946; --keeper-blue:#6FB1FF;
    --text:#EFEFEF; --muted:#9099A8; --dim:#5C6573;
    --hairline:rgba(255,255,255,0.06); --hairline-strong:rgba(255,255,255,0.10);
    --font-display:var(--font-saira),'Arial Narrow',sans-serif;
    --font-body:var(--font-inter),ui-sans-serif,system-ui,-apple-system,sans-serif;
    --font-mono:var(--font-jetbrains),ui-monospace,Menlo,Consolas,monospace;
    --r-sm:4px; --r-md:8px; --r-lg:12px;
    min-height:100vh; width:100%; box-sizing:border-box;
    background:
      radial-gradient(ellipse 60% 45% at 50% 8%, var(--glow, rgba(255,182,39,0.05)), transparent 70%),
      radial-gradient(ellipse 70% 50% at 15% 100%, rgba(111,177,255,0.03), transparent 70%),
      var(--ink);
    color:var(--text); font-family:var(--font-body);
    display:flex; flex-direction:column; align-items:center;
    padding:28px 22px 48px;
  }
  .sw-rp *, .sw-rp *::before, .sw-rp *::after { box-sizing:border-box; }
  .sw-rp a { text-decoration:none; font-family:inherit; }
  .sw-mono { font-family:var(--font-mono); font-variant-numeric:tabular-nums; }
  .sw-eyebrow { font-family:var(--font-display); font-weight:700; font-size:10px; letter-spacing:0.22em; color:var(--muted); text-transform:uppercase; }

  /* top brand bar */
  .sw-rp-top { width:100%; max-width:680px; display:flex; align-items:center; justify-content:space-between; margin-bottom:26px; }
  .sw-rp-brand { display:flex; align-items:center; gap:10px; }
  .sw-rp-word { font-family:var(--font-display); font-weight:800; font-size:18px; letter-spacing:0.14em; text-transform:uppercase; color:var(--chalk); }
  .sw-rp-word .fl { color:var(--floodlight); }
  .sw-rp-stamp { font-family:var(--font-display); font-weight:700; font-size:10px; letter-spacing:0.24em; text-transform:uppercase; color:var(--dim); }

  /* the card */
  .sw-rp-card {
    position:relative; width:100%; max-width:680px;
    background:
      radial-gradient(ellipse 80% 60% at 0% 0%, rgba(242,237,224,0.05), transparent 60%),
      radial-gradient(ellipse 70% 60% at 100% 100%, rgba(255,182,39,0.05), transparent 60%),
      var(--surface-1);
    border:1px solid var(--hairline-strong); border-radius:16px;
    padding:34px 30px 30px; overflow:hidden;
    box-shadow:0 30px 80px rgba(0,0,0,0.5);
  }
  .sw-rp-card-stripe { position:absolute; top:0; left:0; right:0; height:3px; }
  .sw-tick { position:absolute; width:11px; height:11px; border-color:var(--hairline-strong); pointer-events:none; }
  .sw-tick.tl { top:11px; left:11px; border-top:1px solid; border-left:1px solid; }
  .sw-tick.tr { top:11px; right:11px; border-top:1px solid; border-right:1px solid; }
  .sw-tick.bl { bottom:11px; left:11px; border-bottom:1px solid; border-left:1px solid; }
  .sw-tick.br { bottom:11px; right:11px; border-bottom:1px solid; border-right:1px solid; }

  .sw-rp-verdict { display:flex; flex-direction:column; align-items:center; }
  .sw-rp-ft { font-family:var(--font-display); font-weight:700; font-size:11px; letter-spacing:0.28em; color:var(--muted); text-transform:uppercase; }
  .sw-rp-word-big { font-family:var(--font-display); font-weight:800; font-size:clamp(56px,12vw,88px); line-height:1; letter-spacing:0.03em; margin-top:8px; }

  .sw-rp-score { display:flex; align-items:center; justify-content:center; gap:18px; margin-top:18px; }
  .sw-rp-side { display:flex; flex-direction:column; align-items:center; gap:4px; min-width:120px; }
  .sw-rp-side-l { font-family:var(--font-display); font-weight:800; font-size:13px; letter-spacing:0.22em; text-transform:uppercase; }
  .sw-rp-num { font-family:var(--font-mono); font-weight:800; font-size:56px; line-height:0.9; }
  .sw-rp-break { font-family:var(--font-mono); font-size:11px; color:var(--muted); letter-spacing:0.03em; }
  .sw-rp-dash { font-family:var(--font-display); font-weight:700; font-size:30px; color:var(--dim); }

  .sw-rp-meta { text-align:center; margin-top:18px; font-family:var(--font-display); font-weight:700; font-size:13px; letter-spacing:0.14em; text-transform:uppercase; color:var(--chalk-dim, rgba(242,237,224,0.55)); }
  .sw-rp-meta .sep { color:var(--dim); margin:0 8px; }

  .sw-rp-chips { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:18px; }
  .sw-rp-chip { display:inline-flex; align-items:center; padding:6px 13px; border-radius:999px; border:1px solid var(--hairline-strong); background:var(--surface-2); font-family:var(--font-display); font-weight:700; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:var(--chalk); }

  .sw-rp-roast { margin-top:22px; border-left:3px solid var(--floodlight); padding:4px 0 4px 16px; font-size:15px; line-height:1.55; font-style:italic; color:#D9D4C8; }
  .sw-rp-roast b { font-style:normal; font-family:var(--font-display); font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--floodlight); display:block; font-size:10px; margin-bottom:6px; }

  /* CTA */
  .sw-rp-cta { width:100%; max-width:680px; display:flex; align-items:center; justify-content:center; gap:14px; margin-top:26px; flex-wrap:wrap; }
  .sw-rp-play {
    font-family:var(--font-display); font-weight:800; letter-spacing:0.18em; text-transform:uppercase; font-size:15px;
    padding:16px 34px; background:var(--chalk); color:var(--ink); border-radius:var(--r-md);
    box-shadow:0 0 0 1px rgba(0,0,0,0.6), 0 12px 34px rgba(242,237,224,0.22);
    transition:background .12s ease, transform .05s ease;
  }
  .sw-rp-play:hover { background:#FFFCF2; }
  .sw-rp-x {
    display:inline-flex; align-items:center; gap:8px;
    font-family:var(--font-display); font-weight:700; letter-spacing:0.12em; text-transform:uppercase; font-size:13px;
    padding:14px 22px; background:var(--surface-3); color:var(--text);
    border:1px solid var(--hairline-strong); border-radius:var(--r-md);
    transition:background .12s ease;
  }
  .sw-rp-x:hover { background:#232C3D; }

  .sw-rp-foot { margin-top:30px; font-family:var(--font-mono); font-size:11px; color:var(--dim); letter-spacing:0.06em; text-align:center; }
  .sw-rp-foot a { color:var(--muted); }
`;

function Medallion({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <radialGradient id="rpm" cx="0.5" cy="0.30" r="0.62">
          <stop offset="0" stopColor="#FFB627" stopOpacity="0.24" />
          <stop offset="1" stopColor="#FFB627" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0B1018" />
      <rect width="32" height="32" rx="7" fill="url(#rpm)" />
      <path d="M16 5 A11 11 0 0 0 16 27 Z" fill="#F2EDE0" />
      <path d="M16 5 A11 11 0 0 1 16 27 Z" fill="#FFB627" />
      <circle cx="16" cy="16" r="11" stroke="#0B1018" strokeOpacity="0.22" strokeWidth="0.6" fill="none" />
      <path d="M7.5 10.5 L11.5 21.5 L16 14.5 L20.5 21.5 L24.5 10.5" stroke="#0B1018" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function XGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const d = decodeShareData(token);

  // Build the canonical absolute URL of THIS page from the live request, so the
  // X-intent link is correct on whatever origin we're served from.
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shareUrl = `${proto}://${host}/r/${token}`;

  if (!d) {
    return (
      <div className="sw-rp">
        <style>{tokens}</style>
        <div className="sw-rp-top">
          <div className="sw-rp-brand"><Medallion /><span className="sw-rp-word">SQUAD<span className="fl">WARS</span></span></div>
        </div>
        <div className="sw-rp-card" style={{ textAlign: "center" }}>
          <span className="sw-tick tl" /><span className="sw-tick tr" /><span className="sw-tick bl" /><span className="sw-tick br" />
          <div className="sw-rp-word-big" style={{ color: "var(--muted)", fontSize: 40 }}>CARD NOT FOUND</div>
          <p style={{ color: "var(--muted)", marginTop: 12 }}>This match card couldn&apos;t be read — but you can still play your own.</p>
        </div>
        <div className="sw-rp-cta"><Link href="/setup" className="sw-rp-play">▶ Play SquadWars</Link></div>
      </div>
    );
  }

  const [u, a] = d.s;
  const verdictColor = d.w === "u" ? "var(--chalk)" : d.w === "a" ? "var(--floodlight)" : "var(--muted)";
  const glow = d.w === "u" ? "rgba(242,237,224,0.06)" : d.w === "a" ? "rgba(255,182,39,0.07)" : "rgba(255,255,255,0.03)";
  const stripe = d.w === "u" ? "var(--chalk)" : d.w === "a" ? "var(--floodlight)" : "var(--dim)";
  const tweet = buildTweetIntent(shareUrl, buildShareText(d));

  return (
    <div className="sw-rp" style={{ ["--glow" as string]: glow }}>
      <style>{tokens}</style>

      <div className="sw-rp-top">
        <div className="sw-rp-brand"><Medallion /><span className="sw-rp-word">SQUAD<span className="fl">WARS</span></span></div>
        <span className="sw-rp-stamp">Shared card</span>
      </div>

      <div className="sw-rp-card">
        <span className="sw-rp-card-stripe" style={{ background: stripe }} />
        <span className="sw-tick tl" /><span className="sw-tick tr" /><span className="sw-tick bl" /><span className="sw-tick br" />

        <div className="sw-rp-verdict">
          <span className="sw-rp-ft">Full time</span>
          <span className="sw-rp-word-big" style={{ color: verdictColor, textShadow: `0 0 36px ${glow}` }}>
            {winnerWord(d.w)}
          </span>
        </div>

        <div className="sw-rp-score">
          <div className="sw-rp-side">
            <span className="sw-rp-side-l" style={{ color: "var(--chalk)" }}>You</span>
            <span className="sw-rp-num" style={{ color: "var(--chalk)" }}>{u}</span>
            <span className="sw-rp-break">OVR {d.uo} · CHEM {d.uc}</span>
          </div>
          <span className="sw-rp-dash">–</span>
          <div className="sw-rp-side">
            <span className="sw-rp-side-l" style={{ color: "var(--floodlight)" }}>{d.p}</span>
            <span className="sw-rp-num" style={{ color: "var(--floodlight)" }}>{a}</span>
            <span className="sw-rp-break">OVR {d.ao} · CHEM {d.ac}</span>
          </div>
        </div>

        <div className="sw-rp-meta">
          <span>{d.f}</span><span className="sep">·</span><span>vs {d.p}</span>
        </div>

        {d.m.length > 0 && (
          <div className="sw-rp-chips">
            {d.m.map((name, i) => (
              <span key={i} className="sw-rp-chip">{name}</span>
            ))}
          </div>
        )}
      </div>

      <div className="sw-rp-cta">
        <Link href="/setup" className="sw-rp-play">▶ Play your own night</Link>
        <a href={tweet} target="_blank" rel="noopener noreferrer" className="sw-rp-x"><XGlyph /> Share on X</a>
      </div>

      <div className="sw-rp-foot">
        SquadWars — a real-time 1v1 football auction · <Link href="/">squadwars.app</Link>
      </div>
    </div>
  );
}
