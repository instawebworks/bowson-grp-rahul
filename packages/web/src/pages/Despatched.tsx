import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompleteOrder, useOrders } from '../lib/hooks';
import { Button, Card, Content, PageHeader, QueryState, StatusPill, Table } from '../components/ui';
import { GroupControls, useOrderGroups } from '../components/OrderGroups';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { TypeBadge } from './Tickets';
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
 * order Completed), and Copy Invoice for already-completed orders. Each order
 * row opens to show its tickets underneath (client snag #25), consistent with
 * the other ticket views.
 */
export function Despatched() {
  const { data, isLoading, error } = useOrders();
  const complete = useCompleteOrder();
  const navigate = useNavigate();
  const og = useOrderGroups();
  const [detailId, setDetailId] = useState<number | null>(null);
  const COLS = 7;

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
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}
      <PageHeader title="Despatched" sub={`${rows.length} order${rows.length === 1 ? '' : 's'}`} />
      <Content>
        {complete.isError && (
          <div className="mb-3 rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
            Could not mark completed — {(complete.error as Error).message}
          </div>
        )}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <GroupControls onExpand={og.expandAll} onCollapse={og.collapseAll} />
          <span className="text-[11px] text-text3">Click an order to see its tickets</span>
        </div>
        <Card>
          <Table head={['Order #', 'Customer', 'Customer Ref', 'Status', 'Tickets', 'Despatched', '']}>
            <QueryState isLoading={isLoading} error={error} colSpan={COLS} />
            {!isLoading && !error && rows.length === 0 && (
              <tr><td colSpan={COLS} className="px-3 py-10 text-center text-xs text-text3">No despatched orders yet.</td></tr>
            )}
            {rows.map((o) => {
              const ts = o.tickets ?? [];
              const despatched = ts.filter((t) => t.status === 'Despatched');
              const isCompleted = o.status === 'Completed';
              const despDate = despatched[0]?.despatchDate ?? o.deadline?.slice(0, 10) ?? '—';
              const isPartial = despatched.some((t) => t.partialDespatch);
              const open = og.isOpen(o.id);
              // Top-level tickets first, each followed by its parts.
              const ordered = ts
                .filter((t) => t.compParentId == null)
                .flatMap((t) => [t, ...ts.filter((p) => p.compParentId === t.id)]);
              return [
                <tr
                  key={o.id}
                  className="cursor-pointer select-none border-b border-border hover:bg-teal-l/40"
                  onClick={() => og.toggle(o.id)}
                  title={open ? 'Collapse this order' : 'Expand to see its tickets'}
                >
                  <td className="px-3 py-2">
                    <span className="mr-1.5 text-[10px] text-text3">{open ? '▾' : '▸'}</span>
                    <span className="font-bold text-teal">{o.orderNumber}</span>
                  </td>
                  <td className="max-w-35 truncate px-3 py-2">{o.customer?.name ?? '—'}</td>
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
                      <Button title="Open order" onClick={() => navigate(`/orders/${o.id}`)}>View</Button>
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
                </tr>,
                ...(open ? ordered : []).map((t) => (
                  <tr
                    key={`t-${t.id}`}
                    className="cursor-pointer border-b border-border bg-surface2/40 hover:bg-teal-l/40"
                    onClick={() => setDetailId(t.id)}
                  >
                    <td className={`px-3 py-1.5 text-[11px] tabular-nums text-text3 ${t.compParentId != null ? 'pl-12' : 'pl-8'}`}>
                      ↳ #{t.tn ?? 'TBC'}
                    </td>
                    <td className="px-3 py-1.5"><TypeBadge type={t.type} /></td>
                    <td colSpan={2} className="max-w-72 truncate px-3 py-1.5 text-[11px]" title={t.detail}>
                      {t.detail}
                      {t.spec && <span className="ml-1.5 text-text3">{t.spec}</span>}
                    </td>
                    <td className="px-3 py-1.5"><StatusPill status={t.status} /></td>
                    <td className="px-3 py-1.5 text-[11px] text-text2">{t.despatchDate ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-[10px] text-text3">{t.qty > 1 ? `×${t.qty}` : ''}</td>
                  </tr>
                )),
              ];
            })}
          </Table>
        </Card>
      </Content>
    </>
  );
}
