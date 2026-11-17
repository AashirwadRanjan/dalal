"use client";

import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import { addHolding, type FormState } from "@/app/portfolio/actions";
import { matchStocks } from "./SearchBox";

type Item = { symbol: string; name: string };
type Held = Record<string, { qty: number; avg: number }>;

/**
 * Add a holding in two steps: search and pick the stock from a list, then enter quantity and average cost.
 * The search is an ARIA combobox (arrows, Enter, Escape). Only a picked stock can be saved, so typos can't slip in.
 */
export default function HoldingPicker({ items, held }: { items: Item[]; held: Held }) {
  const [state, action, saving] = useActionState<FormState, FormData>(addHolding, {});
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Item | null>(null);
  const id = useId();
  const search = useRef<HTMLInputElement>(null);
  const qty = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const matches = useMemo(() => matchStocks(items, q, 8), [items, q]);
  const showList = open && q.trim().length > 0;

  // After a successful save: clear the form and go back to searching for the next stock.
  useEffect(() => {
    if (state.ok) {
      form.current?.reset();
      setPicked(null);
      setQ("");
      setTimeout(() => search.current?.focus(), 0);
    }
  }, [state]);

  const pick = (m: Item) => {
    setPicked(m);
    setOpen(false);
    setQ("");
    setTimeout(() => qty.current?.focus(), 0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (matches[active]) pick(matches[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const current = picked ? held[picked.symbol] : undefined;

  return (
    <form ref={form} action={action} className="panel panel-pad" aria-labelledby="add-h">
      <h2 className="panel-title" id="add-h">Add a holding</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {!picked ? (
          <div className="field" style={{ position: "relative" }}>
            <label htmlFor={`${id}-q`}>Find the stock</label>
            <input
              ref={search}
              id={`${id}-q`}
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showList}
              aria-controls={`${id}-list`}
              aria-activedescendant={showList && matches[active] ? `${id}-o${active}` : undefined}
              placeholder="Type a name or symbol, e.g. Sun Pharma"
              autoComplete="off"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKey}
            />
            {showList && (
              <ul id={`${id}-list`} role="listbox" className="search-list" aria-label="Matching stocks">
                {matches.length === 0 ? (
                  <li className="empty" role="option" aria-selected={false} aria-disabled="true">
                    No stock matches “{q.trim()}”.
                  </li>
                ) : (
                  matches.map((m, i) => (
                    <li
                      key={m.symbol}
                      id={`${id}-o${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(m)}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="nm" style={{ color: "var(--text)", fontSize: 15 }}>{m.name}</span>
                      <span className="sym mono" style={{ fontSize: 13, color: "var(--text-2)" }}>
                        {m.symbol}{held[m.symbol] ? " · held" : ""}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        ) : (
          <div className="picked">
            <div>
              <div style={{ fontWeight: 600, fontSize: 17 }}>{picked.name}</div>
              <div className="mono muted" style={{ fontSize: 13 }}>{picked.symbol}</div>
            </div>
            <button type="button" className="chip" onClick={() => { setPicked(null); setTimeout(() => search.current?.focus(), 0); }}>
              Change
            </button>
            <input type="hidden" name="symbol" value={picked.symbol} />
          </div>
        )}

        {picked && current && (
          <p style={{ margin: 0, fontSize: 14, color: "var(--amber)" }}>
            You already hold {current.qty} at ₹{current.avg}. Saving replaces it with the numbers below.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <label className="field" style={{ flex: "1 1 140px" }}>
            Quantity
            <input ref={qty} name="qty" type="number" min="0" step="any" inputMode="decimal" placeholder="30" required disabled={!picked} />
          </label>
          <label className="field" style={{ flex: "1 1 140px" }}>
            Average cost, ₹
            <input name="avg" type="number" min="0" step="any" inputMode="decimal" placeholder="1,180.00" required disabled={!picked} />
          </label>
        </div>
        <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={!picked || saving}>
          {saving ? "Saving…" : current ? "Update holding" : "Add holding"}
        </button>
      </div>
      <p role="status" style={{ fontSize: 14, minHeight: "1.5em", margin: "10px 0 0" }}>
        {state.ok && <span className="up">{state.ok} </span>}
        {state.error && <span className="down">{state.error}</span>}
      </p>
    </form>
  );
}
