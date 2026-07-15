import { useState } from 'react';
import { useReleaseOrder } from '../lib/hooks';
import { useOpenOrder } from '../lib/useOpenOrder';
import { Button, Modal } from './ui';
import type { Order } from '../lib/types';

/**
 * "⏳ Pending Orders — Review & Advance" — ported from reviewPendingOrders.
 * Lists Pending orders; releasing one issues its ticket numbers and moves it
 * to In Progress (confirmed in a second step — it cannot be undone).
 */
export function PendingReleaseModal({ orders, onClose }: { orders: Order[]; onClose: () => void }) {
  const release = useReleaseOrder();
  const openOrder = useOpenOrder();
  const [confirming, setConfirming] = useState<Order | null>(null);

  if (confirming) {
    const tCount = (confirming.tickets ?? []).length;
    return (
      <Modal
        title={`Release order ${confirming.orderNumber} to production?`}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={release.isPending}
              onClick={() =>
                release.mutate(confirming.id, {
                  onSuccess: () => setConfirming(null),
                })
              }
            >
              Yes — release to production
            </Button>
          </>
        }
      >
        <p className="mb-2 text-xs text-text2">
          This will issue <strong>{tCount} ticket number{tCount === 1 ? '' : 's'}</strong> and move the order to In Progress.
        </p>
        <div className="rounded-lg border border-amber bg-amber-l px-3 py-2 text-[11px] font-semibold text-[#7a4800]">
          ⚠ This cannot be undone.
        </div>
        {release.isError && (
          <div className="mt-2 text-[11px] text-red">Release failed — {(release.error as Error).message}</div>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="⏳ Pending Orders — Review & Advance"
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <p className="mb-3 text-xs text-text2">
        Release an order to In Progress to issue ticket numbers and make tickets visible in production.
      </p>
      {orders.length === 0 && (
        <div className="py-6 text-center text-xs text-text3">No pending orders — all released. ✓</div>
      )}
      {orders.map((o) => {
        const ts = o.tickets ?? [];
        const totalHrs = ts.reduce((s, t) => s + (t.hrs || 0), 0);
        return (
          <div key={o.id} className="mb-2 rounded-lg border border-border bg-surface px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <div className="text-[13px] font-bold">{o.orderNumber}</div>
                <div className="mt-0.5 text-[11px] text-text2">{o.siteName ?? '—'}</div>
                <div className="mt-0.5 text-[11px] text-text3">
                  {ts.length} ticket{ts.length !== 1 ? 's' : ''} · {totalHrs}h
                  {o.deadline ? ` · Due: ${o.deadline.slice(0, 10)}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button onClick={() => { onClose(); openOrder(o.id); }}>View order</Button>
                <Button variant="primary" onClick={() => setConfirming(o)}>Release to production</Button>
              </div>
            </div>
          </div>
        );
      })}
    </Modal>
  );
}
