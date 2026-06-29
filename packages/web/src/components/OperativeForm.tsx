import { useState } from 'react';
import { STAGE_SKILLS } from '@bowson/shared';
import { useCreateOperative, useUpdateOperative, type OperativeFormInput } from '../lib/hooks';
import type { Operative } from '../lib/types';
import { Button, Field, Modal, inputClass } from './ui';

export function OperativeForm({ operative, onClose }: { operative?: Operative; onClose: () => void }) {
  const isEdit = !!operative;
  const create = useCreateOperative();
  const update = useUpdateOperative();
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState(operative?.name ?? '');
  const [skills, setSkills] = useState<string[]>(operative?.skills ?? []);
  const [defaultHrs, setDefaultHrs] = useState<number | ''>(operative?.defaultHrs ?? '');
  const [error, setError] = useState<string | null>(null);

  const toggleSkill = (s: string) =>
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    const input: OperativeFormInput = {
      name: name.trim(),
      skills,
      defaultHrs: defaultHrs === '' ? null : Number(defaultHrs),
    };
    try {
      if (isEdit) await update.mutateAsync({ id: operative.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit ${operative.name}` : 'New Operative'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create operative'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" required>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Default hrs / day">
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={defaultHrs}
            onChange={(e) => setDefaultHrs(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="7.5"
          />
        </Field>
      </div>
      <div className="mt-3">
        <span className="mb-1 block text-[11px] font-semibold text-text2">Skills</span>
        <div className="flex flex-wrap gap-1.5">
          {STAGE_SKILLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSkill(s)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                skills.includes(s)
                  ? 'border-teal bg-teal-l font-semibold text-teal'
                  : 'border-border bg-surface2 text-text2 hover:text-text'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="mt-3 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
