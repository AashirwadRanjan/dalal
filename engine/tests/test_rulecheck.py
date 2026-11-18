"""Learning from losses: a filter is a lead only if it helps in training and later."""
import unittest

from engine.signals import backtest, rulecheck


def trade(date, r, pattern="breakout"):
    return backtest.Trade(pattern, date, date, 100, 95, 110, date, 100, "stop" if r < 0 else "target", r, r, 5, 0)


def feats(volx):
    return {"sgn": 1, "trend": "up", "market_up": True, "vs200": 1.0, "ret6m": 0.1, "volx": volx, "rsi": 50,
            "risk_pct": 5, "gap_atr": 0}


class RuleCheck(unittest.TestCase):
    def test_filter_that_helps_in_both_periods_is_a_lead(self):
        tagged = []
        for d in ("2020-01-01", "2026-03-01"):
            tagged += [(trade(d, 0.5), feats(3))] * 120 + [(trade(d, -0.5), feats(1))] * 120
        f = rulecheck.run(tagged)["breakout"]["filters"]["big_volume"]
        self.assertTrue(f["promising"])
        self.assertAlmostEqual(f["gain_train"], 0.5)

    def test_filter_that_only_helps_in_training_is_not(self):
        tagged = [(trade("2020-01-01", 0.5), feats(3))] * 120 + [(trade("2020-01-01", -0.5), feats(1))] * 120
        tagged += [(trade("2026-03-01", -0.5), feats(3))] * 120 + [(trade("2026-03-01", 0.5), feats(1))] * 120
        self.assertFalse(rulecheck.run(tagged)["breakout"]["filters"]["big_volume"]["promising"])


if __name__ == "__main__":
    unittest.main()
