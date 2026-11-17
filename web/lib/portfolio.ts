/**
 * Your holdings live in their own file, data/portfolio.db, so rebuilding or deleting
 * market.db never touches them. This is the only place the web app writes.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const PF_PATH = process.env.PORTFOLIO_DB ?? path.join(process.cwd(), "..", "data", "portfolio.db");

export type Holding = { symbol: string; qty: number; avg_price: number; updated_at: string };

function withPf<T>(fn: (db: Database.Database) => T): T {
  fs.mkdirSync(path.dirname(/*turbopackIgnore: true*/ PF_PATH), { recursive: true });
  const db = new Database(PF_PATH);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS holdings (
      symbol     TEXT PRIMARY KEY,
      qty        REAL NOT NULL CHECK (qty > 0),
      avg_price  REAL NOT NULL CHECK (avg_price > 0),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      symbol   TEXT PRIMARY KEY,
      note     TEXT,
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    return fn(db);
  } finally {
    db.close();
  }
}

export const listHoldings = () =>
  withPf((db) => db.prepare("SELECT symbol, qty, avg_price, updated_at FROM holdings ORDER BY symbol").all() as Holding[]);

export const upsertHolding = (symbol: string, qty: number, avg: number) =>
  withPf((db) =>
    db
      .prepare(
        `INSERT INTO holdings (symbol, qty, avg_price) VALUES (?, ?, ?)
         ON CONFLICT (symbol) DO UPDATE SET qty = excluded.qty, avg_price = excluded.avg_price, updated_at = datetime('now')`
      )
      .run(symbol, qty, avg)
  );

export type WatchItem = { symbol: string; note: string | null; added_at: string };

export const listWatchlist = () =>
  withPf((db) => db.prepare("SELECT symbol, note, added_at FROM watchlist ORDER BY added_at DESC").all() as WatchItem[]);

export const isWatched = (symbol: string) =>
  withPf((db) => !!db.prepare("SELECT 1 FROM watchlist WHERE symbol = ?").get(symbol));

export const setWatched = (symbol: string, on: boolean) =>
  withPf((db) =>
    on
      ? db.prepare("INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)").run(symbol)
      : db.prepare("DELETE FROM watchlist WHERE symbol = ?").run(symbol)
  );

export const deleteHolding = (symbol: string) =>
  withPf((db) => db.prepare("DELETE FROM holdings WHERE symbol = ?").run(symbol));

/** "RELIANCE-EQ", "reliance.ns", " Reliance " -> "RELIANCE" */
export const normSymbol = (s: string) =>
  s.trim().toUpperCase().replace(/\.(NS|BO)$/, "").replace(/-(EQ|BE|BZ)$/, "");

const num = (s: string | undefined) => {
  const n = Number((s ?? "").replace(/[₹,\s"]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Parse pasted holdings. Accepts a broker export with a header row (Zerodha, Groww, Upstox:
 * columns like "Instrument", "Qty.", "Avg. cost") or bare lines "SYMBOL, qty, avg price".
 */
export function parseHoldings(text: string): { rows: { symbol: string; qty: number; avg: number }[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l: string) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.trim().replace(/^"|"$/g, ""));
  let cols = { sym: 0, qty: 1, avg: 2 };
  let start = 0;
  if (lines.length) {
    const head = split(lines[0]).map((h) => h.toLowerCase());
    const find = (re: RegExp) => head.findIndex((h) => re.test(h));
    const sym = find(/symbol|instrument|stock|scrip|name/), qty = find(/qty|quantity|shares/), avg = find(/avg|average|buy price|cost/);
    if (sym >= 0 && qty >= 0 && avg >= 0) {
      cols = { sym, qty, avg };
      start = 1;
    }
  }
  const rows: { symbol: string; qty: number; avg: number }[] = [];
  const errors: string[] = [];
  for (const [i, line] of lines.slice(start).entries()) {
    const c = split(line);
    const symbol = normSymbol(c[cols.sym] ?? "");
    const qty = num(c[cols.qty]), avg = num(c[cols.avg]);
    if (!symbol || !(qty > 0) || !(avg > 0)) errors.push(`Line ${i + start + 1}: couldn't read "${line}"`);
    else rows.push({ symbol, qty, avg });
  }
  return { rows, errors };
}
