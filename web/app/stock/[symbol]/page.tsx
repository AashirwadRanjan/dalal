import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NewsList from "@/components/NewsList";
import RealityCheck from "@/components/RealityCheck";
import StockChart from "@/components/StockChart";
import WatchStar from "@/components/WatchStar";
import { ChangeFigure, DashedNotice, ReadTag, VerdictCard } from "@/components/ui";
import { getNewsBundle, getPatternStats, getSetups, getState, getStock, getStockSignals, getTfStatus, getTrades, type TfStatus } from "@/lib/db";
import { edgeSummary } from "@/lib/edge";
import { PATTERN_CODE, PATTERN_LABEL, PATTERN_ORDER, dayShort, inr } from "@/lib/format";
import { isWatched } from "@/lib/portfolio";
import { indicators, ladder, longTerm, plainWords, shortTerm, type Check } from "@/lib/stockview";

export const dynamic = "force-dynamic";

type Tab = "overview" | "technicals" | "news";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "technicals", label: "Technicals" },
  { id: "news", label: "News and events" },
];

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
}

export default async function StockPage({
  params, searchParams,
}: { params: Promise<{ symbol: string }>; searchParams: Promise<{ tab?: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const tabParam = (await searchParams).tab;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "overview";
  const data = getStock(symbol);
  if (!data) notFound();
  const { inst, candles } = data;
  const st = getState(symbol);

  return (
    <main className="wrap">
      <div style={{ paddingTop: 24 }}>
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, minHeight: 32 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          Today
        </Link>
        <div className="stock-head">
          <div>
            <h1 className="page-title">{inst.name}</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <span className="tag t-flat mono" style={{ fontWeight: 700 }}>{inst.symbol}</span>
              {inst.sector && <span className="tag t-flat" style={{ fontWeight: 500 }}>{inst.sector}</span>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
            {st && (
              <div style={{ textAlign: "right" }}>
                <div className="mono" style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.1 }}>₹{inr(st.close)}</div>
                <div style={{ fontSize: 15 }}>
                  <ChangeFigure value={st.chg_1d != null ? st.chg_1d * 100 : null} />{" "}
                  <span className="mono muted" style={{ marginLeft: 8 }}>{dayShort(st.date)}</span>
                </div>
              </div>
            )}
            <WatchStar symbol={inst.symbol} watched={isWatched(inst.symbol)} />
          </div>
        </div>
      </div>

      <nav className="stock-tabs" aria-label="Stock sections">
        {TABS.map((t) => (
          <Link key={t.id} href={`/stock/${encodeURIComponent(symbol)}${t.id === "overview" ? "" : `?tab=${t.id}`}`} aria-current={tab === t.id ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {!st ? (
        <div style={{ paddingTop: 32 }}><DashedNotice>No price data for this stock yet, so none of the rules can run.</DashedNotice></div>
      ) : tab === "overview" ? (
        <Overview symbol={symbol} candles={candles} st={st} />
      ) : tab === "technicals" ? (
        <Technicals symbol={symbol} st={st} />
      ) : (
        <News symbol={symbol} />
      )}
    </main>
  );
}

function context(symbol: string, st: NonNullable<ReturnType<typeof getState>>) {
  const today = getSetups().filter((s) => s.symbol === symbol);
  const trades = getTrades({ symbol, limit: 50 });
  return { today, trades, short: shortTerm(st, today, trades) };
}

function Overview({ symbol, candles, st }: { symbol: string; candles: NonNullable<ReturnType<typeof getStock>>["candles"]; st: NonNullable<ReturnType<typeof getState>> }) {
  const { short } = context(symbol, st);
  const long = longTerm(st);
  const edge = edgeSummary(getPatternStats());
  const lv = short.levels;
  const signals = getStockSignals(symbol);
  const byDay = new Map<string, string[]>();
  for (const s of signals) byDay.set(s.date, [...(byDay.get(s.date) ?? []), PATTERN_CODE[s.pattern] ?? "?"]);
  const markers = [...byDay].map(([date, codes]) => ({ date, label: codes.join(" ") }));
  const tfs = getTfStatus(symbol);
  const dailyLabel = short.status === "open" ? "Long setup open" : short.status === "today" ? "Long setup today" : "No setup";

  return (
    <>
      <section className="cols" style={{ gap: 32, paddingTop: 40 }}>
        <div className="panel panel-pad">
          <div className="card-head"><h2 className="panel-title" style={{ margin: 0 }}>Short term</h2><span className="muted" style={{ fontSize: 14 }}>Days to weeks</span></div>
          <VerdictCard tone={short.status === "none" ? "flat" : "up"} title={short.title}>{short.text}</VerdictCard>
          {lv && (
            <div className="level-figs">
              <div><div className="fig-label">Entry</div><div className="fig-m">{inr(lv.entry)}</div></div>
              <div><div className="fig-label">Stop, {(((lv.entry - lv.stop) / lv.entry) * 100).toFixed(1)}% below</div><div className="fig-m down">{inr(lv.stop)}</div></div>
              <div><div className="fig-label">Target, {((lv.target - lv.entry) / (lv.entry - lv.stop)).toFixed(1)} to 1</div><div className="fig-m up">{inr(lv.target)}</div></div>
            </div>
          )}
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 28, paddingTop: 20 }}>
            <div className="fig-label" style={{ marginBottom: 8 }}>By chart timeframe</div>
            {[
              ["Daily", dailyLabel, short.status === "none" ? "flat" : "ok"],
              ["Weekly", ...tfLabel(tfs.find((t) => t.tf === "W"), "week")],
              ["Monthly", ...tfLabel(tfs.find((t) => t.tf === "M"), "month")],
            ].map(([f, s, d]) => (
              <div key={f} style={{ display: "grid", gridTemplateColumns: "100px 1fr", padding: "6px 0" }}>
                <span>{f}</span>
                <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, color: d === "flat" ? "var(--muted)" : undefined }}>
                  <span className={`dot ${d}`} aria-hidden="true" style={{ transform: "translateY(-1px)" }} />{s}
                </span>
              </div>
            ))}
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Weekly and monthly use completed bars only. Their backtests are separate; see the backtest page.
            </p>
          </div>
          <p style={{ margin: "20px 0 0", fontSize: 14, color: "var(--text-2)" }}>
            Short side: no setup, long-only engine. In India, shorting a stock is possible only intraday or through futures.
          </p>
        </div>

        <div className="panel panel-pad">
          <div className="card-head"><h2 className="panel-title" style={{ margin: 0 }}>Long term</h2><span className="muted" style={{ fontSize: 14 }}>Months to years</span></div>
          <VerdictCard tone={long.verdict === "Accumulate" ? "up" : long.verdict === "Avoid" ? "down" : "amber"} title={long.title}>{long.text}</VerdictCard>
          <div className="lines" style={{ marginTop: 24 }}>
            {long.checks.map((c) => <CheckRow key={c.text} c={c} />)}
          </div>
          <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--muted)" }}>Rule says. Technical only, not backtested.</p>
        </div>
      </section>
      <p className="note">
        Both views are rule-based and are not advice.{" "}
        {edge.anyEdge ? "Some short-term setups made money in the backtest, in sample only," : "Short-term setups have not made money in the backtest so far,"} and the
        long-term rules have not been backtested.
      </p>
      {short.status !== "none" && <div style={{ marginTop: 24 }}><RealityCheck variant="band" /></div>}

      <StockChart candles={candles} levels={lv} markers={markers} />
      {markers.length > 0 && (
        <p className="note" style={{ fontSize: 13, marginTop: 4 }}>
          Arrows on the daily chart mark past setups: {PATTERN_ORDER.map((p) => `${PATTERN_CODE[p]} ${PATTERN_LABEL[p].toLowerCase()}`).join(", ")}.
        </p>
      )}
    </>
  );
}

function tfLabel(t: TfStatus | undefined, unit: string): [string, string] {
  if (!t) return ["Not calculated yet", "flat"];
  if (t.status === "insufficient") return [`Not enough history: ${t.bars} ${unit}s, needs 60`, "flat"];
  const p = t.pattern ? PATTERN_LABEL[t.pattern].toLowerCase() : "setup";
  if (t.status === "today") return [`Long setup on the last completed ${unit} (${p})`, "ok"];
  if (t.status === "open") return [`Long setup open (${p}, ${unit} of ${dayShort(t.signal_date)})`, "ok"];
  return ["No setup", "flat"];
}

function CheckRow({ c }: { c: Check }) {
  const icon = c.ok === true ? { d: "M3 9.5 7 13.5 15 4.5", color: "var(--up)", alt: "Yes" }
    : c.ok === false ? { d: "M4.5 4.5 13.5 13.5M13.5 4.5 4.5 13.5", color: "var(--down)", alt: "No" }
    : { d: "M4 9h10", color: "var(--muted)", alt: "Not available" };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 12, alignItems: "center" }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={icon.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={icon.alt}>
        <path d={icon.d} />
      </svg>
      <span style={{ fontSize: 15 }}>{c.text}</span>
      <span className="mono" style={{ fontSize: 13, color: "var(--text-2)", textAlign: "right" }}>{c.value}</span>
    </div>
  );
}

function Technicals({ symbol, st }: { symbol: string; st: NonNullable<ReturnType<typeof getState>> }) {
  const { short } = context(symbol, st);
  const rows = indicators(st);
  const rungs = ladder(st, short.levels);
  return (
    <>
      <section className="panel panel-pad" style={{ marginTop: 40 }}>
        <h2 className="panel-title" style={{ marginBottom: 10 }}>In plain words</h2>
        <p style={{ margin: 0, fontSize: 17, maxWidth: 900, color: "var(--neutral)" }}>{plainWords(st, short.levels, short.status)}</p>
      </section>
      <section className="tech-cols">
        <div>
          <h2 className="sec-title">Indicators</h2>
          <p className="sec-sub">What each number is and what it says. Read for {dayShort(st.date)}.</p>
          <div className="lines">
            {rows.map((i) => (
              <div key={i.name} className="ind-row">
                <div><div style={{ fontWeight: 600 }}>{i.name}</div><div className="mono" style={{ fontSize: 14, color: "var(--text-2)" }}>{i.value}</div></div>
                <div style={{ fontSize: 15, color: "var(--neutral)" }}>{i.says}</div>
                <div style={{ textAlign: "right" }}><ReadTag read={i.read} /></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <DashedNotice>Not calculated yet: fundamentals (profit, debt, growth). Indicators here are end of day.</DashedNotice>
          </div>
        </div>
        <div>
          <h2 className="sec-title">Price ladder</h2>
          <p className="sec-sub">Key levels from highest to lowest, with the distance from now.</p>
          <div className="lines">
            {rungs.map((r) => {
              const d = ((r.price - st.close) / st.close) * 100;
              return (
                <div key={r.label} className={`rung${r.now ? " now" : ""}`}>
                  <span>{r.label}</span>
                  <span className="mono">{inr(r.price)}</span>
                  <span className={`mono ${r.now ? "" : d >= 0 ? "up" : "down"}`} style={{ textAlign: "right" }}>
                    {r.now ? "" : `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

const EVENT_NAME: Record<string, string> = {
  results: "Quarterly results", board_meeting: "Board meeting", dividend_record: "Dividend record date", agm: "Shareholder meeting",
};
const BUZZ: { id: string; label: string }[] = [
  { id: "not_trending", label: "Not trending" }, { id: "top100", label: "Top 100" }, { id: "top50", label: "Top 50" }, { id: "very_trendy", label: "Very trendy" },
];

function News({ symbol }: { symbol: string }) {
  const b = getNewsBundle(symbol);
  return (
    <>
      <section className="cols" style={{ gap: 32, paddingTop: 40 }}>
        <div className="panel panel-pad">
          <h2 className="panel-title" style={{ marginBottom: 6 }}>Buzz on X (Twitter)</h2>
          <p style={{ margin: "0 0 20px", color: "var(--text-2)" }}>Is this company in India’s trending list right now?</p>
          {b.tracked.buzz && b.buzz ? (
            <>
              <div className="chips" aria-label="Buzz level">
                {BUZZ.map((z) => (
                  <span key={z.id} className="chip" aria-current={b.buzz!.level === z.id} style={{ cursor: "default" }}>{z.label}</span>
                ))}
              </div>
              <p style={{ margin: "16px 0 0" }}>
                {b.buzz.rank ? `Rank ${b.buzz.rank} in India’s trends. ` : ""}
                {b.buzz.topic ? `People are talking about: ${b.buzz.topic}.` : ""}
              </p>
              <p className="mono muted" style={{ fontSize: 13 }}>{b.buzz.source}, {dayShort(b.buzz.as_of)}</p>
            </>
          ) : (
            <DashedNotice>Not tracked. No X (Twitter) source is set up, so Dalal does not guess.</DashedNotice>
          )}
        </div>
        <div className="panel panel-pad">
          <h2 className="panel-title" style={{ marginBottom: 6 }}>Coming up</h2>
          <p style={{ margin: "0 0 20px", color: "var(--text-2)" }}>Dates that can move the price.</p>
          {!b.tracked.events ? (
            <DashedNotice>Not tracked yet. Results dates, board meetings, dividend record dates and shareholder meetings will appear here once an exchange announcements source is set up.</DashedNotice>
          ) : b.events.length ? (
            <div className="lines">
              {b.events.map((e) => (
                <div key={e.kind + e.date} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span>{EVENT_NAME[e.kind] ?? e.kind}{e.detail ? <span className="muted"> · {e.detail}</span> : null}</span>
                  <span className="mono">{dayShort(e.date)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No upcoming dates announced.</p>
          )}
        </div>
      </section>

      <section style={{ paddingTop: 48 }}>
        <h2 className="sec-title" style={{ marginBottom: 16 }}>News about the company</h2>
        {!b.tracked.news ? (
          <DashedNotice>Not tracked yet. No news source is set up, so there is nothing to show and nothing is guessed.</DashedNotice>
        ) : b.news.length ? (
          <NewsList items={b.news} />
        ) : (
          <p className="muted">No recent news found for {symbol}.</p>
        )}
        <p className="note">
          Each story is tagged positive, neutral or negative by an LLM, with one line on why it matters. Tags are a reading aid,
          not a prediction, and the LLM never forecasts prices.
        </p>
      </section>
    </>
  );
}
