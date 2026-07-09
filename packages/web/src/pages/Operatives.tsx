import { useEffect, useState } from 'react';
import { STAGE_HRS_REMAINING } from '@bowson/shared';
import { useOperatives, useSettings, useTickets, useUpdateSettings } from '../lib/hooks';
import { Button, Content, PageHeader } from '../components/ui';
import { OperativeForm } from '../components/OperativeForm';
import { useAuth } from '../lib/auth';
import { MANAGER_PIN } from '../lib/config';
import { initials } from '../lib/format';
import type { Operative } from '../lib/types';

const WEIGHT_STAGES = Object.keys(STAGE_HRS_REMAINING).filter((s) => s !== 'Despatched');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_PATTERN = [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0];

function dayColor(h: number) {
  return h === 0 ? 'text-red' : h < 7.5 ? 'text-amber' : 'text-teal';
}

export function Operatives() {
  const { data, isLoading, error } = useOperatives();
  const { data: tickets } = useTickets();
  const rows = data ?? [];
  const allTickets = tickets ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Operative | null>(null);
  const { canManage } = useAuth();

  const activeCount = (opId: number) =>
    allTickets.filter((t) => t.status !== 'Despatched' && (t.assignments ?? []).some((a) => a.operativeId === opId)).length;

  return (
    <>
      {showCreate && <OperativeForm onClose={() => setShowCreate(false)} />}
      {editing && <OperativeForm operative={editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Operatives & Settings"
        sub={`${rows.length} team member${rows.length === 1 ? '' : 's'}`}
        globalActions={false}
      />
      <Content>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-text3">Click an operative to edit their schedule, skills and pay</span>
          {canManage && <Button variant="primary" onClick={() => setShowCreate(true)}>+ Add operative</Button>}
        </div>

        {isLoading && <div className="text-xs text-text3">Loading…</div>}
        {error && <div className="text-xs text-text3">Could not load — {(error as Error).message}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border2 bg-surface p-8 text-center text-xs text-text3">No operatives added yet.</div>
        )}

        <div className="space-y-2">
          {rows.map((o) => {
            const pat = o.dayPattern && o.dayPattern.length >= 7 ? o.dayPattern : DEFAULT_PATTERN;
            const weekHrs = pat.reduce((s, h) => s + (h ?? 0), 0);
            const active = activeCount(o.id);
            return (
              <button
                key={o.id}
                onClick={() => setEditing(o)}
                className="block w-full overflow-hidden rounded-lg border border-border bg-surface text-left transition hover:border-teal"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-l text-sm font-bold text-teal">{initials(o.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{o.name}</div>
                    <div className="mt-0.5 text-[11px] text-text3">
                      {weekHrs}h standard week · {active} active ticket{active === 1 ? '' : 's'}
                      {o.payRate != null && <span className="ml-1.5 font-semibold text-teal">£{o.payRate}/hr</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="flex max-w-[220px] flex-wrap justify-end gap-1">
                      {o.skills.length > 0 ? (
                        o.skills.map((s) => (
                          <span key={s} className="rounded bg-teal-l px-1.5 py-0.5 text-[10px] font-bold text-teal">{s.replace(/^\d+\.\s*/, '')}</span>
                        ))
                      ) : (
                        <span className="text-[10px] text-text3">No skills set</span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-text3">Click to edit →</div>
                  </div>
                </div>
                <div className="flex border-t border-border">
                  {DAYS.map((d, i) => {
                    const h = pat[i] ?? 0;
                    return (
                      <span key={d} className={`border-r border-border bg-surface2 px-2 py-1 text-[10px] font-bold ${dayColor(h)}`}>
                        {d} {h}h
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {canManage && (
          <>
            <StageWeights />
            <ManagerPinPanel />
          </>
        )}
      </Content>
    </>
  );
}

// ─── Stage completion weightings (editable + persisted) ──────────────────────
function StageWeights() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [pct, setPct] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);

  // Seed local state from server settings (or defaults) once loaded.
  useEffect(() => {
    const src: Record<string, number> = settings?.stageWeights ?? STAGE_HRS_REMAINING;
    setPct(Object.fromEntries(WEIGHT_STAGES.map((s) => [s, Math.round((src[s] ?? 1) * 100)])));
  }, [settings]);

  const dirty = settings
    ? WEIGHT_STAGES.some((s) => Math.round((settings.stageWeights[s] ?? 1) * 100) !== (pct[s] ?? 0))
    : false;

  function save() {
    const stageWeights = Object.fromEntries(WEIGHT_STAGES.map((s) => [s, (pct[s] ?? 0) / 100]));
    update.mutate({ stageWeights }, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } });
  }

  function reset() {
    setPct(Object.fromEntries(WEIGHT_STAGES.map((s) => [s, Math.round((STAGE_HRS_REMAINING[s as keyof typeof STAGE_HRS_REMAINING] ?? 1) * 100)])));
  }

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-bold">Stage Completion Weightings</div>
      <div className="max-w-md rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-xs leading-relaxed text-text2">
          Set what % of labour hours remain at each production stage. Pre-production stages should be 100% (no work done).
          These drive the Man Hours and Lead Time calculations on the dashboard.
        </p>
        {WEIGHT_STAGES.map((stage) => {
          const v = pct[stage] ?? 0;
          return (
            <div key={stage} className="mb-1.5 grid grid-cols-[1fr_72px_1fr] items-center gap-2">
              <label className="text-xs">{stage.replace(/^\d+\.\s*/, '')}</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={v}
                  onChange={(e) => setPct((cur) => ({ ...cur, [stage]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                  className="w-14 rounded border border-border2 px-1.5 py-1 text-right text-xs tabular-nums outline-none focus:border-teal"
                />
                <span className="text-xs text-text3">%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-teal" style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
        <div className="mt-3 flex items-center gap-2">
          <Button variant="primary" disabled={!dirty || update.isPending} onClick={save}>{update.isPending ? 'Saving…' : 'Save weightings'}</Button>
          <Button onClick={reset}>Reset to defaults</Button>
          {saved && <span className="text-[11px] font-semibold text-teal">✓ Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Manager PIN (change + persist) ──────────────────────────────────────────
function ManagerPinPanel() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function change() {
    setMsg(null);
    if (current !== (settings?.managerPin ?? MANAGER_PIN)) return setMsg({ ok: false, text: 'Current PIN is incorrect.' });
    if (next.length < 4) return setMsg({ ok: false, text: 'New PIN must be at least 4 characters.' });
    if (next !== confirm) return setMsg({ ok: false, text: 'New PIN and confirmation do not match.' });
    update.mutate(
      { managerPin: next },
      {
        onSuccess: () => { setMsg({ ok: true, text: '✓ Manager PIN updated.' }); setCurrent(''); setNext(''); setConfirm(''); },
        onError: (e) => setMsg({ ok: false, text: (e as Error).message }),
      },
    );
  }

  const field = 'w-full rounded-md border border-border2 bg-surface px-3 py-2 text-base tracking-[4px] outline-none focus:border-teal';

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs font-bold">Manager PIN</div>
      <div className="max-w-md rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-xs leading-relaxed text-text2">
          Required for manager actions — standalone ticket creation, unlocking the T-Card board scroll, and similar overrides.
        </p>
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-text2">Current PIN</label>
            <input type="password" maxLength={12} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current PIN" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-text2">New PIN</label>
            <input type="password" maxLength={12} value={next} onChange={(e) => setNext(e.target.value)} placeholder="New PIN" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-text2">Confirm new PIN</label>
            <input type="password" maxLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm PIN" className={field} />
          </div>
        </div>
        {msg && <div className={`mt-2 text-[11px] ${msg.ok ? 'text-teal' : 'text-red'}`}>{msg.text}</div>}
        <Button variant="primary" className="mt-3" disabled={update.isPending} onClick={change}>Change PIN</Button>
      </div>
    </div>
  );
}
