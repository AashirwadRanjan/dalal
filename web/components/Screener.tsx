"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ScreenerRow } from "@/lib/db";
import { change, inr, pct, tone } from "@/lib/format";

type Key = "symbol" | "close" | "chg" | "volx";
type Row = ScreenerRow & { chg: number | null; volx: number | null };

const COLS: { key: Key; label: string }[] = [
  { key: "symbol", label: "Stock" },
  { key: "close", label: "Close" },
  { key: "chg", label: "1D change" },
  { key: "volx", label: "Volume vs 20D avg" },
];

export default function Screener({ rows }: { rows: ScreenerRow[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "chg", dir: -1 });

  const data: Row[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        chg: change(r.close, r.prev_close),
        volx: r.volume != null && r.avg_vol ? r.volume / r.avg_vol : null,
      })),
    [rows]
  );
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = data.filter(
      (r) =>
        (!sector || r.sector === sector) &&
        (!needle || r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle))
    );
    out.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // blanks always last
      if (bv == null) return -1;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
    return out;
  }, [data, q, sector, sort]);

  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "symbol" ? 1 : -1 }));

  return (
    <section className="screener">
      <h2>Stocks</h2>
      <div className="controls">
        <input
          type="search"
          placeholder="Search symbol or company"
          aria-label="Search symbol or company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Filter by sector" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All sectors</option>
          {sectors.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  <button onClick={() => toggle(c.key)}>
                    {c.label}
                    {sort.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th>Sector</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.symbol}>
                <td>
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                  <span className="name">{r.name}</span>
                </td>
                <td className="num">{inr(r.close)}</td>
                <td className={`num ${tone(r.chg)}`}>{pct(r.chg)}</td>
                <td className="num">{r.volx == null ? "–" : `${r.volx.toFixed(1)}x`}</td>
                <td className="muted" style={{ textAlign: "left" }}>{r.sector}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={5} className="muted">No stocks match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="sub" style={{ marginTop: 8 }}>{shown.length} of {rows.length} stocks</p>
    </section>
  );
}
