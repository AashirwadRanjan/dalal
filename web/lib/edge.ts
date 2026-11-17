/**
 * One place that decides how to describe the backtest, so the reality check, the Setups band and the
 * Backtest headline can never disagree with the data. A pattern "has an edge" only if it averaged at least
 * EDGE_R per trade over at least MIN_TRADES closed trades; a break-even +0.005R is not an edge.
 */
import type { PatternStats } from "./db";
import { PATTERN_LABEL, PATTERN_ORDER, PATTERN_PLURAL } from "./format";
import { listJoin } from "./steps";

export const EDGE_R = 0.05;
export const MIN_TRADES = 100;

export const ordered = (stats: PatternStats[]) =>
  PATTERN_ORDER.map((p) => stats.find((s) => s.pattern === p)).filter((s): s is PatternStats => !!s && s.trades > 0);

export const hasEdge = (s: PatternStats) => s.trades >= MIN_TRADES && (s.avg_r ?? 0) >= EDGE_R;

export function edgeSummary(stats: PatternStats[]) {
  const st = ordered(stats);
  const winners = st.filter(hasEdge);
  const losers = st.filter((s) => (s.avg_r ?? 0) < 0);
  const flat = st.filter((s) => !hasEdge(s) && (s.avg_r ?? 0) >= 0);
  const names = (xs: PatternStats[]) => xs.map((s) => PATTERN_PLURAL[s.pattern]);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  let headline: string;
  let lead: string;
  if (!st.length) {
    headline = "No backtest yet.";
    lead = "The backtest runs with the daily engine. Until it has results, treat setups as a watchlist.";
  } else if (!winners.length) {
    headline = "No setup has shown an edge yet.";
    lead = "So far, past setups have not made money after costs. Treat them as a watchlist, not as buy signals.";
  } else if (winners.length === st.length) {
    headline = "Every setup made money in this test.";
    lead = "Past setups made money after costs, but only in sample. Treat them as a watchlist until an out-of-sample test agrees.";
  } else {
    headline = `Only ${listJoin(names(winners))} showed an edge.`;
    lead = `Only ${listJoin(names(winners))} made money after costs in the past. Treat the rest as a watchlist, not as buy signals.`;
  }

  const detail = [
    losers.length ? `${cap(listJoin(names(losers)))} lost money after costs.` : "",
    flat.length ? `${cap(listJoin(names(flat)))} roughly broke even.` : "",
    winners.length ? `${cap(listJoin(names(winners)))} made money.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const wins = `Past wins: ${st.map((s) => `${PATTERN_PLURAL[s.pattern]} ${s.win_rate}%`).join(", ")}.`;
  const below = losers.length
    ? ` Average result is below zero for ${losers.length === st.length ? "all of them" : listJoin(names(losers))}.`
    : "";

  return { stats: st, headline, lead, detail, band: wins + below, anyEdge: winners.length > 0, label: (p: string) => PATTERN_LABEL[p] };
}
