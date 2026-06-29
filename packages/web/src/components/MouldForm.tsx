import { useState } from 'react';
import { useCreateMould, useUpdateMould, type MouldFormInput } from '../lib/hooks';
import type { Mould } from '../lib/types';
import { Button, Field, Modal, inputClass } from './ui';

export function MouldForm({ mould, onClose }: { mould?: Mould; onClose: () => void }) {
  const isEdit = !!mould;
  const create = useCreateMould();
  const update = useUpdateMould();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState<MouldFormInput>({
    ref: mould?.ref ?? '',
    name: mould?.name ?? '',
    qty: mould?.qty ?? 1,
    status: mould?.status ?? 'Active',
    notes: mould?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MouldFormInput>(k: K, v: MouldFormInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setError(null);
    if (!form.ref.trim()) {
      setError('Reference is required.');
      return;
    }
    const input: MouldFormInput = { ...form, ref: form.ref.trim(), name: form.name || null, notes: form.notes || null };
    try {
      if (isEdit) await update.mutateAsync({ id: mould.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${mould.ref}` : 'New Mould'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create mould'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reference" required>
          <input className={inputClass} value={form.ref} onChange={(e) => set('ref', e.target.value)} placeholder="e.g. M-004" autoFocus />
        </Field>
        <Field label="Capacity (slots)">
          <input type="number" min={1} className={inputClass} value={form.qty} onChange={(e) => set('qty', Number(e.target.value) || 1)} />
        </Field>
        <div className="col-span-2">
          <Field label="Name">
            <input className={inputClass} value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} />
          </Field>
        </div>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Maintenance">Maintenance</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea className={`${inputClass} min-h-16 resize-y`} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </div>
      {error && <div className="mt-3 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
