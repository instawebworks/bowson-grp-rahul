import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { GRP_STAGES, LIVE_STATUSES, nextStage } from '@bowson/shared';
import {
  useAssignTicket,
  useBoardRealtime,
  useBoardStatusChange,
  useBoardTickets,
  useConfirmCure,
  useOperatives,
  useSetCure,
  useToggleTimer,
} from '../lib/hooks';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { cureState, fmtCureMins, fmtElapsed, initials } from '../lib/format';
import type { Operative, Ticket } from '../lib/types';

type View = 'stage' | 'ops';

// 10 T-Card colour palettes rotating by order (ported from KB_PALETTES).
const KB_PALETTES = [
  { bg: '#e8f4fd', border: '#1a6fa8', header: '#1a6fa8', text: '#0a3d5c' }, // Blue
  { bg: '#edf7ed', border: '#1a7a3a', header: '#1a7a3a', text: '#0a3d1a' }, // Green
  { bg: '#fdf3e8', border: '#a86010', header: '#a86010', text: '#5c3000' }, // Amber
  { bg: '#f5edfb', border: '#7a35b0', header: '#7a35b0', text: '#3d1a5c' }, // Purple
  { bg: '#fdedf2', border: '#b02050', header: '#b02050', text: '#5c0a25' }, // Rose
  { bg: '#edfbfb', border: '#1a8a8a', header: '#1a8a8a', text: '#0a4444' }, // Teal
  { bg: '#fdf8ed', border: '#8a7010', header: '#8a7010', text: '#443800' }, // Gold
  { bg: '#edf0fb', border: '#2a40b0', header: '#2a40b0', text: '#0a1a5c' }, // Indigo
  { bg: '#fdedf8', border: '#a83080', header: '#a83080', text: '#5c0a3d' }, // Pink
  { bg: '#f0fbed', border: '#3a8a20', header: '#3a8a20', text: '#1a4400' }, // Lime
];

const CURE_PRESETS = [
  { label: '30 min', mins: 30 },
  { label: '1 hour', mins: 60 },
  { label: '2 hours', mins: 120 },
  { label: '4 hours', mins: 240 },
];

const CURE_STAGES = ['4. Gel Coat', '5. Laminating'];

// Stage columns with the prototype's KB_COLS colours. Spec/Materials are flagged.
const KB_COLS: { key: string; label: string; color: string; warn?: boolean }[] = [
  { key: '1. Spec Required', label: 'Spec Required', color: '#534AB7', warn: true },
  { key: '2. Materials Required', label: 'Materials', color: '#a86e0a', warn: true },
  { key: '3. Queue - Awaiting Mould', label: 'Queue - Awaiting Mould', color: '#8a5200' },
  { key: '4. Gel Coat', label: 'Gel Coat', color: '#7a4800' },
  { key: '5. Laminating', label: 'Laminating', color: '#8b3800' },
  { key: '6. Trim & Finish', label: 'Trim & Finish', color: '#7a3000' },
  { key: '7. Assembly', label: 'Assembly', color: '#0c6b50' },
  { key: '8. QC Check', label: 'QC Check', color: '#1558a0' },
  { key: '9. Packing', label: 'Packing', color: '#2e6810' },
  { key: '10. Ready to Despatch', label: 'Ready to Despatch', color: '#0f4f8a' },
];

const TYPE_BORDER: Record<string, string> = {
  RAW: '#5c574f',
  MADE: '#0c6b50',
  COMP: '#1558a0',
  PART: '#4a42b0',
};

const isLive = (t: Ticket) => (LIVE_STATUSES as readonly string[]).includes(t.status);

export function Board() {
  const navigate = useNavigate();
  const { data, isLoading } = useBoardTickets();
  const { data: operatives } = useOperatives();
  const changeStatus = useBoardStatusChange();
  const assign = useAssignTicket();
  const toggleTimer = useToggleTimer();
  useBoardRealtime();

  const setCure = useSetCure();
  const confirmCure = useConfirmCure();

  const [view, setView] = useState<View>('stage');
  const [scrollLock, setScrollLock] = useState(true);
  const [askUnlock, setAskUnlock] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Bulk assign (ops view) / bulk stage move (stage view)
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkOp, setBulkOp] = useState<number | null>(null);
  const [bulkStage, setBulkStage] = useState<string | null>(null);
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());

  // Right-click context menu / cure prompt / cure-done modal
  const [ctx, setCtx] = useState<{ x: number; y: number; ticketId: number } | null>(null);
  const [curePrompt, setCurePrompt] = useState<{ ticketId: number; targetStage: string; move: boolean } | null>(null);
  const [cureDone, setCureDone] = useState<number | null>(null);

  // 1-second clock so running timers tick live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Escape closes the board.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [navigate]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const live = useMemo(() => (data ?? []).filter(isLive), [data]);

  // Stable order → palette assignment (ported from getOrderPalette).
  const paletteFor = useMemo(() => {
    const orderIds = [...new Set((data ?? []).map((t) => t.orderId))].sort((a, b) => a - b);
    return (orderId: number) => {
      const idx = orderIds.indexOf(orderId);
      return KB_PALETTES[(idx < 0 ? 0 : idx) % KB_PALETTES.length]!;
    };
  }, [data]);

  function onDragEnd(e: DragEndEvent) {
    const ticketId = Number(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const overId = String(over);
    if (overId.startsWith('stage:')) {
      const status = overId.slice('stage:'.length);
      const t = live.find((x) => x.id === ticketId);
      if (!t || t.status === status) return;
      // Dropping into a cure stage prompts for a cure timer (ported from kbDoMove).
      if (CURE_STAGES.includes(status)) {
        setCurePrompt({ ticketId, targetStage: status, move: true });
        return;
      }
      changeStatus.mutate({ ticketId, status });
    } else if (overId.startsWith('op:')) {
      const rest = overId.slice('op:'.length);
      const ids = rest === 'unassigned' ? [] : [Number(rest)];
      assign.mutate({ ticketId, operativeIds: ids });
    }
  }

  /** Cure prompt confirmed: (optionally) move the card, then start the timer
   * targeting the next stage — matching the order-detail cure behaviour. */
  function startCure(mins: number) {
    if (!curePrompt) return;
    const { ticketId, targetStage, move } = curePrompt;
    setCurePrompt(null);
    const apply = () =>
      setCure.mutate({ ticketId, mins, targetStage: nextStage(targetStage) ?? undefined });
    if (move) changeStatus.mutate({ ticketId, status: targetStage }, { onSuccess: apply });
    else apply();
  }

  function toggleBulk(id: number) {
    setBulkSel((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cancelBulk() {
    setBulkMode(false);
    setBulkOp(null);
    setBulkStage(null);
    setBulkSel(new Set());
  }

  function confirmBulk() {
    if (bulkSel.size === 0) return;
    if (view === 'stage') {
      // Bulk stage move (ported from kbBulkStageConfirm).
      if (!bulkStage) return;
      for (const id of bulkSel) {
        const t = live.find((x) => x.id === id);
        if (t && t.status !== bulkStage) changeStatus.mutate({ ticketId: id, status: bulkStage });
      }
    } else {
      if (bulkOp == null) return;
      for (const id of bulkSel) {
        const t = live.find((x) => x.id === id);
        const existing = (t?.assignments ?? []).map((a) => a.operativeId);
        const ids = Array.from(new Set([...existing, bulkOp]));
        assign.mutate({ ticketId: id, operativeIds: ids });
      }
    }
    cancelBulk();
  }

  const cardProps = {
    now,
    bulkMode,
    bulkSel,
    onBulkToggle: toggleBulk,
    onOpen: (id: number) => setDetailId(id),
    onContext: (e: React.MouseEvent, id: number) => {
      e.preventDefault();
      e.stopPropagation();
      setCtx({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 320), ticketId: id });
    },
    onCureClick: (id: number, expired: boolean) => {
      if (expired) setCureDone(id);
    },
    paletteFor,
  };

  return (
    <div className="fixed inset-0 z-[500] flex flex-col bg-[#1a1917] text-white">
      {/* Top bar */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-[#333] bg-[#111] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rotate-45 rounded-sm bg-teal" />
          <span className="text-sm font-bold tracking-tight text-white">T-Card Board</span>
        </div>
        <div className="h-5 w-px bg-[#333]" />
        <div className="flex overflow-hidden rounded-md border border-[#444]">
          {(['stage', 'ops'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[11px] font-bold transition ${
                view === v ? 'bg-teal text-white' : 'bg-transparent text-[#888] hover:text-white'
              }`}
            >
              {v === 'stage' ? '☰ By Stage' : '👤 By Operative'}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-[#333]" />
        <button
          onClick={() => (bulkMode ? cancelBulk() : setBulkMode(true))}
          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
            bulkMode
              ? 'border-[#0c6b5088] bg-[#0c6b5055] text-[#4ade80]'
              : 'border-[#0c6b5055] bg-[#0c6b5033] text-[#4ade80] hover:bg-[#0c6b5044]'
          }`}
        >
          ⚖ Bulk Assign
        </button>
        <div className="text-[11px] text-[#666]">{live.length} tickets</div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-[#555]">
            {view === 'stage' ? 'Drag cards between columns · Click to view detail' : 'Operative view · Click any card to view detail'}
          </span>
          <button
            onClick={() => (scrollLock ? setAskUnlock(true) : setScrollLock(true))}
            className={`rounded-md border border-[#444] bg-[#333] px-3 py-1.5 text-[11px] hover:bg-[#3a3a3a] ${scrollLock ? 'text-[#ccc]' : 'text-[#4ade80]'}`}
          >
            {scrollLock ? '🔒 Scroll locked' : '🔓 Scroll unlocked'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="rounded-md border border-[#444] bg-[#333] px-3 py-1.5 text-xs text-[#ccc] hover:bg-[#3a3a3a]"
          >
            ✕ Close
          </button>
        </div>
      </header>

      {/* Bulk bar: assign operative (ops view) or move to stage (stage view) */}
      {bulkMode && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[#333] bg-[#191817] px-4 py-2">
          {view === 'stage' ? (
            <>
              <span className="text-[11px] font-semibold text-[#aaa]">Move to:</span>
              {KB_COLS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setBulkStage(c.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    bulkStage === c.key ? 'border-teal bg-teal text-white' : 'border-[#444] bg-[#222] text-[#ccc] hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </>
          ) : (
            <>
              <span className="text-[11px] font-semibold text-[#aaa]">Assign to:</span>
              {(operatives ?? []).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setBulkOp(o.id)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    bulkOp === o.id ? 'border-teal bg-teal text-white' : 'border-[#444] bg-[#222] text-[#ccc] hover:text-white'
                  }`}
                >
                  {o.name}
                </button>
              ))}
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-[#888]">{bulkSel.size} selected</span>
            <button
              onClick={confirmBulk}
              disabled={(view === 'stage' ? !bulkStage : bulkOp == null) || bulkSel.size === 0}
              className="rounded-md bg-teal px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              {view === 'stage' ? 'Move' : 'Assign'} {bulkSel.size} ticket{bulkSel.size === 1 ? '' : 's'}
            </button>
            <button onClick={cancelBulk} className="rounded-md border border-[#444] bg-[#333] px-3 py-1.5 text-[11px] text-[#ccc]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Board */}
      <div className="flex flex-1 items-stretch gap-0 overflow-x-auto px-2.5 py-3" style={{ overflowY: 'hidden' }}>
        {isLoading && <div className="p-4 text-xs text-[#888]">Loading…</div>}
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {view === 'stage'
            ? KB_COLS.map((col) => (
                <StageColumn key={col.key} col={col} tickets={live.filter((t) => t.status === col.key)} scrollLock={scrollLock} cardProps={cardProps} />
              ))
            : [{ id: 'op:unassigned', name: 'Unassigned', opId: null as number | null }, ...(operatives ?? []).map((o) => ({ id: `op:${o.id}`, name: o.name, opId: o.id }))].map((col) => (
                <OpColumn
                  key={col.id}
                  id={col.id}
                  name={col.name}
                  tickets={live.filter((t) => (t.assignments?.[0]?.operativeId ?? null) === col.opId)}
                  scrollLock={scrollLock}
                  cardProps={cardProps}
                  opId={col.opId}
                  onTimer={toggleTimer.mutate}
                />
              ))}
        </DndContext>
      </div>

      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}

      {/* Right-click context menu (ported from openKbContextMenu) */}
      {ctx && (
        <KbContextMenu
          x={ctx.x}
          y={ctx.y}
          ticket={live.find((t) => t.id === ctx.ticketId)}
          operatives={operatives ?? []}
          now={now}
          onAssign={(ids) => assign.mutate({ ticketId: ctx.ticketId, operativeIds: ids })}
          onTimer={(operativeId, action) => toggleTimer.mutate({ ticketId: ctx.ticketId, operativeId, action })}
          onStopAll={() => {
            const t = live.find((x) => x.id === ctx.ticketId);
            for (const s of t?.time ?? []) {
              if (s.end == null) toggleTimer.mutate({ ticketId: ctx.ticketId, operativeId: s.operativeId, action: 'stop' });
            }
            setCtx(null);
          }}
          onClose={() => setCtx(null)}
        />
      )}

      {/* Cure timer prompt on drop into Gel Coat / Laminating */}
      {curePrompt && (
        <CurePromptModal
          stage={curePrompt.targetStage}
          onConfirm={startCure}
          onCancel={() => setCurePrompt(null)}
        />
      )}

      {/* Cure expired: confirm complete or needs more time */}
      {cureDone != null && (() => {
        const t = live.find((x) => x.id === cureDone);
        if (!t) return null;
        return (
          <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60" onClick={() => setCureDone(null)}>
            <div className="w-[340px] rounded-xl border border-[#444] bg-[#1e1c1a] p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1.5 text-[13px] font-bold text-white">✓ Cure complete — #{t.tn ?? 'TBC'}</div>
              <p className="mb-3 text-[11px] text-[#aaa]">
                Inspect the part. Confirm to advance{t.cureTargetStage ? ` to ${t.cureTargetStage}` : ''}, or restart the timer if it needs more time.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { confirmCure.mutate({ ticketId: t.id }); setCureDone(null); }}
                  className="flex-1 rounded-md bg-teal px-3 py-2 text-[11px] font-bold text-white"
                >
                  ✓ Confirm cure
                </button>
                <button
                  onClick={() => { setCureDone(null); setCurePrompt({ ticketId: t.id, targetStage: t.status, move: false }); }}
                  className="flex-1 rounded-md border border-[#666] bg-[#333] px-3 py-2 text-[11px] font-semibold text-[#fbbf24]"
                >
                  ⏱ Needs more time
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {askUnlock && (
        <ManagerPinGate
          title="Unlock scroll"
          prompt="Enter manager PIN to unlock vertical scrolling on the T-Card board."
          confirmLabel="Unlock"
          onSuccess={() => { setScrollLock(false); setAskUnlock(false); }}
          onCancel={() => setAskUnlock(false)}
        />
      )}
    </div>
  );
}

interface CardProps {
  now: number;
  bulkMode: boolean;
  bulkSel: Set<number>;
  onBulkToggle: (id: number) => void;
  onOpen: (id: number) => void;
  onContext: (e: React.MouseEvent, id: number) => void;
  onCureClick: (id: number, expired: boolean) => void;
  paletteFor: (orderId: number) => (typeof KB_PALETTES)[number];
}

// ─── Stage column ────────────────────────────────────────────────────────────
function StageColumn({
  col,
  tickets,
  scrollLock,
  cardProps,
}: {
  col: { key: string; label: string; color: string; warn?: boolean };
  tickets: Ticket[];
  scrollLock: boolean;
  cardProps: CardProps;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage:${col.key}` });
  const cc = col.warn ? '#dc2626' : col.color;
  return (
    <div className="mx-[5px] flex h-full w-[188px] shrink-0 flex-col overflow-hidden rounded-lg bg-[#242220]">
      <div
        className="flex flex-shrink-0 items-center justify-between px-3 py-2 text-[9px] font-bold uppercase tracking-wide"
        style={{ background: `${cc}22`, color: cc, borderBottom: `2px solid ${cc}44` }}
      >
        <span className="truncate">{col.label}{col.warn ? ' ⚠' : ''}</span>
        <span className="rounded-full bg-white/10 px-1.5 py-px text-[11px] text-white/60">{tickets.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-1.5 p-1.5 ${isOver ? 'bg-[#4ade80]/5' : ''}`}
        style={{ overflowY: scrollLock ? 'hidden' : 'auto' }}
      >
        {tickets.map((t) => (
          <KbCard key={t.id} ticket={t} {...cardProps} />
        ))}
        {tickets.length === 0 && <div className="my-1 h-14 rounded border border-dashed border-[#333]" />}
      </div>
    </div>
  );
}

// ─── Operative column ────────────────────────────────────────────────────────
function OpColumn({
  id,
  name,
  tickets,
  scrollLock,
  cardProps,
  opId,
  onTimer,
}: {
  id: string;
  name: string;
  tickets: Ticket[];
  scrollLock: boolean;
  cardProps: CardProps;
  opId: number | null;
  onTimer: (v: { ticketId: number; operativeId: number; action: 'start' | 'stop' }) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="mx-[5px] flex h-full w-[188px] shrink-0 flex-col overflow-hidden rounded-lg bg-[#242220]">
      <div className="flex flex-shrink-0 items-center justify-between border-b-2 border-[#3a3836] px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-[#ccc]">
        <span className="truncate">{name}</span>
        <span className="rounded-full bg-white/10 px-1.5 py-px text-[11px] text-white/60">{tickets.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-1.5 p-1.5 ${isOver ? 'bg-[#4ade80]/5' : ''}`}
        style={{ overflowY: scrollLock ? 'hidden' : 'auto' }}
      >
        {tickets.map((t) => (
          <KbCard key={t.id} ticket={t} {...cardProps} opId={opId ?? undefined} onTimer={onTimer} />
        ))}
        {tickets.length === 0 && <div className="my-1 h-14 rounded border border-dashed border-[#333]" />}
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
function KbCard({
  ticket,
  now,
  bulkMode,
  bulkSel,
  onBulkToggle,
  onOpen,
  onContext,
  onCureClick,
  paletteFor,
  opId,
  onTimer,
}: CardProps & {
  ticket: Ticket;
  opId?: number;
  onTimer?: (v: { ticketId: number; operativeId: number; action: 'start' | 'stop' }) => void;
}) {
  const draggable = !bulkMode;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id, disabled: !draggable });
  const border = TYPE_BORDER[ticket.type] ?? '#5c574f';
  const pal = paletteFor(ticket.orderId);
  const names = (ticket.assignments ?? []).map((a) => a.operative?.name).filter(Boolean) as string[];
  const selected = bulkSel.has(ticket.id);

  const openSession =
    opId != null ? (ticket.time ?? []).find((s) => s.operativeId === opId && s.end == null) : undefined;
  const elapsed = openSession ? now - new Date(openSession.start).getTime() : 0;
  const cure = cureState(ticket, now);

  const style = {
    background: pal.bg,
    borderLeft: `3px solid ${border}`,
    ...(transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : {}),
  };

  function onClick() {
    if (bulkMode) onBulkToggle(ticket.id);
    else onOpen(ticket.id);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onClick={onClick}
      onContextMenu={(e) => onContext(e, ticket.id)}
      className={`rounded-md p-2.5 transition hover:brightness-105 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
        isDragging ? 'opacity-40' : ''
      } ${selected ? 'ring-2 ring-teal' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-base font-extrabold leading-none" style={{ color: pal.header }}>#{ticket.tn ?? '—'}</span>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: border }}>
          {ticket.type}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug" style={{ color: pal.text }}>{ticket.detail}</div>

      {cure && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onCureClick(ticket.id, cure.expired); }}
          className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${cure.expired ? 'cursor-pointer bg-red/20 text-[#dc2626]' : 'bg-amber/20 text-[#a86010]'}`}
          title={cure.expired ? 'Cure done — click to confirm or extend' : undefined}
        >
          {cure.expired ? '✓ cure done' : `⏱ ${fmtCureMins(cure.remainingMin)}`}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t pt-1.5" style={{ borderColor: `${pal.border}33` }}>
        <span className="text-[10px] font-semibold" style={{ color: pal.header }}>{ticket.order?.orderNumber ?? `#${ticket.orderId}`}</span>
        <div className="flex items-center gap-1">
          {names.length > 0 ? (
            names.slice(0, 3).map((n) => (
              <span key={n} title={n} className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0c6b5033] text-[8px] font-bold text-[#4ade80]">
                {initials(n)}
              </span>
            ))
          ) : (
            <span className="rounded-full bg-[#3a3836] px-1.5 py-px text-[9px] text-[#666]">unassigned</span>
          )}
          {opId != null && onTimer && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onTimer({ ticketId: ticket.id, operativeId: opId, action: openSession ? 'stop' : 'start' });
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${openSession ? 'bg-[#0c6b5033] text-[#4ade80]' : 'bg-[#333] text-[#aaa] hover:text-white'}`}
            >
              {openSession ? `● ${fmtElapsed(elapsed)}` : '▶'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Right-click context menu (ported from openKbContextMenu) ────────────────
function KbContextMenu({
  x,
  y,
  ticket,
  operatives,
  now,
  onAssign,
  onTimer,
  onStopAll,
  onClose,
}: {
  x: number;
  y: number;
  ticket: Ticket | undefined;
  operatives: Operative[];
  now: number;
  onAssign: (operativeIds: number[]) => void;
  onTimer: (operativeId: number, action: 'start' | 'stop') => void;
  onStopAll: () => void;
  onClose: () => void;
}) {
  if (!ticket) return null;
  const assigned = (ticket.assignments ?? []).map((a) => a.operativeId);
  const sessions = ticket.time ?? [];
  const activeFor = (opId: number) => sessions.some((s) => s.operativeId === opId && s.end == null);
  const totalFor = (opId: number) =>
    sessions
      .filter((s) => s.operativeId === opId)
      .reduce((sum, s) => sum + ((s.end ? new Date(s.end).getTime() : now) - new Date(s.start).getTime()), 0);

  function toggleOp(opId: number, checked: boolean) {
    const next = checked ? [...new Set([...assigned, opId])] : assigned.filter((id) => id !== opId);
    if (!checked && activeFor(opId)) onTimer(opId, 'stop'); // stop their timer on unassign
    onAssign(next);
  }

  return (
    <div className="fixed inset-0 z-[850]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        className="fixed min-w-[210px] rounded-lg border border-[#444] bg-[#1e1c1a] p-1.5 shadow-2xl"
        style={{ top: y, left: x }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 border-b border-[#333] px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-[#666]">
          Assign operatives
        </div>
        {operatives.map((op) => (
          <label
            key={op.id}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-[#2e2c2a] ${
              assigned.includes(op.id) ? 'text-[#4ade80]' : 'text-[#bbb]'
            }`}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-teal"
              checked={assigned.includes(op.id)}
              onChange={(e) => toggleOp(op.id, e.target.checked)}
            />
            <span>{op.name}</span>
            {activeFor(op.id) && <span className="ml-auto text-[9px] text-[#4ade80]">● live</span>}
          </label>
        ))}
        {assigned.length > 0 && (
          <div className="mt-1 border-t border-[#333] pt-1">
            <div className="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-wide text-[#666]">Timers</div>
            {assigned.map((opId) => {
              const op = operatives.find((o) => o.id === opId);
              const active = activeFor(opId);
              const ms = totalFor(opId);
              return (
                <div key={opId} className="flex items-center gap-2 px-2 py-1 text-[11px] text-[#bbb]">
                  <span className="flex-1">{op?.name.split(' ')[0] ?? '?'}</span>
                  <span className="text-[10px] text-[#666]">{ms > 0 ? fmtElapsed(ms) : '—'}</span>
                  <button
                    onClick={() => onTimer(opId, active ? 'stop' : 'start')}
                    className={`rounded border px-2 py-0.5 text-[10px] ${
                      active ? 'border-[#f87171] bg-[#f8717122] text-[#f87171]' : 'border-teal bg-[#0c6b5022] text-[#4ade80]'
                    }`}
                  >
                    {active ? '⏸ Stop' : '▶ Start'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-1 flex gap-1.5 border-t border-[#333] px-1.5 pb-1 pt-2">
          <button onClick={onStopAll} className="flex-1 rounded border border-[#444] bg-[#2e2c2a] px-2 py-1 text-[11px] text-[#bbb]">
            Stop all
          </button>
          <button onClick={onClose} className="flex-1 rounded border border-[#444] bg-[#2e2c2a] px-2 py-1 text-[11px] text-[#bbb]">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cure timer prompt on drop into a cure stage (ported) ────────────────────
function CurePromptModal({
  stage,
  onConfirm,
  onCancel,
}: {
  stage: string;
  onConfirm: (mins: number) => void;
  onCancel: () => void;
}) {
  const defaultMins = stage === '4. Gel Coat' ? 60 : 120;
  const [mins, setMins] = useState(defaultMins);
  const [custom, setCustom] = useState(false);
  const stageName = stage.replace(/^\d+\.\s*/, '');

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="w-[360px] rounded-xl border border-[#444] bg-[#1e1c1a] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1.5 text-[13px] font-bold text-white">⏱ Set {stageName} cure time</div>
        <p className="mb-3 text-[11px] text-[#aaa]">
          How long does this need to cure before it can be checked? The ticket will be held until the timer expires.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CURE_PRESETS.map((p) => (
            <button
              key={p.mins}
              onClick={() => { setMins(p.mins); setCustom(false); }}
              className={`rounded-lg border-2 px-3 py-2 text-xs font-bold ${
                !custom && mins === p.mins ? 'border-teal bg-[#0c6b5033] text-[#4ade80]' : 'border-[#444] bg-[#242220] text-[#aaa]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setCustom(true)}
            className={`rounded-lg border-2 px-3 py-2 text-xs font-bold ${
              custom ? 'border-teal bg-[#0c6b5033] text-[#4ade80]' : 'border-[#444] bg-[#242220] text-[#aaa]'
            }`}
          >
            Custom
          </button>
        </div>
        {custom && (
          <div className="mb-3 flex items-center gap-2">
            <label className="text-xs font-semibold text-[#aaa]">Minutes:</label>
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={mins}
              onChange={(e) => setMins(Math.max(5, Number(e.target.value) || defaultMins))}
              className="w-20 rounded-md border border-[#444] bg-[#242220] px-2 py-1.5 text-sm text-white outline-none focus:border-teal"
            />
          </div>
        )}
        <p className="mb-3 text-[10px] text-[#777]">⚠ The operative will be clocked off — they'll be reminded to inspect when the timer expires.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-[#444] bg-[#333] px-3 py-1.5 text-xs text-[#ccc]">Cancel</button>
          <button onClick={() => onConfirm(mins)} className="rounded-md bg-teal px-4 py-1.5 text-xs font-bold text-white">
            Start Timer →
          </button>
        </div>
      </div>
    </div>
  );
}
