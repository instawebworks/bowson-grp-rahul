import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateSku } from '@bowson/shared';
import { useCatalogue, useCreateCatalogue, useDeleteCatalogue, type CatalogueFormInput } from '../lib/hooks';
import { Button, Card, ConfirmDialog, Content, Modal, PageHeader, QueryState, Table } from '../components/ui';
import { CatalogueForm } from '../components/CatalogueForm';
import { CatalogueImportWizard } from '../components/CatalogueImportWizard';
import { SpecModal } from '../components/SpecModal';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { parseCsv } from '../lib/csv';
import { apiClient } from '../lib/api';
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
  const [showSkuGen, setShowSkuGen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [specView, setSpecView] = useState<Cat | null>(null);
  const [confirmDel, setConfirmDel] = useState<Cat | null>(null);
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

  return (
    <>
      {detail && (
        <CatalogueDetail cat={detail} canManage={canManage} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />
      )}
      {editing && <CatalogueForm catalogue={editing} onClose={() => setEditing(null)} />}
      {showCreate && <CatalogueForm onClose={() => setShowCreate(false)} />}
      {showSkuGen && <SkuGeneratorModal catalogue={rows} onClose={() => setShowSkuGen(false)} />}
      {showImport && <CatalogueImportWizard catalogue={rows} onClose={() => setShowImport(false)} />}
      {specView && <SpecModal template={specView} onClose={() => setSpecView(null)} />}
      {confirmDel && (
        <ConfirmDialog
          title={`Delete "${confirmDel.name}"?`}
          message={
            <>
              <strong>{confirmDel.productCode} · {confirmDel.name}</strong> is removed from the catalogue.
              Orders already created from this template are not affected. This cannot be undone.
            </>
          }
          confirmLabel="Delete template"
          busy={del.isPending}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => {
            await del.mutateAsync(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}
      <PageHeader title="Product Catalogue" sub={`${rows.length} template${rows.length === 1 ? '' : 's'}`} globalActions={false} />
      <Content>
        {/* Toolbar */}
        {canManage && (
          <div className="mb-3 flex items-center justify-end gap-1.5">
            <Button onClick={() => setShowImport(true)}>⭱ Import CSV</Button>
            <Button onClick={exportCsv}>⭳ Export CSV</Button>
            <Button onClick={() => setShowSkuGen(true)}>⚙ Generate SKUs</Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ New template</Button>
          </div>
        )}

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
                    <button title="View specification (B&W)" className="text-base" onClick={() => setSpecView(c)}>📄</button>
                  ) : (
                    <span className="text-text3" title="No specification uploaded">✕</span>
                  )}
                </td>
                <td className="px-3 py-2 font-semibold tabular-nums">{money(c.unitPrice)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  {canManage && (
                    <div className="flex justify-end gap-1.5">
                      <Button onClick={() => setEditing(c)}>Edit</Button>
                      <Button variant="danger" disabled={del.isPending} onClick={() => setConfirmDel(c)}>
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
  const [askDelete, setAskDelete] = useState(false);
  return (
    <Modal
      title={cat.name}
      sub={`Code: ${cat.productCode}${cat.code ? ` · SKU: ${cat.code}` : ''}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        canManage ? (
          <>
            <Button variant="danger" disabled={del.isPending} onClick={() => setAskDelete(true)}>
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

      {askDelete && (
        <ConfirmDialog
          title={`Delete "${cat.name}"?`}
          message={
            <>
              <strong>{cat.productCode} · {cat.name}</strong> is removed from the catalogue. Orders already
              created from this template are not affected. This cannot be undone.
            </>
          }
          confirmLabel="Delete template"
          busy={del.isPending}
          onCancel={() => setAskDelete(false)}
          onConfirm={async () => {
            await del.mutateAsync(cat.id);
            setAskDelete(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

/** Bulk SKU generator — auto-builds SKUs for templates that have none
 * (prototype generateSku), previews them, and saves in one go. */
function SkuGeneratorModal({ catalogue, onClose }: { catalogue: Cat[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  // Generate for every template missing a SKU, keeping uniqueness against
  // both existing SKUs and the ones generated earlier in this pass.
  const preview = useMemo(() => {
    const known: { code: string | null; productCode: string }[] = catalogue.map((c) => ({ code: c.code, productCode: c.productCode }));
    const out: { id: number; productCode: string; name: string; sku: string }[] = [];
    for (const c of catalogue) {
      if (c.code) continue;
      const sku = generateSku(c.productCode, c.name, known);
      known.push({ code: sku, productCode: c.productCode });
      out.push({ id: c.id, productCode: c.productCode, name: c.name, sku });
    }
    return out;
  }, [catalogue]);

  async function save() {
    setBusy(true);
    let n = 0;
    try {
      for (const p of preview) {
        await apiClient.patch(`/api/catalogue/${p.id}`, { code: p.sku });
        n++;
        setDone(n);
      }
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['catalogue'] });
      onClose();
    }
  }

  return (
    <Modal
      title="⚙ Generate SKUs"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!preview.length || busy} onClick={() => void save()}>
            {busy ? `Saving… ${done}/${preview.length}` : `Save ${preview.length} SKU${preview.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-text2">
        Auto-builds shop-floor SKUs from the product name (height, rotation, lanes, MK…). Only templates without a SKU are affected.
      </p>
      {preview.length === 0 ? (
        <div className="py-6 text-center text-xs text-text3">All templates already have a SKU. ✓</div>
      ) : (
        <Table head={['Code', 'Product', 'Generated SKU']}>
          {preview.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 text-[11px] font-bold text-teal">{p.productCode}</td>
              <td className="max-w-56 truncate px-3 py-1.5 text-xs">{p.name}</td>
              <td className="px-3 py-1.5 font-mono text-xs font-bold">{p.sku}</td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
