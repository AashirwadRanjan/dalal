"use client";

import { useActionState } from "react";
import { addHolding, importHoldings, type FormState } from "@/app/portfolio/actions";

function Status({ s }: { s: FormState }) {
  return (
    <p className="formstatus" role="status">
      {s.ok && <span className="up">{s.ok} </span>}
      {s.error && <span className="warn">{s.error}</span>}
    </p>
  );
}

export default function HoldingForms({ symbols }: { symbols: { symbol: string; name: string }[] }) {
  const [addState, add, adding] = useActionState(addHolding, {});
  const [impState, imp, importing] = useActionState(importHoldings, {});

  return (
    <div className="pfforms">
      <form action={add} className="pfadd">
        <h3>Add or update a holding</h3>
        <div className="row">
          <label>
            Stock
            <input name="symbol" list="symbols" placeholder="e.g. RELIANCE" required autoComplete="off" />
          </label>
          <label>
            Quantity
            <input name="qty" type="number" min="0" step="any" required inputMode="decimal" />
          </label>
          <label>
            Average price (₹)
            <input name="avg" type="number" min="0" step="any" required inputMode="decimal" />
          </label>
          <button disabled={adding}>{adding ? "Saving…" : "Save"}</button>
        </div>
        <datalist id="symbols">
          {symbols.map((s) => (
            <option key={s.symbol} value={s.symbol}>{s.name}</option>
          ))}
        </datalist>
        <Status s={addState} />
      </form>

      <form action={imp} className="pfimport">
        <h3>Or paste several</h3>
        <p className="sub">
          One per line as <code>SYMBOL, quantity, average price</code>, or paste your broker&apos;s holdings export
          (Zerodha, Groww and Upstox columns are recognised). Existing holdings are updated.
        </p>
        <textarea name="csv" rows={4} placeholder={"RELIANCE, 10, 2450\nTCS, 5, 3600"} />
        <button disabled={importing}>{importing ? "Importing…" : "Import"}</button>
        <Status s={impState} />
      </form>
    </div>
  );
}
