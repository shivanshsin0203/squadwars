/**
 * Money formatter — always euros, always abbreviated (M / K / B).
 * Server values are raw integers (e.g. 4_000_000). Client only displays via these helpers.
 *
 *   4_000_000        → "€4M"
 *   4_500_000        → "€4.5M"
 *   500_000          → "€500K"
 *   1_000_000_000    → "€1B"
 *   0                → "€0"
 */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "€0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  let scaled: number;
  let suffix: string;
  if (abs >= 1_000_000_000) {
    scaled = abs / 1_000_000_000;
    suffix = "B";
  } else if (abs >= 1_000_000) {
    scaled = abs / 1_000_000;
    suffix = "M";
  } else if (abs >= 1_000) {
    scaled = abs / 1_000;
    suffix = "K";
  } else {
    return `${sign}€${abs}`;
  }
  const rounded = scaled >= 10 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, "");
  return `${sign}€${rounded}${suffix}`;
}

/** Compact mm:ss for countdown rendering. */
export function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}
