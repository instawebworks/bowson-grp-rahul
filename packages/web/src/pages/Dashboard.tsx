import { useDashboard } from '../lib/hooks';
import { Content, Metric, PageHeader } from '../components/ui';

export function Dashboard() {
  const { data, isLoading, error } = useDashboard();

  return (
    <>
      <PageHeader title="Dashboard" sub="Production overview" />
      <Content>
        {error && (
          <div className="mb-4 rounded-lg border border-dashed border-border2 bg-surface p-4 text-xs text-text3">
            Could not load dashboard — {(error as Error).message}. Check the API is running and Supabase is configured.
          </div>
        )}

        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text3">Orders</div>
        <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Total" value={fmt(data?.orders.total, isLoading)} />
          <Metric label="Pending" value={fmt(data?.orders.pending, isLoading)} />
          <Metric label="In Progress" value={fmt(data?.orders.inProgress, isLoading)} tone="green" />
          <Metric label="Ready" value={fmt(data?.orders.readyToDespatch, isLoading)} tone="blue" />
          <Metric label="Despatched" value={fmt(data?.orders.despatched, isLoading)} />
          <Metric
            label="Overdue"
            value={fmt(data?.orders.overdue, isLoading)}
            tone={data && data.orders.overdue > 0 ? 'red' : 'default'}
          />
        </div>

        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text3">Moulds</div>
        <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Metric label="In Use" value={fmt(data?.moulds.inUse, isLoading)} tone="amber" />
          <Metric label="Available" value={fmt(data?.moulds.available, isLoading)} tone="green" />
          <Metric label="Maintenance" value={fmt(data?.moulds.maintenance, isLoading)} />
          <Metric label="Utilisation" value={data ? `${data.moulds.utilisation}%` : '—'} />
        </div>

        <div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-text3">Tickets</div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Metric label="Live (in production)" value={fmt(data?.tickets.live, isLoading)} tone="green" />
          <Metric label="Pre-production" value={fmt(data?.tickets.preProduction, isLoading)} tone="amber" sub="Spec / Materials" />
        </div>
      </Content>
    </>
  );
}

function fmt(n: number | undefined, loading: boolean): string {
  if (loading) return '…';
  return n === undefined ? '—' : String(n);
}
