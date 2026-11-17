"use client";

import { useActionState } from "react";
import { importHoldings, type FormState } from "@/app/portfolio/actions";
import HoldingPicker from "./HoldingPicker";

function Status({ s }: { s: FormState }) {
  return (
    <p role="status" style={{ fontSize: 14, minHeight: "1.5em", margin: "10px 0 0" }}>
      {s.ok && <span className="up">{s.ok} </span>}
      {s.error && <span className="down">{s.error}</span>}
    </p>
  );
}

export default function HoldingForms({
  symbols, held,
}: { symbols: { symbol: string; name: string }[]; held: Record<string, { qty: number; avg: number }> }) {
  const [impState, imp, importing] = useActionState(importHoldings, {});

  return (
    <section className="cols" style={{ gap: 32, marginTop: 56 }}>
      <HoldingPicker items={symbols} held={held} />

      <form action={imp} className="panel panel-pad" aria-labelledby="imp-h">
        <h2 className="panel-title" id="imp-h" style={{ marginBottom: 6 }}>Import from a paste</h2>
        <p style={{ margin: "0 0 16px", fontSize: 14, color: "var(--text-2)" }}>
          One holding per line: symbol or company name, quantity, average cost. A broker holdings export (Zerodha,
          Groww) also works; names like “SUN PHARMA. INDS.” are matched to their NSE symbol. Existing holdings are updated.
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
