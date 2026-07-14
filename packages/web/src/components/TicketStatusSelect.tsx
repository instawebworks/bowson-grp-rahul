import { useState } from 'react';
import { GRP_STAGES, RAW_STAGES, type FamilyNotReady } from '@bowson/shared';
import { useChangeTicketStatus, useUpdateTicket } from '../lib/hooks';
import { ApiError } from '../lib/api';
import { Button, Modal, Saving } from './ui';
import { ManagerPinGate } from './ManagerPinGate';
import { PackingChecklistModal } from './PackingChecklistModal';

type Gate =
  | { kind: 'qcref'; status: string }
  | { kind: 'packing'; status: string }
  | { kind: 'family'; status: string; notReady: FamilyNotReady[] }
  | { kind: 'family-pin'; status: string };

/** The ticket fields the gated status change needs. */
export interface StatusTicket {
  id: number;
  tn: number | null;
  type: string;
  status: string;
  orderId: number;
  qcRef?: string | null;
}

/**
 * Workflow-gated status change, shared by the stage dropdowns and the
 * In Production advance buttons. Ported prototype gates:
 * - moving to "9. Packing" without a QC reference asks for one first
 *   (setTicketStatus / advanceTkt QC gate) and saves it to the ticket;
 * - a MADE / COMP entering Packing then verifies the hardware checklist
 *   (showPackingChecklist), saved to the order;
 * - a COMP / PART jumping to Despatched is blocked by the API family gate
 *   (doAdvance) with a manager-PIN override.
 */
export function useGatedStatusChange(ticket: StatusTicket) {
  const change = useChangeTicketStatus(ticket.orderId);
  const patch = useUpdateTicket(ticket.orderId);
  const [gate, setGate] = useState<Gate | null>(null);
  const [qcRefInput, setQcRefInput] = useState('');
  const [qcRefErr, setQcRefErr] = useState(false);

  function apply(status: string, managerOverride = false) {
    setGate(null);
    change.mutate(
      { ticketId: ticket.id, status, managerOverride },
      {
        onError: (err) => {
          const body = err instanceof ApiError ? (err.body as { gate?: string; notReady?: FamilyNotReady[] } | null) : null;
          if (body?.gate === 'family') {
            setGate({ kind: 'family', status, notReady: body.notReady ?? [] });
          }
        },
      },
    );
  }

  /** After the QC-ref gate: packing checklist for MADE/COMP, else apply. */
  function afterQcRef(status: string) {
    if (ticket.type === 'MADE' || ticket.type === 'COMP') {
      setGate({ kind: 'packing', status });
    } else {
      apply(status);
    }
  }

  function requestChange(status: string) {
    if (!status || status === ticket.status) return;
    if (status === '9. Packing' && ticket.type !== 'RAW') {
      if (!ticket.qcRef) {
        setQcRefInput('');
        setQcRefErr(false);
        setGate({ kind: 'qcref', status });
        return;
      }
      afterQcRef(status);
      return;
    }
    apply(status);
  }

  function confirmQcRef(status: string) {
    const ref = qcRefInput.trim();
    if (!ref) {
      setQcRefErr(true);
      return;
    }
    patch.mutate(
      { ticketId: ticket.id, input: { qcRef: ref } },
      { onSuccess: () => afterQcRef(status) },
    );
  }

  const gateUi = (
    <>
      {gate?.kind === 'qcref' && (
        <Modal
          title="QC Reference Required"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button onClick={() => setGate(null)}>Cancel</Button>
              <Button variant="primary" disabled={patch.isPending} onClick={() => confirmQcRef(gate.status)}>
                Confirm &amp; Advance to Packing
              </Button>
            </>
          }
        >
          <p className="mb-3 text-xs text-text2">Enter the QC reference before moving this ticket to Packing.</p>
          <label className="mb-1 block text-[11px] font-semibold text-text2">QC Ref</label>
          <input
            value={qcRefInput}
            autoFocus
            placeholder="e.g. QC-2025-047"
            onChange={(e) => { setQcRefInput(e.target.value); setQcRefErr(false); }}
            onKeyDown={(e) => e.key === 'Enter' && confirmQcRef(gate.status)}
            className={`w-full rounded-md border bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal ${qcRefErr ? 'border-red' : 'border-border2'}`}
          />
          {qcRefErr && <div className="mt-1 text-[11px] text-red">A QC reference is required</div>}
        </Modal>
      )}

      {gate?.kind === 'packing' && (
        <PackingChecklistModal
          orderId={ticket.orderId}
          ticketTn={ticket.tn}
          onConfirm={() => apply(gate.status)}
          onCancel={() => setGate(null)}
        />
      )}

      {gate?.kind === 'family' && (
        <Modal
          title="Assembly not ready to despatch"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button
                onClick={() => setGate({ kind: 'family-pin', status: gate.status })}
                className="hover:opacity-90"
                style={{ backgroundColor: 'var(--color-amber)', borderColor: 'var(--color-amber)', color: '#fff' }}
              >
                ⚠ Manager Override
              </Button>
              <Button variant="primary" onClick={() => setGate(null)}>OK</Button>
            </>
          }
        >
          <p className="mb-2.5 text-xs text-text2">
            All parts and the Assembly ticket must be at <strong>Ready to Despatch</strong> before any can be despatched.
          </p>
          {gate.notReady.map((r, i) => (
            <div key={i} className="mb-1 rounded bg-amber-l px-2 py-1 text-[11px]">
              <strong>{r.type}</strong> #{r.tn ?? '?'} — {r.status}
            </div>
          ))}
        </Modal>
      )}

      {gate?.kind === 'family-pin' && (
        <ManagerPinGate
          action="despatch without full family"
          onSuccess={() => apply(gate.status, true)}
          onCancel={() => setGate(null)}
        />
      )}
    </>
  );

  return { requestChange, gateUi, isPending: change.isPending || patch.isPending };
}

/** Stage dropdown built on the gated status change. */
export function TicketStatusSelect({ ticket, className }: { ticket: StatusTicket; className?: string }) {
  const { requestChange, gateUi, isPending } = useGatedStatusChange(ticket);
  const stages = ticket.type === 'RAW' ? RAW_STAGES : GRP_STAGES;

  return (
    <>
      {gateUi}
      <Saving busy={isPending}>
        <select
          value={(stages as readonly string[]).includes(ticket.status) ? ticket.status : ''}
          disabled={isPending}
          onChange={(e) => requestChange(e.target.value)}
          className={className ?? 'rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal'}
        >
          {!(stages as readonly string[]).includes(ticket.status) && <option value="">{ticket.status}</option>}
          {stages.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Saving>
    </>
  );
}
