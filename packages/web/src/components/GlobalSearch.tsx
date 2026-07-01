import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearch } from '../lib/hooks';
import { StatusPill } from './ui';

/**
 * Top-bar global search. Live typeahead (like the prototype's globalSearch) —
 * matches orders (number / site) and tickets (number / detail) as you type and
 * jumps to the record on click. Enter opens the full results page.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const term = q.trim();
  const { data, isFetching } = useSearch(term);
  const orders = (data?.orders ?? []).slice(0, 6);
  const tickets = (data?.tickets ?? []).slice(0, 6);
  const hasResults = orders.length > 0 || tickets.length > 0;

  // Close on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function go(path: string) {
    setOpen(false);
    setQ('');
    navigate(path);
  }

  return (
    <div ref={boxRef} className="relative w-52">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (term) go(`/search?q=${encodeURIComponent(term)}`);
        }}
      >
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => term && setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="Ticket # or order / site…"
          className="w-full rounded-md border border-border2 bg-surface2 px-2.5 py-1.5 text-xs outline-none focus:border-teal"
        />
      </form>

      {open && term.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[26rem] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {!hasResults ? (
            <div className="px-3 py-4 text-center text-xs text-text3">
              {isFetching ? 'Searching…' : `No matches for “${term}”.`}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto py-1">
              {orders.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-text3">Orders</div>
                  {orders.map((o) => (
                    <button
                      key={`o-${o.id}`}
                      onClick={() => go(`/orders/${o.id}`)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-teal-l/40"
                    >
                      <span className="font-semibold">{o.orderNumber}</span>
                      <span className="flex-1 truncate text-text3">{o.siteName ?? '—'}</span>
                      <StatusPill status={o.status} />
                    </button>
                  ))}
                </div>
              )}
              {tickets.length > 0 && (
                <div>
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-text3">Tickets</div>
                  {tickets.map((t) => (
                    <button
                      key={`t-${t.id}`}
                      onClick={() => go(`/orders/${t.orderId}`)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-teal-l/40"
                    >
                      <span className="w-8 shrink-0 tabular-nums text-text3">{t.tn ?? '—'}</span>
                      <span className="flex-1 truncate">{t.detail}</span>
                      <span className="shrink-0 text-text3">{t.order?.orderNumber ?? `#${t.orderId}`}</span>
                      <StatusPill status={t.status} />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => go(`/search?q=${encodeURIComponent(term)}`)}
                className="mt-1 w-full border-t border-border px-3 py-1.5 text-center text-[11px] font-medium text-teal hover:bg-teal-l/30"
              >
                See all results for “{term}” →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
