import unittest

import numpy as np
import pandas as pd

from engine.signals import timeframes


def daily(start, n):
    idx = pd.bdate_range(start, periods=n).strftime("%Y-%m-%d")
    c = np.arange(1, n + 1, dtype=float)
    return pd.DataFrame({"open": c, "high": c + 0.5, "low": c - 0.5, "close": c, "volume": np.full(n, 10.0)}, index=idx)


class Resample(unittest.TestCase):
    def test_weekly_ohlcv(self):
        w = timeframes.resample(daily("2026-11-02", 10), "W")  # Mon 2 Nov .. Fri 13 Nov
        self.assertEqual(list(w.index), ["2026-11-02", "2026-11-09"])
        first = w.iloc[0]
        self.assertEqual((first.open, first.high, first.low, first.close, first.volume), (1, 5.5, 0.5, 5, 50))

    def test_monthly_dated_by_first_trading_day(self):
        m = timeframes.resample(daily("2026-10-29", 6), "M")  # Thu 29 Oct .. Thu 5 Nov
        self.assertEqual(list(m.index), ["2026-10-29", "2026-11-02"])


class Completed(unittest.TestCase):
    def test_drops_week_in_progress(self):
        w = timeframes.resample(daily("2026-11-02", 7), "W")  # ends Tue 10 Nov
        self.assertEqual(len(timeframes.completed(w, "W", "2026-11-10")), 1)

    def test_keeps_week_ending_friday(self):
        w = timeframes.resample(daily("2026-11-02", 10), "W")  # ends Fri 13 Nov
        self.assertEqual(len(timeframes.completed(w, "W", "2026-11-13")), 2)

    def test_month_complete_on_last_weekday(self):
        self.assertTrue(timeframes.period_complete("2026-10-30", "M"))   # Fri, last weekday of Oct
        self.assertFalse(timeframes.period_complete("2026-11-17", "M"))


class Run(unittest.TestCase):
    def test_insufficient_history(self):
        df = daily("2026-01-05", 100).reset_index().rename(columns={"index": "date"})
        df["symbol"] = "X"
        status, stats, note = timeframes.run(df)
        monthly = [r for r in status if r[1] == "M"][0]
        self.assertEqual(monthly[2], "insufficient")
        self.assertIn("monthly: needs 60 bars", note)


if __name__ == "__main__":
    unittest.main()
