/**
 * Outlook groups, defined once so Today's counts, the Outlook tabs and the portfolio "Add" rule agree.
 * Strength (rs_pct) is the 6-month return ranked 0..100 across the universe (engine/signals/run.py).
 */
import type { Setup, StockState } from "./db";

export const LEADER_RS = 80;
export const WEAK_RS = 20;

/** Leaders: strength 80+, in an uptrend, still above the trailing stop. */
export const isLeader = (s: StockState) =>
  (s.rs_pct ?? 0) >= LEADER_RS && s.trend === "up" && s.trail_stop != null && s.close > s.trail_stop;

/** Pullback: a leader within one ATR of its 50-day average. */
export const isPullback = (s: StockState) =>
  isLeader(s) && s.dma50 != null && s.atr != null && s.atr > 0 && Math.abs(s.close - s.dma50) <= s.atr;

/** Weak: strength 20 or less, any trend. */
export const isWeak = (s: StockState) => s.rs_pct != null && s.rs_pct <= WEAK_RS;

export const atrFrom50 = (s: StockState) =>
  s.dma50 != null && s.atr ? (s.close - s.dma50) / s.atr : null;

export function outlookGroups(states: StockState[], setups: Setup[]) {
  const latest = states.reduce((a, s) => (s.date > a ? s.date : a), "");
  const current = states.filter((s) => s.date === latest); // skip stale stocks with no bar today
  const byRs = (a: StockState, b: StockState) => (b.rs_pct ?? 0) - (a.rs_pct ?? 0);
  const leaders = current.filter(isLeader).sort(byRs);
  const pullbacks = leaders.filter(isPullback);
  const bySym = new Map(current.map((s) => [s.symbol, s]));
  const uptrendSetups = setups
    .filter((x) => x.trend === "up")
    .map((x) => ({ setup: x, state: bySym.get(x.symbol) }))
    .filter((x): x is { setup: Setup; state: StockState } => !!x.state);
  const weak = current.filter(isWeak).sort((a, b) => (a.rs_pct ?? 0) - (b.rs_pct ?? 0));
  const breakdowns = current.filter((s) => s.breakdown).sort((a, b) => (b.volx ?? 0) - (a.volx ?? 0));
  return { date: latest, universe: current.length, leaders, pullbacks, uptrendSetups, weak, breakdowns };
}
