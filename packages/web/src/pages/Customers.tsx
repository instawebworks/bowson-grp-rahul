import { useMemo, useState } from 'react';
import { useCustomers, useOrders } from '../lib/hooks';
import { Button, Content, PageHeader, inputClass } from '../components/ui';
import { CustomerForm } from '../components/CustomerForm';
import { useAuth } from '../lib/auth';
import type { Customer } from '../lib/types';

export function Customers() {
  const { data, isLoading, error } = useCustomers();
  const { data: orders } = useOrders();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [q, setQ] = useState('');
  const { canManage } = useAuth();

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const o of orders ?? []) if (o.customerId != null) m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    return m;
  }, [orders]);

  const rows = (data ?? []).filter((c) =>
    !q.trim() || [c.name, c.contact, c.region].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <>
      {showCreate && <CustomerForm onClose={() => setShowCreate(false)} />}
      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Customers"
        sub={`${rows.length} customer${rows.length === 1 ? '' : 's'}`}
        actions={canManage ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Customer</Button> : undefined}
      />
      <Content>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className={`${inputClass} mb-3 max-w-xs`} />
        {isLoading && <div className="text-xs text-text3">Loading…</div>}
        {error && <div className="text-xs text-text3">Could not load — {(error as Error).message}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border2 bg-surface p-8 text-center text-xs text-text3">No customers yet.</div>
        )}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((c) => {
            const n = counts.get(c.id) ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setEditing(c)}
                className="rounded-lg border border-border bg-surface p-3.5 text-left transition hover:border-teal"
              >
                <div className="truncate text-sm font-bold">{c.name}</div>
                {c.contact && <div className="mt-0.5 text-[11px] text-text2">{c.contact}</div>}
                <div className="mt-0.5 text-[10px] text-text3">{c.region ?? '—'}</div>
                <div className="mt-2 text-[11px] font-semibold text-teal">{n} order{n === 1 ? '' : 's'}</div>
              </button>
            );
          })}
        </div>
      </Content>
    </>
  );
}
