import { useRef, useState } from 'react';
import { DESPATCH } from '@bowson/shared';
import { useCreateOrder, useCustomers, type CreateOrderInput } from '../lib/hooks';
import type { Customer } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';
import { CustomerForm } from './CustomerForm';

export function OrderForm({ onClose }: { onClose: () => void }) {
  const { data: customers } = useCustomers();
  const create = useCreateOrder();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateOrderInput & { themeImage?: string | null }>({
    orderNumber: '',
    customerId: null,
    siteName: '',
    despatch: null,
    resinType: 'Standard',
    notes: '',
    themeImage: null,
    isDraft: false,
  });
  const [imageName, setImageName] = useState<string | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      set('themeImage', reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function submit() {
    setError(null);
    if (!form.orderNumber.trim()) {
      setError('Order number is required.');
      return;
    }
    if (!form.despatch) {
      setError('Please select a despatch method.');
      return;
    }
    try {
      await create.mutateAsync({
        ...form,
        siteName: form.siteName || null,
        notes: form.notes || null,
        themeImage: form.themeImage || null,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Modal
        title="New Order — Step 1 of 2"
        sub="Enter order details"
        onClose={onClose}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create order'}
            </Button>
          </>
        }
      >
        <FormSection title="Order details">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Order number" required>
                <input
                  className={inputClass}
                  value={form.orderNumber}
                  onChange={(e) => set('orderNumber', e.target.value)}
                  placeholder="e.g. 25001"
                  autoFocus
                />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Customer">
                <div className="flex items-center gap-1.5">
                  <select
                    className={`${inputClass} flex-1`}
                    value={form.customerId ?? ''}
                    onChange={(e) => set('customerId', e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">— Select customer —</option>
                    {(customers ?? []).map((c: Customer) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Button onClick={() => setShowNewCustomer(true)} className="whitespace-nowrap">
                    + New customer
                  </Button>
                </div>
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Customer reference">
                <input
                  className={inputClass}
                  value={form.siteName ?? ''}
                  onChange={(e) => set('siteName', e.target.value)}
                  placeholder="e.g. Acme Park Site"
                />
              </Field>
            </div>
            <Field label="Despatch method" required>
              <select
                className={inputClass}
                value={form.despatch ?? ''}
                onChange={(e) => set('despatch', e.target.value || null)}
              >
                <option value="">— Select despatch method —</option>
                {DESPATCH.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Resin type">
              <select className={inputClass} value={form.resinType} onChange={(e) => set('resinType', e.target.value)}>
                <option value="Standard">Standard</option>
                <option value="M2">M2 — USA / Fire rated ⚠</option>
              </select>
            </Field>
          </div>
        </FormSection>

        <FormSection title="Notes">
          <textarea
            className={`${inputClass} min-h-20 resize-y`}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Delivery arrangements, client specific notes…"
          />
        </FormSection>

        <FormSection title="Colour theme image">
          <p className="mb-2.5 text-[11px] text-text3">
            Upload a photo or image showing the colour scheme / theme for this order.
          </p>
          {form.themeImage && (
            <div className="mb-2.5">
              <img
                src={form.themeImage}
                alt="Colour theme"
                className="max-h-48 max-w-full rounded-md border border-border"
              />
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <Button onClick={() => fileRef.current?.click()}>🖼 Choose image</Button>
            <span className="text-[11px] text-text3">{imageName ?? 'No image selected'}</span>
            {form.themeImage && (
              <button
                onClick={() => {
                  set('themeImage', null);
                  setImageName(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="text-[11px] text-red hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </FormSection>

        {error && <div className="mt-1 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
      </Modal>

      {/* Nested "+ New customer" popup — rendered last so it stacks above the order modal. */}
      {showNewCustomer && (
        <CustomerForm
          onClose={() => setShowNewCustomer(false)}
          onCreated={(c) => set('customerId', c.id)}
        />
      )}
    </>
  );
}
