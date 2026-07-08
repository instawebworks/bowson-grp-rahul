import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompleteOrder, useOrders } from '../lib/hooks';
import { Button, Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { buildDespatchHtml, buildInvoiceHtml, openDocument, type DocTicket } from '../lib/documents';
import type { Order } from '../lib/types';

/** The order's despatched tickets with the order attached (for the documents). */
function despatchedTickets(o: Order): DocTicket[] {
  return (o.tickets ?? []).filter((t) => t.status === 'Despatched').map((t) => ({ ...t, order: o }));
}

const docDate = (ts: DocTicket[], o: Order) =>
  ts[0]?.despatchDate ?? o.deadline?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

/**
 * Despatched — ported from the prototype's renderDespatched. Order-level list
 * with document actions: reprint the Delivery Note, Print Invoice (marks the
 * order Completed), and Copy Invoice for already-completed orders.
 */
export function Despatched() {
  const { data, isLoading, error } = useOrders();
  const complete = useCompleteOrder();
  const navigate = useNavigate();

  const rows = useMemo(() => {
    return (data ?? [])
      .filter(
        (o) =>
          ['Despatched', 'Completed'].includes(o.status) ||
          (o.tickets ?? []).some((t) => t.status === 'Despatched'),
      )
      .sort((a, b) => {
        const da = despatchedTickets(a)[0]?.despatchDate ?? a.deadline ?? '';
        const db = despatchedTickets(b)[0]?.despatchDate ?? b.deadline ?? '';
        return db.localeCompare(da);
      });
  }, [data]);

  function reprintDeliveryNote(o: Order) {
    const ts = despatchedTickets(o);
    if (!ts.length) return;
    openDocument(buildDespatchHtml(ts, docDate(ts, o), false));
  }

  function reprintInvoice(o: Order) {
    const ts = despatchedTickets(o);
    if (!ts.length) return;
    openDocument(buildInvoiceHtml(ts, docDate(ts, o)), 960, 720);
  }

  /** Print the invoice, then mark the order Completed (prototype printInvoiceAndComplete). */
  function printInvoiceAndComplete(o: Order) {
    reprintInvoice(o);
    complete.mutate(o.id);
  }

  return (
    <>
      <PageHeader title="Despatched" sub={`${rows.length} order${rows.length === 1 ? '' : 's'}`} />
      <Content>
        {complete.isError && (
          <div className="mb-3 rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
            Could not mark completed — {(complete.error as Error).message}
          </div>
        )}
        <Card>
          <Table head={['Order #', 'Customer Ref', 'Status', 'Tickets', 'Despatched', '']}>
            <QueryState isLoading={isLoading} error={error} colSpan={6} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-xs text-text3">No despatched orders yet.</td></tr>
            )}
            {rows.map((o) => {
              const ts = o.tickets ?? [];
              const despatched = ts.filter((t) => t.status === 'Despatched');
              const isCompleted = o.status === 'Completed';
              const despDate = despatched[0]?.despatchDate ?? o.deadline?.slice(0, 10) ?? '—';
              const isPartial = despatched.some((t) => t.partialDespatch);
              return (
                <tr
                  key={o.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <td className="px-3 py-2"><span className="font-bold text-teal">{o.orderNumber}</span></td>
                  <td className="max-w-40 truncate px-3 py-2 text-text2">{o.siteName ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={isCompleted ? 'Completed' : 'Despatched'} />
                    {isPartial && !isCompleted && (
                      <span className="ml-1.5 rounded bg-amber-l px-1 py-0.5 text-[9px] font-bold text-amber">PARTIAL</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px]">{despatched.length} of {ts.length} tickets</td>
                  <td className="px-3 py-2 text-[11px]">{despDate}</td>
                  <td className="whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button title="Reprint delivery note" onClick={() => reprintDeliveryNote(o)}>
                        📄 Delivery Note
                      </Button>
                      {isCompleted ? (
                        <Button title="Reprint invoice" onClick={() => reprintInvoice(o)}>
                          🖨 Copy Invoice
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          title="Print invoice and mark complete"
                          disabled={complete.isPending}
                          onClick={() => printInvoiceAndComplete(o)}
                        >
                          🖨 Print Invoice
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
