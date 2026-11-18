import type { Metadata } from "next";
import OutlookTabs, { type OutlookGroup, type OutlookRow } from "@/components/OutlookTabs";
import { PageHead } from "@/components/ui";
import { getSetups, getStates, type StockState } from "@/lib/db";
import { PATTERN_LABEL, frac, inr, pct, toneOf } from "@/lib/format";
import { LEADER_RS, WEAK_RS, atrFrom50, outlookGroups } from "@/lib/outlook";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Outlook" };

const row = (s: StockState, extra: string): OutlookRow => ({
  symbol: s.symbol, name: s.name, price: inr(s.close), ret6m: frac(s.ret_6m), retTone: toneOf(s.ret_6m),
  rs: s.rs_pct, trend: s.trend, extra,
});

export default async function OutlookPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const g = outlookGroups(getStates(), getSetups());
  const from200 = (s: StockState) => (s.dma200 ? pct(((s.close - s.dma200) / s.dma200) * 100, 1) : "–");

  const groups: OutlookGroup[] = [
    {
      id: "leaders", label: "Leaders", count: g.leaders.length, extraLabel: "Trailing stop",
      blurb: `The strongest 6-month performers, strength ${LEADER_RS} or higher, in an uptrend and above their trailing stop.`,
      rows: g.leaders.map((s) => row(s, inr(s.trail_stop))),
    },
    {
      id: "pullbacks", label: "Pullbacks", count: g.pullbacks.length, extraLabel: "From 50-day average",
      blurb: "Leaders that have cooled off and sit close to their 50-day average.",
      rows: g.pullbacks.map((s) => {
        const a = atrFrom50(s) ?? 0;
        return row(s, `${Math.abs(a).toFixed(1)} ATR ${a >= 0 ? "above" : "below"}`);
      }),
    },
    {
      id: "setups", label: "Uptrend setups", count: g.uptrendSetups.length, extraLabel: "Setup",
      blurb: "Setups that fired on a stock already in an uptrend. These have the cleanest context.",
      rows: g.uptrendSetups.map(({ setup, state }) => row(state, PATTERN_LABEL[setup.pattern])),
    },
    {
      id: "weak", label: "Weak stocks", count: g.weak.length, extraLabel: "From 200-day average",
      blurb: `The weakest 6-month performers, strength ${WEAK_RS} or lower. Shorting in India is only possible intraday or through futures.`,
      rows: g.weak.map((s) => row(s, from200(s))),
    },
    {
      id: "breakdowns", label: "Breakdowns", count: g.breakdowns.length, extraLabel: "Closed below",
      blurb: "Stocks that closed below their prior 20-day low on at least 1.5× usual volume on the latest day.",
      rows: g.breakdowns.map((s) => row(s, s.low20 != null ? `20-day low ${inr(s.low20)}` : "20-day low")),
    },
    {
      id: "shorts", label: "Short setups", count: g.shortSetups.length, extraLabel: "Setup",
      blurb:
        "Short setups on stocks with futures and options, the only way to hold a short overnight in India. In the 10-year " +
        "backtest every short rule lost money (see Backtest), so treat these as stocks to avoid, not as trades.",
      rows: g.shortSetups.map(({ setup, state }) => row(state, PATTERN_LABEL[setup.pattern])),
    },
  ];

  return (
    <main className="wrap">
      <PageHead
        title="Outlook"
        lede="Which stocks are leading, lagging or breaking down, judged by the last six months."
        aside={
          <div style={{ flex: "1 1 320px", maxWidth: 420, fontSize: 14, color: "var(--muted)" }}>
            <div style={{ color: "var(--neutral)", fontWeight: 600, marginBottom: 4 }}>How stocks are picked</div>
            Strength is the 6-month return ranked from 0 to 100 across {g.universe} stocks. Leaders score {LEADER_RS} or
            more, weak stocks {WEAK_RS} or less. A pullback is a leader trading within one daily swing (ATR, the average
            daily range) of its 50-day average.
          </div>
        }
      />
      <OutlookTabs groups={groups} initial={tab ?? "leaders"} />
    </main>
  );
}
