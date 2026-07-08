import { useState } from 'react';
import { useUpdateTicket } from '../lib/hooks';
import { Button, Modal } from './ui';
import type { Ticket } from '../lib/types';

/**
 * Edit an existing ticket's fields — ported from editTicketDetailSpec
 * (detail + colour/spec with propagate-to-parts) extended with labour hours
 * and unit price per the parity plan.
 */
export function EditTicketModal({
  ticket,
  parts = [],
  onClose,
}: {
  ticket: Ticket;
  parts?: Ticket[];
  onClose: () => void;
}) {
  const update = useUpdateTicket(ticket.orderId);
  const [detail, setDetail] = useState(ticket.detail);
  const [spec, setSpec] = useState(ticket.spec ?? '');
  const [hrs, setHrs] = useState(String(ticket.hrs ?? 0));
  const [unitPrice, setUnitPrice] = useState(String(ticket.unitPrice ?? 0));
  const [propagate, setPropagate] = useState(true);
  const [err, setErr] = useState(false);

  const field = 'mt-1 w-full rounded-md border border-border2 bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal';

  async function save() {
    const d = detail.trim();
    if (!d) {
      setErr(true);
      return;
    }
    const specVal = spec.trim() || null;
    await update.mutateAsync({
      ticketId: ticket.id,
      input: { detail: d, spec: specVal, hrs: Number(hrs) || 0, unitPrice: Number(unitPrice) || 0 },
    });
    // Colour replicates across all parts when ticked (prototype behaviour).
    if (propagate && parts.length) {
      for (const p of parts) {
        await update.mutateAsync({ ticketId: p.id, input: { spec: specVal } });
      }
    }
    onClose();
  }

  return (
    <Modal
      title={`Edit — ${ticket.type} #${ticket.tn ?? 'TBC'}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={update.isPending} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="mb-2.5">
        <label className="text-[11px] font-semibold text-text2">Detail / Description</label>
        <input
          value={detail}
          autoFocus
          onChange={(e) => { setDetail(e.target.value); setErr(false); }}
          className={`${field} ${err ? 'border-red' : ''}`}
        />
        {err && <div className="mt-1 text-[11px] text-red">Detail is required</div>}
      </div>
      <div className="mb-2.5">
        <label className="text-[11px] font-semibold text-text2">Colour / Spec / Theme</label>
        <input value={spec} placeholder="e.g. RAL 5002 Dark Blue" onChange={(e) => setSpec(e.target.value)} className={field} />
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-text2">Labour hours</label>
          <input type="number" min={0} step="0.25" value={hrs} onChange={(e) => setHrs(e.target.value)} className={field} />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-text2">Unit price £</label>
          <input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={field} />
        </div>
      </div>
      {parts.length > 0 && (
        <div className="rounded-lg border border-border bg-surface2 px-3 py-2.5">
          <div className="mb-1.5 text-[11px] font-bold">Apply spec to all {parts.length} parts?</div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="h-[15px] w-[15px] accent-teal" checked={propagate} onChange={(e) => setPropagate(e.target.checked)} />
            Update spec on all part tickets (colour will replicate across all parts)
          </label>
        </div>
      )}
      {update.isError && <div className="mt-2 text-[11px] text-red">Save failed — {(update.error as Error).message}</div>}
    </Modal>
  );
}
