"use server";

import { revalidatePath } from "next/cache";
import { getInstruments } from "@/lib/db";
import { deleteHolding, normSymbol, parseHoldings, upsertHolding } from "@/lib/portfolio";

export type FormState = { ok?: string; error?: string };

const known = () => new Set(getInstruments().map((i) => i.symbol));

export async function addHolding(_: FormState, fd: FormData): Promise<FormState> {
  const symbol = normSymbol(String(fd.get("symbol") ?? ""));
  const qty = Number(fd.get("qty")), avg = Number(fd.get("avg"));
  if (!symbol) return { error: "Enter a stock symbol." };
  if (!known().has(symbol)) return { error: `${symbol} isn't in the Nifty 500 list, so there's no data to analyse it.` };
  if (!(qty > 0)) return { error: "Quantity must be more than 0." };
  if (!(avg > 0)) return { error: "Average price must be more than 0." };
  upsertHolding(symbol, qty, avg);
  revalidatePath("/portfolio");
  return { ok: `Saved ${symbol}: ${qty} at ₹${avg}.` };
}

export async function importHoldings(_: FormState, fd: FormData): Promise<FormState> {
  const { rows, errors } = parseHoldings(String(fd.get("csv") ?? ""));
  if (!rows.length && !errors.length) return { error: "Paste at least one line." };
  const k = known();
  const unknown = rows.filter((r) => !k.has(r.symbol)).map((r) => r.symbol);
  const good = rows.filter((r) => k.has(r.symbol));
  for (const r of good) upsertHolding(r.symbol, r.qty, r.avg);
  revalidatePath("/portfolio");
  const problems = [
    ...errors,
    ...(unknown.length ? [`Not in the Nifty 500 list, skipped: ${unknown.join(", ")}`] : []),
  ];
  return {
    ok: good.length ? `Imported ${good.length} holding${good.length > 1 ? "s" : ""}.` : undefined,
    error: problems.length ? problems.join(" · ") : undefined,
  };
}

export async function removeHolding(fd: FormData) {
  deleteHolding(String(fd.get("symbol")));
  revalidatePath("/portfolio");
}
