import { useMoulds } from '../lib/hooks';
import { Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';

export function Moulds() {
  const { data, isLoading, error } = useMoulds();
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Moulds" sub={`${rows.length} mould${rows.length === 1 ? '' : 's'}`} />
      <Content>
        <Card>
          <Table head={['Ref', 'Name', 'Capacity', 'Status', 'Notes']}>
            <QueryState isLoading={isLoading} error={error} colSpan={5} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-xs text-text3">
                  No moulds yet.
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-semibold">{m.ref}</td>
                <td className="px-3 py-2">{m.name ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums text-text2">{m.qty}</td>
                <td className="px-3 py-2"><StatusPill status={m.status} /></td>
                <td className="px-3 py-2 text-text2">{m.notes ?? '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}
