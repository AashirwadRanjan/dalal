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
export type ScreenerRow = {
  symbol: string;
  name: string;
  sector: string;
  close: number;
  prev_close: number | null;
  volume: number | null;
  avg_vol: number | null;
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

export function getScreener(): ScreenerRow[] {
  return (
    withDb((db) =>
      db
        .prepare(
          `WITH ranked AS (
             SELECT symbol, date, close, volume,
                    ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) AS rn
             FROM prices_daily
           )
           SELECT i.symbol, i.name, i.sector,
                  a.close AS close, b.close AS prev_close, a.volume AS volume,
                  (SELECT AVG(volume) FROM ranked r
                    WHERE r.symbol = i.symbol AND r.rn BETWEEN 2 AND 21) AS avg_vol
           FROM instruments i
           JOIN ranked a ON a.symbol = i.symbol AND a.rn = 1
           LEFT JOIN ranked b ON b.symbol = i.symbol AND b.rn = 2`
        )
        .all() as ScreenerRow[]
    ) ?? []
  );
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

export type Freshness = { latestPriceDate: string | null; failedSteps: string[] };

export function getFreshness(): Freshness {
  return (
    withDb((db) => {
      const latest = db.prepare("SELECT MAX(date) AS d FROM prices_daily").get() as { d: string | null };
      // last status per step; surface any whose most recent run failed
      const failed = db
        .prepare(
          `SELECT step FROM ingest_log l
           WHERE id = (SELECT MAX(id) FROM ingest_log WHERE step = l.step) AND status = 'failed'`
        )
        .all() as { step: string }[];
      return { latestPriceDate: latest.d, failedSteps: failed.map((f) => f.step) };
    }) ?? { latestPriceDate: null, failedSteps: [] }
  );
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
          `SELECT s.symbol, i.name, i.sector, s.date, s.pattern, s.trend, s.entry, s.stop, s.target, s.detail
           FROM signals s JOIN instruments i ON i.symbol = s.symbol
           WHERE s.date = (SELECT MAX(date) FROM prices_daily)
           ORDER BY s.pattern, s.symbol`
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
  breakdown: number;
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
