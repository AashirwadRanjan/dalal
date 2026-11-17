/**
 * Rule-based suggestions for a holding. Plain rules, shown to the user verbatim.
 * They are NOT validated by the backtest; treat them as a checklist, not a forecast.
 *
 * First matching rule sets the action:
 *   1. Exit    close is below the trailing stop (22-day high − 3 × ATR)
 *   2. Review  stock is in a downtrend (below 50- and 200-day averages, both falling)
 *   3. Add     uptrend AND a bullish pattern setup fired on the latest close
 *   4. Hold    otherwise; the trailing stop is the level to watch
 * Position-size and profit notes are added on top, without changing the action.
 */
import type { Setup, StockState } from "./db";
import { PATTERN_LABEL, inr } from "./format";

export type Action = "Add" | "Hold" | "Review" | "Exit";
export type Advice = { action: Action; reason: string; notes: string[] };

export const BIG_POSITION_PCT = 20;
export const BIG_SECTOR_PCT = 35;

export function advise(
  st: StockState | undefined,
  h: { qty: number; avg_price: number },
  weightPct: number,
  setupsToday: Setup[]
): Advice {
  const notes: string[] = [];
  if (!st) return { action: "Hold", reason: "No price data for this symbol (not in the Nifty 500 list).", notes };

  const pnlPct = ((st.close - h.avg_price) / h.avg_price) * 100;
  if (weightPct > BIG_POSITION_PCT)
    notes.push(`Large position: ${weightPct.toFixed(0)}% of the portfolio (above ${BIG_POSITION_PCT}%).`);
  if (pnlPct >= 50 && st.trail_stop != null)
    notes.push(`Up ${pnlPct.toFixed(0)}%. Booking part of it locks in gains; the trailing stop protects the rest.`);
  if (pnlPct <= -20)
    notes.push(`Down ${Math.abs(pnlPct).toFixed(0)}% from your cost. Decide on price action, not on getting back to cost.`);

  const stop = st.trail_stop != null ? `₹${inr(st.trail_stop)}` : null;

  if (st.trail_stop != null && st.close < st.trail_stop)
    return { action: "Exit", reason: `Closed at ₹${inr(st.close)}, below its trailing stop ${stop} (22-day high − 3 × average daily range).`, notes };

  if (st.trend === "down")
    return { action: "Review", reason: "Downtrend: below its 50- and 200-day averages, and both are falling.", notes };

  const bullish = setupsToday.filter((s) => s.symbol === st.symbol);
  if (st.trend === "up" && bullish.length) {
    const s = bullish[0];
    return {
      action: "Add",
      reason: `Uptrend, and a ${PATTERN_LABEL[s.pattern].toLowerCase()} setup fired on the latest close (stop ₹${inr(s.stop)}).`,
      notes,
    };
  }

  const why =
    st.trend === "up" ? "Uptrend intact" : st.trend === "sideways" ? "No clear trend" : "Not enough history for a trend";
  return { action: "Hold", reason: stop ? `${why}. Watch the trailing stop at ${stop}.` : `${why}.`, notes };
}
