import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GRP_STAGES } from '@bowson/shared';
import { useTickets } from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, QueryState, StatusPill, Table, inputClass } from '../components/ui';
import { fmtDate } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import type { Ticket } from '../lib/types';

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.RAW!;
  return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>{type}</span>;
}

export function Tickets({ title = 'All Tickets', statuses }: { title?: string; statuses?: string[] } = {}) {
  const { data, isLoading, error } = useTickets();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [showDespatched, setShowDespatched] = useState(false);
  const locked = !!statuses;

  const all = data ?? [];

  // Order rows: each top-level ticket followed by its PART children.
  const ordered = useMemo(() => {
    // Status-locked views (In Production / Ready) show a flat filtered list.
    if (statuses) {
      return all.filter((t) => statuses.includes(t.status)).map((t) => ({ ticket: t, child: t.compParentId != null }));
    }
    const partsByComp = new Map<number, Ticket[]>();
    for (const t of all) {
      if (t.compParentId != null) {
        const arr = partsByComp.get(t.compParentId) ?? [];
        arr.push(t);
        partsByComp.set(t.compParentId, arr);
      }
    }
    const out: { ticket: Ticket; child: boolean }[] = [];
    for (const t of all) {
      if (t.compParentId != null) continue;
      out.push({ ticket: t, child: false });
      for (const p of partsByComp.get(t.id) ?? []) out.push({ ticket: p, child: true });
    }
    return out;
  }, [all, statuses]);

  const rows = ordered.filter(({ ticket: t }) => {
    if (!locked && !showDespatched && t.status === 'Despatched') return false;
    if (!locked && stage && t.status !== stage) return false;
    if (q.trim()) {
      const term = q.toLowerCase();
      const hay = [String(t.tn ?? ''), t.detail, t.order?.orderNumber, t.order?.siteName].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  return (
    <>
      <PageHeader
        title={title}
        sub={`${rows.length} ticket${rows.length === 1 ? '' : 's'}`}
        actions={
          <Button onClick={() => downloadCsv('tickets.csv', [
            { key: 'tn', label: 'TN', value: (r: { ticket: Ticket }) => r.ticket.tn ?? '' },
            { key: 'type', label: 'Type', value: (r) => r.ticket.type },
            { key: 'order', label: 'Order', value: (r) => r.ticket.order?.orderNumber ?? `#${r.ticket.orderId}` },
            { key: 'customer', label: 'Customer', value: (r) => r.ticket.order?.customer?.name ?? '' },
            { key: 'ref', label: 'Customer Ref', value: (r) => r.ticket.order?.siteName ?? '' },
            { key: 'detail', label: 'Detail', value: (r) => r.ticket.detail },
            { key: 'stage', label: 'Stage', value: (r) => r.ticket.status },
            { key: 'pct', label: 'Progress %', value: (r) => r.ticket.pct },
            { key: 'hrs', label: 'Hrs', value: (r) => r.ticket.hrs },
          ], rows)}>⭳ Export CSV</Button>
        }
      />
      <Content>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ticket / detail…" className={`${inputClass} max-w-xs`} />
          {!locked && (
            <>
              <select value={stage} onChange={(e) => setStage(e.target.value)} className={`${inputClass} w-auto`}>
                <option value="">All stages</option>
                {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-text2">
                <input type="checkbox" checked={showDespatched} onChange={(e) => setShowDespatched(e.target.checked)} />
                Show despatched
              </label>
            </>
          )}
        </div>

        <Card>
          <Table head={['T/Card #', 'Type', 'Order', 'Customer', 'Customer Ref', 'Detail', 'Stage', 'Progress', 'Deadline', 'Hrs']}>
            <QueryState isLoading={isLoading} error={error} colSpan={10} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-10 text-center text-xs text-text3">No tickets.</td></tr>
            )}
            {rows.map(({ ticket: t, child }) => {
              const o = t.order;
              return (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40 ${child ? 'bg-surface2/40' : ''}`}
                  onClick={() => o && navigate(`/orders/${t.orderId}`)}
                >
                  <td className="px-3 py-2 tabular-nums text-text3">{child ? '↳ ' : ''}{t.tn ?? '—'}</td>
                  <td className="px-3 py-2"><TypeBadge type={t.type} /></td>
                  <td className="px-3 py-2 font-medium">{o?.orderNumber ?? `#${t.orderId}`}</td>
                  <td className="max-w-25 truncate px-3 py-2 text-text2">{o?.customer?.name ?? '—'}</td>
                  <td className="max-w-25 truncate px-3 py-2 text-text2">{o?.siteName ?? '—'}</td>
                  <td className={`max-w-70 truncate px-3 py-2 ${child ? 'pl-6 text-text2' : ''}`}>
                    {t.detail}
                    {t.resinType === 'M2' && <span className="ml-1.5 rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">⚠ M2</span>}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2">{t.type === 'RAW' ? <span className="text-text3">—</span> : <ProgressBar pct={t.pct} />}</td>
                  <td className="px-3 py-2 text-text2">{fmtDate(o?.deadline)}</td>
                  <td className="px-3 py-2 tabular-nums text-text2">{t.hrs || '—'}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
