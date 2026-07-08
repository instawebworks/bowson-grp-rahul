import { useRef, useState } from 'react';
import { generateSku } from '@bowson/shared';
import { useCatalogue, useCreateCatalogue, useMoulds, useUpdateCatalogue } from '../lib/hooks';
import type { Catalogue } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

interface PartRow { code: string; detail: string; mouldId: string; hrs: string }
interface HwRow { name: string; qty: string }

const DEFAULT_HW: HwRow[] = [
  { name: 'Bolt Pack', qty: '1' },
  { name: 'Slide Feet', qty: '4' },
  { name: 'Flange Supports', qty: '0' },
];

/** Create ("New Product") or edit a catalogue template. */
export function CatalogueForm({ onClose, onCreated, catalogue }: { onClose: () => void; onCreated?: (c: Catalogue) => void; catalogue?: Catalogue }) {
  const isEdit = !!catalogue;
  const create = useCreateCatalogue();
  const update = useUpdateCatalogue();
  const pending = create.isPending || update.isPending;
  const { data: moulds } = useMoulds();
  const { data: allCatalogue } = useCatalogue();
  // Other templates, for the SKU-uniqueness suffix check.
  const existingForSku = (allCatalogue ?? []).filter((c) => c.id !== catalogue?.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const [singlePiece, setSinglePiece] = useState(catalogue?.singlePiece ?? false);
  const [productCode, setProductCode] = useState(catalogue?.productCode ?? '');
  const [name, setName] = useState(catalogue?.name ?? '');
  const [code, setCode] = useState(catalogue?.code ?? '');
  const [unitPrice, setUnitPrice] = useState(String(catalogue?.unitPrice ?? 0));
  const [assemblyHrs, setAssemblyHrs] = useState(String(catalogue?.assemblyHrs ?? 0));
  const [gelCure, setGelCure] = useState(String(catalogue?.gelCureMins ?? 60));
  const [lamCure, setLamCure] = useState(String(catalogue?.lamCureMins ?? 120));
  const [parts, setParts] = useState<PartRow[]>(
    catalogue?.parts.map((p) => ({ code: p.drawing ?? '', detail: p.detail, mouldId: p.mouldId ? String(p.mouldId) : '', hrs: String(p.hrs) })) ?? [],
  );
  const [hardware, setHardware] = useState<HwRow[]>(
    catalogue ? catalogue.hardware.map((h) => ({ name: h.name, qty: String(h.qty) })) : DEFAULT_HW,
  );
  const [spec, setSpec] = useState<string | null>(catalogue?.specUrl ?? null);
  const [specName, setSpecName] = useState<string | null>(catalogue?.specUrl ? 'On file' : null);

  const setPart = (i: number, k: keyof PartRow, v: string) =>
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const setHw = (i: number, k: keyof HwRow, v: string) =>
    setHardware((hs) => hs.map((h, j) => (j === i ? { ...h, [k]: v } : h)));

  function onPickSpec(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setSpec(reader.result as string); setSpecName(file.name); };
    reader.readAsDataURL(file);
  }

  async function submit() {
    setError(null);
    if (!productCode.trim() || !name.trim()) {
      setError('Product code and name are required.');
      return;
    }
    const input = {
      productCode: productCode.trim(),
      name: name.trim(),
      code: code || null,
      unitPrice: Number(unitPrice) || 0,
      singlePiece,
      assemblyHrs: Number(assemblyHrs) || 0,
      gelCureMins: gelCure === '' ? null : Number(gelCure),
      lamCureMins: lamCure === '' ? null : Number(lamCure),
      specUrl: spec,
      parts: singlePiece
        ? []
        : parts.filter((p) => p.detail.trim()).map((p) => ({
            detail: p.detail.trim(),
            drawing: p.code || null,
            hrs: Number(p.hrs) || 0,
            mouldId: p.mouldId ? Number(p.mouldId) : null,
          })),
      hardware: hardware.filter((h) => h.name.trim()).map((h) => ({ name: h.name.trim(), qty: Number(h.qty) || 0 })),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: catalogue.id, input });
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
      title={isEdit ? `Edit ${catalogue.name}` : 'New Product'}
      sub={isEdit ? 'Update catalogue template' : 'Add to catalogue — Step 2 will resume when saved'}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Save to catalogue'}
          </Button>
        </>
      }
    >
      <FormSection title="Template details">
        <label className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface2 px-3 py-2.5">
          <input type="checkbox" checked={singlePiece} onChange={(e) => setSinglePiece(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="text-xs font-semibold">Single piece slide</span>
            <span className="block text-[11px] text-text3">Tick if this product is one moulded unit with no sub-assembly.</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field label="Product code" required>
              <input className={inputClass} value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="e.g. 10420" />
            </Field>
            <div className="mt-0.5 text-[10px] text-text3">From your master catalogue</div>
          </div>
          <Field label="Product name" required>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Twin Lane Wavy Slide" />
          </Field>
          <Field label="SKU">
            <div className="flex gap-1.5">
              <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TLW-2050" />
              <Button
                type="button"
                title="Auto-generate the SKU from the product name"
                onClick={() => setCode(generateSku(productCode, name, existingForSku))}
              >
                ⚙
              </Button>
            </div>
          </Field>
          <Field label="Sell price £">
            <input type="number" min={0} className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
        </div>

        {/* Assembly hours + cure times */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-[11px] font-semibold text-text2">
              {singlePiece ? 'Labour hours for whole slide' : 'Labour hours for assembly'}
            </span>
            <div className="flex items-center gap-2">
              <input type="number" min={0} className={`${inputClass} w-24`} value={assemblyHrs} onChange={(e) => setAssemblyHrs(e.target.value)} />
              <span className="text-[10px] leading-tight text-text3">
                {singlePiece
                  ? 'Total hours through all stages for this slide'
                  : 'Hours for COMP assembly stage (not including part fabrication)'}
              </span>
            </div>
          </div>
          <div className="border-l border-border pl-3">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-text3">Cure times (optional)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="mb-1 block text-[10px] font-semibold text-text2">Gel coat cure (mins)</span>
                <input type="number" min={0} className={inputClass} value={gelCure} onChange={(e) => setGelCure(e.target.value)} />
                <div className="mt-0.5 text-[10px] text-text3">Default: 60 mins</div>
              </div>
              <div>
                <span className="mb-1 block text-[10px] font-semibold text-text2">Laminating cure (mins)</span>
                <input type="number" min={0} className={inputClass} value={lamCure} onChange={(e) => setLamCure(e.target.value)} />
                <div className="mt-0.5 text-[10px] text-text3">Default: 120 mins</div>
              </div>
            </div>
          </div>
        </div>
      </FormSection>

      {!singlePiece && (
        <FormSection title="Parts / components">
          {parts.length === 0 && <div className="mb-2 text-xs text-text3">No parts yet — click Add part.</div>}
          {parts.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_2fr_130px_70px_auto] items-center gap-2">
              <input className={inputClass} value={p.code} onChange={(e) => setPart(i, 'code', e.target.value)} placeholder="Part code" />
              <input className={inputClass} value={p.detail} onChange={(e) => setPart(i, 'detail', e.target.value)} placeholder="Detail / description" />
              <select className={inputClass} value={p.mouldId} onChange={(e) => setPart(i, 'mouldId', e.target.value)} title="Default mould">
                <option value="">— No mould —</option>
                {(moulds ?? []).map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
              </select>
              <input type="number" min={0} className={inputClass} value={p.hrs} onChange={(e) => setPart(i, 'hrs', e.target.value)} placeholder="Hrs" />
              <button onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} className="rounded bg-red/10 px-1.5 py-1 text-xs text-red">✕</button>
            </div>
          ))}
          <Button onClick={() => setParts((ps) => [...ps, { code: '', detail: '', mouldId: '', hrs: '0' }])}>+ Add part</Button>
        </FormSection>
      )}

      <FormSection title="Specification document">
        <p className="mb-2 text-[11px] text-text3">Upload a PDF or image specification for this product.</p>
        <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={onPickSpec} />
        <div className="flex items-center gap-2">
          <Button onClick={() => fileRef.current?.click()}>📎 Choose file</Button>
          <span className="text-[11px] text-text3">{specName ?? 'No file selected'}</span>
          {spec && (
            <button onClick={() => { setSpec(null); setSpecName(null); if (fileRef.current) fileRef.current.value = ''; }} className="text-[11px] text-red hover:underline">Remove</button>
          )}
        </div>
      </FormSection>

      <FormSection title="Packing hardware checklist">
        <p className="mb-2 text-[11px] text-text3">Items that appear in the packing checklist at Packing stage.</p>
        {hardware.map((h, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_100px_auto] items-center gap-2">
            <input className={inputClass} value={h.name} onChange={(e) => setHw(i, 'name', e.target.value)} placeholder="Item name" />
            <input type="number" min={0} className={inputClass} value={h.qty} onChange={(e) => setHw(i, 'qty', e.target.value)} />
            <button onClick={() => setHardware((hs) => hs.filter((_, j) => j !== i))} className="rounded bg-red/10 px-1.5 py-1 text-xs text-red">✕</button>
          </div>
        ))}
        <Button onClick={() => setHardware((hs) => [...hs, { name: '', qty: '1' }])}>+ Add item</Button>
      </FormSection>

      {error && <div className="mt-1 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
