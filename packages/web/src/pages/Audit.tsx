import { useAudit } from '../lib/hooks';
import { Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Audit() {
  const { data, isLoading, error } = useAudit();
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Activity Log" sub={`${rows.length} recent change${rows.length === 1 ? '' : 's'}`} />
      <Content>
        <Card>
          <Table head={['When', 'Entity', 'Field', 'Change', 'Note']}>
            <QueryState isLoading={isLoading} error={error} colSpan={5} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-xs text-text3">No activity yet.</td></tr>
            )}
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-text2">{fmtDateTime(a.at)}</td>
                <td className="px-3 py-2 capitalize">{a.entityType} #{a.entityId}</td>
                <td className="px-3 py-2 text-text2">{a.field ?? '—'}</td>
                <td className="px-3 py-2">
                  {a.field === 'status' && a.toValue ? (
                    <div className="flex items-center gap-1.5">
                      {a.fromValue && <StatusPill status={a.fromValue} />}
                      <span className="text-text3">→</span>
                      <StatusPill status={a.toValue} />
                    </div>
                  ) : (
                    <span className="text-text2">{a.fromValue ?? '—'} → {a.toValue ?? '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-text3">{a.note ?? '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}
