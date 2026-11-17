"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/brief", label: "Daily brief" },
  { href: "/outlook", label: "Outlook" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/backtest", label: "Backtest" },
];

export default function Nav({ children }: { children?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="top">
      <div className="navrow">
        <Link href="/" className="brand">Dalal</Link>
        <nav aria-label="Sections">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </header>
  );
}
