import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ORDER_STATS } from '@bowson/shared';
import { useOrders, useSetOrderStatus } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Button, Card, Content, PageHeader, ProgressBar, StatusPill, Table, inputClass } from '../components/ui';
import { OrderForm } from '../components/OrderForm';
import { daysToDeadline, fmtDate, money } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import type { Order } from '../lib/types';

const PAGE = 15;
const DONE = ['Despatched', 'Completed', 'Cancelled'];

interface Props {
  title?: string;
  sub?: string;
  statuses?: string[];
}

function orderProgress(o: Order): number {
  const tops = (o.tickets ?? []).filter((t) => t.compParentId == null);
  if (!tops.length) return 0;
  return Math.round(tops.reduce((s, t) => s + (t.pct ?? 0), 0) / tops.length);
}

function itemsSummary(o: Order): string {
  const tops = (o.tickets ?? []).filter((t) => t.compParentId == null);
  if (!tops.length) return '—';
  const by: Record<string, number> = {};
  for (const t of tops) by[t.type] = (by[t.type] ?? 0) + 1;
  return Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', ');
}

export function Orders({ title = 'All Orders', sub, statuses }: Props) {
  const { data, isLoading, error } = useOrders();
  const setStatus = useSetOrderStatus();
  const navigate = useNavigate();
  const { canManage } = useAuth();

  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    let list = (data ?? []).filter((o) => !statuses || statuses.includes(o.status));
    if (!statuses && !showCompleted) list = list.filter((o) => !['Despatched', 'Completed'].includes(o.status));
    if (statusFilter) list = list.filter((o) => o.status === statusFilter);
    if (q.trim()) {
      const term = q.toLowerCase();
      list = list.filter((o) =>
        [o.orderNumber, o.siteName, o.customer?.name].filter(Boolean).join(' ').toLowerCase().includes(term),
      );
    }
    return list.sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  }, [data, statuses, showCompleted, statusFilter, q]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pageCount);
  const slice = rows.slice((current - 1) * PAGE, current * PAGE);

  return (
    <>
      {showCreate && <OrderForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title={title}
        sub={sub ?? `${rows.length} order${rows.length === 1 ? '' : 's'}`}
        actions={
          <>
            <Button onClick={() => downloadCsv('orders.csv', [
              { key: 'orderNumber', label: 'Order #', value: (o: Order) => o.orderNumber },
              { key: 'customer', label: 'Customer', value: (o: Order) => o.customer?.name ?? '' },
              { key: 'ref', label: 'Customer Ref', value: (o: Order) => o.siteName ?? '' },
              { key: 'status', label: 'Status', value: (o: Order) => o.status },
              { key: 'deadline', label: 'Deadline', value: (o: Order) => o.deadline ?? '' },
              { key: 'despatch', label: 'Despatch', value: (o: Order) => o.despatch ?? '' },
              { key: 'value', label: 'Value', value: (o: Order) => o.value },
            ], rows)}>⭳ Export CSV</Button>
            {canManage && <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Order</Button>}
          </>
        }
      />
      <Content>
        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search…" className={`${inputClass} max-w-xs`} />
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={`${inputClass} w-auto`}>
            <option value="">All statuses</option>
            {ORDER_STATS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {!statuses && (
            <label className="flex items-center gap-1.5 text-xs text-text2">
              <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
              Show completed & despatched
            </label>
          )}
        </div>

        <Card>
          <Table head={['Order #', 'Customer', 'Customer Ref', 'Items', 'Status', 'Progress', 'Deadline', 'Value', '']}>
            {isLoading && <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">Loading…</td></tr>}
            {error && <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">Could not load — {(error as Error).message}</td></tr>}
            {!isLoading && !error && slice.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">No orders.</td></tr>
            )}
            {slice.map((o) => {
              const days = daysToDeadline(o.deadline);
              const overdue = days !== null && days < 0 && !DONE.includes(o.status);
              const inlineStatus = o.status === 'Pending' || o.status === 'In Progress';
              return (
                <tr key={o.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className="px-3 py-2 font-semibold">
                    {o.orderNumber}
                    {overdue && <span className="ml-1.5 rounded bg-red/10 px-1 py-0.5 text-[9px] font-bold text-red">+{-days!}d</span>}
                  </td>
                  <td className="max-w-35 truncate px-3 py-2">{o.customer?.name ?? '—'}</td>
                  <td className="max-w-40 truncate px-3 py-2 text-text2">{o.siteName ?? '—'}</td>
                  <td className="px-3 py-2 text-text2">{itemsSummary(o)}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {inlineStatus && canManage ? (
                      <select
                        value={o.status}
                        onChange={(e) => setStatus.mutate({ id: o.id, status: e.target.value })}
                        className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                      </select>
                    ) : (
                      <StatusPill status={o.status} />
                    )}
                  </td>
                  <td className="px-3 py-2"><ProgressBar pct={orderProgress(o)} /></td>
                  <td className="px-3 py-2">
                    <span style={overdue ? { color: '#922020', fontWeight: 600 } : undefined}>
                      {fmtDate(o.deadline)}
                      {days !== null && <span className="ml-1 text-[10px] text-text3">({days < 0 ? `${-days}d late` : `${days}d`})</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(o.value)}</td>
                  <td className="px-3 py-2 text-right"><Button onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}>View</Button></td>
                </tr>
              );
            })}
          </Table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-border bg-surface2 px-3 py-2 text-xs text-text2">
              <span>Page {current} of {pageCount} · {rows.length} total</span>
              <div className="flex gap-1.5">
                <Button onClick={() => setPage(current - 1)} disabled={current <= 1}>Prev</Button>
                <Button onClick={() => setPage(current + 1)} disabled={current >= pageCount}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </Content>
    </>
  );
}
