import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GRP_STAGES, RAW_STAGES } from '@bowson/shared';
import { useChangeTicketStatus, useOrder } from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, StatusPill, Table } from '../components/ui';
import { AddTicketModal } from '../components/AddTicketModal';
import { fmtDate, money } from '../lib/format';
import type { Ticket } from '../lib/types';

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

function TicketRow({ ticket, orderId, indent }: { ticket: Ticket; orderId: number; indent?: boolean }) {
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
      <td className="px-3 py-2 tabular-nums">{money(ticket.netPrice)}</td>
    </tr>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const orderId = Number(id);
  const { data: order, isLoading, error } = useOrder(orderId);
  const [showAdd, setShowAdd] = useState(false);

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
      {showAdd && <AddTicketModal orderId={orderId} onClose={() => setShowAdd(false)} />}
      <PageHeader
        title={`Order ${order.orderNumber}`}
        sub={order.customer?.name ?? undefined}
        actions={
          <>
            <Link to="/orders"><Button>← All Orders</Button></Link>
            <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add ticket</Button>
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

        <Card title={`Tickets (${tickets.length})`}>
          <Table head={['TN', 'Type', 'Detail', 'Status', 'Progress', 'Value']}>
            {tops.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-text3">
                  No tickets yet — click “+ Add ticket” to add items (Step 2).
                </td>
              </tr>
            )}
            {tops.map((t) => (
              <FragmentRow key={t.id} ticket={t} orderId={orderId} parts={t.type === 'COMP' ? partsOf(t.id) : []} />
            ))}
          </Table>
        </Card>

        {order.themeImage && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Colour theme</div>
            <img src={order.themeImage} alt="Colour theme" className="max-h-56 rounded-lg border border-border" />
          </div>
        )}
      </Content>
    </>
  );
}

function FragmentRow({ ticket, orderId, parts }: { ticket: Ticket; orderId: number; parts: Ticket[] }) {
  return (
    <>
      <TicketRow ticket={ticket} orderId={orderId} />
      {parts.map((p) => (
        <TicketRow key={p.id} ticket={p} orderId={orderId} indent />
      ))}
    </>
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
