import { useEffect, useMemo, useState } from 'react';
import { GRP_STAGES, RAW_STAGES, STAGE_SHORT, nextStage, stageIndex } from '@bowson/shared';
import {
  useAssignMould,
  useAssignTicket,
  useAuditFor,
  useCatalogue,
  useChangeTicketStatus,
  useConfirmCure,
  useDeleteTicket,
  useMoulds,
  useOperatives,
  useSetCure,
  useTicket,
  useToggleTimer,
} from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Button, Modal, ProgressBar, Saving, StatusPill } from '../components/ui';
import { useGatedStatusChange } from './TicketStatusSelect';
import { EditTicketModal } from './EditTicketModal';
import { SpecModal } from './SpecModal';
import { cureState, fmtCureMins, fmtElapsed, initials, money } from '../lib/format';
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

/** Friendly type badge (Slide (Assembly) / Slide / Raw Stock / Part). */
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
    <div>
      <div className="mb-2 flex items-center justify-between border-b border-border pb-1.5 text-[10px] font-bold uppercase tracking-wide text-text3">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

/** A read-only label + value (prototype's .dfield). */
function DField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

/** Horizontal 1–11 production-stage stepper (prototype's .stages). */
function StageStepper({ status }: { status: string }) {
  const idx = stageIndex(status);
  return (
    <div className="mt-2.5 flex">
      {STAGE_SHORT.map((n, i) => {
        const done = i < idx;
        const cur = i === idx;
        return (
          <div key={n} className="relative flex-1 text-center">
            {i < STAGE_SHORT.length - 1 && (
              <div className={`absolute left-1/2 top-[11px] h-0.5 w-full ${done ? 'bg-teal' : 'bg-border'}`} />
            )}
            <div
              className={`relative z-[1] mx-auto mb-1 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[8px] font-extrabold ${
                done ? 'border-teal bg-teal text-white' : cur ? 'border-amber bg-amber-l text-amber' : 'border-border bg-surface text-text3'
              }`}
            >
              {done ? '✓' : i + 1}
            </div>
            <span className={`text-[8px] ${done || cur ? 'text-text2' : 'text-text3'}`}>{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** ‹ step-back / › advance buttons with the workflow gates (prototype reverseTkt / advanceTkt). */
function StageAdvance({ ticket }: { ticket: Ticket }) {
  const { requestChange, gateUi, isPending } = useGatedStatusChange(ticket);
  const reverse = useChangeTicketStatus(ticket.orderId);
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

/** One constituent PART row inside a COMP block (prototype's ticketDetailPartRow). */
function PartRow({ part, onOpen, onEdit }: { part: Ticket; onOpen: () => void; onEdit: () => void }) {
  return (
    <div
      className="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-2 text-[11px] last:border-0 hover:bg-teal-l/40"
      onClick={onOpen}
      role="button"
    >
      <span className="font-semibold text-teal">#{part.tn ?? 'TBC'}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{part.detail}</span>
        <span className="block truncate text-[10px] text-text3">{part.spec || '—'}</span>
      </span>
      <StatusPill status={part.status} />
      <div className="w-11"><ProgressBar pct={part.pct} /></div>
      <Button title="Edit" className="px-1.5 py-0.5" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</Button>
      <StageAdvance ticket={part} />
    </div>
  );
}

/** "Update" controls for RAW (Ordered / Received) and MADE·PART (status select
 * + Save + ‹ ›), with the workflow gates (prototype's saveTktStat block). */
function UpdateControls({ ticket }: { ticket: Ticket }) {
  const { requestChange, gateUi, isPending } = useGatedStatusChange(ticket);
  const reverse = useChangeTicketStatus(ticket.orderId);
  const [draft, setDraft] = useState(ticket.status);
  useEffect(() => setDraft(ticket.status), [ticket.status]);

  if (ticket.type === 'RAW') {
    return (
      <>
        {gateUi}
        <Button disabled={isPending || ticket.status === 'Ordered'} onClick={() => requestChange('Ordered')}>Ordered</Button>
        <Button variant="primary" disabled={isPending || ticket.status === 'Received'} onClick={() => requestChange('Received')}>Mark received</Button>
      </>
    );
  }

  const idx = stageIndex(ticket.status);
  const canRev = idx > 0;
  const canAdv = idx >= 0 && idx < GRP_STAGES.length - 1;
  const inStages = (GRP_STAGES as readonly string[]).includes(draft);
  return (
    <>
      {gateUi}
      <Saving busy={isPending}>
        <select
          value={inStages ? draft : ''}
          onChange={(e) => setDraft(e.target.value)}
          className="h-[30px] rounded-md border border-border2 bg-surface px-2 text-xs outline-none focus:border-teal"
        >
          {!inStages && <option value="">{draft}</option>}
          {GRP_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Saving>
      <Button variant="primary" disabled={isPending || draft === ticket.status} onClick={() => requestChange(draft)}>Save</Button>
      <Button
        title="Step back"
        className="px-1.5 py-1"
        disabled={!canRev || reverse.isPending}
        onClick={() => canRev && reverse.mutate({ ticketId: ticket.id, status: GRP_STAGES[idx - 1]! })}
      >
        {reverse.isPending ? '…' : '‹'}
      </Button>
      <Button
        variant="primary"
        title="Advance"
        className="px-1.5 py-1"
        disabled={!canAdv || isPending}
        onClick={() => { const ns = nextStage(ticket.status); if (ns) requestChange(ns); }}
      >
        {isPending ? '…' : '›'}
      </Button>
    </>
  );
}

export function TicketDetailModal({ ticketId, onClose }: { ticketId: number; onClose: () => void }) {
  // Internal view id lets constituent-part rows navigate within the same drawer
  // (prototype re-renders openTicketDetail for the clicked part).
  const [viewId, setViewId] = useState(ticketId);
  useEffect(() => setViewId(ticketId), [ticketId]);

  const { data: t, isLoading } = useTicket(viewId);
  const { data: operatives } = useOperatives();
  const { data: moulds } = useMoulds();
  const { data: audit } = useAuditFor('ticket', viewId);
  const orderId = t?.orderId;

  const assign = useAssignTicket();
  const assignMould = useAssignMould(orderId);
  const setCure = useSetCure(orderId);
  const confirmCure = useConfirmCure(orderId);
  const toggleTimer = useToggleTimer();
  const deleteTicket = useDeleteTicket(orderId ?? 0);
  const { data: catalogue } = useCatalogue();
  const { canManage } = useAuth();
  const [editTarget, setEditTarget] = useState<Ticket | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showSpec, setShowSpec] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Matched catalogue template for the spec/parts viewer (ported from kbViewSpec).
  const specTemplate = useMemo(() => {
    if (!t) return undefined;
    return (catalogue ?? []).find((c) => c.name === t.detail || c.parts.some((p) => p.detail === t.detail));
  }, [catalogue, t]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const assignedIds = useMemo(() => (t?.assignments ?? []).map((a) => a.operativeId), [t]);
  const sessions = t?.time ?? [];
  const totalMs = (opId: number) =>
    sessions.filter((s) => s.operativeId === opId).reduce((sum, s) => {
      const end = s.end ? new Date(s.end).getTime() : now;
      return sum + (end - new Date(s.start).getTime());
    }, 0);
  const running = (opId: number) => sessions.some((s) => s.operativeId === opId && s.end == null);
  const opName = (id: number) => operatives?.find((o) => o.id === id)?.name ?? `#${id}`;

  function toggleAssignee(opId: number) {
    const next = assignedIds.includes(opId) ? assignedIds.filter((x) => x !== opId) : [...assignedIds, opId];
    assign.mutate({ ticketId: viewId, operativeIds: next });
  }

  const cure = t ? cureState(t, now) : null;
  const isRaw = t?.type === 'RAW';
  const isComp = t?.type === 'COMP';
  const parts = t?.parts ?? [];
  const allPartsDone = parts.length > 0 && parts.every((p) => p.status === 'Despatched');
  const m2 = t?.resinType === 'M2' || t?.order?.resinType === 'M2';

  if (editTarget) {
    return <EditTicketModal ticket={editTarget} parts={editTarget.parts ?? []} onClose={() => setEditTarget(null)} />;
  }

  if (showSpec && specTemplate) {
    return <SpecModal template={specTemplate} onClose={() => setShowSpec(false)} />;
  }

  if (lightbox) {
    return (
      <div className="fixed inset-0 z-[950] flex cursor-zoom-out items-center justify-center bg-black/80 p-6" onClick={() => setLightbox(null)}>
        <img src={lightbox} alt="Colour theme" className="max-h-full max-w-full rounded-lg" />
      </div>
    );
  }

  if (confirmDelete && t) {
    return (
      <Modal
        title={isComp ? 'Remove this slide and all its parts?' : 'Remove this ticket?'}
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={deleteTicket.isPending}
              onClick={() => deleteTicket.mutate(t.id, { onSuccess: onClose })}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-xs text-text2"><strong>{t.detail}</strong> will be removed from this order.</p>
        {isComp && parts.length > 0 && (
          <p className="mt-1.5 text-[11px] text-text3">All {parts.length} part tickets will also be removed.</p>
        )}
        {deleteTicket.isError && <div className="mt-2 text-[11px] text-red">Delete failed — {(deleteTicket.error as Error).message}</div>}
      </Modal>
    );
  }

  return (
    <Modal
      side="right"
      width="max-w-[880px]"
      title={
        t ? (
          <span className="flex flex-wrap items-center gap-2">
            <TypeBadge type={t.type} /> Ticket #{t.tn ?? 'TBC'}
            {m2 && <span className="rounded bg-amber-l px-1.5 py-0.5 text-[10px] font-bold text-amber">⚠ M2 RESIN</span>}
          </span>
        ) : (
          'Ticket'
        )
      }
      sub={t?.order ? `${t.order.orderNumber}${t.order.siteName ? ` — ${t.order.siteName}` : ''}` : undefined}
      onClose={onClose}
    >
      {isLoading || !t ? (
        <div className="py-8 text-center text-xs text-text3">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* Production stages (or RAW picking status) */}
          {!isRaw ? (
            <Section title="Production stages">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={t.status} />
                <span className="text-xs text-text2">{t.pct}%</span>
                {isComp && <span className="text-[10px] text-text3">(rolled up from parts)</span>}
              </div>
              <StageStepper status={t.status} />

              {/* Mould + cure (kept from our build; prototype puts these on the board) */}
              {!isComp && (MOULD_STAGES.includes(t.status) || CURE_STAGES.includes(t.status)) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {MOULD_STAGES.includes(t.status) && (
                    <Saving busy={assignMould.isPending}>
                      <select
                        value={t.mouldId ?? ''}
                        disabled={assignMould.isPending}
                        onChange={(e) => assignMould.mutate({ ticketId: t.id, mouldId: e.target.value ? Number(e.target.value) : null })}
                        className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
                      >
                        <option value="">— mould —</option>
                        {(moulds ?? [])
                          .filter((m) => m.status !== 'Maintenance' || m.id === t.mouldId)
                          .map((m) => <option key={m.id} value={m.id}>{m.ref}{m.status === 'Maintenance' ? ' (in maintenance)' : ''}</option>)}
                      </select>
                    </Saving>
                  )}
                  {CURE_STAGES.includes(t.status) &&
                    (cure ? (
                      <Saving busy={confirmCure.isPending}>
                        <button
                          onClick={() => confirmCure.mutate({ ticketId: t.id })}
                          disabled={confirmCure.isPending}
                          className={`rounded px-1.5 py-1 text-[11px] font-semibold ${cure.expired ? 'bg-red/10 text-red' : 'bg-amber-l text-amber'}`}
                        >
                          {cure.expired ? '✓ cure done — confirm' : `⏱ ${fmtCureMins(cure.remainingMin)} — confirm`}
                        </button>
                      </Saving>
                    ) : (
                      <Saving busy={setCure.isPending}>
                        <select
                          value=""
                          disabled={setCure.isPending}
                          onChange={(e) => setCure.mutate({ ticketId: t.id, mins: Number(e.target.value), targetStage: nextStage(t.status) ?? undefined })}
                          className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] text-text2 outline-none focus:border-teal"
                        >
                          <option value="">+ cure timer…</option>
                          {CURE_PRESETS.map((m) => <option key={m} value={m}>{fmtCureMins(m)}</option>)}
                        </select>
                      </Saving>
                    ))}
                </div>
              )}
            </Section>
          ) : (
            <Section title="RAW picking status">
              <div className="flex items-center gap-2">
                {RAW_STAGES.map((s, i) => (
                  <span key={s} className="flex items-center gap-2">
                    {i > 0 && <span className="text-text3">→</span>}
                    <span className={t.status === s ? '' : 'opacity-40'}><StatusPill status={s} /></span>
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Ticket details */}
          <Section title="Ticket details">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 md:grid-cols-4">
              <DField label="Ticket #" value={t.tn ?? 'TBC'} />
              <DField label="Type" value={<TypeBadge type={t.type} />} />
              <DField label="Qty" value={t.qty} />
              <DField label="W/C date" value={t.wc ?? '—'} />
              <DField label="Labour hrs" value={t.hrs ?? 0} />
              {t.drawing && <DField label="Drawing" value={t.drawing} />}
              {t.qcRef && <DField label="QC Ref" value={<span className="font-semibold text-teal">{t.qcRef}</span>} />}
              {t.despatchDate && <DField label="Despatch date" value={<span className="font-semibold text-blue">{t.despatchDate}</span>} />}
              {!!t.unitPrice && <DField label="Unit £" value={money(t.unitPrice)} />}
              {!!t.netPrice && <DField label="Net £" value={money(t.netPrice)} />}
            </div>
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text3">Detail</div>
              <div className="text-[13px] font-semibold">{t.detail}</div>
            </div>
            {t.spec && (
              <div className="mt-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text3">Specification</div>
                <div className="rounded-md bg-surface2 px-2.5 py-2 text-xs text-text2">{t.spec}</div>
              </div>
            )}

            {/* Theme / colour image (ticket, else order) with lightbox */}
            {(t.themeImage ?? t.order?.themeImage) && (
              <div
                className="relative mt-3 h-20 cursor-zoom-in overflow-hidden rounded-lg"
                title="🎨 Tap to enlarge"
                onClick={() => setLightbox(t.themeImage ?? t.order?.themeImage ?? null)}
              >
                <img src={t.themeImage ?? t.order?.themeImage ?? ''} alt="Colour theme" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 right-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-bold text-white">🎨 Tap to enlarge</span>
              </div>
            )}

            {/* Spec / parts viewer from the matched catalogue template */}
            {specTemplate && (
              <button
                onClick={() => setShowSpec(true)}
                className="mt-3 w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-xs font-bold text-text2 hover:bg-surface3"
              >
                📐 View Spec / Parts
              </button>
            )}
          </Section>

          {/* Constituent parts (COMP) */}
          {isComp && (
            <Section title={`Constituent parts (${parts.length})`}>
              <div className="overflow-hidden rounded-md border border-border">
                {parts.length ? (
                  parts.map((p) => (
                    <PartRow key={p.id} part={p} onOpen={() => setViewId(p.id)} onEdit={() => setEditTarget(p)} />
                  ))
                ) : (
                  <div className="px-3 py-4 text-center text-xs text-text3">No parts yet.</div>
                )}
              </div>
              {parts.length > 0 &&
                (allPartsDone ? (
                  <div className="mt-1.5 text-[11px] font-semibold text-teal">✓ All parts complete</div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-amber">
                    ⏳ {parts.filter((p) => p.status !== 'Despatched').length} part(s) still in progress — COMP status is blocked
                  </div>
                ))}
            </Section>
          )}

          {/* Update */}
          <Section title="Update">
            <div className="flex flex-wrap items-center gap-2">
              {isComp ? (
                <span className="text-[11px] text-text3">COMP status updates automatically from parts</span>
              ) : (
                <UpdateControls ticket={t} />
              )}
              {canManage && <Button onClick={() => setEditTarget(t)}>✎ Edit</Button>}
              {canManage && <Button variant="danger" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            </div>
          </Section>

          {/* Operatives & time (kept from our build) */}
          {!isRaw && (
            <Section title="Operatives & time">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(operatives ?? []).map((o) => (
                  <button
                    key={o.id}
                    onClick={() => toggleAssignee(o.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                      assignedIds.includes(o.id) ? 'border-teal bg-teal-l font-semibold text-teal' : 'border-border bg-surface2 text-text2 hover:text-text'
                    }`}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
              {assignedIds.length > 0 && (
                <div className="overflow-hidden rounded-md border border-border">
                  {assignedIds.map((opId) => {
                    const run = running(opId);
                    return (
                      <div key={opId} className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0">
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-l text-[8px] font-bold text-teal">{initials(opName(opId))}</span>
                          {opName(opId)}
                          {run && <span className="text-[10px] text-green">● running</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums text-text2">{fmtElapsed(totalMs(opId))}</span>
                          <button
                            onClick={() => toggleTimer.mutate({ ticketId: viewId, operativeId: opId, action: run ? 'stop' : 'start' })}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${run ? 'bg-red/10 text-red' : 'bg-teal text-white'}`}
                          >
                            {run ? '⏸ stop' : '▶ start'}
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Session log — each clock-in/out (prototype's session list) */}
              {sessions.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-text3">Session log</div>
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {[...sessions].reverse().map((s) => {
                      const fmtT = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                      const dur = (s.end ? new Date(s.end).getTime() : now) - new Date(s.start).getTime();
                      return (
                        <div key={s.id} className="flex gap-2 border-b border-border pb-0.5 text-[10px] last:border-0">
                          <span className="min-w-16 font-semibold text-text2">{opName(s.operativeId).split(' ')[0]}</span>
                          <span className="flex-1 text-text3">
                            {fmtT(s.start)} → {s.end ? fmtT(s.end) : <span className="text-teal">● now</span>}
                          </span>
                          <span className="font-semibold tabular-nums text-text2">{fmtElapsed(dur)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* Audit log */}
          <Section title="Audit log">
            {(audit?.length ?? 0) === 0 ? (
              <div className="text-xs text-text3">No changes recorded.</div>
            ) : (
              <div className="space-y-1">
                {(audit ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-[11px]">
                    <span className="whitespace-nowrap text-text3">{new Date(a.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="text-text2">{a.field}</span>
                    {a.field === 'status' && a.toValue ? (
                      <span className="flex items-center gap-1">{a.fromValue && <StatusPill status={a.fromValue} />}→<StatusPill status={a.toValue} /></span>
                    ) : (
                      <span className="text-text2">{a.fromValue ?? '—'} → {a.toValue ?? '—'}</span>
                    )}
                    {a.note && <span className="text-text3">· {a.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </Modal>
  );
}
