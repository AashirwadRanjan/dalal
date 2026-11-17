"use client";

import { useActionState } from "react";
import { addHolding, importHoldings, type FormState } from "@/app/portfolio/actions";

function Status({ s }: { s: FormState }) {
  return (
    <p role="status" style={{ fontSize: 14, minHeight: "1.5em", margin: "10px 0 0" }}>
      {s.ok && <span className="up">{s.ok} </span>}
      {s.error && <span className="down">{s.error}</span>}
    </p>
  );
}

export default function HoldingForms({ symbols }: { symbols: { symbol: string; name: string }[] }) {
  const [addState, add, adding] = useActionState(addHolding, {});
  const [impState, imp, importing] = useActionState(importHoldings, {});

  return (
    <section className="cols" style={{ gap: 32, marginTop: 56 }}>
      <form action={add} className="panel panel-pad" aria-labelledby="add-h">
        <h2 className="panel-title" id="add-h">Add a holding</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label className="field">
            Stock symbol
            <input name="symbol" list="pf-symbols" placeholder="For example RELIANCE" required autoComplete="off" />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <label className="field" style={{ flex: "1 1 140px" }}>
              Quantity
              <input name="qty" type="number" min="0" step="any" inputMode="decimal" placeholder="30" required />
            </label>
            <label className="field" style={{ flex: "1 1 140px" }}>
              Average cost, ₹
              <input name="avg" type="number" min="0" step="any" inputMode="decimal" placeholder="1,180.00" required />
            </label>
          </div>
          <button className="btn btn-primary" style={{ alignSelf: "flex-start" }} disabled={adding}>
            {adding ? "Saving…" : "Add holding"}
          </button>
        </div>
        <datalist id="pf-symbols">
          {symbols.map((s) => (
            <option key={s.symbol} value={s.symbol}>{s.name}</option>
          ))}
        </datalist>
        <Status s={addState} />
      </form>

      <form action={imp} className="panel panel-pad" aria-labelledby="imp-h">
        <h2 className="panel-title" id="imp-h" style={{ marginBottom: 6 }}>Import from a paste</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-2)" }}>
          One holding per line: symbol, quantity, average cost. A broker holdings export (Zerodha, Groww) also works.
          Existing holdings are updated.
        </p>
        <label className="field">
          <span className="sr-only">Holdings to import</span>
          <textarea name="csv" rows={5} placeholder={"RELIANCE, 30, 1180\nTCS, 6, 3720"} />
        </label>
        <button className="btn btn-outline" style={{ marginTop: 16 }} disabled={importing}>
          {importing ? "Importing…" : "Import"}
        </button>
        <Status s={impState} />
      </form>
    </section>
  );
}
