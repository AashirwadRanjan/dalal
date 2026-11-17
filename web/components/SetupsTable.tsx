"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Trend } from "./ui";
import type { Setup } from "@/lib/db";
import { PATTERN_LABEL, PATTERN_ORDER, PATTERN_PLURAL, inr } from "@/lib/format";

type Sort = "volx" | "risk" | "rr";
type Row = Setup & { risk: number; rr: number };

/** Every setup from the latest close: pattern chips, "Uptrends only" toggle and a sort. */
export default function SetupsTable({ setups }: { setups: Setup[] }) {
  const [pat, setPat] = useState<string>("all");
  const [up, setUp] = useState(false);
  const [sort, setSort] = useState<Sort>("volx");

  const rows: Row[] = useMemo(
    () => setups.map((s) => ({ ...s, risk: ((s.entry - s.stop) / s.entry) * 100, rr: (s.target - s.entry) / (s.entry - s.stop) })),
    [setups]
  );
  const shown = useMemo(() => {
    const r = rows.filter((x) => (pat === "all" || x.pattern === pat) && (!up || x.trend === "up"));
    return r.sort((a, b) => (sort === "risk" ? a.risk - b.risk : sort === "rr" ? b.rr - a.rr : (b.volx ?? 0) - (a.volx ?? 0)));
  }, [rows, pat, up, sort]);

  const count = (p: string) => rows.filter((x) => x.pattern === p).length;
  const chips = [
    { id: "all", label: `All ${rows.length}` },
    ...PATTERN_ORDER.filter(count).map((p) => ({ id: p, label: `${PATTERN_PLURAL[p][0].toUpperCase()}${PATTERN_PLURAL[p].slice(1)} ${count(p)}` })),
  ];

  return (
    <>
      <div className="filters">
        <div className="chips" role="group" aria-label="Filter by pattern">
          {chips.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={pat === c.id} onClick={() => setPat(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <button type="button" className="chip" aria-pressed={up} onClick={() => setUp(!up)}>
          Uptrends only
        </button>
        <label className="sort">
          Sort by
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort setups by">
            <option value="volx">Volume vs usual</option>
            <option value="risk">Risk %, lowest first</option>
            <option value="rr">Reward vs risk</option>
          </select>
        </label>
      </div>

      <div className="panel tbl-wrap" role="region" aria-label="Setups table" tabIndex={0}>
        <div className="tbl-pad" style={{ minWidth: 940 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Stock</th><th>Pattern</th><th>Trend</th><th className="r">Entry</th><th className="r">Stop</th>
                <th className="r">Target</th><th className="r">Reward vs risk</th><th className="r">Volume</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.symbol + r.pattern}>
                  <td>
                    <Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                    <span className="nm">{r.name}</span>
                  </td>
                  <td style={{ fontSize: 15 }}>{PATTERN_LABEL[r.pattern]}</td>
                  <td><Trend trend={r.trend} /></td>
                  <td className="n">{inr(r.entry)}</td>
                  <td className="n down">
                    {inr(r.stop)}
                    <span className="sub-n">−{r.risk.toFixed(1)}%</span>
                  </td>
                  <td className="n up">{inr(r.target)}</td>
                  <td className="n">{r.rr.toFixed(1)} to 1</td>
                  <td className="n">{r.volx ? `${r.volx.toFixed(1)}×` : "–"}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr className="empty-row"><td colSpan={8}>No setups match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="note" role="status">
        Showing {shown.length} of {rows.length} setups. Entry is the next open after the setup; the price shown is the
        latest close. 1 to 1 means the target is as far from the entry as the stop. Volume is the day’s volume compared
        with its 20-day average.
      </div>
    </>
  );
}
