import sqlite3
import unittest

from engine import db, summary


def make_conn(changes, nifty=(25000.0, 25100.0), sp500=(7500.0, 7400.0), fii=4195.38, dii=196.93):
    """In-memory DB with the real schema. changes: list of (symbol, sector, chg_pct)."""
    conn = sqlite3.connect(":memory:")
    conn.executescript(db.SCHEMA)
    d = "2026-11-17"
    for i, (sym, sector, chg) in enumerate(changes):
        conn.execute("INSERT INTO instruments VALUES (?,?,?,?,?)", (sym, f"{sym} Ltd.", sector, "", f"{sym}.NS"))
        conn.execute(
            "INSERT INTO stock_state (symbol, date, close, chg_1d, dma50, dma200, trend, volx, breakdown) "
            "VALUES (?,?,?,?,?,?,?,?,0)",
            (sym, d, 100.0, chg / 100, 95.0, 90.0, "up" if chg > 0 else "down", 1.0 + i),
        )
    for sym, name, grp, (a, b) in (("^NSEI", "Nifty 50", "india", nifty), ("^GSPC", "S&P 500", "global", sp500),
                                   ("^IXIC", "Nasdaq", "global", sp500)):
        conn.execute("INSERT INTO market_series (symbol, name, grp, date, close) VALUES (?,?,?,?,?)", (sym, name, grp, "2026-11-16", a))
        conn.execute("INSERT INTO market_series (symbol, name, grp, date, close) VALUES (?,?,?,?,?)", (sym, name, grp, d, b))
    conn.execute("INSERT INTO fii_dii_daily (date, fii_net, dii_net) VALUES (?,?,?)", (d, fii, dii))
    return conn


def texts(data):
    return [h["text"] for h in data["headlines"]]


class Build(unittest.TestCase):
    def test_breadth_and_sectors(self):
        conn = make_conn([("A", "Realty", 3), ("B", "Realty", 2), ("C", "Realty", 1), ("D", "IT", -1), ("E", "IT", -2), ("F", "IT", -3)])
        d = summary.build(conn)
        self.assertEqual((d["breadth"]["advances"], d["breadth"]["declines"], d["breadth"]["total"]), (3, 3, 6))
        self.assertEqual(d["sectors_top"][0]["sector"], "Realty")
        self.assertEqual(d["gainers"][0]["symbol"], "A")
        self.assertEqual(d["losers"][0]["symbol"], "F")

    def test_stale_stocks_excluded(self):
        conn = make_conn([("A", "X", 1), ("B", "X", -1)])
        conn.execute("UPDATE stock_state SET date = '2026-11-16' WHERE symbol = 'B'")
        self.assertEqual(summary.build(conn)["breadth"]["total"], 1)

    def test_headlines(self):
        conn = make_conn([(f"S{i}", "X", 1 if i < 8 else -1) for i in range(10)])
        t = texts(summary.build(conn))
        self.assertTrue(t[0].startswith("Nifty 50 rose 0.40% to 25,100"))
        self.assertIn("Broad-based buying: 8 of 10 Nifty 500 stocks rose.", t)
        self.assertTrue(any(x.startswith("FIIs were net buyers at +₹4,195 Cr; DIIs +₹197 Cr") for x in t))
        self.assertTrue(any("US markets fell" in x for x in t))

    def test_narrow_rally(self):
        conn = make_conn([(f"S{i}", "X", 1 if i < 3 else -1) for i in range(10)])
        self.assertTrue(any(x.startswith("Narrow move") for x in texts(summary.build(conn))))

    def test_requires_stock_state(self):
        conn = sqlite3.connect(":memory:")
        conn.executescript(db.SCHEMA)
        with self.assertRaises(RuntimeError):
            summary.build(conn)


class Run(unittest.TestCase):
    def test_one_row_per_day(self):
        conn = make_conn([("A", "X", 1), ("B", "X", -1)])
        summary.run(conn)
        summary.run(conn)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM daily_brief").fetchone()[0], 1)


if __name__ == "__main__":
    unittest.main()
