"""Turn signals into simulated trades and summarise them.

Execution model (deliberately conservative):
- Enter at the open of the bar after the signal. Skip if that open is already past stop or target.
- Each later bar: a gap through stop/target fills at the open; otherwise stop/target fill at their price.
  If one bar touches both, assume the stop hit first.
- Exit at the close after MAX_HOLD bars. A trade still running when data ends is 'open'.
- COST_PCT per side covers brokerage, STT and exchange charges (approx, delivery).
- One trade at a time per stock per pattern: signals while a trade is live are ignored.
"""
from dataclasses import dataclass

import numpy as np

from engine.signals.patterns import Signal

MAX_HOLD = 20
COST_PCT = 0.1


@dataclass
class Trade:
    pattern: str
    signal_date: str
    entry_date: str
    entry: float
    stop: float
    target: float
    exit_date: str
    exit: float
    outcome: str  # target | stop | time | open
    r: float      # result in multiples of initial risk, after costs
    ret_pct: float
    bars: int
    exit_i: int


def simulate(sig: Signal, o, h, l, c, dates) -> Trade | None:
    n = len(c)
    e = sig.i + 1
    if e >= n:
        return None  # signal on the latest bar: not entered yet
    entry = o[e]
    if not (sig.stop < entry < sig.target):
        return None  # gapped past a level; no trade
    stop, target = sig.stop, sig.target

    last = min(e + MAX_HOLD, n) - 1
    outcome, px, j = None, None, e
    for j in range(e, last + 1):
        if o[j] <= stop:
            outcome, px = "stop", o[j]
        elif l[j] <= stop:
            outcome, px = "stop", stop
        elif o[j] >= target:
            outcome, px = "target", o[j]
        elif h[j] >= target:
            outcome, px = "target", target
        if outcome:
            break
    if not outcome:
        outcome = "time" if last == e + MAX_HOLD - 1 else "open"
        px = c[j]

    k = COST_PCT / 100
    net = px * (1 - k) - entry * (1 + k)
    return Trade(
        pattern=sig.pattern, signal_date=sig.date, entry_date=dates[e],
        entry=round(entry, 2), stop=stop, target=target,
        exit_date=dates[j], exit=round(px, 2), outcome=outcome,
        r=round(net / (entry - stop), 3), ret_pct=round(net / entry * 100, 3),
        bars=j - e + 1, exit_i=j,
    )


def run_symbol(signals: list[Signal], o, h, l, c, dates) -> list[Trade]:
    trades: list[Trade] = []
    busy_until: dict[str, int] = {}
    for s in signals:  # signals are in date order
        if s.i < busy_until.get(s.pattern, -1):
            continue
        t = simulate(s, o, h, l, c, dates)
        if t:
            trades.append(t)
            busy_until[s.pattern] = t.exit_i
    return trades


def stats(trades: list[Trade]) -> dict:
    """Summary over closed trades (open ones excluded)."""
    closed = sorted((t for t in trades if t.outcome != "open"), key=lambda t: t.exit_date)
    if not closed:
        return {"trades": 0}
    r = np.array([t.r for t in closed])
    wins, losses = r[r > 0], r[r <= 0]
    curve = np.cumsum(r)
    drawdown = np.max(np.maximum.accumulate(np.r_[0, curve])[1:] - curve)
    return {
        "trades": len(closed),
        "win_rate": round(len(wins) / len(r) * 100, 1),
        "avg_r": round(float(r.mean()), 3),
        "avg_ret_pct": round(float(np.mean([t.ret_pct for t in closed])), 2),
        "profit_factor": round(float(wins.sum() / -losses.sum()), 2) if losses.sum() < 0 else None,
        "avg_bars": round(float(np.mean([t.bars for t in closed])), 1),
        "max_dd_r": round(float(drawdown), 1),
        "total_r": round(float(curve[-1]), 1),
    }
