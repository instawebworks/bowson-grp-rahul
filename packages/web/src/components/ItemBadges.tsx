import type { Ticket } from '../lib/types';

/**
 * Type-count badges for an order's items — "Slide (Assembly) ×1", "Slide ×2",
 * "Raw Stock ×1" (ported from the prototype's itemSummary). Shared by the
 * All Orders table and the Dashboard's Recent Orders so they read identically.
 */

type ItemType = 'COMP' | 'MADE' | 'RAW' | 'PART';

const TYPE_BADGE: Record<ItemType, { bg: string; color: string; border: string; label: string }> = {
  COMP: { bg: '#e8f1fb', color: '#1558a0', border: '#93b8e8', label: 'Slide (Assembly)' },
  MADE: { bg: '#dff2eb', color: '#0c6b50', border: '#9fd4c2', label: 'Slide' },
  RAW: { bg: '#f0ede8', color: '#5c574f', border: '#c8c4bc', label: 'Raw Stock' },
  PART: { bg: '#f3f0fd', color: '#4a42b0', border: '#c4bef0', label: 'Part' },
};
const BADGE_ORDER: ItemType[] = ['COMP', 'MADE', 'RAW', 'PART'];

export type ItemCounts = Partial<Record<ItemType, number>>;

/** Count top-level tickets (excludes PART children) by type — for the Orders table. */
export function itemCounts(tickets: Ticket[]): ItemCounts {
  const counts: ItemCounts = {};
  for (const t of tickets) {
    if (t.compParentId != null) continue;
    const k = t.type as ItemType;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export function ItemBadges({ counts }: { counts: ItemCounts }) {
  const shown = BADGE_ORDER.filter((k) => (counts[k] ?? 0) > 0);
  if (!shown.length) return <span className="text-text3">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((k) => {
        const b = TYPE_BADGE[k];
        return (
          <span
            key={k}
            className="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: b.bg, color: b.color, border: `1px solid ${b.border}` }}
          >
            {b.label} ×{counts[k]}
          </span>
        );
      })}
    </span>
  );
}
