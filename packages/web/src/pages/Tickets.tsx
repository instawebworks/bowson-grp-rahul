import { useTickets } from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, QueryState, StatusPill, Table } from '../components/ui';
import { money } from '../lib/format';
import { downloadCsv } from '../lib/csv';

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

export function Tickets() {
  const { data, isLoading, error } = useTickets();
  const rows = data ?? [];

  return (
    <>
      <PageHeader
        title="All Tickets"
        sub={`${rows.length} ticket${rows.length === 1 ? '' : 's'}`}
        actions={
          <Button
            onClick={() =>
              downloadCsv('tickets.csv', [
                { key: 'tn', label: 'TN', value: (t) => t.tn ?? '' },
                { key: 'type', label: 'Type', value: (t) => t.type },
                { key: 'order', label: 'Order', value: (t) => t.order?.orderNumber ?? `#${t.orderId}` },
                { key: 'detail', label: 'Detail', value: (t) => t.detail },
                { key: 'status', label: 'Status', value: (t) => t.status },
                { key: 'pct', label: 'Progress %', value: (t) => t.pct },
                { key: 'assigned', label: 'Assigned', value: (t) => (t.assignments ?? []).map((a) => a.operative?.name).filter(Boolean).join('; ') },
                { key: 'value', label: 'Value', value: (t) => t.netPrice },
              ], rows)
            }
          >
            ⭳ Export CSV
          </Button>
        }
      />
      <Content>
        <Card>
          <Table head={['TN', 'Type', 'Order', 'Detail', 'Status', 'Progress', 'Assigned', 'Value']}>
            <QueryState isLoading={isLoading} error={error} colSpan={8} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-xs text-text3">
                  No tickets yet.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const ts = TYPE_STYLE[t.type] ?? TYPE_STYLE.RAW!;
              const names = (t.assignments ?? []).map((a) => a.operative?.name).filter(Boolean);
              return (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 tabular-nums text-text2">{t.tn ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: ts.bg, color: ts.color }}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{t.order?.orderNumber ?? `#${t.orderId}`}</td>
                  <td className="max-w-[280px] truncate px-3 py-2">{t.detail}</td>
                  <td className="px-3 py-2"><StatusPill status={t.status} /></td>
                  <td className="px-3 py-2"><ProgressBar pct={t.pct} /></td>
                  <td className="px-3 py-2 text-text2">{names.length ? names.join(', ') : '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{money(t.netPrice)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
