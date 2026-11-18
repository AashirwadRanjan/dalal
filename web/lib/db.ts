import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "..", "data", "market.db");

/** Open the DB read-only for one unit of work. Returns null if the engine hasn't created it yet. */
function withDb<T>(fn: (db: Database.Database) => T): T | null {
  if (!fs.existsSync(/*turbopackIgnore: true*/ DB_PATH)) return null;
  const db = new Database(DB_PATH, { readonly: true });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export type SeriesRow = { symbol: string; name: string; date: string; close: number; prev: number | null };
export type FlowRow = {
  date: string;
  fii_net: number | null;
  dii_net: number | null;
};
export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export function hasDb() {
  return fs.existsSync(/*turbopackIgnore: true*/ DB_PATH);
}

export function getSeries(grp: "india" | "global"): SeriesRow[] {
  return (
    withDb((db) =>
      db
        .prepare(
          `WITH r AS (
             SELECT symbol, name, date, close, sort_order,
                    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
             FROM market_series WHERE grp = ?
           )
           SELECT a.symbol, a.name, a.date, a.close, b.close AS prev
           FROM r a LEFT JOIN r b ON a.symbol = b.symbol AND b.rn = 2
           WHERE a.rn = 1
           ORDER BY a.sort_order`
        )
        .all(grp) as SeriesRow[]
    ) ?? []
  );
}

export function getFlows(days = 20): FlowRow[] {
  const rows =
    withDb(
      (db) =>
        db
          .prepare("SELECT date, fii_net, dii_net FROM fii_dii_daily ORDER BY date DESC LIMIT ?")
          .all(days) as FlowRow[]
    ) ?? [];
  return rows.reverse();
}

export function getStock(symbol: string) {
  return withDb((db) => {
    const inst = db
      .prepare("SELECT symbol, name, sector FROM instruments WHERE symbol = ?")
      .get(symbol) as { symbol: string; name: string; sector: string } | undefined;
    if (!inst) return null;
    const candles = db
      .prepare(
        "SELECT date, open, high, low, close, volume FROM prices_daily WHERE symbol = ? ORDER BY date ASC"
      )
      .all(symbol) as Candle[];
    return { inst, candles };
  });
}


// ---- Phase 2: pattern engine + backtest (written by engine/signals) ----

type StatsCore = {
  trades: number;
  win_rate?: number;
  avg_r?: number;
  avg_ret_pct?: number;
  profit_factor?: number | null;
  avg_bars?: number;
  max_dd_r?: number;
  total_r?: number;
};

export type PatternStats = {
  pattern: string;
  by_trend?: Record<string, StatsCore>;
  by_year?: Record<string, StatsCore>;
  walk_forward?: { train_end: string; train: StatsCore; test: StatsCore; selected: boolean };
  variants?: Record<string, StatsCore & { walk_forward: { train_end: string; train: StatsCore; test: StatsCore; selected: boolean }; by_year: Record<string, StatsCore> }>;
  trades: number;
  win_rate?: number;
  avg_r?: number;
  avg_ret_pct?: number;
  profit_factor?: number | null;
  avg_bars?: number;
  max_dd_r?: number;
  total_r?: number;
};

export type Setup = {
  symbol: string;
  name: string;
  sector: string;
  date: string;
  pattern: string;
  side: "long" | "short";
  /** 1 = stock has futures and options, so a positional short is possible */
  fno?: number;
  /** 1 = in the Nifty 500 */
  in_index?: number;
  trend: string | null;
  volx?: number | null;
  rs_pct?: number | null;
  entry: number;
  stop: number;
  target: number;
  detail: string;
};

export type TradeRow = {
  symbol: string;
  pattern: string;
  side: "long" | "short";
  signal_date: string;
  entry_date: string;
  entry: number;
  stop: number;
  target: number;
  exit_date: string;
  exit: number;
  outcome: "target" | "stop" | "trail" | "time" | "open";
  r: number;
  ret_pct: number;
  bars: number;
};

export type EquityPoint = { pattern: string; date: string; r: number };

const hasTable = (db: Database.Database, name: string) =>
  !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

export function getPatternStats(): PatternStats[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "pattern_stats")) return [];
      const rows = db.prepare("SELECT pattern, stats FROM pattern_stats").all() as { pattern: string; stats: string }[];
      return rows.map((r) => ({ pattern: r.pattern, ...JSON.parse(r.stats) }) as PatternStats);
    }) ?? []
  );
}

/** Signals fired on the latest price date: tomorrow's candidates. */
export function getSetups(): Setup[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "signals")) return [];
      return db
        .prepare(
          `SELECT s.symbol, i.name, i.sector, s.date, s.pattern, s.side, i.fno, i.in_index, s.trend, st.volx, st.rs_pct,
                  s.entry, s.stop, s.target, s.detail
           FROM signals s JOIN instruments i ON i.symbol = s.symbol
           LEFT JOIN stock_state st ON st.symbol = s.symbol AND st.date = s.date
           WHERE s.date = (SELECT MAX(date) FROM prices_daily)
           ORDER BY st.volx DESC, s.symbol`
        )
        .all() as Setup[];
    }) ?? []
  );
}

export function getTrades(opts: { symbol?: string; limit?: number } = {}): TradeRow[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "trades")) return [];
      const where = opts.symbol
        ? "WHERE symbol = ?"
        : "WHERE outcome != 'open' AND symbol IN (SELECT symbol FROM instruments WHERE in_index = 1)";
      const args: (string | number)[] = opts.symbol ? [opts.symbol] : [];
      return db
        .prepare(
          `SELECT symbol, pattern, side, signal_date, entry_date, entry, stop, target, exit_date, exit, outcome, r, ret_pct, bars
           FROM trades ${where} ORDER BY ${opts.symbol ? "signal_date" : "exit_date"} DESC, symbol LIMIT ?`
        )
        .all(...args, opts.limit ?? 100) as TradeRow[];
    }) ?? []
  );
}

/** Closed-trade R summed per pattern per exit day, ascending. The chart accumulates it. */
export function getEquity(): EquityPoint[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "trades")) return [];
      return db
        .prepare(
          `SELECT pattern, exit_date AS date, SUM(r) AS r FROM trades JOIN instruments i USING (symbol)
           WHERE outcome != 'open' AND i.in_index = 1 GROUP BY pattern, exit_date ORDER BY exit_date`
        )
        .all() as EquityPoint[];
    }) ?? []
  );
}

export function getStockSignals(symbol: string): Setup[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "signals")) return [];
      return db
        .prepare(
          `SELECT s.symbol, '' AS name, '' AS sector, s.date, s.pattern, s.side, s.trend, s.entry, s.stop, s.target, s.detail
           FROM signals s WHERE s.symbol = ? ORDER BY s.date`
        )
        .all(symbol) as Setup[];
    }) ?? []
  );
}

// ---- Daily brief, stock state (engine/summary.py, engine/signals/state.py) ----

export type Mover = { symbol: string; name: string; chg: number; volx: number | null };
export type Headline = { tone: "up" | "down" | "flat"; text: string };
export type Brief = {
  date: string;
  headlines: Headline[];
  hero?: { headline: string; text: string };
  lines?: Headline[];
  indices: { name: string; close: number; chg: number }[];
  global: { name: string; close: number; chg: number; date: string }[];
  breadth: {
    advances: number; declines: number; unchanged: number; total: number;
    pct_above_50dma: number; pct_above_200dma: number;
    trend: { up: number; sideways: number; down: number };
  };
  flows: { date: string; fii_net: number | null; dii_net: number | null }[];
  sectors_top: { sector: string; chg: number; n: number }[];
  sectors_bottom: { sector: string; chg: number; n: number }[];
  gainers: Mover[];
  losers: Mover[];
  volume: Mover[];
  setups: Record<string, number>;
  setups_by_side?: { long: number; short: number };
  breakdowns: number;
};

export function getBrief(date?: string): Brief | null {
  return withDb((db) => {
    if (!hasTable(db, "daily_brief")) return null;
    const row = (date
      ? db.prepare("SELECT data FROM daily_brief WHERE date = ?").get(date)
      : db.prepare("SELECT data FROM daily_brief ORDER BY date DESC LIMIT 1").get()) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as Brief) : null;
  });
}

export function getBriefDates(limit = 30): string[] {
  return (
    withDb((db) =>
      hasTable(db, "daily_brief")
        ? (db.prepare("SELECT date FROM daily_brief ORDER BY date DESC LIMIT ?").all(limit) as { date: string }[]).map((r) => r.date)
        : []
    ) ?? []
  );
}

export type StockState = {
  symbol: string;
  name: string;
  sector: string;
  date: string;
  close: number;
  chg_1d: number | null;
  dma50: number | null;
  dma200: number | null;
  trend: "up" | "sideways" | "down" | "unknown";
  ret_1m: number | null;
  ret_3m: number | null;
  ret_6m: number | null;
  rs_pct: number | null;
  atr: number | null;
  trail_stop: number | null;
  hi52: number | null;
  lo52: number | null;
  volx: number | null;
  low20: number | null;
  breakdown: number;
  rsi14: number | null;
  macd: number | null;
  macd_signal: number | null;
  macd_hist: number | null;
  bb_up: number | null;
  bb_mid: number | null;
  bb_low: number | null;
  support: number | null;
  resistance: number | null;
  in_index?: number;
  fno?: number;
};

export function getStates(): StockState[] {
  return (
    withDb((db) =>
      hasTable(db, "stock_state")
        ? (db
            .prepare("SELECT s.*, i.name, i.sector, i.in_index, i.fno FROM stock_state s JOIN instruments i USING (symbol)")
            .all() as StockState[])
        : []
    ) ?? []
  );
}

export type Instrument = { symbol: string; name: string; priced: number; in_index: number };

/** Every NSE equity. `priced` = has price history; the rest get it once you hold or watch them and fetch. */
export function getInstruments(): Instrument[] {
  return (
    withDb((db) => {
      const cols = (db.prepare("PRAGMA table_info(instruments)").all() as { name: string }[]).map((c) => c.name);
      const idx = cols.includes("in_index") ? "i.in_index" : "1";
      return db
        .prepare(
          `SELECT symbol, name, ${idx} AS in_index,
                  EXISTS (SELECT 1 FROM prices_daily p WHERE p.symbol = i.symbol) AS priced
           FROM instruments i ORDER BY symbol`
        )
        .all() as Instrument[];
    }) ?? []
  );
}

// ---- Run status (header status line, footer, /health) ----

export type StepRun = { step: string; status: "ok" | "failed"; ran_at: string; detail: string | null };
export type RunStatus = { latestPriceDate: string | null; steps: StepRun[]; lastRun: string | null };

/** Latest log row per step, in pipeline order. */
export function getRunStatus(): RunStatus {
  return (
    withDb((db) => {
      const latest = db.prepare("SELECT MAX(date) AS d FROM prices_daily").get() as { d: string | null };
      const steps = db
        .prepare(
          `SELECT step, status, ran_at, detail FROM ingest_log l
           WHERE id = (SELECT MAX(id) FROM ingest_log WHERE step = l.step) ORDER BY id`
        )
        .all() as StepRun[];
      const lastRun = steps.reduce<string | null>((a, s) => (a && a > s.ran_at ? a : s.ran_at), null);
      return { latestPriceDate: latest.d, steps, lastRun };
    }) ?? { latestPriceDate: null, steps: [], lastRun: null }
  );
}

export type HealthFacts = {
  instruments: number;
  withPrices: number;
  onLatest: number;
  latestPriceDate: string | null;
  flowDays: number;
  signals: number;
  firstSignal: string | null;
  briefDate: string | null;
};

/** Counts behind each step's "What it found" line on /health. */
export function getHealthFacts(): HealthFacts | null {
  return withDb((db) => {
    const one = <T,>(sql: string) => db.prepare(sql).get() as T;
    const latest = one<{ d: string | null }>("SELECT MAX(date) d FROM prices_daily").d;
    return {
      instruments: one<{ n: number }>("SELECT COUNT(*) n FROM instruments").n,
      withPrices: one<{ n: number }>("SELECT COUNT(DISTINCT symbol) n FROM prices_daily").n,
      onLatest: (db.prepare("SELECT COUNT(*) n FROM prices_daily WHERE date = ?").get(latest) as { n: number }).n,
      latestPriceDate: latest,
      flowDays: one<{ n: number }>("SELECT COUNT(*) n FROM fii_dii_daily").n,
      signals: hasTable(db, "signals") ? one<{ n: number }>("SELECT COUNT(*) n FROM signals").n : 0,
      firstSignal: hasTable(db, "signals") ? one<{ d: string | null }>("SELECT MIN(date) d FROM signals").d : null,
      briefDate: hasTable(db, "daily_brief") ? one<{ d: string | null }>("SELECT MAX(date) d FROM daily_brief").d : null,
    };
  });
}

export function getState(symbol: string): StockState | null {
  return (
    withDb((db) =>
      hasTable(db, "stock_state")
        ? ((db.prepare("SELECT s.*, i.name, i.sector, i.in_index, i.fno FROM stock_state s JOIN instruments i USING (symbol) WHERE s.symbol = ?").get(symbol) as StockState | undefined) ?? null)
        : null
    ) ?? null
  );
}

// ---- News and events (engine/news). Each feature is "tracked" only once its engine step has run. ----

export type NewsItem = { published_at: string; source: string; headline: string; url: string; tone: "positive" | "neutral" | "negative" | null; impact: string | null };
export type CorpEvent = { kind: string; date: string; source: string; detail: string | null };
export type Buzz = { as_of: string; level: "not_trending" | "top100" | "top50" | "very_trendy"; rank: number | null; topic: string | null; source: string };
export type NewsBundle = {
  tracked: { news: boolean; events: boolean; buzz: boolean };
  news: NewsItem[];
  events: CorpEvent[];
  buzz: Buzz | null;
};

export function getNewsBundle(symbol: string): NewsBundle {
  const empty: NewsBundle = { tracked: { news: false, events: false, buzz: false }, news: [], events: [], buzz: null };
  return (
    withDb((db) => {
      const ran = (step: string) => !!db.prepare("SELECT 1 FROM ingest_log WHERE step = ? AND status = 'ok' LIMIT 1").get(step);
      const has = (t: string) => hasTable(db, t);
      return {
        tracked: { news: ran("news"), events: ran("events"), buzz: ran("buzz") },
        news: has("news_items")
          ? (db.prepare("SELECT published_at, source, headline, url, tone, impact FROM news_items WHERE symbol = ? ORDER BY published_at DESC LIMIT 30").all(symbol) as NewsItem[])
          : [],
        events: has("corporate_events")
          ? (db.prepare("SELECT kind, date, source, detail FROM corporate_events WHERE symbol = ? AND date >= date('now') ORDER BY date LIMIT 10").all(symbol) as CorpEvent[])
          : [],
        buzz: has("buzz")
          ? ((db.prepare("SELECT as_of, level, rank, topic, source FROM buzz WHERE symbol = ? ORDER BY as_of DESC LIMIT 1").get(symbol) as Buzz | undefined) ?? null)
          : null,
      };
    }) ?? empty
  );
}

// ---- Weekly / monthly setups (engine/signals/timeframes.py) ----

export type TfStatus = {
  tf: "W" | "M"; status: "today" | "open" | "none" | "insufficient";
  pattern: string | null; signal_date: string | null; entry: number | null; stop: number | null; target: number | null; bars: number;
};
export type TfStats = PatternStats & { tf: "W" | "M"; bars_needed?: number; bars_available?: number };
// walk_forward comes from PatternStats

export function getTfStatus(symbol: string): TfStatus[] {
  return withDb((db) => (hasTable(db, "tf_status") ? (db.prepare("SELECT * FROM tf_status WHERE symbol = ?").all(symbol) as TfStatus[]) : [])) ?? [];
}

export function getTfStats(): TfStats[] {
  return (
    withDb((db) =>
      hasTable(db, "tf_stats")
        ? (db.prepare("SELECT tf, pattern, stats FROM tf_stats").all() as { tf: "W" | "M"; pattern: string; stats: string }[]).map(
            (r) => ({ tf: r.tf, pattern: r.pattern, ...JSON.parse(r.stats) }) as TfStats
          )
        : []
    ) ?? []
  );
}

export type BenchPoint = { date: string; idx: number; stocks: number };
export function getBenchmark(): BenchPoint[] {
  return withDb((db) => (hasTable(db, "benchmark_daily") ? (db.prepare("SELECT date, idx, stocks FROM benchmark_daily ORDER BY date").all() as BenchPoint[]) : [])) ?? [];
}

// ---- Live record (engine/signals/live.py): setups logged the day they fired, followed forward ----

export type LiveRow = {
  id: number; symbol: string; name: string | null; tf: "D" | "W"; pattern: string; side: "long" | "short";
  signal_date: string; logged_on: string; ref_entry: number; stop: number; target: number;
  status: "waiting" | "skipped" | "open" | "target" | "stop" | "time";
  entry_date: string | null; entry: number | null; exit_date: string | null; exit: number | null;
  r: number | null; best_r: number | null; last_date: string | null; last_close: number | null; in_index: number | null;
};
export type LiveEvent = { date: string; event: string; symbol: string; tf: "D" | "W"; pattern: string; side: "long" | "short"; r: number | null };

export function getLive(): { rows: LiveRow[]; events: LiveEvent[] } {
  return (
    withDb((db) => {
      if (!hasTable(db, "setup_log")) return { rows: [], events: [] };
      const rows = db
        .prepare(
          `SELECT l.*, i.name, i.in_index FROM setup_log l LEFT JOIN instruments i USING (symbol)
           ORDER BY l.signal_date DESC, l.symbol`
        )
        .all() as LiveRow[];
      const events = db
        .prepare(
          `SELECT e.date, e.event, l.symbol, l.tf, l.pattern, l.side, l.r FROM setup_events e JOIN setup_log l ON l.id = e.log_id
           WHERE e.event != 'new' ORDER BY e.date DESC, l.symbol LIMIT 60`
        )
        .all() as LiveEvent[];
      return { rows, events };
    }) ?? { rows: [], events: [] }
  );
}

// ---- Chart patterns (engine/signals/chart_patterns.py): context next to setups, with their 10-year record ----

export type ChartPattern = { symbol: string; date: string; name: string; bias: "bullish" | "bearish"; detail: string };
type CpBlock = { n: number; avg_pct?: number; base_pct?: number; edge_pct?: number; hit_pct?: number };
export type ChartPatternStats = CpBlock & {
  name: string; bias: "bullish" | "bearish"; horizon: number; train: CpBlock; test: CpBlock; train_end: string; reliable: boolean;
};

/** Patterns completed in the last few bars; all stocks, or one. Newest first. */
export function getChartPatterns(symbol?: string): ChartPattern[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "chart_patterns")) return [];
      const sql = `SELECT * FROM chart_patterns ${symbol ? "WHERE symbol = ?" : ""} ORDER BY date DESC, name`;
      return db.prepare(sql).all(...(symbol ? [symbol] : [])) as ChartPattern[];
    }) ?? []
  );
}

export function getChartPatternStats(): Record<string, ChartPatternStats> {
  return (
    withDb((db) => {
      if (!hasTable(db, "chart_pattern_stats")) return {};
      const rows = db.prepare("SELECT name, stats FROM chart_pattern_stats").all() as { name: string; stats: string }[];
      return Object.fromEntries(rows.map((r) => [r.name, { name: r.name, ...JSON.parse(r.stats) }]));
    }) ?? {}
  );
}

// ---- Next-session view: how the previous plan went, and what could trigger at the next close ----

export type PlanResult = {
  symbol: string; name: string; side: "long" | "short"; pattern: string; date: string;
  ref: number; stop: number; target: number;
  entry_date: string | null; entry: number | null; outcome: TradeRow["outcome"] | null; exit_date: string | null;
  r: number | null; last_close: number | null; last_date: string | null;
};

/** Setups from the close before `signalDate`, with what the backtest rules did with them since. */
export function getLastPlan(signalDate: string): { date: string | null; rows: PlanResult[] } {
  return (
    withDb((db) => {
      if (!hasTable(db, "signals")) return { date: null, rows: [] };
      const prev = (db.prepare("SELECT MAX(date) AS d FROM signals WHERE date < ?").get(signalDate) as { d: string | null }).d;
      if (!prev) return { date: null, rows: [] };
      const rows = db
        .prepare(
          `SELECT s.symbol, i.name, s.side, s.pattern, s.date, s.entry AS ref, s.stop, s.target,
                  t.entry_date, t.entry, t.outcome, t.exit_date, t.r, st.close AS last_close, st.date AS last_date
           FROM signals s JOIN instruments i USING (symbol)
           LEFT JOIN trades t ON t.symbol = s.symbol AND t.pattern = s.pattern AND t.signal_date = s.date
           LEFT JOIN stock_state st ON st.symbol = s.symbol
           WHERE s.date = ? ORDER BY s.side, s.symbol`
        )
        .all(prev) as PlanResult[];
      return { date: prev, rows };
    }) ?? { date: null, rows: [] }
  );
}

export type NearTrigger = {
  symbol: string; name: string; side: "long" | "short"; close: number; level: number; dist_pct: number;
  vol_needed: number; volume: number | null; fno: number; trend: string;
};

const NEAR_PCT = 2;
const MIN_TURNOVER = 5e7; // same liquidity floor as the engine (Rs 5 crore a day)

/** Nifty 500 stocks within NEAR_PCT of a breakout or breakdown close, nearest first. */
export function getNearTriggers(limit = 15): { long: NearTrigger[]; short: NearTrigger[] } {
  return (
    withDb((db) => {
      const cols = (db.prepare("PRAGMA table_info(stock_state)").all() as { name: string }[]).map((c) => c.name);
      if (!cols.includes("vol_needed")) return { long: [], short: [] };
      const q = (side: "long" | "short") =>
        db
          .prepare(
            `SELECT s.symbol, i.name, '${side}' AS side, s.close, s.trend, i.fno, s.vol_needed, p.volume,
                    ${side === "long" ? "s.bo_level" : "s.bd_level"} AS level,
                    100.0 * ${side === "long" ? "(s.bo_level - s.close) / s.close" : "(s.close - s.bd_level) / s.close"} AS dist_pct
             FROM stock_state s JOIN instruments i USING (symbol)
             LEFT JOIN prices_daily p ON p.symbol = s.symbol AND p.date = s.date
             WHERE i.in_index = 1 AND s.date = (SELECT MAX(date) FROM stock_state)
               AND s.vol_needed / 1.5 * s.close >= ? AND dist_pct BETWEEN 0 AND ?
             ORDER BY dist_pct LIMIT ?`
          )
          .all(MIN_TURNOVER, NEAR_PCT, limit) as NearTrigger[];
      return { long: q("long"), short: q("short") };
    }) ?? { long: [], short: [] }
  );
}

// ---- Learning from losses (engine/signals/rulecheck.py) ----

type WfStats = { trades: number; avg_r?: number; win_rate?: number };
export type RuleCheck = {
  pattern: string; train_end: string;
  base: { train: WfStats; test: WfStats };
  filters: Record<string, { label: string; share: number; train: WfStats; test: WfStats; gain_train: number; gain_test: number; promising: boolean }>;
};

export function getRuleChecks(): RuleCheck[] {
  return (
    withDb((db) => {
      if (!hasTable(db, "rule_checks")) return [];
      const rows = db.prepare("SELECT pattern, stats FROM rule_checks").all() as { pattern: string; stats: string }[];
      return rows.map((r) => ({ pattern: r.pattern, ...JSON.parse(r.stats) }));
    }) ?? []
  );
}
