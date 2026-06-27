import { useState } from 'react';
import { useCreateCustomer, useUpdateCustomer, type CustomerFormInput } from '../lib/hooks';
import type { Customer } from '../lib/types';
import { Button, Field, Modal, inputClass } from './ui';

/** Create (no `customer`) or edit (with `customer`) a customer. */
export function CustomerForm({
  customer,
  onClose,
  onCreated,
}: {
  customer?: Customer;
  onClose: () => void;
  onCreated?: (created: Customer) => void;
}) {
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<CustomerFormInput>({
    name: customer?.name ?? '',
    contact: customer?.contact ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    region: customer?.region ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof CustomerFormInput>(k: K, v: CustomerFormInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    if (!form.name.trim()) {
      setError('Name is required.');
      return;
    }
    const input: CustomerFormInput = {
      name: form.name.trim(),
      contact: form.contact || null,
      phone: form.phone || null,
      email: form.email || null,
      address: form.address || null,
      region: form.region || null,
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: customer.id, input });
      } else {
        const created = await create.mutateAsync(input);
        onCreated?.(created);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${customer.name}` : 'New Customer'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>
        </div>
        <Field label="Contact">
          <input className={inputClass} value={form.contact ?? ''} onChange={(e) => set('contact', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputClass}
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
          />
        </Field>
        <Field label="Region">
          <input className={inputClass} value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} />
        </Field>
        <div className="col-span-2">
          <Field label="Address">
            <textarea
              className={`${inputClass} min-h-16 resize-y`}
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
        </div>
      </div>
      {error && <div className="mt-3 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
