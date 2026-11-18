/** Formatting shared by every page. Numbers use Indian grouping and a real minus sign (U+2212). */

const MINUS = "−";

/** 25387.4 -> "25,387.40" */
export const inr = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n)
    ? "–"
    : `${n < 0 ? MINUS : ""}${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/** Signed number: +4,195.38 / −3,519.05 */
export const signed = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "–" : `${n > 0 ? "+" : n < 0 ? MINUS : ""}${inr(Math.abs(n), d)}`;

/** Percent value (already ×100) with sign: +0.38% */
export const pct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "–" : `${signed(n, d)}%`;

/** Fraction (0.123) to signed percent text (+12.3%) */
export const frac = (n: number | null | undefined, d = 1) => (n == null ? "–" : pct(n * 100, d));

/** Rupees with sign: +₹77,646 / −₹1,879 */
export const rupees = (n: number | null | undefined, d = 0) =>
  n == null ? "–" : `${n > 0 ? "+" : n < 0 ? MINUS : ""}₹${inr(Math.abs(n), d)}`;

/** Net flow in crore: +₹4,195 Cr */
export const crore = (n: number | null | undefined) => (n == null ? "–" : `${rupees(n)} Cr`);

/** Signed multiple of risk, e.g. +1.85R */
export const rMult = (n: number | null | undefined, d = 2) => (n == null ? "–" : `${signed(n, d)}R`);

export type Tone = "up" | "down" | "flat";
export const toneOf = (n: number | null | undefined): Tone => (n == null || n === 0 ? "flat" : n > 0 ? "up" : "down");
/** Legacy class helper: "up" | "down" | "" */
export const tone = (n: number | null | undefined) => (n == null || n === 0 ? "" : n > 0 ? "up" : "down");

export const change = (close: number | null, prev: number | null) =>
  close != null && prev != null && prev !== 0 ? ((close - prev) / prev) * 100 : null;

// ---- dates (ISO "YYYY-MM-DD" strings; formatted in UTC so the day never shifts) ----

const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(asDate(iso)).replace(",", "");

/** "Tue 17 Nov" */
export const dayShort = (iso: string | null | undefined) =>
  iso ? fmt(iso, { weekday: "short", day: "numeric", month: "short" }) : "–";
/** "Tuesday 17 November" */
export const dayLong = (iso: string | null | undefined) =>
  iso ? fmt(iso, { weekday: "long", day: "numeric", month: "long" }) : "–";
/** "17 Nov" */
export const dayMonth = (iso: string | null | undefined) => (iso ? fmt(iso, { day: "numeric", month: "short" }) : "–");
/** "Nov 2026" */
export const monthYear = (iso: string | null | undefined) => (iso ? fmt(iso, { month: "short", year: "numeric" }) : "–");

/** SQLite UTC "2026-11-17 12:43:21" -> "Tue 17 Nov, 6:13 pm" in India time */
export const runTime = (utc: string | null | undefined) => {
  if (!utc) return "–";
  const d = new Date(`${utc.replace(" ", "T")}Z`);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })
    .format(d)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" })
    .format(d)
    .toLowerCase();
  return `${day}, ${time}`;
};

// ---- labels ----

export const PATTERN_LABEL: Record<string, string> = {
  breakout: "Breakout",
  volume_spike: "Volume spike",
  support_bounce: "Support bounce",
  breakdown: "Breakdown",
  selling_spike: "Selling spike",
  resistance_reject: "Resistance rejection",
};
export const PATTERN_PLURAL: Record<string, string> = {
  breakout: "breakouts",
  volume_spike: "volume spikes",
  support_bounce: "support bounces",
  breakdown: "breakdowns",
  selling_spike: "selling spikes",
  resistance_reject: "resistance rejections",
};
export const LONG_ORDER = ["breakout", "volume_spike", "support_bounce"];
export const SHORT_ORDER = ["breakdown", "selling_spike", "resistance_reject"];
/** Every pattern, longs first. */
export const PATTERN_ORDER = [...LONG_ORDER, ...SHORT_ORDER];
export const SIDE_OF: Record<string, "long" | "short"> = Object.fromEntries([
  ...LONG_ORDER.map((p) => [p, "long"]),
  ...SHORT_ORDER.map((p) => [p, "short"]),
]);
/** One-letter chart marker codes; full names in the key under the chart */
export const PATTERN_CODE: Record<string, string> = {
  breakout: "B", volume_spike: "V", support_bounce: "S", breakdown: "D", selling_spike: "X", resistance_reject: "R",
};
/** Fixed series colour per long pattern (running-total chart): amber, sky, up. Shorts are tables only. */
export const PATTERN_COLOR: Record<string, string> = {
  breakout: "var(--amber)",
  volume_spike: "var(--sky)",
  support_bounce: "var(--up)",
  breakdown: "var(--down)",
  selling_spike: "var(--neutral)",
  resistance_reject: "var(--text-2)",
};

export const CHART_LABEL: Record<string, string> = {
  double_bottom: "Double bottom",
  double_top: "Double top",
  inverse_head_shoulders: "Inverse head and shoulders",
  head_shoulders: "Head and shoulders",
  ascending_triangle: "Ascending triangle",
  descending_triangle: "Descending triangle",
  bullish_engulfing: "Bullish engulfing",
  bearish_engulfing: "Bearish engulfing",
  hammer: "Hammer",
  shooting_star: "Shooting star",
};
export const CHART_ORDER = Object.keys(CHART_LABEL);

/** One line on what a chart pattern has meant: "did 0.5% worse than the average stock over 10 days; held up later". */
export function chartRecord(s: { edge_pct?: number; horizon: number; bias: string; reliable: boolean; test: { n: number; edge_pct?: number } } | undefined) {
  if (!s || s.edge_pct == null) return "No 10-year record yet.";
  const e = s.edge_pct;
  const dir = s.bias === "bullish" ? (e >= 0 ? "better" : "worse") : e >= 0 ? "worse" : "better";
  const later = s.reliable ? "and it held up in the later period." : "but it has not held up reliably, so it means little on its own.";
  return `Over 10 years, stocks did ${Math.abs(e).toFixed(2)}% ${dir} than the average stock in the next ${s.horizon} days, ${later}`;
}

export const OUTCOME_LABEL: Record<string, string> = {
  target: "Target hit",
  stop: "Stopped out",
  trail: "Trailing stop",
  time: "Time limit",
  open: "Still open",
};

export const TREND_LABEL: Record<string, string> = {
  up: "Up",
  sideways: "Sideways",
  down: "Down",
  unknown: "Unclear",
};

/** Plural helper: plural(3, "setup") -> "3 setups" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
