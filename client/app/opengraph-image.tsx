import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "SquadWars — real-time 1v1 football auction.";

const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 32 32" fill="none">
  <defs>
    <radialGradient id="g" cx="0.5" cy="0.30" r="0.62">
      <stop offset="0" stop-color="#FFB627" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#FFB627" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="32" height="32" rx="7" fill="#0B1018"/>
  <rect width="32" height="32" rx="7" fill="url(#g)"/>
  <path d="M16 5 A11 11 0 0 0 16 27 Z" fill="#F2EDE0"/>
  <path d="M16 5 A11 11 0 0 1 16 27 Z" fill="#FFB627"/>
  <circle cx="16" cy="16" r="11" stroke="#0B1018" stroke-opacity="0.22" stroke-width="0.6" fill="none"/>
  <path d="M7.5 10.5 L11.5 21.5 L16 14.5 L20.5 21.5 L24.5 10.5"
        stroke="#0B1018" stroke-width="2.6" stroke-linecap="round"
        stroke-linejoin="round" fill="none"/>
</svg>`.trim();

const MARK_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString("base64")}`;

async function loadSaira(weight: 700 | 800): Promise<ArrayBuffer | null> {
  try {
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Saira+Condensed:wght@${weight}&display=swap`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (!cssRes.ok) return null;
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\((https?:[^)]+\.ttf)\)/);
    if (!match) return null;
    const fontRes = await fetch(match[1]);
    if (!fontRes.ok) return null;
    return await fontRes.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OG() {
  const [bold, semi] = await Promise.all([loadSaira(800), loadSaira(700)]);

  const fonts: NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"] = [];
  if (bold) fonts.push({ name: "Saira Condensed", data: bold, weight: 800, style: "normal" });
  if (semi) fonts.push({ name: "Saira Condensed", data: semi, weight: 700, style: "normal" });

  const display = fonts.length ? "'Saira Condensed'" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0B1018",
          color: "#EFEFEF",
          position: "relative",
          padding: "48px 80px 52px",
          fontFamily: display,
        }}
      >
        {/* Stadium glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 60% 50% at 22% 38%, rgba(255,182,39,0.14), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 55% 45% at 88% 18%, rgba(111,177,255,0.07), transparent 70%)",
          }}
        />

        {/* TOP ROW — catalog stamp left, live badge right */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: "#9099A8",
            fontSize: 18,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <div style={{ display: "flex" }}>
            SquadWars · Catalogue 01 · Pre-game
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: 999,
                background: "#E63946",
                boxShadow: "0 0 14px rgba(230,57,70,0.7)",
              }}
            />
            <span style={{ color: "#F2EDE0" }}>Live beta · Free to play</span>
          </div>
        </div>

        {/* HERO LOCKUP — medallion + two-line wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 56,
            marginTop: 36,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MARK_DATA_URI} alt="" width={260} height={260} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              lineHeight: 0.86,
              letterSpacing: "-0.01em",
              fontWeight: 800,
              textTransform: "uppercase",
            }}
          >
            <div style={{ display: "flex", fontSize: 178, color: "#F2EDE0" }}>
              SQUAD
            </div>
            <div style={{ display: "flex", fontSize: 178, color: "#FFB627" }}>
              WARS
            </div>
          </div>
        </div>

        {/* TAGLINE — what you actually do */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 28,
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "0.10em",
              color: "#F2EDE0",
              textTransform: "uppercase",
            }}
          >
            Real-time 1v1 football auction
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#9099A8",
              letterSpacing: "0.04em",
              fontWeight: 500,
            }}
          >
            Chalk an XI. Lodge bids against an AI manager. Take the floor.
          </div>
        </div>

        {/* SPEC STRIP — broadcast lower-third, mirrors landing page */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            position: "absolute",
            left: 80,
            right: 80,
            bottom: 52,
            paddingTop: 18,
            borderTop: "1px solid rgba(255,255,255,0.10)",
            color: "#5C6573",
            fontSize: 17,
            letterSpacing: "0.20em",
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          <span style={{ display: "flex" }}>Treasury</span>
          <span style={{ display: "flex", color: "#9099A8" }}>· Queue ·</span>
          <span style={{ display: "flex", color: "#F2EDE0" }}>· On the block ·</span>
          <span style={{ display: "flex", color: "#9099A8" }}>· Starting XI ·</span>
          <span style={{ display: "flex" }}>Shapes</span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
