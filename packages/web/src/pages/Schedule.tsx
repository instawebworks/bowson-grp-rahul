import { useSchedule } from '../lib/hooks';
import { Card, Content, Metric, PageHeader, QueryState, Table } from '../components/ui';

export function Schedule() {
  const { data, isLoading, error } = useSchedule();

  return (
    <>
      <PageHeader title="Schedule" sub="Weekly production capacity" />
      <Content>
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <Metric label="Operatives" value={data ? data.operativeCount : '…'} />
          <Metric label="Weekly capacity" value={data ? `${data.weeklyCapacity} h` : '…'} sub="5 days × hrs/op" />
          <Metric
            label="Committed (next 8 wks)"
            value={data ? `${Math.round(data.weeks.reduce((s, w) => s + w.committedHrs, 0))} h` : '…'}
          />
        </div>

        <Card title="By week">
          <Table head={['Week', 'Tickets', 'Committed', 'Capacity', 'Utilisation']}>
            <QueryState isLoading={isLoading} error={error} colSpan={5} />
            {!isLoading && !error && (data?.weeks.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-xs text-text3">No scheduled weeks.</td></tr>
            )}
            {(data?.weeks ?? []).map((w) => {
              const over = w.utilisation > 100;
              const hue = Math.max(0, Math.min(120, 120 - (w.utilisation / 100) * 120)); // green→red
              return (
                <tr key={w.key} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{w.wc}</td>
                  <td className="px-3 py-2 tabular-nums text-text2">{w.ticketCount}</td>
                  <td className="px-3 py-2 tabular-nums">{w.committedHrs} h</td>
                  <td className="px-3 py-2 tabular-nums text-text3">{w.capacityHrs} h</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface3">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(100, w.utilisation)}%`, backgroundColor: `hsl(${hue} 65% 45%)` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${over ? 'text-red' : 'text-text2'}`}>
                        {w.utilisation}%{over ? ' ⚠' : ''}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
        <p className="mt-3 text-[11px] text-text3">
          Committed = remaining labour hours (ticket hours × the fraction left at its stage) for tickets whose target
          production week falls in that week. Set an order's deadline/target week from its Edit dialog.
        </p>
      </Content>
    </>
  );
}
