import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stageIndex, GRP_STAGES } from '@bowson/shared';
import { useChangeTicketStatus, useTickets } from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, QueryState, Spinner, StatusPill, Table } from '../components/ui';
import { useOpenOrder } from '../lib/useOpenOrder';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { FilterInput, useColumnFilters } from '../components/ColumnFilters';
import { useGatedStatusChange } from '../components/TicketStatusSelect';
import { TypeBadge } from './Tickets';
import { daysToDeadline } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import type { Ticket } from '../lib/types';

const EXCLUDED = ['Despatched', 'Order Cancelled'];

/** Days-left text + colour (ported from fmtDeadlineCountdown). */
function countdown(deadline: string | null | undefined): { text: string; cls: string } {
  const d = daysToDeadline(deadline ?? null);
  if (d === null) return { text: '—', cls: 'text-text3' };
  if (d < 0) return { text: `⚠ ${-d} day${-d !== 1 ? 's' : ''} overdue`, cls: 'text-red font-semibold' };
  if (d === 0) return { text: 'Today', cls: 'text-red' };
  if (d === 1) return { text: 'Tomorrow', cls: 'text-red' };
  if (d <= 7) return { text: `${d} days`, cls: 'text-amber' };
  if (d <= 21) return { text: `${d} days`, cls: 'text-text2' };
  return { text: `${d} days`, cls: 'text-teal' };
}

/** Per-row step-back / advance buttons with the workflow gates (ported from
 * renderInProd's actions + reverseTkt / advanceTkt). */
function RowActions({ ticket, allPartsDone, isComp }: { ticket: Ticket; allPartsDone: boolean; isComp: boolean }) {
  const { requestChange, gateUi, isPending } = useGatedStatusChange(ticket);
  const reverse = useChangeTicketStatus(ticket.orderId);
  const idx = stageIndex(ticket.status);

  return (
    <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
      {gateUi}
      <Button
        title="Step back"
        disabled={idx <= 0 || reverse.isPending}
        onClick={() => idx > 0 && reverse.mutate({ ticketId: ticket.id, status: GRP_STAGES[idx - 1]! })}
      >
        {reverse.isPending ? <Spinner size={11} /> : '◀'}
      </Button>
      {isComp && !allPartsDone ? (
        <span className="px-1.5 py-1 text-[9px] text-amber">Parts pending</span>
      ) : (
        <Button
          variant="primary"
          title="Advance"
          disabled={isPending || idx < 0 || idx >= GRP_STAGES.length - 1}
          onClick={() => {
            const ns = idx >= 0 && idx < GRP_STAGES.length - 1 ? GRP_STAGES[idx + 1] : null;
            if (ns) requestChange(ns);
          }}
        >
          {isPending ? <Spinner size={11} /> : '▶'}
        </Button>
      )}
    </span>
  );
}

/** In Production — ported from renderInProd: all live MADE / PART tickets plus
 * top-level assemblies on in-production orders, with per-column filters,
 * step-back / advance actions and CSV export. */
export function InProduction() {
  const { data, isLoading, error } = useTickets();
  const navigate = useNavigate();
  const openOrder = useOpenOrder();
  const [detailId, setDetailId] = useState<number | null>(null);
  const cf = useColumnFilters();

  const all = useMemo(() => data ?? [], [data]);

  const list = useMemo(() => {
    const live = (t: Ticket) => {
      if (EXCLUDED.includes(t.status)) return false;
      const o = t.order;
      return !!o && !['Pending', 'Draft'].includes(o.status) && !o.isDraft;
    };
    const madeAndParts = all.filter((t) => (t.type === 'MADE' || t.type === 'PART') && live(t));
    const compActive = all.filter((t) => t.type === 'COMP' && t.compParentId == null && live(t));
    return [...madeAndParts, ...compActive].sort((a, b) =>
      (a.order?.deadline ?? '').localeCompare(b.order?.deadline ?? ''),
    );
  }, [all]);

  const rows = list.filter((t) => {
    const o = t.order;
    return (
      cf.match('tn', t.tn) &&
      cf.match('type', t.type) &&
      cf.match('order', o?.orderNumber) &&
      cf.match('ref', `${o?.siteName ?? ''} ${o?.customer?.name ?? ''}`) &&
      cf.match('detail', t.detail) &&
      cf.match('spec', t.spec) &&
      cf.match('stage', t.status) &&
      cf.match('deadline', o?.deadline?.slice(0, 10))
    );
  });

  const exportCsv = () =>
    downloadCsv(
      'in-production.csv',
      [
        { key: 'tn', label: 'Ticket #', value: (t: Ticket) => t.tn ?? '' },
        { key: 'type', label: 'Type', value: (t: Ticket) => t.type },
        { key: 'order', label: 'Order', value: (t: Ticket) => t.order?.orderNumber ?? '' },
        { key: 'ref', label: 'Customer Ref', value: (t: Ticket) => t.order?.siteName ?? '' },
        { key: 'detail', label: 'Detail', value: (t: Ticket) => t.detail },
        { key: 'spec', label: 'Theme / Spec', value: (t: Ticket) => t.spec ?? '' },
        { key: 'qty', label: 'Qty', value: (t: Ticket) => t.qty || 1 },
        { key: 'stage', label: 'Stage', value: (t: Ticket) => t.status },
        { key: 'pct', label: 'Progress %', value: (t: Ticket) => t.pct },
        { key: 'deadline', label: 'Deadline', value: (t: Ticket) => t.order?.deadline?.slice(0, 10) ?? '' },
        { key: 'hrs', label: 'Hrs', value: (t: Ticket) => t.hrs },
      ],
      rows,
    );

  const qcIdx = stageIndex('8. QC Check');

  return (
    <>
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}
      <PageHeader title="In Production" sub={`${rows.length} active ticket${rows.length === 1 ? '' : 's'}${cf.hasFilters ? ' — filtered' : ''}`} />
      <Content>
        <div className="mb-2.5 flex justify-end">
          <Button onClick={exportCsv}>⭱ Export CSV</Button>
        </div>
        <Card>
          <Table
            head={[
              <FilterInput key="tn" col="tn" placeholder="Ticket #" filters={cf.filters} onChange={cf.set} />,
              <FilterInput key="type" col="type" placeholder="Type" filters={cf.filters} onChange={cf.set} />,
              <FilterInput key="order" col="order" placeholder="Order" filters={cf.filters} onChange={cf.set} />,
              <FilterInput key="ref" col="ref" placeholder="Customer Ref" filters={cf.filters} onChange={cf.set} />,
              <FilterInput key="detail" col="detail" placeholder="Detail" filters={cf.filters} onChange={cf.set} />,
              <FilterInput key="spec" col="spec" placeholder="Theme / Spec" filters={cf.filters} onChange={cf.set} />,
              'Qty',
              <FilterInput key="stage" col="stage" placeholder="Stage" filters={cf.filters} onChange={cf.set} />,
              'Progress',
              <FilterInput key="deadline" col="deadline" placeholder="Deadline" filters={cf.filters} onChange={cf.set} />,
              'Days Left',
              cf.hasFilters ? <Button key="clear" onClick={cf.clear}>✕ Clear</Button> : 'Actions',
            ]}
          >
            <QueryState isLoading={isLoading} error={error} colSpan={12} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-xs text-text3">No tickets in production.</td></tr>
            )}
            {rows.map((t) => {
              const o = t.order;
              const isComp = t.type === 'COMP';
              const parts = isComp ? all.filter((p) => p.compParentId === t.id) : [];
              const partsDone = parts.filter((p) => stageIndex(p.status) >= qcIdx).length;
              const allPartsDone = parts.length > 0 && partsDone === parts.length;
              const parent = t.compParentId != null ? all.find((x) => x.id === t.compParentId) : null;
              const cd = countdown(o?.deadline);
              const overdue = (daysToDeadline(o?.deadline ?? null) ?? 0) < 0;
              return (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40 ${t.type === 'PART' ? 'bg-surface2/40' : ''}`}
                  onClick={() => setDetailId(t.id)}
                >
                  <td className="px-3 py-2 tabular-nums text-text3">{t.type === 'PART' ? '↳ ' : ''}#{t.tn ?? 'TBC'}</td>
                  <td className="px-3 py-2"><TypeBadge type={t.type} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <button className="font-medium text-teal hover:underline" onClick={() => openOrder(t.orderId)}>
                      {o?.orderNumber ?? '—'}
                    </button>
                  </td>
                  <td className="max-w-27 truncate px-3 py-2 text-[11px] text-text2">{o?.siteName ?? '—'}</td>
                  <td className="max-w-37 px-3 py-2">
                    <span className="block truncate" title={t.detail}>
                      {t.detail}
                      {t.resinType === 'M2' && <span className="ml-1.5 rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">⚠ M2</span>}
                    </span>
                    {parent && (
                      <span className="block truncate text-[9px] text-text3">↳ #{parent.tn ?? 'TBC'} {parent.detail.slice(0, 25)}</span>
                    )}
                    {isComp && parts.length > 0 && (
                      <span className={`block text-[9px] ${allPartsDone ? 'text-teal' : 'text-amber'}`}>
                        ☉ {partsDone}/{parts.length} parts through QC
                      </span>
                    )}
                  </td>
                  <td className="max-w-32 truncate px-3 py-2 text-[11px] text-text3">{t.spec ?? '—'}</td>
                  <td className="px-3 py-2 text-center text-[11px]">{t.qty || 1}</td>
                  <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2"><ProgressBar pct={t.pct} /></td>
                  <td className={`px-3 py-2 text-[11px] ${overdue ? 'font-bold text-red' : ''}`}>{o?.deadline?.slice(0, 10) ?? '—'}</td>
                  <td className={`px-3 py-2 text-[11px] ${cd.cls}`}>{cd.text}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <RowActions ticket={t} allPartsDone={allPartsDone} isComp={isComp} />
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
