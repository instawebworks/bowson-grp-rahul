import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GRP_STAGES, familyReadyCheck, stageIndex } from '@bowson/shared';
import { useOperatives, useOrders, useReturnToProduction, useTickets } from '../lib/hooks';
import { apiClient } from '../lib/api';
import { Button, Card, Content, Modal, PageHeader, ProgressBar, QueryState, StatusPill, Table } from '../components/ui';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { PendingReleaseModal } from '../components/PendingReleaseModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { FilterInput, useColumnFilters } from '../components/ColumnFilters';
import { useAuth } from '../lib/auth';
import { daysToDeadline } from '../lib/format';
import type { Ticket } from '../lib/types';

const PAGE = 15;

// Toolbar control styling (no forced full width, so the row stays compact).
const ctrl = 'rounded-md border border-border2 bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-teal';

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

export function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.RAW!;
  return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>{type}</span>;
}

/** Deadline countdown (ported from fmtDeadlineCountdown). */
export function DeadlineCell({ deadline, despatchDate }: { deadline: string | null | undefined; despatchDate: string | null }) {
  if (despatchDate) return <span className="font-semibold text-teal">✓ {despatchDate}</span>;
  if (!deadline) return <span className="text-text3">—</span>;
  const d = daysToDeadline(deadline);
  const cls =
    d === null ? 'text-text2' : d < 0 ? 'text-red' : d <= 1 ? 'text-red' : d <= 7 ? 'text-amber' : d <= 21 ? 'text-text2' : 'text-teal';
  const text =
    d === null ? '' : d < 0 ? `⚠ ${-d} day${-d !== 1 ? 's' : ''} overdue` : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `${d} days`;
  return (
    <>
      <div className={d !== null && d < 0 ? 'font-semibold text-red' : ''}>{deadline.slice(0, 10)}</div>
      {text && <div className={`text-[9px] font-semibold ${cls}`}>{text}</div>}
    </>
  );
}

type BulkGate =
  | { kind: 'blocked'; message: string }
  | { kind: 'qcref'; ids: number[]; needsQC: number[]; target: string }
  | { kind: 'bulk-status' }
  | { kind: 'return-pin'; ticket: Ticket }
  | { kind: 'return-confirm'; ticket: Ticket };

export function Tickets() {
  const { data, isLoading, error } = useTickets();
  const { data: operatives } = useOperatives();
  const returnToProduction = useReturnToProduction();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [showDespatched, setShowDespatched] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [assignPanel, setAssignPanel] = useState(false);
  const [assignOpId, setAssignOpId] = useState<number | null>(null);
  const [gate, setGate] = useState<BulkGate | null>(null);
  const [qcRefValue, setQcRefValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');
  const [page, setPage] = useState(1);
  const cf = useColumnFilters();
  const { canManage } = useAuth();

  // Pending-order release banner (ported from renderTickets).
  const { data: orders } = useOrders();
  const pendingOrders = useMemo(
    () => (orders ?? []).filter((o) => o.status === 'Pending' && !o.isDraft),
    [orders],
  );

  const all = useMemo(() => data ?? [], [data]);

  // Each top-level ticket followed by its PART children.
  const ordered = useMemo(() => {
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
  }, [all]);

  const rows = ordered.filter(({ ticket: t }) => {
    const o = t.order;
    if (!showDespatched && t.status === 'Despatched') return false;
    if (stage && t.status !== stage) return false;
    if (q.trim()) {
      const term = q.toLowerCase();
      const hay = [String(t.tn ?? ''), t.detail, o?.orderNumber, o?.siteName].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return (
      cf.match('type', t.type) &&
      cf.match('order', o?.orderNumber) &&
      cf.match('customer', o?.customer?.name) &&
      cf.match('ref', o?.siteName) &&
      cf.match('detail', t.detail) &&
      cf.match('stage', t.status) &&
      cf.match('deadline', t.despatchDate ?? o?.deadline?.slice(0, 10))
    );
  });

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pageCount);
  const slice = rows.slice((current - 1) * PAGE, current * PAGE);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['ticket'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['order'] });
    qc.invalidateQueries({ queryKey: ['board-tickets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(''), 3000);
  }

  /** Bulk advance the checked tickets to the chosen stage (ported from bulkAdvanceSelected). */
  function bulkAdvanceSelected() {
    if (!bulkStage) {
      setGate({ kind: 'blocked', message: 'Please choose a target stage from the dropdown before advancing.' });
      return;
    }
    const toMove = [...selected].map((id) => all.find((t) => t.id === id)).filter(Boolean) as Ticket[];
    if (!toMove.length) {
      setGate({ kind: 'blocked', message: 'Tick at least one ticket using the checkboxes on the left.' });
      return;
    }
    const qcIdx = stageIndex('8. QC Check');
    const targetIdx = stageIndex(bulkStage);
    const eligible = toMove.filter((t) => {
      if (t.type === 'RAW') return false;
      if (['Pending', 'Draft'].includes(t.order?.status ?? '')) return false;
      if (t.type === 'COMP' && bulkStage === 'Despatched' && !familyReadyCheck(t, all).ready) return false;
      // PARTs stop at QC Check.
      if (t.type === 'PART' && stageIndex(t.status) >= qcIdx && targetIdx > qcIdx) return false;
      return t.status !== bulkStage;
    });
    if (!eligible.length) {
      setGate({
        kind: 'blocked',
        message:
          'No eligible tickets selected. COMP tickets cannot be despatched until all parts are at Ready to Despatch; PART tickets cannot advance past QC Check; tickets on Pending orders are skipped.',
      });
      return;
    }
    // QC-ref gate when moving into Packing (ported: needsQC).
    const needsQC = eligible.filter((t) => bulkStage === '9. Packing' && !t.qcRef).map((t) => t.id);
    if (needsQC.length) {
      setQcRefValue('');
      setGate({ kind: 'qcref', ids: eligible.map((t) => t.id), needsQC, target: bulkStage });
      return;
    }
    void runBulkAdvance(eligible.map((t) => t.id), [], '', bulkStage);
  }

  async function runBulkAdvance(ids: number[], needsQC: number[], qcRef: string, target: string) {
    setGate(null);
    setBusy(true);
    let moved = 0;
    try {
      for (const id of ids) {
        try {
          if (needsQC.includes(id) && qcRef) await apiClient.patch(`/api/tickets/${id}`, { qcRef });
          await apiClient.post(`/api/tickets/${id}/status`, { status: target });
          moved++;
        } catch {
          /* server gate (e.g. family) — skip this ticket */
        }
      }
    } finally {
      setBusy(false);
      invalidateAll();
      clearSelection();
      setBulkStage('');
      showFlash(`✓ Moved ${moved} ticket${moved !== 1 ? 's' : ''} to ${target}`);
    }
  }

  /** Bulk assign an operative (appends) to the checked tickets (ported from confirmAppBulkAssign). */
  async function confirmBulkAssign() {
    if (!assignOpId || !selected.size) return;
    const op = operatives?.find((o) => o.id === assignOpId);
    setBusy(true);
    let count = 0;
    try {
      for (const id of selected) {
        const t = all.find((x) => x.id === id);
        if (!t) continue;
        const existing = (t.assignments ?? []).map((a) => a.operativeId);
        await apiClient.post(`/api/tickets/${id}/assign`, { operativeIds: [...new Set([...existing, assignOpId])] });
        count++;
      }
    } finally {
      setBusy(false);
      invalidateAll();
      setAssignPanel(false);
      setAssignOpId(null);
      clearSelection();
      showFlash(`✓ Assigned ${count} ticket${count !== 1 ? 's' : ''} to ${op?.name ?? 'operative'}`);
    }
  }

  return (
    <>
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}
      {reviewOpen && <PendingReleaseModal orders={pendingOrders} onClose={() => setReviewOpen(false)} />}

      {gate?.kind === 'blocked' && (
        <Modal title="Nothing to advance" onClose={() => setGate(null)} footer={<Button variant="primary" onClick={() => setGate(null)}>OK</Button>}>
          <p className="text-xs text-text2">{gate.message}</p>
        </Modal>
      )}

      {gate?.kind === 'qcref' && (
        <Modal
          title="QC Reference Required"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button onClick={() => setGate(null)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => qcRefValue.trim() && runBulkAdvance(gate.ids, gate.needsQC, qcRefValue.trim(), gate.target)}
              >
                Confirm &amp; Advance
              </Button>
            </>
          }
        >
          <p className="mb-3 text-xs text-text2">
            {gate.needsQC.length} ticket{gate.needsQC.length !== 1 ? 's' : ''} moving to Packing {gate.needsQC.length !== 1 ? 'have' : 'has'} no QC
            reference. Enter one to apply to {gate.needsQC.length !== 1 ? 'them' : 'it'}.
          </p>
          <input
            value={qcRefValue}
            autoFocus
            placeholder="e.g. QC-2025-047"
            onChange={(e) => setQcRefValue(e.target.value)}
            className="w-full rounded-md border border-border2 bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal"
          />
        </Modal>
      )}

      {gate?.kind === 'bulk-status' && (
        <BulkStatusModal
          tickets={all}
          onClose={() => setGate(null)}
          onApply={(ids, target) => void runBulkAdvance(ids, [], '', target)}
        />
      )}

      {gate?.kind === 'return-pin' && (
        <ManagerPinGate
          action={`return ticket #${gate.ticket.tn ?? 'TBC'} to production`}
          onSuccess={() => setGate({ kind: 'return-confirm', ticket: gate.ticket })}
          onCancel={() => setGate(null)}
        />
      )}

      {gate?.kind === 'return-confirm' && (
        <Modal
          title="Return ticket to production?"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button onClick={() => setGate(null)}>Cancel</Button>
              <Button
                disabled={returnToProduction.isPending}
                className="hover:opacity-90"
                style={{ backgroundColor: 'var(--color-amber)', borderColor: 'var(--color-amber)', color: '#fff' }}
                onClick={() => {
                  const id = gate.ticket.id;
                  setGate(null);
                  returnToProduction.mutate(id);
                }}
              >
                Yes — return to production
              </Button>
            </>
          }
        >
          <p className="mb-2 text-xs text-text2">
            This will move <strong>#{gate.ticket.tn ?? 'TBC'} — {gate.ticket.detail}</strong> back to QC Check and mark its order as In Progress.
          </p>
          <div className="rounded-lg border border-amber bg-amber-l px-3 py-2 text-[11px] font-semibold text-[#7a4800]">
            ⚠ Manager override — this action is logged.
          </div>
        </Modal>
      )}

      <PageHeader title="All Tickets" sub={flash || `${rows.length} ticket${rows.length === 1 ? '' : 's'}${cf.hasFilters ? ' — filtered' : ''}`} />
      <Content>
        {pendingOrders.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber bg-amber-l px-3.5 py-2.5">
            <div>
              <div className="text-xs font-bold text-amber">
                ⏳ {pendingOrders.length} Pending Order{pendingOrders.length !== 1 ? 's' : ''} — ticket numbers not yet issued
              </div>
              <div className="mt-0.5 text-[11px] text-text2">
                {pendingOrders.map((o) => (
                  <span key={o.id} className="mr-2">{o.orderNumber} — {o.siteName ?? '—'}</span>
                ))}
              </div>
            </div>
            {canManage && (
              <Button variant="primary" onClick={() => setReviewOpen(true)}>Review &amp; Advance →</Button>
            )}
          </div>
        )}

        {/* Toolbar */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search ticket / detail…" className={`${ctrl} w-64`} />
          <select value={stage} onChange={(e) => { setStage(e.target.value); setPage(1); }} className={ctrl}>
            <option value="">All stages</option>
            {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-text2">
            <input type="checkbox" className="accent-teal" checked={showDespatched} onChange={(e) => { setShowDespatched(e.target.checked); setPage(1); }} />
            Show despatched
          </label>
          {canManage && (
            <span className="ml-auto flex gap-2">
              <Button onClick={() => { setAssignPanel((v) => !v); setAssignOpId(null); }}>⚖ Assign Operative</Button>
              <Button variant="primary" onClick={() => setGate({ kind: 'bulk-status' })}>▶ Bulk Update Status</Button>
              {cf.hasFilters && <Button onClick={cf.clear}>✕ Clear filters</Button>}
            </span>
          )}
        </div>

        {/* Bulk advance bar */}
        {selected.size > 0 && !assignPanel && (
          <div className="mb-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-teal bg-teal-l px-3.5 py-2.5">
            <span className="text-xs font-bold text-teal">{selected.size} selected</span>
            <select value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className={ctrl}>
              <option value="">— Move to stage —</option>
              {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button variant="primary" disabled={busy} onClick={bulkAdvanceSelected}>▶ Advance selected</Button>
            <Button className="ml-auto" onClick={clearSelection}>✕ Clear</Button>
          </div>
        )}

        {/* Bulk assign panel */}
        {assignPanel && (
          <div className="mb-2.5 rounded-lg border border-border bg-surface2 px-3.5 py-3">
            <div className="mb-2.5 flex items-center justify-between text-xs font-bold">
              <span>Bulk assign operative</span>
              <Button onClick={() => { setAssignPanel(false); setAssignOpId(null); }}>✕</Button>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {(operatives ?? []).map((op) => (
                <Button key={op.id} variant={assignOpId === op.id ? 'primary' : 'default'} onClick={() => setAssignOpId(op.id)}>
                  {op.name}
                </Button>
              ))}
            </div>
            <div className="mb-1.5 text-[11px] text-text3">
              {assignOpId
                ? `${operatives?.find((o) => o.id === assignOpId)?.name} selected — tick tickets below to assign`
                : 'Select an operative above, then tick tickets below'}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setSelected(new Set(slice.map(({ ticket }) => ticket.id)))}>Select all visible</Button>
              <Button variant="primary" disabled={!assignOpId || !selected.size || busy} onClick={() => void confirmBulkAssign()}>
                Assign to selected
              </Button>
            </div>
          </div>
        )}

        <Card>
          <Table
            head={[
              <input
                key="all"
                type="checkbox"
                className="accent-teal"
                checked={slice.length > 0 && slice.every(({ ticket }) => selected.has(ticket.id))}
                onChange={(e) => {
                  const next = new Set(selected);
                  for (const { ticket } of slice) {
                    if (e.target.checked) next.add(ticket.id); else next.delete(ticket.id);
                  }
                  setSelected(next);
                }}
              />,
              'T/Card #',
              <FilterInput key="type" col="type" placeholder="Type" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="order" col="order" placeholder="Order" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="customer" col="customer" placeholder="Customer" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="ref" col="ref" placeholder="Customer Ref" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="detail" col="detail" placeholder="Detail" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              <FilterInput key="stage" col="stage" placeholder="Stage" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              'Progress',
              <FilterInput key="deadline" col="deadline" placeholder="Deadline / Despatched" filters={cf.filters} onChange={(c, v) => { cf.set(c, v); setPage(1); }} />,
              'Hrs',
              'Actions',
            ]}
          >
            <QueryState isLoading={isLoading} error={error} colSpan={12} />
            {!isLoading && !error && slice.length === 0 && (
              <tr><td colSpan={12} className="px-3 py-10 text-center text-xs text-text3">No tickets.</td></tr>
            )}
            {slice.map(({ ticket: t, child }) => {
              const o = t.order;
              const qcIdx = stageIndex('8. QC Check');
              const parts = t.type === 'COMP' ? all.filter((p) => p.compParentId === t.id) : [];
              const partsDone = parts.filter((p) => stageIndex(p.status) >= qcIdx).length;
              const parent = t.compParentId != null ? all.find((x) => x.id === t.compParentId) : null;
              return (
                <tr
                  key={t.id}
                  className={`cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40 ${child ? 'bg-surface2/40' : ''}`}
                  onClick={() => setDetailId(t.id)}
                >
                  <td className="w-8 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-teal" checked={selected.has(t.id)} onChange={(e) => toggle(t.id, e.target.checked)} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-text3">{child ? '↳ ' : ''}#{t.tn ?? 'TBC'}</td>
                  <td className="px-3 py-2"><TypeBadge type={t.type} /></td>
                  <td className="px-3 py-2 font-medium">{o?.orderNumber ?? `#${t.orderId}`}</td>
                  <td className="max-w-25 truncate px-3 py-2 text-[11px] text-text2">{o?.customer?.name ?? '—'}</td>
                  <td className="max-w-25 truncate px-3 py-2 text-[11px] text-text2">{o?.siteName ?? '—'}</td>
                  <td className={`max-w-60 px-3 py-2 ${child ? 'pl-6 text-text2' : ''}`}>
                    <span className="block truncate" title={t.detail}>
                      {t.detail}
                      {t.resinType === 'M2' && <span className="ml-1.5 rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">⚠ M2</span>}
                    </span>
                    {t.type === 'COMP' && parts.length > 0 && (
                      <span className={`block text-[9px] font-bold ${partsDone === parts.length ? 'text-teal' : 'text-amber'}`}>
                        ★ {partsDone}/{parts.length} parts at QC+
                      </span>
                    )}
                    {parent && (
                      <span className="block truncate text-[9px] text-text3">↳ part of #{parent.tn ?? 'TBC'} {parent.detail.slice(0, 30)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2">{t.type === 'RAW' ? <StatusPill status={t.status} /> : <ProgressBar pct={t.pct} />}</td>
                  <td className="px-3 py-2 text-[11px]"><DeadlineCell deadline={o?.deadline} despatchDate={t.despatchDate} /></td>
                  <td className="px-3 py-2 tabular-nums text-text2">{t.hrs || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {t.status === 'Despatched' && canManage && (
                      <Button onClick={() => setGate({ kind: 'return-pin', ticket: t })}>⚠ Override</Button>
                    )}
                    {t.type === 'RAW' && t.status === 'Ordered' && (
                      <Button
                        variant="primary"
                        onClick={() => apiClient.post(`/api/tickets/${t.id}/status`, { status: 'Received' }).then(invalidateAll)}
                      >
                        Mark received
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
          <div className="flex items-center justify-between border-t border-border bg-surface2 px-3 py-2 text-xs text-text2">
            <Button onClick={() => setPage(current - 1)} disabled={current <= 1}>← Prev</Button>
            <span>Page {current} of {pageCount} · {rows.length} ticket{rows.length === 1 ? '' : 's'}</span>
            <Button onClick={() => setPage(current + 1)} disabled={current >= pageCount}>Next →</Button>
          </div>
        </Card>
      </Content>
    </>
  );
}

/** "Bulk Update Ticket Status" — move all tickets at one stage to another
 * (In Progress orders only), with a live preview (ported from openBulkStatusUpdate). */
function BulkStatusModal({
  tickets,
  onClose,
  onApply,
}: {
  tickets: Ticket[];
  onClose: () => void;
  onApply: (ids: number[], target: string) => void;
}) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const eligible = useMemo(
    () =>
      !from
        ? []
        : tickets.filter((t) => t.status === from && t.type !== 'RAW' && t.order?.status === 'In Progress'),
    [tickets, from],
  );
  const sel = 'w-full rounded-md border border-border2 bg-surface px-2 py-1.5 text-xs outline-none focus:border-teal';

  return (
    <Modal
      title="Bulk Update Ticket Status"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!from || !to || from === to || !eligible.length}
            onClick={() => { onApply(eligible.map((t) => t.id), to); onClose(); }}
          >
            Apply bulk update
          </Button>
        </>
      }
    >
      <p className="mb-3.5 text-xs text-text2">
        Move all tickets currently at a given stage to another stage. Only applies to tickets on <strong>In Progress</strong> orders.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-text2">Move tickets FROM</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={`mt-1 ${sel}`}>
            <option value="">— Select current stage —</option>
            {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-text2">Move tickets TO</label>
          <select value={to} onChange={(e) => setTo(e.target.value)} className={`mt-1 ${sel}`}>
            <option value="">— Select target stage —</option>
            {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-2.5 text-[11px]">
        {!from ? (
          <span className="text-text3">Select stages above to preview affected tickets.</span>
        ) : eligible.length ? (
          <span className="font-bold text-teal">
            {eligible.length} ticket{eligible.length !== 1 ? 's' : ''} will be moved
            {to ? <> from <strong>{from}</strong> to <strong>{to}</strong></> : null}
          </span>
        ) : (
          <span className="text-text3">No tickets at this stage on In Progress orders</span>
        )}
      </div>
    </Modal>
  );
}
