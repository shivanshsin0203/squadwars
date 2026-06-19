/**
 * Shared helpers for dynamic OpenGraph images (next/og · Satori).
 *
 * - `loadSairaCondensed` resolves the real .ttf via the Google Fonts CSS
 *   endpoint (so we never hardcode a rotating hash) and fails soft to Satori's
 *   default face when the network is unavailable, keeping builds green.
 * - `MEDALLION_DATA_URI` is the SquadWars mark (same as app/icon.svg), inlined
 *   so Satori draws it directly.
 */

export async function loadSairaCondensed(
  weight: 700 | 800,
): Promise<ArrayBuffer | null> {
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

const MEDALLION_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 32 32" fill="none">
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

export const MEDALLION_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(MEDALLION_SVG).toString("base64")}`;
