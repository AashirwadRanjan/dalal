"""Per-stock trend and momentum state from daily bars.

Shared by the backtest (trend at signal time), the daily brief, the outlook lists and
portfolio suggestions. Every column at bar t uses only bars <= t.
"""
import numpy as np
import pandas as pd

TRENDS = ("up", "sideways", "down", "unknown")


def indicators(df: pd.DataFrame) -> pd.DataFrame:
    """df: open, high, low, close, volume (ascending). Returns one row per bar."""
    c, h, l, v = df["close"], df["high"], df["low"], df["volume"]
    out = pd.DataFrame(index=df.index)
    out["close"] = c
    out["chg_1d"] = c / c.shift(1) - 1
    out["dma50"] = c.rolling(50).mean()
    out["dma200"] = c.rolling(200).mean()
    slope = out["dma50"] - out["dma50"].shift(10)

    prev = c.shift(1)
    tr = pd.concat([h - l, (h - prev).abs(), (l - prev).abs()], axis=1).max(axis=1)
    out["atr"] = tr.rolling(22).mean()
    # Chandelier trailing stop: highest high of the last 22 bars minus 3 ATR
    out["trail_stop"] = h.rolling(22).max() - 3 * out["atr"]

    up = (c > out["dma50"]) & (out["dma50"] > out["dma200"]) & (slope > 0)
    down = (c < out["dma50"]) & (out["dma50"] < out["dma200"]) & (slope < 0)
    out["trend"] = np.where(out["dma200"].isna(), "unknown", np.where(up, "up", np.where(down, "down", "sideways")))

    for name, n in (("ret_1m", 21), ("ret_3m", 63), ("ret_6m", 126)):
        out[name] = c / c.shift(n) - 1
    out["hi52"] = h.rolling(252, min_periods=120).max()
    out["lo52"] = l.rolling(252, min_periods=120).min()

    avg_v = v.shift(1).rolling(20).mean()
    out["volx"] = v / avg_v.where(avg_v > 0)
    # Breakdown: first close below the prior 20-day low, on volume
    low20 = l.shift(1).rolling(20).min()
    out["low20"] = low20
    out["breakdown"] = (c < low20) & (c.shift(1) >= low20.shift(1)) & (out["volx"] >= 1.5)
    return out
