"""Load the Nifty 500 constituent list into `instruments`.

Tries NSE's published CSV. If NSE blocks the request, download the file manually from
https://www.niftyindices.com (Nifty 500 constituents) and save it as data/nifty500.csv.
"""
import csv
import io

import requests

from engine.db import ROOT

NSE_URL = "https://archives.nseindia.com/content/indices/ind_nifty500list.csv"
LOCAL_CSV = ROOT / "data" / "nifty500.csv"
HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}


def _read_csv_text() -> str:
    try:
        r = requests.get(NSE_URL, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return r.text
    except Exception as e:
        if LOCAL_CSV.exists():
            print(f"  NSE download failed ({e}); using {LOCAL_CSV}")
            return LOCAL_CSV.read_text(encoding="utf-8-sig")
        raise RuntimeError(
            f"Could not download the Nifty 500 list ({e}). "
            f"Save it manually as {LOCAL_CSV} and re-run."
        )


def run(conn) -> str:
    text = _read_csv_text()
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for r in reader:
        symbol = (r.get("Symbol") or "").strip()
        if not symbol:
            continue
        rows.append(
            (symbol, (r.get("Company Name") or "").strip(), (r.get("Industry") or "").strip(),
             (r.get("ISIN Code") or "").strip(), f"{symbol}.NS")
        )
    conn.executemany(
        "INSERT OR REPLACE INTO instruments (symbol, name, sector, isin, yf_symbol) VALUES (?,?,?,?,?)",
        rows,
    )
    conn.commit()
    return f"{len(rows)} instruments"
