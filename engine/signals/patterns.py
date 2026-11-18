"""Pattern detectors over one stock's daily bars.

Rules every detector follows:
- Uses only bars up to and including the signal bar (no lookahead), so the backtest is honest.
  Swing highs/lows count only once confirmed, PIVOT_N bars after the fact.
- Long setups and their mirror-image short setups. A positional short in India needs stock futures or puts
  (F&O stocks only); cash shares can be shorted intraday only. The engine tests shorts on every stock, and the
  web app marks which ones are actually shortable.
- `entry` is the signal bar's close (a reference). The backtest enters at the next bar's open.
"""
from dataclasses import dataclass

import numpy as np
import pandas as pd

LOOKBACK = 20            # breakout channel and volume average, in bars
ATR_N = 14
VOL_MULT_BREAKOUT = 1.5  # breakout needs volume >= 1.5x its 20-day average
VOL_MULT_SPIKE = 3.0
PIVOT_N = 5              # a swing low/high needs PIVOT_N lower/higher bars on each side
SUPPORT_WINDOW = 120     # look back this far for support/resistance pivots
REWARD_R = 2.0           # default target = entry + 2 x risk
MIN_RR = 1.5             # support bounce: skip if resistance is closer than 1.5 x risk
MIN_HISTORY = 60

LONG_PATTERNS = ("breakout", "volume_spike", "support_bounce")
SHORT_PATTERNS = ("breakdown", "selling_spike", "resistance_reject")
PATTERNS = LONG_PATTERNS + SHORT_PATTERNS
SIDE = {**{p: "long" for p in LONG_PATTERNS}, **{p: "short" for p in SHORT_PATTERNS}}


@dataclass
class Signal:
    i: int          # bar index in the frame passed to detect()
    date: str
    pattern: str
    entry: float
    stop: float
    target: float
    detail: str

    @property
    def side(self) -> str:
        return SIDE[self.pattern]


def _pivots(x: np.ndarray, kind: str) -> np.ndarray:
    """Indices i where x[i] is the min (or max) of x[i-N .. i+N]."""
    s = pd.Series(x)
    w = s.rolling(2 * PIVOT_N + 1, center=True)
    ext = w.min() if kind == "low" else w.max()
    return np.flatnonzero((s == ext).to_numpy())


def detect(df: pd.DataFrame) -> list[Signal]:
    """df: columns open, high, low, close, volume; index = 'YYYY-MM-DD' strings, ascending."""
    n = len(df)
    if n < MIN_HISTORY:
        return []

    o, h, l, c = (df[k].to_numpy(float) for k in ("open", "high", "low", "close"))
    v = df["volume"].to_numpy(float)
    dates = df.index.to_list()

    prev_c = np.r_[np.nan, c[:-1]]
    tr = np.nanmax(np.vstack([h - l, np.abs(h - prev_c), np.abs(l - prev_c)]), axis=0)
    atr = pd.Series(tr).rolling(ATR_N).mean().to_numpy()
    hh = pd.Series(h).shift(1).rolling(LOOKBACK).max().to_numpy()       # prior 20-bar high
    ll = pd.Series(l).shift(1).rolling(LOOKBACK).min().to_numpy()       # prior 20-bar low
    avg_v = pd.Series(v).shift(1).rolling(LOOKBACK).mean().to_numpy()
    volx = np.divide(v, avg_v, out=np.full(n, np.nan), where=avg_v > 0)

    piv_lo, piv_hi = _pivots(l, "low"), _pivots(h, "high")

    out: list[Signal] = []

    def add(t, pattern, stop, target, detail):
        out.append(Signal(t, dates[t], pattern, round(c[t], 2), round(stop, 2), round(target, 2), detail))

    for t in range(MIN_HISTORY, n):
        a = atr[t]
        if not np.isfinite(a) or a <= 0:
            continue

        # 1. Breakout: first close above the prior 20-day high, on volume
        if c[t] > hh[t] and c[t - 1] <= hh[t - 1] and volx[t] >= VOL_MULT_BREAKOUT:
            stop = hh[t] - a  # back inside the range = failed breakout
            add(t, "breakout", stop, c[t] + REWARD_R * (c[t] - stop),
                f"Closed above 20-day high {hh[t]:.2f} on {volx[t]:.1f}x volume")

        # 2. Volume spike: heavy buying, closes near the high
        rng = h[t] - l[t]
        if volx[t] >= VOL_MULT_SPIKE and c[t] > o[t] and rng > 0 and (c[t] - l[t]) / rng >= 2 / 3:
            stop = min(l[t], c[t] - a)
            add(t, "volume_spike", stop, c[t] + REWARD_R * (c[t] - stop),
                f"{volx[t]:.1f}x average volume, closed in top third of range")

        # 3. Support bounce: tags a confirmed swing low and closes bullish above it
        lo_idx = piv_lo[(piv_lo >= t - SUPPORT_WINDOW) & (piv_lo <= t - PIVOT_N)]
        supports = l[lo_idx]
        supports = supports[supports < c[t]]
        if supports.size and c[t] > o[t]:
            sup = supports.max()  # nearest support below price
            if l[t] <= sup + 0.5 * a and l[t - 1] > sup + 0.5 * a:  # first touch, not a drift along it
                stop = sup - 0.5 * a
                risk = c[t] - stop
                hi_idx = piv_hi[(piv_hi >= t - SUPPORT_WINDOW) & (piv_hi <= t - PIVOT_N)]
                res = h[hi_idx]
                res = res[res > c[t]]
                target = res.min() if res.size else c[t] + REWARD_R * risk
                if risk > 0 and (target - c[t]) / risk >= MIN_RR:
                    add(t, "support_bounce", stop, target,
                        f"Bounced off support {sup:.2f}"
                        + (f", resistance {target:.2f}" if res.size else ""))

        # ---- short side: the same three rules, mirrored ----

        # 4. Breakdown: first close below the prior 20-day low, on volume
        if c[t] < ll[t] and c[t - 1] >= ll[t - 1] and volx[t] >= VOL_MULT_BREAKOUT:
            stop = ll[t] + a  # back inside the range = failed breakdown
            add(t, "breakdown", stop, c[t] - REWARD_R * (stop - c[t]),
                f"Closed below 20-day low {ll[t]:.2f} on {volx[t]:.1f}x volume")

        # 5. Selling spike: heavy selling, closes near the low
        if volx[t] >= VOL_MULT_SPIKE and c[t] < o[t] and rng > 0 and (h[t] - c[t]) / rng >= 2 / 3:
            stop = max(h[t], c[t] + a)
            add(t, "selling_spike", stop, c[t] - REWARD_R * (stop - c[t]),
                f"{volx[t]:.1f}x average volume, closed in bottom third of range")

        # 6. Resistance rejection: tags a confirmed swing high and closes bearish below it
        hi_idx = piv_hi[(piv_hi >= t - SUPPORT_WINDOW) & (piv_hi <= t - PIVOT_N)]
        resist = h[hi_idx]
        resist = resist[resist > c[t]]
        if resist.size and c[t] < o[t]:
            res_ = resist.min()  # nearest resistance above price
            if h[t] >= res_ - 0.5 * a and h[t - 1] < res_ - 0.5 * a:
                stop = res_ + 0.5 * a
                risk = stop - c[t]
                lo_idx = piv_lo[(piv_lo >= t - SUPPORT_WINDOW) & (piv_lo <= t - PIVOT_N)]
                sup_ = l[lo_idx]
                sup_ = sup_[sup_ < c[t]]
                target = sup_.max() if sup_.size else c[t] - REWARD_R * risk
                if risk > 0 and (c[t] - target) / risk >= MIN_RR:
                    add(t, "resistance_reject", stop, target,
                        f"Turned down at resistance {res_:.2f}"
                        + (f", support {target:.2f}" if sup_.size else ""))
    return out
