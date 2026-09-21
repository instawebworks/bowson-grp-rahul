import { useState, type ReactNode } from 'react';
import { Button } from './ui';
import { daysToDeadline } from '../lib/format';
import type { Order } from '../lib/types';

/**
 * Order grouping for the ticket lists (client snags #22-25): each list rolls
 * up to one row per order with the tickets in a drop-down underneath, so the
 * pages stay concise as the number of live tickets grows.
 */

export interface OrderGroup<T> {
  orderId: number;
  order: Order | undefined;
  items: T[];
}

/** Group items by order, preserving the first-seen order of the input. */
export function groupByOrder<T extends { orderId: number; order?: Order }>(items: T[]): OrderGroup<T>[] {
  const groups = new Map<number, OrderGroup<T>>();
  for (const it of items) {
    let g = groups.get(it.orderId);
    if (!g) {
      g = { orderId: it.orderId, order: it.order, items: [] };
      groups.set(it.orderId, g);
    }
    g.items.push(it);
  }
  return [...groups.values()];
}

/**
 * Open/closed state per order. Collapsed by default; `forceOpen` (e.g. while a
 * search or filter is active) shows everything so matches are never hidden.
 */
export function useOrderGroups(forceOpen = false, defaultOpen = false) {
  const [allOpen, setAllOpen] = useState(defaultOpen);
  // When allOpen, the set holds the exceptions (collapsed); otherwise the opened ones.
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  const isOpen = (orderId: number) => forceOpen || (allOpen ? !flipped.has(orderId) : flipped.has(orderId));
  const toggle = (orderId: number) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  const expandAll = () => { setAllOpen(true); setFlipped(new Set()); };
  const collapseAll = () => { setAllOpen(false); setFlipped(new Set()); };
  return { isOpen, toggle, expandAll, collapseAll, allOpen };
}

/** "Expand all / Collapse all" pair for a list toolbar. */
export function GroupControls({ onExpand, onCollapse }: { onExpand: () => void; onCollapse: () => void }) {
  return (
    <span className="flex gap-1">
      <Button onClick={onExpand} title="Show the tickets under every order">Expand all</Button>
      <Button onClick={onCollapse} title="Roll every order up to one row">Collapse all</Button>
    </span>
  );
}

/**
 * The one-row-per-order header. Spans the whole table; click anywhere on it
 * to open/close the order's tickets. `leading` is a slot for a checkbox,
 * `extra` for page-specific badges on the right.
 */
export function OrderGroupRow({
  order,
  orderId,
  count,
  countLabel = 'ticket',
  open,
  onToggle,
  colSpan,
  leading,
  extra,
  onOpenOrder,
}: {
  order: Order | undefined;
  orderId: number;
  count: number;
  countLabel?: string;
  open: boolean;
  onToggle: () => void;
  colSpan: number;
  leading?: ReactNode;
  extra?: ReactNode;
  onOpenOrder?: () => void;
}) {
  const deadline = order?.deadline?.slice(0, 10) ?? null;
  const days = daysToDeadline(deadline);
  const overdue = days !== null && days < 0 && !['Despatched', 'Completed', 'Cancelled'].includes(order?.status ?? '');
  return (
    <tr
      className="cursor-pointer select-none border-b border-border bg-surface2/70 hover:bg-teal-l/40"
      onClick={onToggle}
      title={open ? 'Collapse this order' : 'Expand to see its tickets'}
    >
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {leading && <span onClick={(e) => e.stopPropagation()}>{leading}</span>}
          <span className="w-3 text-center text-[10px] text-text3">{open ? '▾' : '▸'}</span>
          {onOpenOrder ? (
            <button
              className="font-bold text-teal hover:underline"
              onClick={(e) => { e.stopPropagation(); onOpenOrder(); }}
              title="Open order"
            >
              {order?.orderNumber ?? `#${orderId}`}
            </button>
          ) : (
            <span className="font-bold text-teal">{order?.orderNumber ?? `#${orderId}`}</span>
          )}
          <span className="max-w-48 truncate font-semibold">{order?.customer?.name ?? '—'}</span>
          {order?.siteName && <span className="max-w-48 truncate text-text2">{order.siteName}</span>}
          <span className="rounded-full bg-surface3 px-2 py-px text-[10px] font-bold text-text2">
            {count} {countLabel}{count === 1 ? '' : 's'}
          </span>
          {deadline && (
            <span className={`text-[11px] ${overdue ? 'font-bold text-red' : 'text-text3'}`}>
              Due {deadline}{overdue ? ` · ${-(days ?? 0)}d overdue` : ''}
            </span>
          )}
          {extra && <span className="ml-auto flex items-center gap-2">{extra}</span>}
        </div>
      </td>
    </tr>
  );
}
