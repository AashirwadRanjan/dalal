/**
 * Stock dashboard rules. Everything here is a deterministic template over stock_state, signals and trades:
 * no number is invented and no sentence predicts a price. Long-term rules are not backtested (the UI says so).
 */
import type { Setup, StockState, TradeRow } from "./db";
import { PATTERN_LABEL, dayShort, inr, pct } from "./format";
import type { Read } from "@/components/ui";

const pctOf = (a: number, b: number) => ((a - b) / b) * 100;
const above = (a: number, b: number) => `${Math.abs(pctOf(a, b)).toFixed(1)}% ${a >= b ? "above" : "below"}`;

// ---------- short term ----------

export type Levels = { entry: number; stop: number; target: number };
export type ShortTerm = {
  status: "today" | "open" | "none"; side?: "long" | "short"; title: string; text: string; levels?: Levels; pattern?: string;
};

const Side = (s: "long" | "short") => (s === "long" ? "Long" : "Short");
const shortNote = (st: StockState, side: "long" | "short") =>
  side === "short"
    ? st.fno
      ? " A short held overnight needs this stock's futures or puts."
      : " This stock has no futures or options, so it can only be shorted intraday."
    : "";

export function shortTerm(st: StockState, today: Setup[], trades: TradeRow[]): ShortTerm {
  const fired = today[0];
  if (fired) {
    return {
      status: "today",
      side: fired.side,
      title: `${Side(fired.side)} setup today`,
      text: `A ${PATTERN_LABEL[fired.pattern].toLowerCase()} setup fired on the ${dayShort(fired.date)} close. A trade would enter at the next open, not at this price.${shortNote(st, fired.side)}`,
      levels: { entry: fired.entry, stop: fired.stop, target: fired.target },
      pattern: fired.pattern,
    };
  }
  const open = trades.find((t) => t.outcome === "open");
  if (open) {
    return {
      status: "open",
      side: open.side,
      title: `${Side(open.side)} setup is open`,
      text: `A ${PATTERN_LABEL[open.pattern].toLowerCase()} trade was triggered on ${dayShort(open.entry_date)}. The price is ${above(st.close, open.entry)} the entry.${shortNote(st, open.side)}`,
      levels: { entry: open.entry, stop: open.stop, target: open.target },
      pattern: open.pattern,
    };
  }
  const last = trades[0];
  return {
    status: "none",
    title: "No setup",
    text: last
      ? `No rule has fired recently. The last setup was a ${PATTERN_LABEL[last.pattern].toLowerCase()} on ${dayShort(last.signal_date)}, which ended ${last.outcome === "target" ? "at its target" : last.outcome === "stop" ? "at its stop" : "at the time limit"}.`
      : "No setup has fired on this stock in the stored history.",
  };
}

// ---------- long term ----------

export type Check = { ok: boolean | null; text: string; value: string };
export type LongTerm = { verdict: "Accumulate" | "Wait" | "Avoid" | "Unclear"; title: string; text: string; checks: Check[] };

export const NEAR_HIGH_PCT = 10;
export const STRONG_MONTH_PCT = 5;

export function longTerm(st: StockState): LongTerm {
  const { close, dma50, dma200, hi52, ret_1m } = st;
  const fromHigh = hi52 ? pctOf(close, hi52) : null;
  const m = ret_1m != null ? ret_1m * 100 : null;
  const checks: Check[] = [
    { ok: dma200 == null ? null : close > dma200, text: "Price is above the 200-day average", value: dma200 == null ? "Not enough history" : `${inr(close)} vs ${inr(dma200)}` },
    { ok: dma50 == null || dma200 == null ? null : dma50 > dma200, text: "50-day average is above the 200-day average", value: dma50 == null || dma200 == null ? "Not enough history" : `${inr(dma50)} vs ${inr(dma200)}` },
    { ok: fromHigh == null ? null : fromHigh >= -NEAR_HIGH_PCT, text: `Price is within ${NEAR_HIGH_PCT}% of its 52-week high`, value: fromHigh == null ? "Not enough history" : `${Math.abs(fromHigh).toFixed(1)}% below` },
    { ok: m == null ? null : m >= STRONG_MONTH_PCT, text: `Up ${STRONG_MONTH_PCT}% or more in the past month`, value: pct(m) },
    { ok: null, text: "Profit, debt and growth look healthy", value: "Not available yet" },
  ];

  if (dma200 == null || dma50 == null) {
    return { verdict: "Unclear", title: "Not enough history", text: "The stock has fewer than 200 trading days of prices, so the long-term rules cannot run yet. Fundamentals are not part of this view yet.", checks };
  }
  const passes = checks.slice(0, 4).filter((c) => c.ok).length;
  const where =
    close > dma50 && close > dma200 ? "The price is above both averages"
    : close > dma200 ? "The price is above its 200-day average but below its 50-day"
    : close > dma50 ? "The price is above its 50-day average but below its 200-day"
    : "The price is below both averages";
  const longer = dma50 > dma200 ? "and the longer trend is up" : "but the longer trend has not turned up";
  const text = `${where}, ${longer}. This view is technical only: fundamentals are not part of it yet.`;
  if (passes === 4) return { verdict: "Accumulate", title: "Accumulate: the trend is healthy", text, checks };
  if (passes <= 1) return { verdict: "Avoid", title: "Avoid: the trend is weak", text, checks };
  return { verdict: "Wait", title: "Wait: signals are mixed", text, checks };
}

// ---------- technicals ----------

export type Indicator = { name: string; value: string; says: string; read: Read };

export function indicators(st: StockState): Indicator[] {
  const c = st.close;
  const rows: Indicator[] = [];
  if (st.dma50 != null)
    rows.push({ name: "50-day average", value: `₹${inr(st.dma50)}`, read: c > st.dma50 ? "supports" : "warns",
      says: `The price is ${above(c, st.dma50)} it, so short-term momentum is ${c > st.dma50 ? "positive" : "negative"}.` });
  if (st.dma200 != null)
    rows.push({ name: "200-day average", value: `₹${inr(st.dma200)}`, read: c > st.dma200 ? "supports" : "warns",
      says: `The price is ${above(c, st.dma200)} it, so the long-term line is ${c > st.dma200 ? "held" : "lost"}.` });
  if (st.dma50 != null && st.dma200 != null)
    rows.push({ name: "Averages together", value: st.dma50 > st.dma200 ? "50-day above 200-day" : "50-day below 200-day",
      read: st.dma50 > st.dma200 ? "supports" : "warns", says: st.dma50 > st.dma200 ? "The longer trend is up." : "The longer trend has not turned up yet." });
  rows.push({ name: "Trend", value: { up: "Up", down: "Down", sideways: "Sideways", unknown: "Unclear" }[st.trend],
    read: st.trend === "up" ? "supports" : st.trend === "down" ? "warns" : "neutral",
    says: st.trend === "up" ? "Above rising averages." : st.trend === "down" ? "Below falling averages." : st.trend === "sideways" ? "Not clearly rising or falling." : "Fewer than 200 days of prices." });
  if (st.ret_1m != null) {
    const m = st.ret_1m * 100;
    rows.push({ name: "1-month return", value: pct(m), read: m >= 5 ? "supports" : m <= -5 ? "warns" : "neutral",
      says: m >= 5 ? "A strong recent move." : m <= -5 ? "A weak recent month." : "A quiet month." });
  }
  if (st.volx != null)
    rows.push({ name: "Volume", value: `${st.volx.toFixed(2)}× usual`, read: st.volx >= 1.5 ? "supports" : st.volx < 0.8 ? "warns" : "neutral",
      says: st.volx >= 1.5 ? "Heavy trading backs the move." : st.volx < 0.8 ? "Quiet trading, so the move has less backing." : "Normal trading." });
  if (st.rsi14 != null) {
    const r = st.rsi14;
    rows.push({ name: "RSI, 14 days", value: r.toFixed(1), read: r > 70 || r < 30 ? "warns" : r >= 50 ? "supports" : "neutral",
      says: r > 70 ? "Above 70: stretched after a fast rise; pullbacks are common from here."
        : r < 30 ? "Below 30: heavy selling. It can stay low for a while."
        : r >= 50 ? "Between 50 and 70: buyers in control without being stretched." : "Between 30 and 50: momentum is soft." });
  }
  if (st.macd_hist != null && st.macd != null)
    rows.push({ name: "MACD", value: `${st.macd_hist >= 0 ? "Above" : "Below"} signal line`, read: st.macd_hist >= 0 ? "supports" : "warns",
      says: st.macd_hist >= 0 ? "The fast average is pulling ahead of the slow one: momentum is improving." : "The fast average is losing ground to the slow one: momentum is fading." });
  if (st.bb_up != null && st.bb_low != null)
    rows.push({ name: "Bollinger bands", value: `₹${inr(st.bb_low)} to ₹${inr(st.bb_up)}`,
      read: c > st.bb_up || c < st.bb_low ? "warns" : "neutral",
      says: c > st.bb_up ? "Closed above the upper band: an unusually big move for this stock." : c < st.bb_low ? "Closed below the lower band: an unusually big drop for this stock." : "Inside the bands, the normal 20-day range." });
  if (st.atr != null)
    rows.push({ name: "Daily swing (ATR)", value: `₹${inr(st.atr)}`, read: "neutral",
      says: `About ${((st.atr / c) * 100).toFixed(1)}% of the price. Stops need room for normal swings.` });
  if (st.trail_stop != null)
    rows.push({ name: "Trailing stop", value: `₹${inr(st.trail_stop)}`, read: c < st.trail_stop ? "warns" : "neutral",
      says: c < st.trail_stop
        ? "The price closed below it: for a held long trade, that is the exit rule."
        : `${Math.abs(pctOf(st.trail_stop, c)).toFixed(1)}% below the price. For a held long trade, a close below it is the exit rule.` });
  if (st.support != null || st.resistance != null)
    rows.push({ name: "Support and resistance", value: `${st.support != null ? `₹${inr(st.support)}` : "–"} / ${st.resistance != null ? `₹${inr(st.resistance)}` : "–"}`, read: "neutral",
      says: `Nearest swing low (${st.support != null ? `${Math.abs(pctOf(st.support, c)).toFixed(1)}% below` : "none found"}) and swing high (${st.resistance != null ? `${pctOf(st.resistance, c).toFixed(1)}% above` : "none found"}) in the last 120 days.` });
  if (st.hi52 != null && st.lo52 != null)
    rows.push({ name: "52-week range", value: `₹${inr(st.lo52)} to ₹${inr(st.hi52)}`, read: "neutral",
      says: `The price is ${Math.abs(pctOf(c, st.hi52)).toFixed(1)}% below the high and ${pctOf(c, st.lo52).toFixed(1)}% above the low.` });
  return rows;
}

export function plainWords(st: StockState, levels?: Levels, status?: ShortTerm["status"]): string {
  const s: string[] = [];
  const c = st.close;
  if (st.ret_1m != null) {
    const m = st.ret_1m * 100;
    const where =
      st.dma50 != null && st.dma200 != null
        ? c > st.dma50 && c > st.dma200
          ? ` and now sits above both its 50-day (₹${inr(st.dma50)}) and 200-day (₹${inr(st.dma200)}) averages, which is a good sign`
          : c < st.dma50 && c < st.dma200
            ? ` and sits below both its 50-day (₹${inr(st.dma50)}) and 200-day (₹${inr(st.dma200)}) averages, which is a weak sign`
            : `, sitting between its 50-day (₹${inr(st.dma50)}) and 200-day (₹${inr(st.dma200)}) averages`
        : "";
    s.push(`${st.symbol} has ${m >= 0 ? "risen" : "fallen"} ${Math.abs(m).toFixed(2)}% in a month${where}.`);
  }
  if (st.dma50 != null && st.dma200 != null)
    s.push(st.dma50 < st.dma200 ? "The 50-day average is still below the 200-day, so the longer trend has not turned up." : "The 50-day average is above the 200-day, so the longer trend is up.");
  if (st.volx != null)
    s.push(st.volx < 0.8 ? `Volume is only ${st.volx.toFixed(2)}× the usual, so few buyers are backing the move.`
      : st.volx >= 1.5 ? `Volume is ${st.volx.toFixed(1)}× the usual, so the move has real backing.` : `Volume is about normal (${st.volx.toFixed(2)}× the usual).`);
  if (st.rsi14 != null && (st.rsi14 > 70 || st.rsi14 < 30))
    s.push(st.rsi14 > 70 ? `RSI is ${st.rsi14.toFixed(0)}, above 70, so the stock is stretched after a fast rise.` : `RSI is ${st.rsi14.toFixed(0)}, below 30, so selling has been heavy.`);
  if (levels && status === "open")
    s.push(`The engine’s trade from ₹${inr(levels.entry)} is still open, with its stop at ₹${inr(levels.stop)}${st.trail_stop != null ? ` and a trailing stop at ₹${inr(st.trail_stop)}` : ""}.`);
  if (levels && status === "today") s.push(`A setup fired on the latest close with a stop at ₹${inr(levels.stop)}.`);
  return s.join(" ");
}

export type Rung = { label: string; price: number; now?: boolean };

export function ladder(st: StockState, levels?: Levels): Rung[] {
  const r: Rung[] = [{ label: "Now", price: st.close, now: true }];
  const add = (label: string, p: number | null | undefined) => p != null && r.push({ label, price: p });
  add("52-week high", st.hi52);
  add("Swing resistance", st.resistance);
  add("Trade target", levels?.target);
  add("200-day average", st.dma200);
  add("Trade entry", levels?.entry);
  add("Trailing stop", st.trail_stop);
  add("50-day average", st.dma50);
  add("Swing support", st.support);
  add("Trade stop", levels?.stop);
  add("52-week low", st.lo52);
  return r.sort((a, b) => b.price - a.price);
}
