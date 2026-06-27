import { useState } from 'react';
import { RESIN_TYPES } from '@bowson/shared';
import { useAddTicket, useCatalogue, type AddTicketInput } from '../lib/hooks';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

type Mode = 'catalogue' | 'manual';

export function AddTicketModal({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { data: catalogue } = useCatalogue();
  const add = useAddTicket(orderId);
  const [mode, setMode] = useState<Mode>('catalogue');
  const [error, setError] = useState<string | null>(null);

  // catalogue mode
  const [catId, setCatId] = useState<number | ''>('');
  const [colour, setColour] = useState('');
  const [resin, setResin] = useState('Standard');

  // manual mode
  const [type, setType] = useState('MADE');
  const [detail, setDetail] = useState('');
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);

  async function submit() {
    setError(null);
    let input: AddTicketInput;
    if (mode === 'catalogue') {
      if (!catId) {
        setError('Please choose a product.');
        return;
      }
      input = { fromCatalogueId: Number(catId), colour: colour || undefined, resin };
    } else {
      if (!detail.trim()) {
        setError('Detail is required.');
        return;
      }
      input = { type, detail: detail.trim(), qty, unitPrice };
    }
    try {
      await add.mutateAsync(input);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
        mode === m ? 'bg-teal text-white' : 'bg-surface2 text-text2 hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Modal
      title="Add ticket"
      sub="Step 2 — add items to this order"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add ticket'}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex gap-1.5">
        {tab('catalogue', 'From catalogue')}
        {tab('manual', 'Manual item')}
      </div>

      {mode === 'catalogue' ? (
        <FormSection title="Catalogue product">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Product" required>
                <select className={inputClass} value={catId} onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">— Select product —</option>
                  {(catalogue ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code ?? c.productCode}) — {c.parts.length} part{c.parts.length === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Colour / theme">
              <input className={inputClass} value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. Ocean Blue" />
            </Field>
            <Field label="Resin type">
              <select className={inputClass} value={resin} onChange={(e) => setResin(e.target.value)}>
                {RESIN_TYPES.map((r) => (
                  <option key={r} value={r}>{r === 'M2' ? 'M2 — USA / Fire rated ⚠' : r}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-2 text-[11px] text-text3">
            Multi-part products create a COMP ticket with one PART per piece; single-part products create one MADE ticket.
          </p>
        </FormSection>
      ) : (
        <FormSection title="Manual item">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
                <option value="MADE">MADE (manufactured)</option>
                <option value="RAW">RAW (bought-in)</option>
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" min={1} className={inputClass} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
            </Field>
            <div className="col-span-2">
              <Field label="Detail" required>
                <input className={inputClass} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Item description" />
              </Field>
            </div>
            <Field label="Unit price (£)">
              <input type="number" min={0} className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} />
            </Field>
          </div>
        </FormSection>
      )}

      {error && <div className="mt-3 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
