import { useMemo, useState } from 'react';
import { useCustomers, useOrders } from '../lib/hooks';
import { useOpenOrder } from '../lib/useOpenOrder';
import { Button, Content, Modal, PageHeader, StatusPill, inputClass } from '../components/ui';
import { CustomerForm } from '../components/CustomerForm';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import type { Customer, Order } from '../lib/types';

/** Customer detail — contact info + that customer's clickable order list
 * (ported from openCustDetail); "Edit contact" opens the edit form. */
function CustomerDetail({
  customer,
  orders,
  canManage,
  onEdit,
  onClose,
}: {
  customer: Customer;
  orders: Order[];
  canManage: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const openOrder = useOpenOrder();
  return (
    <Modal
      title={customer.name}
      sub={customer.region ?? undefined}
      onClose={onClose}
      footer={
        <>
          {canManage && <Button onClick={onEdit}>✎ Edit contact</Button>}
          <Button variant="primary" onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2.5 text-xs">
        {[
          ['Contact', customer.contact],
          ['Phone', customer.phone],
          ['Email', customer.email],
          ['Region', customer.region],
        ].map(([label, val]) => (
          <div key={label}>
            <div className="text-[9px] font-bold uppercase tracking-wide text-text3">{label}</div>
            <div className="mt-0.5 font-medium">{val || '—'}</div>
          </div>
        ))}
        <div className="col-span-2">
          <div className="text-[9px] font-bold uppercase tracking-wide text-text3">Address</div>
          <div className="mt-0.5 whitespace-pre-line font-medium">{customer.address || '—'}</div>
        </div>
      </div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text3">Orders ({orders.length})</div>
      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface2 py-5 text-center text-xs text-text3">No orders yet.</div>
      ) : (
        <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-lg border border-border">
          {orders.map((o) => (
            <button
              key={o.id}
              onClick={() => { onClose(); openOrder(o.id); }}
              className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-teal-l/40"
            >
              <span className="font-bold text-teal">{o.orderNumber}</span>
              <span className="max-w-36 truncate text-text2">{o.siteName ?? '—'}</span>
              <StatusPill status={o.status} />
              <span className="ml-auto tabular-nums text-text2">{money(o.value)}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export function Customers() {
  const { data, isLoading, error } = useCustomers();
  const { data: orders } = useOrders();
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Customer | null>(null);
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
      {detail && !editing && (
        <CustomerDetail
          customer={detail}
          orders={(orders ?? []).filter((o) => o.customerId === detail.id)}
          canManage={canManage}
          onEdit={() => { setEditing(detail); setDetail(null); }}
          onClose={() => setDetail(null)}
        />
      )}
      <PageHeader
        title="Customers"
        sub={`${rows.length} customer${rows.length === 1 ? '' : 's'}`}
        actions={canManage ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Customer</Button> : undefined}
        globalActions={false}
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
                onClick={() => setDetail(c)}
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
