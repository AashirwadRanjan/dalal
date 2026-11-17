"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Bar, Trend } from "./ui";

export type OutlookRow = {
  symbol: string; name: string; price: string; ret6m: string; retTone: "up" | "down" | "flat";
  rs: number | null; trend: string; extra: string;
};
export type OutlookGroup = { id: string; label: string; count: number; extraLabel: string; blurb: string; rows: OutlookRow[] };

const SHOW = 25;

/** Stat tabs (count + label) switching one table. Arrow keys move between tabs; the tab is kept in ?tab=. */
export default function OutlookTabs({ groups, initial }: { groups: OutlookGroup[]; initial: string }) {
  const [tab, setTab] = useState(groups.some((g) => g.id === initial) ? initial : groups[0].id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const g = groups.find((x) => x.id === tab)!;

  const pick = (id: string) => {
    setTab(id);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", id);
    window.history.replaceState(null, "", u);
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = groups.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    pick(groups[j].id);
    refs.current[j]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Outlook groups" className="stat-tabs">
        {groups.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="outlook-panel"
            tabIndex={tab === x.id ? 0 : -1}
            onClick={() => pick(x.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="mono stat-n">{x.count}</span>
            <span className="stat-l">{x.label}</span>
          </button>
        ))}
      </div>

      <section id="outlook-panel" role="tabpanel" aria-labelledby={`tab-${g.id}`} style={{ paddingTop: 32 }}>
        <p style={{ margin: "0 0 20px", fontSize: 17, color: "var(--neutral)" }}>{g.blurb}</p>
        <div className="panel tbl-wrap" role="region" aria-label={`${g.label} table`} tabIndex={0}>
          <div className="tbl-pad" style={{ minWidth: 880 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Stock</th><th className="r">Price</th><th className="r">6-month return</th>
                  <th style={{ width: "22%" }}>Strength, 0 to 100</th><th>Trend</th><th className="r">{g.extraLabel}</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.slice(0, SHOW).map((r) => (
                  <tr key={r.symbol}>
                    <td>
                      <Link className="sym" href={`/stock/${encodeURIComponent(r.symbol)}`}>{r.symbol}</Link>
                      <span className="nm">{r.name}</span>
                    </td>
                    <td className="n">{r.price}</td>
                    <td className={`n ${r.retTone}`}>{r.ret6m}</td>
                    <td>
                      <span style={{ display: "grid", gridTemplateColumns: "1fr 34px", gap: 10, alignItems: "center" }}>
                        <Bar value={(r.rs ?? 0) / 100} size="thin" />
                        <span className="mono" style={{ fontSize: 14, textAlign: "right" }}>{r.rs == null ? "–" : Math.round(r.rs)}</span>
                      </span>
                    </td>
                    <td><Trend trend={r.trend} /></td>
                    <td className="n">{r.extra}</td>
                  </tr>
                ))}
                {g.rows.length === 0 && <tr className="empty-row"><td colSpan={6}>No stocks in this group today.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="note">
          {g.rows.length > SHOW ? `Showing the top ${SHOW} of ${g.rows.length}. ` : ""}
          Outlook groups are rules, not predictions, and have not been backtested.
        </div>
      </section>
    </>
  );
}
