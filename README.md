# Dalal

Personal research dashboard for the Indian market, for one person, run locally on end-of-day data.
A Python engine writes one SQLite file (`data/market.db`); a Next.js app reads it.
Personal research tool. Not investment advice.

```
engine/            Python: fetches data, computes everything, writes data/market.db
  ingest/          stock lists (Nifty 500, all NSE equities, F&O), daily prices, indices and world series,
                   FII/DII, FII/DII CSV import
  signals/         long and short setup detectors, backtester (walk-forward, per year, benchmark), trend and
                   indicator state, weekly/monthly setups, chart patterns, live record
  summary.py       daily brief: hero, five brief lines, headlines (rule-based, from the data)
  alerts.py        Telegram alert after the daily run: brief plus live-record events (optional)
web/               Next.js 16 app over data/market.db (dark design, IBM Plex)
scripts/           install-schedule.sh (launchd), test.sh
data/              market.db (~110 MB with 10 years), portfolio.db (holdings + watchlist), engine.log (gitignored)
```

## Pages

| Route | What it shows |
|---|---|
| `/` Today | Generated headline, indices, today's brief, setups preview, your watchlist, fund flows, breadth, sectors, outlook counts, world, reality check |
| `/setups` | Every long and short setup from the latest close, chart patterns next to each, filters and sort; CSV download |
| `/live` | Live record: setups logged the day they fire and followed forward (entered, +1R, target, stop) |
| `/outlook` | Leaders, pullbacks, uptrend setups, weak stocks, breakdowns, short setups on F&O stocks (`?tab=`) |
| `/portfolio` | Holdings, totals, "Rule says" Add / Hold / Review / Exit with the rule, add and paste import, CSV download |
| `/backtest` | Long and short results, variants, weekly/monthly bars, chart patterns, out-of-sample split, each year, benchmark |
| `/stock/[symbol]` | Overview (short and long term cards, Daily/Weekly/Monthly chart), Technicals (indicators, price ladder), News and events (`?tab=`), watchlist star |
| `/health` | Each engine step's last run, status and findings; sources that can break |
| `/brief` | Brief archive with a date picker |

## Run it

```bash
# 1. engine (from repo root)
python3 -m venv .venv && source .venv/bin/activate
pip install -r engine/requirements.txt
python -m engine.run_daily --backfill      # first run: 10 years of history, a few minutes

# 2. web (listens on 127.0.0.1 only)
cd web && npm install && npm run dev       # http://127.0.0.1:3000

# 3. daily updates (macOS, from repo root)
scripts/install-schedule.sh                # weekdays 18:45, macOS notification; remove with --remove
```

The **Fetch latest** button in the header runs the same engine on demand (about 20 s).

### Optional

- **Telegram alert:** copy `.env.example` to `.env`, fill `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The scheduled run then
  sends the brief, any failed steps, and live-record events (new, entered, +1R, target, stop, time) for stocks you hold
  or watch plus weekly breakouts and volume spikes. Each event is sent once. Without it, the macOS notification is the
  only alert.
- **Any NSE stock:** search covers every NSE equity. Star one or add it to your holdings and the next run fetches 10
  years of its prices and runs every rule on it. Screens, the brief and backtest stats stay on the Nifty 500.
- **FII/DII history:** NSE only returns the latest day. To add earlier days, save them yourself as a CSV and run
  `python -m engine.ingest.fii_dii_import data/fii_dii_history.csv` (format: `engine/ingest/fii_dii_history.example.csv`).
  Existing days are never overwritten.

## What the backtest says (Nov 2026, 10 years)

Prices from Nov 2016 (`--backfill` fetches 10 years). Every trade pays 0.1% costs and 0.2% slippage per side;
stocks trading under Rs 5 crore a day are skipped. Rules were fixed before results were seen. Training is every
trade entered up to 2025-12-31; 2026 is the untouched test.

- **Daily setups: no edge.** Breakouts −0.06R, volume spikes −0.03R, support bounces −0.06R over 10 years; none
  passes training, all lose in 2026.
- **Tried, fixed in advance:** only trading when the Nifty 50 is above its 200-day average, and a trailing-stop exit
  instead of a fixed target. Together they move breakouts and volume spikes to about break-even (−0.01R, +0.01R).
  They work in strong bull years (2021, 2023) and lose in the rest. Not trusted.
- **Weekly bars, a lead:** volume spikes passed training (+0.32R) and stayed positive in 2026 (+0.16R over 241
  trades) while the Nifty fell 2.8%. One period, today's stock list: watch it, don't trust it yet. Monthly bars
  passed training but failed 2026 on too few trades to judge.
- **Short setups: no edge.** The three rules mirrored (breakdown, selling spike, resistance rejection) lose −0.12R to
  −0.27R per trade daily and lose on weekly bars too, with or without the market filter (Nifty below its 200-day).
  Survivorship makes shorts look worse than they are, and the decade mostly rose. Shown as "stocks to avoid".
  A positional short needs futures or puts, so the app marks F&O stocks.
- **Chart patterns** (double top/bottom, head and shoulders, triangles, engulfing, hammer, shooting star) are context,
  not trades. Judged by the next 10 days against the average stock: only descending triangles held up (about 0.5% worse
  than average in training and in 2026). The rest mean little on their own.
- **Live record** started on 18 Nov 2026: every setup is logged on its final bar with frozen levels and followed with the
  backtest's rules. This is the test that can't be fooled by hindsight; give it 100+ closed trades.
- Universe is today's Nifty 500, so stocks that dropped out over 10 years are missing (survivorship flatters
  long trades). Outlook groups, portfolio rules and the long-term verdict are rules, not forecasts.

## Data sources and terms

| Source | Used for | Notes |
|---|---|---|
| Yahoo Finance (yfinance) | Prices, indices, world | Unofficial, end of day, personal use. Not dividend adjusted; a few stocks missing |
| NSE archives CSV | Nifty 500, all NSE equities, F&O lot sizes | One download each per run. Fallback: save as `data/nifty500.csv`, `data/equity_l.csv`, `data/fo_mktlots.csv` |
| NSE website API | Daily FII/DII | NSE's terms of use prohibit automated collection. Kept for personal use; consider replacing with a licensed feed |
| Telegram Bot API | Alerts | Official API |
| News, corporate events, X buzz | Not set up | Shown as "Not tracked" until a source is chosen |

## Tests

```bash
scripts/test.sh            # engine tests + web typecheck
scripts/test.sh --build    # also the production build
```

Covers the long and short trade simulator, short detectors, the live record (no hindsight, partial bars ignored),
chart patterns (no lookahead, directional stats), stock-list parsing, no-lookahead checks on detectors and indicators, RSI/MACD/Bollinger and swing levels, weekly
and monthly resampling, walk-forward and per-year stats, the benchmark, the daily brief text, Telegram message building,
and the FII/DII import.

Security: the server binds to 127.0.0.1; `/api/refresh` accepts same-origin requests only and reuses the last result for
60 seconds; server actions get Next's Origin/Host check.

## Roadmap

1. ~~Data pipeline and dashboard~~
2. ~~Pattern engine and backtester~~, plus walk-forward, weekly/monthly, brief, outlook, portfolio, watchlist
3. News and events: needs a source decision (licensed API vs RSS vs none) and an LLM key; tables and UI are ready
4. IPO desk: GMP has no official source
5. Fundamentals scoring, PCR / OI; ~~Telegram alerts~~
