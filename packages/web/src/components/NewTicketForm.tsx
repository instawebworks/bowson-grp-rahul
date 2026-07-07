import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { GRP_STAGES, RAW_STAGES } from '@bowson/shared';
import { apiClient } from '../lib/api';
import { useCatalogue, useOrders, type AddTicketInput } from '../lib/hooks';
import { Button, Field, FormSection, Modal, inputClass } from './ui';

type TType = 'RAW' | 'MADE' | 'COMP';

const TYPE_CARDS: { type: TType; badge: string; color: string; desc: string }[] = [
  { type: 'RAW', badge: 'Bought-in', color: '#5c574f', desc: 'Picking item — ordered from supplier. Tracked as Ordered → Received. No manufacturing stages.' },
  { type: 'MADE', badge: 'Slide', color: '#0c6b50', desc: 'Single manufactured item. Goes through all 9 GRP production stages independently.' },
  { type: 'COMP', badge: 'Assembly', color: '#1558a0', desc: 'Composite item built from multiple parts. Status rolls up — complete only when all parts are done.' },
];

const PLACEHOLDER: Record<TType, string> = {
  RAW: 'e.g. Bolt packs M12 stainless',
  MADE: 'e.g. [TLW-H2050] TWIN LANE WAVY SLIDE',
  COMP: 'e.g. [STS-540D-3400H] SPIRAL TUBE SLIDE',
};

/** Standalone "New Ticket" form — fields adapt to the selected product type. */
export function NewTicketForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: orders, isLoading: ordersLoading } = useOrders();
  const { data: catalogue } = useCatalogue();

  const [type, setType] = useState<TType>('MADE');
  const [orderId, setOrderId] = useState<number | ''>('');
  const [catId, setCatId] = useState<number | ''>('');
  const [catRef, setCatRef] = useState<number | ''>(''); // Assembly "Product catalogue" (fills description)
  const [detail, setDetail] = useState('');
  const [spec, setSpec] = useState('');
  const [drawing, setDrawing] = useState('');
  const [stage, setStage] = useState<string>('1. Spec Required');
  const [hrs, setHrs] = useState(0);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRaw = type === 'RAW';
  const stages = isRaw ? RAW_STAGES : GRP_STAGES;
  const selectedTpl = catId ? catalogue?.find((c) => c.id === Number(catId)) : undefined;

  function pickType(t: TType) {
    setType(t);
    setCatId(''); // catalogue/template picker is type-specific
    setCatRef('');
    setStage(t === 'RAW' ? 'Ordered' : '1. Spec Required');
  }

  function pickCat(v: string) {
    const idNum = v ? Number(v) : '';
    setCatId(idNum);
    const c = catalogue?.find((x) => x.id === Number(v));
    if (c) {
      setDetail(`[${c.code ?? c.productCode}] ${c.name}`);
      setDrawing(c.productCode ?? '');
      setHrs(c.assemblyHrs ?? 0);
      setUnitPrice(c.unitPrice ?? 0);
    }
  }

  // Assembly "Product catalogue" picker — fills the description from a catalogue product.
  function pickCatRef(v: string) {
    const idNum = v ? Number(v) : '';
    setCatRef(idNum);
    const c = catalogue?.find((x) => x.id === Number(v));
    if (c) {
      setDetail(`[${c.code ?? c.productCode}] ${c.name}`);
      setDrawing(c.productCode ?? '');
    }
  }

  async function submit() {
    setError(null);
    if (!orderId) {
      setError('Please select a parent order.');
      return;
    }
    let body: AddTicketInput;
    if (catId && !isRaw) {
      // Catalogue/template-driven: the server expands assemblies into COMP + PART.
      body = { fromCatalogueId: Number(catId), colour: spec || undefined, ...(unitPrice ? { unitPrice } : {}) };
    } else {
      if (!detail.trim()) {
        setError('Enter a product detail, or select a catalogue product.');
        return;
      }
      body = {
        type,
        detail: detail.trim(),
        spec: spec || null,
        ...(isRaw ? {} : { drawing: drawing || null, hrs }),
        qty,
        unitPrice,
        status: stage,
      };
    }
    setBusy(true);
    try {
      await apiClient.post(`/api/orders/${orderId}/tickets`, body);
      qc.invalidateQueries({ queryKey: ['order', Number(orderId)] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="New Ticket"
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || ordersLoading || !orderId}>
            {busy ? 'Adding…' : ordersLoading ? 'Loading orders…' : 'Add ticket'}
          </Button>
        </>
      }
    >
      <FormSection title="Product type">
        <div className="grid grid-cols-3 gap-2">
          {TYPE_CARDS.map((c) => (
            <button
              key={c.type}
              type="button"
              onClick={() => pickType(c.type)}
              className={`rounded-lg border p-3 text-left transition ${
                type === c.type ? 'border-teal bg-teal-l/40' : 'border-border bg-surface hover:border-border2'
              }`}
            >
              <div className="mb-1 text-sm font-bold" style={{ color: c.color }}>{c.badge}</div>
              <div className="text-[10px] leading-snug text-text3">{c.desc}</div>
            </button>
          ))}
        </div>
      </FormSection>

      <FormSection title="Parent order">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order" required>
            <select
              className={inputClass}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : '')}
              disabled={ordersLoading}
              autoFocus
            >
              <option value="">{ordersLoading ? 'Loading orders…' : '— Select order —'}</option>
              {(orders ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber}{o.customer?.name ? ` · ${o.customer.name}` : ''}
                </option>
              ))}
            </select>
            {!ordersLoading && (orders?.length ?? 0) === 0 && (
              <p className="mt-1 text-[11px] text-red">No orders found — create an order first.</p>
            )}
          </Field>
          <Field label="Ticket number">
            <input className={`${inputClass} bg-surface2 text-text3`} value="Auto-assigned on release" disabled readOnly />
          </Field>
        </div>
      </FormSection>

      {/* Catalogue picker — Slide (MADE) & Bought-in (RAW) */}
      {type !== 'COMP' && (
        <FormSection title="Select from catalogue">
          <Field label="Product catalogue">
            <select className={inputClass} value={catId} onChange={(e) => pickCat(e.target.value)}>
              <option value="">— Select a product or enter manually below —</option>
              {(catalogue ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code ?? c.productCode})
                </option>
              ))}
            </select>
          </Field>
        </FormSection>
      )}

      {/* Assembly: template picker (parts) + catalogue picker (description) */}
      {type === 'COMP' && (
        <>
          <FormSection title="Start from template">
            <Field label="Product template">
              <select className={inputClass} value={catId} onChange={(e) => pickCat(e.target.value)}>
                <option value="">— Select a template or build manually —</option>
                {(catalogue ?? []).filter((c) => c.parts.length > 1).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            {selectedTpl && selectedTpl.parts.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_140px_56px] bg-surface2 px-3 py-1.5 text-[10px] font-semibold uppercase text-text3">
                  <span>Part detail — edit spec &amp; hours as needed</span><span>Spec / colour</span><span className="text-right">Hrs</span>
                </div>
                {selectedTpl.parts.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_140px_56px] border-t border-border px-3 py-1.5 text-xs">
                    <span>{p.detail}</span>
                    <span className="text-text3">{p.spec ?? '—'}</span>
                    <span className="text-right tabular-nums text-text2">{p.hrs}</span>
                  </div>
                ))}
                <div className="px-3 py-1.5 text-[10px] text-text3">
                  {selectedTpl.parts.length} fixed parts from the template — the assembly is created as a COMP with one PART per piece.
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title="Select from catalogue">
            <Field label="Product catalogue">
              <select className={inputClass} value={catRef} onChange={(e) => pickCatRef(e.target.value)}>
                <option value="">— Select a product or enter manually below —</option>
                {(catalogue ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code ?? c.productCode})
                  </option>
                ))}
              </select>
            </Field>
          </FormSection>
        </>
      )}

      <FormSection title="Description">
        <Field label="Detail" required>
          <input className={inputClass} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={PLACEHOLDER[type]} />
        </Field>
        <div className="mt-3">
          <Field label="Specification / colour">
            <textarea className={`${inputClass} min-h-[70px] resize-y`} value={spec} onChange={(e) => setSpec(e.target.value)} />
          </Field>
        </div>
        {!isRaw && (
          <div className="mt-3">
            <Field label="Drawing ref">
              <input className={`${inputClass} max-w-xs`} value={drawing} onChange={(e) => setDrawing(e.target.value)} />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection title="Scheduling & pricing">
        <div className="grid grid-cols-3 gap-3">
          <Field label={isRaw ? 'Initial status' : 'Initial stage'}>
            <select className={inputClass} value={stage} onChange={(e) => setStage(e.target.value)} disabled={!!catId && !isRaw}>
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          {!isRaw && (
            <Field label="Labour hrs">
              <input type="number" min={0} step={0.5} className={inputClass} value={hrs} onChange={(e) => setHrs(Number(e.target.value) || 0)} />
            </Field>
          )}
          <Field label="Qty">
            <input type="number" min={1} className={inputClass} value={qty} onChange={(e) => setQty(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Unit price £">
            <input type="number" min={0} step={0.01} className={inputClass} value={unitPrice} onChange={(e) => setUnitPrice(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Net price £ (auto)">
            <input className={`${inputClass} bg-surface2 text-text3`} value={(unitPrice * qty).toFixed(2)} disabled readOnly />
          </Field>
        </div>
        {!!catId && !isRaw && (
          <p className="mt-2 text-[11px] text-text3">
            Catalogue products start at “1. Spec Required”; assemblies expand into a COMP + one PART per piece.
          </p>
        )}
      </FormSection>

      {error && <div className="mt-2 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
