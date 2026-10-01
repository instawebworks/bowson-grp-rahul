import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { generateSku } from '@bowson/shared';
import {
  useCatalogue,
  useCatalogueParts,
  useCreateCatalogue,
  useDeleteCatalogue,
  useDeleteCataloguePart,
  type CatalogueFormInput,
} from '../lib/hooks';
import { Button, Card, ConfirmDialog, Content, Modal, PageHeader, QueryState, Table } from '../components/ui';
import { CatalogueForm } from '../components/CatalogueForm';
import { CatalogueImportWizard } from '../components/CatalogueImportWizard';
import { PartForm } from '../components/PartForm';
import { SpecModal } from '../components/SpecModal';
import { useAuth } from '../lib/auth';
import { money } from '../lib/format';
import { isSingle, partContribution, productTotals, qtyLabel } from '../lib/catalogue';
import { downloadCsv } from '../lib/csv';
import { apiClient } from '../lib/api';
import type { Catalogue as Cat, CataloguePart } from '../lib/types';

type Tab = 'products' | 'parts';
const typeOf = (c: Cat) => (isSingle(c) ? 'Single Slide' : 'Assembly');

/**
 * Product Catalogue — two tabs (client email 1 Oct 2026, "flip the way we
 * do it"): the PARTS LIBRARY of unique moulded pieces, and the PRODUCTS built
 * from them. Hours and prices live on the parts and roll up.
 */
export function Catalogue() {
  const { data, isLoading, error } = useCatalogue();
  const rows = data ?? [];
  const [tab, setTab] = useState<Tab>('products');
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
  const { data: library } = useCatalogueParts();

  function exportCsv() {
    const header = ['product_code', 'name', 'sku', 'type', 'sell_price', 'part_code', 'part_detail', 'part_qty', 'part_lam_hrs', 'part_fin_hrs', 'part_price', 'part_mould'];
    const lines: string[][] = [header];
    for (const c of rows) {
      lines.push([c.productCode, c.name, c.code ?? '', isSingle(c) ? 'SINGLE' : 'ASSEMBLY', String(c.unitPrice), '', '', '', '', '', '', '']);
      for (const p of c.parts) {
        lines.push(['', '', '', '', '', p.drawing ?? '', p.detail, qtyLabel(p.qty) === '½' ? '0.5' : '1', String(p.lamHrs ?? p.hrs), String(p.finHrs ?? 0), String(p.price), p.mould?.ref ?? '']);
      }
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

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
        tab === t ? 'border-teal text-teal' : 'border-transparent text-text2 hover:text-text'
      }`}
    >
      {label}
    </button>
  );

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
              Its library parts stay. Orders already created from this product are not affected. This cannot be undone.
            </>
          }
          confirmLabel="Delete product"
          busy={del.isPending}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => {
            await del.mutateAsync(confirmDel.id);
            setConfirmDel(null);
          }}
        />
      )}
      <PageHeader
        title="Product Catalogue"
        sub={`${rows.length} product${rows.length === 1 ? '' : 's'} · ${(library ?? []).length} library part${(library ?? []).length === 1 ? '' : 's'}`}
        globalActions={false}
      />
      <Content>
        {/* Tabs */}
        <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border">
          {tabBtn('products', `📦 Products (${rows.length})`)}
          {tabBtn('parts', `🧩 Parts Library (${(library ?? []).length})`)}
          {canManage && tab === 'products' && (
            <span className="ml-auto mb-1.5 flex items-center gap-1.5">
              <Button onClick={() => setShowImport(true)}>⭱ Import CSV</Button>
              <Button onClick={exportCsv}>⭳ Export CSV</Button>
              <Button onClick={() => setShowSkuGen(true)}>⚙ Generate SKUs</Button>
              <Button variant="primary" onClick={() => setShowCreate(true)}>+ New product</Button>
            </span>
          )}
        </div>

        {tab === 'parts' ? (
          <PartsLibrary parts={library ?? []} canManage={canManage} />
        ) : (
          <Card>
            <Table head={['Code', 'Product name', 'SKU', 'Type', 'Parts', 'Lam h', 'Fin h', 'Total h', 'Spec', 'Sell Price £', '']}>
              <QueryState isLoading={isLoading} error={error} colSpan={11} />
              {!isLoading && !error && rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-10 text-center text-xs text-text3">No products yet. Create parts in the library, then “+ New product” to build one.</td></tr>
              )}
              {rows.map((c) => {
                const t = productTotals(c.parts);
                return (
                  <tr key={c.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => setDetail(c)}>
                    <td className="px-3 py-2 font-bold text-teal">{c.productCode}</td>
                    <td className="max-w-80 truncate px-3 py-2 font-semibold" title={c.name}>{c.name}</td>
                    <td className="px-3 py-2 text-text3">{c.code ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={typeOf(c) === 'Assembly' ? { background: '#4a42b022', color: '#6d5fd0' } : { background: '#0c6b5022', color: '#0c6b50' }}>
                        {typeOf(c)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-text3">{c.parts.length === 1 ? '1 piece' : `${c.parts.length} pieces`}</td>
                    <td className="px-3 py-2 tabular-nums text-text3">{t.lam}</td>
                    <td className="px-3 py-2 tabular-nums text-text3">{t.fin}</td>
                    <td className="px-3 py-2 font-semibold tabular-nums">{t.hrs}h</td>
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
                );
              })}
            </Table>
          </Card>
        )}
      </Content>
    </>
  );
}

// ─── Parts library tab ───────────────────────────────────────────────────────
function PartsLibrary({ parts, canManage }: { parts: CataloguePart[]; canManage: boolean }) {
  const [filter, setFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CataloguePart | null>(null);
  const [confirmDel, setConfirmDel] = useState<CataloguePart | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const del = useDeleteCataloguePart();

  const visible = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f
      ? parts.filter((p) => [p.drawing, p.detail, p.mould?.ref].filter(Boolean).join(' ').toLowerCase().includes(f))
      : parts;
    return [...list].sort((a, b) => (a.drawing ?? '').localeCompare(b.drawing ?? '') || a.detail.localeCompare(b.detail));
  }, [parts, filter]);

  const exportParts = () =>
    downloadCsv('bowson_parts_library.csv', [
      { key: 'code', label: 'part_code', value: (p: CataloguePart) => p.drawing ?? '' },
      { key: 'detail', label: 'part_detail', value: (p: CataloguePart) => p.detail },
      { key: 'lam', label: 'part_lam_hrs', value: (p: CataloguePart) => p.lamHrs ?? p.hrs },
      { key: 'fin', label: 'part_fin_hrs', value: (p: CataloguePart) => p.finHrs ?? 0 },
      { key: 'price', label: 'part_price', value: (p: CataloguePart) => p.price },
      { key: 'mould', label: 'part_mould', value: (p: CataloguePart) => p.mould?.ref ?? '' },
      { key: 'used', label: 'used_in_products', value: (p: CataloguePart) => p.usedBy ?? 0 },
    ], visible);

  return (
    <>
      {showCreate && <PartForm onClose={() => setShowCreate(false)} />}
      {editing && <PartForm part={editing} onClose={() => setEditing(null)} />}
      {confirmDel && (
        <ConfirmDialog
          title={`Delete part "${confirmDel.drawing ?? confirmDel.detail}"?`}
          message={<><strong>{confirmDel.detail}</strong> is removed from the parts library. This cannot be undone.</>}
          confirmLabel="Delete part"
          busy={del.isPending}
          onCancel={() => setConfirmDel(null)}
          onConfirm={async () => {
            setDelError(null);
            try {
              await del.mutateAsync(confirmDel.id);
              setConfirmDel(null);
            } catch (e) {
              setConfirmDel(null);
              setDelError((e as Error).message);
            }
          }}
        />
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by code / detail / mould…"
          className="w-72 rounded-md border border-border2 bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-teal"
        />
        <span className="text-[11px] text-text3">
          One row per unique moulded piece. Products are built from these — enter hours and price here, once.
        </span>
        {canManage && (
          <span className="ml-auto flex items-center gap-1.5">
            <Button onClick={exportParts}>⭳ Export parts</Button>
            <Button variant="primary" onClick={() => setShowCreate(true)}>+ New part</Button>
          </span>
        )}
      </div>
      {delError && <div className="mb-3 rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">{delError}</div>}
      <Card>
        <Table head={['Part code', 'Detail', 'Mould', 'Lam h', 'Fin h', 'Total h', 'Price £', 'Used in', '']}>
          {visible.length === 0 && (
            <tr><td colSpan={9} className="px-3 py-10 text-center text-xs text-text3">{filter ? 'No parts match the filter.' : 'No parts yet. Click “+ New part” to add the first one.'}</td></tr>
          )}
          {visible.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0 hover:bg-teal-l/40">
              <td className="px-3 py-2 font-mono text-[11px] font-bold text-teal">{p.drawing ?? '—'}</td>
              <td className="max-w-96 truncate px-3 py-2 font-medium" title={p.detail}>{p.detail}</td>
              <td className="px-3 py-2 text-text2">{p.mould?.ref ?? <span className="text-amber">— none —</span>}</td>
              <td className="px-3 py-2 tabular-nums text-text2">{p.lamHrs ?? p.hrs}</td>
              <td className="px-3 py-2 tabular-nums text-text2">{p.finHrs ?? 0}</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{partContribution(p).hrs}h</td>
              <td className="px-3 py-2 font-semibold tabular-nums">{money(p.price)}</td>
              <td className="px-3 py-2 text-[11px] text-text3">{p.usedBy ? `${p.usedBy} product${p.usedBy === 1 ? '' : 's'}` : '—'}</td>
              <td className="px-3 py-2">
                {canManage && (
                  <div className="flex justify-end gap-1.5">
                    <Button onClick={() => setEditing(p)}>Edit</Button>
                    <Button
                      variant="danger"
                      disabled={del.isPending || !!p.usedBy}
                      title={p.usedBy ? 'Remove this part from its products before deleting it' : undefined}
                      onClick={() => setConfirmDel(p)}
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
    </>
  );
}

function CatalogueDetail({ cat, canManage, onClose, onEdit }: { cat: Cat; canManage: boolean; onClose: () => void; onEdit: () => void }) {
  const del = useDeleteCatalogue();
  const [askDelete, setAskDelete] = useState(false);
  const t = productTotals(cat.parts);
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
          ['Total hours', `${t.hrs}h (${t.lam} lam · ${t.fin} fin)`],
          ['Sell price', money(cat.unitPrice)],
          ['Drawing', cat.drawing ?? '—'],
        ].map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border bg-surface2 px-3 py-2">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text3">{l}</div>
            <div className="text-xs font-medium">{v}</div>
          </div>
        ))}
      </div>

      <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Parts — built from the library</div>
      <div className="mb-4 overflow-hidden rounded-lg border border-border">
        <Table head={['Code', 'Part', 'Mould qty', 'Lam h', 'Fin h', 'Price']}>
          {cat.parts.length === 0 && <tr><td colSpan={6} className="px-3 py-3 text-center text-xs text-text3">No parts linked</td></tr>}
          {cat.parts.map((p) => {
            const c = partContribution(p);
            return (
              <tr key={p.linkId ?? p.id} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 font-mono text-[11px] text-text2">{p.drawing ?? '—'}</td>
                <td className="px-3 py-1.5">{p.detail}</td>
                <td className="px-3 py-1.5 text-center font-bold">{qtyLabel(p.qty)}</td>
                <td className="px-3 py-1.5 tabular-nums text-text2">{c.lam}</td>
                <td className="px-3 py-1.5 tabular-nums text-text2">{c.fin}</td>
                <td className="px-3 py-1.5 tabular-nums text-text2">{money(c.price)}</td>
              </tr>
            );
          })}
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
              <strong>{cat.productCode} · {cat.name}</strong> is removed from the catalogue. Its library parts stay.
              Orders already created from this product are not affected. This cannot be undone.
            </>
          }
          confirmLabel="Delete product"
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

/** Bulk SKU generator — auto-builds SKUs for products that have none
 * (prototype generateSku), previews them, and saves in one go. */
function SkuGeneratorModal({ catalogue, onClose }: { catalogue: Cat[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  // Generate for every product missing a SKU, keeping uniqueness against
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
        await apiClient.patch(`/api/catalogue/${p.id}`, { code: p.sku } satisfies Partial<CatalogueFormInput>);
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
        Auto-builds shop-floor SKUs from the product name (height, rotation, lanes, MK…). Only products without a SKU are affected.
      </p>
      {preview.length === 0 ? (
        <div className="py-6 text-center text-xs text-text3">All products already have a SKU. ✓</div>
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
