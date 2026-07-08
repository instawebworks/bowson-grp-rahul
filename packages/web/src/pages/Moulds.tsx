import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isoDate, mondayOf, wcKey } from '@bowson/shared';
import { useAssignMould, useCatalogue, useMoulds, useTickets } from '../lib/hooks';
import { apiClient } from '../lib/api';
import { Button, Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { MouldForm } from '../components/MouldForm';
import { useAuth } from '../lib/auth';
import { downloadCsv, parseCsv } from '../lib/csv';
import type { Catalogue, Mould, Ticket } from '../lib/types';

type Tab = 'register' | 'board' | 'unassigned' | 'schedule' | 'unlinked';
const ACTIVE_STAGES = ['4. Gel Coat', '5. Laminating'];
const QUEUE = '3. Queue - Awaiting Mould';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function occupancy(m: Mould, tickets: Ticket[]) {
  const active = tickets.filter((t) => t.mouldId === m.id && ACTIVE_STAGES.includes(t.status));
  const queued = tickets.filter((t) => t.mouldId === m.id && t.status === QUEUE);
  const status =
    m.status === 'Maintenance' ? 'Maintenance' : active.length === 0 ? 'Free' : active.length >= m.qty ? 'Full' : 'Partial';
  return { active, queued, status };
}

export function Moulds() {
  const { data: moulds, isLoading, error } = useMoulds();
  const { data: tickets } = useTickets();
  const { data: catalogue } = useCatalogue();
  const [tab, setTab] = useState<Tab>('board');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Mould | null>(null);
  const { canManage } = useAuth();

  const rows = moulds ?? [];
  const liveTickets = tickets ?? [];
  const cat = catalogue ?? [];
  const unlinkedCount = cat.reduce((n, c) => n + c.parts.filter((p) => !p.mouldId).length, 0);

  // Status-bar metrics
  const statuses = rows.map((m) => occupancy(m, liveTickets).status);
  const inUse = statuses.filter((s) => s === 'Partial' || s === 'Full').length;
  const maint = rows.filter((m) => m.status === 'Maintenance').length;
  const available = rows.length - inUse - maint;
  const unassignedCount = liveTickets.filter(
    (t) => t.status === QUEUE && !t.mouldId && t.type !== 'RAW' && t.type !== 'COMP',
  ).length;

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
        tab === t ? 'border-teal text-teal' : 'border-transparent text-text2 hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      {showCreate && <MouldForm onClose={() => setShowCreate(false)} />}
      {editing && <MouldForm mould={editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Moulds"
        sub={`${rows.length} mould${rows.length === 1 ? '' : 's'}`}
        globalActions={false}
      />
      <Content>
        {/* Status bar */}
        <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          <MouldStat label="Total Moulds" value={rows.length} />
          <MouldStat label="In Use" value={inUse} color={inUse > 0 ? '#922020' : undefined} />
          <MouldStat label="Available" value={available} color={available > 0 ? '#0c6b50' : undefined} />
          <MouldStat
            label="No Mould Assigned"
            value={unassignedCount}
            color={unassignedCount > 0 ? '#a86e0a' : undefined}
            onClick={() => setTab('unassigned')}
          />
        </div>

        {/* Tabs */}
        <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
          {tabBtn('board', '🗂 Mould Board')}
          {tabBtn('schedule', '📅 Schedule')}
          {tabBtn('unassigned', `⚠ Tickets Without Mould${unassignedCount ? ` (${unassignedCount})` : ''}`)}
          {tabBtn('unlinked', `🔗 Unlinked Catalogue${unlinkedCount ? ` (${unlinkedCount})` : ''}`)}
          {tabBtn('register', '📋 Register')}
          {canManage && (
            <Button variant="primary" className="ml-auto mb-1.5" onClick={() => setShowCreate(true)}>+ New Mould</Button>
          )}
        </div>

        {tab === 'register' && (
          <RegisterTab rows={rows} isLoading={isLoading} error={error} onEdit={setEditing} />
        )}
        {tab === 'board' && <BoardTab moulds={rows} tickets={liveTickets} />}
        {tab === 'schedule' && <ScheduleTab moulds={rows} tickets={liveTickets} />}
        {tab === 'unassigned' && <UnassignedTab moulds={rows} tickets={liveTickets} />}
        {tab === 'unlinked' && <UnlinkedTab catalogue={cat} moulds={moulds ?? []} />}
      </Content>
    </>
  );
}

function MouldStat({ label, value, color, onClick }: { label: string; value: number; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`rounded-lg border bg-surface px-4 py-3 ${onClick ? 'cursor-pointer' : ''}`}
      style={{ borderColor: color ?? 'var(--color-border)' }}
    >
      <div className="text-2xl font-extrabold leading-none" style={{ color: color ?? 'var(--color-text3)' }}>{value}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-text3">{label}</div>
    </div>
  );
}

// ─── Register (table + CSV import/export) ────────────────────────────────────
function RegisterTab({
  rows,
  isLoading,
  error,
  onEdit,
}: {
  rows: Mould[];
  isLoading: boolean;
  error: unknown;
  onEdit: (m: Mould) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    let ok = 0;
    let fail = 0;
    for (const r of parsed) {
      const ref = (r.ref ?? r.Ref ?? r['Ref'] ?? '').trim();
      if (!ref) continue;
      try {
        await apiClient.post('/api/moulds', {
          ref,
          name: r.name ?? r.Name ?? null,
          qty: Number(r.qty ?? r.Qty ?? r.Capacity ?? 1) || 1,
          status: r.status ?? r.Status ?? 'Active',
          notes: r.notes ?? r.Notes ?? null,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    qc.invalidateQueries({ queryKey: ['moulds'] });
    setImportMsg(`Imported ${ok} mould${ok === 1 ? '' : 's'}${fail ? `, ${fail} skipped (e.g. duplicate ref)` : ''}.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <Card
      title="Register"
      actions={
        <div className="flex gap-1.5">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onImport} />
          <Button onClick={() => fileRef.current?.click()}>⭱ Import CSV</Button>
          <Button
            onClick={() =>
              downloadCsv('moulds.csv', [
                { key: 'ref', label: 'ref', value: (m) => m.ref },
                { key: 'name', label: 'name', value: (m) => m.name ?? '' },
                { key: 'qty', label: 'qty', value: (m) => m.qty },
                { key: 'status', label: 'status', value: (m) => m.status },
                { key: 'notes', label: 'notes', value: (m) => m.notes ?? '' },
              ], rows)
            }
          >
            ⭳ Export CSV
          </Button>
        </div>
      }
    >
      {importMsg && <div className="border-b border-border bg-teal-l/40 px-3 py-2 text-xs text-teal">{importMsg}</div>}
      <Table head={['Ref', 'Name', 'Capacity', 'Status', 'Notes', '']}>
        <QueryState isLoading={isLoading} error={error} colSpan={6} />
        {!isLoading && !error && rows.length === 0 && (
          <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-text3">No moulds yet.</td></tr>
        )}
        {rows.map((m) => (
          <tr key={m.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => onEdit(m)}>
            <td className="px-3 py-2 font-semibold">{m.ref}</td>
            <td className="px-3 py-2">{m.name ?? '—'}</td>
            <td className="px-3 py-2 tabular-nums text-text2">{m.qty}</td>
            <td className="px-3 py-2"><StatusPill status={m.status} /></td>
            <td className="px-3 py-2 text-text2">{m.notes ?? '—'}</td>
            <td className="px-3 py-2 text-right">
              <Button onClick={(e) => { e.stopPropagation(); onEdit(m); }}>Edit</Button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

// ─── Board (occupancy) ───────────────────────────────────────────────────────
const OCC_COLOR: Record<string, string> = {
  Free: '#2e6810',
  Partial: '#a86e0a',
  Full: '#922020',
  Maintenance: '#5c574f',
};

function BoardTab({ moulds, tickets }: { moulds: Mould[]; tickets: Ticket[] }) {
  if (moulds.length === 0) return <div className="text-xs text-text3">No moulds yet.</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {moulds.map((m) => {
        const { active, queued, status } = occupancy(m, tickets);
        return (
          <Card key={m.id} title={`${m.ref}${m.name ? ` · ${m.name}` : ''}`}>
            <div className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: OCC_COLOR[status], backgroundColor: `${OCC_COLOR[status]}1a` }}>
                  {status}
                </span>
                <span className="text-[11px] text-text3">{active.length}/{m.qty} in use</span>
              </div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-text3">In mould</div>
              {active.length ? active.map((t) => <TicketLine key={t.id} t={t} />) : <div className="text-xs text-text3">—</div>}
              {queued.length > 0 && (
                <>
                  <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-text3">Queued</div>
                  {queued.map((t) => <TicketLine key={t.id} t={t} />)}
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function TicketLine({ t }: { t: Ticket }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-1 text-xs last:border-0">
      <span className="truncate">{t.detail}</span>
      <span className="ml-2 shrink-0 text-[10px] text-text3">{t.order?.orderNumber ?? `#${t.orderId}`}</span>
    </div>
  );
}

// ─── Schedule (3-week mould-usage calendar) ──────────────────────────────────
const STAGE_COLOR: Record<string, string> = {
  '4. Gel Coat': '#f97316',
  '5. Laminating': '#a855f7',
};
const DONE_STAGES = ['Despatched', '10. Ready to Despatch', 'Completed', 'Order Cancelled', 'Cancelled'];

function ScheduleTab({ moulds, tickets }: { moulds: Mould[]; tickets: Ticket[] }) {
  const [offset, setOffset] = useState(0);
  if (moulds.length === 0) return <div className="text-xs text-text3">No moulds yet.</div>;

  const base = mondayOf(new Date());
  const curKey = isoDate(base);
  const weeks = [-1, 0, 1].map((i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + (i + offset) * 7);
    return { date: d, key: isoDate(d) };
  });

  // A ticket's week: its wc, else the current week if it's actively assigned.
  const ticketWeek = (t: Ticket) => wcKey(t.wc) || curKey;
  const forCell = (m: Mould, key: string) =>
    tickets.filter((t) => t.mouldId === m.id && !DONE_STAGES.includes(t.status) && ticketWeek(t) === key);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Button onClick={() => setOffset((o) => o - 1)}>← Earlier</Button>
        <div className="text-xs font-semibold text-text2">
          3-week window centred on {offset === 0 ? 'this week' : `${Math.abs(offset)} week${Math.abs(offset) === 1 ? '' : 's'} ${offset > 0 ? 'ahead' : 'back'}`}
        </div>
        <Button onClick={() => setOffset((o) => o + 1)}>Later →</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[150px] border-b-2 border-border bg-surface2 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-text3">Mould</th>
              {weeks.map((w) => {
                const isThis = w.key === curKey;
                return (
                  <th
                    key={w.key}
                    className="min-w-[180px] border-b-2 px-2 py-2 text-center text-[11px] font-bold"
                    style={{ background: isThis ? 'var(--color-teal-l)' : 'var(--color-surface2)', borderColor: isThis ? 'var(--color-teal)' : 'var(--color-border)', color: isThis ? 'var(--color-teal)' : 'var(--color-text2)' }}
                  >
                    W/C {w.date.getDate()} {MONTHS[w.date.getMonth()]}{isThis ? ' • THIS WEEK' : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {moulds.map((m) => (
              <tr key={m.id}>
                <td className="sticky left-0 z-10 border-b border-border bg-surface2 px-3 py-2.5 align-top font-bold">
                  {m.ref}
                  {m.name && <div className="mt-0.5 text-[10px] font-normal text-text3">{m.name}</div>}
                </td>
                {weeks.map((w) => {
                  const cards = forCell(m, w.key);
                  return (
                    <td key={w.key} className="border-b border-border p-2 align-top">
                      {cards.length ? (
                        cards.map((t) => {
                          const col = STAGE_COLOR[t.status] ?? 'var(--color-teal)';
                          return (
                            <div key={t.id} className="mb-1 rounded px-2 py-1.5" style={{ background: `${col}18`, borderLeft: `3px solid ${col}` }}>
                              <div className="truncate text-[11px] font-bold">#{t.tn ?? 'TBC'} {t.detail}</div>
                              <div className="mt-0.5 truncate text-[9px] text-text3">
                                {t.status.replace(/^\d+\.\s*/, '')}{t.order?.orderNumber ? ` · ${t.order.orderNumber}` : ''}
                              </div>
                            </div>
                          );
                        })
                      ) : m.status === 'Maintenance' ? (
                        <div className="rounded bg-amber-l/50 px-2 py-2 text-center text-[10px] font-bold text-amber">⚠ Maintenance</div>
                      ) : (
                        <div className="rounded border border-dashed border-border px-2 py-2 text-center text-[10px] text-text3">free</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Unlinked catalogue (parts with no default mould) ────────────────────────
function UnlinkedTab({ catalogue, moulds }: { catalogue: Catalogue[]; moulds: Mould[] }) {
  const qc = useQueryClient();
  const [busyPart, setBusyPart] = useState<number | null>(null);
  const groups = catalogue
    .map((c) => ({ c, parts: c.parts.filter((p) => !p.mouldId) }))
    .filter((g) => g.parts.length > 0);

  /** Link a catalogue part to its default mould (ported from linkPartToMould). */
  async function link(catalogueId: number, partId: number, mouldId: number) {
    setBusyPart(partId);
    try {
      await apiClient.patch(`/api/catalogue/${catalogueId}/parts/${partId}`, { mouldId });
    } finally {
      setBusyPart(null);
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      qc.invalidateQueries({ queryKey: ['moulds'] });
    }
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface py-14 text-center">
        <div className="mb-2 text-4xl">✓</div>
        <div className="text-sm font-bold text-text2">All catalogue parts linked</div>
        <div className="mt-1 text-xs text-text3">Every part in the product catalogue has a default mould assigned.</div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-3 text-xs text-text3">
        {groups.reduce((n, g) => n + g.parts.length, 0)} part(s) across {groups.length} product(s) have no default mould.
        Linking them here means new tickets created from these products automatically know which mould to use.
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(({ c, parts }) => (
          <Card key={c.id} title={`${c.name}${c.code ? ` · ${c.code}` : ''}`}>
            <Table head={['Part', 'Drawing', 'Hrs', 'Link mould']}>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">{p.detail}</td>
                  <td className="px-3 py-1.5 text-text3">{p.drawing ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums text-text2">{p.hrs}</td>
                  <td className="px-3 py-1.5">
                    <select
                      value=""
                      disabled={busyPart === p.id}
                      onChange={(e) => e.target.value && void link(c.id, p.id, Number(e.target.value))}
                      className="rounded-md border border-teal bg-surface px-1.5 py-1 text-[11px] outline-none"
                    >
                      <option value="">— Select a mould —</option>
                      {moulds.map((m) => (
                        <option key={m.id} value={m.id}>{m.ref}{m.name ? ` (${m.name.slice(0, 40)})` : ''}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}

// ─── Unassigned (queue awaiting a mould) ─────────────────────────────────────
function UnassignedTab({ moulds, tickets }: { moulds: Mould[]; tickets: Ticket[] }) {
  const assign = useAssignMould();
  const unassigned = tickets.filter(
    (t) => t.status === QUEUE && !t.mouldId && t.type !== 'RAW' && t.type !== 'COMP',
  );

  return (
    <Card title={`Awaiting a mould (${unassigned.length})`}>
      <Table head={['Ticket', 'Order', 'Assign mould']}>
        {unassigned.length === 0 && (
          <tr><td colSpan={3} className="px-3 py-10 text-center text-xs text-text3">Nothing waiting for a mould. 🎉</td></tr>
        )}
        {unassigned.map((t) => (
          <tr key={t.id} className="border-b border-border last:border-0">
            <td className="px-3 py-2">{t.detail}</td>
            <td className="px-3 py-2 font-medium">{t.order?.orderNumber ?? `#${t.orderId}`}</td>
            <td className="px-3 py-2">
              <select
                value=""
                disabled={assign.isPending}
                onChange={(e) => e.target.value && assign.mutate({ ticketId: t.id, mouldId: Number(e.target.value) })}
                className="rounded-md border border-border2 bg-surface px-2 py-1 text-[11px] outline-none focus:border-teal"
              >
                <option value="">— assign to mould —</option>
                {moulds.filter((m) => m.status !== 'Maintenance').map((m) => (
                  <option key={m.id} value={m.id}>{m.ref}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
