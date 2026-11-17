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


class Oscillators(unittest.TestCase):
    def test_rsi_extremes(self):
        self.assertAlmostEqual(state.indicators(frame(np.linspace(100, 200, 60)))["rsi14"].iloc[-1], 100.0)
        self.assertAlmostEqual(state.indicators(frame(np.linspace(200, 100, 60)))["rsi14"].iloc[-1], 0.0)

    def test_rsi_matches_wilder_loop(self):
        rng = np.random.default_rng(11)
        c = 100 + np.cumsum(rng.normal(0, 1, 80))
        d = np.diff(c)
        g, l = np.clip(d, 0, None), np.clip(-d, 0, None)
        ag, al = g[:14].mean(), l[:14].mean()  # textbook seed = simple average of first 14
        for i in range(14, len(d)):
            ag, al = (ag * 13 + g[i]) / 14, (al * 13 + l[i]) / 14
        ref = 100 - 100 / (1 + ag / al)
        # pandas ewm seeds with the first value, not a 14-bar average; after 80 bars the gap is tiny
        self.assertAlmostEqual(state.indicators(frame(c))["rsi14"].iloc[-1], ref, delta=1.0)

    def test_macd_and_bands_on_flat_price(self):
        ind = state.indicators(frame([100.0] * 60))
        self.assertAlmostEqual(ind["macd"].iloc[-1], 0.0)
        self.assertAlmostEqual(ind["macd_hist"].iloc[-1], 0.0)
        self.assertAlmostEqual(ind["bb_up"].iloc[-1], 100.0)
        self.assertAlmostEqual(ind["bb_low"].iloc[-1], 100.0)

    def test_macd_positive_in_uptrend(self):
        ind = state.indicators(frame(np.linspace(100, 200, 80)))
        self.assertGreater(ind["macd"].iloc[-1], 0)


class Levels(unittest.TestCase):
    def test_nearest_confirmed_swing_levels(self):
        # V-shape low at 90 (bar 20), peak at 130 (bar 45), then price at 110
        c = np.r_[np.linspace(100, 90, 21), np.linspace(91, 130, 25), np.linspace(129, 110, 20)]
        df = frame(c)
        sup, res = state.levels(df)
        self.assertAlmostEqual(sup, df["low"].iloc[20])
        self.assertAlmostEqual(res, df["high"].iloc[45])

    def test_unconfirmed_pivot_ignored(self):
        # lowest bar is the second to last one: not confirmed yet (needs 5 bars after)
        c = np.r_[np.linspace(100, 120, 40), [80.0, 85.0]]
        sup, _ = state.levels(frame(c))
        self.assertTrue(sup is None or sup > 80)


class NoLookahead(unittest.TestCase):
    def test_prefix_values_unchanged_by_future_bars(self):
        rng = np.random.default_rng(3)
        df = frame(100 * np.exp(np.cumsum(rng.normal(0, 0.02, 400))), rng.lognormal(8, 0.5, 400))
        full = state.indicators(df)
        part = state.indicators(df.iloc[:300])
        pd.testing.assert_frame_equal(full.iloc[:300], part)


if __name__ == "__main__":
    unittest.main()
