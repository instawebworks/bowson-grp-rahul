import { useState } from 'react';
import { STAGE_SKILLS } from '@bowson/shared';
import { useCreateOperative, useDeleteOperative, useUpdateOperative, type OperativeFormInput } from '../lib/hooks';
import type { Operative } from '../lib/types';
import { Button, ConfirmDialog, Field, Modal, inputClass } from './ui';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Build a 7-entry Mon–Sun default pattern from a per-day default (weekend off). */
function defaultPattern(perDay: number): number[] {
  return [perDay, perDay, perDay, perDay, perDay, 0, 0];
}

export function OperativeForm({ operative, onClose }: { operative?: Operative; onClose: () => void }) {
  const isEdit = !!operative;
  const create = useCreateOperative();
  const update = useUpdateOperative();
  const del = useDeleteOperative();
  const pending = create.isPending || update.isPending;

  const [name, setName] = useState(operative?.name ?? '');
  const [skills, setSkills] = useState<string[]>(operative?.skills ?? []);
  const [defaultHrs, setDefaultHrs] = useState<number | ''>(operative?.defaultHrs ?? '');
  const [payRate, setPayRate] = useState<number | ''>(operative?.payRate ?? '');
  const [pin, setPin] = useState(operative?.pin ?? '');
  const [dayPattern, setDayPattern] = useState<number[]>(
    operative?.dayPattern && operative.dayPattern.length >= 7
      ? operative.dayPattern.slice(0, 7)
      : defaultPattern(operative?.defaultHrs ?? 7.5),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const toggleSkill = (s: string) =>
    setSkills((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  const setDay = (i: number, v: number) =>
    setDayPattern((cur) => cur.map((h, j) => (j === i ? Math.max(0, v) : h)));

  const weekTotal = dayPattern.reduce((a, b) => a + b, 0);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (pin && !/^\d{4,8}$/.test(pin)) {
      setError('Login PIN must be 4-8 digits (leave empty for the default 1234).');
      return;
    }
    const input: OperativeFormInput = {
      name: name.trim(),
      skills,
      defaultHrs: defaultHrs === '' ? null : Number(defaultHrs),
      dayPattern,
      payRate: payRate === '' ? null : Number(payRate),
      pin: pin || null,
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
          {isEdit && (
            <Button variant="danger" disabled={del.isPending} onClick={() => setConfirmRemove(true)}>
              Remove operative
            </Button>
          )}
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
        <Field label="Hourly rate £">
          <input
            type="number"
            min={0}
            step={0.5}
            className={inputClass}
            value={payRate}
            onChange={(e) => setPayRate(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 14.50"
          />
        </Field>
        <div>
          <Field label="Login PIN">
            <input
              className={inputClass}
              value={pin ?? ''}
              inputMode="numeric"
              maxLength={8}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="1234 (default)"
            />
          </Field>
          <div className="mt-0.5 text-[10px] text-text3">4-8 digits — used on the shop-floor sign-in screen.</div>
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-text2">Standard weekly pattern</span>
          <span className="text-[10px] text-text3">{weekTotal}h / week</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1">
              <span className={`text-[10px] font-semibold ${(dayPattern[i] ?? 0) === 0 ? 'text-text3' : 'text-text2'}`}>{d}</span>
              <input
                type="number"
                min={0}
                step={0.5}
                value={dayPattern[i] ?? 0}
                onChange={(e) => setDay(i, e.target.value === '' ? 0 : Number(e.target.value))}
                className={`${inputClass} px-1 py-1 text-center text-[11px]`}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDayPattern(defaultPattern(defaultHrs === '' ? 7.5 : Number(defaultHrs)))}
          className="mt-1.5 text-[10px] text-teal hover:underline"
        >
          Reset to Mon–Fri {defaultHrs === '' ? 7.5 : Number(defaultHrs)}h (weekend off)
        </button>
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

      {confirmRemove && isEdit && (
        <ConfirmDialog
          title={`Remove ${operative.name}?`}
          message={
            <>
              <strong>{operative.name}</strong> will be removed from the team and their tickets become
              unassigned. Recorded time history is kept. This cannot be undone.
            </>
          }
          confirmLabel="Remove operative"
          busy={del.isPending}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => {
            try {
              await del.mutateAsync(operative.id);
              setConfirmRemove(false);
              onClose();
            } catch (e) {
              setConfirmRemove(false);
              setError((e as Error).message);
            }
          }}
        />
      )}
    </Modal>
  );
}
