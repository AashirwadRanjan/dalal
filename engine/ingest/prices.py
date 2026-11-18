"""Daily OHLC for the Nifty 500 plus any other NSE stock you hold or watch.

A stock you add outside the Nifty 500 has no history yet, so its first fetch pulls 10 years; after that it
updates like the rest.
"""
from engine.db import portfolio_symbols
from engine.ingest.yf_util import fetch_ohlc, to_rows

FULL_HISTORY = "10y"
MIN_ROWS = 200  # fewer rows than this = not backfilled yet


def tracked(conn) -> tuple[dict[str, str], set[str]]:
    """(yf_symbol -> symbol for every tracked stock, symbols that need a full backfill)."""
    mine = portfolio_symbols()
    rows = conn.execute("SELECT symbol, yf_symbol, in_index FROM instruments").fetchall()
    by_yf = {yf: sym for sym, yf, idx in rows if idx or sym in mine}
    counts = dict(conn.execute("SELECT symbol, COUNT(*) FROM prices_daily GROUP BY symbol").fetchall())
    extras = {sym for sym, _, idx in rows if not idx and sym in mine and counts.get(sym, 0) < MIN_ROWS}
    return by_yf, extras


def _store(conn, by_yf: dict[str, str], data) -> int:
    for yf_sym, df in data.items():
        conn.executemany(
            "INSERT OR REPLACE INTO prices_daily (symbol, date, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?)",
            [(by_yf[yf_sym], *row) for row in to_rows(df)],
        )
    conn.commit()
    return len(data)


def run(conn, period: str) -> str:
    by_yf, extras = tracked(conn)
    if not by_yf:
        raise RuntimeError("No instruments loaded. Run the instruments step first.")
    n = _store(conn, by_yf, fetch_ohlc(list(by_yf), period))
    note = ""
    if extras and period != FULL_HISTORY:
        new = {yf: s for yf, s in by_yf.items() if s in extras}
        got = _store(conn, by_yf, fetch_ohlc(list(new), FULL_HISTORY))
        note = f"; backfilled {got} of {len(new)} added stocks"
    missing = len(by_yf) - n
    return f"{n} symbols updated" + (f", {missing} returned no data" if missing else "") + note
