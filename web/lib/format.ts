export const inr = (n: number | null | undefined, d = 2) =>
  n == null ? "–" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (n: number | null | undefined) =>
  n == null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export const crore = (n: number | null | undefined) =>
  n == null ? "–" : `${n > 0 ? "+" : ""}${Math.round(n).toLocaleString("en-IN")} Cr`;

export const tone = (n: number | null | undefined) =>
  n == null || n === 0 ? "" : n > 0 ? "up" : "down";

export const change = (close: number | null, prev: number | null) =>
  close != null && prev != null && prev !== 0 ? ((close - prev) / prev) * 100 : null;

export const PATTERN_LABEL: Record<string, string> = {
  breakout: "Breakout",
  volume_spike: "Volume spike",
  support_bounce: "Support bounce",
};
/** One-letter chart marker codes; full names in the key under the chart */
export const PATTERN_CODE: Record<string, string> = { breakout: "B", volume_spike: "V", support_bounce: "S" };
export const PATTERN_ORDER = ["breakout", "volume_spike", "support_bounce"];

export const OUTCOME_LABEL: Record<string, string> = {
  target: "Target hit",
  stop: "Stopped out",
  time: "Time exit",
  open: "Open",
};

/** Signed multiple of risk, e.g. +1.85R */
export const rMult = (n: number | null | undefined, d = 2) =>
  n == null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(d)}R`;

export const TREND_LABEL: Record<string, string> = {
  up: "Uptrend",
  sideways: "Sideways",
  down: "Downtrend",
  unknown: "Not enough history",
};

/** Fraction (0.123) to signed percent text (+12.30%) */
export const frac = (n: number | null | undefined) => (n == null ? "–" : pct(n * 100));
