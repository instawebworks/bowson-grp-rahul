import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  GRP_STAGES,
  HRS_PER_DAY,
  LIVE_STATUSES,
  STAGE_HRS_REMAINING,
  formatWc,
  isoDate,
  nextStage,
  nextWeeks,
  stageIndex,
  wcForDeadline,
  wcKey,
  weekCapacityFor,
} from '@bowson/shared';
import {
  useChangeTicketStatus,
  useDeleteOrder,
  useOperatives,
  useOrder,
  useOrderAudit,
  useSettings,
  useTickets,
  useUpdateOrder,
} from '../lib/hooks';
import { apiClient } from '../lib/api';
import { Button, Card, ConfirmDialog, Content, Modal, PageHeader, ProgressBar, Saving, StatusPill } from '../components/ui';
import { TicketForm } from '../components/TicketForm';
import { useGatedStatusChange } from '../components/TicketStatusSelect';
import { EditTicketModal } from '../components/EditTicketModal';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { EditOrderForm } from '../components/EditOrderForm';
import { CatalogueForm } from '../components/CatalogueForm';
import { buildDespatchHtml, openDocument } from '../lib/documents';
import { computeSuggestedSchedule } from '../lib/suggestSchedule';
import { useAuth } from '../lib/auth';
import { fmtDate, money } from '../lib/format';
import type { Order, Ticket } from '../lib/types';

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
      {type === 'COMP' ? 'Slide (Assembly)' : type === 'MADE' ? 'Slide' : type === 'RAW' ? 'Raw Stock' : 'Part'}
    </span>
  );
}

/** Labelled section (prototype's .ds / .ds-title). */
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between border-b border-border pb-1.5 text-[11px] font-bold uppercase tracking-wide text-text3">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A labelled detail field (prototype's .dfield). */
function DField({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</div>
      <div className={`text-xs font-medium ${muted ? 'text-text3' : ''}`}>{value}</div>
    </div>
  );
}

/** ‹ step-back / › advance buttons with the workflow gates (ported from the
 * order drawer's reverseTkt / advanceTkt). */
function AdvanceButtons({ ticket, orderId }: { ticket: Ticket; orderId: number }) {
  const { requestChange, gateUi, isPending } = useGatedStatusChange(ticket);
  const reverse = useChangeTicketStatus(orderId);
  const idx = stageIndex(ticket.status);
  const canRev = idx > 0;
  const canAdv = idx >= 0 && idx < GRP_STAGES.length - 1;
  return (
    <>
      {gateUi}
      <Button
        title="Step back"
        className="px-1.5 py-1"
        disabled={!canRev || reverse.isPending}
        onClick={(e) => { e.stopPropagation(); if (canRev) reverse.mutate({ ticketId: ticket.id, status: GRP_STAGES[idx - 1]! }); }}
      >
        {reverse.isPending ? '…' : '‹'}
      </Button>
      <Button
        variant="primary"
        title="Advance"
        className="px-1.5 py-1"
        disabled={!canAdv || isPending}
        onClick={(e) => { e.stopPropagation(); const ns = nextStage(ticket.status); if (ns) requestChange(ns); }}
      >
        {isPending ? '…' : '›'}
      </Button>
    </>
  );
}

/** One constituent PART row inside a COMP block (prototype's compPartRow). */
function PartRow({
  part, orderId, showChk, selected, onToggle, onEdit, onOpen,
}: {
  part: Ticket;
  orderId: number;
  showChk: boolean;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="mb-0.5 flex items-center gap-2 rounded px-1.5 py-1 text-[11px] hover:bg-teal-l/40" onClick={onOpen} role="button">
      {showChk && (
        <input type="checkbox" className="accent-teal" checked={selected} onClick={(e) => e.stopPropagation()} onChange={(e) => onToggle(e.target.checked)} />
      )}
      <span className="text-[10px] text-text3">└</span>
      <TypeBadge type="PART" />
      <span className="font-semibold text-text2">#{part.tn ?? 'TBC'}</span>
      <span className="min-w-0 flex-1 truncate">
        {part.detail}
        {part.spec && <span className="ml-1.5 rounded bg-teal-l px-1.5 py-0.5 text-[10px] font-semibold text-teal">{part.spec}</span>}
      </span>
      <ProgressBar pct={part.pct} />
      <StatusPill status={part.status} />
      <Button title="Edit" className="px-1.5 py-0.5" onClick={(e) => { e.stopPropagation(); onEdit(); }}>✎</Button>
      <AdvanceButtons ticket={part} orderId={orderId} />
    </div>
  );
}

/** A top-level ticket block (RAW / MADE / COMP with nested parts) — prototype's
 * orderTicketBlock. */
function OrderTicketBlock({
  ticket, parts, orderId, showChk, bulkSel, onBulkToggle, onEdit, onOpen,
}: {
  ticket: Ticket;
  parts: Ticket[];
  orderId: number;
  showChk: boolean;
  bulkSel: Set<number>;
  onBulkToggle: (id: number, checked: boolean) => void;
  onEdit: (t: Ticket, parts: Ticket[]) => void;
  onOpen: (id: number) => void;
}) {
  const isComp = ticket.type === 'COMP';
  const isRaw = ticket.type === 'RAW';
  const headBg = TYPE_STYLE[ticket.type]?.bg ?? TYPE_STYLE.RAW!.bg;
  const partsDone = parts.filter((p) => p.status === 'Despatched').length;

  return (
    <div className={`mb-2 overflow-hidden rounded-lg border ${isComp ? 'border-2 border-blue' : 'border-border'}`}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: headBg }} onClick={() => onOpen(ticket.id)} role="button">
        {showChk && ticket.type === 'MADE' && (
          <input type="checkbox" className="accent-teal" checked={bulkSel.has(ticket.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => onBulkToggle(ticket.id, e.target.checked)} />
        )}
        <TypeBadge type={ticket.type} />
        <span className="font-bold text-teal">#{ticket.tn ?? 'TBC'}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{ticket.detail}</span>
        <Button title="Edit" className="px-1.5 py-0.5" onClick={(e) => { e.stopPropagation(); onEdit(ticket, parts); }}>✎</Button>
        {!isComp && !isRaw && <ProgressBar pct={ticket.pct} />}
        {isComp && <ProgressBar pct={parts.length ? Math.round(parts.reduce((s, p) => s + (p.pct || 0), 0) / parts.length) : 0} />}
        <StatusPill status={ticket.status} />
        {isRaw && ticket.status === 'Ordered' && (
          <Button variant="primary" className="px-2 py-0.5" onClick={(e) => { e.stopPropagation(); onOpen(ticket.id); }}>Receive</Button>
        )}
        {!isComp && !isRaw && <AdvanceButtons ticket={ticket} orderId={orderId} />}
      </div>
      {ticket.spec && <div className="border-t border-border px-3 py-1 text-[11px] text-text3">{ticket.spec}</div>}
      {isComp && parts.length > 0 && (
        <div className="border-t border-border bg-surface px-3 py-1.5">
          <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-text3">
            {parts.length} constituent parts — {partsDone === parts.length ? 'all complete ✓' : `${parts.length - partsDone} remaining`}
          </div>
          {parts.map((p) => (
            <PartRow
              key={p.id}
              part={p}
              orderId={orderId}
              showChk={showChk}
              selected={bulkSel.has(p.id)}
              onToggle={(c) => onBulkToggle(p.id, c)}
              onEdit={() => onEdit(p, [])}
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Right-side drawer frame for the order detail (prototype's order drawer). */
function OrderDrawerFrame({
  title,
  sub,
  actions,
  onClose,
  children,
}: {
  title: string;
  sub?: string;
  actions?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="fixed inset-0 z-100 bg-black/30" onMouseDown={onClose}>
      <div
        className={`fixed inset-y-0 right-0 flex h-full w-full max-w-[880px] flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-border bg-surface2 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{title}</div>
            {sub && <div className="truncate text-[11px] text-text3">{sub}</div>}
          </div>
          <div className="flex flex-none flex-wrap items-center justify-end gap-1.5">
            {actions}
            <button onClick={onClose} className="ml-1 text-lg leading-none text-text3 hover:text-text" aria-label="Close">✕</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

export function OrderDetail({ asDrawer = false }: { asDrawer?: boolean }) {
  const { id } = useParams();
  const orderId = Number(id);
  const { data: order, isLoading, error } = useOrder(orderId);
  const deleteOrder = useDeleteOrder();
  const navigate = useNavigate();
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [deleteFlow, setDeleteFlow] = useState<'pin' | 'confirm' | null>(null);
  const [editTicket, setEditTicket] = useState<{ ticket: Ticket; parts: Ticket[] } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkGate, setBulkGate] = useState<
    | { kind: 'confirm'; moves: { id: number; stage: string; needsQcRef: boolean }[]; label: string }
    | { kind: 'qcref'; moves: { id: number; stage: string; needsQcRef: boolean }[] }
    | null
  >(null);
  const [qcRefInput, setQcRefInput] = useState('');
  const qc = useQueryClient();
  const { canManage } = useAuth();

  /** Move each ticked ticket to a target stage; tickets moving into Packing
   * without a QC ref get the shared reference (ported from odAdvanceToStage). */
  async function runBulkMoves(moves: { id: number; stage: string; needsQcRef: boolean }[], sharedQcRef: string) {
    setBulkGate(null);
    setBulkBusy(true);
    try {
      for (const m of moves) {
        try {
          if (m.needsQcRef && sharedQcRef) await apiClient.patch(`/api/tickets/${m.id}`, { qcRef: sharedQcRef });
          await apiClient.post(`/api/tickets/${m.id}/status`, { status: m.stage });
        } catch {
          /* server gate (family) — skip */
        }
      }
    } finally {
      setBulkBusy(false);
      setBulkSel(new Set());
      setBulkStage('');
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    }
  }

  /** Gate + confirm shared by both bulk actions. */
  function startBulk(moves: { id: number; stage: string; needsQcRef: boolean }[], label: string) {
    if (!moves.length) return;
    if (moves.some((m) => m.needsQcRef)) {
      setQcRefInput('');
      setBulkGate({ kind: 'qcref', moves });
      return;
    }
    setBulkGate({ kind: 'confirm', moves, label });
  }

  /** Bulk advance the ticked tickets to a chosen stage. */
  function bulkAdvance() {
    if (!bulkStage || !bulkSel.size) return;
    const moves = [...bulkSel]
      .map((tid) => {
        const t = (order?.tickets ?? []).find((x) => x.id === tid);
        if (!t || t.type === 'RAW' || t.status === bulkStage) return null;
        return { id: tid, stage: bulkStage, needsQcRef: bulkStage === '9. Packing' && !t.qcRef };
      })
      .filter(Boolean) as { id: number; stage: string; needsQcRef: boolean }[];
    startBulk(moves, `Move ${moves.length} ticket${moves.length !== 1 ? 's' : ''} to "${bulkStage}"`);
  }

  /** Advance each ticked ticket one stage (ported from odAdvanceOne). */
  function bulkAdvanceOne() {
    const moves = [...bulkSel]
      .map((tid) => {
        const t = (order?.tickets ?? []).find((x) => x.id === tid);
        const ns = t && t.type !== 'RAW' ? nextStage(t.status) : null;
        if (!t || !ns) return null;
        return { id: tid, stage: ns, needsQcRef: ns === '9. Packing' && !t.qcRef };
      })
      .filter(Boolean) as { id: number; stage: string; needsQcRef: boolean }[];
    startBulk(moves, `Advance ${moves.length} ticket${moves.length !== 1 ? 's' : ''} one stage`);
  }

  const closeDrawer = () => navigate(-1);

  if (isLoading) {
    const loading = <div className="text-xs text-text3">Loading…</div>;
    return asDrawer ? (
      <OrderDrawerFrame title="Order" onClose={closeDrawer}>{loading}</OrderDrawerFrame>
    ) : (
      <><PageHeader title="Order" /><Content>{loading}</Content></>
    );
  }
  if (error || !order) {
    const err = (
      <div className="rounded-lg border border-dashed border-border2 bg-surface p-6 text-xs text-text3">
        Could not load order — {(error as Error)?.message ?? 'not found'}. <Link to="/orders" className="text-teal">Back to orders</Link>
      </div>
    );
    return asDrawer ? (
      <OrderDrawerFrame title="Order" onClose={closeDrawer}>{err}</OrderDrawerFrame>
    ) : (
      <><PageHeader title="Order" /><Content>{err}</Content></>
    );
  }

  const tickets = order.tickets ?? [];
  const tops = tickets.filter((t) => t.compParentId == null);
  const partsOf = (compId: number) => tickets.filter((t) => t.compParentId === compId);
  const orderOverdue =
    !!order.deadline && order.deadline.slice(0, 10) < new Date().toISOString().slice(0, 10) &&
    !['Despatched', 'Completed', 'Cancelled'].includes(order.status);
  const orderPct = tops.length ? Math.round(tops.reduce((s, t) => s + (t.pct || 0), 0) / tops.length) : 0;

  /** Manual delivery-note reprint for a despatched / ready order (prototype 📄 button). */
  function openDespatchNote() {
    const ts = tickets.filter((t) => t.type !== 'RAW').map((t) => ({ ...t, order }));
    if (!ts.length) return;
    const dDate = ts.find((t) => t.despatchDate)?.despatchDate ?? new Date().toISOString().slice(0, 10);
    openDocument(buildDespatchHtml(ts, dDate, false));
  }

  const selectableIds = tickets.filter((t) => t.type !== 'RAW' && t.type !== 'COMP').map((t) => t.id);
  const toggleBulk = (id: number, checked: boolean) =>
    setBulkSel((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });

  const body = (
    <>
      {/* Order status (prototype's "Order status" section) */}
      <Section title="Order status">
        <div className="flex flex-wrap items-center gap-2.5">
          <StatusPill status={order.status} />
          <div className="w-44"><ProgressBar pct={orderPct} /></div>
          {orderOverdue && <span className="rounded bg-red/10 px-1.5 py-0.5 text-[9px] font-bold text-red">⚠ overdue</span>}
        </div>
      </Section>

      {/* Details grid (prototype's "Details" section) */}
      <Section title="Details">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <DField label="Order #" value={order.orderNumber} />
          <DField label="Customer" value={order.customer?.name ?? '—'} />
          <DField label="Customer ref" value={order.siteName ?? '—'} />
          <DField label="Deadline" value={<span className={orderOverdue ? 'font-bold text-red' : ''}>{fmtDate(order.deadline)}</span>} />
          <DField label="Despatch" value={order.despatch ?? '—'} />
          <DField label="W/C" value={order.wc ?? '—'} muted />
          <DField label="Resin" value={order.resinType} />
          <DField label="Value" value={money(order.value)} />
        </div>
        {order.notes && (
          <div className="mt-2.5 rounded-lg bg-surface2 px-3 py-2 text-xs text-text2">{order.notes}</div>
        )}
        {order.themeImage && (
          <div className="mt-3">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text3">Colour theme</div>
            <img src={order.themeImage} alt="Colour theme" className="max-h-56 rounded-lg border border-border" />
          </div>
        )}
        {(order.packingChecklist?.length ?? 0) > 0 && (
          <div className="mt-3 overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-surface2 px-3 py-2 text-[11px] font-bold">
              <span>📦 Packing Hardware</span>
              <span className="text-[10px] text-text3">
                {order.packingChecklist!.filter((h) => h.checked).length}/{order.packingChecklist!.length} picked
              </span>
            </div>
            <div className="px-3 py-2">
              {order.packingChecklist!.map((h, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 text-xs">
                  <span>{h.checked ? '✅' : '⬜'}</span>
                  <span className={h.checked ? 'text-text3 line-through' : ''}>{h.name}</span>
                  {!!h.qty && <span className="text-[11px] text-text3">×{h.qty}</span>}
                </div>
              ))}
              {order.packingNotes && (
                <div className="mt-1.5 border-t border-border pt-1.5 text-[11px] text-text2">{order.packingNotes}</div>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Tickets & items (prototype's block layout + bulk-advance panel) */}
      <Section
        title={`Tickets & items (${tops.length})`}
        action={canManage && <Button variant="primary" className="px-2 py-1 text-[11px]" onClick={() => setShowAdd(true)}>+ Add ticket</Button>}
      >
        {canManage && tops.length > 0 && (
          <div className="mb-2.5 rounded-lg border border-border bg-surface2 px-3 py-2.5">
            <div className="mb-2 text-[11px] font-bold text-text2">⚖ Bulk advance tickets</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  className="accent-teal"
                  checked={selectableIds.length > 0 && selectableIds.every((id) => bulkSel.has(id))}
                  onChange={(e) => setBulkSel(e.target.checked ? new Set(selectableIds) : new Set())}
                />
                Select all
              </label>
              <span className="text-[11px] text-text3">{bulkSel.size} selected</span>
              <Button variant="primary" className="px-2 py-1 text-[11px]" disabled={bulkBusy} onClick={bulkAdvanceOne}>→ Advance one stage</Button>
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
              >
                <option value="">— or pick stage —</option>
                {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button className="px-2 py-1 text-[11px]" disabled={!bulkStage || bulkBusy} onClick={bulkAdvance}>Move to stage</Button>
            </div>
          </div>
        )}
        {tops.length === 0 ? (
          <div className="py-8 text-center text-xs text-text3">No tickets yet — click “+ Add ticket”.</div>
        ) : (
          tops.map((t) => (
            <OrderTicketBlock
              key={t.id}
              ticket={t}
              parts={t.type === 'COMP' ? partsOf(t.id) : []}
              orderId={orderId}
              showChk={canManage}
              bulkSel={bulkSel}
              onBulkToggle={toggleBulk}
              onEdit={(ticket, parts) => setEditTicket({ ticket, parts })}
              onOpen={setDetailId}
            />
          ))
        )}
      </Section>

      {canManage && <SuggestSchedulePanel order={order} orderTickets={tickets} />}

      {/* Order actions (prototype's "Update order status" section) */}
      {canManage && (
        <Section title="Order actions">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setShowEdit(true)}>Edit details</Button>
            <Button onClick={() => setShowCatalogue(true)}>+ Add to catalogue</Button>
            {['Despatched', 'Ready to Despatch', 'Completed'].includes(order.status) && (
              <Button onClick={openDespatchNote}>📄 Despatch Note</Button>
            )}
            <Button variant="danger" onClick={() => setDeleteFlow('pin')}>Delete order</Button>
          </div>
        </Section>
      )}

      <OrderAudit orderId={orderId} orderNumber={order.orderNumber} tickets={tickets} />
    </>
  );

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
      {showCatalogue && <CatalogueForm onClose={() => setShowCatalogue(false)} />}
      {editTicket && (
        <EditTicketModal ticket={editTicket.ticket} parts={editTicket.parts} onClose={() => setEditTicket(null)} />
      )}
      {bulkGate?.kind === 'confirm' && (
        <ConfirmDialog
          title={`${bulkGate.label}?`}
          danger={false}
          message={
            <>
              Progress updates automatically and every change is recorded in the audit log.
            </>
          }
          confirmLabel="▶ Move tickets"
          busy={bulkBusy}
          onCancel={() => setBulkGate(null)}
          onConfirm={() => void runBulkMoves(bulkGate.moves, '')}
        />
      )}
      {bulkGate?.kind === 'qcref' && (
        <Modal
          title="QC Reference Required"
          onClose={() => setBulkGate(null)}
          footer={
            <>
              <Button onClick={() => setBulkGate(null)}>Cancel</Button>
              <Button
                variant="primary"
                disabled={!qcRefInput.trim() || bulkBusy}
                onClick={() => void runBulkMoves(bulkGate.moves, qcRefInput.trim())}
              >
                Confirm &amp; Advance
              </Button>
            </>
          }
        >
          <p className="mb-3 text-xs text-text2">
            {bulkGate.moves.filter((m) => m.needsQcRef).length} ticket
            {bulkGate.moves.filter((m) => m.needsQcRef).length !== 1 ? 's' : ''} moving to Packing{' '}
            {bulkGate.moves.filter((m) => m.needsQcRef).length !== 1 ? 'have' : 'has'} no QC reference.
            Enter one to apply.
          </p>
          <input
            value={qcRefInput}
            autoFocus
            placeholder="e.g. QC-2025-047"
            onChange={(e) => setQcRefInput(e.target.value)}
            className="w-full rounded-md border border-border2 bg-surface px-2.5 py-2 text-xs outline-none focus:border-teal"
          />
        </Modal>
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
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}
      {asDrawer ? (
        <OrderDrawerFrame
          title={`Order ${order.orderNumber}`}
          sub={order.customer?.name ?? undefined}
          onClose={closeDrawer}
        >
          {body}
        </OrderDrawerFrame>
      ) : (
        <>
          <PageHeader
            title={`Order ${order.orderNumber}`}
            sub={order.customer?.name ?? undefined}
            actions={<Link to="/orders"><Button>← All Orders</Button></Link>}
          />
          <Content>{body}</Content>
        </>
      )}
    </>
  );
}

/** Suggested Schedule for an existing order — ported from suggestScheduleHtml:
 * walk the coming weeks filling spare capacity until the order's hours are
 * absorbed, then suggest a start week + deadline (with a 1-week buffer). */
function SuggestSchedulePanel({ order, orderTickets }: { order: Order; orderTickets: Ticket[] }) {
  const { data: operatives } = useOperatives();
  const { data: allTickets } = useTickets();
  const { data: settings } = useSettings();
  const update = useUpdateOrder(order.id);
  const [manual, setManual] = useState('');

  const totalHrs = orderTickets.reduce((s, t) => s + (t.hrs || 0), 0);
  const ops = operatives ?? [];
  const weights: Record<string, number> = settings?.stageWeights ?? STAGE_HRS_REMAINING;

  const suggestion = useMemo(
    () =>
      computeSuggestedSchedule({
        ops,
        allTickets: allTickets ?? [],
        totalHrs,
        weights,
        excludeOrderId: order.id,
      }),
    [allTickets, ops, order.id, totalHrs, weights],
  );

  if (!orderTickets.length) return null;
  const alreadySet = !!order.deadline;
  const startLabel = formatWc(new Date(suggestion.startKey));

  return (
    <Card title="Suggested Schedule" className="mt-4">
      <div className="p-3.5">
        <div className="mb-2.5 grid grid-cols-3 gap-2.5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-text3">Total hours</div>
            <div className="text-xl font-bold">{totalHrs}h</div>
            <div className="text-[10px] text-text3">{orderTickets.length} ticket{orderTickets.length !== 1 ? 's' : ''}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-text3">Suggested W/C start</div>
            <div className="text-[15px] font-bold text-teal">{startLabel}</div>
            <div className="text-[10px] text-text3">
              {suggestion.noCapacity ? 'Estimate only' : `${suggestion.weeksNeeded} week${suggestion.weeksNeeded !== 1 ? 's' : ''}`} of production
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-text3">Suggested deadline</div>
            <div className="text-[15px] font-bold text-teal">{suggestion.deadline}</div>
            <div className="text-[10px] text-text3">inc. 1 week buffer</div>
          </div>
        </div>
        {suggestion.noCapacity && (
          <div className="mb-2 text-[10px] text-amber">⚠ Set operative hours in Schedule for accurate suggestions</div>
        )}
        {alreadySet ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-l px-2.5 py-2 text-[11px] text-teal">
            ✓ Deadline confirmed: <strong>{order.deadline!.slice(0, 10)}</strong> · W/C: <strong>{order.wc ?? '—'}</strong>
            <Button onClick={() => update.mutate({ deadline: null, wc: null })}>Change</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={update.isPending}
              onClick={() => update.mutate({ wc: startLabel, deadline: suggestion.deadline })}
            >
              ✓ Accept suggestion
            </Button>
            <span className="text-[11px] text-text3">or set manually:</span>
            <input
              type="date"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              className="rounded-md border border-border2 bg-surface px-2 py-1 text-xs outline-none focus:border-teal"
            />
            <Button
              disabled={!manual || update.isPending}
              onClick={() => update.mutate({ deadline: manual, wc: wcForDeadline(manual) })}
            >
              Set
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function OrderAudit({
  orderId,
  orderNumber,
  tickets,
}: {
  orderId: number;
  orderNumber: string;
  tickets: Ticket[];
}) {
  const { data } = useOrderAudit(orderId);
  if (!data || data.length === 0) return null;

  // Label an audit row by what the user recognises — ticket number + name, or
  // the order number — never the raw database id (see #382 vs #304 report).
  const label = (entityType: string, entityId: number) => {
    if (entityType === 'order') return `Order ${orderNumber}`;
    const t = tickets.find((x) => x.id === entityId);
    if (!t) return `Ticket #${entityId}`; // deleted ticket — id is all we have
    const num = t.tn != null ? `Ticket #${t.tn}` : 'Ticket';
    return t.detail ? `${num} — ${t.detail}` : num;
  };

  return (
    <div className="mt-4">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Activity</div>
      <div className="space-y-1">
        {data.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="whitespace-nowrap text-text3">
              {new Date(a.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="font-medium text-text2">{label(a.entityType, a.entityId)}</span>
            <span className="text-text3">{a.field}</span>
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

