"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Trend } from "./ui";
import type { Setup } from "@/lib/db";
import { PATTERN_LABEL, PATTERN_ORDER, PATTERN_PLURAL, SIDE_OF, inr } from "@/lib/format";

type Sort = "volx" | "risk" | "rr";
type Side = "all" | "long" | "short";
type Row = Setup & { risk: number; rr: number };

/** Every setup from the latest close: long/short and pattern chips, "Uptrends only" toggle and a sort. */
export default function SetupsTable({ setups }: { setups: Setup[] }) {
  const [side, setSide] = useState<Side>("all");
  const [pat, setPat] = useState<string>("all");
  const [up, setUp] = useState(false);
  const [sort, setSort] = useState<Sort>("volx");

  const rows: Row[] = useMemo(
    // Distances, so the same maths works for shorts (stop above, target below)
    () => setups.map((s) => ({ ...s, risk: (Math.abs(s.entry - s.stop) / s.entry) * 100, rr: Math.abs(s.target - s.entry) / Math.abs(s.entry - s.stop) })),
    [setups]
  );
  const shown = useMemo(() => {
    const r = rows.filter(
      (x) => (side === "all" || x.side === side) && (pat === "all" || x.pattern === pat) && (!up || x.trend === "up")
    );
    return r.sort((a, b) => (sort === "risk" ? a.risk - b.risk : sort === "rr" ? b.rr - a.rr : (b.volx ?? 0) - (a.volx ?? 0)));
  }, [rows, side, pat, up, sort]);

  const nSide = (s: Side) => rows.filter((x) => s === "all" || x.side === s).length;
  const sides = (["all", "long", "short"] as const).map((id) => ({ id, label: `${id === "all" ? "All" : id === "long" ? "Long" : "Short"} ${nSide(id)}` }));
  const count = (p: string) => rows.filter((x) => x.pattern === p).length;
  const chips = [
    { id: "all", label: "Any pattern" },
    ...PATTERN_ORDER.filter((p) => count(p) && (side === "all" || SIDE_OF[p] === side)).map((p) => ({
      id: p, label: `${PATTERN_PLURAL[p][0].toUpperCase()}${PATTERN_PLURAL[p].slice(1)} ${count(p)}`,
    })),
  ];
  const pickSide = (s: Side) => {
    setSide(s);
    if (pat !== "all" && s !== "all" && SIDE_OF[pat] !== s) setPat("all");
  };

  return (
    <>
      <div className="filters">
        <div className="chips" role="group" aria-label="Long or short">
          {sides.map((c) => (
            <button key={c.id} type="button" className="chip" aria-pressed={side === c.id} onClick={() => pickSide(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
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
        <div className="tbl-pad" style={{ minWidth: 1020 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Stock</th><th>Side</th><th>Pattern</th><th>Trend</th><th className="r">Entry</th><th className="r">Stop</th>
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
                  <td>
                    <span className={`tag ${r.side === "long" ? "t-up" : "t-down"}`}>{r.side === "long" ? "Long" : "Short"}</span>
                    {r.side === "short" && !r.fno && <span className="nm" style={{ fontSize: 13 }}>No F&amp;O: intraday only</span>}
                  </td>
                  <td style={{ fontSize: 15 }}>{PATTERN_LABEL[r.pattern]}</td>
                  <td><Trend trend={r.trend} /></td>
                  <td className="n">{inr(r.entry)}</td>
                  <td className="n down">
                    {inr(r.stop)}
                    <span className="sub-n">{r.side === "short" ? "+" : "−"}{r.risk.toFixed(1)}%</span>
                  </td>
                  <td className="n up">{inr(r.target)}</td>
                  <td className="n">{r.rr.toFixed(1)} to 1</td>
                  <td className="n">{r.volx ? `${r.volx.toFixed(1)}×` : "–"}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr className="empty-row"><td colSpan={9}>No setups match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="note" role="status">
        Showing {shown.length} of {rows.length} setups. Entry is the next open after the setup; the price shown is the
        latest close. A short needs stock futures or puts to hold overnight; only F&amp;O stocks have them. 1 to 1 means the target is as far from the entry as the stop. Volume is the day’s volume compared
        with its 20-day average.
      </div>
    </>
  );
}
