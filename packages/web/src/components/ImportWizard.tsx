import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DESPATCH, RESIN_TYPES } from '@bowson/shared';
import { apiClient } from '../lib/api';
import { useCatalogue, useCustomers, useOrders, type AddTicketInput } from '../lib/hooks';
import type { Catalogue, Customer, Order } from '../lib/types';
import { Button, Modal } from './ui';

// ── CSV import wizard: orders + tickets in one file ────────────────────────
// Mirrors the t-card.html prototype: one row per slide, order info on the first
// row of each order (blank fields carry forward). Slide codes are matched to the
// catalogue; assemblies expand into COMP + PART tickets server-side.

interface ParsedOrder {
  orderNumber: string;
  customerName: string;
  siteName: string;
  deadline: string;
  despatch: string;
  resin: string;
  notes: string;
}

interface ParsedSlide {
  orderNumber: string;
  slideCode: string;
  catalogueId: number | null;
  catalogueName: string | null;
  singlePiece: boolean;
  partCount: number;
  spec: string;
  /** Template part names (assemblies) and per-part spec overrides —
   * blank entries inherit the slide colour (prototype part_specs). */
  partNames: string[];
  partSpecs: string[];
  qty: number;
  unitPrice: string;
  ticketsDesc: string;
  ticketsCount: number;
}

interface ParseResult {
  orders: ParsedOrder[];
  tickets: ParsedSlide[];
  errors: string[];
  warnings: string[];
}

const STEPS = ['Download template', 'Upload CSV', 'Review orders', 'Review colours', 'Review tickets', 'Confirm'];
const EMPTY: ParseResult = { orders: [], tickets: [], errors: [], warnings: [] };

/** Match a slide code to a catalogue entry (product code first, then SKU). */
function matchCat(code: string, catalogue: Catalogue[]): Catalogue | null {
  const c = code.trim();
  const stripped = c.replace(/^0+/, '');
  return (
    catalogue.find(
      (cat) =>
        String(cat.productCode) === c ||
        String(cat.productCode) === stripped ||
        cat.code === c ||
        (cat.code != null && cat.code.toLowerCase() === c.toLowerCase()),
    ) ?? null
  );
}

/** Split one CSV line into cells, honouring quoted fields. */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse the wizard CSV into orders + slide rows with validation. */
function parseImport(text: string, catalogue: Catalogue[]): ParseResult {
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ...EMPTY, errors: ['File appears empty.'] };

  const headers = parseLine(lines[0]!).map((h) =>
    h.toLowerCase().replace(/\*/g, '').replace(/\s*\(.*?\)/g, '').trim(),
  );
  const get = (row: string[], key: string) => {
    const i = headers.indexOf(key);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  const orders: ParsedOrder[] = [];
  const tickets: ParsedSlide[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const validResin = RESIN_TYPES.map((r) => r.toLowerCase());
  let lastOrder: string | null = null;

  lines.slice(1).forEach((line, ri) => {
    const row = parseLine(line);
    if (row.every((c) => !c.trim())) return;
    const rowNo = ri + 2;

    let orderNum = get(row, 'order_number').trim();
    if (!orderNum) {
      if (!lastOrder) {
        errors.push(`Row ${rowNo}: no order context for continuation row.`);
        return;
      }
      orderNum = lastOrder;
    }

    if (!orders.find((o) => o.orderNumber === orderNum)) {
      const custName = get(row, 'customer_name').trim();
      const siteName = (get(row, 'customer_ref') || get(row, 'site_name') || custName).trim();
      const despatch = get(row, 'despatch_method').trim();
      const resin = get(row, 'resin_type').trim();
      if (despatch && !(DESPATCH as readonly string[]).includes(despatch.toUpperCase())) {
        errors.push(`Row ${rowNo}: invalid despatch_method "${despatch}" — must be ${DESPATCH.join(' or ')}.`);
        return;
      }
      if (resin && !validResin.includes(resin.toLowerCase())) {
        errors.push(`Row ${rowNo}: invalid resin_type "${resin}" — must be ${RESIN_TYPES.join(' or ')}.`);
        return;
      }
      orders.push({
        orderNumber: orderNum,
        customerName: custName,
        siteName,
        deadline: get(row, 'deadline').trim().replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1'),
        despatch: despatch.toUpperCase() || DESPATCH[0],
        resin: RESIN_TYPES.find((r) => r.toLowerCase() === resin.toLowerCase()) ?? 'Standard',
        notes: get(row, 'notes').trim(),
      });
    }
    lastOrder = orderNum;

    const code = (get(row, 'slide_code') || get(row, 'product_code') || get(row, 'product code')).trim();
    if (!code) {
      warnings.push(`Row ${rowNo}: no slide code — skipped.`);
      return;
    }
    const qty = parseInt(get(row, 'qty'), 10) || 1;
    const spec = get(row, 'spec').trim();
    const price = get(row, 'price').trim();
    const cat = matchCat(code, catalogue);
    const isSingle = !cat || cat.singlePiece || cat.parts.length <= 1;
    let ticketsDesc: string;
    let ticketsCount: number;
    if (cat) {
      ticketsDesc = isSingle ? `${qty}× MADE` : `${qty}× (${cat.parts.length} PART + 1 COMP)`;
      ticketsCount = isSingle ? qty : (cat.parts.length + 1) * qty;
    } else {
      ticketsDesc = `${qty}× MADE (not in catalogue)`;
      ticketsCount = qty;
      warnings.push(`Row ${rowNo}: slide code "${code}" not in catalogue.`);
    }

    const partNames = cat && !isSingle ? cat.parts.map((pt) => pt.detail) : [];
    tickets.push({
      orderNumber: orderNum,
      slideCode: code,
      catalogueId: cat ? cat.id : null,
      catalogueName: cat ? cat.name : null,
      singlePiece: isSingle,
      partCount: cat ? cat.parts.length : 0,
      spec,
      partNames,
      partSpecs: partNames.map(() => ''),
      qty,
      unitPrice: price,
      ticketsDesc,
      ticketsCount,
    });
  });

  if (orders.length === 0 && errors.length === 0) errors.push('No valid orders found in CSV.');
  return { orders, tickets, errors, warnings };
}

/** Build + download the CSV template (seeded with up to 3 catalogue examples). */
function downloadTemplate(catalogue: Catalogue[]) {
  const headers = [
    'order_number',
    'customer_name',
    'customer_ref',
    'deadline (YYYY-MM-DD)',
    'despatch_method (BOWSON TO ARRANGE DELIVERY or CUSTOMER TO COLLECT)',
    'resin_type (Standard or M2)',
    'notes',
    'slide_code (product code from master catalogue)',
    'qty',
    'spec',
    'price',
  ];
  const specs = ['Blue RAL 5002', 'Red RAL 3020', 'Yellow RAL 1021'];
  const rows: string[][] = [];
  const cats = catalogue.slice(0, 3);
  if (cats.length) {
    cats.forEach((cat, i) => {
      rows.push([
        i === 0 ? '25099' : '',
        i === 0 ? 'Acme Leisure' : '',
        i === 0 ? 'Acme Park Site' : '',
        i === 0 ? '2026-09-15' : '',
        i === 0 ? DESPATCH[0] : '',
        i === 0 ? 'Standard' : '',
        '',
        cat.productCode || cat.code || '',
        '1',
        specs[i] ?? '',
        String(cat.unitPrice ?? ''),
      ]);
    });
    const c2 = catalogue[0];
    rows.push(['25100', 'Blue Planet', 'Blue Planet Flumes', '2026-10-01', DESPATCH[1], 'M2', '', c2 ? c2.productCode || c2.code || '' : '', '2', 'Green RAL 6018', c2 ? String(c2.unitPrice) : '']);
  } else {
    rows.push(['25099', 'Acme Leisure', 'Acme Park', '2026-09-15', DESPATCH[0], 'Standard', '', '10420', '1', 'Blue RAL 5002', '1250']);
    rows.push(['', '', '', '', '', '', '', '10430', '1', 'Red RAL 3020', '980']);
  }
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'grp_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportWizard({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: catalogue } = useCatalogue();
  const { data: orders } = useOrders();
  const { data: customers } = useCustomers();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParseResult>(EMPTY);
  const [status, setStatus] = useState<string | null>(null);
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const cats = catalogue ?? [];
  const existingNums = useMemo(() => new Set((orders ?? []).map((o) => o.orderNumber)), [orders]);
  const unmatched = parsed.tickets.filter((t) => t.catalogueId == null);
  const matched = parsed.tickets.filter((t) => t.catalogueId != null);

  const priceChanges = matched.filter((t) => {
    if (t.unitPrice === '') return false;
    const cat = cats.find((c) => c.id === t.catalogueId);
    const catPrice = cat?.unitPrice ?? 0;
    return Math.abs(Number(t.unitPrice) - catPrice) > 0.005;
  });
  const totalTickets = matched.reduce((a, t) => a + t.ticketsCount, 0);
  const totalValue = matched.reduce((a, t) => a + (Number(t.unitPrice) || 0) * t.qty, 0);

  function onFile(file: File) {
    setStatus('Reading file…');
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseImport(String(reader.result), cats);
      setParsed(res);
      setStatus(`✓ Parsed ${res.orders.length} order(s), ${res.tickets.length} slide(s).`);
      setStep(3);
    };
    reader.readAsText(file);
  }

  async function runImport() {
    setImporting(true);
    const custList: Customer[] = [...(customers ?? [])];
    let okOrders = 0;
    let okTickets = 0;
    let failed = 0;

    for (const o of parsed.orders) {
      if (existingNums.has(o.orderNumber)) continue;
      try {
        let customerId: number | null = null;
        if (o.customerName) {
          const found = custList.find((c) => c.name.toLowerCase() === o.customerName.toLowerCase());
          if (found) customerId = found.id;
          else {
            const nc = await apiClient.post<Customer>('/api/customers', { name: o.customerName });
            custList.push(nc);
            customerId = nc.id;
          }
        }
        const order = await apiClient.post<Order>('/api/orders', {
          orderNumber: o.orderNumber,
          customerId,
          siteName: o.siteName || null,
          despatch: o.despatch,
          resinType: o.resin,
          deadline: o.deadline || null,
          notes: o.notes || null,
          isDraft: false,
        });
        okOrders++;

        const slides = parsed.tickets.filter((t) => t.orderNumber === o.orderNumber);
        for (const s of slides) {
          for (let q = 0; q < s.qty; q++) {
            const body: AddTicketInput =
              s.catalogueId != null
                ? {
                    fromCatalogueId: s.catalogueId,
                    colour: s.spec || undefined,
                    spec: s.spec || null,
                    resinType: o.resin,
                    ...(s.partSpecs.some(Boolean) ? { partSpecs: s.partSpecs.map((ps) => ps || null) } : {}),
                    ...(s.unitPrice !== '' ? { unitPrice: Number(s.unitPrice) } : {}),
                  }
                : {
                    type: 'MADE',
                    detail: s.slideCode,
                    colour: s.spec || undefined,
                    spec: s.spec || null,
                    resinType: o.resin,
                    ...(s.unitPrice !== '' ? { unitPrice: Number(s.unitPrice) } : {}),
                  };
            await apiClient.post(`/api/orders/${order.id}/tickets`, body);
            okTickets += s.ticketsCount / s.qty;
          }
        }
      } catch {
        failed++;
      }
    }

    qc.invalidateQueries({ queryKey: ['orders'] });
    qc.invalidateQueries({ queryKey: ['customers'] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    setImporting(false);
    setResult(
      `Imported ${okOrders} order(s) and ${Math.round(okTickets)} ticket(s).${failed ? ` ${failed} order(s) failed.` : ''}`,
    );
  }

  const stepBar = (
    <div className="mb-5 flex overflow-hidden rounded-md border border-border">
      {STEPS.map((s, i) => {
        const active = i + 1 === step;
        const done = i + 1 < step;
        return (
          <div
            key={s}
            className={`flex-1 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide ${
              active ? 'bg-teal text-white' : done ? 'bg-teal-l text-teal' : 'bg-surface2 text-text3'
            }`}
          >
            {done ? '✓ ' : ''}
            {s}
          </div>
        );
      })}
    </div>
  );

  const footer =
    result != null ? (
      <Button variant="primary" onClick={onClose}>Done</Button>
    ) : (
      <Button onClick={onClose}>Cancel</Button>
    );

  return (
    <Modal title="Import Orders" sub="CSV wizard — orders and tickets in one file" onClose={onClose} width="max-w-3xl" footer={footer}>
      {result != null ? (
        <div className="rounded-lg border border-teal bg-teal-l/40 px-4 py-6 text-center text-sm font-medium text-teal">{result}</div>
      ) : (
        <>
          {stepBar}

          {step === 1 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 1 — Download the template</div>
              <p className="mb-3 text-xs text-text3">
                Download the CSV template, fill in your orders and slide details, then upload it in Step 2.
              </p>
              <Button variant="primary" onClick={() => downloadTemplate(cats)}>⬇ Download CSV template</Button>
              <div className="mt-4 space-y-1 text-[11px] leading-relaxed text-text3">
                <div><strong>One row per slide.</strong> Order info on the first row only — blank fields carry forward for the same order.</div>
                <div><strong>Columns:</strong> order_number, customer_name, customer_ref, deadline, despatch_method, resin_type, notes, slide_code, qty, spec, price</div>
                <div><strong>slide_code</strong> = product code from your master catalogue (e.g. 10420).</div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button variant="primary" onClick={() => setStep(2)}>Next: Upload CSV →</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 2 — Upload your CSV</div>
              <label
                className="block cursor-pointer rounded-lg border-2 border-dashed border-border px-6 py-8 text-center hover:border-teal"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) onFile(f);
                }}
              >
                <div className="mb-2 text-3xl">📂</div>
                <div className="mb-1 text-sm font-bold">Click to browse or drag &amp; drop</div>
                <div className="text-[11px] text-text3">.csv files only</div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onFile(f);
                  }}
                />
              </label>
              {status && <div className="mt-3 text-xs text-teal">{status}</div>}
              <div className="mt-5 flex justify-start">
                <Button onClick={() => setStep(1)}>← Back</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 3 — Review orders ({parsed.orders.length})</div>
              {parsed.errors.length > 0 && (
                <div className="mb-3 rounded-md border border-red bg-red/5 px-3 py-2 text-xs text-red">
                  <strong>{parsed.errors.length} error(s)</strong>
                  {parsed.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
              {parsed.warnings.length > 0 && (
                <div className="mb-3 rounded-md border border-amber bg-amber-l px-3 py-2 text-xs text-amber">
                  <strong>{parsed.warnings.length} warning(s)</strong>
                  {parsed.warnings.map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-left text-[10px] uppercase text-text3">
                    <tr>
                      <th className="px-3 py-2">Order #</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Customer ref</th>
                      <th className="px-3 py-2">Deadline</th><th className="px-3 py-2">Despatch</th><th className="px-3 py-2">Resin</th><th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.orders.map((o) => (
                      <tr key={o.orderNumber} className="border-t border-border">
                        <td className="px-3 py-1.5 font-semibold">{o.orderNumber}</td>
                        <td className="px-3 py-1.5">{o.customerName || '—'}</td>
                        <td className="px-3 py-1.5">{o.siteName || '—'}</td>
                        <td className="px-3 py-1.5">{o.deadline || '—'}</td>
                        <td className="px-3 py-1.5 text-[10px]">{o.despatch}</td>
                        <td className="px-3 py-1.5">{o.resin}</td>
                        <td className="px-3 py-1.5">
                          {existingNums.has(o.orderNumber)
                            ? <span className="font-semibold text-amber">⚠ Exists (skipped)</span>
                            : <span className="font-semibold text-teal">✓ New</span>}
                        </td>
                      </tr>
                    ))}
                    {parsed.orders.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-text3">No orders</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex justify-between">
                <Button onClick={() => setStep(2)}>← Back</Button>
                {parsed.errors.length === 0 && parsed.orders.length > 0 && (
                  <Button variant="primary" onClick={() => setStep(4)}>Next: Review colours →</Button>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 4 — Review &amp; edit colours / spec</div>
              <p className="mb-3 text-[11px] text-text3">Edit the colour/spec for each slide. Assembly parts inherit the slide colour.</p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-left text-[10px] uppercase text-text3">
                    <tr><th className="px-3 py-2">Order</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Colour / Spec</th><th className="px-3 py-2">Type</th></tr>
                  </thead>
                  <tbody>
                    {parsed.tickets.map((t, ti) => (
                      <tr key={ti} className="border-t border-border">
                        <td className="px-3 py-1.5 font-semibold">{t.orderNumber}</td>
                        <td className="px-3 py-1.5 font-medium">{t.catalogueName ?? t.slideCode}</td>
                        <td className="px-3 py-1.5 text-[10px] text-text3">{t.slideCode}</td>
                        <td className="px-3 py-1.5">
                          <input
                            value={t.spec}
                            placeholder="e.g. Blue RAL 5002"
                            onChange={(e) =>
                              setParsed((p) => ({ ...p, tickets: p.tickets.map((x, j) => (j === ti ? { ...x, spec: e.target.value } : x)) }))
                            }
                            className="w-full rounded border border-teal px-2 py-1 text-xs font-medium outline-none"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-[10px] text-text3">{t.singlePiece ? 'Single' : `Assembly — ${t.partCount} parts`}</td>
                      </tr>
                    )).flatMap((row, ti) => [
                      row,
                      ...parsed.tickets[ti]!.partNames.map((pn, pj) => (
                        <tr key={`${ti}-p${pj}`} className="border-t border-border bg-surface2/50">
                          <td className="px-3 py-1" />
                          <td className="px-3 py-1 text-[10px] text-text3">└ {pn}</td>
                          <td className="px-3 py-1" />
                          <td className="px-3 py-1">
                            <input
                              value={parsed.tickets[ti]!.partSpecs[pj] ?? ''}
                              placeholder="inherit slide colour"
                              onChange={(e) =>
                                setParsed((p) => ({
                                  ...p,
                                  tickets: p.tickets.map((x, j) =>
                                    j === ti
                                      ? { ...x, partSpecs: x.partSpecs.map((ps, k) => (k === pj ? e.target.value : ps)) }
                                      : x,
                                  ),
                                }))
                              }
                              className="w-full rounded border border-border2 px-2 py-0.5 text-[11px] outline-none focus:border-teal"
                            />
                          </td>
                          <td className="px-3 py-1" />
                        </tr>
                      )),
                    ])}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex justify-between">
                <Button onClick={() => setStep(3)}>← Back</Button>
                <Button variant="primary" onClick={() => setStep(5)}>Next: Review tickets →</Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 5 — Review tickets ({parsed.tickets.length} slides)</div>
              {unmatched.length > 0 && (
                <div className="mb-3 rounded-md border border-red bg-red/5 px-3 py-2 text-xs text-red">
                  <strong>⛔ {unmatched.length} slide code(s) not found in the catalogue.</strong> Add them to the catalogue first, or remove those rows:{' '}
                  {unmatched.map((t) => t.slideCode).join(', ')}
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-surface2 text-left text-[10px] uppercase text-text3">
                    <tr><th className="px-3 py-2">Order #</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Catalogue match</th><th className="px-3 py-2">Spec</th><th className="px-3 py-2 text-center">Qty</th><th className="px-3 py-2">Tickets</th><th className="px-3 py-2">Price £</th></tr>
                  </thead>
                  <tbody>
                    {parsed.tickets.map((t, ti) => (
                      <tr key={ti} className="border-t border-border">
                        <td className="px-3 py-1.5 font-semibold">{t.orderNumber}</td>
                        <td className="px-3 py-1.5 font-semibold text-teal">{t.slideCode}</td>
                        <td className="px-3 py-1.5">
                          {t.catalogueId != null
                            ? <span className="font-semibold text-teal">✓ {t.catalogueName}</span>
                            : <span className="font-bold text-red">⛔ Not found</span>}
                        </td>
                        <td className="px-3 py-1.5">{t.spec || '—'}</td>
                        <td className="px-3 py-1.5 text-center">{t.qty}</td>
                        <td className="px-3 py-1.5 text-[10px] text-text3">{t.ticketsDesc}</td>
                        <td className="px-3 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={t.unitPrice}
                            placeholder="£"
                            onChange={(e) =>
                              setParsed((p) => ({ ...p, tickets: p.tickets.map((x, j) => (j === ti ? { ...x, unitPrice: e.target.value } : x)) }))
                            }
                            className="w-20 rounded border border-border px-1.5 py-1 text-xs outline-none focus:border-teal"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-5 flex justify-between">
                <Button onClick={() => setStep(4)}>← Back</Button>
                {unmatched.length === 0
                  ? <Button variant="primary" onClick={() => setStep(6)}>Next: Confirm →</Button>
                  : <span className="self-center text-[11px] font-semibold text-red">⛔ Resolve unmatched codes first</span>}
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Step 6 — Confirm import</div>
              {priceChanges.length > 0 && (
                <div className="mb-4 rounded-md border-2 border-amber bg-amber-l px-4 py-3">
                  <strong className="text-amber">⚠ {priceChanges.length} price change(s) from catalogue</strong>
                  <table className="mt-2 w-full text-[11px]">
                    <thead className="text-left text-text3"><tr><th className="py-1">Slide</th><th className="py-1 text-right">Catalogue</th><th className="py-1 text-right">Import</th><th className="py-1 text-right">Diff</th></tr></thead>
                    <tbody>
                      {priceChanges.map((t, i) => {
                        const cat = cats.find((c) => c.id === t.catalogueId);
                        const catPrice = cat?.unitPrice ?? 0;
                        const imp = Number(t.unitPrice) || 0;
                        const diff = imp - catPrice;
                        return (
                          <tr key={i}>
                            <td className="py-0.5">{t.catalogueName}</td>
                            <td className="py-0.5 text-right">£{catPrice.toFixed(2)}</td>
                            <td className="py-0.5 text-right font-bold">£{imp.toFixed(2)}</td>
                            <td className={`py-0.5 text-right ${diff > 0 ? 'text-teal' : 'text-red'}`}>{diff > 0 ? '+' : ''}£{diff.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={priceConfirmed} onChange={(e) => setPriceConfirmed(e.target.checked)} />
                    I have reviewed and confirmed these price changes
                  </label>
                </div>
              )}
              <div className="mb-4 grid grid-cols-3 gap-3">
                {[
                  [parsed.orders.filter((o) => !existingNums.has(o.orderNumber)).length, 'Orders'],
                  [totalTickets, 'Tickets'],
                  [`£${totalValue.toFixed(2)}`, 'Total value'],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-lg border border-border bg-surface px-4 py-4 text-center">
                    <div className="text-2xl font-bold text-teal">{v}</div>
                    <div className="text-[11px] text-text3">{l}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-md bg-surface2 px-4 py-3 text-xs text-text2">
                All orders imported as <strong>Pending</strong> for review. Tickets are created from catalogue templates (assemblies expand into COMP + PART).
              </div>
              <div className="mt-5 flex justify-between">
                <Button onClick={() => setStep(5)}>← Back</Button>
                <Button
                  variant="primary"
                  disabled={importing || (priceChanges.length > 0 && !priceConfirmed)}
                  onClick={runImport}
                >
                  {importing ? 'Importing…' : '✓ Import now'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
