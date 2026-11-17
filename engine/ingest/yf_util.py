"""Shared yfinance helper: download daily OHLC for many tickers, in batches."""
import pandas as pd
import yfinance as yf


def fetch_ohlc(tickers: list[str], period: str, batch_size: int = 100) -> dict[str, pd.DataFrame]:
    out: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), batch_size):
        batch = tickers[i : i + batch_size]
        df = yf.download(
            batch,
            period=period,
            interval="1d",
            group_by="ticker",
            auto_adjust=False,  # raw (split-adjusted) prices, not dividend-adjusted
            progress=False,
            threads=True,
        )
        if df is None or df.empty:
            continue
        for t in batch:
            try:
                sub = df[t] if isinstance(df.columns, pd.MultiIndex) else df
            except KeyError:
                continue
            sub = sub.dropna(subset=["Close"])
            if not sub.empty:
                out[t] = sub
    return out


def _num(x):
    return None if pd.isna(x) else float(x)


def to_rows(df: pd.DataFrame):
    """Yield (date, open, high, low, close, volume) tuples."""
    for idx, r in df.iterrows():
        vol = r.get("Volume")
        yield (
            idx.strftime("%Y-%m-%d"),
            _num(r["Open"]),
            _num(r["High"]),
            _num(r["Low"]),
            _num(r["Close"]),
            None if pd.isna(vol) else int(vol),
        )
