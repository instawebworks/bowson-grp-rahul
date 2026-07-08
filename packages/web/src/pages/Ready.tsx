import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { familyReadyCheck, stageIndex, type FamilyNotReady } from '@bowson/shared';
import { useDespatchTickets, useOverrideDespatch, useTickets } from '../lib/hooks';
import { Button, Card, Content, Modal, PageHeader, QueryState, Table } from '../components/ui';
import { ManagerPinGate } from '../components/ManagerPinGate';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { buildDespatchHtml, openDocument } from '../lib/documents';
import type { Ticket } from '../lib/types';

const RTD = '10. Ready to Despatch';

const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  RAW: { bg: '#f0ede8', color: '#5c574f' },
  MADE: { bg: '#dff2eb', color: '#0c6b50' },
  COMP: { bg: '#e8f1fb', color: '#1558a0' },
  PART: { bg: '#f3f0fd', color: '#4a42b0' },
};

function TypeBadge({ type }: { type: string }) {
  const s = TYPE_STYLE[type] ?? TYPE_STYLE.RAW!;
  return <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: s.bg, color: s.color }}>{type}</span>;
}

interface BlockedFamily {
  tn: number | null;
  detail: string;
  notReady: FamilyNotReady[];
}

type Gate =
  | { kind: 'family'; blocked: BlockedFamily[]; ticketIds: number[] }
  | { kind: 'family-pin'; ticketIds: number[] }
  | { kind: 'partial'; orders: { orderNumber: string; selected: number; total: number }[]; ticketIds: number[]; managerOverride: boolean }
  | { kind: 'override-pin'; ticketId: number; tn: number | null };

/**
 * Ready to Despatch — ported from the prototype's renderReady /
 * despatchSelected / _proceedDespatch / managerOverrideDespatch.
 * Selection + "Despatch selected" with the COMP family-ready gate (manager-PIN
 * override), partial-despatch warning, and a printable Delivery Note on success.
 */
export function Ready() {
  const { data, isLoading, error } = useTickets();
  const despatch = useDespatchTickets();
  const override = useOverrideDespatch();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [gate, setGate] = useState<Gate | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const all = useMemo(() => data ?? [], [data]);

  // Despatchable = MADE at Ready + COMP parents whose whole family is ready.
  const { despatchable, compBlocked, partReady } = useMemo(() => {
    const madeReady = all.filter((t) => t.type === 'MADE' && t.compParentId == null && t.status === RTD);
    const compReady = all.filter(
      (t) => t.type === 'COMP' && t.compParentId == null && t.status === RTD && familyReadyCheck(t, all).ready,
    );
    const compBlocked = all.filter(
      (t) =>
        t.type === 'COMP' && t.compParentId == null &&
        ['9. Packing', RTD].includes(t.status) && !familyReadyCheck(t, all).ready,
    );
    const partReady = all.filter((t) => t.type === 'PART' && t.status === RTD);
    return { despatchable: [...madeReady, ...compReady], compBlocked, partReady };
  }, [all]);

  const selCount = [...selected].filter((id) => despatchable.some((t) => t.id === id)).length;
  const total = despatchable.length;

  const toggle = (id: number, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  const toggleAll = (checked: boolean) =>
    setSelected(checked ? new Set(despatchable.map((t) => t.id)) : new Set());

  /** Run the despatch; the API re-validates the gates we already passed. */
  function doDespatch(ticketIds: number[], managerOverride: boolean, confirmPartial: boolean) {
    setGate(null);
    despatch.mutate(
      { ticketIds, managerOverride, confirmPartial },
      {
        onSuccess: (result) => {
          openDocument(buildDespatchHtml(result.tickets, result.despatchDate, result.partial));
          setSelected(new Set());
          navigate('/despatched');
        },
      },
    );
  }

  /** Partial check (prototype _proceedDespatch): an order is partial when some
   * top-level non-RAW ticket is neither Despatched nor in the selection. */
  function proceedDespatch(ticketIds: number[], managerOverride: boolean) {
    const sel = ticketIds.map((id) => all.find((t) => t.id === id)).filter(Boolean) as Ticket[];
    const orderIds = [...new Set(sel.map((t) => t.orderId))];
    const partialOrders = orderIds
      .map((oid) => {
        const tops = all.filter((t) => t.orderId === oid && t.compParentId == null && t.type !== 'RAW');
        const uncovered = tops.filter((t) => t.status !== 'Despatched' && !sel.some((s) => s.id === t.id));
        if (!uncovered.length) return null;
        return {
          orderNumber: tops[0]?.order?.orderNumber ?? String(oid),
          selected: sel.filter((s) => s.orderId === oid).length,
          total: tops.length,
        };
      })
      .filter(Boolean) as { orderNumber: string; selected: number; total: number }[];

    if (partialOrders.length) {
      setGate({ kind: 'partial', orders: partialOrders, ticketIds, managerOverride });
      return;
    }
    doDespatch(ticketIds, managerOverride, false);
  }

  /** Family gate (prototype despatchSelected): every member of a selected COMP
   * family must be at Ready to Despatch. */
  function despatchSelected() {
    const ticketIds = [...selected].filter((id) => despatchable.some((t) => t.id === id));
    if (!ticketIds.length) return;
    const checkedComps = new Set<number>();
    const blocked: BlockedFamily[] = [];
    for (const id of ticketIds) {
      const t = all.find((x) => x.id === id);
      if (!t) continue;
      const compId = t.type === 'COMP' ? t.id : t.compParentId;
      if (compId == null || checkedComps.has(compId)) continue;
      checkedComps.add(compId);
      const check = familyReadyCheck(t, all);
      if (!check.ready) {
        const comp = all.find((x) => x.id === compId);
        blocked.push({ tn: comp?.tn ?? t.tn, detail: comp?.detail ?? t.detail, notReady: check.notReady });
      }
    }
    if (blocked.length) {
      setGate({ kind: 'family', blocked, ticketIds });
      return;
    }
    proceedDespatch(ticketIds, false);
  }

  // Group the despatchable rows by order (first row per order carries the order cells).
  const groupedRows = useMemo(() => {
    const orderIds = [...new Set(despatchable.map((t) => t.orderId))];
    return orderIds.flatMap((oid) =>
      despatchable.filter((t) => t.orderId === oid).map((t, ti) => ({ ticket: t, first: ti === 0 })),
    );
  }, [despatchable]);

  const qcIdx = stageIndex('8. QC Check');

  return (
    <>
      {detailId != null && <TicketDetailModal ticketId={detailId} onClose={() => setDetailId(null)} />}

      {gate?.kind === 'family' && (
        <Modal
          title="Assembly family not ready"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button
                onClick={() => setGate({ kind: 'family-pin', ticketIds: gate.ticketIds })}
                className="border-amber bg-amber text-white hover:opacity-90"
              >
                ⚠ Manager Override — Despatch anyway
              </Button>
              <Button variant="primary" onClick={() => setGate(null)}>OK</Button>
            </>
          }
        >
          <p className="mb-2.5 text-xs text-text2">
            The following assemblies have parts that are not yet at <strong>Ready to Despatch</strong>.
            The whole family must be ready before despatching.
          </p>
          {gate.blocked.map((b, i) => (
            <div key={i} className="mb-2">
              <div className="mb-1 text-[11px] font-bold">Assembly #{b.tn ?? 'TBC'} — {b.detail}</div>
              {b.notReady.map((r, j) => (
                <div key={j} className="mb-0.5 rounded bg-amber-l px-2 py-0.5 text-[11px]">
                  <strong>{r.type}</strong> #{r.tn ?? '?'} — {r.status}
                </div>
              ))}
            </div>
          ))}
        </Modal>
      )}

      {gate?.kind === 'family-pin' && (
        <ManagerPinGate
          action="despatch an incomplete assembly"
          onSuccess={() => proceedDespatch(gate.ticketIds, true)}
          onCancel={() => setGate(null)}
        />
      )}

      {gate?.kind === 'partial' && (
        <Modal
          title="Partial Despatch Warning"
          onClose={() => setGate(null)}
          footer={
            <>
              <Button onClick={() => setGate(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => doDespatch(gate.ticketIds, gate.managerOverride, true)}>
                Confirm Partial Despatch
              </Button>
            </>
          }
        >
          <p className="mb-2.5 text-xs text-text2">
            The following order(s) are being <strong>partially despatched</strong> — not all items are selected:
          </p>
          <p className="mb-2.5 text-[13px] font-bold text-amber">
            {gate.orders.map((o) => `${o.orderNumber} (${o.selected} of ${o.total} items)`).join(', ')}
          </p>
          <p className="text-xs text-text2">
            A despatch note will be generated and <strong>flagged as PARTIAL DESPATCH</strong>.{' '}
            The invoice will only be generated once the full order is despatched.
          </p>
        </Modal>
      )}

      {gate?.kind === 'override-pin' && (
        <ManagerPinGate
          action={`override despatch of #${gate.tn ?? 'TBC'}`}
          onSuccess={() => {
            const id = gate.ticketId;
            setGate(null);
            override.mutate(id);
          }}
          onCancel={() => setGate(null)}
        />
      )}

      <PageHeader
        title="Ready to Despatch"
        sub={`${total} items ready${selCount ? ` · ${selCount} selected` : ''}`}
      />
      <Content>
        {/* Toolbar */}
        <div className="mb-3.5 flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3.5 py-2.5">
          <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-teal"
              checked={selCount > 0 && selCount === total}
              onChange={(e) => toggleAll(e.target.checked)}
            />
            Select all ({total})
          </label>
          <span className="text-[11px] text-text3">{selCount} selected</span>
          <div className="ml-auto">
            <Button
              variant="primary"
              disabled={selCount === 0 || despatch.isPending}
              onClick={despatchSelected}
            >
              📦 Despatch{selCount > 0 ? ` ${selCount} selected` : ''}
            </Button>
          </div>
        </div>
        {despatch.isError && (
          <div className="mb-3 rounded-md border border-red/40 bg-red/10 px-3 py-2 text-xs text-red">
            Despatch failed — {(despatch.error as Error).message}
          </div>
        )}

        {/* Ready items */}
        {despatchable.length > 0 && (
          <>
            <div className="mb-2 text-[11px] font-bold text-text2">● Items ready to despatch ({despatchable.length})</div>
            <Card className="mb-5">
              <Table head={['', 'Ticket #', 'Type', 'Order', 'Customer Ref', 'Detail', 'Theme / Spec', 'Qty', 'QC Ref', 'Despatch']}>
                {groupedRows.map(({ ticket: t, first }) => (
                  <tr
                    key={t.id}
                    className={`cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40 ${first ? '' : 'bg-surface2/40'}`}
                    onClick={() => setDetailId(t.id)}
                  >
                    <td className="w-9 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-teal"
                        checked={selected.has(t.id)}
                        onChange={(e) => toggle(t.id, e.target.checked)}
                      />
                    </td>
                    <td className="px-3 py-2 font-bold text-teal">#{t.tn ?? 'TBC'}</td>
                    <td className="px-3 py-2"><TypeBadge type={t.type} /></td>
                    <td className="px-3 py-2">
                      {first ? <span className="font-medium">{t.order?.orderNumber ?? '—'}</span> : <span className="text-text3">↳</span>}
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {first && (
                        <>
                          <span className="font-semibold">{t.order?.siteName ?? '—'}</span>
                          <br />
                          <span className="text-text3">{t.order?.customer?.name ?? ''}</span>
                        </>
                      )}
                    </td>
                    <td className="max-w-42 truncate px-3 py-2" title={t.detail}>{t.detail}</td>
                    <td className="max-w-32 truncate px-3 py-2 text-[11px] text-text3">{t.spec ?? '—'}</td>
                    <td className="px-3 py-2 text-center text-[11px]">{t.qty || 1}</td>
                    <td className="px-3 py-2 text-[11px] font-semibold text-teal">—</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full border border-border2 bg-surface2 px-2 py-0.5 text-[10px] text-text2">
                        {t.order?.despatch ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          </>
        )}

        {/* Blocked assemblies */}
        {compBlocked.length > 0 && (
          <>
            <div className="mb-2 text-[11px] font-bold text-amber">⚠ Assembly items blocked — parts not all through QC ({compBlocked.length})</div>
            <Card className="mb-5">
              <Table head={['Ticket #', 'Order', 'Detail', 'Parts status', 'Override']}>
                {compBlocked.map((t) => {
                  const parts = all.filter((p) => p.compParentId === t.id);
                  const doneCount = parts.filter((p) => stageIndex(p.status) >= qcIdx).length;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <button className="font-bold text-teal hover:underline" onClick={() => setDetailId(t.id)}>#{t.tn ?? 'TBC'}</button>
                      </td>
                      <td className="px-3 py-2">
                        <button className="font-medium text-teal hover:underline" onClick={() => navigate(`/orders/${t.orderId}`)}>
                          {t.order?.orderNumber ?? '—'}
                        </button>
                      </td>
                      <td className="max-w-50 truncate px-3 py-2" title={t.detail}>{t.detail}</td>
                      <td className="px-3 py-2 text-[11px]">
                        <span className="text-amber">{doneCount}/{parts.length} parts through QC</span>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {parts.map((p) => {
                            const done = stageIndex(p.status) >= qcIdx;
                            return (
                              <span
                                key={p.id}
                                className={`rounded-lg px-1.5 py-0.5 text-[9px] ${done ? 'bg-teal-l text-teal' : 'bg-amber-l text-amber'}`}
                              >
                                #{p.tn ?? 'TBC'} {p.status}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="danger" onClick={() => setGate({ kind: 'override-pin', ticketId: t.id, tn: t.tn })}>
                          Override
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          </>
        )}

        {/* Parts at Ready (despatch via parent) */}
        {partReady.length > 0 && (
          <>
            <div className="mb-2 text-[11px] font-bold text-text3">■ Part tickets at Ready to Despatch — despatch via parent Assembly ({partReady.length})</div>
            <Card className="mb-5">
              <Table head={['Ticket #', 'Parent COMP', 'Order', 'Detail', 'Override']}>
                {partReady.map((t) => {
                  const parent = t.compParentId != null ? all.find((x) => x.id === t.compParentId) : null;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <button className="font-bold text-teal hover:underline" onClick={() => setDetailId(t.id)}>#{t.tn ?? 'TBC'}</button>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-text3">
                        {parent ? `#${parent.tn ?? 'TBC'} ${parent.detail.slice(0, 30)}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button className="font-medium text-teal hover:underline" onClick={() => navigate(`/orders/${t.orderId}`)}>
                          {t.order?.orderNumber ?? '—'}
                        </button>
                      </td>
                      <td className="max-w-50 truncate px-3 py-2" title={t.detail}>{t.detail}</td>
                      <td className="px-3 py-2">
                        <Button variant="danger" onClick={() => setGate({ kind: 'override-pin', ticketId: t.id, tn: t.tn })}>
                          Override
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          </>
        )}

        {/* Loading / error / empty states */}
        {(isLoading || error) && (
          <Card>
            <Table head={[]}>
              <QueryState isLoading={isLoading} error={error} colSpan={1} />
            </Table>
          </Card>
        )}
        {!isLoading && !error && !despatchable.length && !compBlocked.length && !partReady.length && (
          <Card>
            <div className="px-3 py-12 text-center text-xs text-text3">
              No items at Ready to Despatch yet.
              <br />
              <span className="text-[11px]">Items arrive here after advancing through Packing.</span>
            </div>
          </Card>
        )}
      </Content>
    </>
  );
}
