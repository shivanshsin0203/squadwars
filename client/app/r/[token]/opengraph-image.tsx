import { ImageResponse } from "next/og";
import { decodeShareData, winnerWord, type ShareData } from "@/lib/shareCard";
import { loadSairaCondensed, MEDALLION_DATA_URI } from "@/lib/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SquadWars match result";

// YOU = chalk, AI = floodlight (design.md, load-bearing).
const CHALK = "#F2EDE0";
const FLOOD = "#FFB627";
const INK = "#0B1018";
const MUTED = "#9099A8";
const DIM = "#5C6573";

function colours(d: ShareData) {
  // The winning side glows; the verdict word takes the winner's colour.
  if (d.w === "u") return { verdict: CHALK, glow: "rgba(242,237,224,0.16)" };
  if (d.w === "a") return { verdict: FLOOD, glow: "rgba(255,182,39,0.18)" };
  return { verdict: MUTED, glow: "rgba(255,255,255,0.05)" };
}

export default async function ShareOG({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const d = decodeShareData(token);
  const [bold, semi] = await Promise.all([loadSairaCondensed(800), loadSairaCondensed(700)]);
  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [];
  if (bold) fonts.push({ name: "Saira Condensed", data: bold, weight: 800, style: "normal" });
  if (semi) fonts.push({ name: "Saira Condensed", data: semi, weight: 700, style: "normal" });
  const display = fonts.length ? "'Saira Condensed'" : "sans-serif";

  // Graceful fallback if the token is unreadable — still a branded card.
  if (!d) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: INK, color: CHALK, fontFamily: display, gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MEDALLION_DATA_URI} alt="" width={120} height={120} />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, textTransform: "uppercase", letterSpacing: "-0.01em" }}>
            SQUAD<span style={{ color: FLOOD }}>WARS</span>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: MUTED, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            Real-time 1v1 football auction
          </div>
        </div>
      ),
      { ...size, fonts: fonts.length ? fonts : undefined },
    );
  }

  const c = colours(d);
  const [u, a] = d.s;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: "#EFEFEF", fontFamily: display, padding: "52px 72px", position: "relative" }}>
        {/* winner glow */}
        <div style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse 70% 55% at 50% 30%, ${c.glow}, transparent 70%)` }} />

        {/* top row: brand + full time */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MEDALLION_DATA_URI} alt="" width={54} height={54} />
            <span style={{ display: "flex", fontSize: 26, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              SQUAD<span style={{ color: FLOOD }}>WARS</span>
            </span>
          </div>
          <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: MUTED }}>
            Full time
          </span>
        </div>

        {/* verdict + scoreboard */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 30 }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: "0.04em", lineHeight: 1, color: c.verdict, textShadow: `0 0 40px ${c.glow}` }}>
            {winnerWord(d.w)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 18 }}>
            <span style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: "0.16em", color: CHALK }}>YOU</span>
            <span style={{ display: "flex", fontSize: 76, fontWeight: 800, letterSpacing: "-0.01em", color: "#EFEFEF" }}>{u}</span>
            <span style={{ display: "flex", fontSize: 40, color: DIM }}>–</span>
            <span style={{ display: "flex", fontSize: 76, fontWeight: 800, letterSpacing: "-0.01em", color: "#EFEFEF" }}>{a}</span>
            <span style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: "0.16em", color: FLOOD }}>AI</span>
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 22, color: MUTED, letterSpacing: "0.06em" }}>
            <span style={{ display: "flex" }}>OVR {d.uo}·{d.ao}</span>
            <span style={{ display: "flex", color: DIM }}>·</span>
            <span style={{ display: "flex" }}>CHEM {d.uc}·{d.ac}</span>
            <span style={{ display: "flex", color: DIM }}>·</span>
            <span style={{ display: "flex" }}>{d.f} vs {d.p}</span>
          </div>
        </div>

        {/* marquee signings */}
        {d.m.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
            {d.m.map((name, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: CHALK, padding: "7px 16px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 999, background: "rgba(255,255,255,0.03)" }}>
                {name}
              </span>
            ))}
          </div>
        )}

        {/* CTA, pinned to bottom */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.10)", paddingTop: 18 }}>
          <span style={{ display: "flex", fontSize: 22, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: CHALK }}>
            ▶ Play your own night
          </span>
          <span style={{ display: "flex", fontSize: 18, color: DIM, letterSpacing: "0.06em" }}>squadwars · 1v1 football auction</span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
