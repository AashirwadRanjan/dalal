"""Load the stock lists into `instruments`.

- Nifty 500 constituents (in_index = 1): the universe the backtest and screens run on.
- Every NSE-listed equity (EQ/BE/BZ series): so you can search, hold or watch any NSE stock. Only the ones
  you hold or watch get prices fetched (see ingest/prices.py).
- F&O stocks (fno = 1): the only ones a positional short is possible on (futures or puts); cash shares can be
  shorted intraday only.

All three are static files NSE publishes on its archives host, fetched once per run. If NSE blocks a
download, save the file by hand under data/ (names below) and re-run. NSE's terms restrict automated
collection; these are single daily downloads of public files for personal use.
"""
import csv
import io

import requests

from engine.db import ROOT

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
SOURCES = {
    "nifty500": ("https://archives.nseindia.com/content/indices/ind_nifty500list.csv", ROOT / "data" / "nifty500.csv"),
    "equity": ("https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv", ROOT / "data" / "equity_l.csv"),
    "fno": ("https://nsearchives.nseindia.com/content/fo/fo_mktlots.csv", ROOT / "data" / "fo_mktlots.csv"),
}
EQUITY_SERIES = {"EQ", "BE", "BZ"}


def _read(name: str, required: bool) -> str | None:
    url, local = SOURCES[name]
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return r.text
    except Exception as e:
        if local.exists():
            print(f"  {name}: download failed ({e}); using {local}")
            return local.read_text(encoding="utf-8-sig")
        if required:
            raise RuntimeError(f"Could not download the {name} list ({e}). Save it manually as {local} and re-run.")
        print(f"  {name}: download failed ({e}); skipped")
        return None


def _rows(text: str) -> list[dict]:
    """csv.DictReader with header and cell whitespace stripped (NSE pads some files)."""
    reader = csv.reader(io.StringIO(text.lstrip("﻿")))
    head = [h.strip() for h in next(reader, [])]
    return [{k: (v or "").strip() for k, v in zip(head, r)} for r in reader if r]


def parse_nifty500(text: str) -> list[tuple]:
    return [(r["Symbol"], r.get("Company Name", ""), r.get("Industry", ""), r.get("ISIN Code", ""))
            for r in _rows(text) if r.get("Symbol")]


def parse_equity(text: str) -> list[tuple]:
    return [(r["SYMBOL"], r.get("NAME OF COMPANY", ""), r.get("ISIN NUMBER", ""))
            for r in _rows(text) if r.get("SYMBOL") and r.get("SERIES") in EQUITY_SERIES]


def parse_fno(text: str) -> set[str]:
    """Stock symbols in the F&O lot-size file. Index rows (NIFTY, BANKNIFTY, ...) are dropped by the caller,
    which only flags symbols that are also equities."""
    return {r["SYMBOL"] for r in _rows(text) if r.get("SYMBOL") and r["SYMBOL"] != "Symbol"}


def run(conn) -> str:
    n500 = parse_nifty500(_read("nifty500", required=True))
    eq_text, fno_text = _read("equity", required=False), _read("fno", required=False)
    equity = parse_equity(eq_text) if eq_text else []
    fno = parse_fno(fno_text) if fno_text else set()

    with conn:
        conn.execute("UPDATE instruments SET in_index = 0")
        if fno_text:
            conn.execute("UPDATE instruments SET fno = 0")
        conn.executemany(
            "INSERT INTO instruments (symbol, name, sector, isin, yf_symbol, in_index) VALUES (?,?,?,?,?,0) "
            "ON CONFLICT (symbol) DO UPDATE SET name = excluded.name, isin = excluded.isin",
            [(s, name, "", isin, f"{s}.NS") for s, name, isin in equity],
        )
        conn.executemany(
            "INSERT INTO instruments (symbol, name, sector, isin, yf_symbol, in_index) VALUES (?,?,?,?,?,1) "
            "ON CONFLICT (symbol) DO UPDATE SET name = excluded.name, sector = excluded.sector, "
            "isin = excluded.isin, in_index = 1",
            [(s, name, sector, isin, f"{s}.NS") for s, name, sector, isin in n500],
        )
        if fno:
            conn.executemany("UPDATE instruments SET fno = 1 WHERE symbol = ?", [(s,) for s in fno])
    n_fno = conn.execute("SELECT COUNT(*) FROM instruments WHERE fno = 1").fetchone()[0]
    return (f"{len(n500)} in Nifty 500, {len(equity)} NSE equities"
            + (f", {n_fno} F&O stocks" if fno_text else ", F&O list unavailable"))
