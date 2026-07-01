import { useRef, useState } from 'react';
import { useCatalogue, useCreateCatalogue, useDeleteCatalogue, type CatalogueFormInput } from '../lib/hooks';
import { Button, Card, Content, Modal, PageHeader, QueryState, Table } from '../components/ui';
import { CatalogueForm } from '../components/CatalogueForm';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { parseCsv } from '../lib/csv';
import type { Catalogue as Cat } from '../lib/types';

const isSingle = (c: Cat) => c.singlePiece || c.parts.length <= 1;
const typeOf = (c: Cat) => (isSingle(c) ? 'Single Slide' : 'Assembly');

function totalHrs(c: Cat): number {
  if (isSingle(c)) return c.assemblyHrs || c.parts[0]?.hrs || 0;
  return c.parts.reduce((s, p) => s + (p.hrs || 0), 0) + (c.assemblyHrs || 0);
}

export function Catalogue() {
  const { data, isLoading, error } = useCatalogue();
  const rows = data ?? [];
  const [detail, setDetail] = useState<Cat | null>(null);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreateCatalogue();
  const del = useDeleteCatalogue();
  const { canManage } = useAuth();

  function exportCsv() {
    const header = ['product_code', 'name', 'sku', 'type', 'sell_price', 'assembly_hrs', 'part_detail', 'part_code', 'part_hrs'];
    const lines: string[][] = [header];
    for (const c of rows) {
      lines.push([c.productCode, c.name, c.code ?? '', isSingle(c) ? 'SINGLE' : 'ASSEMBLY', String(c.unitPrice), String(c.assemblyHrs), '', '', '']);
      if (!isSingle(c)) for (const p of c.parts) lines.push(['', '', '', '', '', '', p.detail, p.drawing ?? '', String(p.hrs)]);
    }
    const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = lines.map((r) => r.map(q).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bowson_catalogue_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMsg(null);
    const parsed = parseCsv(await file.text());
    // Build templates: a row with product_code starts a template; blank rows add parts.
    const templates: CatalogueFormInput[] = [];
    for (const r of parsed) {
      const code = (r.product_code ?? r['product_code'] ?? '').trim();
      if (code) {
        templates.push({
          productCode: code,
          name: (r.name ?? '').trim(),
          code: (r.sku ?? '').trim() || null,
          unitPrice: Number(r.sell_price ?? r.price ?? 0) || 0,
          singlePiece: (r.type ?? '').trim().toUpperCase() === 'SINGLE',
          assemblyHrs: Number(r.assembly_hrs ?? 0) || 0,
          parts: [],
          hardware: [],
        });
      } else {
        const detailTxt = (r.part_detail ?? '').trim();
        const cur = templates[templates.length - 1];
        if (detailTxt && cur) cur.parts!.push({ detail: detailTxt, drawing: (r.part_code ?? '').trim() || null, hrs: Number(r.part_hrs ?? 0) || 0 });
      }
    }
    let ok = 0;
    let fail = 0;
    for (const t of templates.filter((t) => t.productCode && t.name)) {
      try { await create.mutateAsync(t); ok++; } catch { fail++; }
    }
    setImportMsg(`Imported ${ok} template${ok === 1 ? '' : 's'}${fail ? `, ${fail} skipped (e.g. duplicate code)` : ''}.`);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <>
      {detail && (
        <CatalogueDetail cat={detail} canManage={canManage} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />
      )}
      {editing && <CatalogueForm catalogue={editing} onClose={() => setEditing(null)} />}
      {showCreate && <CatalogueForm onClose={() => setShowCreate(false)} />}
      <PageHeader title="Product Catalogue" sub={`${rows.length} template${rows.length === 1 ? '' : 's'}`} globalActions={false} />
      <Content>
        {/* Toolbar */}
        {canManage && (
          <div className="mb-3 flex items-center justify-end gap-1.5">
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onImport} />
            <Button onClick={() => fileRef.current?.click()} disabled={create.isPending}>{create.isPending ? 'Importing…' : '⭱ Import CSV'}</Button>
            <Button onClick={exportCsv}>⭳ Export CSV</Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ New template</Button>
          </div>
        )}
        {importMsg && <div className="mb-3 rounded-md bg-teal-l/50 px-3 py-2 text-xs text-teal">{importMsg}</div>}

        <Card>
          <Table head={['Code', 'Product name', 'SKU', 'Type', 'Parts', 'Hours', 'Spec', 'Sell Price £', '']}>
            <QueryState isLoading={isLoading} error={error} colSpan={9} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">No templates yet. Click “+ New template” to add one.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => setDetail(c)}>
                <td className="px-3 py-2 font-bold text-teal">{c.productCode}</td>
                <td className="px-3 py-2 font-semibold">{c.name}</td>
                <td className="px-3 py-2 text-text3">{c.code ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={typeOf(c) === 'Assembly' ? { background: '#4a42b022', color: '#6d5fd0' } : { background: '#0c6b5022', color: '#0c6b50' }}>
                    {typeOf(c)}
                  </span>
                </td>
                <td className="px-3 py-2 text-text3">{isSingle(c) ? '1 piece' : `${c.parts.length} parts`}</td>
                <td className="px-3 py-2 text-text3">{totalHrs(c)}h</td>
                <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                  {c.specUrl ? (
                    <a href={c.specUrl} target="_blank" rel="noreferrer" title="View specification" className="text-base">📄</a>
                  ) : (
                    <span className="text-text3" title="No specification uploaded">✕</span>
                  )}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">{money(c.unitPrice)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {canManage && (
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => setEditing(c)}>Edit</Button>
                      <Button
                        variant="danger"
                        disabled={del.isPending}
                        onClick={async () => { if (confirm(`Delete "${c.name}" from the catalogue?`)) await del.mutateAsync(c.id); }}
                      >
                        Delete
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}

function CatalogueDetail({ cat, canManage, onClose, onEdit }: { cat: Cat; canManage: boolean; onClose: () => void; onEdit: () => void }) {
  const del = useDeleteCatalogue();
  return (
    <Modal
      title={cat.name}
      sub={`Code: ${cat.productCode}${cat.code ? ` · SKU: ${cat.code}` : ''}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        canManage ? (
          <>
            <Button
              variant="danger"
              disabled={del.isPending}
              onClick={async () => {
                if (!confirm(`Delete "${cat.name}" from the catalogue?`)) return;
                await del.mutateAsync(cat.id);
                onClose();
              }}
            >
              Delete
            </Button>
            <Button variant="primary" onClick={onEdit}>Edit</Button>
          </>
        ) : undefined
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Type', typeOf(cat)],
          ['Total hours', `${totalHrs(cat)}h`],
          ['Sell price', money(cat.unitPrice)],
          ['Drawing', cat.drawing ?? '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border bg-surface2 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text3">{l}</div>
            <div className="text-xs font-medium">{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Parts / components</div>
      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <Table head={['Part', 'Drawing', 'Hrs']}>
          {cat.parts.length === 0 && <tr><td colSpan={3} className="px-3 py-3 text-center text-xs text-text3">No parts defined</td></tr>}
          {cat.parts.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5">{p.detail}</td>
              <td className="px-3 py-1.5 text-text3">{p.drawing ?? '—'}</td>
              <td className="px-3 py-1.5 tabular-nums text-text2">{p.hrs}</td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Hardware</div>
      {cat.hardware.length ? (
        <ul className="space-y-1">
          {cat.hardware.map((h) => (
            <li key={h.id} className="flex justify-between text-xs"><span>{h.name}</span><span className="text-text3">×{h.qty}</span></li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-text3">—</div>
      )}
    </Modal>
  );
}
