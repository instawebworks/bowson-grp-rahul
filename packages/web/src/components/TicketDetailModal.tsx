import { useEffect, useMemo, useState } from 'react';
import { GRP_STAGES, RAW_STAGES, nextStage } from '@bowson/shared';
import {
  useAssignMould,
  useAssignTicket,
  useAuditFor,
  useChangeTicketStatus,
  useConfirmCure,
  useMoulds,
  useOperatives,
  useSetCure,
  useTicket,
  useToggleTimer,
} from '../lib/hooks';
import { Button, Modal, ProgressBar, StatusPill } from '../components/ui';
import { cureState, fmtCureMins, fmtElapsed, initials, money } from '../lib/format';

const MOULD_STAGES = ['3. Queue - Awaiting Mould', '4. Gel Coat', '5. Laminating'];
const CURE_STAGES = ['4. Gel Coat', '5. Laminating'];
const CURE_PRESETS = [30, 60, 120, 240];

export function TicketDetailModal({ ticketId, onClose }: { ticketId: number; onClose: () => void }) {
  const { data: t, isLoading } = useTicket(ticketId);
  const { data: operatives } = useOperatives();
  const { data: moulds } = useMoulds();
  const { data: audit } = useAuditFor('ticket', ticketId);
  const orderId = t?.orderId;

  const changeStatus = useChangeTicketStatus(orderId);
  const assign = useAssignTicket();
  const assignMould = useAssignMould(orderId);
  const setCure = useSetCure(orderId);
  const confirmCure = useConfirmCure(orderId);
  const toggleTimer = useToggleTimer();

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
    assign.mutate({ ticketId, operativeIds: next });
  }

  const cure = t ? cureState(t, now) : null;
  const isRaw = t?.type === 'RAW';
  const isComp = t?.type === 'COMP';
  const stages = isRaw ? RAW_STAGES : GRP_STAGES;

  return (
    <Modal
      title={t ? `${t.type} · Ticket ${t.tn ?? ''} — ${t.detail}` : 'Ticket'}
      sub={t?.order ? `${t.order.orderNumber}${t.order.siteName ? ` · ${t.order.siteName}` : ''}` : undefined}
      onClose={onClose}
      width="max-w-3xl"
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      {isLoading || !t ? (
        <div className="py-8 text-center text-xs text-text3">Loading…</div>
      ) : (
        <div className="space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Meta label="Qty" value={String(t.qty)} />
            <Meta label="Labour hrs" value={String(t.hrs)} />
            <Meta label="Resin" value={t.resinType ?? '—'} />
            <Meta label="Value" value={money(t.netPrice)} />
          </div>
          {t.spec && (
            <div className="rounded-lg bg-surface2 px-3 py-2 text-xs"><span className="text-text3">Spec:</span> {t.spec}</div>
          )}

          {/* Stage / production */}
          <Section title="Production stage">
            <div className="flex flex-wrap items-center gap-3">
              {isComp ? (
                <><StatusPill status={t.status} /><span className="text-[11px] text-text3">Rolled up from parts</span></>
              ) : (
                <select
                  value={(stages as readonly string[]).includes(t.status) ? t.status : ''}
                  disabled={changeStatus.isPending}
                  onChange={(e) => changeStatus.mutate({ ticketId, status: e.target.value })}
                  className="rounded-md border border-border2 bg-surface px-2 py-1 text-xs outline-none focus:border-teal"
                >
                  {!(stages as readonly string[]).includes(t.status) && <option value="">{t.status}</option>}
                  {stages.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <div className="w-40"><ProgressBar pct={t.pct} /></div>
            </div>

            {/* Mould + cure */}
            {!isRaw && !isComp && (MOULD_STAGES.includes(t.status) || CURE_STAGES.includes(t.status)) && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {MOULD_STAGES.includes(t.status) && (
                  <select
                    value={t.mouldId ?? ''}
                    onChange={(e) => assignMould.mutate({ ticketId, mouldId: e.target.value ? Number(e.target.value) : null })}
                    className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
                  >
                    <option value="">— mould —</option>
                    {(moulds ?? []).map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
                  </select>
                )}
                {CURE_STAGES.includes(t.status) &&
                  (cure ? (
                    <button
                      onClick={() => confirmCure.mutate({ ticketId })}
                      className={`rounded px-1.5 py-1 text-[11px] font-semibold ${cure.expired ? 'bg-red/10 text-red' : 'bg-amber-l text-amber'}`}
                    >
                      {cure.expired ? '✓ cure done — confirm' : `⏱ ${fmtCureMins(cure.remainingMin)} — confirm`}
                    </button>
                  ) : (
                    <select
                      value=""
                      onChange={(e) => setCure.mutate({ ticketId, mins: Number(e.target.value), targetStage: nextStage(t.status) ?? undefined })}
                      className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] text-text2 outline-none focus:border-teal"
                    >
                      <option value="">+ cure timer…</option>
                      {CURE_PRESETS.map((m) => <option key={m} value={m}>{fmtCureMins(m)}</option>)}
                    </select>
                  ))}
              </div>
            )}
          </Section>

          {/* Assignees + time tracking */}
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
                            onClick={() => toggleTimer.mutate({ ticketId, operativeId: opId, action: run ? 'stop' : 'start' })}
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
            </Section>
          )}

          {/* Parts (COMP) */}
          {isComp && (t.parts?.length ?? 0) > 0 && (
            <Section title={`Parts (${t.parts!.length})`}>
              <div className="overflow-hidden rounded-md border border-border">
                {t.parts!.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0">
                    <span>{p.detail}</span>
                    <StatusPill status={p.status} />
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Audit log */}
          <Section title="Activity">
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</div>
      <div className="text-xs font-medium">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 border-b border-border pb-1 text-[10px] font-bold uppercase tracking-wide text-text3">{title}</div>
      {children}
    </div>
  );
}
