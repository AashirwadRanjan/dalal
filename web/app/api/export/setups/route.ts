import { getSetups } from "@/lib/db";
import { csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Today's setups as CSV. Entry is the setup-day close; a trade would enter at the next open. */
export function GET() {
  const s = getSetups();
  const date = s[0]?.date ?? "none";
  return csvResponse(
    toCsv(
      ["date", "symbol", "name", "sector", "side", "fno", "pattern", "trend", "entry_ref_close", "stop", "target", "risk_pct", "reward_vs_risk", "volume_vs_20d"],
      s.map((x) => [
        x.date, x.symbol, x.name, x.sector, x.side, x.fno ? "yes" : "no", x.pattern, x.trend, x.entry, x.stop, x.target,
        ((Math.abs(x.entry - x.stop) / x.entry) * 100).toFixed(2),
        (Math.abs(x.target - x.entry) / Math.abs(x.entry - x.stop)).toFixed(2), x.volx?.toFixed(2),
      ])
    ),
    `dalal-setups-${date}.csv`
  );
}
