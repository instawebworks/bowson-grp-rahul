import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PLANNER_WEEKS,
  allocateWeeks,
  formatWc,
  getOpDayHrs,
  isoDate,
  mondayOf,
  nextWeeks,
  opDayDefault,
  opWeekTotal,
  todayDayIdx,
  wcKey,
} from '@bowson/shared';
import { useOperatives, useSchedule, useTickets, useUpdateOperative } from '../lib/hooks';
import { OperativeForm } from '../components/OperativeForm';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { Button, Card, Content, Metric, Modal, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { Operative, Ticket } from '../lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const PRESETS = [0, 3.75, 4, 7.5, 10, 12];

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

export function Schedule() {
  const { data: operatives } = useOperatives();
  const { data: tickets } = useTickets();
  const { canManage } = useAuth();
  const updateOp = useUpdateOperative();

  const [tab, setTab] = useState<'planner' | 'history'>('planner');
  const [editSkills, setEditSkills] = useState<Operative | null>(null);
  const [editCell, setEditCell] = useState<{ op: Operative; weekKey: string; di: number } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  // The dashboard's 8-week grid links here as ?week=<monday> — scroll that
  // week's card into view and highlight it (client snag #12).
  const [params] = useSearchParams();
  const focusWeek = params.get('week');
  useEffect(() => {
    if (!focusWeek || !tickets) return;
    const el = document.getElementById(`week-${focusWeek}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusWeek, tickets]);

  const ops = useMemo(() => operatives ?? [], [operatives]);
  const allTickets = tickets ?? [];
  const curKey = isoDate(mondayOf(new Date()));
  const todayIdx = todayDayIdx();

  // Capacity-constrained spill-over allocation — the shared model (see
  // allocateWeeks in @bowson/shared), so the Planner, the dashboard and
  // /api/schedule all agree. A week fills to its TOTAL available hours
  // before work spills to the next; per-skill split is shown for information.
  const allocation = useMemo(
    () =>
      allocateWeeks(
        allTickets.map((t) => ({ ...t, deadline: t.order?.deadline ?? t.deadline ?? null })),
        ops,
      ),
    [allTickets, ops],
  );

  // Weeks to show: the 16-week planner horizon + any weeks that got allocations.
  const weeks = useMemo(() => {
    const labels = new Map<string, string>();
    for (const wc of nextWeeks(PLANNER_WEEKS)) labels.set(wcKey(wc), wc);
    for (const key of allocation.byWeek.keys()) {
      if (!labels.has(key)) labels.set(key, formatWc(new Date(key)));
    }
    return [...labels.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, label]) => ({ key, label }));
  }, [allocation]);

  const capacityFor = allocation.capacityFor;

  const committedFor = (key: string) => {
    const b = allocation.byWeek.get(key);
    if (!b) return { lam: 0, fin: 0, total: 0 };
    return { lam: Math.round(b.lam), fin: Math.round(b.fin), total: Math.round(b.total) };
  };

  const ticketsFor = (key: string) => allocation.byWeek.get(key)?.tickets ?? [];
  const lateFor = (key: string) => allocation.byWeek.get(key)?.late ?? new Set<number>();

  /** A past day can no longer be planned (ported from editOpDay's guard). */
  const isPastDay = (weekKey: string, di: number) =>
    weekKey < curKey || (weekKey === curKey && di < todayIdx);

  /** Save a per-week override; saving the default value clears the override. */
  function saveCell(hrs: number) {
    if (!editCell) return;
    const { op, weekKey, di } = editCell;
    const key = `${weekKey}_d${di}`;
    const next: Record<string, number> = { ...(op.dayHrs ?? {}) };
    if (hrs === opDayDefault(op, di)) delete next[key];
    else next[key] = Math.max(0, hrs);
    updateOp.mutate({
      id: op.id,
      input: { name: op.name, skills: op.skills, defaultHrs: op.defaultHrs, dayPattern: op.dayPattern, dayHrs: next },
    });
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
          <History ops={ops} />
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
                        const hrs = getOpDayHrs(op, w.key, di);
                        const override = (op.dayHrs ?? {})[`${w.key}_d${di}`] !== undefined;
                        const off = hrs === 0;
                        const past = isPastDay(w.key, di);
                        const editable = canManage && !past;
                        return (
                          <td key={`${w.key}-${di}`} className={`p-0.5 ${di === 0 ? 'border-l-2 border-border' : ''}`}>
                            <div
                              onClick={() => editable && setEditCell({ op, weekKey: w.key, di })}
                              title={override ? 'Override applied — click to change' : undefined}
                              className={`rounded px-1.5 py-1 text-center text-[11px] font-semibold ${editable ? 'cursor-pointer' : ''} ${
                                past
                                  ? 'text-text3 opacity-40'
                                  : off
                                    ? 'bg-red/10 text-red'
                                    : override
                                      ? 'bg-amber-l text-amber'
                                      : 'text-text2 hover:bg-teal-l/50'
                              }`}
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
                      const cap = capacityFor(w.key);
                      const com = committedFor(w.key);
                      const over = com.total > cap.total && cap.total > 0;
                      return (
                        <td key={w.key} colSpan={5} className="border-l-2 border-border px-2 py-1 text-center text-[10px]">
                          <div className={over ? 'text-red' : cap.total > 0 ? 'text-teal' : 'text-text3'}>{cap.total}h avail</div>
                          {com.total > 0 && <div className={over ? 'text-red' : 'text-text2'}>{com.total}h booked</div>}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mb-4 text-[10px] text-text3">
              Click a day cell to set that week's hours for the operative (holiday, overtime…).
              <span className="ml-2">🟠 Amber = override applied</span>
              <span className="ml-2">🔴 Red = day off</span>
              <span className="ml-2">· The current week only counts today onwards.</span>
            </p>

            {/* Weekly schedule cards */}
            <div className="mb-2 text-xs font-bold">Weekly Schedule</div>
            {weeks.map((w) => {
              const cap = capacityFor(w.key);
              const com = committedFor(w.key);
              const over = com.total > cap.total && cap.total > 0;
              const pct = cap.total > 0 ? Math.min(Math.round((com.total / cap.total) * 100), 100) : 0;
              const warn = com.total > cap.total * 0.85 && !over;
              const barCol = over ? 'var(--color-red)' : warn ? 'var(--color-amber)' : 'var(--color-teal)';
              const wk = ticketsFor(w.key);
              const late = lateFor(w.key);
              const focused = w.key === focusWeek;
              return (
                <div
                  key={w.key}
                  id={`week-${w.key}`}
                  className={`mb-2.5 scroll-mt-16 rounded-lg border bg-surface p-3 ${focused ? 'ring-2 ring-teal' : ''}`}
                  style={{ borderColor: over ? 'var(--color-red)' : 'var(--color-border)' }}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-bold">{w.label}{w.key === curKey && <span className="ml-1.5 text-[10px] font-normal text-teal">(this week — remaining days)</span>}</div>
                      <div className="mt-0.5 text-[10px] text-text3">
                        {cap.total > 0
                          ? `${cap.total}h available · ${com.total}h committed · Laminating ${com.lam}h / Finishing ${com.fin}h (team: ${cap.lam}h lam · ${cap.fin}h fin)`
                          : 'No capacity set'}
                      </div>
                    </div>
                    <div className="text-right">
                      {cap.total > 0 ? (
                        <span className="text-[13px] font-bold" style={{ color: barCol }}>
                          {com.total}<span className="text-[10px] font-normal text-text3"> / {cap.total}h</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text3">—</span>
                      )}
                      {over && <div className="text-[10px] font-bold text-red">⚠ Over +{com.total - cap.total}h</div>}
                    </div>
                  </div>
                  {cap.total > 0 && (
                    <div className="mb-2.5 h-[5px] rounded-full bg-surface2">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: barCol }} />
                    </div>
                  )}
                  {late.size > 0 && (
                    <div className="mb-2 rounded-md border border-red/40 bg-red/5 px-2.5 py-1.5 text-[11px] font-semibold text-red">
                      ⚠ {late.size} ticket{late.size !== 1 ? 's' : ''} won't meet the deadline at current capacity —
                      add hours in the grid above or move the deadline out.
                    </div>
                  )}
                  {wk.length ? (
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
                      {wk.map((t) => <TicketMini key={t.id} t={t} late={late.has(t.id)} onOpen={() => setDetailId(t.id)} />)}
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
          weekKey={editCell.weekKey}
          di={editCell.di}
          busy={updateOp.isPending}
          onSave={saveCell}
          onClose={() => setEditCell(null)}
        />
      )}
    </>
  );
}

function TicketMini({ t, late, onOpen }: { t: Ticket; late?: boolean; onOpen: () => void }) {
  const s = TYPE_STYLE[t.type] ?? TYPE_STYLE.RAW!;
  const m2 = t.resinType === 'M2' || t.order?.resinType === 'M2';
  return (
    <div onClick={onOpen} className={`cursor-pointer rounded-md border p-2 hover:bg-teal-l/30 ${late ? 'border-red/50 bg-red/5' : 'border-border'}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-teal">#{t.tn ?? 'TBC'}</span>
        <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>{t.type}</span>
        {late && <span className="rounded bg-red/10 px-1 py-0.5 text-[9px] font-bold text-red">⚠ LATE</span>}
        {m2 && <span className="rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">M2</span>}
        <span className="ml-auto text-[11px] font-semibold text-text2">{t.hrs || 0}h</span>
      </div>
      <div className="mb-1 truncate text-[11px]">{t.detail}</div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-text3">{t.order?.orderNumber ?? '—'}</span>
        <StatusPill status={t.status} />
        {(t.assignments ?? []).length > 0 && (
          <span className="ml-auto truncate text-[9px] font-semibold text-teal">
            {(t.assignments ?? []).map((a) => a.operative?.name.split(' ')[0]).filter(Boolean).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

/** Per-week day-hours editor (ported from editOpDay: presets, reset-to-default). */
function DayCellEditor({
  op,
  weekKey,
  di,
  busy,
  onSave,
  onClose,
}: {
  op: Operative;
  weekKey: string;
  di: number;
  busy: boolean;
  onSave: (hrs: number) => void;
  onClose: () => void;
}) {
  const current = getOpDayHrs(op, weekKey, di);
  const def = opDayDefault(op, di);
  const hasOverride = (op.dayHrs ?? {})[`${weekKey}_d${di}`] !== undefined;
  const [val, setVal] = useState(String(current));
  return (
    <Modal
      title={`${op.name} — ${DAYS[di]}, ${formatWc(new Date(weekKey))}`}
      sub="Sets the hours for this day of this week only"
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
      {hasOverride && (
        <div className="mt-3 border-t border-border pt-3">
          <Button className="w-full justify-center" disabled={busy} onClick={() => onSave(def)}>
            ↩ Reset to default ({def}h)
          </Button>
        </div>
      )}
    </Modal>
  );
}

// ─── History tab: weekly utilisation summary + hours CSV export ──────────────
function History({ ops }: { ops: Operative[] }) {
  const { data, isLoading, error } = useSchedule();
  const [from, setFrom] = useState(() => isoDate(mondayOf(new Date())));
  const [to, setTo] = useState(() => {
    const d = mondayOf(new Date());
    d.setDate(d.getDate() + (PLANNER_WEEKS - 1) * 7);
    return isoDate(d);
  });

  /** Weeks (Monday keys) in the selected range, capped at 52. */
  function rangeWeeks(): string[] {
    const out: string[] = [];
    const start = mondayOf(new Date(from));
    const end = mondayOf(new Date(to));
    for (let i = 0; i < 52; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i * 7);
      if (d > end) break;
      out.push(isoDate(d));
    }
    return out;
  }

  /** Export operative hours (ported from exportHoursCSV): one row per
   * operative × week with any hours, Mon–Fri + total. */
  function exportHours() {
    const weeks = rangeWeeks();
    const rows: string[][] = [['Operative', 'Skills', 'W/C', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Total Hours']];
    for (const op of ops) {
      const skills = op.skills.join(' | ') || 'None';
      for (const wk of weeks) {
        const hrs = [0, 1, 2, 3, 4].map((di) => getOpDayHrs(op, wk, di));
        const total = hrs.reduce((a, b) => a + b, 0);
        if (total > 0) rows.push([op.name, skills, wk, ...hrs.map(String), String(total)]);
      }
    }
    const q = (v: string) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = rows.map((r) => r.map(q).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bowson_hours_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const dateCtl = 'rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal';

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-surface2 px-4 py-3">
        <span className="text-xs font-bold">Show period:</span>
        <label className="text-xs">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`ml-1 ${dateCtl}`} /></label>
        <label className="text-xs">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`ml-1 ${dateCtl}`} /></label>
        <Button variant="primary" className="ml-auto" onClick={exportHours}>
          ⭳ Export {rangeWeeks().length} week{rangeWeeks().length !== 1 ? 's' : ''} to CSV
        </Button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3">
        <Metric label="Operatives" value={data ? data.operativeCount : '…'} />
        <Metric label="Weekly capacity" value={data ? `${data.weeklyCapacity} h` : '…'} sub="standard week" />
        <Metric label={`Committed (next ${PLANNER_WEEKS} wks)`} value={data ? `${Math.round(data.weeks.reduce((s, w) => s + w.committedHrs, 0))} h` : '…'} />
      </div>

      {/* Per-operative hours grid over the selected range (ported from renderScheduleHistory) */}
      <Card title="Operative hours" className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-surface2">
                <th className="min-w-[130px] px-3 py-1.5 text-left text-[10px] font-bold uppercase text-text3">Operative</th>
                {rangeWeeks().map((wk) => (
                  <th key={wk} colSpan={5} className="border-l-2 border-border px-2 py-1 text-center text-[10px] text-text3">
                    W/C {wk.slice(8, 10)}/{wk.slice(5, 7)}
                  </th>
                ))}
              </tr>
              <tr className="bg-surface2">
                <th />
                {rangeWeeks().map((wk) =>
                  DAYS.map((d, di) => (
                    <th key={`${wk}-${d}`} className={`px-1 py-0.5 text-center text-[9px] font-bold text-text3 ${di === 0 ? 'border-l-2 border-border' : ''}`}>
                      {d}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => (
                <tr key={op.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-1 font-semibold">{op.name}</td>
                  {rangeWeeks().map((wk) =>
                    DAYS.map((_, di) => {
                      const hrs = getOpDayHrs(op, wk, di);
                      const override = (op.dayHrs ?? {})[`${wk}_d${di}`] !== undefined;
                      return (
                        <td
                          key={`${wk}-${di}`}
                          className={`px-1 py-1 text-center tabular-nums ${di === 0 ? 'border-l-2 border-border' : ''} ${
                            hrs === 0 ? 'text-red' : override ? 'font-bold text-amber' : 'text-text2'
                          }`}
                        >
                          {hrs === 0 ? '·' : hrs}
                        </td>
                      );
                    }),
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-surface2 font-bold">
                <td className="px-3 py-1 text-[10px]">Total</td>
                {rangeWeeks().map((wk) => (
                  <td key={wk} colSpan={5} className="border-l-2 border-border px-2 py-1 text-center text-teal">
                    {Math.round(ops.reduce((s, op) => s + opWeekTotal(op, wk), 0) * 10) / 10}h
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-border px-3 py-1.5 text-[10px] text-text3">🟠 Amber = override applied · 🔴 · = day off</div>
      </Card>
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
