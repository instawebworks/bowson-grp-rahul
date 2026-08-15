import { useRef, useState } from 'react';
import { useCreateCatalogue, useMoulds, useUpdateCatalogue } from '../lib/hooks';
import type { Catalogue } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

interface PartRow { code: string; detail: string; mouldId: string; lam: string; fin: string }
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
  // Labour split (phase 2): existing rows without a split default to
  // lam = total hrs, fin = 0 (matches the migration backfill).
  const [parts, setParts] = useState<PartRow[]>(
    catalogue?.parts.map((p) => ({
      code: p.drawing ?? '',
      detail: p.detail,
      mouldId: p.mouldId ? String(p.mouldId) : '',
      lam: String(p.lamHrs ?? p.hrs),
      fin: String(p.finHrs ?? 0),
    })) ?? [],
  );
  // A single-piece slide's mould rides on its one implicit part (same
  // convention as the CSV import and the MADE ticket path).
  const [singleMouldId, setSingleMouldId] = useState(
    catalogue?.parts[0]?.mouldId ? String(catalogue.parts[0].mouldId) : '',
  );
  // A single's whole-slide labour, split the same way.
  const [singleLam, setSingleLam] = useState(String(catalogue?.parts[0]?.lamHrs ?? catalogue?.parts[0]?.hrs ?? catalogue?.assemblyHrs ?? 0));
  const [singleFin, setSingleFin] = useState(String(catalogue?.parts[0]?.finHrs ?? 0));
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
    const sLam = Number(singleLam) || 0;
    const sFin = Number(singleFin) || 0;
    const input = {
      productCode: productCode.trim(),
      name: name.trim(),
      code: code || null,
      unitPrice: Number(unitPrice) || 0,
      singlePiece,
      // For singles assemblyHrs mirrors the whole-slide total (back-compat).
      assemblyHrs: singlePiece ? sLam + sFin : Number(assemblyHrs) || 0,
      gelCureMins: gelCure === '' ? null : Number(gelCure),
      lamCureMins: lamCure === '' ? null : Number(lamCure),
      specUrl: spec,
      parts: singlePiece
        ? [{
            detail: name.trim(),
            drawing: null,
            hrs: sLam + sFin,
            lamHrs: sLam,
            finHrs: sFin,
            mouldId: singleMouldId ? Number(singleMouldId) : null,
          }]
        : parts.filter((p) => p.detail.trim()).map((p) => ({
            detail: p.detail.trim(),
            drawing: p.code || null,
            hrs: (Number(p.lam) || 0) + (Number(p.fin) || 0),
            lamHrs: Number(p.lam) || 0,
            finHrs: Number(p.fin) || 0,
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
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. TLW-2050" />
          </Field>
          <Field label="Sell price £">
            <input type="number" min={0} className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
        </div>

        {/* Assembly hours + cure times */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            {singlePiece ? (
              <>
                <span className="mb-1 block text-[11px] font-semibold text-text2">Labour hours for whole slide</span>
                <div className="flex items-center gap-2">
                  <div>
                    <input type="number" min={0} className={`${inputClass} w-20`} value={singleLam} onChange={(e) => setSingleLam(e.target.value)} title="Laminating hours" />
                    <div className="mt-0.5 text-[10px] text-text3">Laminating</div>
                  </div>
                  <div>
                    <input type="number" min={0} className={`${inputClass} w-20`} value={singleFin} onChange={(e) => setSingleFin(e.target.value)} title="Finishing hours" />
                    <div className="mt-0.5 text-[10px] text-text3">Finishing</div>
                  </div>
                  <span className="text-[10px] leading-tight text-text3">
                    Laminating = at the mould (prep, gel, laminate). Finishing = trim → packing.
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="mb-1 block text-[11px] font-semibold text-text2">Labour hours for assembly</span>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} className={`${inputClass} w-24`} value={assemblyHrs} onChange={(e) => setAssemblyHrs(e.target.value)} />
                  <span className="text-[10px] leading-tight text-text3">
                    Hours for COMP assembly stage (not including part fabrication)
                  </span>
                </div>
              </>
            )}
            {singlePiece && (
              <div className="mt-2">
                <span className="mb-1 block text-[11px] font-semibold text-text2">Mould</span>
                <select className={inputClass} value={singleMouldId} onChange={(e) => setSingleMouldId(e.target.value)} title="Default mould">
                  <option value="">— No mould —</option>
                  {(moulds ?? []).map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
                </select>
                <div className="mt-0.5 text-[10px] text-text3">The mould this slide is made on</div>
              </div>
            )}
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
          {parts.length > 0 && (
            <div className="mb-1 grid grid-cols-[1fr_2fr_130px_60px_60px_auto] gap-2 text-[9px] font-bold uppercase tracking-wide text-text3">
              <span>Code</span><span>Detail</span><span>Mould</span><span>Lam h</span><span>Fin h</span><span />
            </div>
          )}
          {parts.map((p, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_2fr_130px_60px_60px_auto] items-center gap-2">
              <input className={inputClass} value={p.code} onChange={(e) => setPart(i, 'code', e.target.value)} placeholder="Part code" />
              <input className={inputClass} value={p.detail} onChange={(e) => setPart(i, 'detail', e.target.value)} placeholder="Detail / description" />
              <select className={inputClass} value={p.mouldId} onChange={(e) => setPart(i, 'mouldId', e.target.value)} title="Default mould">
                <option value="">— No mould —</option>
                {(moulds ?? []).map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
              </select>
              <input type="number" min={0} className={inputClass} value={p.lam} onChange={(e) => setPart(i, 'lam', e.target.value)} placeholder="Lam" title="Laminating hours (at the mould)" />
              <input type="number" min={0} className={inputClass} value={p.fin} onChange={(e) => setPart(i, 'fin', e.target.value)} placeholder="Fin" title="Finishing hours (trim → packing)" />
              <button onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} className="rounded bg-red/10 px-1.5 py-1 text-xs text-red">✕</button>
            </div>
          ))}
          <Button onClick={() => setParts((ps) => [...ps, { code: '', detail: '', mouldId: '', lam: '0', fin: '0' }])}>+ Add part</Button>
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
