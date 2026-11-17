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
  signal_date: string;
  entry_date: string;
  entry: number;
  stop: number;
  target: number;
  exit_date: string;
  exit: number;
  outcome: "target" | "stop" | "time" | "open";
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
          `SELECT s.symbol, i.name, i.sector, s.date, s.pattern, s.trend, st.volx, st.rs_pct,
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
      const where = opts.symbol ? "WHERE symbol = ?" : "WHERE outcome != 'open'";
      const args: (string | number)[] = opts.symbol ? [opts.symbol] : [];
      return db
        .prepare(
          `SELECT symbol, pattern, signal_date, entry_date, entry, stop, target, exit_date, exit, outcome, r, ret_pct, bars
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
          `SELECT pattern, exit_date AS date, SUM(r) AS r FROM trades
           WHERE outcome != 'open' GROUP BY pattern, exit_date ORDER BY exit_date`
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
          `SELECT s.symbol, '' AS name, '' AS sector, s.date, s.pattern, s.trend, s.entry, s.stop, s.target, s.detail
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
};

export function getStates(): StockState[] {
  return (
    withDb((db) =>
      hasTable(db, "stock_state")
        ? (db
            .prepare("SELECT s.*, i.name, i.sector FROM stock_state s JOIN instruments i USING (symbol)")
            .all() as StockState[])
        : []
    ) ?? []
  );
}

export function getInstruments(): { symbol: string; name: string }[] {
  // Only instruments with prices: Yahoo has nothing for a few (e.g. BAGMANE, DUMMYHEG), so they can't be analysed.
  return (
    withDb((db) =>
      db
        .prepare(
          `SELECT symbol, name FROM instruments i
           WHERE EXISTS (SELECT 1 FROM prices_daily p WHERE p.symbol = i.symbol) ORDER BY symbol`
        )
        .all() as { symbol: string; name: string }[]
    ) ?? []
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
        ? ((db.prepare("SELECT s.*, i.name, i.sector FROM stock_state s JOIN instruments i USING (symbol) WHERE s.symbol = ?").get(symbol) as StockState | undefined) ?? null)
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
