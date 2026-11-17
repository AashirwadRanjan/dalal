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


# ---- rigor: walk-forward split and per-year results ------------------------------------------------------

TRAIN_END = "2025-12-31"   # train: entries up to this date; test: entries after it
EDGE_R = 0.05              # a pattern "passes" training if it averages at least this per trade...
MIN_TRADES = 100           # ...over at least this many closed trades (same rule as the web app's lib/edge.ts)


def walk_forward(trades: list[Trade], train_end: str = TRAIN_END) -> dict:
    """Judge the pattern on the training window only, then report how it did afterwards.

    Nothing is fitted, so the split guards against one thing: trusting a pattern because of a lucky period.
    'selected' says whether the training window alone would have passed it.
    """
    train = [t for t in trades if t.entry_date <= train_end]
    test = [t for t in trades if t.entry_date > train_end]
    tr = stats(train)
    return {
        "train_end": train_end,
        "train": tr,
        "test": stats(test),
        "selected": tr.get("trades", 0) >= MIN_TRADES and tr.get("avg_r", -1) >= EDGE_R,
    }


def by_year(trades: list[Trade]) -> dict:
    """Closed-trade stats keyed by the calendar year of the exit."""
    years = sorted({t.exit_date[:4] for t in trades if t.outcome != "open"})
    return {y: stats([t for t in trades if t.exit_date[:4] == y]) for y in years}
