import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ORDER_STATS } from '@bowson/shared';
import { useOrders, useReleaseOrder, useSetOrderStatus } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Button, Card, ConfirmDialog, Content, PageHeader, StatusPill, Table } from '../components/ui';
import { FilterInput, useColumnFilters } from '../components/ColumnFilters';
import { daysToDeadline, money } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import type { Order } from '../lib/types';

const PAGE = 15;
const DONE = ['Despatched', 'Completed', 'Cancelled'];

// Toolbar control styling (no forced full width, so the row stays compact).
const ctrl = 'rounded-md border border-border2 bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-teal';

// Item-badge styling per ticket type (colours match the prototype's tb-* pills).
const TYPE_BADGE: Record<string, { bg: string; color: string; border: string; label: string }> = {
  COMP: { bg: '#e8f1fb', color: '#1558a0', border: '#93b8e8', label: 'Slide (Assembly)' },
  MADE: { bg: '#dff2eb', color: '#0c6b50', border: '#9fd4c2', label: 'Slide' },
  RAW: { bg: '#f0ede8', color: '#5c574f', border: '#c8c4bc', label: 'Raw Stock' },
  PART: { bg: '#f3f0fd', color: '#4a42b0', border: '#c4bef0', label: 'Part' },
};
const BADGE_ORDER = ['COMP', 'MADE', 'RAW', 'PART'];

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

function itemBadges(o: Order) {
  const tops = (o.tickets ?? []).filter((t) => t.compParentId == null);
  const counts: Record<string, number> = {};
  for (const t of tops) counts[t.type] = (counts[t.type] ?? 0) + 1;
  return BADGE_ORDER.filter((k) => counts[k]).map((k) => ({ type: k, n: counts[k]!, ...TYPE_BADGE[k]! }));
}

/** Coloured percentage badge — red (0%) → green (100%), matching the prototype's progBar. */
function PctBadge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const hue = Math.round(p * 1.2);
  return (
    <span
      className="inline-block min-w-[34px] rounded-full border px-1.5 py-0.5 text-center text-[10px] font-extrabold"
      style={{ background: `hsl(${hue},75%,88%)`, color: `hsl(${hue},75%,28%)`, borderColor: `hsl(${hue},75%,28%)` }}
    >
      {p}%
    </span>
  );
}

/** Deadline countdown text + colour class, matching fmtDeadlineCountdown. */
function countdown(deadline: string | null): { text: string; cls: string } | null {
  const d = daysToDeadline(deadline);
  if (d === null) return null;
  if (d < 0) return { text: `⚠ ${Math.abs(d)} day${Math.abs(d) !== 1 ? 's' : ''} overdue`, cls: 'text-red' };
  if (d === 0) return { text: 'Today', cls: 'text-red' };
  if (d === 1) return { text: 'Tomorrow', cls: 'text-red' };
  if (d <= 7) return { text: `${d} days`, cls: 'text-amber' };
  if (d <= 21) return { text: `${d} days`, cls: 'text-text2' };
  return { text: `${d} days`, cls: 'text-teal' };
}

export function Orders({ title = 'All Orders', sub, statuses }: Props) {
  const { data, isLoading, error } = useOrders();
  const setStatus = useSetOrderStatus();
  const release = useReleaseOrder();
  const navigate = useNavigate();
  const { canManage } = useAuth();

  /** Pending → In Progress releases the order (issues ticket numbers) after a
   * confirm — ported from quickSetOrderStatus. */
  const [confirmRelease, setConfirmRelease] = useState<Order | null>(null);
  function changeStatus(o: Order, value: string) {
    if (o.status === value) return;
    if (o.status === 'Pending' && value === 'In Progress') {
      setConfirmRelease(o);
      return;
    }
    setStatus.mutate({ id: o.id, status: value });
  }

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const cf = useColumnFilters();

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
    list = list.filter(
      (o) =>
        cf.match('order', o.orderNumber) &&
        cf.match('customer', o.customer?.name) &&
        cf.match('ref', o.siteName) &&
        cf.match('deadline', o.deadline?.slice(0, 10)),
    );
    return list.sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cf.match is derived from cf.filters
  }, [data, statuses, showCompleted, statusFilter, q, cf.filters]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pageCount);
  const slice = rows.slice((current - 1) * PAGE, current * PAGE);

  const exportCsv = () =>
    downloadCsv(
      'orders.csv',
      [
        { key: 'orderNumber', label: 'Order #', value: (o: Order) => o.orderNumber },
        { key: 'customer', label: 'Customer', value: (o: Order) => o.customer?.name ?? '' },
        { key: 'ref', label: 'Customer Ref', value: (o: Order) => o.siteName ?? '' },
        { key: 'status', label: 'Status', value: (o: Order) => o.status },
        { key: 'deadline', label: 'Deadline', value: (o: Order) => o.deadline ?? '' },
        { key: 'despatch', label: 'Despatch', value: (o: Order) => o.despatch ?? '' },
        { key: 'value', label: 'Value', value: (o: Order) => o.value },
      ],
      rows,
    );

  const releaseUnissued = (confirmRelease?.tickets ?? []).filter((t) => t.tn == null).length;
  const releaseTotal = (confirmRelease?.tickets ?? []).length;

  return (
    <>
      {confirmRelease && (
        <ConfirmDialog
          title={`Release order ${confirmRelease.orderNumber} to production?`}
          danger={false}
          message={
            releaseUnissued ? (
              <>
                This will issue <strong>{releaseUnissued} ticket number{releaseUnissued !== 1 ? 's' : ''}</strong> and
                put the order into production. This cannot be undone.
              </>
            ) : (
              <>
                {releaseTotal} ticket{releaseTotal !== 1 ? 's are' : ' is'} already numbered. The order moves
                into production. This cannot be undone.
              </>
            )
          }
          confirmLabel="Release to production"
          busy={release.isPending}
          onCancel={() => setConfirmRelease(null)}
          onConfirm={() =>
            release.mutate(confirmRelease.id, { onSettled: () => setConfirmRelease(null) })
          }
        />
      )}
      <PageHeader
        title={title}
        sub={sub ?? `${rows.length} order${rows.length === 1 ? '' : 's'}`}
      />
      <Content>
        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search…" className={`${ctrl} w-64`} />
          {!statuses && (
            <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-text2">
              <input type="checkbox" className="accent-teal" checked={showCompleted} onChange={(e) => { setShowCompleted(e.target.checked); setPage(1); }} />
              Show completed &amp; despatched
            </label>
          )}
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={ctrl}>
            <option value="">All statuses</option>
            {ORDER_STATS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button className="ml-auto" onClick={exportCsv}>⭱ Export CSV</Button>
        </div>

        <Card>
          <Table
            head={[
              <FilterInput key="order" col="order" placeholder="Order #" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="customer" col="customer" placeholder="Customer" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="ref" col="ref" placeholder="Customer Ref" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              'Items',
              'Status',
              'Progress',
              <FilterInput key="deadline" col="deadline" placeholder="Deadline / Despatched" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              'Value',
              cf.hasFilters ? <Button key="clear" onClick={cf.clear}>✕ Clear</Button> : '',
            ]}
          >
            {isLoading && <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">Loading…</td></tr>}
            {error && <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">Could not load — {(error as Error).message}</td></tr>}
            {!isLoading && !error && slice.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">No orders.</td></tr>
            )}
            {slice.map((o) => {
              const days = daysToDeadline(o.deadline);
              const overdue = days !== null && days < 0 && !DONE.includes(o.status);
              const inlineStatus = o.status === 'Pending' || o.status === 'In Progress';
              const despatched = o.status === 'Despatched' || o.status === 'Completed';
              const cd = countdown(o.deadline);
              const badges = itemBadges(o);
              return (
                <tr key={o.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => navigate(`/orders/${o.id}`)}>
                  <td className="px-3 py-2">
                    <span className="font-bold text-teal">{o.orderNumber}</span>
                    {overdue && <span className="ml-1.5 rounded bg-red/10 px-1 py-0.5 text-[9px] font-bold text-red">+{-days!}d</span>}
                  </td>
                  <td className="max-w-35 truncate px-3 py-2">{o.customer?.name ?? '—'}</td>
                  <td className="max-w-40 truncate px-3 py-2 text-text2">{o.siteName ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {badges.length === 0 ? (
                      <span className="text-text3">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {badges.map((b) => (
                          <span
                            key={b.type}
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: b.bg, color: b.color, border: `1px solid ${b.border}` }}
                          >
                            {b.label} ×{b.n}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {inlineStatus && canManage ? (
                      <select
                        value={o.status}
                        disabled={release.isPending}
                        onChange={(e) => changeStatus(o, e.target.value)}
                        className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
                      >
                        <option value="Pending">Pending</option>
                        <option value="In Progress">In Progress</option>
                      </select>
                    ) : (
                      <StatusPill status={o.status} />
                    )}
                  </td>
                  <td className="px-3 py-2"><PctBadge pct={orderProgress(o)} /></td>
                  <td className="px-3 py-2 text-[11px]">
                    {despatched ? (
                      <span className="font-semibold text-teal">
                        ✓ Despatched{(() => {
                          const dates = (o.tickets ?? []).map((t) => t.despatchDate).filter(Boolean) as string[];
                          const latest = dates.sort().at(-1);
                          return latest ? ` ${latest}` : '';
                        })()}
                      </span>
                    ) : !o.deadline ? (
                      <span className="text-text3">—</span>
                    ) : (
                      <>
                        <div className={overdue ? 'font-semibold text-red' : ''}>{(o.deadline ?? '').slice(0, 10)}</div>
                        {cd && <div className={`text-[9px] font-semibold ${cd.cls}`}>{cd.text}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-semibold tabular-nums">{money(o.value)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <Button onClick={(e) => { e.stopPropagation(); navigate(`/orders/${o.id}`); }}>View</Button>
                  </td>
                </tr>
              );
            })}
          </Table>
          <div className="flex items-center justify-between border-t border-border bg-surface2 px-3 py-2 text-xs text-text2">
            <Button onClick={() => setPage(current - 1)} disabled={current <= 1}>← Prev</Button>
            <span>Page {current} of {pageCount} · {rows.length} order{rows.length === 1 ? '' : 's'}</span>
            <Button onClick={() => setPage(current + 1)} disabled={current >= pageCount}>Next →</Button>
          </div>
        </Card>
      </Content>
    </>
  );
}
