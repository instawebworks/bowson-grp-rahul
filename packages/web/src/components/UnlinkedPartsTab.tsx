import { useState } from 'react';
import { useSetPartMould } from '../lib/hooks';
import { Button, Card, Table } from './ui';
import { PartForm } from './PartForm';
import type { CataloguePart, Mould } from '../lib/types';

/**
 * Moulds → "Unlinked Catalogue": library parts with no default mould. Linking
 * a part here means every product built from it — and every new ticket —
 * knows which mould to use. One row per unique part now, not one per product
 * copy (client: "flip the catalogue").
 */
export function UnlinkedPartsTab({ parts, moulds }: { parts: CataloguePart[]; moulds: Mould[] }) {
  const setMould = useSetPartMould();
  const [busyPart, setBusyPart] = useState<number | null>(null);
  const [editing, setEditing] = useState<CataloguePart | null>(null);
  const unlinked = parts.filter((p) => !p.mouldId);

  async function link(partId: number, mouldId: number) {
    setBusyPart(partId);
    try {
      await setMould.mutateAsync({ id: partId, mouldId });
    } finally {
      setBusyPart(null);
    }
  }

  if (unlinked.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface py-14 text-center">
        <div className="mb-2 text-4xl">✓</div>
        <div className="text-sm font-bold text-text2">All library parts linked</div>
        <div className="mt-1 text-xs text-text3">Every part in the library has a default mould assigned.</div>
      </div>
    );
  }

  return (
    <>
      {editing && <PartForm part={editing} onClose={() => setEditing(null)} />}
      <div className="mb-3 text-xs text-text3">
        {unlinked.length} library part{unlinked.length === 1 ? '' : 's'} with no default mould.
        Linking them here means every product built from them automatically knows which mould to use.
      </div>
      <Card>
        <Table head={['Part code', 'Detail', 'Lam h', 'Fin h', 'Used in', 'Link mould', '']}>
          {unlinked.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-[11px] font-bold text-teal">{p.drawing ?? '—'}</td>
              <td className="max-w-96 truncate px-3 py-1.5" title={p.detail}>{p.detail}</td>
              <td className="px-3 py-1.5 tabular-nums text-text2">{p.lamHrs ?? p.hrs}</td>
              <td className="px-3 py-1.5 tabular-nums text-text2">{p.finHrs ?? 0}</td>
              <td className="px-3 py-1.5 text-[11px] text-text3">{p.usedBy ? `${p.usedBy} product${p.usedBy === 1 ? '' : 's'}` : '—'}</td>
              <td className="px-3 py-1.5">
                <select
                  value=""
                  disabled={busyPart === p.id}
                  onChange={(e) => e.target.value && void link(p.id, Number(e.target.value))}
                  className="rounded-md border border-teal bg-surface px-1.5 py-1 text-[11px] outline-none"
                >
                  <option value="">— Select a mould —</option>
                  {moulds.map((m) => (
                    <option key={m.id} value={m.id}>{m.ref}{m.name ? ` (${m.name.slice(0, 40)})` : ''}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5 text-right">
                <Button onClick={() => setEditing(p)}>Edit part →</Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
