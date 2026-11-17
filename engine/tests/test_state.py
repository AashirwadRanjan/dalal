import unittest

import numpy as np
import pandas as pd

from engine.signals import state


def frame(close, volume=None):
    close = np.asarray(close, float)
    n = len(close)
    idx = pd.date_range("2024-01-01", periods=n).strftime("%Y-%m-%d")
    return pd.DataFrame(
        {"open": close, "high": close * 1.01, "low": close * 0.99, "close": close,
         "volume": np.full(n, 1000.0) if volume is None else np.asarray(volume, float)},
        index=idx,
    )


class Trend(unittest.TestCase):
    def test_steady_rise_is_uptrend(self):
        ind = state.indicators(frame(np.linspace(100, 300, 300)))
        self.assertEqual(ind["trend"].iloc[-1], "up")

    def test_steady_fall_is_downtrend(self):
        ind = state.indicators(frame(np.linspace(300, 100, 300)))
        self.assertEqual(ind["trend"].iloc[-1], "down")

    def test_unknown_before_200_bars(self):
        ind = state.indicators(frame(np.linspace(100, 200, 150)))
        self.assertTrue((ind["trend"] == "unknown").all())

    def test_returns(self):
        ind = state.indicators(frame(np.linspace(100, 300, 300)))
        c = ind["close"].to_numpy()
        self.assertAlmostEqual(ind["ret_1m"].iloc[-1], c[-1] / c[-22] - 1)
        self.assertAlmostEqual(ind["chg_1d"].iloc[-1], c[-1] / c[-2] - 1)


class TrailingStop(unittest.TestCase):
    def test_is_22_bar_high_minus_3_atr(self):
        df = frame(np.linspace(100, 200, 100))
        ind = state.indicators(df)
        hi = df["high"].iloc[-22:].max()
        self.assertAlmostEqual(ind["trail_stop"].iloc[-1], hi - 3 * ind["atr"].iloc[-1])


class Breakdown(unittest.TestCase):
    def test_first_close_below_20_day_low_on_volume(self):
        close = [100.0] * 60 + [90.0]
        vol = [1000.0] * 60 + [3000.0]
        ind = state.indicators(frame(close, vol))
        self.assertTrue(ind["breakdown"].iloc[-1])
        self.assertFalse(ind["breakdown"].iloc[:-1].any())

    def test_needs_volume(self):
        ind = state.indicators(frame([100.0] * 60 + [90.0]))
        self.assertFalse(ind["breakdown"].iloc[-1])


class NoLookahead(unittest.TestCase):
    def test_prefix_values_unchanged_by_future_bars(self):
        rng = np.random.default_rng(3)
        df = frame(100 * np.exp(np.cumsum(rng.normal(0, 0.02, 400))), rng.lognormal(8, 0.5, 400))
        full = state.indicators(df)
        part = state.indicators(df.iloc[:300])
        pd.testing.assert_frame_equal(full.iloc[:300], part)


if __name__ == "__main__":
    unittest.main()
