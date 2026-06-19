/**
 * Shareable result card — stateless link encoding.
 *
 * The whole result summary is packed into the URL itself, so the public share
 * page `/r/[token]` and its OG image render with ZERO backend calls. This
 * sidesteps two facts about the current server: every `/api/match/:id/*` route
 * is session-gated (no cross-browser reads), and match state is in-memory and
 * dies on restart (no persistence). A self-contained token never breaks and
 * needs no storage. Trade-off: the token is forgeable — fine for a vanity card.
 *
 * Encoding is a unit-separator-delimited string (NOT JSON) then base64url —
 * JSON key names roughly double the payload, and since X counts a non-TLD
 * localhost link as plain text (no t.co shrink), a short token matters. Fields:
 *   0 w   winner "u"|"a"|"d"   3 f  formation     6 ao  ai OVR     9+ marquee names
 *   1 su  user score           4 p  opponent      7 uc  user CHEM
 *   2 sa  ai score             5 uo user OVR       8 ac  ai CHEM
 * U+001F (the separator) never occurs in player/formation/persona text, so the
 * split is safe without escaping. The roast line is deliberately NOT carried —
 * it nearly doubled the URL; it stays on the in-app result screen.
 */

export type ShareWinner = "u" | "a" | "d";

export type ShareData = {
  w: ShareWinner;
  s: [number, number];
  f: string;
  p: string;
  uo: number;
  ao: number;
  uc: number;
  ac: number;
  m: string[];
};

const SEP = String.fromCharCode(31); // U+001F unit separator

// ─────────────────────────── base64url (UTF-8 safe, isomorphic) ───────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(bin)
      : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(token: string): Uint8Array {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const bin =
    typeof atob !== "undefined"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ─────────────────────────── encode / decode ───────────────────────────

export function encodeShareData(d: ShareData): string {
  const parts = [
    d.w,
    String(d.s[0]),
    String(d.s[1]),
    d.f,
    d.p,
    String(d.uo),
    String(d.ao),
    String(d.uc),
    String(d.ac),
    ...d.m.slice(0, 3),
  ];
  return bytesToBase64Url(new TextEncoder().encode(parts.join(SEP)));
}

export function decodeShareData(token: string): ShareData | null {
  try {
    const raw = new TextDecoder().decode(base64UrlToBytes(token));
    const p = raw.split(SEP);
    if (p.length < 9) return null;
    const w = p[0];
    if (w !== "u" && w !== "a" && w !== "d") return null;
    const num = (x: string) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : 0;
    };
    return {
      w,
      s: [num(p[1]), num(p[2])],
      f: p[3] ?? "",
      p: p[4] || "the AI",
      uo: num(p[5]),
      ao: num(p[6]),
      uc: num(p[7]),
      ac: num(p[8]),
      m: p.slice(9).filter(Boolean).slice(0, 3),
    };
  } catch {
    return null;
  }
}

// ─────────────────────────── presentation helpers ───────────────────────────

export function winnerWord(w: ShareWinner): string {
  return w === "u" ? "WON" : w === "a" ? "LOST" : "DREW";
}

/** Pre-filled tweet body. The URL is appended by X via the intent `url` param. */
export function buildShareText(d: ShareData): string {
  const [u, a] = d.s;
  if (d.w === "u") {
    return `Won my SquadWars night ${u}–${a} in a ${d.f}, saw off ${d.p}. Beat the machine? ⚽`;
  }
  if (d.w === "a") {
    return `${d.p} beat me ${a}–${u} on SquadWars (${d.f}). Reckon you'd do better? ⚽`;
  }
  return `Dead heat with ${d.p} on SquadWars — ${u}–${a} (${d.f}). Someone settle it ⚽`;
}

export function buildTweetIntent(shareUrl: string, text: string): string {
  const u = new URL("https://twitter.com/intent/tweet");
  u.searchParams.set("text", text);
  u.searchParams.set("url", shareUrl);
  return u.toString();
}
