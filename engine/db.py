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
    yf_symbol  TEXT NOT NULL,      -- Yahoo ticker, e.g. RELIANCE.NS
    in_index   INTEGER NOT NULL DEFAULT 0,  -- 1 = Nifty 500 (backtest and screen universe)
    fno        INTEGER NOT NULL DEFAULT 0   -- 1 = has stock futures and options (positional shorts possible)
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

-- Pattern engine output; rebuilt from prices_daily on every run (engine/signals)
CREATE TABLE IF NOT EXISTS signals (
    symbol  TEXT NOT NULL,
    date    TEXT NOT NULL,         -- signal bar; trade would enter next open
    pattern TEXT NOT NULL,         -- see patterns.PATTERNS (long) and patterns.SHORT_PATTERNS
    side    TEXT NOT NULL,         -- long | short
    trend   TEXT,                  -- stock's trend at the signal: up | sideways | down | unknown
    entry   REAL,                  -- reference: signal bar close
    stop    REAL,
    target  REAL,
    detail  TEXT,
    PRIMARY KEY (symbol, date, pattern)
);

CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT NOT NULL,
    pattern     TEXT NOT NULL,
    side        TEXT NOT NULL,     -- long | short
    signal_date TEXT NOT NULL,
    trend       TEXT,
    entry_date  TEXT, entry REAL, stop REAL, target REAL,
    exit_date   TEXT, exit REAL,
    outcome     TEXT,              -- target | stop | trail | time | open
    r           REAL,              -- result in multiples of initial risk, after costs
    ret_pct     REAL,
    bars        INTEGER
);
CREATE INDEX IF NOT EXISTS trades_symbol ON trades (symbol);

CREATE TABLE IF NOT EXISTS pattern_stats (
    pattern TEXT PRIMARY KEY,
    stats   TEXT NOT NULL          -- JSON: backtest.stats() plus "by_trend": {trend: stats}
);

-- Latest trend/momentum snapshot per stock (engine/signals/state.py)
CREATE TABLE IF NOT EXISTS stock_state (
    symbol TEXT PRIMARY KEY,
    date TEXT, close REAL, chg_1d REAL,
    dma50 REAL, dma200 REAL, trend TEXT,
    ret_1m REAL, ret_3m REAL, ret_6m REAL,
    rs_pct REAL,                   -- 6-month return percentile across the universe, 0-100
    atr REAL, trail_stop REAL, hi52 REAL, lo52 REAL, volx REAL,
    low20 REAL,                    -- prior 20-day low (the level a breakdown closes below)
    breakdown INTEGER,
    rsi14 REAL,                    -- RSI(14), Wilder smoothing
    macd REAL, macd_signal REAL, macd_hist REAL,   -- MACD(12, 26, 9)
    bb_up REAL, bb_mid REAL, bb_low REAL,          -- Bollinger bands (20, 2)
    support REAL, resistance REAL, -- nearest confirmed swing low below / swing high above the close
    bo_level REAL, bd_level REAL,  -- next bar is a breakout / breakdown if it closes beyond these...
    vol_needed REAL                -- ...on at least this many shares
);

-- Weekly (W) and monthly (M) setups from resampled bars (engine/signals/timeframes.py)
CREATE TABLE IF NOT EXISTS tf_status (
    symbol TEXT NOT NULL,
    tf     TEXT NOT NULL,          -- W | M
    status TEXT NOT NULL,          -- today | open | none | insufficient
    pattern TEXT, signal_date TEXT, entry REAL, stop REAL, target REAL,
    bars   INTEGER,                -- completed bars available for this stock
    PRIMARY KEY (symbol, tf)
);
CREATE TABLE IF NOT EXISTS tf_stats (
    tf      TEXT NOT NULL,
    pattern TEXT NOT NULL,
    stats   TEXT NOT NULL,         -- JSON: backtest.stats() plus bars_needed / bars_available
    PRIMARY KEY (tf, pattern)
);

-- Equal-weight buy-and-hold of today's universe (benchmark for the backtest chart)
CREATE TABLE IF NOT EXISTS benchmark_daily (
    date   TEXT PRIMARY KEY,
    ret    REAL,                   -- average one-day return across stocks
    idx    REAL,                   -- compounded index, first day = 100
    stocks INTEGER                 -- how many stocks contributed that day
);

-- Chart patterns visible in the last few bars, and what each pattern has meant over 10 years
-- (engine/signals/chart_patterns.py). Rebuilt every run.
CREATE TABLE IF NOT EXISTS chart_patterns (
    symbol TEXT NOT NULL,
    date   TEXT NOT NULL,          -- the bar that completed the pattern
    name   TEXT NOT NULL,          -- double_bottom | head_shoulders | hammer | ...
    bias   TEXT NOT NULL,          -- bullish | bearish
    detail TEXT,
    PRIMARY KEY (symbol, date, name)
);
CREATE TABLE IF NOT EXISTS chart_pattern_stats (
    name  TEXT PRIMARY KEY,
    stats TEXT NOT NULL            -- JSON: n, avg_pct, edge_pct vs the average stock, hit_pct, train/test
);

-- Learning from losses (engine/signals/rulecheck.py): fixed candidate filters, judged in training and later
CREATE TABLE IF NOT EXISTS rule_checks (
    pattern TEXT PRIMARY KEY,
    stats   TEXT NOT NULL          -- JSON: base train/test and, per filter, its train/test stats and gains
);

-- One market brief per trading day (engine/summary.py)
CREATE TABLE IF NOT EXISTS daily_brief (
    date TEXT PRIMARY KEY,
    data TEXT NOT NULL             -- JSON
);

-- News and events (engine/news). Empty until a source is configured; the UI then says "Not tracked".
CREATE TABLE IF NOT EXISTS news_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol       TEXT NOT NULL,
    published_at TEXT NOT NULL,    -- ISO timestamp, UTC
    source       TEXT NOT NULL,    -- publisher or feed name
    headline     TEXT NOT NULL,
    url          TEXT NOT NULL UNIQUE,
    tone         TEXT,             -- positive | neutral | negative (LLM), NULL until classified
    impact       TEXT              -- one plain-English line on why it matters (LLM); never a price prediction
);
CREATE INDEX IF NOT EXISTS news_symbol ON news_items (symbol, published_at);

CREATE TABLE IF NOT EXISTS corporate_events (
    symbol TEXT NOT NULL,
    kind   TEXT NOT NULL,          -- results | board_meeting | dividend_record | agm
    date   TEXT NOT NULL,          -- YYYY-MM-DD
    source TEXT NOT NULL,
    detail TEXT,
    PRIMARY KEY (symbol, kind, date)
);

CREATE TABLE IF NOT EXISTS buzz (
    symbol TEXT NOT NULL,
    as_of  TEXT NOT NULL,          -- ISO timestamp, UTC
    level  TEXT NOT NULL,          -- not_trending | top100 | top50 | very_trendy
    rank   INTEGER,                -- position in India's trend list, if known
    topic  TEXT,
    source TEXT NOT NULL,
    PRIMARY KEY (symbol, as_of)
);

-- Live record (engine/signals/live.py). NOT rebuilt: it only grows, one row per setup from the day it fired.
CREATE TABLE IF NOT EXISTS setup_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol      TEXT NOT NULL,
    tf          TEXT NOT NULL,     -- D | W
    pattern     TEXT NOT NULL,
    side        TEXT NOT NULL,     -- long | short
    signal_date TEXT NOT NULL,     -- the bar the setup fired on (a week is dated by its first day)
    logged_on   TEXT NOT NULL,     -- latest daily bar when it was logged; levels are frozen from then on
    ref_entry REAL, stop REAL, target REAL, detail TEXT,
    status      TEXT NOT NULL,     -- waiting | skipped | open | target | stop | time
    entry_date TEXT, entry REAL, exit_date TEXT, exit REAL,
    r           REAL,              -- closed result in R after costs and slippage
    best_r      REAL,              -- furthest the price went in the trade's favour, in R (before costs)
    last_date TEXT, last_close REAL,
    UNIQUE (symbol, tf, pattern, signal_date)
);
CREATE TABLE IF NOT EXISTS setup_events (
    log_id INTEGER NOT NULL REFERENCES setup_log (id),
    date   TEXT NOT NULL,          -- the bar it happened on
    event  TEXT NOT NULL,          -- new | entered | skipped | working | target | stop | time
    sent   INTEGER NOT NULL DEFAULT 0,  -- 1 once included in a Telegram alert
    UNIQUE (log_id, event)
);

CREATE TABLE IF NOT EXISTS ingest_log (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    step   TEXT NOT NULL,
    ran_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL,          -- ok | failed
    detail TEXT
);
"""


# Derived tables are rebuilt every run, so an outdated layout is simply dropped and recreated.
DERIVED_COLUMNS = {"signals": "side", "trades": "side", "stock_state": "vol_needed"}
ADDED_COLUMNS = [
    ("instruments", "in_index", "INTEGER NOT NULL DEFAULT 0"),
    ("instruments", "fno", "INTEGER NOT NULL DEFAULT 0"),
]


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    for table, col in DERIVED_COLUMNS.items():
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
        if cols and col not in cols:
            conn.execute(f"DROP TABLE {table}")
    # Kept tables that gained columns: add them in place (never drop user-relevant history)
    for table, col, decl in ADDED_COLUMNS:
        cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
        if cols and col not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
            if (table, col) == ("instruments", "in_index"):
                conn.execute("UPDATE instruments SET in_index = 1")  # every row so far came from the Nifty 500
    conn.executescript(SCHEMA)
    return conn


def portfolio_symbols() -> set[str]:
    """Symbols in your holdings and watchlist (data/portfolio.db, owned by the web app), read-only."""
    path = Path(os.environ.get("PORTFOLIO_DB", ROOT / "data" / "portfolio.db"))
    if not path.exists():
        return set()
    pf = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
    try:
        out = set()
        for table in ("holdings", "watchlist"):
            if pf.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                out |= {r[0] for r in pf.execute(f"SELECT symbol FROM {table}")}
        return out
    finally:
        pf.close()
