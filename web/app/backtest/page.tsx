import type { Metadata } from "next";
import Link from "next/link";
import BenchmarkChart from "@/components/BenchmarkChart";
import RunningTotal from "@/components/RunningTotal";
import { DashedNotice, PageHead, TablePanel } from "@/components/ui";
import { getBenchmark, getEquity, getPatternStats, getTfStats, getTrades } from "@/lib/db";
import { edgeSummary } from "@/lib/edge";
import { OUTCOME_LABEL, PATTERN_COLOR, PATTERN_LABEL, PATTERN_PLURAL, dayMonth, dayShort, frac, signed, toneOf } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Backtest" };

export default function BacktestPage() {
  const raw = getPatternStats();
  const e = edgeSummary(raw);
  const params = (raw[0] as { params?: { max_hold: number; cost_pct: number; reward_r: number } } | undefined)?.params;
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
            <p className="sec-sub">1R is the amount risked on one trade, the distance from entry to stop. Profit factor above 1 means winners outweighed losers.</p>
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
                          {PATTERN_LABEL[s.pattern]}
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

          <WeeklyMonthly />

          <section style={{ paddingTop: 56 }}>
            <div className="sec-head">
              <h2 className="sec-title">Running total, in R</h2>
              <div className="chart-key" aria-hidden="true">
                {e.stats.map((s) => (
                  <span key={s.pattern}><i style={{ background: PATTERN_COLOR[s.pattern] }} />{PATTERN_LABEL[s.pattern]}</span>
                ))}
              </div>
            </div>
            <div style={{ height: 20 }} />
            <RunningTotal points={getEquity()} />
            <div className="note" style={{ fontSize: 13 }}>Every closed trade, added on its exit day. The totals match the table above.</div>
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
                <div>Costs {params?.cost_pct ?? 0.1}% on each side of every trade.</div>
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
                      <td style={{ fontSize: 15 }}>{PATTERN_LABEL[t.pattern]}</td>
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
                <span>Five or more years of prices, not two</span>
                <span>Stocks that left the Nifty 500, to remove survivorship</span>
                <span>Slippage beyond the 0.1% cost</span>
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
  const weekly = all.filter((s) => s.tf === "W" && s.trades > 0);
  const monthly = all.find((s) => s.tf === "M");
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Weekly bars</h2>
      <p className="sec-sub">
        The same three patterns run on completed weekly bars and tested separately. Fewer trades means more luck in the numbers,
        and this is the same two-year, in-sample period, so treat any positive result as a lead to test, not an edge.
      </p>
      {weekly.length ? (
        <TablePanel minWidth={760}>
          <table className="tbl">
            <thead>
              <tr><th>Pattern</th><th className="r">Trades</th><th className="r">Win rate</th><th className="r">Average R</th><th className="r">Profit factor</th><th className="r">Total R</th></tr>
            </thead>
            <tbody>
              {weekly.map((s) => (
                <tr key={s.pattern}>
                  <td style={{ fontWeight: 600 }}>{PATTERN_LABEL[s.pattern]}</td>
                  <td className="n">{s.trades}</td>
                  <td className="n">{s.win_rate}%</td>
                  <td className={`n ${toneOf(s.avg_r)}`}>{signed(s.avg_r, 3)}</td>
                  <td className="n">{s.profit_factor?.toFixed(2) ?? "–"}</td>
                  <td className={`n ${toneOf(s.total_r)}`}>{signed(s.total_r, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablePanel>
      ) : (
        <DashedNotice>No weekly trades yet.</DashedNotice>
      )}
      {monthly && (monthly.bars_available ?? 0) < (monthly.bars_needed ?? 60) && (
        <p className="note">
          Monthly bars: not enough history yet ({monthly.bars_available} months stored, the patterns need {monthly.bars_needed}). A
          longer price history would make them possible.
        </p>
      )}
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
                  <td style={{ fontWeight: 600 }}>{PATTERN_LABEL[s.pattern]}</td>
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
                <td style={{ fontWeight: 600 }}>{PATTERN_LABEL[s.pattern]}</td>
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
