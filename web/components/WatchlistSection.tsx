import Link from "next/link";
import { getSetups, getStates } from "@/lib/db";
import { PATTERN_LABEL, inr } from "@/lib/format";
import { listWatchlist } from "@/lib/portfolio";
import { ChangeFigure, TablePanel, Trend } from "./ui";

/** Today: the stocks you starred, with today's move, trend and any setup that fired. */
export default function WatchlistSection() {
  const items = listWatchlist();
  const states = new Map(getStates().map((s) => [s.symbol, s]));
  const setups = getSetups();
  return (
    <section className="sec" aria-labelledby="watch-h">
      <h2 className="sec-title" id="watch-h">Your watchlist</h2>
      {items.length === 0 ? (
        <p className="sec-sub" style={{ marginBottom: 0 }}>
          Nothing here yet. Open any stock and use “Add to watchlist” to follow it here.
        </p>
      ) : (
        <>
          <p className="sec-sub">Stocks you starred, as of the latest close.</p>
          <TablePanel minWidth={640}>
            <table className="tbl">
              <thead>
                <tr><th>Stock</th><th className="r">Price</th><th className="r">Today</th><th>Trend</th><th>Setup today</th></tr>
              </thead>
              <tbody>
                {items.map((w) => {
                  const st = states.get(w.symbol);
                  const fired = setups.filter((s) => s.symbol === w.symbol).map((s) => `${s.side === "short" ? "Short" : "Long"}: ${PATTERN_LABEL[s.pattern].toLowerCase()}`);
                  return (
                    <tr key={w.symbol}>
                      <td>
                        <Link className="sym" href={`/stock/${encodeURIComponent(w.symbol)}`}>{w.symbol}</Link>
                        <span className="nm">{st?.name ?? "No prices yet: use Fetch latest"}</span>
                      </td>
                      <td className="n">{inr(st?.close)}</td>
                      <td className="r"><ChangeFigure value={st?.chg_1d != null ? st.chg_1d * 100 : null} /></td>
                      <td><Trend trend={st?.trend} /></td>
                      <td style={{ fontSize: 15 }}>{fired.length ? fired.join(", ") : <span className="muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TablePanel>
        </>
      )}
    </section>
  );
}
