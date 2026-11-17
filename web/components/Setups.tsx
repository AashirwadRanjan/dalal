import Link from "next/link";
import type { PatternStats, Setup } from "@/lib/db";
import { PATTERN_LABEL, inr, rMult, tone } from "@/lib/format";

export default function Setups({ setups, stats }: { setups: Setup[]; stats: PatternStats[] }) {
  const byPattern = Object.fromEntries(stats.map((s) => [s.pattern, s]));
  const date = setups[0]?.date;

  return (
    <section className="setups">
      <h2>Today&apos;s setups</h2>
      <p className="sub">
        {date ? <>Signals from the {date} close; a trade would enter at the next open. </> : null}
        The Backtest column shows how each pattern did in the{" "}
        <Link href="/backtest">2-year backtest</Link>. A negative average means it lost money after costs.
      </p>
      {setups.length === 0 ? (
        <p className="muted">No patterns fired on the latest close.</p>
      ) : (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th>Pattern</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>Target</th>
                <th>Risk</th>
                <th title="Reward to risk: (target − entry) ÷ (entry − stop)">R:R</th>
                <th title="This pattern's 2-year backtest: win rate, then average result per trade">Backtest</th>
              </tr>
            </thead>
            <tbody>
              {setups.map((s) => {
                const st = byPattern[s.pattern];
                const risk = s.entry - s.stop;
                return (
                  <tr key={s.symbol + s.pattern}>
                    <td>
                      <Link href={`/stock/${encodeURIComponent(s.symbol)}`}>{s.symbol}</Link>
                      <span className="name detail" title={s.detail}>{s.detail}</span>
                    </td>
                    <td>{PATTERN_LABEL[s.pattern] ?? s.pattern}</td>
                    <td className="num">{inr(s.entry)}</td>
                    <td className="num">{inr(s.stop)}</td>
                    <td className="num">{inr(s.target)}</td>
                    <td className="num">{((risk / s.entry) * 100).toFixed(1)}%</td>
                    <td className="num">{((s.target - s.entry) / risk).toFixed(1)}</td>
                    <td className="num">
                      {st?.win_rate == null ? "–" : `${st.win_rate}% won · `}
                      <span className={tone(st?.avg_r)}>{rMult(st?.avg_r)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
