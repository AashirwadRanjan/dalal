"""Daily OHLC for every instrument."""
from engine.ingest.yf_util import fetch_ohlc, to_rows


def run(conn, period: str) -> str:
    inst = conn.execute("SELECT symbol, yf_symbol FROM instruments").fetchall()
    if not inst:
        raise RuntimeError("No instruments loaded. Run the instruments step first.")
    by_yf = {yf_sym: sym for sym, yf_sym in inst}
    data = fetch_ohlc(list(by_yf), period)

    n = 0
    for yf_sym, df in data.items():
        sym = by_yf[yf_sym]
        conn.executemany(
            "INSERT OR REPLACE INTO prices_daily (symbol, date, open, high, low, close, volume) "
            "VALUES (?,?,?,?,?,?,?)",
            [(sym, *row) for row in to_rows(df)],
        )
        n += 1
    conn.commit()
    missing = len(by_yf) - n
    return f"{n} symbols updated" + (f", {missing} returned no data" if missing else "")
