/** Plain names and sources for each engine step (engine/run_daily.py), as worded on the Data health board. */
export const STEP_INFO: Record<string, { name: string; source: string }> = {
  instruments: { name: "Stock list", source: "NSE Nifty 500 file" },
  prices: { name: "Prices", source: "Yahoo Finance, end of day" },
  market_series: { name: "Indices and world", source: "Yahoo Finance" },
  fii_dii: { name: "Fund flows", source: "NSE website" },
  signals: { name: "Setups", source: "Computed from prices" },
  summary: { name: "Daily brief", source: "Computed from the other steps" },
};
export const STEP_ORDER = Object.keys(STEP_INFO);
export const stepName = (s: string) => STEP_INFO[s]?.name ?? s;

/** "Fund flows", "Fund flows and Prices", "A, B and C" */
export const listJoin = (xs: string[]) =>
  xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
