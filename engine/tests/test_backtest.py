"""Run: python -m unittest discover engine/tests"""
import unittest

import numpy as np
import pandas as pd

from engine.signals import backtest, patterns
from engine.signals.patterns import Signal


def bars(rows):
    """rows: (open, high, low, close). Returns o, h, l, c arrays and date strings."""
    a = np.array(rows, float)
    return a[:, 0], a[:, 1], a[:, 2], a[:, 3], [f"2025-01-{i + 1:02d}" for i in range(len(rows))]


def sig(stop=95, target=110):
    return Signal(i=0, date="2025-01-01", pattern="breakout", entry=100, stop=stop, target=target, detail="")


class Simulate(unittest.TestCase):
    def setUp(self):
        backtest.COST_PCT = 0  # exact numbers; costs tested separately

    def tearDown(self):
        backtest.COST_PCT = 0.1

    def test_enters_next_open_and_hits_target(self):
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 104, 99, 103), (103, 111, 102, 108)]))
        self.assertEqual((t.entry, t.outcome, t.exit, t.entry_date), (100, "target", 110, "2025-01-02"))
        self.assertAlmostEqual(t.r, 2.0)

    def test_stop_wins_when_bar_touches_both(self):
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 112, 94, 100)]))
        self.assertEqual((t.outcome, t.exit), ("stop", 95))
        self.assertAlmostEqual(t.r, -1.0)

    def test_gap_down_fills_at_open_not_stop(self):
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 102, 99, 101), (90, 92, 89, 91)]))
        self.assertEqual((t.outcome, t.exit), ("stop", 90))
        self.assertAlmostEqual(t.r, -2.0)

    def test_gap_up_fills_at_open(self):
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 102, 99, 101), (115, 116, 114, 115)]))
        self.assertEqual((t.outcome, t.exit), ("target", 115))

    def test_skips_when_entry_gaps_past_stop(self):
        self.assertIsNone(backtest.simulate(sig(), *bars([(99, 101, 98, 100), (94, 96, 93, 95)])))

    def test_no_trade_when_signal_is_latest_bar(self):
        self.assertIsNone(backtest.simulate(sig(), *bars([(99, 101, 98, 100)])))

    def test_time_exit_after_max_hold(self):
        rows = [(99, 101, 98, 100)] + [(100, 101, 99, 100.5)] * (backtest.MAX_HOLD + 5)
        t = backtest.simulate(sig(), *bars(rows))
        self.assertEqual((t.outcome, t.bars, t.exit), ("time", backtest.MAX_HOLD, 100.5))

    def test_open_when_data_ends_early(self):
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 101, 99, 100.5)]))
        self.assertEqual(t.outcome, "open")

    def test_costs_reduce_r(self):
        backtest.COST_PCT = 0.1
        t = backtest.simulate(sig(), *bars([(99, 101, 98, 100), (100, 111, 99, 108)]))
        self.assertAlmostEqual(t.r, (110 * 0.999 - 100 * 1.001) / 5, places=3)

    def test_one_trade_at_a_time_per_pattern(self):
        o, h, l, c, d = bars([(99, 101, 98, 100)] + [(100, 101, 99, 100.5)] * 5 + [(100, 111, 99, 108)])
        s1, s2 = sig(), Signal(2, d[2], "breakout", 100, 95, 110, "")
        self.assertEqual(len(backtest.run_symbol([s1, s2], o, h, l, c, d)), 1)


class Rigor(unittest.TestCase):
    def trade(self, entry_date, exit_date, r):
        return backtest.Trade("breakout", entry_date, entry_date, 100, 95, 110, exit_date, 100 + 5 * r, "target" if r > 0 else "stop",
                              r, r * 5, 3, 0)

    def test_walk_forward_split_and_selection(self):
        train = [self.trade("2025-06-01", "2025-06-05", 1.0)] * 120
        test = [self.trade("2026-02-01", "2026-02-05", -1.0)] * 10
        wf = backtest.walk_forward(train + test)
        self.assertEqual((wf["train"]["trades"], wf["test"]["trades"]), (120, 10))
        self.assertTrue(wf["selected"])
        self.assertLess(wf["test"]["avg_r"], 0)

    def test_not_selected_with_few_trades(self):
        self.assertFalse(backtest.walk_forward([self.trade("2025-06-01", "2025-06-05", 2.0)] * 20)["selected"])

    def test_by_year_uses_exit_year(self):
        y = backtest.by_year([self.trade("2025-12-28", "2026-01-03", 1.0), self.trade("2025-03-01", "2025-03-04", -1.0)])
        self.assertEqual(sorted(y), ["2025", "2026"])
        self.assertEqual(y["2026"]["trades"], 1)


class Benchmark(unittest.TestCase):
    def test_equal_weight_average_of_daily_returns(self):
        from engine.signals.run import benchmark
        rows = [("A", "2026-01-01", 100.0), ("A", "2026-01-02", 110.0), ("B", "2026-01-01", 50.0), ("B", "2026-01-02", 45.0)]
        df = pd.DataFrame(rows, columns=["symbol", "date", "close"])
        out = benchmark(df)
        self.assertAlmostEqual(out[1][1], 0.0)        # (+10% + -10%) / 2
        self.assertAlmostEqual(out[1][2], 100.0)
        self.assertEqual(out[1][3], 2)


class NoLookahead(unittest.TestCase):
    def test_signals_unchanged_when_future_bars_removed(self):
        rng = np.random.default_rng(7)
        n = 400
        c = 100 * np.exp(np.cumsum(rng.normal(0, 0.02, n)))
        o = c * (1 + rng.normal(0, 0.005, n))
        h = np.maximum(o, c) * (1 + rng.uniform(0, 0.02, n))
        l = np.minimum(o, c) * (1 - rng.uniform(0, 0.02, n))
        v = rng.lognormal(10, 0.6, n)
        idx = pd.date_range("2024-01-01", periods=n).strftime("%Y-%m-%d")
        df = pd.DataFrame({"open": o, "high": h, "low": l, "close": c, "volume": v}, index=idx)

        full = patterns.detect(df)
        self.assertGreater(len(full), 0)
        for cut in (150, 250, 399):
            part = patterns.detect(df.iloc[:cut])
            self.assertEqual(part, [s for s in full if s.i < cut], f"signals before bar {cut} changed")


if __name__ == "__main__":
    unittest.main()
