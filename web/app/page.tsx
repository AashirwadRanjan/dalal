import FlowBars from "@/components/FlowBars";
import Screener from "@/components/Screener";
import { change, crore, inr, pct, tone } from "@/lib/format";
import { getFlows, getFreshness, getScreener, getSeries, hasDb } from "@/lib/db";

export const dynamic = "force-dynamic"; // always read the latest DB

export default function Home() {
  if (!hasDb()) {
    return (
      <main className="wrap">
        <div className="top"><span className="brand">Dalal</span></div>
        <div className="empty">
          <p><strong>No data yet.</strong> The engine creates the database on its first run:</p>
          <p><code>python -m engine.run_daily --backfill</code></p>
          <p className="muted">Run it from the repo root, then refresh this page.</p>
        </div>
      </main>
    );
  }

  const india = getSeries("india");
  const global = getSeries("global");
  const flows = getFlows(20);
  const stocks = getScreener();
  const fresh = getFreshness();
  const lastFlow = flows[flows.length - 1];

  return (
    <main className="wrap">
      <header className="top">
        <span className="brand">Dalal</span>
        <span className="asof">
          Prices as of {fresh.latestPriceDate ?? "–"}
          {fresh.failedSteps.length > 0 && (
            <span className="warn"> · last run failed: {fresh.failedSteps.join(", ")}</span>
          )}
        </span>
      </header>

      <div className="strip">
        {india.map((s) => {
          const c = change(s.close, s.prev);
          return (
            <div key={s.symbol}>
              <div className="label">{s.name}</div>
              <div className="value num">{inr(s.close)}</div>
              <div className={`delta num ${tone(c)}`}>{pct(c)}</div>
            </div>
          );
        })}
      </div>

      <div className="cols">
        <section className="flows">
          <h2>FII and DII net flows</h2>
          <p className="sub">
            Cash market, last {flows.length} trading days.
            {lastFlow && (
              <>
                {" "}Latest ({lastFlow.date}): FII <span className={`num ${tone(lastFlow.fii_net)}`}>{crore(lastFlow.fii_net)}</span>, DII{" "}
                <span className={`num ${tone(lastFlow.dii_net)}`}>{crore(lastFlow.dii_net)}</span>.
              </>
            )}
          </p>
          {flows.length > 0 ? (
            <>
              <div className="legend">
                <span><i style={{ background: "var(--link)" }} />FII</span>
                <span><i style={{ background: "var(--dii)" }} />DII</span>
              </div>
              <FlowBars rows={flows} />
            </>
          ) : (
            <p className="muted">No flow data yet. It builds up one day per run.</p>
          )}
        </section>

        <section>
          <h2>Global cues</h2>
          <ul className="cues">
            {global.map((s) => {
              const c = change(s.close, s.prev);
              return (
                <li key={s.symbol}>
                  <span>{s.name}</span>
                  <span className="num">{inr(s.close)}</span>
                  <span className={`num ${tone(c)}`}>{pct(c)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <Screener rows={stocks} />
    </main>
  );
}
