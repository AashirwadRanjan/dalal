"use server";

import { revalidatePath } from "next/cache";
import { getInstruments } from "@/lib/db";
import { resolveStock } from "@/lib/match";
import { deleteHolding, normSymbol, parseHoldings, upsertHolding } from "@/lib/portfolio";

export type FormState = { ok?: string; error?: string };

const whyNot = (raw: string, r: ReturnType<typeof resolveStock>) =>
  r.ok ? "" : r.reason === "ambiguous" ? `${raw} (could be ${r.candidates.join(", ")}; use the symbol)` : raw;

export async function addHolding(_: FormState, fd: FormData): Promise<FormState> {
  const raw = String(fd.get("symbol") ?? "").trim();
  const qty = Number(fd.get("qty")), avg = Number(fd.get("avg"));
  if (!raw) return { error: "Enter a stock symbol or company name." };
  const r = resolveStock(raw, getInstruments());
  if (!r.ok)
    return {
      error: r.reason === "ambiguous"
        ? `“${raw}” could be ${r.candidates.join(", ")}. Enter the NSE symbol.`
        : `“${raw}” isn't an NSE-listed stock. Check the name or use the NSE symbol.`,
    };
  const symbol = r.symbol;
  if (!(qty > 0)) return { error: "Quantity must be more than 0." };
  if (!(avg > 0)) return { error: "Average price must be more than 0." };
  upsertHolding(symbol, qty, avg);
  revalidatePath("/portfolio");
  const later = !getInstruments().find((i) => i.symbol === symbol)?.priced ? " Its prices load with the next Fetch latest." : "";
  return { ok: `Saved ${symbol}${r.how === "name" ? ` (matched from “${raw}”)` : ""}: ${qty} at ₹${avg}.${later}` };
}

export async function importHoldings(_: FormState, fd: FormData): Promise<FormState> {
  const { rows, errors } = parseHoldings(String(fd.get("csv") ?? ""));
  if (!rows.length && !errors.length) return { error: "Paste at least one line." };
  const list = getInstruments();
  const resolved = rows.map((row) => ({ row, r: resolveStock(row.raw, list) }));
  const good = resolved.filter((x) => x.r.ok) as { row: (typeof rows)[number]; r: { ok: true; symbol: string; how: "symbol" | "name" } }[];
  const bad = resolved.filter((x) => !x.r.ok).map((x) => whyNot(x.row.raw, x.r));
  for (const { row, r } of good) upsertHolding(r.symbol, row.qty, row.avg);
  revalidatePath("/portfolio");
  const byName = good.filter((x) => x.r.how === "name").map((x) => `${x.row.raw} → ${x.r.symbol}`);
  const problems = [...errors, ...(bad.length ? [`Not found among NSE-listed stocks, skipped: ${bad.join(", ")}`] : [])];
  return {
    ok: good.length
      ? `Imported ${good.length} holding${good.length > 1 ? "s" : ""}.${byName.length ? ` Matched by company name: ${byName.join(", ")}.` : ""}`
      : undefined,
    error: problems.length ? problems.join(" · ") : undefined,
  };
}

export async function removeHolding(fd: FormData) {
  const symbol = normSymbol(String(fd.get("symbol") ?? ""));
  if (!/^[A-Z0-9&-]{1,20}$/.test(symbol)) return;
  deleteHolding(symbol);
  revalidatePath("/portfolio");
}
