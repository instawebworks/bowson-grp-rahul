import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { nextStage } from '@bowson/shared';
import {
  useAssignMould,
  useConfirmCure,
  useDeleteOrder,
  useMoulds,
  useOrder,
  useOrderAudit,
  useSetCure,
} from '../lib/hooks';
import { Button, Card, Content, Modal, PageHeader, ProgressBar, StatusPill, Table } from '../components/ui';
import { TicketForm } from '../components/TicketForm';
import { TicketStatusSelect } from '../components/TicketStatusSelect';
import { EditTicketModal } from '../components/EditTicketModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { EditOrderForm } from '../components/EditOrderForm';
import { useAuth } from '../lib/auth';
import { cureState, fmtCureMins, fmtDate, money } from '../lib/format';
import type { Ticket } from '../lib/types';

const MOULD_STAGES = ['3. Queue - Awaiting Mould', '4. Gel Coat', '5. Laminating'];
const CURE_STAGES = ['4. Gel Coat', '5. Laminating'];
const CURE_PRESETS = [30, 60, 120, 240];

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.RAW!;
  return (
    <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>
      {type}
    </span>
  );
}

function StatusSelect({ ticket }: { ticket: Ticket }) {
  // COMP status is derived from its parts; show it read-only as a pill.
  if (ticket.type === 'COMP') return <StatusPill status={ticket.status} />;
  // Gated select: packing checklist on → Packing, family gate on → Despatched.
  return <TicketStatusSelect ticket={ticket} />;
}

function MouldCureCell({
  ticket,
  orderId,
  moulds,
  now,
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
}) {
  const assignMould = useAssignMould(orderId);
  const setCure = useSetCure(orderId);
  const confirmCure = useConfirmCure(orderId);

  // Mould is only relevant for manufactured items in the mould stages.
  const showMould = ticket.type !== 'RAW' && ticket.type !== 'COMP' && MOULD_STAGES.includes(ticket.status);
  const showCure = CURE_STAGES.includes(ticket.status);
  const cure = cureState(ticket, now);

  if (!showMould && !showCure) {
    return <span className="text-text3">{ticket.mould?.ref ?? '—'}</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {showMould && (
        <select
          value={ticket.mouldId ?? ''}
          disabled={assignMould.isPending}
          onChange={(e) => assignMould.mutate({ ticketId: ticket.id, mouldId: e.target.value ? Number(e.target.value) : null })}
          className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
        >
          <option value="">— mould —</option>
          {moulds.map((m) => (
            <option key={m.id} value={m.id}>{m.ref}</option>
          ))}
        </select>
      )}
      {showCure &&
        (cure ? (
          <button
            onClick={() => confirmCure.mutate({ ticketId: ticket.id })}
            disabled={confirmCure.isPending}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              cure.expired ? 'bg-red/10 text-red' : 'bg-amber-l text-amber'
            }`}
            title="Confirm cure complete (advances to the next stage)"
          >
            {cure.expired ? '✓ cure done — confirm' : `⏱ ${fmtCureMins(cure.remainingMin)} — confirm`}
          </button>
        ) : (
          <select
            value=""
            disabled={setCure.isPending}
            onChange={(e) =>
              setCure.mutate({
                ticketId: ticket.id,
                mins: Number(e.target.value),
                targetStage: nextStage(ticket.status) ?? undefined,
              })
            }
            className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] text-text2 outline-none focus:border-teal"
          >
            <option value="">+ cure timer…</option>
            {CURE_PRESETS.map((m) => (
              <option key={m} value={m}>{fmtCureMins(m)}</option>
            ))}
          </select>
        ))}
    </div>
  );
}

function TicketRow({
  ticket,
  orderId,
  moulds,
  now,
  indent,
  onEdit,
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  indent?: boolean;
  onEdit?: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 tabular-nums text-text3">{ticket.tn ?? '—'}</td>
      <td className="px-3 py-2"><TypeBadge type={ticket.type} /></td>
      <td className={`px-3 py-2 ${indent ? 'pl-8 text-text2' : 'font-medium'}`}>
        {ticket.detail}
        {ticket.spec && <span className="ml-2 text-[11px] text-text3">{ticket.spec}</span>}
      </td>
      <td className="px-3 py-2"><StatusSelect ticket={ticket} /></td>
      <td className="px-3 py-2"><ProgressBar pct={ticket.pct} /></td>
      <td className="px-3 py-2"><MouldCureCell ticket={ticket} orderId={orderId} moulds={moulds} now={now} /></td>
      <td className="px-3 py-2 tabular-nums">{money(ticket.netPrice)}</td>
      <td className="px-3 py-2">
        {onEdit && <Button title="Edit" onClick={onEdit}>✎</Button>}
      </td>
    </tr>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const { data: order, isLoading, error } = useOrder(orderId);
  const { data: moulds } = useMoulds();
  const deleteOrder = useDeleteOrder();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [deleteFlow, setDeleteFlow] = useState<'pin' | 'confirm' | null>(null);
  const [editTicket, setEditTicket] = useState<{ ticket: Ticket; parts: Ticket[] } | null>(null);
  const { canManage } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isLoading) return <><PageHeader title="Order" /><Content><div className="text-xs text-text3">Loading…</div></Content></>;
  if (error || !order)
    return (
      <>
        <PageHeader title="Order" />
        <Content>
          <div className="rounded-lg border border-dashed border-border2 bg-surface p-6 text-xs text-text3">
            Could not load order — {(error as Error)?.message ?? 'not found'}. <Link to="/orders" className="text-teal">Back to orders</Link>
          </div>
        </Content>
      </>
    );

  const tickets = order.tickets ?? [];
  const tops = tickets.filter((t) => t.compParentId == null);
  const partsOf = (compId: number) => tickets.filter((t) => t.compParentId === compId);

  return (
    <>
      {showAdd && (
        <TicketForm
          orderId={orderId}
          orderNumber={order.orderNumber}
          defaultResin={order.resinType}
          onClose={() => setShowAdd(false)}
        />
      )}
      {showEdit && <EditOrderForm order={order} onClose={() => setShowEdit(false)} />}
      {editTicket && (
        <EditTicketModal ticket={editTicket.ticket} parts={editTicket.parts} onClose={() => setEditTicket(null)} />
      )}
      {deleteFlow === 'pin' && (
        <ManagerPinGate
          action={`delete order ${order.orderNumber}`}
          onSuccess={() => setDeleteFlow('confirm')}
          onCancel={() => setDeleteFlow(null)}
        />
      )}
      {deleteFlow === 'confirm' && (
        <Modal
          title={`Delete Order ${order.orderNumber}?`}
          onClose={() => setDeleteFlow(null)}
          footer={
            <>
              <Button onClick={() => setDeleteFlow(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={deleteOrder.isPending}
                onClick={() => deleteOrder.mutate(orderId, { onSuccess: () => navigate('/orders') })}
              >
                Yes — delete permanently
              </Button>
            </>
          }
        >
          <p className="mb-2 text-[13px] text-text2">This will permanently delete:</p>
          <ul className="mb-3 ml-4 list-disc text-xs leading-7 text-text2">
            <li>Order <strong>{order.orderNumber}</strong> — {order.siteName ?? '—'}</li>
            <li><strong>{tickets.length}</strong> associated ticket{tickets.length !== 1 ? 's' : ''}</li>
          </ul>
          <div className="rounded-lg border border-red bg-red/10 px-3 py-2 text-[11px] font-semibold text-red">
            ⚠ This cannot be undone.
          </div>
          {deleteOrder.isError && <div className="mt-2 text-[11px] text-red">Delete failed — {(deleteOrder.error as Error).message}</div>}
        </Modal>
      )}
      <PageHeader
        title={`Order ${order.orderNumber}`}
        sub={order.customer?.name ?? undefined}
        actions={
          <>
            <Link to="/orders"><Button>← All Orders</Button></Link>
            {canManage && <Button variant="danger" onClick={() => setDeleteFlow('pin')}>Delete</Button>}
            {canManage && <Button onClick={() => setShowEdit(true)}>Edit order</Button>}
            {canManage && <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add ticket</Button>}
          </>
        }
      />
      <Content>
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
          <Meta label="Status" value={<StatusPill status={order.status} />} />
          <Meta label="Customer ref" value={order.siteName ?? '—'} />
          <Meta label="Deadline" value={fmtDate(order.deadline)} />
          <Meta label="Resin" value={order.resinType} />
          <Meta label="Value" value={money(order.value)} />
        </div>

        <Card
          title={`Tickets (${tickets.length})`}
          actions={canManage && <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add ticket</Button>}
        >
          <Table head={['TN', 'Type', 'Detail', 'Status', 'Progress', 'Mould / Cure', 'Value', '']}>
            {tops.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-xs text-text3">
                  No tickets yet — click “+ Add ticket” to add items (Step 2).
                </td>
              </tr>
            )}
            {tops.map((t) => (
              <FragmentRow
                key={t.id}
                ticket={t}
                orderId={orderId}
                moulds={moulds ?? []}
                now={now}
                parts={t.type === 'COMP' ? partsOf(t.id) : []}
                onEdit={canManage ? (ticket, parts) => setEditTicket({ ticket, parts }) : undefined}
              />
            ))}
          </Table>
        </Card>

        {order.themeImage && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Colour theme</div>
            <img src={order.themeImage} alt="Colour theme" className="max-h-56 rounded-lg border border-border" />
          </div>
        )}

        <OrderAudit orderId={orderId} />
      </Content>
    </>
  );
}

function FragmentRow({
  ticket,
  orderId,
  moulds,
  now,
  parts,
  onEdit,
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  parts: Ticket[];
  onEdit?: (ticket: Ticket, parts: Ticket[]) => void;
}) {
  return (
    <>
      <TicketRow
        ticket={ticket}
        orderId={orderId}
        moulds={moulds}
        now={now}
        onEdit={onEdit ? () => onEdit(ticket, parts) : undefined}
      />
      {parts.map((p) => (
        <TicketRow
          key={p.id}
          ticket={p}
          orderId={orderId}
          moulds={moulds}
          now={now}
          indent
          onEdit={onEdit ? () => onEdit(p, []) : undefined}
        />
      ))}
    </>
  );
}

function OrderAudit({ orderId }: { orderId: number }) {
  const { data } = useOrderAudit(orderId);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Activity</div>
      <div className="space-y-1">
        {data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="whitespace-nowrap text-text3">
              {new Date(a.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="capitalize text-text3">{a.entityType} #{a.entityId}</span>
            <span className="text-text2">{a.field}</span>
            {a.field === 'status' && a.toValue ? (
              <span className="flex items-center gap-1">
                {a.fromValue && <StatusPill status={a.fromValue} />}→<StatusPill status={a.toValue} />
              </span>
            ) : (
              <span className="text-text2">{a.fromValue ?? '—'} → {a.toValue ?? '—'}</span>
            )}
            {a.note && <span className="text-text3">· {a.note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}
