import { advise } from "@/lib/advice";
import { getSetups, getStates } from "@/lib/db";
import { csvResponse, toCsv } from "@/lib/csv";
import { listHoldings } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

/** Holdings with value, P&L, weight and the rule result, as CSV. Data never leaves this machine. */
export function GET() {
  const states = new Map(getStates().map((s) => [s.symbol, s]));
  const setups = getSetups();
  const rows = listHoldings().map((h) => {
    const st = states.get(h.symbol);
    const value = h.qty * (st?.close ?? h.avg_price);
    return { h, st, value };
  });
  const total = rows.reduce((a, r) => a + r.value, 0);
  return csvResponse(
    toCsv(
      ["symbol", "name", "qty", "avg_cost", "price", "price_date", "value", "pnl", "pnl_pct", "weight_pct", "rule_says", "reason"],
      rows.map(({ h, st, value }) => {
        const weight = total ? (value / total) * 100 : 0;
        const a = advise(st, h.avg_price, weight, setups);
        const cost = h.qty * h.avg_price;
        return [h.symbol, st?.name, h.qty, h.avg_price, st?.close, st?.date, value.toFixed(2), (value - cost).toFixed(2),
          (((value - cost) / cost) * 100).toFixed(2), weight.toFixed(2), a.action, a.reason];
      })
    ),
    "dalal-holdings.csv"
  );
}
