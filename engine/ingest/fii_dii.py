"""FII/DII cash-market net flows from NSE.

NSE only exposes the latest trading day here, so history builds up one row per daily run.
(Run this every day from day one; older days can be backfilled from NSE/NSDL reports later.)
"""
from datetime import datetime

import requests

HOME = "https://www.nseindia.com"
URL = "https://www.nseindia.com/api/fiidiiTradeReact"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/reports/fii-dii",
}


def _f(x) -> float:
    return float(str(x).replace(",", ""))


def run(conn) -> str:
    s = requests.Session()
    s.headers.update(HEADERS)
    s.get(HOME, timeout=15)  # NSE needs the cookies from the homepage first
    r = s.get(URL, timeout=15)
    r.raise_for_status()
    items = r.json()

    dates = set()
    for it in items:
        cat = it["category"].upper()
        prefix = "dii" if "DII" in cat else "fii" if "FII" in cat or "FPI" in cat else None
        if not prefix:
            continue
        date = datetime.strptime(it["date"], "%d-%b-%Y").date().isoformat()
        dates.add(date)
        conn.execute("INSERT OR IGNORE INTO fii_dii_daily (date) VALUES (?)", (date,))
        conn.execute(
            f"UPDATE fii_dii_daily SET {prefix}_buy=?, {prefix}_sell=?, {prefix}_net=? WHERE date=?",
            (_f(it["buyValue"]), _f(it["sellValue"]), _f(it["netValue"]), date),
        )
    conn.commit()
    return f"flows for {', '.join(sorted(dates)) or 'no dates'}"
