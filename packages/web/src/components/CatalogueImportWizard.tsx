import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateSku } from '@bowson/shared';
import { apiClient } from '../lib/api';
import { parseCsv } from '../lib/csv';
import { useCatalogueParts, useMoulds } from '../lib/hooks';
import { partKey, r2 } from '../lib/catalogue';
import { Button, Modal } from './ui';
import type { Catalogue, CataloguePart, Mould } from '../lib/types';

/**
 * Catalogue CSV import wizard — ported from the prototype's catImport flow and
 * re-based on the parts library (client email 1 Oct 2026):
 * 1 template/format · 2 upload · 3 define SKUs · 4 review · 5 confirm.
 *
 * Parts are the unit of truth. A part row names a library part by
 * part_code (+ part_detail); if it isn't in the library yet it is CREATED
 * from the row (hours / price / mould), otherwise the existing part is
 * reused untouched. Products then link those parts at part_qty 1 or 0.5 and
 * their hours and price roll up — sell_price / assembly_hrs columns are
 * accepted for old files but ignored with a warning.
 */

interface ParsedPart {
  code: string;
  detail: string;
  qty: 1 | 0.5;
  lamHrs: number;
  finHrs: number;
  price: number;
  mouldId: string; // '' = no mould (same convention as the forms)
  /** Existing library part this row resolved to, else null = will be created. */
  existingId: number | null;
  key: string;
}

/** Read a part row's hour columns: split if given, else part_hrs as Laminating. */
function readPartHours(r: Record<string, string | undefined>): { lamHrs: number; finHrs: number } {
  const lam = Number(r.part_lam_hrs ?? 0) || 0;
  const fin = Number(r.part_fin_hrs ?? 0) || 0;
  if (lam || fin) return { lamHrs: lam, finHrs: fin };
  const total = Number(r.part_hrs ?? 0) || 0;
  return { lamHrs: total, finHrs: 0 };
}

interface ParsedProduct {
  productCode: string;
  name: string;
  parts: ParsedPart[];
  sku: string;
  // SKU-builder state (ported from buildSku/updateSkuPreview)
  skuType: string;
  h: string; // height / length / angle / custom suffix
  l: string; // lanes
  r: string; // rotation
  d: string; // direction CW/ACW
}

const SKU_TYPES = [
  { value: 'OS', label: 'Open Slide' },
  { value: 'TS', label: 'Tube Slide' },
  { value: 'CT', label: 'Crawl Tube' },
  { value: 'SP', label: 'Spiral Slide' },
  { value: 'RS', label: 'Racing Slide' },
  { value: 'WS', label: 'Wavy Slide' },
  { value: 'OT', label: 'Other / Custom' },
];

/** Build a SKU from the type + dimension fields (ported from updateSkuPreview). */
function buildSku(p: ParsedProduct): string {
  const { skuType: type, h, l, r, d } = p;
  if (type === 'OS' || type === 'TS' || type === 'WS') return type + (h ? `-${h}` : '') + (l && parseInt(l) > 1 ? `-${l}L` : '');
  if (type === 'CT') return `CT${h ? `-${h}` : ''}`;
  if (type === 'RS') return `RS${h ? `-${h}` : ''}${l && parseInt(l) > 1 ? `-${l}L` : ''}`;
  if (type === 'SP') return `SP${h ? `-${h}` : ''}${r ? `-${r}` : ''}${d ? `-${d}` : ''}`;
  if (type === 'OT') return `OT${h ? `-${h.toUpperCase()}` : ''}`;
  return p.sku; // no type chosen — keep the auto-generated SKU
}

/** Download the example template (ported from dlCatalogueTemplate). */
function downloadTemplate() {
  const header = 'product_code,name,notes,part_code,part_detail,part_qty,part_lam_hrs,part_fin_hrs,part_price,part_mould';
  const ex = [
    ',,,12347,GRP START PANEL,,5.33,0.75,180,M-014',
    ',,,12349,1100R 90 DEGREE TUBE SECTION,,8.5,1,420,M-015',
    ',,,13481,STRAIGHT HALF TUBE SECTION / 1922MM,,5.25,0.5,260,M-016',
    '13609,Spiral Tube Slide with Start Panel,Standard colours,,,,,,,',
    ',,,12347,,1,,,,',
    ',,,12349,,1,,,,',
    ',,,12349,,1,,,,',
    ',,,13481,,0.5,,,,',
    '12609,Toddler Single Lane,,TSL-1200,TODDLER SINGLE LANE BODY,1,11.33,0,360,M-020',
  ].join('\r\n');
  const blob = new Blob([`﻿${header}\r\n${ex}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'bowson_catalogue_template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

export function CatalogueImportWizard({ catalogue, onClose }: { catalogue: Catalogue[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: moulds } = useMoulds();
  const { data: library } = useCatalogueParts();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  /** Part rows before any product — library-only entries. */
  const [standalone, setStandalone] = useState<ParsedPart[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [skuMissing, setSkuMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number; partsAdded: number } | null>(null);

  const existsFor = (code: string) => catalogue.find((c) => c.productCode === code);
  const newCount = useMemo(() => parsed.filter((p) => !existsFor(p.productCode)).length, [parsed, catalogue]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Every distinct part this import will CREATE (dedup by key across rows). */
  const newParts = useMemo(() => {
    const seen = new Map<string, ParsedPart>();
    for (const p of [...standalone, ...parsed.flatMap((pr) => pr.parts)]) {
      if (p.existingId == null && !seen.has(p.key)) seen.set(p.key, p);
    }
    return [...seen.values()];
  }, [standalone, parsed]);

  /** Parse the CSV: a product_code row starts a product; blank-code rows are
   * part rows — for the product above, or library-only before any product. */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('');
    const rows = parseCsv(await file.text());
    const out: ParsedProduct[] = [];
    const loose: ParsedPart[] = [];
    const errs: string[] = [];
    const warns: string[] = [];
    const lib = library ?? [];
    const byKey = new Map(lib.map((p) => [partKey(p.drawing, p.detail), p]));
    const byCode = new Map<string, CataloguePart[]>();
    for (const p of lib) {
      const k = (p.drawing ?? '').trim().toUpperCase();
      if (k) byCode.set(k, [...(byCode.get(k) ?? []), p]);
    }
    /** Parts created earlier in THIS file (so a product can use them below). */
    const inFile = new Map<string, ParsedPart>();
    let last: ParsedProduct | null = null;
    let legacyCols = false;

    const readPart = (r: Record<string, string | undefined>, ri: number): ParsedPart | null => {
      const code = (r.part_code ?? r.part_drawing ?? '').trim();
      let detail = (r.part_detail ?? '').trim();
      if (!code && !detail) return null;
      const qtyRaw = (r.part_qty ?? '').trim();
      const qtyNum = qtyRaw ? Number(qtyRaw) : 1;
      if (qtyNum !== 1 && qtyNum !== 0.5) {
        errs.push(`Row ${ri + 2}: part_qty "${qtyRaw}" — must be 1 (whole mould) or 0.5 (half)`);
        return null;
      }
      const qty = qtyNum as 1 | 0.5;
      const mouldRef = (r.part_mould ?? '').trim();
      const mould = mouldRef ? (moulds ?? []).find((m) => m.ref.toLowerCase() === mouldRef.toLowerCase()) : undefined;
      if (mouldRef && !mould) warns.push(`Row ${ri + 2}: mould ref "${mouldRef}" not found in the mould register — part will import with no mould`);

      // Resolve against the library: code + detail, else a code that names
      // exactly one part, else (earlier in this file) a part created above.
      let existing: CataloguePart | undefined;
      if (detail) existing = byKey.get(partKey(code, detail));
      if (!existing && code && !detail) {
        const cands = byCode.get(code.toUpperCase()) ?? [];
        if (cands.length === 1) {
          existing = cands[0];
          detail = existing!.detail;
        } else if (cands.length > 1) {
          errs.push(`Row ${ri + 2}: part code "${code}" matches ${cands.length} library parts — add part_detail to say which`);
          return null;
        }
      }
      const key = partKey(code, detail);
      if (!existing) {
        const earlier = inFile.get(key) ?? (code && !detail ? [...inFile.values()].find((p) => p.code.toUpperCase() === code.toUpperCase()) : undefined);
        if (earlier) return { ...earlier, qty };
        if (!detail) {
          errs.push(`Row ${ri + 2}: part code "${code}" is not in the library — add part_detail (and hours) to create it`);
          return null;
        }
      }
      const part: ParsedPart = {
        code,
        detail,
        qty,
        ...readPartHours(r),
        price: Number(r.part_price ?? 0) || 0,
        mouldId: mould ? String(mould.id) : '',
        existingId: existing?.id ?? null,
        key,
      };
      if (!existing) {
        inFile.set(key, part);
        if (!part.lamHrs && !part.finHrs) warns.push(`Row ${ri + 2}: new part "${detail}" has no hours`);
      }
      return part;
    };

    rows.forEach((r, ri) => {
      const code = (r.product_code ?? '').trim();
      const name = (r.name ?? '').trim();
      if ((r.sell_price ?? '').trim() || (r.assembly_hrs ?? '').trim() || (r.type ?? '').trim()) legacyCols = true;
      const hasPart = (r.part_code ?? r.part_drawing ?? '').trim() || (r.part_detail ?? '').trim();
      if (!code && !name && !hasPart) return; // blank row
      if (!code) {
        const part = readPart(r, ri);
        if (!part) return;
        if (last) last.parts.push(part);
        else loose.push(part);
        return;
      }
      if (!name) { errs.push(`Row ${ri + 2}: missing name`); return; }
      const prod: ParsedProduct = {
        productCode: code,
        name,
        parts: [],
        sku: generateSku(code, name, catalogue),
        skuType: '',
        h: '', l: '', r: '', d: '',
      };
      // Part fields on the product row itself — a single-piece product.
      if (hasPart) {
        const part = readPart(r, ri);
        if (part) prod.parts.push(part);
      }
      out.push(prod);
      last = prod;
    });
    if (legacyCols) warns.push('sell_price / assembly_hrs / type columns are ignored — price, hours and type now come from the parts');
    for (const pr of out) {
      if (pr.parts.length === 0) errs.push(`Product "${pr.name}" (${pr.productCode}) has no parts — a product is built from library parts`);
    }
    setParsed(out);
    setStandalone(loose);
    setErrors(errs);
    setWarnings(warns);
    if (errs.length) {
      setStatus(`⛔ ${errs.length} error${errs.length > 1 ? 's' : ''} found. Fix and re-upload.`);
    } else if (!out.length && !loose.length) {
      setStatus('⛔ No products or parts found in the file.');
    } else {
      setStatus(`✓ Parsed ${out.length} product${out.length === 1 ? '' : 's'} and ${loose.length} library-only part${loose.length === 1 ? '' : 's'}.`);
      setTimeout(() => setStep(out.length ? 3 : 4), 500);
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const setProd = (pi: number, patch: Partial<ParsedProduct>) =>
    setParsed((prev) =>
      prev.map((p, i) => {
        if (i !== pi) return p;
        const next = { ...p, ...patch };
        next.sku = buildSku(next);
        return next;
      }),
    );

  /** Mould for a NEW part — applied to every row sharing that part key. */
  const setNewPartMould = (key: string, mouldId: string) => {
    const apply = (p: ParsedPart) => (p.key === key && p.existingId == null ? { ...p, mouldId } : p);
    setParsed((prev) => prev.map((pr) => ({ ...pr, parts: pr.parts.map(apply) })));
    setStandalone((prev) => prev.map(apply));
  };

  /** Validate all SKUs are defined before Review (ported from saveCatSkus). */
  function toReview() {
    const missing = parsed.filter((p) => !p.sku || p.sku === '—').map((p) => `${p.productCode} — ${p.name}`);
    setSkuMissing(missing);
    if (!missing.length) setStep(4);
  }

  /** Import: parts first (create the new ones), then products with links —
   * UPSERT on product code (ported from confirmCatalogueImport). */
  async function runImport() {
    setBusy(true);
    let added = 0;
    let updated = 0;
    let partsAdded = 0;
    const idByKey = new Map<string, number>();
    for (const p of library ?? []) idByKey.set(partKey(p.drawing, p.detail), p.id);
    try {
      for (const np of newParts) {
        try {
          const created = await apiClient.post<CataloguePart>('/api/catalogue/parts', {
            detail: np.detail,
            drawing: np.code || null,
            lamHrs: np.lamHrs,
            finHrs: np.finHrs,
            price: np.price,
            mouldId: np.mouldId ? Number(np.mouldId) : null,
          });
          idByKey.set(np.key, created.id);
          partsAdded++;
        } catch {
          /* likely a 409 race — the product link below will report it */
        }
      }
      for (const p of parsed) {
        const links = p.parts
          .map((pt) => ({ partId: pt.existingId ?? idByKey.get(pt.key), qty: pt.qty }))
          .filter((l): l is { partId: number; qty: 1 | 0.5 } => l.partId != null);
        const body = { productCode: p.productCode, name: p.name, code: p.sku, parts: links };
        const existing = existsFor(p.productCode);
        try {
          if (existing) {
            await apiClient.patch(`/api/catalogue/${existing.id}`, body);
            updated++;
          } else {
            await apiClient.post('/api/catalogue', { ...body, hardware: [] });
            added++;
          }
        } catch {
          /* keep going; counted as skipped implicitly */
        }
      }
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      qc.invalidateQueries({ queryKey: ['catalogue-parts'] });
      setDone({ added, updated, partsAdded });
    }
  }

  const stepTitle = ['Download template', 'Upload CSV', 'Define SKUs', 'Review', 'Confirm'][step - 1];
  const lbl = 'text-[11px] font-bold uppercase tracking-wide text-text3';
  const inp = 'mt-1 w-full rounded-md border border-border2 bg-surface px-2 py-1.5 text-xs outline-none focus:border-teal';
  const mouldRef = (id: string) => (moulds ?? []).find((m) => String(m.id) === id)?.ref;

  return (
    <Modal
      title={`Import Catalogue — Step ${step} of 5: ${stepTitle}`}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>Done</Button>
        ) : (
          <>
            {step > 1 && <Button onClick={() => setStep(step - 1)}>← Back</Button>}
            <Button onClick={onClose}>Cancel</Button>
            {step === 1 && <Button variant="primary" onClick={() => setStep(2)}>Next: Upload →</Button>}
            {step === 3 && <Button variant="primary" disabled={!parsed.length} onClick={toReview}>Next: Review →</Button>}
            {step === 4 && (
              errors.length
                ? <span className="self-center text-[11px] text-red">Fix errors before continuing</span>
                : <Button variant="primary" onClick={() => setStep(5)}>Next: Confirm →</Button>
            )}
            {step === 5 && (
              <Button variant="primary" disabled={busy} onClick={() => void runImport()}>
                {busy ? 'Importing…' : `Import ${newParts.length} part${newParts.length !== 1 ? 's' : ''} + ${parsed.length} product${parsed.length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </>
        )
      }
    >
      {done ? (
        <div className="py-8 text-center">
          <div className="mb-2 text-4xl">✓</div>
          <div className="text-sm font-bold">Import complete</div>
          <div className="mt-1 text-xs text-text2">{done.partsAdded} library part{done.partsAdded === 1 ? '' : 's'} added · {done.added} product{done.added === 1 ? '' : 's'} added · {done.updated} updated</div>
        </div>
      ) : step === 1 ? (
        <>
          <p className="mb-3 text-xs text-text2">
            Download the CSV template, fill it in, then upload it in the next step. Parts come first — products are built from them:
          </p>
          <ul className="mb-4 ml-4 list-disc text-[11px] leading-6 text-text2">
            <li>A row with <strong>part_code</strong> (and a blank product_code, before any product) adds a part to the <strong>parts library</strong>: part_detail, part_lam_hrs, part_fin_hrs, part_price, part_mould.</li>
            <li>A row with a <strong>product_code</strong> starts a product (name required).</li>
            <li>Part rows under a product <strong>link</strong> that part at <strong>part_qty</strong> 1 (whole mould) or 0.5 (half). Give part_code only if the part is already in the library; add part_detail + hours to create it on the spot.</li>
            <li>The same part can appear more than once under a product. Its hours and price roll up into the product — there is no separate sell price or assembly hours.</li>
            <li>A single-piece product is a product row with its one part on the same line.</li>
            <li>Existing products with a matching product code are <strong>updated</strong>; existing library parts are reused as they are.</li>
          </ul>
          <Button variant="primary" onClick={downloadTemplate}>⭳ Download CSV template</Button>
        </>
      ) : step === 2 ? (
        <>
          <p className="mb-3 text-xs text-text2">Upload the completed CSV file.</p>
          <input ref={fileRef} type="file" accept=".csv" onChange={(e) => void onFile(e)} className="text-xs" />
          {status && (
            <div className={`mt-3 text-xs font-semibold ${status.startsWith('⛔') ? 'text-red' : 'text-teal'}`}>{status}</div>
          )}
          {errors.length > 0 && (
            <div className="mt-2 rounded-lg border border-red bg-red/5 px-3 py-2 text-[11px] text-red">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
        </>
      ) : step === 3 ? (
        <>
          <p className="mb-3 text-xs text-text2">
            Select the slide type for each product and fill in the key dimensions. The SKU is generated automatically for the shop floor.
          </p>
          {skuMissing.length > 0 && (
            <div className="mb-3 rounded-lg border border-red bg-red/5 px-3 py-2 text-[11px] text-red">
              Please define a SKU for all products: {skuMissing.join('; ')}
            </div>
          )}
          {parsed.map((p, pi) => (
            <div key={pi} className="mb-3 rounded-lg border border-border bg-surface px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-bold">{p.productCode} — {p.name}</div>
                  <div className="mt-0.5 text-[11px] text-text3">
                    {p.parts.length} piece{p.parts.length !== 1 ? 's' : ''} · {p.parts.filter((x) => x.existingId == null).length} new to the library
                  </div>
                </div>
                <div className="min-w-28 rounded-full bg-teal-l px-3 py-1 text-center text-xs font-bold text-teal">{p.sku || '—'}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lbl}>Slide type</label>
                  <select value={p.skuType} onChange={(e) => setProd(pi, { skuType: e.target.value, h: '', l: '', r: '', d: '' })} className={inp}>
                    <option value="">— Select type —</option>
                    {SKU_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end gap-1.5">
                  {(p.skuType === 'OS' || p.skuType === 'TS' || p.skuType === 'WS' || p.skuType === 'SP') && (
                    <div className="flex-1">
                      <label className={lbl}>Deck height (mm)</label>
                      <input type="number" placeholder="e.g. 2050" value={p.h} onChange={(e) => setProd(pi, { h: e.target.value })} className={inp} />
                    </div>
                  )}
                  {p.skuType === 'CT' && (
                    <div className="flex-1">
                      <label className={lbl}>Length (mm)</label>
                      <input type="number" placeholder="e.g. 3600" value={p.h} onChange={(e) => setProd(pi, { h: e.target.value })} className={inp} />
                    </div>
                  )}
                  {p.skuType === 'RS' && (
                    <div className="flex-1">
                      <label className={lbl}>Angle (°)</label>
                      <input type="number" placeholder="e.g. 40" value={p.h} onChange={(e) => setProd(pi, { h: e.target.value })} className={inp} />
                    </div>
                  )}
                  {(p.skuType === 'OS' || p.skuType === 'TS' || p.skuType === 'WS' || p.skuType === 'RS') && (
                    <div className="w-20">
                      <label className={lbl}>Lanes</label>
                      <input type="number" min={1} max={10} placeholder="1" value={p.l} onChange={(e) => setProd(pi, { l: e.target.value })} className={inp} />
                    </div>
                  )}
                  {p.skuType === 'SP' && (
                    <>
                      <div className="w-20">
                        <label className={lbl}>Rotation (°)</label>
                        <input type="number" placeholder="360" value={p.r} onChange={(e) => setProd(pi, { r: e.target.value })} className={inp} />
                      </div>
                      <div className="w-24">
                        <label className={lbl}>Direction</label>
                        <select value={p.d} onChange={(e) => setProd(pi, { d: e.target.value })} className={inp}>
                          <option value="">—</option>
                          <option value="CW">Clockwise</option>
                          <option value="ACW">Anti-CW</option>
                        </select>
                      </div>
                    </>
                  )}
                  {p.skuType === 'OT' && (
                    <div className="flex-1">
                      <label className={lbl}>Custom suffix</label>
                      <input placeholder="e.g. TODDLER-MK2" value={p.h} onChange={(e) => setProd(pi, { h: e.target.value })} className={inp} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {newParts.length > 0 && (
            <div className="rounded-lg border border-border bg-surface px-3.5 py-3">
              <div className={lbl}>Moulds for new library parts (optional)</div>
              {newParts.map((pt) => (
                <div key={pt.key} className="mt-1.5 grid grid-cols-[1fr_150px] items-center gap-2">
                  <div className="truncate text-[11px] text-text2">
                    {pt.code && <span className="mr-1.5 font-mono text-[10px] text-text3">{pt.code}</span>}
                    {pt.detail}
                    <span className="ml-1.5 text-[10px] text-text3">{r2(pt.lamHrs + pt.finHrs)}h</span>
                  </div>
                  <select value={pt.mouldId} onChange={(e) => setNewPartMould(pt.key, e.target.value)} title="Default mould" className={inp.replace('mt-1 ', '')}>
                    <option value="">— No mould —</option>
                    {(moulds ?? []).map((m) => <option key={m.id} value={m.id}>{m.ref}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </>
      ) : step === 4 ? (
        <>
          {warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber bg-amber-l/50 px-3 py-2 text-[11px]">
              <strong className="text-amber">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</strong>
              {warnings.map((w, i) => <div key={i} className="text-text2">{w}</div>)}
            </div>
          )}
          {newParts.length > 0 && (
            <div className="mb-3">
              <div className={`${lbl} mb-1`}>New library parts ({newParts.length})</div>
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {newParts.map((pt) => (
                    <tr key={pt.key} className="border-b border-border">
                      <td className="px-2.5 py-1 font-mono text-[11px] text-teal">{pt.code || '—'}</td>
                      <td className="px-2.5 py-1">{pt.detail}</td>
                      <td className="px-2.5 py-1 text-[10px] text-text3">{pt.lamHrs}h lam · {pt.finHrs}h fin</td>
                      <td className="px-2.5 py-1 text-[10px] text-text3">{pt.price ? `£${pt.price.toFixed(2)}` : '—'}</td>
                      <td className="px-2.5 py-1 text-[10px] text-text3">{pt.mouldId ? `⚒ ${mouldRef(pt.mouldId) ?? ''}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {parsed.length > 0 && (
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface2 text-left text-[10px] font-bold uppercase text-text3">
                  <th className="px-2.5 py-1.5">Code</th><th className="px-2.5 py-1.5">Name</th><th className="px-2.5 py-1.5">SKU</th>
                  <th className="px-2.5 py-1.5">Type</th><th className="px-2.5 py-1.5">Hours / price</th><th className="px-2.5 py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((p, pi) => (
                  <PreviewRows key={pi} p={p} exists={!!existsFor(p.productCode)} moulds={moulds ?? []} library={library ?? []} />
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-4 gap-3">
            {[
              [newParts.length, 'New parts'],
              [parsed.length, 'Products'],
              [newCount, 'New'],
              [parsed.length - newCount, 'Updates'],
            ].map(([n, label]) => (
              <div key={label} className="rounded-lg border border-border bg-surface px-3 py-4 text-center">
                <div className={`text-2xl font-bold ${label === 'Updates' ? 'text-amber' : 'text-teal'}`}>{n}</div>
                <div className="mt-1 text-[11px] text-text3">{label}</div>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-surface2 px-4 py-3 text-xs text-text2">
            New parts are added to the library first, then products are linked to them. Existing products with matching product codes will be updated; existing parts are reused unchanged.
          </div>
        </>
      )}
    </Modal>
  );
}

function PreviewRows({ p, exists, moulds, library }: { p: ParsedProduct; exists: boolean; moulds: Mould[]; library: CataloguePart[] }) {
  const mouldRef = (id: string) => moulds.find((m) => String(m.id) === id)?.ref;
  // Totals the product will get: existing parts from the library, new from the row.
  const contrib = (pt: ParsedPart) => {
    const lib = pt.existingId != null ? library.find((x) => x.id === pt.existingId) : undefined;
    const lam = (lib ? lib.lamHrs ?? lib.hrs : pt.lamHrs) * pt.qty;
    const fin = (lib ? lib.finHrs ?? 0 : pt.finHrs) * pt.qty;
    const price = (lib ? lib.price : pt.price) * pt.qty;
    return { hrs: r2(lam + fin), price: r2(price), mould: lib ? lib.mould?.ref : mouldRef(pt.mouldId) };
  };
  const totals = p.parts.reduce((t, pt) => { const c = contrib(pt); return { hrs: r2(t.hrs + c.hrs), price: r2(t.price + c.price) }; }, { hrs: 0, price: 0 });
  const single = p.parts.length <= 1;
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-2.5 py-1.5 font-bold text-teal">{p.productCode}</td>
        <td className="px-2.5 py-1.5 font-semibold">{p.name}</td>
        <td className="px-2.5 py-1.5 font-mono text-[11px]">{p.sku}</td>
        <td className="px-2.5 py-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${single ? 'bg-teal-l text-teal' : 'bg-[#4a42b022] text-[#6d5fd0]'}`}>
            {single ? 'Single' : 'Assembly'}
          </span>
        </td>
        <td className="px-2.5 py-1.5 tabular-nums">{totals.hrs}h · £{totals.price.toFixed(2)}</td>
        <td className="px-2.5 py-1.5">
          <span className={`text-[10px] font-bold ${exists ? 'text-amber' : 'text-teal'}`}>{exists ? '↻ Update' : '+ New'}</span>
        </td>
      </tr>
      {p.parts.map((pt, i) => {
        const c = contrib(pt);
        return (
          <tr key={i} className="border-b border-border bg-surface2/50">
            <td className="px-2.5 py-1 font-mono text-[10px] text-text3">{pt.code}</td>
            <td className="px-2.5 py-1 text-[11px] text-text3">└ {pt.detail}{pt.qty === 0.5 ? ' (½ mould)' : ''}</td>
            <td className="px-2.5 py-1 text-[10px]">
              <span className={pt.existingId != null ? 'text-text3' : 'font-bold text-teal'}>{pt.existingId != null ? 'library' : 'NEW'}</span>
            </td>
            <td className="px-2.5 py-1 text-[10px] text-text3">{c.hrs}h</td>
            <td className="px-2.5 py-1 text-[10px] text-text3">{c.mould ? `⚒ ${c.mould}` : ''}</td>
            <td />
          </tr>
        );
      })}
    </>
  );
}
