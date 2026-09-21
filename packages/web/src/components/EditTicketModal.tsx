import { useState } from 'react';
import { RESIN_TYPES } from '@bowson/shared';
import { useUpdateTicket } from '../lib/hooks';
import { Button, Modal } from './ui';
import type { Ticket } from '../lib/types';

/**
 * Edit an existing ticket — ported from editTicketDetailSpec (detail +
 * colour/spec with propagate-to-parts) and extended so every editable field is
 * reachable from the T-Card board without leaving it (client snag #18):
 * quantity, unit price, the Laminating / Finishing labour split, drawing
 * reference, resin type and QC reference.
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
  const isRaw = ticket.type === 'RAW';
  const isComp = ticket.type === 'COMP';
  // Pre-split tickets carry only `hrs`: at-the-mould work for MADE/PART,
  // assembly (finishing) labour for a COMP — the same rule as remainingSplit.
  const preSplit = ticket.lamHrs == null && ticket.finHrs == null;
  const initLam = preSplit ? (isComp ? 0 : ticket.hrs ?? 0) : ticket.lamHrs ?? 0;
  const initFin = preSplit ? (isComp ? ticket.hrs ?? 0 : 0) : ticket.finHrs ?? 0;

  const [detail, setDetail] = useState(ticket.detail);
  const [spec, setSpec] = useState(ticket.spec ?? '');
  const [qty, setQty] = useState(String(ticket.qty || 1));
  const [unitPrice, setUnitPrice] = useState(String(ticket.unitPrice ?? 0));
  const [lam, setLam] = useState(String(initLam));
  const [fin, setFin] = useState(String(initFin));
  const [rawHrs, setRawHrs] = useState(String(ticket.hrs ?? 0));
  const [drawing, setDrawing] = useState(ticket.drawing ?? '');
  const [resin, setResin] = useState(ticket.resinType ?? '');
  const [qcRef, setQcRef] = useState(ticket.qcRef ?? '');
  const [propagate, setPropagate] = useState(true);
  const [err, setErr] = useState(false);

  const field = 'mt-1 w-full rounded-md border border-border2 bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal';
  const label = 'text-[11px] font-semibold text-text2';
  const lamN = Number(lam) || 0;
  const finN = Number(fin) || 0;

  async function save() {
    const d = detail.trim();
    if (!d) {
      setErr(true);
      return;
    }
    const specVal = spec.trim() || null;
    await update.mutateAsync({
      ticketId: ticket.id,
      input: {
        detail: d,
        spec: specVal,
        qty: Math.max(1, Math.round(Number(qty) || 1)),
        unitPrice: Number(unitPrice) || 0,
        drawing: drawing.trim() || null,
        resinType: resin || null,
        qcRef: qcRef.trim() || null,
        ...(isRaw
          ? { hrs: Number(rawHrs) || 0 }
          : { lamHrs: lamN, finHrs: finN, hrs: lamN + finN }),
      },
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
      sub={ticket.order ? `${ticket.order.orderNumber}${ticket.order.siteName ? ` · ${ticket.order.siteName}` : ''}` : undefined}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={update.isPending} onClick={() => void save()}>Save</Button>
        </>
      }
    >
      <div className="mb-2.5">
        <label className={label}>Detail / Description</label>
        <input
          value={detail}
          autoFocus
          onChange={(e) => { setDetail(e.target.value); setErr(false); }}
          className={`${field} ${err ? 'border-red' : ''}`}
        />
        {err && <div className="mt-1 text-[11px] text-red">Detail is required</div>}
      </div>
      <div className="mb-2.5">
        <label className={label}>Colour / Spec / Theme</label>
        <input value={spec} placeholder="e.g. RAL 5002 Dark Blue" onChange={(e) => setSpec(e.target.value)} className={field} />
      </div>

      <div className="mb-2.5 grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Quantity</label>
          <input type="number" min={1} step="1" value={qty} onChange={(e) => setQty(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Unit price £</label>
          <input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className={field} />
        </div>
      </div>

      {isRaw ? (
        <div className="mb-2.5">
          <label className={label}>Labour hours</label>
          <input type="number" min={0} step="0.25" value={rawHrs} onChange={(e) => setRawHrs(e.target.value)} className={field} />
        </div>
      ) : (
        <div className="mb-2.5 rounded-lg border border-border bg-surface2 px-3 py-2.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-bold">Labour hours</span>
            <span className="text-[11px] text-text3">
              Total <strong className="text-text">{Math.round((lamN + finN) * 100) / 100}h</strong>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Laminating (at the mould)</label>
              <input type="number" min={0} step="0.25" value={lam} onChange={(e) => setLam(e.target.value)} className={field} />
            </div>
            <div>
              <label className={label}>Finishing (trim to packing{isComp ? ', assembly' : ''})</label>
              <input type="number" min={0} step="0.25" value={fin} onChange={(e) => setFin(e.target.value)} className={field} />
            </div>
          </div>
        </div>
      )}

      <div className="mb-2.5 grid grid-cols-3 gap-3">
        <div>
          <label className={label}>Drawing ref</label>
          <input value={drawing} placeholder="e.g. 12347" onChange={(e) => setDrawing(e.target.value)} className={field} />
        </div>
        <div>
          <label className={label}>Resin</label>
          <select value={resin} onChange={(e) => setResin(e.target.value)} className={field}>
            <option value="">— order default —</option>
            {RESIN_TYPES.map((r) => (
              <option key={r} value={r}>{r === 'M2' ? 'M2 — fire rated ⚠' : r}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>QC ref</label>
          <input value={qcRef} placeholder="e.g. QC-2025-047" onChange={(e) => setQcRef(e.target.value)} className={field} />
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
