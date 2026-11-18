import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap">
      <section className="page-head">
        <h1 className="page-title">Not found</h1>
        <p className="page-lede">
          There is no page or stock here. Dalal covers every NSE-listed stock; use the search box above to find a stock by name or
          symbol.
        </p>
        <p className="more-link"><Link href="/">Back to Today</Link></p>
      </section>
    </main>
  );
}
