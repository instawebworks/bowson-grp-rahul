import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GRP_STAGES, nextStage } from '@bowson/shared';
import { apiClient } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useAssignTicket, useConfirmCure, useOperatives, useTickets, useToggleTimer } from '../lib/hooks';
import { cureState, fmtCureMins, fmtElapsed } from '../lib/format';
import { ConfirmDialog } from '../components/ui';
import { TicketDetailModal } from '../components/TicketDetailModal';
import type { Ticket } from '../lib/types';

/**
 * Operative shop-floor view, ported from login_part.html's sf-mode —
 * dark factory theme, three tabs (My Tickets / Available / Board) on top of
 * the existing ticket, assignment and time-session APIs. Managers never see
 * this; operatives see nothing else.
 */

type Tab = 'mine' | 'avail' | 'board';

/** Stages an operative can pick work from when no skills are allocated. */
const PROD_STAGES = [
  '3. Queue - Awaiting Mould', '4. Gel Coat', '5. Laminating',
  '6. Trim & Finish', '7. Assembly', '8. QC Check', '9. Packing',
];

const shortStage = (s: string) => s.replace(/^\d+\.\s*/, '');

/* Prototype sf-mode palette (login_part.html body.sf-mode). */
const SF = {
  bg: '#0a0c0a',
  surface: '#141614',
  surface2: '#1c1e1c',
  surface3: '#242624',
  border: '#2a2c2a',
  border2: '#343634',
  green: '#22c55e',
  greenDim: 'rgba(34,197,94,.09)',
  amber: '#f59e0b',
  amberDim: 'rgba(245,158,11,.1)',
  red: '#ef4444',
  redDim: 'rgba(239,68,68,.1)',
  text: '#e8ede8',
  text2: '#8a928a',
  text3: '#4a524a',
};

export function ShopFloor() {
  const { user, signOut } = useAuth();
  const me = user?.operativeId ?? -1;
  const qc = useQueryClient();
  const { data: tickets } = useTickets();
  const { data: operatives } = useOperatives();
  const toggleTimer = useToggleTimer();
  const assign = useAssignTicket();
  const confirmCure = useConfirmCure();

  const [tab, setTab] = useState<Tab>('mine');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [stageDone, setStageDone] = useState<Ticket | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Live clock for elapsed timers + cure countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Background poll (prototype polled every 20s).
  useEffect(() => {
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    }, 20_000);
    return () => clearInterval(t);
  }, [qc]);

  const all = useMemo(
    () => (tickets ?? []).filter((t) => !['Pending', 'Cancelled'].includes(t.order?.status ?? '')),
    [tickets],
  );
  const opName = (id: number) => operatives?.find((o) => o.id === id)?.name ?? '?';
  const myOpenSession = (t: Ticket) => (t.time ?? []).find((s) => s.operativeId === me && !s.end);

  // ── Tab datasets ───────────────────────────────────────────────────────
  const mine = all.filter((t) => t.type !== 'RAW' && myOpenSession(t));

  const mySkills = operatives?.find((o) => o.id === me)?.skills ?? [];
  const eligibleStages = mySkills.length > 0 ? mySkills : PROD_STAGES;
  const available = all.filter((t) => {
    if (t.type === 'RAW' || myOpenSession(t)) return false;
    if (t.status === 'Despatched' || t.status === '10. Ready to Despatch') return false;
    return eligibleStages.includes(t.status);
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const doneToday = all.filter((t) =>
    (t.time ?? []).some((s) => s.operativeId === me && s.end?.startsWith(todayIso)),
  );

  const curing = all.filter((t) => {
    if (!(t.assignments ?? []).some((a) => a.operativeId === me)) return false;
    return !!cureState(t, now);
  });

  const boardActive = all.filter((t) => t.type !== 'RAW' && t.status !== 'Despatched');

  // ── Actions ────────────────────────────────────────────────────────────
  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  async function join(t: Ticket) {
    const existing = (t.assignments ?? []).map((a) => a.operativeId);
    await assign.mutateAsync({ ticketId: t.id, operativeIds: [...new Set([...existing, me])] });
    await toggleTimer.mutateAsync({ ticketId: t.id, operativeId: me, action: 'start' });
    setTab('mine');
    showFlash(`✓ Joined #${t.tn ?? 'TBC'} — timer running`);
  }

  async function pause(t: Ticket) {
    await toggleTimer.mutateAsync({ ticketId: t.id, operativeId: me, action: 'stop' });
    showFlash('⏸ Paused — your time is saved. Rejoin from Available.');
  }

  async function advance(t: Ticket) {
    const ns = nextStage(t.status);
    if (!ns) return;
    try {
      await toggleTimer.mutateAsync({ ticketId: t.id, operativeId: me, action: 'stop' });
      await apiClient.post(`/api/tickets/${t.id}/status`, { status: ns });
      showFlash(`✓ #${t.tn ?? 'TBC'} moved to ${shortStage(ns)}`);
    } catch (e) {
      showFlash(`⚠ ${(e as Error).message}`);
    } finally {
      qc.invalidateQueries({ queryKey: ['tickets'] });
    }
  }

  const myRunning = mine.length;

  function requestSignOut() {
    if (myRunning > 0) setConfirmOut(true);
    else signOut();
  }

  async function endShiftAndOut() {
    for (const t of mine) {
      try {
        await toggleTimer.mutateAsync({ ticketId: t.id, operativeId: me, action: 'stop' });
      } catch { /* keep going — sign-out must not get stuck on one ticket */ }
    }
    signOut();
  }

  // ── UI ─────────────────────────────────────────────────────────────────
  const tabBtn = (key: Tab, label: string, badge?: number) => (
    <button
      onClick={() => setTab(key)}
      className="relative flex-1 py-3.5 text-center text-[11px] font-extrabold uppercase tracking-[.6px] transition"
      style={{
        color: tab === key ? SF.green : SF.text3,
        borderBottom: `2px solid ${tab === key ? SF.green : 'transparent'}`,
      }}
    >
      {label}
      {!!badge && (
        <span
          className="absolute top-2 rounded-full px-1.5 text-[8px] font-black"
          style={{ right: 'calc(50% - 26px)', background: SF.green, color: '#000', border: `2px solid ${SF.bg}` }}
        >
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex min-h-screen flex-col" style={{ background: SF.bg, color: SF.text }}>
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}

      {stageDone && (
        <ConfirmDialog
          title={`Stage done — #${stageDone.tn ?? 'TBC'}?`}
          danger={false}
          message={
            <>
              <strong>{stageDone.detail}</strong> moves from{' '}
              <strong>{shortStage(stageDone.status)}</strong> to{' '}
              <strong>{shortStage(nextStage(stageDone.status) ?? '')}</strong> and your timer stops.
            </>
          }
          confirmLabel="✓ Stage done"
          onCancel={() => setStageDone(null)}
          onConfirm={() => { const t = stageDone; setStageDone(null); void advance(t); }}
        />
      )}

      {confirmOut && (
        <ConfirmDialog
          title="End shift before signing out?"
          message={
            <>
              You have <strong>{myRunning}</strong> ticket{myRunning !== 1 ? 's' : ''} with a running
              timer. End your shift to stop {myRunning !== 1 ? 'them' : 'it'} and save your time.
            </>
          }
          confirmLabel="⏹ End shift & sign out"
          cancelLabel="Stay signed in"
          onCancel={() => setConfirmOut(false)}
          onConfirm={() => void endShiftAndOut()}
        />
      )}

      {/* Top bar (prototype #topbar) */}
      <header
        className="sticky top-0 z-40 flex items-end justify-between gap-3 px-4 pb-3 pt-4"
        style={{ background: SF.bg, borderBottom: `1px solid ${SF.border}` }}
      >
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-[1.5px]" style={{ color: SF.text3 }}>
            Bowson GRP · Shop Floor
          </div>
          <div className="text-[22px] font-extrabold leading-tight tracking-tight" style={{ color: SF.text }}>
            {user?.name}
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {myRunning > 0 && (
            <button
              onClick={() => setConfirmOut(true)}
              className="rounded-[10px] px-3.5 py-2 text-xs font-extrabold"
              style={{ background: SF.redDim, border: '1px solid rgba(239,68,68,.3)', color: SF.red }}
            >
              ⏹ End Shift
            </button>
          )}
          <button
            onClick={requestSignOut}
            title="Switch user"
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{ background: SF.surface2, border: `1px solid ${SF.border2}`, color: SF.text2 }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Tabs (prototype #tabs) */}
      <nav
        className="sticky top-[62px] z-30 flex px-4"
        style={{ background: SF.surface, borderBottom: `1px solid ${SF.border}` }}
      >
        {tabBtn('mine', 'My Tickets', mine.length)}
        {tabBtn('avail', 'Available', available.length)}
        {tabBtn('board', 'Board')}
      </nav>

      {flash && (
        <div
          className="mx-4 mt-3 rounded-xl px-3 py-2.5 text-xs font-bold"
          style={{ background: SF.greenDim, border: '1px solid rgba(34,197,94,.3)', color: SF.green }}
        >
          {flash}
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-10 pt-4">
        {tab === 'mine' && (
          <MyTickets
            mine={mine}
            curing={curing}
            doneToday={doneToday}
            me={me}
            now={now}
            opName={opName}
            onOpen={setDetailId}
            onPause={(t) => void pause(t)}
            onStageDone={setStageDone}
            onConfirmCure={(t) => confirmCure.mutate({ ticketId: t.id })}
          />
        )}
        {tab === 'avail' && (
          <Available
            available={available}
            mySkills={mySkills}
            busy={assign.isPending || toggleTimer.isPending}
            onJoin={(t) => void join(t)}
            onOpen={setDetailId}
          />
        )}
        {tab === 'board' && <BoardTab tickets={boardActive} me={me} opName={opName} onOpen={setDetailId} />}
      </main>
    </div>
  );
}

function Empty({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="py-16 text-center">
      <div className="mb-3 text-4xl grayscale" style={{ opacity: 0.5 }}>{icon}</div>
      <p className="text-sm font-bold" style={{ color: SF.text }}>{title}</p>
      <p className="mt-1 text-xs" style={{ color: SF.text2 }}>{sub}</p>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div
      className="mb-2.5 mt-5 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[.6px] first:mt-0"
      style={{ color: SF.text2 }}
    >
      {count != null && <span style={{ color: SF.green }}>{count}</span>}
      {label}
      <span className="h-px flex-1" style={{ background: SF.border }} />
    </div>
  );
}

// ─── My Tickets ──────────────────────────────────────────────────────────────
function MyTickets({
  mine, curing, doneToday, me, now, opName, onOpen, onPause, onStageDone, onConfirmCure,
}: {
  mine: Ticket[];
  curing: Ticket[];
  doneToday: Ticket[];
  me: number;
  now: number;
  opName: (id: number) => string;
  onOpen: (id: number) => void;
  onPause: (t: Ticket) => void;
  onStageDone: (t: Ticket) => void;
  onConfirmCure: (t: Ticket) => void;
}) {
  if (!mine.length && !curing.length && !doneToday.length) {
    return <Empty icon="⚙️" title="No active tickets" sub="Join a ticket from the Available tab to start your shift" />;
  }
  return (
    <>
      {mine.length > 0 && <SectionHeader label="Active" count={mine.length} />}
      {mine.map((t) => {
        const session = (t.time ?? []).find((s) => s.operativeId === me && !s.end);
        const elapsed = session ? now - new Date(session.start).getTime() : 0;
        const others = (t.time ?? [])
          .filter((s) => !s.end && s.operativeId !== me)
          .map((s) => opName(s.operativeId));
        const img = t.themeImage ?? t.order?.themeImage ?? null;
        const canComplete = !!nextStage(t.status);
        return (
          <div
            key={t.id}
            className="relative mb-3 overflow-hidden rounded-2xl"
            style={{ background: SF.surface, border: `2px solid ${SF.green}` }}
          >
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${SF.green}, #4ade80)` }} />
            {img && <img src={img} alt="" className="h-20 w-full cursor-pointer object-cover" onClick={() => onOpen(t.id)} />}
            <div className="p-4">
              <button onClick={() => onOpen(t.id)} className="mb-2 flex w-full items-start justify-between gap-3 text-left">
                <div className="min-w-0">
                  <div className="text-[11px] font-bold" style={{ color: SF.text3 }}>
                    #{t.tn ?? 'TBC'} · {t.order?.orderNumber ?? '—'}{t.order?.customer?.name ? ` · ${t.order.customer.name}` : ''}
                  </div>
                  <div className="truncate text-[15px] font-bold" style={{ color: SF.text }}>{t.detail}</div>
                  <div className="mt-0.5 text-xs" style={{ color: SF.text2 }}>
                    {t.spec && <span className="font-bold" style={{ color: SF.green }}>{t.spec} · </span>}
                    {shortStage(t.status)}
                  </div>
                </div>
                <div className="flex-none text-center">
                  <div className="text-lg font-black tabular-nums" style={{ color: SF.green }}>{fmtElapsed(elapsed)}</div>
                  <div className="text-[9px] uppercase tracking-wide" style={{ color: SF.text3 }}>elapsed</div>
                </div>
              </button>
              {others.length > 0 && (
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: SF.text3 }}>
                  <span className="font-bold">Also working:</span>
                  {others.map((n) => (
                    <span key={n} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: SF.surface2, color: SF.text2 }}>
                      {n}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => onOpen(t.id)}
                  className="rounded-[10px] px-3 py-2.5 text-xs font-extrabold"
                  style={{ background: SF.surface2, border: `1px solid ${SF.border2}`, color: SF.text2 }}
                >
                  📐 Details
                </button>
                <button
                  onClick={() => onPause(t)}
                  className="ml-auto rounded-[10px] px-3 py-2.5 text-xs font-extrabold"
                  style={{ background: SF.surface2, border: `1px solid ${SF.border2}`, color: SF.text2 }}
                >
                  Pause
                </button>
                {canComplete && (
                  <button
                    onClick={() => onStageDone(t)}
                    className="rounded-[10px] px-3.5 py-2.5 text-xs font-black"
                    style={{ background: SF.green, color: '#000' }}
                  >
                    ✓ Stage Done
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {curing.length > 0 && <SectionHeader label="⏱ Curing" />}
      {curing.map((t) => {
        const cure = cureState(t, now)!;
        return (
          <div
            key={t.id}
            className="mb-3 rounded-2xl p-4"
            style={{
              background: SF.surface,
              border: cure.expired ? `2px solid ${SF.green}` : '1px solid rgba(245,158,11,.3)',
            }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-black" style={{ color: cure.expired ? SF.green : SF.amber }}>
                {cure.expired ? '✓ CURE COMPLETE — INSPECT' : '⏱ CURING'}
              </span>
              {!cure.expired && (
                <span className="text-base font-black tabular-nums" style={{ color: SF.amber }}>
                  {fmtCureMins(cure.remainingMin)}
                </span>
              )}
            </div>
            <div className="text-sm font-bold" style={{ color: SF.text }}>{t.detail}</div>
            <div className="mb-2.5 text-xs" style={{ color: SF.text3 }}>
              #{t.tn ?? 'TBC'}{t.order?.orderNumber ? ` · ${t.order.orderNumber}` : ''}
            </div>
            {cure.expired && (
              <button
                onClick={() => onConfirmCure(t)}
                className="w-full rounded-[10px] py-2.5 text-[13px] font-black"
                style={{ background: SF.green, color: '#000' }}
              >
                ✓ Ready — Advance
              </button>
            )}
          </div>
        );
      })}

      {doneToday.length > 0 && <SectionHeader label="Completed Today" />}
      {doneToday.map((t) => {
        const today = new Date().toISOString().slice(0, 10);
        const mins = (t.time ?? [])
          .filter((s) => s.operativeId === me && s.end?.startsWith(today))
          .reduce((sum, s) => sum + Math.round((new Date(s.end!).getTime() - new Date(s.start).getTime()) / 60000), 0);
        return (
          <div
            key={t.id}
            className="mb-2 flex items-center gap-3 rounded-xl px-3.5 py-3"
            style={{ background: SF.surface, border: `1px solid ${SF.border}` }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold" style={{ color: SF.text3 }}>#{t.tn ?? 'TBC'} · {t.order?.orderNumber ?? '—'}</div>
              <div className="truncate text-sm font-bold" style={{ color: SF.text }}>{t.detail}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: SF.green }}>{shortStage(t.status)}</div>
            </div>
            <div className="flex-none text-center">
              <div className="text-lg font-black" style={{ color: SF.text2 }}>{Math.floor(mins / 60)}h {mins % 60}m</div>
              <div className="text-[9px] uppercase tracking-wide" style={{ color: SF.text3 }}>logged</div>
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── Available ───────────────────────────────────────────────────────────────
function Available({
  available, mySkills, busy, onJoin, onOpen,
}: {
  available: Ticket[];
  mySkills: string[];
  busy: boolean;
  onJoin: (t: Ticket) => void;
  onOpen: (id: number) => void;
}) {
  const byStage = new Map<string, Ticket[]>();
  for (const t of available) {
    byStage.set(t.status, [...(byStage.get(t.status) ?? []), t]);
  }
  return (
    <>
      <div
        className="mb-3.5 rounded-xl px-3 py-2.5 text-[11px]"
        style={{ background: SF.surface, border: `1px solid ${SF.border}`, color: SF.text2 }}
      >
        {mySkills.length ? (
          <>Your allocated stages: <strong style={{ color: SF.green }}>{mySkills.map(shortStage).join(', ')}</strong></>
        ) : (
          <>No stages allocated yet — showing all production stages. Ask your manager to set your skills in Operatives &amp; Settings.</>
        )}
      </div>
      {available.length === 0 && (
        <Empty icon="✓" title="Nothing available right now" sub="All tickets at your stages are covered" />
      )}
      {GRP_STAGES.filter((s) => byStage.has(s)).map((stage) => (
        <div key={stage}>
          <SectionHeader label={shortStage(stage)} />
          {byStage.get(stage)!.map((t) => {
            const working = (t.time ?? []).filter((s) => !s.end).length;
            const img = t.themeImage ?? t.order?.themeImage ?? null;
            return (
              <div
                key={t.id}
                className="mb-2.5 flex overflow-hidden rounded-2xl"
                style={{ background: SF.surface, border: `1px solid ${SF.border}` }}
              >
                {img && <img src={img} alt="" className="w-20 flex-none object-cover" />}
                <button onClick={() => onOpen(t.id)} className="min-w-0 flex-1 p-3 text-left">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold" style={{ color: SF.text3 }}>
                      #{t.tn ?? 'TBC'} · {t.order?.orderNumber ?? '—'}
                    </span>
                    {working > 0 && <span className="text-[10px] font-bold" style={{ color: SF.amber }}>{working} working</span>}
                  </div>
                  <div className="truncate text-[15px] font-bold" style={{ color: SF.text }}>{t.detail}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: SF.surface2, color: SF.text2 }}>
                      {shortStage(t.status)}
                    </span>
                    {t.hrs > 0 && <span className="text-[11px]" style={{ color: SF.text3 }}>Est. {t.hrs}h</span>}
                  </div>
                </button>
                <div className="flex flex-none items-center pr-3">
                  <button
                    onClick={() => onJoin(t)}
                    disabled={busy}
                    className="rounded-[10px] px-3.5 py-2 text-xs font-black disabled:opacity-50"
                    style={{ background: SF.green, color: '#000' }}
                  >
                    Join →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

// ─── Board (read-only) ───────────────────────────────────────────────────────
function BoardTab({
  tickets, me, opName, onOpen,
}: {
  tickets: Ticket[];
  me: number;
  opName: (id: number) => string;
  onOpen: (id: number) => void;
}) {
  const byStage = new Map<string, Ticket[]>();
  for (const t of tickets) byStage.set(t.status, [...(byStage.get(t.status) ?? []), t]);
  return (
    <>
      {GRP_STAGES.filter((s) => byStage.has(s)).map((stage) => {
        const col = byStage.get(stage)!;
        const isSpec = stage === '1. Spec Required' || stage === '2. Materials Required';
        return (
          <div
            key={stage}
            className="mb-3 overflow-hidden rounded-2xl"
            style={{ background: SF.surface, border: `1px solid ${SF.border}` }}
          >
            <div
              className="flex items-center justify-between px-3.5 py-2.5 text-[10px] font-black uppercase tracking-[.6px]"
              style={{ background: SF.surface2, color: isSpec ? SF.red : SF.text2 }}
            >
              <span>{isSpec ? '⚠ ' : ''}{shortStage(stage)}</span>
              <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: SF.surface3 }}>{col.length}</span>
            </div>
            {col.map((t) => {
              const workers = (t.time ?? []).filter((s) => !s.end);
              const meOn = workers.some((s) => s.operativeId === me);
              return (
                <button
                  key={t.id}
                  onClick={() => onOpen(t.id)}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
                  style={{ borderTop: `1px solid ${SF.border}`, background: meOn ? SF.greenDim : 'transparent' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold" style={{ color: SF.text }}>
                      #{t.tn ?? 'TBC'} {t.detail}
                    </div>
                    <div className="text-[10px]" style={{ color: SF.text3 }}>{t.order?.orderNumber ?? '—'}</div>
                  </div>
                  {workers.length > 0 && (
                    <div className="flex flex-none flex-wrap justify-end gap-1">
                      {workers.map((s) => (
                        <span
                          key={s.id}
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={
                            s.operativeId === me
                              ? { background: SF.green, color: '#000' }
                              : { background: SF.surface2, color: SF.text2 }
                          }
                        >
                          {opName(s.operativeId)}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      {tickets.length === 0 && <Empty icon="○" title="Nothing in production" sub="The board is clear" />}
    </>
  );
}
