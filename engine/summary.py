"""Daily market brief: numbers + plain-language headlines, built from what the other steps wrote.

Runs last in engine.run_daily. One row per trading day in daily_brief, so earlier briefs stay browsable.
Rule-based on purpose: every sentence traces to a number on the dashboard.
"""
import json
import sqlite3


def _rows(conn, sql, *args):
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, args).fetchall()]
    finally:
        conn.row_factory = None


def _pct(x, d=2):
    return f"{'+' if x > 0 else ''}{x:.{d}f}%"


def _cr(x):
    return f"{'+' if x > 0 else '−' if x < 0 else ''}₹{abs(round(x)):,} Cr"


def _series(conn, grp):
    return _rows(conn, """
        WITH r AS (SELECT symbol, name, date, close, sort_order,
                          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) rn
                   FROM market_series WHERE grp = ?)
        SELECT a.symbol, a.name, a.date, a.close, 100.0 * (a.close - b.close) / b.close AS chg
        FROM r a JOIN r b ON a.symbol = b.symbol AND b.rn = 2
        WHERE a.rn = 1 ORDER BY a.sort_order""", grp)


def build(conn) -> dict:
    stocks = _rows(conn, """
        SELECT s.symbol, i.name, i.sector, s.date, s.close, 100 * s.chg_1d AS chg, s.trend, s.volx,
               s.close > s.dma50 AS above50, s.close > s.dma200 AS above200, s.breakdown
        FROM stock_state s JOIN instruments i USING (symbol) WHERE s.chg_1d IS NOT NULL AND i.in_index = 1""")
    if not stocks:
        raise RuntimeError("No stock_state rows. Run the signals step first.")
    date = max(s["date"] for s in stocks)
    stocks = [s for s in stocks if s["date"] == date]  # ignore stale/suspended names
    n = len(stocks)

    adv = sum(s["chg"] > 0 for s in stocks)
    dec = sum(s["chg"] < 0 for s in stocks)
    breadth = {
        "advances": adv, "declines": dec, "unchanged": n - adv - dec, "total": n,
        "pct_above_50dma": round(100 * sum(bool(s["above50"]) for s in stocks) / n, 1),
        "pct_above_200dma": round(100 * sum(bool(s["above200"]) for s in stocks) / n, 1),
        "trend": {t: sum(s["trend"] == t for s in stocks) for t in ("up", "sideways", "down")},
    }

    by_sector: dict[str, list[float]] = {}
    for s in stocks:
        if s["sector"]:
            by_sector.setdefault(s["sector"], []).append(s["chg"])
    sectors = sorted(
        ({"sector": k, "chg": round(sum(v) / len(v), 2), "n": len(v)} for k, v in by_sector.items() if len(v) >= 3),
        key=lambda x: -x["chg"],
    )

    def pick(rows, key, k=5, reverse=True):
        return [
            {"symbol": r["symbol"], "name": r["name"], "chg": round(r["chg"], 2), "volx": r["volx"] and round(r["volx"], 1)}
            for r in sorted(rows, key=lambda r: r[key] or 0, reverse=reverse)[:k]
        ]

    india, glob = _series(conn, "india"), _series(conn, "global")
    flows = _rows(conn, "SELECT date, fii_net, dii_net FROM fii_dii_daily ORDER BY date DESC LIMIT 5")
    setups = _rows(conn, """SELECT pattern, side, COUNT(*) n FROM signals JOIN instruments i USING (symbol)
        WHERE date = ? AND i.in_index = 1 GROUP BY pattern, side ORDER BY side, pattern""", date)

    data = {
        "date": date,
        "indices": [{"name": x["name"], "close": x["close"], "chg": round(x["chg"], 2)} for x in india],
        "global": [{"name": x["name"], "close": x["close"], "chg": round(x["chg"], 2), "date": x["date"]} for x in glob],
        "breadth": breadth,
        "flows": flows,
        "sectors_top": sectors[:3],
        "sectors_bottom": sectors[-3:][::-1],
        "gainers": pick(stocks, "chg"),
        "losers": pick(stocks, "chg", reverse=False),
        "volume": pick([s for s in stocks if s["volx"]], "volx"),
        "setups": {r["pattern"]: r["n"] for r in setups},
        "setups_by_side": {side: sum(r["n"] for r in setups if r["side"] == side) for side in ("long", "short")},
        "breakdowns": sum(bool(s["breakdown"]) for s in stocks),
    }
    data["headlines"] = headlines(data)
    data["hero"] = hero(data)
    data["lines"] = brief_lines(data)
    return data


# ---- Today page: hero headline + paragraph, and five tagged brief lines -------------------------------


def _fii_phrase(flows) -> str | None:
    """'Foreign money kept coming in' / 'Foreign investors kept selling' / single-day variants."""
    if not flows or flows[0]["fii_net"] is None:
        return None
    today = flows[0]["fii_net"]
    prev = flows[1]["fii_net"] if len(flows) > 1 else None
    same = prev is not None and (prev > 0) == (today > 0)
    if today > 0:
        return "Foreign money kept coming in" if same else "Foreign investors turned buyers"
    return "Foreign investors kept selling" if same else "Foreign investors turned sellers"


def hero(d: dict) -> dict:
    idx = {i["name"]: i for i in d["indices"]}
    nifty = idx.get("Nifty 50")
    up_day = bool(nifty and nifty["chg"] > 0)

    first = _fii_phrase(d["flows"])
    if first is None and nifty:
        first = f"Nifty {'rose' if up_day else 'fell'} {abs(nifty['chg']):.2f}%"
    second = None
    if up_day and d["sectors_top"] and d["sectors_top"][0]["chg"] > 0:
        second = f"{d['sectors_top'][0]['sector']} led the way"
    elif not up_day and d["sectors_bottom"] and d["sectors_bottom"][0]["chg"] < 0:
        second = f"{d['sectors_bottom'][0]['sector']} fell the most"
    headline = (f"{first}, and {second}." if first and second else f"{first or second or 'A quiet day'}.")

    parts = []
    if d["flows"] and d["flows"][0]["fii_net"] is not None:
        parts.append(_flows_sentence(d["flows"][0]))
    b = d["breadth"]
    p50 = b["pct_above_50dma"]
    if up_day and p50 < 60:
        parts.append(f"Only {p50:.1f}% of stocks are above their 50-day average, so the rise is not broad yet.")
    elif up_day:
        parts.append(f"{p50:.1f}% of stocks are above their 50-day average, so the rise is broad.")
    elif p50 < 40:
        parts.append(f"Only {p50:.1f}% of stocks are above their 50-day average, so the market is weak underneath.")
    else:
        parts.append(f"{p50:.1f}% of stocks are still above their 50-day average.")
    return {"headline": headline, "text": " ".join(parts)}


def _flows_sentence(f) -> str:
    fii, dii = f["fii_net"], f["dii_net"]
    a = f"Foreign investors {'bought' if fii > 0 else 'sold'} a net ₹{abs(round(fii)):,} Cr"
    if dii is None:
        return a + "."
    return a + f" and Indian funds {'added' if dii > 0 else 'took out'} ₹{abs(round(dii)):,} Cr."


def brief_lines(d: dict) -> list[dict]:
    """Five lines for Today's brief: sectors, flows, breadth, world, setups. tone: up | flat | down."""
    out = []

    def line(text, x=0.0):
        out.append({"tone": "up" if x > 0 else "down" if x < 0 else "flat", "text": text})

    top, bot = d["sectors_top"], d["sectors_bottom"]
    if top and top[0]["chg"] > 0:
        t = f"{top[0]['sector']} led the sectors, up {top[0]['chg']:.2f}%"
        if len(top) > 1 and top[1]["chg"] > 0:
            t += f", followed by {top[1]['sector']} at {top[1]['chg']:.2f}%"
        line(t + ".", 1)
    elif bot:
        line(f"{bot[0]['sector']} fell the most, down {abs(bot[0]['chg']):.2f}%.", -1)

    if d["flows"] and d["flows"][0]["fii_net"] is not None:
        line(_flows_sentence(d["flows"][0]), d["flows"][0]["fii_net"])
    else:
        line("Foreign and Indian fund flows are not available for today.")

    b = d["breadth"]
    p50, p200 = b["pct_above_50dma"], b["pct_above_200dma"]
    line(f"{p50:.1f}% of stocks are above their 50-day average and {p200:.1f}% are above their 200-day.",
         1 if p50 >= 60 else -1 if p50 <= 40 else 0)

    g = {x["name"]: x for x in d["global"]}
    us = max((g[k] for k in ("Nasdaq", "S&P 500") if k in g), key=lambda x: abs(x["chg"]), default=None)
    parts = []
    if us:
        verb = "rose" if us["chg"] > 0 else "fell" if us["chg"] < 0 else "was flat"
        parts.append(f"{us['name']} {verb} {abs(us['chg']):.2f}% overnight" if us["chg"] else f"{us['name']} was flat overnight")
    fx = g.get("USD/INR")
    if fx and fx["chg"]:
        parts.append(f"USD/INR {'rose' if fx['chg'] > 0 else 'slipped'} {abs(fx['chg']):.2f}% to {fx['close']:.2f}")
    if parts:
        line(" and ".join(parts) + ".", us["chg"] if us else 0)

    names = {"breakout": ("breakout", "breakouts"), "volume_spike": ("volume spike", "volume spikes"),
             "support_bounce": ("support bounce", "support bounces")}
    n = sum(d["setups"].values())
    if n:
        bits = [f"{c} {names[p][0] if c == 1 else names[p][1]}" for p, c in d["setups"].items() if p in names and c]
        joined = bits[0] if len(bits) == 1 else ", ".join(bits[:-1]) + " and " + bits[-1]
        line(f"{n} setup{'s' if n != 1 else ''} today: {joined}.")
    else:
        line("No setups today.")
    return out


def headlines(d: dict) -> list[dict]:
    """[{tone: up|down|flat, text}] in reading order."""
    out = []

    def say(text, x=0.0):
        out.append({"tone": "up" if x > 0 else "down" if x < 0 else "flat", "text": text})

    idx = {i["name"]: i for i in d["indices"]}
    nifty = idx.get("Nifty 50")
    if nifty:
        verb = "rose" if nifty["chg"] > 0 else "fell" if nifty["chg"] < 0 else "was flat"
        extra = ", ".join(f"{k} {_pct(idx[k]['chg'])}" for k in ("Sensex", "Bank Nifty") if k in idx)
        say(f"Nifty 50 {verb} {abs(nifty['chg']):.2f}% to {nifty['close']:,.0f}" + (f" ({extra})." if extra else "."),
            nifty["chg"])

    b = d["breadth"]
    share = b["advances"] / max(b["advances"] + b["declines"], 1)
    if nifty and nifty["chg"] > 0.2 and share < 0.45:
        say(f"Narrow move: the index rose but only {b['advances']} of {b['total']} stocks did.", -1)
    elif nifty and nifty["chg"] < -0.2 and share > 0.55:
        say(f"Index fell but most stocks rose ({b['advances']} of {b['total']}): selling was concentrated in heavyweights.", 1)
    elif share >= 0.65:
        say(f"Broad-based buying: {b['advances']} of {b['total']} Nifty 500 stocks rose.", 1)
    elif share <= 0.35:
        say(f"Broad-based selling: {b['declines']} of {b['total']} Nifty 500 stocks fell.", -1)
    else:
        say(f"Mixed breadth: {b['advances']} stocks rose, {b['declines']} fell.")

    if d["flows"]:
        f = d["flows"][0]
        if f["fii_net"] is not None:
            role = "buyers" if f["fii_net"] > 0 else "sellers"
            text = f"FIIs were net {role} at {_cr(f['fii_net'])}"
            if f["dii_net"] is not None:
                text += f"; DIIs {_cr(f['dii_net'])}"
            if len(d["flows"]) >= 3:
                tot = sum(x["fii_net"] or 0 for x in d["flows"])
                text += f". FII total over the last {len(d['flows'])} days: {_cr(tot)}"
            say(text + ".", f["fii_net"])

    vix = idx.get("India VIX")
    if vix and (vix["chg"] >= 5 or vix["close"] >= 20):
        say(f"Volatility {'up' if vix['chg'] > 0 else 'high'}: India VIX {_pct(vix['chg'])} to {vix['close']:.1f}.", -1)

    g = {x["name"]: x for x in d["global"]}
    us = [g[k] for k in ("S&P 500", "Nasdaq") if k in g]
    if us:
        avg = sum(x["chg"] for x in us) / len(us)
        detail = ", ".join(f"{x['name']} {_pct(x['chg'])}" for x in us)
        if abs(avg) >= 0.75:
            say(f"US markets {'rallied' if avg > 0 else 'fell'} in their last session ({detail}): "
                f"a {'positive' if avg > 0 else 'negative'} cue for the next open.", avg)
        else:
            say(f"US markets were quiet ({detail}).")
    for name, label, th in (("Brent crude", "Crude oil", 2.0), ("USD/INR", "The rupee", 0.4)):
        x = g.get(name)
        if x and abs(x["chg"]) >= th:
            if name == "USD/INR":  # USD/INR up = rupee weaker
                say(f"The rupee {'weakened' if x['chg'] > 0 else 'strengthened'}: USD/INR {x['close']:.2f} ({_pct(x['chg'])}).", -x["chg"])
            else:
                say(f"{label} moved {_pct(x['chg'])} to {x['close']:.1f}; watch oil-sensitive sectors.",
                    -x["chg"])  # costlier oil is a headwind for India

    if d["sectors_top"]:
        top = ", ".join(f"{s['sector']} {_pct(s['chg'], 1)}" for s in d["sectors_top"])
        bot = ", ".join(f"{s['sector']} {_pct(s['chg'], 1)}" for s in d["sectors_bottom"])
        say(f"Strongest sectors: {top}. Weakest: {bot}.")

    t = b["trend"]
    say(f"Trend health: {t['up']} stocks in uptrends, {t['down']} in downtrends; "
        f"{b['pct_above_200dma']:.0f}% trade above their 200-day average.",
        1 if b["pct_above_200dma"] >= 60 else -1 if b["pct_above_200dma"] <= 40 else 0)

    sides = d.get("setups_by_side") or {"long": sum(d["setups"].values()), "short": 0}
    if sides["long"] or sides["short"]:
        say(f"{sides['long']} long setups and {sides['short']} short setups on today's close.")
    return out


def run(conn) -> str:
    data = build(conn)
    with conn:
        conn.execute("INSERT OR REPLACE INTO daily_brief (date, data) VALUES (?, ?)", (data["date"], json.dumps(data)))
    return f"brief for {data['date']}: {data['headlines'][0]['text'] if data['headlines'] else 'no headlines'}"
