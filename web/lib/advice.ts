/**
 * "Rule says" for a holding. Plain rules, shown to the user next to the result. Not backtested.
 * First match wins:
 *   Exit    closed below its trailing stop (22-day high − 3 × ATR)
 *   Review  over 20% of the portfolio, or down 20% or more from your cost
 *   Add     a leader (strength 80+, uptrend, above trailing stop) with an uptrend setup open today
 *   Hold    no rule fired
 */
import type { Setup, StockState } from "./db";
import { inr } from "./format";
import { isLeader } from "./outlook";
import type { Action } from "@/components/ui";

export const MAX_WEIGHT = 20;
export const MAX_LOSS = -20;

export type Advice = { action: Action; reason: string };

export function advise(st: StockState | undefined, avgCost: number, weightPct: number, setupsToday: Setup[]): Advice {
  if (!st) return { action: "Hold", reason: "No price data for this stock, so no rule can run." };
  const pnlPct = ((st.close - avgCost) / avgCost) * 100;

  if (st.trail_stop != null && st.close < st.trail_stop)
    return { action: "Exit", reason: `Closed below its trailing stop of ₹${inr(st.trail_stop)}.` };
  if (weightPct > MAX_WEIGHT)
    return { action: "Review", reason: `Takes up ${weightPct.toFixed(1)}% of the portfolio, above the ${MAX_WEIGHT}% limit.` };
  if (pnlPct <= MAX_LOSS)
    return { action: "Review", reason: `Down ${Math.abs(pnlPct).toFixed(1)}% from your cost, past the −${Math.abs(MAX_LOSS)}% limit.` };
  if (isLeader(st) && setupsToday.some((s) => s.symbol === st.symbol && s.trend === "up"))
    return { action: "Add", reason: "A leader with an open uptrend setup." };
  return { action: "Hold", reason: "No rule has fired." };
}
