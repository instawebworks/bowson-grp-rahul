import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateSku } from '@bowson/shared';
import { apiClient } from '../lib/api';
import { parseCsv } from '../lib/csv';
import { Button, Modal } from './ui';
import type { Catalogue } from '../lib/types';

/**
 * Catalogue CSV import wizard — ported from the prototype's catImport flow:
 * 1 template/format · 2 upload · 3 define SKUs (type + dimensions, live
 * preview) · 4 review (new/update, errors/warnings) · 5 confirm + import
 * with UPSERT on product code.
 */

interface ParsedPart {
  detail: string;
  drawing: string | null;
  hrs: number;
}

interface ParsedProduct {
  productCode: string;
  name: string;
  isSingle: boolean;
  unitPrice: number;
  assemblyHrs: number;
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
  const header = 'product_code,name,type,sell_price,assembly_hrs,notes,part_detail,part_code,part_hrs';
  const ex = [
    '10420,Twin Lane Wavy Slide,ASSEMBLY,2850.00,2.5,Standard colours,,, ',
    ',,,,,,Lane part left,B2-2LA-3600-L,8.5',
    ',,,,,,Lane part right,B2-2LA-3600-R,8.5',
    ',,,,,,Start section,B2-2LA-3600-S,6.0',
    '10512,40 Degree Racing Slide,SINGLE,1200.00,0,,,,',
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParsedProduct[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [skuMissing, setSkuMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number } | null>(null);

  const existsFor = (code: string) => catalogue.find((c) => c.productCode === code);
  const newCount = useMemo(() => parsed.filter((p) => !existsFor(p.productCode)).length, [parsed, catalogue]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Parse the CSV (ported from runCatImportParse): a product_code row starts a
   * product; blank-code rows add parts to the previous one. */
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('');
    const rows = parseCsv(await file.text());
    const out: ParsedProduct[] = [];
    const errs: string[] = [];
    const warns: string[] = [];
    let last: ParsedProduct | null = null;
    rows.forEach((r, ri) => {
      const code = (r.product_code ?? '').trim();
      const name = (r.name ?? '').trim();
      const partDetail = (r.part_detail ?? '').trim();
      if (!code && !name && !partDetail) return; // blank row
      if (!code && last) {
        if (!partDetail) {
          warns.push(`Row ${ri + 2}: part row with no part_detail — skipped`);
          return;
        }
        last.parts.push({
          detail: partDetail,
          drawing: (r.part_code ?? r.part_drawing ?? '').trim() || null,
          hrs: Number(r.part_hrs ?? 0) || 0,
        });
        return;
      }
      if (!code) { errs.push(`Row ${ri + 2}: missing product_code`); return; }
      if (!name) { errs.push(`Row ${ri + 2}: missing name`); return; }
      const type = (r.type ?? '').trim().toUpperCase();
      const prod: ParsedProduct = {
        productCode: code,
        name,
        isSingle: type === 'SINGLE' || type === 'MADE' || type === '1',
        unitPrice: Number(r.sell_price ?? 0) || 0,
        assemblyHrs: Number(r.assembly_hrs ?? 0) || 0,
        parts: [],
        sku: generateSku(code, name, catalogue),
        skuType: '',
        h: '', l: '', r: '', d: '',
      };
      out.push(prod);
      last = prod;
    });
    // Validation warnings (ported).
    for (const pr of out) {
      if (!pr.isSingle && pr.parts.length === 0) warns.push(`Product "${pr.name}" (${pr.productCode}): type is ASSEMBLY but no parts found`);
      if (pr.isSingle && pr.parts.length > 0) {
        warns.push(`Product "${pr.name}": type is SINGLE but has ${pr.parts.length} part rows — treating as ASSEMBLY`);
        pr.isSingle = false;
      }
    }
    setParsed(out);
    setErrors(errs);
    setWarnings(warns);
    if (errs.length) {
      setStatus(`⛔ ${errs.length} error${errs.length > 1 ? 's' : ''} found. Fix and re-upload.`);
    } else if (!out.length) {
      setStatus('⛔ No products found in the file.');
    } else {
      setStatus(`✓ Parsed ${out.length} products.`);
      setTimeout(() => setStep(3), 500);
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

  /** Validate all SKUs are defined before Review (ported from saveCatSkus). */
  function toReview() {
    const missing = parsed.filter((p) => !p.sku || p.sku === '—').map((p) => `${p.productCode} — ${p.name}`);
    setSkuMissing(missing);
    if (!missing.length) setStep(4);
  }

  /** Import — UPSERT on product code (ported from confirmCatalogueImport). */
  async function runImport() {
    setBusy(true);
    let added = 0;
    let updated = 0;
    try {
      for (const p of parsed) {
        const body = {
          productCode: p.productCode,
          name: p.name,
          code: p.sku,
          unitPrice: p.unitPrice,
          singlePiece: p.isSingle,
          assemblyHrs: p.assemblyHrs,
          parts: p.parts.map((pt) => ({ detail: pt.detail, drawing: pt.drawing, hrs: pt.hrs, price: 0 })),
        };
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
      setDone({ added, updated });
    }
  }

  const stepTitle = ['Download template', 'Upload CSV', 'Define SKUs', 'Review', 'Confirm'][step - 1];
  const lbl = 'text-[11px] font-bold uppercase tracking-wide text-text3';
  const inp = 'mt-1 w-full rounded-md border border-border2 bg-surface px-2 py-1.5 text-xs outline-none focus:border-teal';

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
                {busy ? 'Importing…' : `Import ${parsed.length} product${parsed.length !== 1 ? 's' : ''}`}
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
          <div className="mt-1 text-xs text-text2">{done.added} added · {done.updated} updated</div>
        </div>
      ) : step === 1 ? (
        <>
          <p className="mb-3 text-xs text-text2">
            Download the CSV template, fill it in, then upload it in the next step. Format rules:
          </p>
          <ul className="mb-4 ml-4 list-disc text-[11px] leading-6 text-text2">
            <li>A row with a <strong>product_code</strong> starts a product (name required; type SINGLE or ASSEMBLY).</li>
            <li>Rows with a blank product_code add <strong>parts</strong> to the product above (part_detail, part_code, part_hrs).</li>
            <li>Existing products with a matching product code will be <strong>updated</strong>.</li>
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
                    {p.parts.length} part{p.parts.length !== 1 ? 's' : ''}{p.assemblyHrs ? ` · ${p.assemblyHrs}h assembly` : ''}
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
        </>
      ) : step === 4 ? (
        <>
          {warnings.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber bg-amber-l/50 px-3 py-2 text-[11px]">
              <strong className="text-amber">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</strong>
              {warnings.map((w, i) => <div key={i} className="text-text2">{w}</div>)}
            </div>
          )}
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-left text-[10px] font-bold uppercase text-text3">
                <th className="px-2.5 py-1.5">Code</th><th className="px-2.5 py-1.5">Name</th><th className="px-2.5 py-1.5">SKU</th>
                <th className="px-2.5 py-1.5">Type</th><th className="px-2.5 py-1.5">Price</th><th className="px-2.5 py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {parsed.map((p, pi) => (
                <PreviewRows key={pi} p={p} exists={!!existsFor(p.productCode)} />
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
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
            SKUs have been defined for all products. Existing products with matching product codes will be updated.
          </div>
        </>
      )}
    </Modal>
  );
}

function PreviewRows({ p, exists }: { p: ParsedProduct; exists: boolean }) {
  return (
    <>
      <tr className="border-b border-border">
        <td className="px-2.5 py-1.5 font-bold text-teal">{p.productCode}</td>
        <td className="px-2.5 py-1.5 font-semibold">{p.name}</td>
        <td className="px-2.5 py-1.5 font-mono text-[11px]">{p.sku}</td>
        <td className="px-2.5 py-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.isSingle ? 'bg-teal-l text-teal' : 'bg-[#4a42b022] text-[#6d5fd0]'}`}>
            {p.isSingle ? 'Single' : 'Assembly'}
          </span>
        </td>
        <td className="px-2.5 py-1.5 tabular-nums">{p.unitPrice ? `£${p.unitPrice.toFixed(2)}` : '—'}</td>
        <td className="px-2.5 py-1.5">
          <span className={`text-[10px] font-bold ${exists ? 'text-amber' : 'text-teal'}`}>{exists ? '↻ Update' : '+ New'}</span>
        </td>
      </tr>
      {p.parts.map((pt, i) => (
        <tr key={i} className="border-b border-border bg-surface2/50">
          <td className="px-2.5 py-1" />
          <td className="px-2.5 py-1 text-[11px] text-text3">└ {pt.detail}</td>
          <td className="px-2.5 py-1 font-mono text-[10px] text-text3">{pt.drawing ?? ''}</td>
          <td className="px-2.5 py-1 text-[10px] text-text3">{pt.hrs}h</td>
          <td colSpan={2} />
        </tr>
      ))}
    </>
  );
}
