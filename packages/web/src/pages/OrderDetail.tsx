import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GRP_STAGES, nextStage, RAW_STAGES } from '@bowson/shared';
import {
  useAssignMould,
  useChangeTicketStatus,
  useConfirmCure,
  useMoulds,
  useOrder,
  useOrderAudit,
  useSetCure,
} from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, StatusPill, Table } from '../components/ui';
import { TicketForm } from '../components/TicketForm';
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

function StatusSelect({ ticket, orderId }: { ticket: Ticket; orderId: number }) {
  const change = useChangeTicketStatus(orderId);
  const stages = ticket.type === 'RAW' ? RAW_STAGES : GRP_STAGES;
  // COMP status is derived from its parts; show it read-only as a pill.
  if (ticket.type === 'COMP') return <StatusPill status={ticket.status} />;
  return (
    <select
      value={(stages as readonly string[]).includes(ticket.status) ? ticket.status : ''}
      disabled={change.isPending}
      onChange={(e) => change.mutate({ ticketId: ticket.id, status: e.target.value })}
      className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
    >
      {!(stages as readonly string[]).includes(ticket.status) && <option value="">{ticket.status}</option>}
      {stages.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
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
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  indent?: boolean;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 tabular-nums text-text3">{ticket.tn ?? '—'}</td>
      <td className="px-3 py-2"><TypeBadge type={ticket.type} /></td>
      <td className={`px-3 py-2 ${indent ? 'pl-8 text-text2' : 'font-medium'}`}>
        {ticket.detail}
        {ticket.spec && <span className="ml-2 text-[11px] text-text3">{ticket.spec}</span>}
      </td>
      <td className="px-3 py-2"><StatusSelect ticket={ticket} orderId={orderId} /></td>
      <td className="px-3 py-2"><ProgressBar pct={ticket.pct} /></td>
      <td className="px-3 py-2"><MouldCureCell ticket={ticket} orderId={orderId} moulds={moulds} now={now} /></td>
      <td className="px-3 py-2 tabular-nums">{money(ticket.netPrice)}</td>
    </tr>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const { data: order, isLoading, error } = useOrder(orderId);
  const { data: moulds } = useMoulds();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
      <PageHeader
        title={`Order ${order.orderNumber}`}
        sub={order.customer?.name ?? undefined}
        actions={
          <>
            <Link to="/orders"><Button>← All Orders</Button></Link>
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
          <Table head={['TN', 'Type', 'Detail', 'Status', 'Progress', 'Mould / Cure', 'Value']}>
            {tops.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-xs text-text3">
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
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  parts: Ticket[];
}) {
  return (
    <>
      <TicketRow ticket={ticket} orderId={orderId} moulds={moulds} now={now} />
      {parts.map((p) => (
        <TicketRow key={p.id} ticket={p} orderId={orderId} moulds={moulds} now={now} indent />
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
