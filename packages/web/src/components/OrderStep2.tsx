import { useMemo, useRef, useState } from 'react';
import { RESIN_TYPES, formatWc, mondayOf } from '@bowson/shared';
import {
  useAddTicket,
  useCatalogue,
  useDeleteTicket,
  useOrder,
  useSchedule,
  useUpdateOrder,
} from '../lib/hooks';
import { Button, Field, FormSection, inputClass } from './ui';
import { CatalogueForm } from './CatalogueForm';
import type { Catalogue, Ticket } from '../lib/types';

export function OrderStep2({
  orderId,
  orderNumber,
  resin: initialResin,
  onDone,
}: {
  orderId: number;
  orderNumber: string;
  resin: string;
  onDone: () => void;
}) {
  const { data: order } = useOrder(orderId);
  const { data: catalogue } = useCatalogue();
  const { data: schedule } = useSchedule();
  const add = useAddTicket(orderId);
  const del = useDeleteTicket(orderId);
  const updateOrder = useUpdateOrder(orderId);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Catalogue | null>(null);
  const [colour, setColour] = useState('');
  const [resin, setResin] = useState(initialResin || 'Standard');
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ type: 'MADE', detail: '', qty: 1, unitPrice: 0 });
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (catalogue ?? [])
      .filter((c) => [c.name, c.code, c.productCode].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 6);
  }, [catalogue, query]);

  const tickets = order?.tickets ?? [];
  const tops = tickets.filter((t) => t.compParentId == null);
  const partsOf = (id: number) => tickets.filter((t) => t.compParentId === id);
  const totalHrs = tickets.reduce((s, t) => s + (t.hrs || 0), 0);
  const weeklyCap = schedule?.weeklyCapacity ?? 0;
  const weeksNeeded = weeklyCap > 0 ? Math.max(1, Math.ceil(totalHrs / weeklyCap)) : null;
  const suggestedWc = formatWc(mondayOf(new Date()));

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function addFromCatalogue() {
    setError(null);
    if (!selected) {
      setError('Search and select a product first.');
      return;
    }
    try {
      await add.mutateAsync({
        fromCatalogueId: selected.id,
        colour: colour || undefined,
        resin,
        themeImage: image || undefined,
      });
      // Reset for the next slide (keep resin).
      setSelected(null);
      setQuery('');
      setColour('');
      setImage(null);
      setImageName(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function addManual() {
    setError(null);
    if (!manual.detail.trim()) {
      setError('Enter a detail for the manual ticket.');
      return;
    }
    try {
      await add.mutateAsync({
        type: manual.type,
        detail: manual.detail.trim(),
        qty: manual.qty,
        unitPrice: manual.unitPrice,
      });
      setManual({ type: 'MADE', detail: '', qty: 1, unitPrice: 0 });
      setShowManual(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal bg-teal-l/50 px-3 py-2 text-xs">
        <span className="font-semibold text-teal">✓ Order {orderNumber} created</span>
        <span className="text-teal">· {resin} Resin</span>
      </div>

      <FormSection title="Add from product catalogue">
        <Field label="Search product catalogue">
          <input
            className={inputClass}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Type to search — name, code or SKU…"
            autoFocus
          />
        </Field>
        <div className="mt-1 flex justify-end">
          <Button onClick={() => setShowNewProduct(true)}>+ New product</Button>
        </div>
        {matches.length > 0 && !selected && (
          <div className="mt-1 overflow-hidden rounded-md border border-border">
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelected(c); setQuery(c.name); }}
                className="flex w-full items-center justify-between border-b border-border px-3 py-1.5 text-left text-xs last:border-0 hover:bg-teal-l/40"
              >
                <span><span className="font-semibold">{c.name}</span> <span className="text-text3">· {c.code ?? c.productCode}</span></span>
                <span className="text-text3">{c.parts.length > 1 ? `${c.parts.length} parts` : '1 piece'}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="mt-1 rounded-md bg-surface2 px-3 py-1.5 text-xs">
            Selected: <span className="font-semibold">{selected.name}</span>
            <button onClick={() => { setSelected(null); setQuery(''); }} className="ml-2 text-text3 hover:text-red">✕</button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Colour / RAL / theme">
            <input className={inputClass} value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. RAL 5002 Dark Blue" />
          </Field>
          <Field label="Resin type">
            <select className={inputClass} value={resin} onChange={(e) => setResin(e.target.value)}>
              {RESIN_TYPES.map((r) => <option key={r} value={r}>{r === 'M2' ? 'M2 — USA / Fire rated ⚠' : r}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-[11px] font-semibold text-text2">Slide image / colour reference photo</span>
          {image && <img src={image} alt="reference" className="mb-2 max-h-32 rounded-md border border-border" />}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <Button onClick={() => fileRef.current?.click()}>🖼 Upload image</Button>
            <span className="text-[11px] text-text3">{imageName ?? 'No image — each slide can have its own'}</span>
          </div>
        </div>

        <div className="mt-3">
          <Button variant="primary" onClick={addFromCatalogue} disabled={add.isPending || !selected}>
            {add.isPending ? 'Adding…' : 'Add tickets from catalogue'}
          </Button>
        </div>
      </FormSection>

      <FormSection title="Or add a custom ticket manually">
        {!showManual ? (
          <Button onClick={() => setShowManual(true)}>+ Add manual ticket</Button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputClass} value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}>
                <option value="MADE">MADE (manufactured)</option>
                <option value="RAW">RAW (bought-in)</option>
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" min={1} className={inputClass} value={manual.qty} onChange={(e) => setManual({ ...manual, qty: Number(e.target.value) || 1 })} />
            </Field>
            <div className="col-span-2">
              <Field label="Detail" required>
                <input className={inputClass} value={manual.detail} onChange={(e) => setManual({ ...manual, detail: e.target.value })} placeholder="Item description" />
              </Field>
            </div>
            <Field label="Unit price (£)">
              <input type="number" min={0} className={inputClass} value={manual.unitPrice} onChange={(e) => setManual({ ...manual, unitPrice: Number(e.target.value) || 0 })} />
            </Field>
            <div className="col-span-2 flex gap-2">
              <Button variant="primary" onClick={addManual} disabled={add.isPending}>Add ticket</Button>
              <Button onClick={() => setShowManual(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title={`Tickets on this order (${tickets.length})`}>
        {tops.length === 0 ? (
          <div className="text-xs text-text3">No tickets yet — add a product above.</div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            {tops.map((t) => (
              <div key={t.id}>
                <TicketRow t={t} onRemove={() => del.mutate(t.id)} removing={del.isPending} />
                {partsOf(t.id).map((p) => <TicketRow key={p.id} t={p} indent />)}
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Suggested Schedule">
        {tickets.length === 0 ? (
          <div className="text-xs text-text3">Add tickets above to see a suggested schedule and deadline.</div>
        ) : (
          <div className="flex items-center justify-between gap-3 text-xs">
            <div>
              <div><span className="text-text3">Total build hours:</span> <span className="font-semibold">{Math.round(totalHrs * 10) / 10}h</span></div>
              {weeksNeeded != null && (
                <div className="mt-0.5">≈ {weeksNeeded} week{weeksNeeded === 1 ? '' : 's'} at current capacity · suggested target week <span className="font-semibold">{suggestedWc}</span></div>
              )}
            </div>
            <Button onClick={() => updateOrder.mutate({ wc: suggestedWc })} disabled={updateOrder.isPending}>
              Set target week
            </Button>
          </div>
        )}
      </FormSection>

      {error && <div className="mb-2 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}

      {showNewProduct && (
        <CatalogueForm
          onClose={() => setShowNewProduct(false)}
          onCreated={(c) => { setSelected(c); setQuery(c.name); }}
        />
      )}
    </div>
  );
}

function TicketRow({ t, indent, onRemove, removing }: { t: Ticket; indent?: boolean; onRemove?: () => void; removing?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-xs last:border-0">
      <div className={indent ? 'pl-5 text-text2' : ''}>
        <span className="mr-1.5 rounded px-1 py-0.5 text-[9px] font-bold" style={{ backgroundColor: '#f7f5f2', color: '#5c574f' }}>{t.type}</span>
        {t.detail}
        {t.spec && <span className="ml-1.5 text-[10px] text-text3">{t.spec}</span>}
      </div>
      {onRemove && (
        <button onClick={onRemove} disabled={removing} className="text-[11px] text-text3 hover:text-red">Remove</button>
      )}
    </div>
  );
}
