"""SQLite schema + connection. One file (data/market.db) is the whole backend."""
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("DB_PATH", ROOT / "data" / "market.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS instruments (
    symbol     TEXT PRIMARY KEY,   -- NSE symbol, e.g. RELIANCE
    name       TEXT,
    sector     TEXT,
    isin       TEXT,
    yf_symbol  TEXT NOT NULL       -- Yahoo ticker, e.g. RELIANCE.NS
);

CREATE TABLE IF NOT EXISTS prices_daily (
    symbol TEXT NOT NULL,
    date   TEXT NOT NULL,          -- YYYY-MM-DD
    open REAL, high REAL, low REAL, close REAL,
    volume INTEGER,
    PRIMARY KEY (symbol, date)
);

-- Indian indices (grp='india') and global cues (grp='global')
CREATE TABLE IF NOT EXISTS market_series (
    symbol TEXT NOT NULL,          -- Yahoo ticker, e.g. ^NSEI
    name   TEXT,
    grp    TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,  -- display order, set from SERIES in ingest/market_series.py
    date   TEXT NOT NULL,
    open REAL, high REAL, low REAL, close REAL,
    volume INTEGER,
    PRIMARY KEY (symbol, date)
);

-- Values in Rs crore, as published by NSE
CREATE TABLE IF NOT EXISTS fii_dii_daily (
    date TEXT PRIMARY KEY,
    fii_buy REAL, fii_sell REAL, fii_net REAL,
    dii_buy REAL, dii_sell REAL, dii_net REAL
);

CREATE TABLE IF NOT EXISTS ingest_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    step   TEXT NOT NULL,
    ran_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL,          -- ok | failed
    detail TEXT
);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    return conn
