# Dalal

Personal dashboard for the Indian market: prices, FII/DII flows, global cues, a stock screener and candlestick charts.
Built for one user, run locally. Python engine writes to one SQLite file; Next.js reads it.

```
engine/   Python: fetches data, writes data/market.db
web/      Next.js: read-only dashboard over data/market.db
data/     market.db lives here (gitignored)
```

## Run it

```bash
# 1. engine (from repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r engine/requirements.txt
python -m engine.run_daily --backfill      # first run: ~2 years of history

# 2. web
cd web && npm install && npm run dev       # http://localhost:3000
```

## Keep it fresh

NSE publishes FII/DII flows in the evening. Run the engine once a day after that, e.g. weekdays 6:30 pm:

```
30 18 * * 1-5  cd /path/to/dalal && .venv/bin/python -m engine.run_daily >> data/engine.log 2>&1
```

Each step logs to the `ingest_log` table. If one fails, the dashboard header shows which.

## Things to know

- **FII/DII history builds one day per run.** NSE's endpoint only returns the latest day, so run the engine daily from the start.
- **NSE blocks scripts sometimes.** If the Nifty 500 list download fails, save the constituents CSV as `data/nifty500.csv` and re-run.
- **Prices come from Yahoo (yfinance)**: free, end-of-day, occasionally gappy. Fine for now; swap for a broker API later.
- **Gift Nifty isn't included**; Yahoo doesn't carry it reliably.
- Not investment advice. Backtest any signal before acting on it.

## Next phases

2. Pattern engine (breakouts, volume spikes, support/resistance) with entry/stop/target, plus a backtester
3. News layer: LLM turns headlines and filings into affected sectors/stocks
4. IPO desk: GMP, subscription (QIB / bNII / sNII / retail), valuation
5. Results/fundamentals scoring, PCR / OI, Telegram alerts
