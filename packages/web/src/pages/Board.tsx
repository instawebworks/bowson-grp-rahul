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
import { LIVE_STATUSES } from '@bowson/shared';
import {
  useAssignTicket,
  useBoardRealtime,
  useBoardStatusChange,
  useBoardTickets,
  useOperatives,
  useToggleTimer,
} from '../lib/hooks';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { cureState, fmtCureMins, fmtElapsed, initials } from '../lib/format';
import type { Operative, Ticket } from '../lib/types';

type View = 'stage' | 'ops';

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

  const [view, setView] = useState<View>('stage');
  const [scrollLock, setScrollLock] = useState(true);
  const [askUnlock, setAskUnlock] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // Bulk assign
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkOp, setBulkOp] = useState<number | null>(null);
  const [bulkSel, setBulkSel] = useState<Set<number>>(new Set());

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

  function onDragEnd(e: DragEndEvent) {
    const ticketId = Number(e.active.id);
    const over = e.over?.id;
    if (!over) return;
    const overId = String(over);
    if (overId.startsWith('stage:')) {
      const status = overId.slice('stage:'.length);
      const t = live.find((x) => x.id === ticketId);
      if (t && t.status !== status) changeStatus.mutate({ ticketId, status });
    } else if (overId.startsWith('op:')) {
      const rest = overId.slice('op:'.length);
      const ids = rest === 'unassigned' ? [] : [Number(rest)];
      assign.mutate({ ticketId, operativeIds: ids });
    }
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
    setBulkSel(new Set());
  }

  function confirmBulk() {
    if (bulkOp == null || bulkSel.size === 0) return;
    for (const id of bulkSel) {
      const t = live.find((x) => x.id === id);
      const existing = (t?.assignments ?? []).map((a) => a.operativeId);
      const ids = Array.from(new Set([...existing, bulkOp]));
      assign.mutate({ ticketId: id, operativeIds: ids });
    }
    cancelBulk();
  }

  const cardProps = { now, bulkMode, bulkSel, onBulkToggle: toggleBulk, onOpen: (id: number) => setDetailId(id) };

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

      {/* Bulk assign bar */}
      {bulkMode && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[#333] bg-[#191817] px-4 py-2">
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-[#888]">{bulkSel.size} selected</span>
            <button
              onClick={confirmBulk}
              disabled={bulkOp == null || bulkSel.size === 0}
              className="rounded-md bg-teal px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Assign {bulkSel.size} ticket{bulkSel.size === 1 ? '' : 's'}
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
  const names = (ticket.assignments ?? []).map((a) => a.operative?.name).filter(Boolean) as string[];
  const selected = bulkSel.has(ticket.id);

  const openSession =
    opId != null ? (ticket.time ?? []).find((s) => s.operativeId === opId && s.end == null) : undefined;
  const elapsed = openSession ? now - new Date(openSession.start).getTime() : 0;
  const cure = cureState(ticket, now);

  const style = {
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
      className={`rounded-md bg-[#2e2c2a] p-2.5 transition hover:bg-[#363330] ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
        isDragging ? 'opacity-40' : ''
      } ${selected ? 'ring-2 ring-teal' : ''}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-base font-extrabold leading-none text-white">#{ticket.tn ?? '—'}</span>
        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: `${border}44`, color: '#fff' }}>
          {ticket.type}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-2 text-[11px] font-medium leading-snug text-[#ddd]">{ticket.detail}</div>

      {cure && (
        <div className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${cure.expired ? 'bg-red/20 text-[#f87171]' : 'bg-amber/20 text-[#fbbf24]'}`}>
          {cure.expired ? '✓ cure done' : `⏱ ${fmtCureMins(cure.remainingMin)}`}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-[#3a3836] pt-1.5">
        <span className="text-[10px] font-semibold text-[#888]">{ticket.order?.orderNumber ?? `#${ticket.orderId}`}</span>
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
