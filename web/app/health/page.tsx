import type { Metadata } from "next";
import FetchButton from "@/components/FetchButton";
import { TablePanel, Tag } from "@/components/ui";
import { getHealthFacts, getRunStatus, type HealthFacts, type StepRun } from "@/lib/db";
import { dayLong, dayMonth, monthYear, plural, runTime } from "@/lib/format";
import { STEP_INFO, STEP_ORDER, listJoin, stepName } from "@/lib/steps";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Data health" };

const FRAGILE = [
  { name: "NSE fund flows", text: "The least stable source. It needs a cookie from the NSE home page, returns only the latest day, and can stop working without warning." },
  { name: "Yahoo Finance prices", text: "Free and end of day only. Prices are not adjusted for dividends, and a few stocks have no data at all." },
  { name: "NSE stock list", text: "NSE sometimes blocks scripts. Save the files by hand as data/nifty500.csv, data/equity_l.csv and data/fo_mktlots.csv as a fallback." },
];

/** Plain-English finding for a step, from database counts. Failures show the logged error instead. */
function found(s: StepRun, f: HealthFacts): string {
  if (s.status === "failed") return s.detail ?? "Failed without a message. Check data/engine.log.";
  switch (s.step) {
    case "instruments":
      return `${f.instruments} stocks loaded. A manual file is the fallback if NSE blocks the download.`;
    case "prices": {
      const none = f.instruments - f.withPrices;
      return `${f.withPrices} of ${f.instruments} stocks have prices. ${f.onLatest} had a bar for ${dayMonth(f.latestPriceDate)}.${none ? ` ${plural(none, "stock")} ${none === 1 ? "has" : "have"} no price data at all.` : ""}`;
    }
    case "market_series": {
      const m = /(\d+)\/(\d+) series/.exec(s.detail ?? "");
      const gap = /no data: ([^)]+)/.exec(s.detail ?? "")?.[1];
      return `${m ? `${m[1]} of ${m[2]} series loaded.` : s.detail ?? ""}${gap ? ` ${gap} returns nothing.` : ""}`;
    }
    case "fii_dii":
      return `${plural(f.flowDays, "day")} stored. NSE shows only the latest day, so history grows by one day per run.`;
    case "signals":
      return `Rebuilt from scratch each run. ${f.signals.toLocaleString("en-IN")} setups on record since ${monthYear(f.firstSignal)}.`;
    case "summary":
      return f.briefDate ? `Written for ${dayMonth(f.briefDate)}.` : "No brief written yet.";
    default:
      return s.detail ?? "";
  }
}

export default function HealthPage() {
  const run = getRunStatus();
  const facts = getHealthFacts();
  const steps = STEP_ORDER.map((k) => run.steps.find((s) => s.step === k)).filter((s): s is StepRun => !!s);
  const failed = steps.filter((s) => s.status === "failed");
  const never = STEP_ORDER.filter((k) => !run.steps.some((s) => s.step === k));

  return (
    <main className="wrap">
      <section className="page-head" style={{ display: "flex", flexWrap: "wrap", gap: "20px 40px", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Data health</h1>
          <p className="page-lede">When each step of the daily run last finished and what it found.</p>
        </div>
        <FetchButton size="md" />
      </section>

      <section className="panel" style={{ display: "flex", alignItems: "center", gap: 16, padding: "24px 28px" }}>
        <span className={`dot ${failed.length ? "bad" : steps.length ? "ok" : "flat"}`} style={{ width: 14, height: 14 }} aria-hidden="true" />
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {!steps.length
              ? "Nothing has run yet"
              : failed.length
                ? `${listJoin(failed.map((s) => stepName(s.step)))} failed`
                : `All ${steps.length} steps ran fine`}
          </div>
          <div style={{ color: "var(--text-2)" }}>
            {run.lastRun ? `Last run ${runTime(run.lastRun)}. ` : ""}
            {run.latestPriceDate ? `Prices cover up to ${dayLong(run.latestPriceDate)}.` : ""}
            {never.length ? ` Never run: ${listJoin(never.map(stepName))}.` : ""}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 48 }}>
        <h2 className="sec-title" style={{ marginBottom: 20 }}>Steps</h2>
        <TablePanel minWidth={860}>
          <table className="tbl">
            <thead>
              <tr><th>Step</th><th>Source</th><th>Last run</th><th>Status</th><th style={{ width: "40%" }}>What it found</th></tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <tr key={s.step}>
                  <td style={{ fontWeight: 600 }}>{stepName(s.step)}</td>
                  <td className="text-2">{STEP_INFO[s.step]?.source ?? "–"}</td>
                  <td className="mono" style={{ fontSize: 14 }}>{runTime(s.ran_at)}</td>
                  <td>{s.status === "ok" ? <Tag kind="up" strong>OK</Tag> : <Tag kind="down" strong>Failed</Tag>}</td>
                  <td style={{ fontSize: 15, color: "var(--neutral)" }}>{facts ? found(s, facts) : s.detail}</td>
                </tr>
              ))}
              {!steps.length && <tr className="empty-row"><td colSpan={5}>No runs logged yet.</td></tr>}
            </tbody>
          </table>
        </TablePanel>
      </section>

      <section style={{ paddingTop: 56 }}>
        <h2 className="sec-title">Sources that can break</h2>
        <p className="sec-sub">These depend on websites that can change without notice.</p>
        <div className="lines">
          {FRAGILE.map((f) => (
            <div key={f.name} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1fr) 3fr", gap: "12px 32px", padding: "18px 0" }}>
              <span style={{ fontWeight: 600 }}>{f.name}</span>
              <span className="text-2">{f.text}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
