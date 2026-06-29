import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { LIVE_STATUSES, STAGE_SHORT } from '@bowson/shared';
import {
  useAssignTicket,
  useBoardRealtime,
  useBoardStatusChange,
  useBoardTickets,
  useOperatives,
  useToggleTimer,
} from '../lib/hooks';
import { Content, PageHeader, ProgressBar } from '../components/ui';
import { cureState, fmtCureMins, fmtElapsed, initials, statusStyle } from '../lib/format';
import type { Operative, Ticket } from '../lib/types';

type View = 'stage' | 'ops';

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

const isLive = (t: Ticket) => (LIVE_STATUSES as readonly string[]).includes(t.status);

export function Board() {
  const { data, isLoading, error } = useBoardTickets();
  const { data: operatives } = useOperatives();
  const changeStatus = useBoardStatusChange();
  const assign = useAssignTicket();
  const toggleTimer = useToggleTimer();
  useBoardRealtime();
  const [view, setView] = useState<View>('stage');

  // 1-second clock so running timers tick live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  return (
    <>
      <PageHeader
        title="T-Card Board"
        sub={`${live.length} live ticket${live.length === 1 ? '' : 's'}`}
        actions={
          <div className="flex gap-1.5">
            {(['stage', 'ops'] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  view === v ? 'bg-teal text-white' : 'bg-surface2 text-text2 hover:text-text'
                }`}
              >
                {v === 'stage' ? 'By stage' : 'By operative'}
              </button>
            ))}
          </div>
        }
      />
      <Content>
        {error && <div className="mb-3 text-xs text-text3">Could not load board — {(error as Error).message}.</div>}
        {isLoading && <div className="text-xs text-text3">Loading…</div>}
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          {view === 'stage' ? (
            <StageView tickets={live} now={now} />
          ) : (
            <OpsView tickets={live} operatives={operatives ?? []} now={now} onTimer={toggleTimer.mutate} />
          )}
        </DndContext>
      </Content>
    </>
  );
}

// ─── By stage ────────────────────────────────────────────────────────────────
function StageView({ tickets, now }: { tickets: Ticket[]; now: number }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {LIVE_STATUSES.map((stage, i) => {
        const cards = tickets.filter((t) => t.status === stage);
        return (
          <Column key={stage} id={`stage:${stage}`} title={STAGE_SHORT[i] ?? stage} count={cards.length} accent={statusStyle(stage).color}>
            {cards.map((t) => (
              <Card key={t.id} ticket={t} now={now} />
            ))}
          </Column>
        );
      })}
    </div>
  );
}

// ─── By operative ────────────────────────────────────────────────────────────
function OpsView({
  tickets,
  operatives,
  now,
  onTimer,
}: {
  tickets: Ticket[];
  operatives: Operative[];
  now: number;
  onTimer: (v: { ticketId: number; operativeId: number; action: 'start' | 'stop' }) => void;
}) {
  const firstAssignee = (t: Ticket) => t.assignments?.[0]?.operativeId ?? null;
  const cols: { id: string; name: string; opId: number | null }[] = [
    { id: 'op:unassigned', name: 'Unassigned', opId: null },
    ...operatives.map((o) => ({ id: `op:${o.id}`, name: o.name, opId: o.id })),
  ];
  return (
    <div className="flex gap-3 overflow-x-auto pb-3">
      {cols.map((col) => {
        const cards = tickets.filter((t) => firstAssignee(t) === col.opId);
        return (
          <Column key={col.id} id={col.id} title={col.name} count={cards.length}>
            {cards.map((t) => (
              <Card key={t.id} ticket={t} opId={col.opId ?? undefined} now={now} onTimer={onTimer} />
            ))}
          </Column>
        );
      })}
    </div>
  );
}

// ─── Column ──────────────────────────────────────────────────────────────────
function Column({
  id,
  title,
  count,
  accent,
  children,
}: {
  id: string;
  title: string;
  count: number;
  accent?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-60 shrink-0 flex-col rounded-lg border bg-surface2 ${isOver ? 'border-teal' : 'border-border'}`}
    >
      <div className="flex items-center justify-between border-b border-border px-2.5 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: accent ?? 'var(--color-text2)' }}>
          {title}
        </span>
        <span className="rounded-full bg-surface3 px-1.5 text-[10px] font-bold text-text3">{count}</span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
function Card({
  ticket,
  opId,
  now,
  onTimer,
}: {
  ticket: Ticket;
  opId?: number;
  now?: number;
  onTimer?: (v: { ticketId: number; operativeId: number; action: 'start' | 'stop' }) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const ts = TYPE_STYLE[ticket.type] ?? TYPE_STYLE.RAW!;
  const names = (ticket.assignments ?? []).map((a) => a.operative?.name).filter(Boolean) as string[];

  // Running session for this operative (ops view only)
  const openSession =
    opId != null ? (ticket.time ?? []).find((s) => s.operativeId === opId && s.end == null) : undefined;
  const elapsed = openSession && now ? now - new Date(openSession.start).getTime() : 0;

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-md border border-border bg-surface p-2 shadow-sm active:cursor-grabbing ${
        isDragging ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold text-text3">{ticket.order?.orderNumber ?? `#${ticket.orderId}`}</span>
        <span className="rounded px-1 py-0.5 text-[9px] font-bold" style={{ backgroundColor: ts.bg, color: ts.color }}>
          {ticket.type}
        </span>
      </div>
      <div className="mb-1.5 line-clamp-2 text-[11px] font-medium leading-snug">{ticket.detail}</div>
      <ProgressBar pct={ticket.pct} />
      {(() => {
        const cure = now ? cureState(ticket, now) : null;
        if (!cure) return null;
        return (
          <div
            className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${
              cure.expired ? 'bg-red/10 text-red' : 'bg-amber-l text-amber'
            }`}
          >
            {cure.expired ? '✓ cure done' : `⏱ ${fmtCureMins(cure.remainingMin)}`}
          </div>
        );
      })()}
      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex gap-0.5">
          {names.slice(0, 3).map((n) => (
            <span
              key={n}
              title={n}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-l text-[8px] font-bold text-teal"
            >
              {initials(n)}
            </span>
          ))}
        </div>
        {opId != null && onTimer && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onTimer({ ticketId: ticket.id, operativeId: opId, action: openSession ? 'stop' : 'start' })}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
              openSession ? 'bg-green-l text-green' : 'bg-surface2 text-text2 hover:text-text'
            }`}
          >
            {openSession ? <>● {fmtElapsed(elapsed)}</> : <>▶ start</>}
          </button>
        )}
      </div>
    </div>
  );
}
