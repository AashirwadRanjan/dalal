import type { Metadata } from "next";
import Link from "next/link";
import BenchmarkChart from "@/components/BenchmarkChart";
import RunningTotal from "@/components/RunningTotal";
import { DashedNotice, PageHead, TablePanel } from "@/components/ui";
import { getBenchmark, getChartPatternStats, getRuleChecks, getEquity, getPatternStats, getTfStats, getTrades } from "@/lib/db";
import { edgeSummary } from "@/lib/edge";
import { CHART_LABEL, CHART_ORDER, OUTCOME_LABEL, PATTERN_ORDER, PATTERN_COLOR, PATTERN_LABEL, PATTERN_PLURAL, SIDE_OF, dayMonth, dayShort, frac, signed, toneOf } from "@/lib/format";

/** Pattern name with a Short tag for the mirrored short rules. */
const Name = ({ p }: { p: string }) => (
  <>
    {PATTERN_LABEL[p]}
    {SIDE_OF[p] === "short" && <span className="tag t-down" style={{ marginLeft: 8, fontSize: 12 }}>Short</span>}
  </>
);

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Backtest" };

export default function BacktestPage() {
  const raw = getPatternStats();
  const e = edgeSummary(raw);
  const params = (raw[0] as { params?: { max_hold: number; cost_pct: number; reward_r: number; slippage_pct?: number; min_turnover_cr?: number; trail_max_hold?: number } } | undefined)?.params;
  const trades = getTrades({ limit: 10 });

  const passed = e.stats.filter((s) => s.walk_forward?.selected);
  const heldUp = passed.filter((s) => (s.walk_forward?.test.avg_r ?? -1) >= 0.05);
  const oosNote = !e.stats.some((s) => s.walk_forward)
    ? "There is no out-of-sample test yet. Do not trust any pattern until there is."
    : !passed.length
      ? "No pattern passed the training period, so none is worth testing further yet."
      : heldUp.length
        ? `${heldUp.map((s) => PATTERN_LABEL[s.pattern]).join(", ")} held up out of sample. One period is still thin evidence.`
        : `${passed.map((s) => PATTERN_LABEL[s.pattern]).join(", ")} looked good in training and then lost money out of sample. Do not trust any pattern yet.`;

  // Which trend groups were positive? If only "unknown" (the first ~200 days), say it is the market phase.
  const positive = new Set<string>();
  for (const s of e.stats) for (const [t, b] of Object.entries(s.by_trend ?? {})) if ((b.trades ?? 0) >= 50 && (b.avg_r ?? 0) > 0) positive.add(t);
  const phaseNote =
    positive.size === 1 && positive.has("unknown")
      ? "The only positive group is “unknown trend”, the first ~200 days of data. That reflects the market phase, not the trend filter."
      : positive.size === 0
        ? "No trend group made money on average, uptrend or not."
        : `Positive trend groups: ${[...positive].join(", ")}. Check they hold up out of sample before trusting them.`;

  return (
    <main className="wrap">
      <PageHead title="Backtest" lede="How each setup would have done on past prices, after costs." />

      {!e.stats.length ? (
        <DashedNotice title="No backtest yet">It runs with the daily engine. Use Fetch latest to build it.</DashedNotice>
      ) : (
        <>
          <section className="reality">
            <h2 style={{ fontSize: 28, lineHeight: 1.2, letterSpacing: "-0.015em", marginBottom: 8 }}>{e.headline}</h2>
            <p style={{ margin: 0, maxWidth: 760, fontSize: 18, color: "var(--neutral)" }}>
              {e.detail}
              {!e.anyEdge && " That is why Dalal calls these “setups” and treats them as a watchlist, not as buy signals."}
            </p>
          </section>

          <section style={{ paddingTop: 56 }}>
            <h2 className="sec-title">Results by pattern</h2>
            <p className="sec-sub">
              1R is the amount risked on one trade, the distance from entry to stop. Profit factor above 1 means winners
              outweighed losers. Short rules are the long rules mirrored; they are tested on every stock, though only F&amp;O
              stocks can be shorted overnight.
            </p>
            <TablePanel minWidth={860}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pattern</th><th className="r">Trades</th><th className="r">Win rate</th><th className="r">Average R</th>
                    <th className="r">Profit factor</th><th className="r">Total R</th><th className="r">Worst drop, R</th>
                  </tr>
                </thead>
                <tbody>
                  {e.stats.map((s) => (
                    <tr key={s.pattern}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600 }}>
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: PATTERN_COLOR[s.pattern] }} aria-hidden="true" />
                          <Name p={s.pattern} />
                        </span>
                      </td>
                      <td className="n">{s.trades.toLocaleString("en-IN")}</td>
                      <td className="n">{s.win_rate}%</td>
                      <td className={`n ${toneOf(s.avg_r)}`}>{signed(s.avg_r, 3)}</td>
                      <td className="n">{s.profit_factor?.toFixed(2) ?? "–"}</td>
                      <td className={`n ${toneOf(s.total_r)}`}>{signed(s.total_r, 1)}</td>
                      <td className="n">{s.max_dd_r?.toFixed(1) ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablePanel>
          </section>

          <Variants stats={e.stats} trailHold={params?.trail_max_hold ?? 60} />

          <WeeklyMonthly />

          <ChartPatternTable />

          <Learning />

          <section style={{ paddingTop: 56 }}>
            <div className="sec-head">
              <h2 className="sec-title">Running total, in R</h2>
              <div className="chart-key" aria-hidden="true">
                {e.stats.filter((s) => SIDE_OF[s.pattern] === "long").map((s) => (
                  <span key={s.pattern}><i style={{ background: PATTERN_COLOR[s.pattern] }} />{PATTERN_LABEL[s.pattern]}</span>
                ))}
              </div>
            </div>
            <div style={{ height: 20 }} />
            <RunningTotal points={getEquity()} />
            <div className="note" style={{ fontSize: 13 }}>Long patterns: every closed trade, added on its exit day. The totals match the table above. Short totals are in the table; on one chart they would flatten the long lines.</div>
          </section>

          <OutOfSample stats={e.stats} />

          <ByYear stats={e.stats} />

          <section style={{ paddingTop: 56 }}>
            <h2 className="sec-title">Compared with simply holding</h2>
            <p className="sec-sub">
              Buying every stock in today’s list in equal amounts and holding. This is the bar a trading rule has to beat. It
              is flattered by the same survivorship as the backtest, and it is in %, not R, so it gets its own chart.
            </p>
            <BenchmarkChart points={getBenchmark()} from={getEquity()[0]?.date} />
          </section>

          <section className="cols" style={{ paddingTop: 56 }}>
            <div>
              <h2 className="sec-title" style={{ marginBottom: 16 }}>How the test works</h2>
              <div className="lines">
                <div>Enters at the next day’s open after a setup appears, never at the setup price.</div>
                <div>
                  Exits at the stop, at the target ({params?.reward_r ?? 2}R or the nearest resistance), or after{" "}
                  {params?.max_hold ?? 20} trading days.
                </div>
                <div>If one bar touches both the stop and the target, the stop wins.</div>
                <div>
                  Costs {params?.cost_pct ?? 0.1}% on each side, plus {params?.slippage_pct ?? 0}% slippage on entries, stops
                  and time exits. Targets are limit orders and fill at their price.
                </div>
                <div>Skips stocks trading less than ₹{params?.min_turnover_cr ?? 0} crore a day on average over the prior 20 days.</div>
                <div>One trade at a time per stock per pattern. Uses no future bars.</div>
              </div>
            </div>
            <div>
              <h2 className="sec-title" style={{ marginBottom: 16 }}>Read this carefully</h2>
              <div className="lines">
                <div>{phaseNote}</div>
                <div>The test uses today’s Nifty 500 list, so stocks that fell out of it are missing. This flatters the results.</div>
                <div>{oosNote}</div>
              </div>
            </div>
          </section>

          <section style={{ paddingTop: 56 }}>
            <h2 className="sec-title">Recent trades</h2>
            <p className="sec-sub">The latest closed trades across all patterns.</p>
            <TablePanel minWidth={860}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Stock</th><th>Pattern</th><th>Entered</th><th>Exited</th><th>Result</th>
                    <th className="r">Days</th><th className="r">Return</th><th className="r">R</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t) => (
                    <tr key={t.symbol + t.pattern + t.entry_date}>
                      <td><Link className="sym" href={`/stock/${encodeURIComponent(t.symbol)}`} style={{ fontSize: 15 }}>{t.symbol}</Link></td>
                      <td style={{ fontSize: 15 }}><Name p={t.pattern} /></td>
                      <td className="mono" style={{ fontSize: 15 }}>{dayMonth(t.entry_date)}</td>
                      <td className="mono" style={{ fontSize: 15 }}>{dayMonth(t.exit_date)}</td>
                      <td className={toneOf(t.r)} style={{ fontSize: 15 }}>{OUTCOME_LABEL[t.outcome]}</td>
                      <td className="n">{t.bars}</td>
                      <td className={`n ${toneOf(t.r)}`}>{frac(t.ret_pct / 100)}</td>
                      <td className={`n ${toneOf(t.r)}`}>{signed(t.r, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablePanel>
          </section>

          <section style={{ marginTop: 56 }}>
            <DashedNotice title="What would make this test stronger">
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 40px", color: "var(--text-2)" }}>
                <span>Stocks that left the Nifty 500, to remove survivorship</span>
                <span>A portfolio-level test: limited open positions and position sizing, giving returns in %</span>
              </div>
            </DashedNotice>
          </section>
        </>
      )}
    </main>
  );
}

function WeeklyMonthly() {
  const all = getTfStats();
  const frames = (["W", "M"] as const).map((tf) => ({ tf, rows: all.filter((s) => s.tf === tf) }));
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Weekly and monthly bars</h2>
      <p className="sec-sub">
        The same patterns on completed weekly and monthly bars, with the original exits, costs and slippage, judged
        the same way: training up to the end of 2025, then “later”. Trades here can last up to 20 weeks or 20 months, so
        whole-period results lean on the market’s rise; the later column is the one to read.
      </p>
      {frames.map(({ tf, rows }) => {
        const enough = rows.some((r) => (r.bars_available ?? 0) >= (r.bars_needed ?? 60));
        const traded = rows.filter((r) => r.trades > 0);
        return (
          <div key={tf} style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 17, marginBottom: 10 }}>{tf === "W" ? "Weekly" : "Monthly"}</h3>
            {!enough ? (
              <DashedNotice>
                Not enough history yet ({rows[0]?.bars_available ?? 0} {tf === "W" ? "weeks" : "months"} stored, the patterns need {rows[0]?.bars_needed ?? 60}).
              </DashedNotice>
            ) : traded.length ? (
              <TablePanel minWidth={760}>
                <table className="tbl">
                  <thead>
                    <tr><th>Pattern</th><th className="r">Trades</th><th className="r">Average R</th><th className="r">Training avg</th><th>Passed?</th><th className="r">Later trades</th><th className="r">Later avg</th></tr>
                  </thead>
                  <tbody>
                    {traded.map((s) => (
                      <tr key={s.pattern}>
                        <td style={{ fontWeight: 600 }}><Name p={s.pattern} /></td>
                        <td className="n">{s.trades.toLocaleString("en-IN")}</td>
                        <td className={`n ${toneOf(s.avg_r)}`}>{signed(s.avg_r, 3)}</td>
                        <td className={`n ${toneOf(s.walk_forward?.train.avg_r)}`}>{signed(s.walk_forward?.train.avg_r, 3)}</td>
                        <td>{s.walk_forward?.selected ? <span className="tag t-up">Passed</span> : <span className="tag t-flat">Did not pass</span>}</td>
                        <td className="n">{s.walk_forward?.test.trades ?? 0}</td>
                        <td className={`n ${toneOf(s.walk_forward?.test.avg_r)}`}>{signed(s.walk_forward?.test.avg_r, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablePanel>
            ) : (
              <DashedNotice>No trades on {tf === "W" ? "weekly" : "monthly"} bars yet.</DashedNotice>
            )}
            {traded.some((r) => (r.walk_forward?.test.trades ?? 0) > 0 && (r.walk_forward?.test.trades ?? 0) < 100) && (
              <p className="note" style={{ marginTop: 8 }}>Fewer than 100 later trades is too few to judge either way.</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

const VARIANT_NAME: Record<string, string> = {
  base: "Original rule",
  regime: "Only when Nifty is above its 200-day average (below, for shorts)",
  trail: "Trailing-stop exit instead of a fixed target",
  regime_trail: "Both: market filter and trailing stop",
};

/** Every rule variant we tried, judged the same way. Decided before the results were seen; listed even when they fail. */
function Variants({ stats, trailHold }: { stats: ReturnType<typeof edgeSummary>["stats"]; trailHold: number }) {
  if (!stats.some((s) => s.variants)) return null;
  const any = stats.some((s) => s.walk_forward?.selected || Object.values(s.variants ?? {}).some((v) => v.walk_forward.selected));
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">What we tried</h2>
      <p className="sec-sub">
        Two changes, fixed before seeing any result: take setups only when the Nifty 50 closed above its 200-day average,
        and replace the fixed target with the trailing stop (held up to {trailHold} days).{" "}
        {any ? "At least one variant passed training; check that it held up in the later period before trusting it." : "None passed training, so none is trusted. The market filter and trailing stop only move results from losing towards break-even."}
      </p>
      <TablePanel minWidth={900}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Pattern and rule</th><th className="r">Trades</th><th className="r">Win rate</th><th className="r">Average R</th>
              <th className="r">Training avg</th><th>Passed?</th><th className="r">Later avg</th>
            </tr>
          </thead>
          <tbody>
            {stats.flatMap((s) =>
              (["base", "regime", "trail", "regime_trail"] as const).map((v) => {
                const x = v === "base" ? { ...s, walk_forward: s.walk_forward! } : s.variants?.[v];
                if (!x || !x.walk_forward) return null;
                const w = x.walk_forward;
                return (
                  <tr key={s.pattern + v}>
                    <td>
                      <span style={{ fontWeight: v === "base" ? 600 : 400 }}>{v === "base" ? <Name p={s.pattern} /> : ""}</span>
                      <span className="nm" style={{ fontSize: 14 }}>{VARIANT_NAME[v]}</span>
                    </td>
                    <td className="n">{(x.trades ?? 0).toLocaleString("en-IN")}</td>
                    <td className="n">{x.win_rate ?? "–"}%</td>
                    <td className={`n ${toneOf(x.avg_r)}`}>{signed(x.avg_r, 3)}</td>
                    <td className={`n ${toneOf(w.train.avg_r)}`}>{signed(w.train.avg_r, 3)}</td>
                    <td>{w.selected ? <span className="tag t-up">Passed</span> : <span className="tag t-flat">Did not pass</span>}</td>
                    <td className={`n ${toneOf(w.test.avg_r)}`}>{signed(w.test.avg_r, 3)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </TablePanel>
      <p className="note">
        Trailing-stop variants win less often but let winners run, so compare average R, not win rate. Training is every
        trade entered up to {stats[0]?.walk_forward?.train_end}; “later” is everything after.
      </p>
    </section>
  );
}

function OutOfSample({ stats }: { stats: ReturnType<typeof edgeSummary>["stats"] }) {
  const rows = stats.filter((s) => s.walk_forward);
  if (!rows.length) return null;
  const end = rows[0].walk_forward!.train_end;
  const failed = rows.filter((s) => s.walk_forward!.selected && (s.walk_forward!.test.avg_r ?? 0) < 0);
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Out of sample</h2>
      <p className="sec-sub">
        Judge each pattern on trades entered up to {dayShort(end)} {end.slice(0, 4)}, then see what happened after. A pattern
        “passes” training if it averaged at least +0.05R over 100 or more trades.
        {failed.length > 0 && ` ${failed.map((s) => PATTERN_PLURAL[s.pattern][0].toUpperCase() + PATTERN_PLURAL[s.pattern].slice(1)).join(" and ")} passed training and then lost money.`}
      </p>
      <TablePanel minWidth={760}>
        <table className="tbl">
          <thead>
            <tr><th>Pattern</th><th className="r">Training trades</th><th className="r">Training avg</th><th>Passed?</th><th className="r">Later trades</th><th className="r">Later avg</th></tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const w = s.walk_forward!;
              return (
                <tr key={s.pattern}>
                  <td style={{ fontWeight: 600 }}><Name p={s.pattern} /></td>
                  <td className="n">{w.train.trades}</td>
                  <td className={`n ${toneOf(w.train.avg_r)}`}>{signed(w.train.avg_r, 3)}</td>
                  <td>{w.selected ? <span className="tag t-up">Passed</span> : <span className="tag t-flat">Did not pass</span>}</td>
                  <td className="n">{w.test.trades}</td>
                  <td className={`n ${toneOf(w.test.avg_r)}`}>{signed(w.test.avg_r, 3)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TablePanel>
    </section>
  );
}

function ByYear({ stats }: { stats: ReturnType<typeof edgeSummary>["stats"] }) {
  const years = [...new Set(stats.flatMap((s) => Object.keys(s.by_year ?? {})))].sort();
  if (!years.length) return null;
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Each year</h2>
      <p className="sec-sub">Average result per trade by the year the trade closed. A pattern that only works in one year is a market-phase effect.</p>
      <TablePanel minWidth={560}>
        <table className="tbl">
          <thead>
            <tr><th>Pattern</th>{years.map((y) => <th key={y} className="r">{y}</th>)}</tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.pattern}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}><Name p={s.pattern} /></td>
                {years.map((y) => {
                  const b = s.by_year?.[y];
                  return (
                    <td key={y} className={`n ${toneOf(b?.avg_r)}`}>
                      {b?.trades ? <>{signed(b.avg_r, 3)}<span className="sub-n">{b.trades} trades</span></> : "–"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
    </section>
  );
}

/** Chart patterns are context, not trades: judged by the next 10 days against the average stock, in their direction. */
function ChartPatternTable() {
  const st = getChartPatternStats();
  const rows = CHART_ORDER.map((n) => st[n]).filter((x) => x && x.n > 0);
  if (!rows.length) return null;
  const held = rows.filter((r) => r.reliable).map((r) => CHART_LABEL[r.name]);
  const pp = (x?: number) => (x == null ? "–" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`);
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Chart patterns</h2>
      <p className="sec-sub">
        Shown next to setups as context, not traded. For each, the stock’s return over the next {rows[0].horizon} days compared
        with the average stock over the same days, in the pattern’s direction: a bearish pattern “works” when the stock does
        worse than average. It held up if it beat the average by 0.25% or more in training and again later, on 100 or more
        later cases. {held.length ? `Held up: ${held.join(", ")}.` : "None held up."} The rest mean little on their own.
      </p>
      <TablePanel minWidth={860}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Pattern</th><th className="r">Times</th><th className="r">Vs average, %</th><th className="r">Moved its way</th>
              <th className="r">Training, %</th><th className="r">Later, %</th><th>Held up?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>
                  <span className={`tag ${r.bias === "bullish" ? "t-up" : "t-down"}`} style={{ marginRight: 8, fontSize: 12 }}>{r.bias === "bullish" ? "Bullish" : "Bearish"}</span>
                  <span style={{ fontWeight: 600 }}>{CHART_LABEL[r.name]}</span>
                </td>
                <td className="n">{r.n.toLocaleString("en-IN")}</td>
                <td className={`n ${toneOf(r.edge_pct)}`}>{pp(r.edge_pct)}</td>
                <td className="n">{r.hit_pct}%</td>
                <td className={`n ${toneOf(r.train.edge_pct)}`}>{pp(r.train.edge_pct)}</td>
                <td className={`n ${toneOf(r.test.edge_pct)}`}>{pp(r.test.edge_pct)}<span className="sub-n">{r.test.n} cases</span></td>
                <td>{r.reliable ? <span className="tag t-up">Held up</span> : <span className="tag t-flat">No</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
      <p className="note">“Moved its way” is how often the stock went the pattern’s way at all; with most stocks rising over 10 years, bearish patterns rarely see falls even when they lag.</p>
    </section>
  );
}

/** Fixed candidate filters, each judged in training and later. Only one that helps in both is a lead. */
function Learning() {
  const checks = getRuleChecks();
  if (!checks.length) return null;
  const ordered = PATTERN_ORDER.map((p) => checks.find((c) => c.pattern === p)).filter((c): c is NonNullable<typeof c> => !!c);
  const names = Object.keys(ordered[0]?.filters ?? {});
  const promising = ordered.flatMap((c) => Object.entries(c.filters).filter(([, f]) => f.promising).map(([k, f]) => `${PATTERN_LABEL[c.pattern]}: ${f.label.toLowerCase()}`));
  const g = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`;
  return (
    <section id="learning" style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Learning from losses</h2>
      <p className="sec-sub">
        Every losing and winning trade is tagged with what was known when it was taken. For each pattern we check whether
        a fixed list of filters, written before looking, would have improved it: first in training (to{" "}
        {ordered[0]?.train_end.slice(0, 4)}), then in the later period it never saw. A filter is a lead only if it adds at
        least +0.05R in both, on 100 or more later trades. With {ordered.length * names.length} checks some will look good
        by luck, so even a lead goes to the live record before it changes any rule.{" "}
        <strong style={{ color: "var(--text)" }}>
          {promising.length ? `Leads: ${promising.join("; ")}.` : "No filter helped in both periods: the losses are not explained by trend, market direction, volume, RSI, stop width or chasing the open."}
        </strong>
      </p>
      <TablePanel minWidth={1000}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Filter, change in average R</th>
              {ordered.map((c) => <th key={c.pattern} className="r" style={{ whiteSpace: "nowrap" }}><Name p={c.pattern} /></th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>No filter: training / later</td>
              {ordered.map((c) => (
                <td key={c.pattern} className="n" style={{ fontSize: 14 }}>
                  {signed(c.base.train.avg_r, 2)} / {signed(c.base.test.avg_r, 2)}
                </td>
              ))}
            </tr>
            {names.map((k) => (
              <tr key={k}>
                <td style={{ fontSize: 14, maxWidth: 320 }}>{ordered[0].filters[k].label}</td>
                {ordered.map((c) => {
                  const f = c.filters[k];
                  return (
                    <td key={c.pattern} className="n" style={{ fontSize: 14 }}>
                      <span className={toneOf(f.gain_train)}>{g(f.gain_train)}</span> / <span className={toneOf(f.gain_test)}>{g(f.gain_test)}</span>
                      {f.promising && <span className="tag t-up" style={{ marginLeft: 6, fontSize: 11 }}>Lead</span>}
                      <span className="sub-n">{f.share}% of trades</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
      <p className="note">Each cell: change in average R per trade in training / later, keeping only trades that pass the filter.</p>
    </section>
  );
}
