"""Short-side simulator and detectors, stock-list parsing, which stocks get prices."""
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

from engine import db
from engine.ingest import instruments, prices
from engine.signals import backtest, patterns
from engine.signals.patterns import Signal
from engine.tests.test_backtest import bars


def short(stop=105, target=90):
    return Signal(i=0, date="2025-01-01", pattern="breakdown", entry=100, stop=stop, target=target, detail="")


class ShortSimulate(unittest.TestCase):
    def setUp(self):
        backtest.COST_PCT = 0
        backtest.SLIPPAGE_PCT = 0

    def tearDown(self):
        backtest.COST_PCT = 0.1
        backtest.SLIPPAGE_PCT = 0.2

    def test_short_hits_target_below(self):
        t = backtest.simulate(short(), *bars([(101, 102, 99, 100), (100, 101, 96, 97), (97, 98, 89, 91)]))
        self.assertEqual((t.entry, t.outcome, t.exit), (100, "target", 90))
        self.assertAlmostEqual(t.r, 2.0)
        self.assertEqual(t.side, "short")

    def test_short_stop_wins_when_bar_touches_both(self):
        t = backtest.simulate(short(), *bars([(101, 102, 99, 100), (100, 106, 89, 100)]))
        self.assertEqual((t.outcome, t.exit), ("stop", 105))
        self.assertAlmostEqual(t.r, -1.0)

    def test_short_gap_up_fills_at_open(self):
        t = backtest.simulate(short(), *bars([(101, 102, 99, 100), (100, 101, 99, 100), (110, 111, 109, 110)]))
        self.assertEqual((t.outcome, t.exit), ("stop", 110))
        self.assertAlmostEqual(t.r, -2.0)

    def test_short_skips_when_entry_gaps_past_stop(self):
        self.assertIsNone(backtest.simulate(short(), *bars([(101, 102, 99, 100), (106, 107, 105, 106)])))

    def test_short_trail_only_moves_down(self):
        trail = np.array([np.nan, 104, 108, 99, 99])  # 108 would loosen the stop: ignored
        t = backtest.simulate(short(), *bars([(101, 102, 99, 100), (100, 101, 98, 99), (99, 100, 97, 98),
                                              (98, 99, 96, 97), (97, 100, 95, 99)]), mode="trail", trail=trail)
        self.assertEqual((t.outcome, t.exit), ("trail", 99))

    def test_short_costs_reduce_result(self):
        backtest.COST_PCT, backtest.SLIPPAGE_PCT = 0.1, 0.2
        t = backtest.simulate(short(), *bars([(101, 102, 99, 100), (100, 101, 96, 97), (97, 98, 89, 91)]))
        self.assertAlmostEqual(t.entry, 99.8)  # sold 0.2% below the open
        self.assertLess(t.r, 2.0)


def frame(closes, vols=None, spread=1.0):
    c = np.array(closes, float)
    o = np.r_[c[0], c[:-1]]
    v = np.full(len(c), 1000.0) if vols is None else np.array(vols, float)
    idx = [str(d.date()) for d in pd.bdate_range("2024-01-01", periods=len(c))]
    return pd.DataFrame({"open": o, "high": np.maximum(o, c) + spread, "low": np.minimum(o, c) - spread,
                         "close": c, "volume": v}, index=idx)


class ShortDetectors(unittest.TestCase):
    def test_breakdown_fires_on_volume_close_below_20day_low(self):
        closes = [100 + (i % 5) for i in range(80)] + [90]
        vols = [1000] * 80 + [3000]
        sigs = [s for s in patterns.detect(frame(closes, vols)) if s.pattern == "breakdown"]
        self.assertEqual([s.i for s in sigs], [80])
        s = sigs[0]
        self.assertEqual(s.side, "short")
        self.assertGreater(s.stop, s.entry)
        self.assertLess(s.target, s.entry)

    def test_breakdown_ignores_future_bars(self):
        closes = [100 + (i % 5) for i in range(80)] + [90]
        vols = [1000] * 80 + [3000]
        before = [s for s in patterns.detect(frame(closes, vols)) if s.i <= 80]
        after = [s for s in patterns.detect(frame(closes + [80, 70, 95], vols + [1000] * 3)) if s.i <= 80]
        self.assertEqual(before, after)


class Parsing(unittest.TestCase):
    def test_equity_list_keeps_equity_series_only(self):
        text = ("SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE\n"
                "ABC,ABC Limited,EQ,01-JAN-2000,10,1,INE000A01,10\n"
                "XYZ,XYZ Limited,SM,01-JAN-2000,10,1,INE000B01,10\n")
        self.assertEqual(instruments.parse_equity(text), [("ABC", "ABC Limited", "INE000A01")])

    def test_fno_list_strips_padding(self):
        text = ("UNDERLYING   ,SYMBOL    ,NOV-26  \n"
                "NIFTY 50     ,NIFTY     ,65      \n"
                "Reliance Ind ,RELIANCE  ,500     \n")
        self.assertEqual(instruments.parse_fno(text), {"NIFTY", "RELIANCE"})


class Tracked(unittest.TestCase):
    def test_index_plus_your_stocks_and_backfill_for_new_ones(self):
        with tempfile.TemporaryDirectory() as d:
            pf = Path(d) / "portfolio.db"
            p = sqlite3.connect(pf)
            p.execute("CREATE TABLE holdings (symbol TEXT PRIMARY KEY, qty REAL, avg_price REAL, updated_at TEXT)")
            p.execute("CREATE TABLE watchlist (symbol TEXT PRIMARY KEY, note TEXT, added_at TEXT)")
            p.execute("INSERT INTO holdings VALUES ('SMALL', 1, 1, '')")
            p.commit(); p.close()
            with mock.patch.dict("os.environ", {"PORTFOLIO_DB": str(pf)}), mock.patch.object(db, "DB_PATH", Path(d) / "m.db"):
                conn = db.connect()
                conn.executemany("INSERT INTO instruments (symbol, name, sector, isin, yf_symbol, in_index) VALUES (?,?,?,?,?,?)",
                                 [("BIG", "", "", "", "BIG.NS", 1), ("SMALL", "", "", "", "SMALL.NS", 0),
                                  ("OTHER", "", "", "", "OTHER.NS", 0)])
                by_yf, extras = prices.tracked(conn)
                self.assertEqual(by_yf, {"BIG.NS": "BIG", "SMALL.NS": "SMALL"})
                self.assertEqual(extras, {"SMALL"})
                conn.close()


if __name__ == "__main__":
    unittest.main()
