import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrders } from '../lib/hooks';
import { Button, Card, Content, PageHeader, ProgressBar, QueryState, StatusPill, Table } from '../components/ui';
import { OrderForm } from '../components/OrderForm';
import { daysToDeadline, fmtDate, money } from '../lib/format';
import type { Order } from '../lib/types';

interface Props {
  title?: string;
  sub?: string;
  /** Restrict to these order statuses (e.g. ['Despatched']). */
  statuses?: string[];
}

function orderProgress(o: Order): number {
  const ts = o.tickets ?? [];
  if (ts.length === 0) return 0;
  return Math.round(ts.reduce((s, t) => s + (t.pct ?? 0), 0) / ts.length);
}

export function Orders({ title = 'All Orders', sub, statuses }: Props) {
  const { data, isLoading, error } = useOrders();
  const rows = (data ?? []).filter((o) => !statuses || statuses.includes(o.status));
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  return (
    <>
      {showCreate && <OrderForm onClose={() => setShowCreate(false)} />}
      <PageHeader
        title={title}
        sub={sub ?? `${rows.length} order${rows.length === 1 ? '' : 's'}`}
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New Order</Button>}
      />
      <Content>
        <Card>
          <Table head={['Order #', 'Customer', 'Site', 'Status', 'Progress', 'Deadline', 'Value']}>
            <QueryState isLoading={isLoading} error={error} colSpan={7} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-xs text-text3">
                  No orders yet.
                </td>
              </tr>
            )}
            {rows.map((o) => {
              const days = daysToDeadline(o.deadline);
              const overdue = days !== null && days < 0 && !['Despatched', 'Completed', 'Cancelled'].includes(o.status);
              return (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <td className="px-3 py-2 font-semibold">{o.orderNumber}</td>
                  <td className="px-3 py-2">{o.customer?.name ?? '—'}</td>
                  <td className="px-3 py-2 text-text2">{o.siteName ?? '—'}</td>
                  <td className="px-3 py-2"><StatusPill status={o.status} /></td>
                  <td className="px-3 py-2"><ProgressBar pct={orderProgress(o)} /></td>
                  <td className="px-3 py-2">
                    <span style={overdue ? { color: '#922020', fontWeight: 600 } : undefined}>
                      {fmtDate(o.deadline)}
                      {days !== null && (
                        <span className="ml-1 text-[10px] text-text3">
                          ({days < 0 ? `${-days}d late` : `${days}d`})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{money(o.value)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
