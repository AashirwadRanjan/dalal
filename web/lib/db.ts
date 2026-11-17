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
