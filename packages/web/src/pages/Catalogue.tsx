import { useState } from 'react';
import { useCatalogue } from '../lib/hooks';
import { Card, Content, Modal, PageHeader, QueryState, Table } from '../components/ui';
import { money } from '../lib/format';
import type { Catalogue as Cat } from '../lib/types';

const typeOf = (c: Cat) => (c.parts.length > 1 ? 'Assembly' : 'Single Slide');
const totalHrs = (c: Cat) => c.parts.reduce((s, p) => s + p.hrs, 0);

export function Catalogue() {
  const { data, isLoading, error } = useCatalogue();
  const rows = data ?? [];
  const [detail, setDetail] = useState<Cat | null>(null);

  return (
    <>
      {detail && <CatalogueDetail cat={detail} onClose={() => setDetail(null)} />}
      <PageHeader title="Product Catalogue" sub={`${rows.length} template${rows.length === 1 ? '' : 's'}`} />
      <Content>
        <Card>
          <Table head={['Code', 'Product name', 'SKU', 'Type', 'Parts', 'Hours', 'Sell Price']}>
            <QueryState isLoading={isLoading} error={error} colSpan={7} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-xs text-text3">No catalogue templates yet.</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40" onClick={() => setDetail(c)}>
                <td className="px-3 py-2 font-bold text-teal">{c.productCode}</td>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-text2">{c.code ?? '—'}</td>
                <td className="px-3 py-2">
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-bold" style={typeOf(c) === 'Assembly' ? { background: '#f3f0fd', color: '#4a42b0' } : { background: '#dff2eb', color: '#0c6b50' }}>
                    {typeOf(c)}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums text-text2">{c.parts.length > 1 ? c.parts.length : '1 piece'}</td>
                <td className="px-3 py-2 tabular-nums text-text2">{totalHrs(c)}</td>
                <td className="px-3 py-2 tabular-nums font-semibold">{money(c.unitPrice)}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}

function CatalogueDetail({ cat, onClose }: { cat: Cat; onClose: () => void }) {
  return (
    <Modal title={cat.name} sub={`Code: ${cat.productCode}${cat.code ? ` · SKU: ${cat.code}` : ''}`} onClose={onClose} width="max-w-2xl">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Type', typeOf(cat)],
          ['Total hours', String(totalHrs(cat))],
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
