import { useState } from 'react';
import { DESPATCH, ORDER_STATS, RESIN_TYPES, wcForDeadline } from '@bowson/shared';
import { useCustomers, useUpdateOrder, type OrderUpdateInput } from '../lib/hooks';
import type { Order } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

export function EditOrderForm({ order, onClose }: { order: Order; onClose: () => void }) {
  const { data: customers } = useCustomers();
  const update = useUpdateOrder(order.id);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<OrderUpdateInput>({
    status: order.status,
    customerId: order.customerId,
    siteName: order.siteName ?? '',
    despatch: order.despatch ?? null,
    resinType: order.resinType,
    deadline: order.deadline ? order.deadline.slice(0, 10) : '',
    wc: order.wc ?? '',
    notes: order.notes ?? '',
  });
  const set = <K extends keyof OrderUpdateInput>(k: K, v: OrderUpdateInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onDeadline(v: string) {
    // Auto-fill the target production week (Monday 2 weeks before the deadline).
    setForm((f) => ({ ...f, deadline: v || null, wc: v ? wcForDeadline(v) : f.wc }));
  }

  async function submit() {
    setError(null);
    try {
      await update.mutateAsync({
        ...form,
        siteName: form.siteName || null,
        notes: form.notes || null,
        deadline: form.deadline || null,
        wc: form.wc || null,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={`Edit Order ${order.orderNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <FormSection title="Order details">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {ORDER_STATS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </Field>
          <Field label="Customer">
            <select
              className={inputClass}
              value={form.customerId ?? ''}
              onChange={(e) => set('customerId', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— none —</option>
              {(customers ?? []).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Customer reference">
              <input className={inputClass} value={form.siteName ?? ''} onChange={(e) => set('siteName', e.target.value)} />
            </Field>
          </div>
          <Field label="Despatch method">
            <select className={inputClass} value={form.despatch ?? ''} onChange={(e) => set('despatch', e.target.value || null)}>
              <option value="">— none —</option>
              {DESPATCH.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </Field>
          <Field label="Resin type">
            <select className={inputClass} value={form.resinType} onChange={(e) => set('resinType', e.target.value)}>
              {RESIN_TYPES.map((r) => (<option key={r} value={r}>{r}</option>))}
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Scheduling">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline (delivery date)">
            <input type="date" className={inputClass} value={form.deadline ?? ''} onChange={(e) => onDeadline(e.target.value)} />
          </Field>
          <Field label="Target production week">
            <input className={inputClass} value={form.wc ?? ''} onChange={(e) => set('wc', e.target.value)} placeholder="Auto from deadline" />
          </Field>
        </div>
        <p className="mt-2 text-[11px] text-text3">Saving the target week applies it to this order's tickets (used by the Schedule).</p>
      </FormSection>

      <FormSection title="Notes">
        <textarea className={`${inputClass} min-h-16 resize-y`} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </FormSection>

      {error && <div className="mt-1 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
