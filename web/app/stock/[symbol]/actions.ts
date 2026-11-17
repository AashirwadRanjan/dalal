"use server";

import { revalidatePath } from "next/cache";
import { getInstruments } from "@/lib/db";
import { normSymbol, setWatched } from "@/lib/portfolio";

/** Star button: add or remove a stock from the watchlist (stored in data/portfolio.db). */
export async function toggleWatch(fd: FormData) {
  const symbol = normSymbol(String(fd.get("symbol") ?? ""));
  if (!getInstruments().some((i) => i.symbol === symbol)) return;
  setWatched(symbol, fd.get("on") === "1");
  revalidatePath(`/stock/${encodeURIComponent(symbol)}`);
  revalidatePath("/");
}
