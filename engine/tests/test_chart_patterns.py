"""Chart patterns: geometry, completion bar, no lookahead, directional stats."""
import unittest

import numpy as np
import pandas as pd

from engine.signals import chart_patterns as cp


def frame(closes, opens=None, spread=0.5):
    c = np.array(closes, float)
    o = np.r_[c[0], c[:-1]] if opens is None else np.array(opens, float)
    idx = [str(d.date()) for d in pd.bdate_range("2024-01-01", periods=len(c))]
    return pd.DataFrame({"open": o, "high": np.maximum(o, c) + spread, "low": np.minimum(o, c) - spread,
                         "close": c, "volume": 1000.0}, index=idx)


def w_shape():
    """Fall to 90, bounce to 100, back to 90, then rally through 100: a double bottom."""
    down = list(np.linspace(110, 90, 20))
    up = list(np.linspace(91, 100, 10))
    down2 = list(np.linspace(99, 90.5, 10))
    rally = list(np.linspace(91.5, 99.5, 10)) + [101.5, 103]
    return [110] * 30 + down + up + down2 + rally


class ChartPatterns(unittest.TestCase):
    def test_double_bottom_fires_on_the_neckline_break(self):
        df = frame(w_shape())
        ev = [e for e in cp.detect(df) if e.name == "double_bottom"]
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0].bias, "bullish")
        t = ev[0].i
        self.assertGreater(df["close"].iloc[t], 100)
        self.assertLessEqual(df["close"].iloc[t - 1], 100.5)

    def test_no_lookahead(self):
        base = w_shape()
        before = [e for e in cp.detect(frame(base)) if e.i < len(base)]
        after = [e for e in cp.detect(frame(base + [120, 80, 130, 70])) if e.i < len(base)]
        self.assertEqual(before, after)

    def test_bullish_engulfing_after_a_decline(self):
        closes = [100] * 60 + [99, 98, 97, 96, 95, 94, 96.5]
        opens = [100] * 60 + [100, 99, 98, 97, 96, 95, 93.5]
        ev = [e for e in cp.detect(frame(closes, opens)) if e.name == "bullish_engulfing"]
        self.assertEqual([e.i for e in ev], [66])

    def test_stats_are_directional_and_per_period(self):
        samples = [("double_top", "2024-01-01", -1.0), ("double_top", "2026-02-01", 0.0)]
        base = {"all": (1.0, 2), "train": (2.0, 2), "test": (0.0, 1)}
        s = cp.summarise(samples, base, "2025-12-31")["double_top"]
        self.assertEqual(s["train"]["edge_pct"], 2.0)   # did 2% worse than a +1% market: works for a bearish pattern
        self.assertEqual(s["test"]["edge_pct"], 0.0)
        self.assertFalse(s["reliable"])


if __name__ == "__main__":
    unittest.main()
