import { useEffect, useState } from 'react';
import { useCatalogue, useOrder, useUpdateOrder } from '../lib/hooks';
import { Button, Modal } from './ui';
import type { PackingItem } from '../lib/types';

/** Prototype's default minimal hardware list. */
const DEFAULT_ITEMS: PackingItem[] = [
  { name: 'Bolt Pack', qty: 1, notes: '', checked: false },
  { name: 'Slide Feet', qty: 4, notes: '', checked: false },
  { name: 'Flange Supports', qty: 0, notes: '', checked: false },
];

/**
 * Packing checklist gate — ported from the prototype's showPackingChecklist.
 * Shown when a MADE / COMP ticket advances into "9. Packing": verify the
 * hardware, tick picked items, save the checklist + notes to the order, then
 * continue with the stage change (onConfirm).
 */
export function PackingChecklistModal({
  orderId,
  ticketTn,
  onConfirm,
  onCancel,
}: {
  orderId: number;
  ticketTn: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { data: order } = useOrder(orderId);
  const { data: catalogue } = useCatalogue();
  const update = useUpdateOrder(orderId);
  const [items, setItems] = useState<PackingItem[] | null>(null);
  const [notes, setNotes] = useState('');

  // Initialise once the order arrives: saved checklist → catalogue hardware
  // (matched by a ticket drawing ref prefix) → default minimal list.
  useEffect(() => {
    if (!order || items !== null) return;
    let hw: PackingItem[];
    if (order.packingChecklist?.length) {
      hw = order.packingChecklist.map((h) => ({ ...h }));
    } else {
      const tops = (order.tickets ?? []).filter((t) => t.compParentId == null);
      let tpl = null;
      for (const t of tops) {
        if (!t.drawing) continue;
        tpl = (catalogue ?? []).find((c) => c.productCode && t.drawing!.startsWith(c.productCode)) ?? null;
        if (tpl) break;
      }
      hw = tpl?.hardware?.length
        ? tpl.hardware.map((h) => ({ name: h.name, qty: h.qty, notes: h.notes ?? '', checked: false }))
        : DEFAULT_ITEMS.map((h) => ({ ...h }));
    }
    setItems(hw);
    setNotes(order.packingNotes ?? '');
  }, [order, catalogue, items]);

  const setItem = (i: number, patch: Partial<PackingItem>) =>
    setItems((prev) => (prev ? prev.map((h, j) => (j === i ? { ...h, ...patch } : h)) : prev));

  function confirm() {
    update.mutate(
      { packingChecklist: items ?? [], packingNotes: notes },
      { onSuccess: onConfirm },
    );
  }

  return (
    <Modal
      title={`📦 Packing Checklist — Ticket #${ticketTn ?? 'TBC'}`}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!items || update.isPending} onClick={confirm}>
            Confirm &amp; Advance to Packing
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-text2">
        Verify hardware required for packing. Tick items that have been picked and are ready to pack.
      </p>
      {!items ? (
        <div className="py-6 text-center text-xs text-text3">Loading…</div>
      ) : (
        <>
          <div className="mb-1 grid grid-cols-[24px_1fr_60px_1fr] items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-text3">
            <span />
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span>Notes</span>
          </div>
          {items.map((h, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_60px_1fr] items-center gap-2 border-b border-border py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-teal"
                checked={h.checked}
                onChange={(e) => setItem(i, { checked: e.target.checked })}
              />
              <span className="text-[13px] font-semibold">{h.name}</span>
              <input
                type="number"
                min={0}
                value={h.qty}
                onChange={(e) => setItem(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                className="rounded-md border border-border2 bg-surface px-1.5 py-1 text-right text-xs outline-none focus:border-teal"
              />
              <input
                type="text"
                value={h.notes}
                placeholder="Notes…"
                onChange={(e) => setItem(i, { notes: e.target.value })}
                className="rounded-md border border-border2 bg-surface px-2 py-1 text-xs outline-none focus:border-teal"
              />
            </div>
          ))}
          <div className="mt-3">
            <label className="text-xs font-semibold">Additional notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 min-h-[60px] w-full resize-y rounded-md border border-border2 bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal"
            />
          </div>
          {update.isError && (
            <div className="mt-2 text-[11px] text-red">Could not save checklist — {(update.error as Error).message}</div>
          )}
        </>
      )}
    </Modal>
  );
}
