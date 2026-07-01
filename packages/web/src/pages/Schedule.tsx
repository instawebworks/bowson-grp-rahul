import { useMemo, useState } from 'react';
import {
  HRS_PER_DAY,
  LIVE_STATUSES,
  STAGE_HRS_REMAINING,
  formatWc,
  nextWeeks,
  wcForDeadline,
  wcKey,
  type GrpStage,
} from '@bowson/shared';
import { useOperatives, useSchedule, useTickets, useUpdateOperative } from '../lib/hooks';
import { OperativeForm } from '../components/OperativeForm';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { Button, Card, Content, Metric, Modal, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Operative, Ticket } from '../lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PRESETS = [0, 3.75, 4, 7.5, 10, 12];
const LIVE = LIVE_STATUSES as readonly string[];
const HIDDEN = ['Despatched', 'Completed', 'Order Cancelled', 'Cancelled'];

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

/** Standard hours for an operative on weekday di (0=Mon..4=Fri). */
function opDayHrs(op: Operative, di: number): number {
  const p = op.dayPattern;
  if (p && p.length > di && p[di] != null) return p[di]!;
  return op.defaultHrs ?? HRS_PER_DAY;
}

/** The production week key a ticket belongs to (its wc, else derived from the deadline). */
function ticketWeekKey(t: Ticket): string {
  const k = wcKey(t.wc);
  if (k) return k;
  return wcKey(wcForDeadline(t.order?.deadline ?? t.deadline ?? null));
}

export function Schedule() {
  const { data: operatives } = useOperatives();
  const { data: tickets } = useTickets();
  const { canManage } = useAuth();
  const updateOp = useUpdateOperative();

  const [tab, setTab] = useState<'planner' | 'history'>('planner');
  const [editSkills, setEditSkills] = useState<Operative | null>(null);
  const [editCell, setEditCell] = useState<{ op: Operative; di: number } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const ops = operatives ?? [];
  const allTickets = tickets ?? [];
  const curKey = wcKey(nextWeeks(1)[0]!);

  // Weeks to show: next 8 + any weeks that have tickets.
  const weeks = useMemo(() => {
    const labels = new Map<string, string>();
    for (const wc of nextWeeks(8)) labels.set(wcKey(wc), wc);
    for (const t of allTickets) {
      if (HIDDEN.includes(t.status)) continue;
      const key = ticketWeekKey(t);
      if (key && !labels.has(key)) labels.set(key, formatWc(new Date(key)));
    }
    return [...labels.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }));
  }, [allTickets]);

  const weekCapacity = ops.reduce((s, op) => s + [0, 1, 2, 3, 4].reduce((ss, di) => ss + opDayHrs(op, di), 0), 0);

  const committedFor = (key: string) =>
    Math.round(
      allTickets
        .filter((t) => LIVE.includes(t.status) && ticketWeekKey(t) === key)
        .reduce((s, t) => s + (t.hrs || 0) * (STAGE_HRS_REMAINING[t.status as GrpStage] ?? 1), 0),
    );

  const ticketsFor = (key: string) =>
    allTickets.filter((t) => !HIDDEN.includes(t.status) && ticketWeekKey(t) === key);

  function saveCell(hrs: number) {
    if (!editCell) return;
    const { op, di } = editCell;
    const pat = op.dayPattern && op.dayPattern.length >= 7 ? [...op.dayPattern] : [HRS_PER_DAY, HRS_PER_DAY, HRS_PER_DAY, HRS_PER_DAY, HRS_PER_DAY, 0, 0];
    pat[di] = Math.max(0, hrs);
    updateOp.mutate({ id: op.id, input: { name: op.name, skills: op.skills, defaultHrs: op.defaultHrs, dayPattern: pat } });
    setEditCell(null);
  }

  return (
    <>
      <PageHeader title="Production Planner" sub="Weekly capacity & schedule" globalActions={false} />
      <Content>
        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-border">
          {(['planner', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold capitalize transition ${
                tab === t ? 'border-teal text-teal' : 'border-transparent text-text3 hover:text-text2'
              }`}
            >
              {t === 'planner' ? '🗓 Planner' : '🕘 History'}
            </button>
          ))}
        </div>

        {tab === 'history' ? (
          <History />
        ) : (
          <>
            {/* Capacity grid */}
            <div className="mb-2 overflow-x-auto rounded-lg border border-border">
              <table className="min-w-[900px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-surface2">
                    <th rowSpan={2} className="min-w-[130px] px-3 py-1.5 text-left">Operative</th>
                    <th rowSpan={2} className="min-w-[150px] px-2 py-1.5 text-left">Skills</th>
                    {weeks.map((w) => (
                      <th key={w.key} colSpan={5} className={`whitespace-nowrap border-l-2 border-border px-2 py-1 text-center text-[10px] ${w.key === curKey ? 'text-teal' : ''}`}>
                        {w.label.replace('W/C ', '')}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-surface2">
                    {weeks.map((w) => DAYS.map((d, di) => (
                      <th key={`${w.key}-${d}`} className={`px-1 py-0.5 text-center text-[9px] font-bold text-text3 ${di === 0 ? 'border-l-2 border-border' : ''}`}>{d}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => (
                    <tr key={op.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-1.5 font-semibold">{op.name}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {op.skills.length > 0 ? (
                            op.skills.map((s) => (
                              <span key={s} className="whitespace-nowrap rounded bg-teal-l px-1.5 py-px text-[9px] text-teal">{s.replace(/^\d+\.\s*/, '')}</span>
                            ))
                          ) : (
                            <span className="text-[10px] text-text3">None set</span>
                          )}
                          {canManage && (
                            <button onClick={() => setEditSkills(op)} className="ml-1 rounded border border-border2 px-1.5 py-px text-[9px] hover:bg-surface2">Edit</button>
                          )}
                        </div>
                      </td>
                      {weeks.map((w) => DAYS.map((_, di) => {
                        const hrs = opDayHrs(op, di);
                        const off = hrs === 0;
                        return (
                          <td key={`${w.key}-${di}`} className={`p-0.5 ${di === 0 ? 'border-l-2 border-border' : ''}`}>
                            <div
                              onClick={() => canManage && setEditCell({ op, di })}
                              className={`rounded px-1.5 py-1 text-center text-[11px] font-semibold ${canManage ? 'cursor-pointer' : ''} ${off ? 'bg-red/10 text-red' : 'text-text2 hover:bg-teal-l/50'}`}
                            >
                              {off ? 'Off' : `${hrs}h`}
                            </div>
                          </td>
                        );
                      }))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface2 font-bold">
                    <td colSpan={2} className="px-3 py-1.5 text-[11px]">Week total</td>
                    {weeks.map((w) => {
                      const com = committedFor(w.key);
                      const over = com > weekCapacity && weekCapacity > 0;
                      return (
                        <td key={w.key} colSpan={5} className="border-l-2 border-border px-2 py-1 text-center text-[10px]">
                          <div className={over ? 'text-red' : weekCapacity > 0 ? 'text-teal' : 'text-text3'}>{weekCapacity}h avail</div>
                          {com > 0 && <div className={over ? 'text-red' : 'text-text2'}>{com}h booked</div>}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mb-4 text-[10px] text-text3">Click any day cell to adjust an operative's standard hours.</p>

            {/* Weekly schedule cards */}
            <div className="mb-2 text-xs font-bold">Weekly Schedule</div>
            {weeks.map((w) => {
              const cap = weekCapacity;
              const com = committedFor(w.key);
              const pct = cap > 0 ? Math.min(Math.round((com / cap) * 100), 100) : 0;
              const over = com > cap && cap > 0;
              const warn = com > cap * 0.85 && !over;
              const barCol = over ? 'var(--color-red)' : warn ? 'var(--color-amber)' : 'var(--color-teal)';
              const wk = ticketsFor(w.key);
              return (
                <div key={w.key} className="mb-2.5 rounded-lg border bg-surface p-3" style={{ borderColor: over ? 'var(--color-red)' : 'var(--color-border)' }}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-bold">{w.label}</div>
                      <div className="mt-0.5 text-[10px] text-text3">{cap > 0 ? `${cap}h available · ${com}h committed` : 'No capacity set'}</div>
                    </div>
                    <div className="text-right">
                      {cap > 0 ? (
                        <span className="text-[13px] font-bold" style={{ color: barCol }}>
                          {com}<span className="text-[10px] font-normal text-text3"> / {cap}h</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text3">—</span>
                      )}
                      {over && <div className="text-[10px] font-bold text-red">⚠ Over +{com - cap}h</div>}
                    </div>
                  </div>
                  {cap > 0 && (
                    <div className="mb-2.5 h-[5px] rounded-full bg-surface2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barCol }} />
                    </div>
                  )}
                  {wk.length ? (
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
                      {wk.map((t) => <TicketMini key={t.id} t={t} onOpen={() => setDetailId(t.id)} />)}
                    </div>
                  ) : (
                    <div className="py-1 text-[11px] text-text3">No tickets scheduled this week</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </Content>

      {editSkills && <OperativeForm operative={editSkills} onClose={() => setEditSkills(null)} />}
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}
      {editCell && (
        <DayCellEditor
          op={editCell.op}
          di={editCell.di}
          current={opDayHrs(editCell.op, editCell.di)}
          busy={updateOp.isPending}
          onSave={saveCell}
          onClose={() => setEditCell(null)}
        />
      )}
    </>
  );
}

function TicketMini({ t, onOpen }: { t: Ticket; onOpen: () => void }) {
  const s = TYPE_STYLE[t.type] ?? TYPE_STYLE.RAW!;
  const m2 = t.resinType === 'M2' || t.order?.resinType === 'M2';
  return (
    <div onClick={onOpen} className="cursor-pointer rounded-md border border-border p-2 hover:bg-teal-l/30">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-teal">#{t.tn ?? 'TBC'}</span>
        <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>{t.type}</span>
        {m2 && <span className="rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">M2</span>}
        <span className="ml-auto text-[11px] font-semibold text-text2">{t.hrs || 0}h</span>
      </div>
      <div className="mb-1 truncate text-[11px]">{t.detail}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text3">{t.order?.orderNumber ?? '—'}</span>
        <StatusPill status={t.status} />
      </div>
    </div>
  );
}

function DayCellEditor({
  op,
  di,
  current,
  busy,
  onSave,
  onClose,
}: {
  op: Operative;
  di: number;
  current: number;
  busy: boolean;
  onSave: (hrs: number) => void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(String(current));
  return (
    <Modal
      title={`${op.name} — ${DAYS[di]}`}
      sub="Sets the standard hours for this weekday"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => onSave(Number(val) || 0)}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-text2">Set available hours for this day. Use 0 for holiday/absent, or any value for overtime.</p>
      <div className="mb-3 flex items-center gap-2">
        <input
          type="number"
          min={0}
          max={24}
          step={0.5}
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-24 rounded-md border border-border2 bg-surface px-3 py-2 text-center text-base font-bold outline-none focus:border-teal"
        />
        <span className="text-xs text-text3">hours</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((h) => (
          <button key={h} onClick={() => setVal(String(h))} className="rounded border border-border2 px-2 py-1 text-[11px] hover:bg-surface2">
            {h === 0 ? 'Off (0h)' : `${h}h`}
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ─── History tab: the weekly utilisation summary ─────────────────────────────
function History() {
  const { data, isLoading, error } = useSchedule();
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <Metric label="Operatives" value={data ? data.operativeCount : '…'} />
        <Metric label="Weekly capacity" value={data ? `${data.weeklyCapacity} h` : '…'} sub="5 days × hrs/op" />
        <Metric label="Committed (next 8 wks)" value={data ? `${Math.round(data.weeks.reduce((s, w) => s + w.committedHrs, 0))} h` : '…'} />
      </div>
      <Card title="By week">
        <Table head={['Week', 'Tickets', 'Committed', 'Capacity', 'Utilisation']}>
          <QueryState isLoading={isLoading} error={error} colSpan={5} />
          {!isLoading && !error && (data?.weeks.length ?? 0) === 0 && (
            <tr><td colSpan={5} className="px-3 py-10 text-center text-xs text-text3">No scheduled weeks.</td></tr>
          )}
          {(data?.weeks ?? []).map((w) => {
            const over = w.utilisation > 100;
            const hue = Math.max(0, Math.min(120, 120 - (w.utilisation / 100) * 120));
            return (
              <tr key={w.key} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">{w.wc}</td>
                <td className="px-3 py-2 tabular-nums text-text2">{w.ticketCount}</td>
                <td className="px-3 py-2 tabular-nums">{w.committedHrs} h</td>
                <td className="px-3 py-2 tabular-nums text-text3">{w.capacityHrs} h</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface3">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, w.utilisation)}%`, backgroundColor: `hsl(${hue} 65% 45%)` }} />
                    </div>
                    <span className={`text-[11px] font-bold tabular-nums ${over ? 'text-red' : 'text-text2'}`}>{w.utilisation}%{over ? ' ⚠' : ''}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
