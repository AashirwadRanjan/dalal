import Link from "next/link";
import { getPatternStats } from "@/lib/db";
import { edgeSummary } from "@/lib/edge";
import { PATTERN_LABEL, rMult, tone } from "@/lib/format";

/**
 * Reality check, shown wherever setups appear. Every word and number comes from pattern_stats
 * through lib/edge.ts; nothing here is typed in.
 *   full: the Today panel with per-pattern win rate and average R
 *   band: the one-line strip used on Setups and the stock page
 */
export default function RealityCheck({ variant = "full" }: { variant?: "full" | "band" }) {
  const e = edgeSummary(getPatternStats());

  if (variant === "band") {
    return (
      <div className="band" role="note" aria-label="Reality check">
        <strong>Reality check</strong>
        <span className="txt">{e.stats.length ? e.band : e.lead}</span>
        <Link href="/backtest" style={{ fontSize: 15, fontWeight: 500 }}>See the backtest</Link>
      </div>
    );
  }

  return (
    <section className="reality" aria-labelledby="reality-title">
      <h2 id="reality-title">Reality check</h2>
      <p className="lead">{e.lead}</p>
      {e.stats.length > 0 && (
        <div className="stats">
          {e.stats.map((s) => (
            <div key={s.pattern}>
              <div className="stat-label">
                {PATTERN_LABEL[s.pattern]}, {s.trades.toLocaleString("en-IN")} trades
              </div>
              <div className="mono stat-big">{s.win_rate}% won</div>
              <div className={`mono ${tone(s.avg_r)}`} style={{ fontSize: 14 }}>
                avg {rMult(s.avg_r, 3)}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="foot-note">
        1R is the amount risked on a trade. Results use today&apos;s Nifty 500 list, which flatters them.{" "}
        <Link href="/backtest" style={{ fontWeight: 500 }}>See the full backtest</Link>
      </p>
    </section>
  );
}
