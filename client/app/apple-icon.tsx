import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same medallion as app/icon.svg, scaled to a 180-unit viewBox so it renders
// crisply at the apple-touch-icon size. Keeping the SVG inline (no <img> data
// URI) means Satori parses each shape directly — no decoder, no font.
const MARK_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 32 32" fill="none">
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

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0B1018",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MARK_DATA_URI} alt="" width={180} height={180} />
      </div>
    ),
    { ...size },
  );
}
