import { useCatalogue } from '../lib/hooks';
import { Card, Content, PageHeader, Table } from '../components/ui';
import { money } from '../lib/format';

export function Catalogue() {
  const { data, isLoading, error } = useCatalogue();
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Product Catalogue" sub={`${rows.length} template${rows.length === 1 ? '' : 's'}`} />
      <Content>
        {error && (
          <div className="mb-4 rounded-lg border border-dashed border-border2 bg-surface p-4 text-xs text-text3">
            Could not load catalogue — {(error as Error).message}.
          </div>
        )}
        {isLoading && <div className="text-xs text-text3">Loading…</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border2 bg-surface p-8 text-center text-xs text-text3">
            No catalogue templates yet.
          </div>
        )}
        <div className="grid gap-3">
          {rows.map((c) => {
            const totalHrs = c.parts.reduce((s, p) => s + p.hrs, 0);
            return (
              <Card
                key={c.id}
                title={`${c.name}  ·  ${c.code ?? c.productCode}`}
                actions={<span className="text-xs font-semibold tabular-nums">{money(c.unitPrice)}</span>}
              >
                <div className="grid grid-cols-1 gap-0 lg:grid-cols-[2fr_1fr]">
                  <div className="border-b border-border lg:border-b-0 lg:border-r">
                    <Table head={['Part', 'Drawing', 'Hrs']}>
                      {c.parts.map((p) => (
                        <tr key={p.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-1.5">{p.detail}</td>
                          <td className="px-3 py-1.5 text-text3">{p.drawing ?? '—'}</td>
                          <td className="px-3 py-1.5 tabular-nums text-text2">{p.hrs}</td>
                        </tr>
                      ))}
                      <tr className="bg-surface2 font-semibold">
                        <td className="px-3 py-1.5" colSpan={2}>Total build hours</td>
                        <td className="px-3 py-1.5 tabular-nums">{totalHrs}</td>
                      </tr>
                    </Table>
                  </div>
                  <div className="p-3">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-text3">Hardware</div>
                    {c.hardware.length ? (
                      <ul className="space-y-1">
                        {c.hardware.map((h) => (
                          <li key={h.id} className="flex justify-between text-xs">
                            <span>{h.name}</span>
                            <span className="text-text3">×{h.qty}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-text3">—</div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Content>
    </>
  );
}
