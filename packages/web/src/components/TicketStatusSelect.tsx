import { useState } from 'react';
import { GRP_STAGES, RAW_STAGES, type FamilyNotReady } from '@bowson/shared';
import { useChangeTicketStatus } from '../lib/hooks';
import { ApiError } from '../lib/api';
import { Button, Modal } from './ui';
import { ManagerPinGate } from './ManagerPinGate';
import { PackingChecklistModal } from './PackingChecklistModal';

type Gate =
  | { kind: 'packing'; status: string }
  | { kind: 'family'; status: string; notReady: FamilyNotReady[] }
  | { kind: 'family-pin'; status: string };

/** The ticket fields the gated select needs. */
export interface StatusTicket {
  id: number;
  tn: number | null;
  type: string;
  status: string;
  orderId: number;
}

/**
 * Stage dropdown with the prototype's workflow gates:
 * - advancing a MADE / COMP into "9. Packing" first verifies the hardware
 *   checklist (saved to the order) — ported from showPackingChecklist;
 * - jumping a COMP / PART to Despatched is blocked by the API family gate
 *   (ported from doAdvance) with a manager-PIN override.
 */
export function TicketStatusSelect({ ticket, className }: { ticket: StatusTicket; className?: string }) {
  const change = useChangeTicketStatus(ticket.orderId);
  const [gate, setGate] = useState<Gate | null>(null);
  const stages = ticket.type === 'RAW' ? RAW_STAGES : GRP_STAGES;

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

  function requestChange(status: string) {
    if (!status || status === ticket.status) return;
    // Packing gate — verify hardware before a MADE / COMP enters Packing.
    if (status === '9. Packing' && (ticket.type === 'MADE' || ticket.type === 'COMP')) {
      setGate({ kind: 'packing', status });
      return;
    }
    apply(status);
  }

  return (
    <>
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

      <select
        value={(stages as readonly string[]).includes(ticket.status) ? ticket.status : ''}
        disabled={change.isPending}
        onChange={(e) => requestChange(e.target.value)}
        className={className ?? 'rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal'}
      >
        {!(stages as readonly string[]).includes(ticket.status) && <option value="">{ticket.status}</option>}
        {stages.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </>
  );
}
