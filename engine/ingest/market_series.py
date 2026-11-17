"""Indian indices + global cues (US, Asia, rates, dollar, crude, gold, USDINR)."""
from engine.ingest.yf_util import fetch_ohlc, to_rows

SERIES = [
    # (yahoo ticker, display name, group)
    ("^NSEI", "Nifty 50", "india"),
    ("^BSESN", "Sensex", "india"),
    ("^NSEBANK", "Bank Nifty", "india"),
    ("^INDIAVIX", "India VIX", "india"),
    ("^GSPC", "S&P 500", "global"),
    ("^IXIC", "Nasdaq", "global"),
    ("^DJI", "Dow Jones", "global"),
    ("^TNX", "US 10Y yield", "global"),
    ("DX-Y.NYB", "Dollar index", "global"),
    ("BZ=F", "Brent crude", "global"),
    ("GC=F", "Gold", "global"),
    ("USDINR=X", "USD/INR", "global"),
    ("^N225", "Nikkei 225", "global"),
    ("^HSI", "Hang Seng", "global"),
    ("000001.SS", "Shanghai", "global"),  # ^SSEC stopped returning data on Yahoo
    ("^FTSE", "FTSE 100", "global"),
]


def run(conn, period: str) -> str:
    meta = {t: (name, grp, i) for i, (t, name, grp) in enumerate(SERIES)}
    data = fetch_ohlc(list(meta), period)
    for t, df in data.items():
        name, grp, order = meta[t]
        conn.executemany(
            "INSERT OR REPLACE INTO market_series "
            "(symbol, name, grp, sort_order, date, open, high, low, close, volume) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            [(t, name, grp, order, *row) for row in to_rows(df)],
        )
    conn.commit()
    missing = [meta[t][0] for t in meta if t not in data]
    return f"{len(data)}/{len(meta)} series" + (f" (no data: {', '.join(missing)})" if missing else "")
