import { useMemo, useRef, useState } from 'react';
import { useCatalogueParts, useCreateCatalogue, useUpdateCatalogue } from '../lib/hooks';
import { PART_QTYS, isSingle, partContribution, partLabel, productTotals, qtyLabel } from '../lib/catalogue';
import { money } from '../lib/format';
import type { Catalogue, CataloguePart } from '../lib/types';
import { Button, Field, FormSection, Modal, inputClass } from './ui';
import { PartForm } from './PartForm';

/** One linked piece on the product being edited. */
interface Row { partId: number | ''; qty: 1 | 0.5 }
interface HwRow { name: string; qty: string }

const DEFAULT_HW: HwRow[] = [
  { name: 'Bolt Pack', qty: '1' },
  { name: 'Slide Feet', qty: '4' },
  { name: 'Flange Supports', qty: '0' },
];

/**
 * Create ("New Product") or edit a catalogue product. A product is BUILT FROM
 * library parts (client email 1 Oct 2026): pick each piece from the dropdown
 * at a whole or half mould, and the hours and price roll up from the children.
 * A product with one part at a whole mould is a single slide — no assembly.
 */
export function CatalogueForm({ onClose, onCreated, catalogue }: { onClose: () => void; onCreated?: (c: Catalogue) => void; catalogue?: Catalogue }) {
  const isEdit = !!catalogue;
  const create = useCreateCatalogue();
  const update = useUpdateCatalogue();
  const pending = create.isPending || update.isPending;
  const { data: library } = useCatalogueParts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPart, setNewPart] = useState(false);

  const [productCode, setProductCode] = useState(catalogue?.productCode ?? '');
  const [name, setName] = useState(catalogue?.name ?? '');
  const [code, setCode] = useState(catalogue?.code ?? '');
  const [gelCure, setGelCure] = useState(String(catalogue?.gelCureMins ?? 60));
  const [lamCure, setLamCure] = useState(String(catalogue?.lamCureMins ?? 120));
  const [rows, setRows] = useState<Row[]>(
    catalogue?.parts.map((p) => ({ partId: p.id, qty: p.qty === 0.5 ? 0.5 : 1 })) ?? [],
  );
  const [hardware, setHardware] = useState<HwRow[]>(
    catalogue ? catalogue.hardware.map((h) => ({ name: h.name, qty: String(h.qty) })) : DEFAULT_HW,
  );
  const [spec, setSpec] = useState<string | null>(catalogue?.specUrl ?? null);
  const [specName, setSpecName] = useState<string | null>(catalogue?.specUrl ? 'On file' : null);

  // Library lookup — a product may still reference a part that was since
  // retired from the library, so fall back to the product's own copy.
  const byId = useMemo(() => {
    const m = new Map<number, CataloguePart>();
    for (const p of catalogue?.parts ?? []) m.set(p.id, p);
    for (const p of library ?? []) m.set(p.id, p);
    return m;
  }, [library, catalogue]);
  const options = useMemo(
    () => [...(library ?? [])].sort((a, b) => partLabel(a).localeCompare(partLabel(b))),
    [library],
  );

  // Derived product figures — the same roll-up the server applies on save.
  const linked = rows
    .filter((r) => r.partId !== '' && byId.has(r.partId))
    .map((r) => ({ ...byId.get(r.partId as number)!, qty: r.qty }));
  const totals = productTotals(linked);
  const single = isSingle({ parts: linked });
  const priceOnFile = catalogue?.unitPrice ?? 0;
  const priceChanges = isEdit && Math.abs(priceOnFile - totals.price) > 0.005;

  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
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
    const parts = rows.filter((r) => r.partId !== '').map((r) => ({ partId: Number(r.partId), qty: r.qty }));
    if (!parts.length) {
      setError('Add at least one part — a product is built from library parts.');
      return;
    }
    const input = {
      productCode: productCode.trim(),
      name: name.trim(),
      code: code || null,
      gelCureMins: gelCure === '' ? null : Number(gelCure),
      lamCureMins: lamCure === '' ? null : Number(lamCure),
      specUrl: spec,
      parts,
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

  if (newPart) {
    return (
      <PartForm
        onClose={() => setNewPart(false)}
        // A part made from here is wanted on this product — add it straight away.
        onSaved={(p) => setRows((rs) => [...rs, { partId: p.id, qty: 1 }])}
      />
    );
  }

  const cell = 'text-right text-xs tabular-nums text-text2';

  return (
    <Modal
      title={isEdit ? `Edit ${catalogue.name}` : 'New Product'}
      sub={isEdit ? 'Update catalogue product' : 'Build a product from library parts — Step 2 will resume when saved'}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={pending}>
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Save to catalogue'}
          </Button>
        </>
      }
    >
      <FormSection title="Product details">
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[11px] font-semibold text-text2">Gel coat cure (mins)</span>
              <input type="number" min={0} className={inputClass} value={gelCure} onChange={(e) => setGelCure(e.target.value)} />
            </div>
            <div>
              <span className="mb-1 block text-[11px] font-semibold text-text2">Laminating cure (mins)</span>
              <input type="number" min={0} className={inputClass} value={lamCure} onChange={(e) => setLamCure(e.target.value)} />
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection title="Parts — built from the library">
        <p className="mb-2 text-[11px] text-text3">
          Pick each piece from the parts library and say whether it takes a whole mould or half of one.
          Hours and price add up from the parts below. Need a piece that isn't listed? Create it in the library first.
        </p>
        {rows.length > 0 && (
          <div className="mb-1 grid grid-cols-[1fr_84px_64px_64px_72px_auto] items-center gap-2 text-[9px] font-bold uppercase tracking-wide text-text3">
            <span>Part</span><span>Mould qty</span><span className="text-right">Lam h</span><span className="text-right">Fin h</span><span className="text-right">Price</span><span />
          </div>
        )}
        {rows.map((r, i) => {
          const p = r.partId !== '' ? byId.get(r.partId) : undefined;
          const c = p ? partContribution({ ...p, qty: r.qty }) : null;
          return (
            <div key={i} className="mb-2 grid grid-cols-[1fr_84px_64px_64px_72px_auto] items-center gap-2">
              <select
                className={inputClass}
                value={r.partId}
                onChange={(e) => setRow(i, { partId: e.target.value ? Number(e.target.value) : '' })}
              >
                <option value="">{library ? '— Select a part —' : 'Loading parts…'}</option>
                {/* Keep a part the product already uses selectable even if it
                    has since been retired from the library. */}
                {p && library && !options.some((o) => o.id === p.id) && (
                  <option value={p.id}>{partLabel(p)} (retired)</option>
                )}
                {p && !library && <option value={p.id}>{partLabel(p)}</option>}
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {partLabel(o)}{o.mould?.ref ? ` [${o.mould.ref}]` : ''}
                  </option>
                ))}
              </select>
              {/* Whole or half mould only (client: "quantities 1 or 0.50 ONLY"). */}
              <div className="flex overflow-hidden rounded-md border border-border2">
                {PART_QTYS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setRow(i, { qty: q })}
                    title={q === 1 ? 'Whole mould' : 'Half a mould'}
                    className={`flex-1 py-1.5 text-xs font-bold ${r.qty === q ? 'bg-teal text-white' : 'bg-surface text-text2 hover:bg-surface2'}`}
                  >
                    {qtyLabel(q)}
                  </button>
                ))}
              </div>
              <span className={cell}>{c ? c.lam : '—'}</span>
              <span className={cell}>{c ? c.fin : '—'}</span>
              <span className={cell}>{c ? money(c.price) : '—'}</span>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded bg-red/10 px-1.5 py-1 text-xs text-red" title="Remove from product">✕</button>
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setRows((rs) => [...rs, { partId: '', qty: 1 }])}>+ Add part</Button>
          <Button onClick={() => setNewPart(true)} title="Create a new unique part in the library, then add it here">+ New library part…</Button>
          {!(library ?? []).length && <span className="text-[11px] text-amber">The parts library is empty — create your first part.</span>}
        </div>

        {/* Roll-up — what the server will store on save. */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface2 px-3 py-2.5 md:grid-cols-5">
          <Stat label="Type" value={linked.length ? (single ? 'Single slide' : `Assembly · ${linked.length} pieces`) : '—'} />
          <Stat label="Laminating" value={`${totals.lam}h`} />
          <Stat label="Finishing" value={`${totals.fin}h`} />
          <Stat label="Total hours" value={`${totals.hrs}h`} strong />
          <Stat label="Sell price" value={money(totals.price)} strong />
        </div>
        {priceChanges && (
          <div className="mt-2 rounded-md border border-amber bg-amber-l px-3 py-2 text-[11px] text-[#7a4800]">
            ⚠ Price on file is <strong>{money(priceOnFile)}</strong>; saving sets it to the parts total <strong>{money(totals.price)}</strong>.
            {totals.price === 0 && ' Set prices on the parts in the library to build it up.'}
          </div>
        )}
      </FormSection>

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

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wide text-text3">{label}</div>
      <div className={`text-xs ${strong ? 'font-bold' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
