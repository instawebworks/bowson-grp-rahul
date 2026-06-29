import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAssignMould, useMoulds, useTickets } from '../lib/hooks';
import { apiClient } from '../lib/api';
import { Button, Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { MouldForm } from '../components/MouldForm';
import { useAuth } from '../lib/auth';
import { downloadCsv, parseCsv } from '../lib/csv';
import type { Mould, Ticket } from '../lib/types';

type Tab = 'register' | 'board' | 'unassigned';
const ACTIVE_STAGES = ['4. Gel Coat', '5. Laminating'];
const QUEUE = '3. Queue - Awaiting Mould';

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
  const [tab, setTab] = useState<Tab>('register');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Mould | null>(null);
  const { canManage } = useAuth();

  const rows = moulds ?? [];
  const liveTickets = tickets ?? [];

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        tab === t ? 'bg-teal text-white' : 'bg-surface2 text-text2 hover:text-text'
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
        actions={
          <div className="flex items-center gap-1.5">
            {tabBtn('register', 'Register')}
            {tabBtn('board', 'Board')}
            {tabBtn('unassigned', 'Unassigned')}
            {canManage && <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Mould</Button>}
          </div>
        }
      />
      <Content>
        {tab === 'register' && (
          <RegisterTab rows={rows} isLoading={isLoading} error={error} onEdit={setEditing} />
        )}
        {tab === 'board' && <BoardTab moulds={rows} tickets={liveTickets} />}
        {tab === 'unassigned' && <UnassignedTab moulds={rows} tickets={liveTickets} />}
      </Content>
    </>
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
