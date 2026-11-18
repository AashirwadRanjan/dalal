import type { Metadata } from "next";
import Link from "next/link";
import RealityCheck from "@/components/RealityCheck";
import SetupsTable from "@/components/SetupsTable";
import { DashedNotice, PageHead, TablePanel } from "@/components/ui";
import { getChartPatterns, getLastPlan, getNearTriggers, getSetups, type ChartPattern, type NearTrigger, type PlanResult } from "@/lib/db";
import { OUTCOME_LABEL, PATTERN_LABEL, dayShort, inr, signed, toneOf } from "@/lib/format";
import { nextSession, planHeading } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Setups" };

export default function SetupsPage() {
  const setups = getSetups();
  const charts: Record<string, ChartPattern[]> = {};
  for (const c of getChartPatterns()) (charts[c.symbol] ??= []).push(c);
  const head = setups[0] ? planHeading(setups[0].date) : null;

  return (
    <main className="wrap">
      <PageHead title={head?.title ?? "Setups"} lede={head?.lede ?? "Stocks where a rule fired on the latest close."} />
      {head?.state.kind === "provisional" && (
        <div className="band" role="status" style={{ marginBottom: 24 }}>
          <strong>Not final</strong>
          <span className="txt">Fetched during market hours. Fetch again after 3:45 pm for the real plan.</span>
        </div>
      )}
      <RealityCheck variant="band" />
      <div style={{ height: 32 }} />
      {setups.length ? <SetupsTable setups={setups} charts={charts} /> : <DashedNotice>No setups fired on the latest close.</DashedNotice>}
      {setups.length > 0 && (
        <p className="note"><a href="/api/export/setups" download style={{ fontWeight: 500 }}>Download these setups as CSV</a></p>
      )}

      {setups[0] && <LastPlan signalDate={setups[0].date} />}
      <NearTriggers />
    </main>
  );
}

/** The previous plan, judged by what actually happened since (same rules as the backtest). */
function LastPlan({ signalDate }: { signalDate: string }) {
  const { date, rows } = getLastPlan(signalDate);
  if (!date) return null;
  const sgn = (r: PlanResult) => (r.side === "short" ? -1 : 1);
  const rNow = (r: PlanResult) =>
    r.r ?? (r.entry != null && r.last_close != null ? (sgn(r) * (r.last_close - r.entry)) / Math.abs(r.entry - r.stop) : null);
  const entered = rows.filter((r) => r.entry_date);
  const skipped = rows.length - entered.length;
  const closed = entered.filter((r) => r.outcome && r.outcome !== "open");
  const avg = entered.length ? entered.reduce((a, r) => a + (rNow(r) ?? 0), 0) / entered.length : null;
  const status = (r: PlanResult) =>
    !r.entry_date
      ? "Skipped: opened past the stop or target"
      : r.outcome === "open"
        ? "Open"
        : OUTCOME_LABEL[r.outcome ?? ""] ?? r.outcome;

  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">How the {dayShort(nextSession(date))} plan went</h2>
      <p className="sec-sub">
        The {rows.length} setups from the {dayShort(date)} close: {entered.length} entered at the next open, {skipped} skipped,
        {" "}{closed.length} already closed. Average so far {avg == null ? "–" : `${signed(avg, 2)}R`} after costs, open trades
        valued at the last close. One day is noise; the <Link href="/live" style={{ fontWeight: 500 }}>live record</Link> and
        the “learning from losses” check on the <Link href="/backtest#learning" style={{ fontWeight: 500 }}>backtest page</Link> are
        where mistakes turn into evidence.
      </p>
      {rows.length ? (
        <TablePanel minWidth={860}>
          <table className="tbl">
            <thead>
              <tr><th>Stock</th><th>Setup</th><th className="r">Planned stop</th><th className="r">Opened at</th><th>What happened</th><th className="r">R so far</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const x = rNow(r);
                return (
                  <tr key={r.symbol + r.pattern}>
                    <td><Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link><span className="nm">{r.name}</span></td>
                    <td>
                      <span className={`tag ${r.side === "long" ? "t-up" : "t-down"}`}>{r.side === "long" ? "Long" : "Short"}</span>
                      <span className="nm" style={{ fontSize: 14 }}>{PATTERN_LABEL[r.pattern]}</span>
                    </td>
                    <td className="n">{inr(r.stop)}</td>
                    <td className="n">{r.entry != null ? inr(r.entry) : "–"}</td>
                    <td className={r.outcome && r.outcome !== "open" ? toneOf(r.r) : undefined}>{status(r)}</td>
                    <td className={`n ${toneOf(x)}`}>{x == null ? "–" : signed(x, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TablePanel>
      ) : (
        <DashedNotice>No setups fired on the {dayShort(date)} close.</DashedNotice>
      )}
    </section>
  );
}

/** What the next close needs to produce a breakout or a breakdown. */
function NearTriggers() {
  const { long, short } = getNearTriggers();
  if (!long.length && !short.length) return null;
  const table = (rows: NearTrigger[], side: "long" | "short") =>
    rows.length ? (
      <TablePanel minWidth={460}>
        <table className="tbl">
          <thead>
            <tr><th>Stock</th><th className="r">Close</th><th className="r">Needs a close {side === "long" ? "above" : "below"}</th><th className="r">On at least</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td>
                  <Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                  <span className="nm">{r.name}{side === "short" && !r.fno ? " · no F&O" : ""}</span>
                </td>
                <td className="n">{inr(r.close)}</td>
                <td className="n">{inr(r.level)}<span className="sub-n">{side === "long" ? "+" : "−"}{r.dist_pct.toFixed(1)}%</span></td>
                <td className="n">
                  {Math.round(r.vol_needed).toLocaleString("en-IN")}
                  <span className="sub-n">{r.volume ? `${(r.vol_needed / r.volume).toFixed(1)}× today’s` : "shares"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablePanel>
    ) : (
      <DashedNotice>None within 2%.</DashedNotice>
    );
  return (
    <section style={{ paddingTop: 56 }}>
      <h2 className="sec-title">Could trigger at the next close</h2>
      <p className="sec-sub">
        Nifty 500 stocks within 2% of a breakout or breakdown. A setup needs the close beyond the level and that much
        volume (1.5× the 20-day average). This is the shape of the next plan, not a forecast: most won’t get there.
      </p>
      <div className="cols" style={{ alignItems: "start" }}>
        <div><h3 style={{ fontSize: 17, marginBottom: 10 }}>Breakout (long)</h3>{table(long, "long")}</div>
        <div><h3 style={{ fontSize: 17, marginBottom: 10 }}>Breakdown (short)</h3>{table(short, "short")}</div>
      </div>
    </section>
  );
}
