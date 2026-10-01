import { useState } from 'react';
import { useCreateCataloguePart, useMoulds, useUpdateCataloguePart } from '../lib/hooks';
import { r2 } from '../lib/catalogue';
import type { CataloguePart } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

/**
 * Create / edit one library part — a unique moulded piece with its own code,
 * mould, Laminating / Finishing hours and price. Products are then built from
 * these (client: "create a single piece of each unique part first").
 */
export function PartForm({
  part,
  onClose,
  onSaved,
}: {
  part?: CataloguePart;
  onClose: () => void;
  /** Called with the saved part (the caller may want to add it to a product). */
  onSaved?: (p: CataloguePart) => void;
}) {
  const isEdit = !!part;
  const create = useCreateCataloguePart();
  const update = useUpdateCataloguePart();
  const { data: moulds } = useMoulds();
  const pending = create.isPending || update.isPending;

  const [code, setCode] = useState(part?.drawing ?? '');
  const [detail, setDetail] = useState(part?.detail ?? '');
  const [mouldId, setMouldId] = useState(part?.mouldId ? String(part.mouldId) : '');
  const [lam, setLam] = useState(String(part?.lamHrs ?? part?.hrs ?? 0));
  const [fin, setFin] = useState(String(part?.finHrs ?? 0));
  const [price, setPrice] = useState(String(part?.price ?? 0));
  const [error, setError] = useState<string | null>(null);

  const lamN = Number(lam) || 0;
  const finN = Number(fin) || 0;

  async function submit() {
    setError(null);
    if (!detail.trim()) {
      setError('A part needs a detail / description.');
      return;
    }
    const input = {
      detail: detail.trim(),
      drawing: code.trim() || null,
      mouldId: mouldId ? Number(mouldId) : null,
      lamHrs: lamN,
      finHrs: finN,
      price: Number(price) || 0,
    };
    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: part.id, input })
        : await create.mutateAsync(input);
      onSaved?.(saved);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title={isEdit ? `Edit part — ${part.drawing ?? part.detail}` : 'New library part'}
      sub={isEdit ? 'Changes apply to every product built from this part' : 'One unique moulded piece — products are built from these'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save part' : 'Add to library'}
          </Button>
        </>
      }
    >
      <FormSection title="Part">
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Field label="Part code">
            <input className={inputClass} value={code} autoFocus={!isEdit} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 12349" />
          </Field>
          <Field label="Detail / description" required>
            <input className={inputClass} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="e.g. 1100R 90 DEGREE TUBE SECTION" />
          </Field>
        </div>
        <div className="mt-0.5 text-[10px] text-text3">Code + detail together identify the part — the same mould code can carry different cuts.</div>
        <div className="mt-3">
          <Field label="Mould">
            <select className={inputClass} value={mouldId} onChange={(e) => setMouldId(e.target.value)}>
              <option value="">— No mould —</option>
              {(moulds ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.ref}{m.name ? ` (${m.name.slice(0, 40)})` : ''}</option>
              ))}
            </select>
          </Field>
          <div className="mt-0.5 text-[10px] text-text3">The mould this piece is made on. New tickets inherit it automatically.</div>
        </div>
      </FormSection>

      <FormSection title="Labour & price (per whole mould)">
        <div className="grid grid-cols-4 gap-3">
          <Field label="Laminating h">
            <input type="number" min={0} step="0.25" className={inputClass} value={lam} onChange={(e) => setLam(e.target.value)} title="At the mould: prep, gel, laminate" />
          </Field>
          <Field label="Finishing h">
            <input type="number" min={0} step="0.25" className={inputClass} value={fin} onChange={(e) => setFin(e.target.value)} title="Trim → packing" />
          </Field>
          <Field label="Total h">
            <div className={`${inputClass} bg-surface2 font-semibold tabular-nums`}>{r2(lamN + finN)}</div>
          </Field>
          <Field label="Price £">
            <input type="number" min={0} step="0.01" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
        </div>
        <div className="mt-1 text-[10px] text-text3">
          A product using this piece at ½ a mould takes half these hours and half this price.
        </div>
      </FormSection>

      {error && <div className="mt-1 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
