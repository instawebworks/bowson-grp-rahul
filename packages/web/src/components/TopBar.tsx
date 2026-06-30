import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { DESPATCH, RESIN_TYPES } from '@bowson/shared';
import { useAuth } from '../lib/auth';
import { useOrders } from '../lib/hooks';
import { apiClient } from '../lib/api';
import { parseCsv } from '../lib/csv';
import { Button, Field, Modal, inputClass } from './ui';
import { OrderForm } from './OrderForm';
import { AddTicketModal } from './AddTicketModal';

type Popup = null | 'order' | 'ticket' | 'import';

export function TopBar() {
  const { canManage } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [popup, setPopup] = useState<Popup>(null);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-surface px-4 py-2">
      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticket # or order / site…"
          className="w-full max-w-xs rounded-md border border-border2 bg-surface2 px-2.5 py-1.5 text-xs outline-none focus:border-teal"
        />
      </form>

      {canManage && (
        <div className="flex items-center gap-1.5">
          <Button onClick={() => setPopup('import')}>⭱ Import CSV</Button>
          <Button onClick={() => setPopup('ticket')}>+ Ticket</Button>
          <Button variant="primary" onClick={() => setPopup('order')}>+ Order</Button>
        </div>
      )}
      <span className="ml-1 flex items-center gap-1 text-[10px] text-text3" title="Changes are saved to the database">
        ✓ Saved
      </span>

      {popup === 'order' && <OrderForm onClose={() => setPopup(null)} />}
      {popup === 'ticket' && <AddTicketGlobal onClose={() => setPopup(null)} />}
      {popup === 'import' && <ImportOrdersModal onClose={() => setPopup(null)} />}
    </header>
  );
}

/** + Ticket: pick an order, then add a ticket to it. */
function AddTicketGlobal({ onClose }: { onClose: () => void }) {
  const { data: orders } = useOrders();
  const [orderId, setOrderId] = useState<number | null>(null);

  if (orderId) return <AddTicketModal orderId={orderId} onClose={onClose} />;

  return (
    <Modal title="Add ticket" sub="Choose an order" onClose={onClose} footer={<Button onClick={onClose}>Cancel</Button>}>
      <Field label="Order" required>
        <select
          className={inputClass}
          defaultValue=""
          onChange={(e) => e.target.value && setOrderId(Number(e.target.value))}
          autoFocus
        >
          <option value="">— Select order —</option>
          {(orders ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.orderNumber}{o.customer?.name ? ` · ${o.customer.name}` : ''}
            </option>
          ))}
        </select>
      </Field>
    </Modal>
  );
}

/** Import CSV: bulk-create orders (orderNumber required; site/despatch/resin/notes optional). */
function ImportOrdersModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setResult(null);
    const rows = parseCsv(await file.text());
    let ok = 0;
    let fail = 0;
    for (const r of rows) {
      const orderNumber = (r.orderNumber ?? r['Order #'] ?? r.order_number ?? '').trim();
      if (!orderNumber) continue;
      try {
        await apiClient.post('/api/orders', {
          orderNumber,
          siteName: r.siteName ?? r.site ?? r.Site ?? null,
          despatch: (DESPATCH as readonly string[]).includes(r.despatch ?? '') ? r.despatch : null,
          resinType: (RESIN_TYPES as readonly string[]).includes(r.resinType ?? '') ? r.resinType : 'Standard',
          notes: r.notes ?? null,
          isDraft: false,
        });
        ok++;
      } catch {
        fail++;
      }
    }
    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    setBusy(false);
    setResult(`Imported ${ok} order${ok === 1 ? '' : 's'}${fail ? `, ${fail} skipped (duplicate/invalid)` : ''}.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <Modal
      title="Import orders from CSV"
      onClose={onClose}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      <p className="mb-3 text-xs text-text3">
        CSV columns: <code>orderNumber</code> (required), plus optional <code>siteName</code>,
        <code> despatch</code>, <code>resinType</code>, <code>notes</code>.
      </p>
      <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFile} />
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? 'Importing…' : '⭱ Choose CSV file'}
      </Button>
      {result && <div className="mt-3 rounded-md bg-teal-l/50 px-3 py-2 text-xs text-teal">{result}</div>}
    </Modal>
  );
}
