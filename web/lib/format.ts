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
