import { useSearchParams, useNavigate } from 'react-router-dom';
import { useSearch } from '../lib/hooks';
import { Card, Content, PageHeader, StatusPill, Table, inputClass } from '../components/ui';

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const navigate = useNavigate();
  const { data, isLoading } = useSearch(q);

  return (
    <>
      <PageHeader title="Search" sub={q ? `Results for “${q}”` : 'Find orders & tickets'} />
      <Content>
        <input
          autoFocus
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
          placeholder="Order number, site, ticket # or detail…"
          className={`${inputClass} mb-4 max-w-md`}
        />

        {!q && <div className="text-xs text-text3">Type to search.</div>}
        {q && isLoading && <div className="text-xs text-text3">Searching…</div>}

        {q && !isLoading && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Orders (${data?.orders.length ?? 0})`}>
              <Table head={['Order #', 'Site', 'Status']}>
                {(data?.orders ?? []).length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-xs text-text3">No matching orders.</td></tr>
                )}
                {(data?.orders ?? []).map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    <td className="px-3 py-2 font-semibold">{o.orderNumber}</td>
                    <td className="px-3 py-2 text-text2">{o.siteName ?? '—'}</td>
                    <td className="px-3 py-2"><StatusPill status={o.status} /></td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card title={`Tickets (${data?.tickets.length ?? 0})`}>
              <Table head={['TN', 'Detail', 'Order', 'Status']}>
                {(data?.tickets ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-xs text-text3">No matching tickets.</td></tr>
                )}
                {(data?.tickets ?? []).map((t) => (
                  <tr
                    key={t.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                    onClick={() => navigate(`/orders/${t.orderId}`)}
                  >
                    <td className="px-3 py-2 tabular-nums text-text3">{t.tn ?? '—'}</td>
                    <td className="max-w-[260px] truncate px-3 py-2">{t.detail}</td>
                    <td className="px-3 py-2 font-medium">{t.order?.orderNumber ?? `#${t.orderId}`}</td>
                    <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </Content>
    </>
  );
}
