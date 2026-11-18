"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { abbreviates, words } from "@/lib/match";

type Item = { symbol: string; name: string };

/** Up to 5 matches: symbol prefix first, then symbol contains, then name contains. */
export function matchStocks<T extends Item>(items: T[], q: string, limit = 5): T[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  const score = (i: T) => {
    const s = i.symbol.toLowerCase(), nm = i.name.toLowerCase();
    if (s === n) return 0;
    if (s.startsWith(n)) return 1;
    if (nm.startsWith(n)) return 2;
    if (s.includes(n)) return 3;
    if (nm.includes(n)) return 4;
    if (abbreviates(words(q), words(i.name))) return 5; // "dr reddy labs" -> Dr. Reddy's Laboratories
    return 9;
  };
  return items
    .map((i) => [score(i), i] as const)
    .filter(([s]) => s < 9)
    .sort((a, b) => a[0] - b[0] || a[1].symbol.localeCompare(b[1].symbol))
    .slice(0, limit)
    .map(([, i]) => i);
}

/** Header search: ARIA combobox. Arrow keys move, Enter opens /stock/[symbol], Escape closes. */
export default function SearchBox({ items }: { items: Item[] }) {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = useMemo(() => matchStocks(items, q), [items, q]);
  const showList = open && q.trim().length > 0;

  const go = (symbol: string) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(`/stock/${encodeURIComponent(symbol)}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const m = matches[active];
      if (m) {
        e.preventDefault();
        go(m.symbol);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="search">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" />
        <path d="m12.5 12.5 4 4" />
      </svg>
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-label="Search any stock by name or symbol"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && matches[active] ? `${id}-opt-${active}` : undefined}
        placeholder="Search any stock"
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
      />
      {showList && (
        <ul id={listId} role="listbox" className="search-list" aria-label="Matching stocks">
          {matches.length === 0 ? (
            <li className="empty" role="option" aria-selected={false} aria-disabled="true">
              No stock matches “{q.trim()}”.
            </li>
          ) : (
            matches.map((m, i) => (
              <li
                key={m.symbol}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(m.symbol)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="sym">{m.symbol}</span>
                <span className="nm">{m.name}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
