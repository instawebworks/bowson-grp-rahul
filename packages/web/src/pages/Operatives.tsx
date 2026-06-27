import { useOperatives } from '../lib/hooks';
import { Card, Content, PageHeader, QueryState, Table } from '../components/ui';

export function Operatives() {
  const { data, isLoading, error } = useOperatives();
  const rows = data ?? [];

  return (
    <>
      <PageHeader title="Operatives & Settings" sub={`${rows.length} operative${rows.length === 1 ? '' : 's'}`} />
      <Content>
        <Card>
          <Table head={['Name', 'Skills', 'Default hrs/day']}>
            <QueryState isLoading={isLoading} error={error} colSpan={3} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-10 text-center text-xs text-text3">
                  No operatives yet.
                </td>
              </tr>
            )}
            {rows.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-semibold">{o.name}</td>
                <td className="px-3 py-2">
                  {o.skills.length ? (
                    <div className="flex flex-wrap gap-1">
                      {o.skills.map((s) => (
                        <span key={s} className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] text-text2">
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text3">—</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-text2">{o.defaultHrs ?? '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}
