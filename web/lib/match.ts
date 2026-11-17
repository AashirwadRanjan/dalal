/**
 * Resolve what a broker export calls a stock ("SUN PHARMA. INDS.", "HDFC BANK") to an NSE symbol.
 * 1. Exact NSE symbol.  2. Exact company name (ignoring punctuation and "Ltd").
 * 3. Abbreviated name: every word of the input starts a word of the company name, in order, with the first
 *    words lining up ("INDS" fits "Industries", "LABS" fits "Laboratories"). Accepted only when exactly one
 *    company fits; anything ambiguous is reported, never guessed.
 */
export type Instrument = { symbol: string; name: string };
export type Resolved =
  | { ok: true; symbol: string; how: "symbol" | "name" }
  | { ok: false; reason: "none" | "ambiguous"; candidates: string[] };

const DROP = new Set(["LTD", "LIMITED", "THE", "CO", "INC", "PVT", "PRIVATE"]);

export const words = (s: string) =>
  s
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['’`]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !DROP.has(w));

/** "INDS" -> also try "IND", so plural abbreviations match ("LABS" -> Laboratories). */
const fits = (q: string, n: string) => n.startsWith(q) || (q.length > 3 && q.endsWith("S") && n.startsWith(q.slice(0, -1)));

export function abbreviates(q: string[], n: string[]): boolean {
  if (!q.length || !n.length || !fits(q[0], n[0])) return false;
  let j = 1;
  for (let i = 1; i < q.length; i++) {
    while (j < n.length && !fits(q[i], n[j])) j++;
    if (j >= n.length) return false;
    j++;
  }
  return true;
}

export function resolveStock(raw: string, list: Instrument[]): Resolved {
  const sym = raw.trim().toUpperCase().replace(/\.(NS|BO)$/, "").replace(/-(EQ|BE|BZ)$/, "");
  if (list.some((i) => i.symbol === sym)) return { ok: true, symbol: sym, how: "symbol" };

  const q = words(raw);
  if (!q.length) return { ok: false, reason: "none", candidates: [] };
  const key = q.join(" ");
  const exact = list.filter((i) => words(i.name).join(" ") === key);
  if (exact.length === 1) return { ok: true, symbol: exact[0].symbol, how: "name" };

  const fuzzy = list.filter((i) => abbreviates(q, words(i.name)));
  if (fuzzy.length === 1) return { ok: true, symbol: fuzzy[0].symbol, how: "name" };
  if (fuzzy.length > 1) return { ok: false, reason: "ambiguous", candidates: fuzzy.slice(0, 4).map((i) => i.symbol) };
  return { ok: false, reason: "none", candidates: [] };
}
