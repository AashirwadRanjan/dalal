import type { Metadata } from "next";
import Link from "next/link";
import { DashedNotice, PageHead, TablePanel } from "@/components/ui";
import { getLive, type LiveRow } from "@/lib/db";
import { OUTCOME_LABEL, PATTERN_LABEL, dayMonth, dayShort, inr, signed, toneOf } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live record" };

const JUDGE_AT = 100; // closed trades before a number means much (same bar as the backtest's training rule)

const EVENT_LABEL: Record<string, string> = {
  entered: "Entered", skipped: "Skipped, opened past a level", working: "Reached +1R",
  target: "Target hit", stop: "Stopped out", time: "Time limit",
};

const sgn = (r: LiveRow) => (r.side === "short" ? -1 : 1);
/** Unrealised result in R at the last close, before costs. */
const nowR = (r: LiveRow) =>
  r.entry != null && r.last_close != null && r.entry !== r.stop ? (sgn(r) * (r.last_close - r.entry)) / Math.abs(r.entry - r.stop) : null;

const SideTag = ({ side }: { side: "long" | "short" }) => (
  <span className={`tag ${side === "long" ? "t-up" : "t-down"}`}>{side === "long" ? "Long" : "Short"}</span>
);
const what = (r: { pattern: string; tf: "D" | "W" }) => `${PATTERN_LABEL[r.pattern]}, ${r.tf === "W" ? "weekly" : "daily"}`;

function summary(rows: LiveRow[]) {
  const closed = rows.filter((r) => r.r != null);
  const avg = closed.length ? closed.reduce((a, r) => a + (r.r ?? 0), 0) / closed.length : null;
  const wins = closed.filter((r) => (r.r ?? 0) > 0).length;
  return {
    logged: rows.length, closed: closed.length, avg,
    win: closed.length ? (wins / closed.length) * 100 : null,
    open: rows.filter((r) => r.status === "open").length,
    waiting: rows.filter((r) => r.status === "waiting").length,
  };
}

export default function LivePage() {
  const { rows, events } = getLive();
  const start = rows.reduce((a, r) => (!a || r.logged_on < a ? r.logged_on : a), "");
  const all = summary(rows);
  const open = rows.filter((r) => r.status === "open").sort((a, b) => (nowR(b) ?? 0) - (nowR(a) ?? 0));
  const waiting = rows.filter((r) => r.status === "waiting");
  const closed = rows.filter((r) => r.r != null).sort((a, b) => (b.exit_date ?? "").localeCompare(a.exit_date ?? "")).slice(0, 50);
  const groups = (["D", "W"] as const).flatMap((tf) =>
    (["long", "short"] as const).map((side) => ({ tf, side, s: summary(rows.filter((r) => r.tf === tf && r.side === side)) }))
  ).filter((g) => g.s.logged);

  return (
    <main className="wrap">
      <PageHead
        title="Live record"
        lede="Every setup logged on the day it fired, then followed with the backtest's own rules: next-open entry, stop first, costs and slippage. Its levels are frozen when it is logged, so there is no hindsight."
      />

      {!rows.length ? (
        <DashedNotice title="The record starts with the next run after the close">
          Setups are logged only on a final daily bar (after 3:45 pm) and weekly ones on a Friday close. Use Fetch latest
          after the close, or wait for the 6:45 pm run.
        </DashedNotice>
      ) : (
        <>
          <div className="figs" style={{ paddingBottom: 28 }}>
            <div><div className="fig-label">Since</div><div className="fig-l">{dayShort(start)}</div></div>
            <div><div className="fig-label">Setups logged</div><div className="fig-l">{all.logged}</div></div>
            <div><div className="fig-label">Open now</div><div className="fig-l">{all.open}</div></div>
            <div><div className="fig-label">Closed</div><div className="fig-l">{all.closed}</div></div>
            <div>
              <div className="fig-label">Average closed result</div>
              <div className={`fig-l ${toneOf(all.avg)}`}>{all.avg == null ? "–" : `${signed(all.avg, 2)}R`}</div>
            </div>
          </div>
          <div className="band" role="note">
            <strong>{all.closed < JUDGE_AT ? "Too early to judge" : "Enough trades to read"}</strong>
            <span className="txt">
              {all.closed < JUDGE_AT
                ? `${all.closed} closed trade${all.closed === 1 ? "" : "s"} so far. The backtest needed ${JUDGE_AT} or more before a number meant anything; until then this page shows what happens, not whether a rule works.`
                : "Compare these averages with the backtest. A rule that does worse live than in the test was probably fitted to the past."}
            </span>
            <Link href="/backtest" style={{ fontSize: 15, fontWeight: 500 }}>See the backtest</Link>
          </div>

          <section style={{ paddingTop: 48 }}>
            <h2 className="sec-title" style={{ marginBottom: 16 }}>By side and timeframe</h2>
            <TablePanel minWidth={680}>
              <table className="tbl">
                <thead>
                  <tr><th>Setups</th><th className="r">Logged</th><th className="r">Open</th><th className="r">Closed</th><th className="r">Won</th><th className="r">Average R</th></tr>
                </thead>
                <tbody>
                  {groups.map(({ tf, side, s }) => (
                    <tr key={tf + side}>
                      <td><SideTag side={side} /> <span style={{ marginLeft: 8 }}>{tf === "W" ? "Weekly" : "Daily"}</span></td>
                      <td className="n">{s.logged}</td>
                      <td className="n">{s.open}</td>
                      <td className="n">{s.closed}</td>
                      <td className="n">{s.win == null ? "–" : `${s.win.toFixed(0)}%`}</td>
                      <td className={`n ${toneOf(s.avg)}`}>{s.avg == null ? "–" : signed(s.avg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablePanel>
          </section>

          <section style={{ paddingTop: 48 }}>
            <h2 className="sec-title">Open now</h2>
            <p className="sec-sub">“Now” is the result at the last close before costs; “best” is the furthest it has gone in the trade’s favour.</p>
            {open.length ? (
              <TablePanel minWidth={980}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Stock</th><th>Setup</th><th>Entered</th><th className="r">Entry</th><th className="r">Stop</th>
                      <th className="r">Target</th><th className="r">Last close</th><th className="r">Now</th><th className="r">Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {open.map((r) => (
                      <tr key={r.id}>
                        <td><Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link><span className="nm">{r.name}</span></td>
                        <td><SideTag side={r.side} /><span className="nm" style={{ fontSize: 14 }}>{what(r)}</span></td>
                        <td className="mono" style={{ fontSize: 15 }}>{r.entry_date ? dayMonth(r.entry_date) : "–"}</td>
                        <td className="n">{inr(r.entry)}</td>
                        <td className="n down">{inr(r.stop)}</td>
                        <td className="n up">{inr(r.target)}</td>
                        <td className="n">{inr(r.last_close)}</td>
                        <td className={`n ${toneOf(nowR(r))}`}>{nowR(r) == null ? "–" : `${signed(nowR(r), 2)}R`}</td>
                        <td className="n">{r.best_r == null ? "–" : `${signed(r.best_r, 2)}R`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablePanel>
            ) : (
              <DashedNotice>No trade is open.</DashedNotice>
            )}
          </section>

          {waiting.length > 0 && (
            <section style={{ paddingTop: 48 }}>
              <h2 className="sec-title">Waiting for the next open</h2>
              <p className="sec-sub">
                {waiting.length} setup{waiting.length === 1 ? "" : "s"} from the latest close:{" "}
                {waiting.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} style={{ fontWeight: 500 }}>{r.symbol}</Link>{" "}
                    <span className="muted">({r.side}, {PATTERN_LABEL[r.pattern].toLowerCase()}{r.tf === "W" ? ", weekly" : ""})</span>
                  </span>
                ))}
                .
              </p>
            </section>
          )}

          <section className="cols" style={{ paddingTop: 48, alignItems: "start" }}>
            <div>
              <h2 className="sec-title">What happened lately</h2>
              {events.length ? (
                <div className="lines">
                  {events.slice(0, 20).map((e, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                      <span className="mono muted" style={{ fontSize: 13, minWidth: 56 }}>{dayMonth(e.date)}</span>
                      <Link className="sym" href={`/stock/${encodeURIComponent(e.symbol)}`} style={{ fontSize: 15 }}>{e.symbol}</Link>
                      <span className={e.r != null && ["target", "stop", "time"].includes(e.event) ? toneOf(e.r) : undefined}>
                        {EVENT_LABEL[e.event] ?? e.event}
                        {e.r != null && ["target", "stop", "time"].includes(e.event) ? `, ${signed(e.r, 2)}R` : ""}
                      </span>
                      <span className="muted" style={{ fontSize: 14 }}>{e.side} {what(e).toLowerCase()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing yet. Events appear once a logged setup reaches its next open.</p>
              )}
            </div>
            <div>
              <h2 className="sec-title">Telegram</h2>
              <p style={{ color: "var(--text-2)", margin: 0 }}>
                The 6:45 pm run sends these events for stocks you hold or watch, plus weekly breakouts and volume spikes,
                the two weekly rules that passed training. Each event is sent once.
              </p>
            </div>
          </section>

          {closed.length > 0 && (
            <section style={{ paddingTop: 48 }}>
              <h2 className="sec-title">Closed</h2>
              <TablePanel minWidth={820}>
                <table className="tbl">
                  <thead>
                    <tr><th>Stock</th><th>Setup</th><th>Entered</th><th>Exited</th><th>Result</th><th className="r">R</th></tr>
                  </thead>
                  <tbody>
                    {closed.map((r) => (
                      <tr key={r.id}>
                        <td><Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link></td>
                        <td><SideTag side={r.side} /><span className="nm" style={{ fontSize: 14 }}>{what(r)}</span></td>
                        <td className="mono" style={{ fontSize: 15 }}>{r.entry_date ? dayMonth(r.entry_date) : "–"}</td>
                        <td className="mono" style={{ fontSize: 15 }}>{r.exit_date ? dayMonth(r.exit_date) : "–"}</td>
                        <td className={toneOf(r.r)}>{OUTCOME_LABEL[r.status] ?? r.status}</td>
                        <td className={`n ${toneOf(r.r)}`}>{signed(r.r, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablePanel>
            </section>
          )}
        </>
      )}
    </main>
  );
}
