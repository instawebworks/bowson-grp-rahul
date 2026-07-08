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
  wcForDeadline,
  wcKey,
  weekCapacityFor,
} from '@bowson/shared';
import {
  useAssignMould,
  useConfirmCure,
  useDeleteOrder,
  useMoulds,
  useOperatives,
  useOrder,
  useOrderAudit,
  useSetCure,
  useSettings,
  useTickets,
  useUpdateOrder,
} from '../lib/hooks';
import { apiClient } from '../lib/api';
import { Button, Card, Content, Modal, PageHeader, ProgressBar, StatusPill, Table } from '../components/ui';
import { TicketForm } from '../components/TicketForm';
import { TicketStatusSelect } from '../components/TicketStatusSelect';
import { EditTicketModal } from '../components/EditTicketModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { EditOrderForm } from '../components/EditOrderForm';
import { CatalogueForm } from '../components/CatalogueForm';
import { useAuth } from '../lib/auth';
import { cureState, fmtCureMins, fmtDate, money } from '../lib/format';
import type { Order, Ticket } from '../lib/types';

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
  selected,
  onToggle,
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  indent?: boolean;
  onEdit?: () => void;
  selected?: boolean;
  onToggle?: (checked: boolean) => void;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="w-8 px-3 py-2">
        {onToggle && ticket.type !== 'RAW' && (
          <input type="checkbox" className="accent-teal" checked={!!selected} onChange={(e) => onToggle(e.target.checked)} />
        )}
      </td>
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
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [deleteFlow, setDeleteFlow] = useState<'pin' | 'confirm' | null>(null);
  const [editTicket, setEditTicket] = useState<{ ticket: Ticket; parts: Ticket[] } | null>(null);
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const qc = useQueryClient();
  const { canManage } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /** Bulk advance the ticked tickets to a stage (ported from otAdvanceToStage). */
  async function bulkAdvance() {
    if (!bulkStage || !bulkSel.size) return;
    if (!window.confirm(`Move ${bulkSel.size} ticket${bulkSel.size !== 1 ? 's' : ''} to "${bulkStage}"?`)) return;
    setBulkBusy(true);
    try {
      for (const tid of bulkSel) {
        try {
          await apiClient.post(`/api/tickets/${tid}/status`, { status: bulkStage });
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
      {showCatalogue && <CatalogueForm onClose={() => setShowCatalogue(false)} />}
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
            {canManage && <Button onClick={() => setShowCatalogue(true)}>+ Add to catalogue</Button>}
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
          {canManage && bulkSel.size > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 border-b border-teal bg-teal-l px-3.5 py-2">
              <span className="text-xs font-bold text-teal">{bulkSel.size} selected</span>
              <select
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value)}
                className="rounded-md border border-border2 bg-surface px-2 py-1 text-xs outline-none focus:border-teal"
              >
                <option value="">— Move to stage —</option>
                {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Button variant="primary" disabled={!bulkStage || bulkBusy} onClick={() => void bulkAdvance()}>
                ▶ Advance selected
              </Button>
              <Button className="ml-auto" onClick={() => setBulkSel(new Set())}>✕ Clear</Button>
            </div>
          )}
          <Table head={['', 'TN', 'Type', 'Detail', 'Status', 'Progress', 'Mould / Cure', 'Value', '']}>
            {tops.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">
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
                bulkSel={canManage ? bulkSel : undefined}
                onBulkToggle={
                  canManage
                    ? (tid, checked) =>
                        setBulkSel((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(tid); else next.delete(tid);
                          return next;
                        })
                    : undefined
                }
              />
            ))}
          </Table>
        </Card>

        {canManage && (
          <SuggestSchedulePanel order={order} orderTickets={tickets} />
        )}

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
  bulkSel,
  onBulkToggle,
}: {
  ticket: Ticket;
  orderId: number;
  moulds: { id: number; ref: string }[];
  now: number;
  parts: Ticket[];
  onEdit?: (ticket: Ticket, parts: Ticket[]) => void;
  bulkSel?: Set<number>;
  onBulkToggle?: (ticketId: number, checked: boolean) => void;
}) {
  return (
    <>
      <TicketRow
        ticket={ticket}
        orderId={orderId}
        moulds={moulds}
        now={now}
        onEdit={onEdit ? () => onEdit(ticket, parts) : undefined}
        selected={bulkSel?.has(ticket.id)}
        onToggle={onBulkToggle ? (checked) => onBulkToggle(ticket.id, checked) : undefined}
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
          selected={bulkSel?.has(p.id)}
          onToggle={onBulkToggle ? (checked) => onBulkToggle(p.id, checked) : undefined}
        />
      ))}
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

  const suggestion = useMemo(() => {
    const committed = new Map<string, number>();
    for (const t of allTickets ?? []) {
      if (t.orderId === order.id) continue;
      if (!(LIVE_STATUSES as readonly string[]).includes(t.status)) continue;
      const key = wcKey(t.wc);
      if (!key) continue;
      committed.set(key, (committed.get(key) ?? 0) + (t.hrs || 0) * (weights[t.status] ?? 1));
    }
    let hrsRemaining = totalHrs;
    let startKey: string | null = null;
    let endKey: string | null = null;
    let weeksNeeded = 0;
    const weekKeys = nextWeeks(26).map((w) => wcKey(w));
    for (const key of weekKeys) {
      const cap = weekCapacityFor(ops, key);
      const spare = cap - (committed.get(key) ?? 0);
      if (cap > 0 && spare <= 0) continue; // week is full — skip
      if (!startKey) startKey = key;
      hrsRemaining -= cap > 0 ? Math.max(spare, 0) : HRS_PER_DAY * 5;
      weeksNeeded++;
      endKey = key;
      if (hrsRemaining <= 0) break;
    }
    startKey ??= weekKeys[0]!;
    endKey ??= startKey;
    const end = new Date(endKey);
    end.setDate(end.getDate() + 11); // +1 week buffer, land on the Friday
    const noCapacity = weekKeys.slice(0, 8).every((k) => weekCapacityFor(ops, k) === 0);
    return { startKey, deadline: isoDate(end), weeksNeeded, noCapacity };
  }, [allTickets, ops, order.id, totalHrs, weights]);

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
