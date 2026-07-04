import { useMemo, useState, type ComponentProps } from 'react';
import { GRP_STAGES, RAW_STAGES } from '@bowson/shared';
import { useAddTicket, useCatalogue, type AddTicketInput } from '../lib/hooks';
import { Button, Field as FieldBase, FormSection as FormSectionBase, Modal, inputClassLg as inputClass } from './ui';
import type { Catalogue, CataloguePart } from '../lib/types';

// Larger, more legible field sizing for this customer-facing form.
const Field = (props: ComponentProps<typeof FieldBase>) => <FieldBase size="lg" {...props} />;
const FormSection = (props: ComponentProps<typeof FormSectionBase>) => <FormSectionBase size="lg" {...props} />;

type FType = 'RAW' | 'MADE' | 'COMP';

const TYPE_CARDS: { type: FType; label: string; color: string; bg: string; desc: string }[] = [
  {
    type: 'RAW',
    label: 'Bought-in',
    color: '#5c574f',
    bg: '#f0ede8',
    desc: 'Picking item — ordered from supplier. Tracked as Ordered → Received. No manufacturing stages.',
  },
  {
    type: 'MADE',
    label: 'Slide',
    color: '#0c6b50',
    bg: '#dff2eb',
    desc: 'Single manufactured item. Goes through all 9 GRP production stages independently.',
  },
  {
    type: 'COMP',
    label: 'Assembly',
    color: '#1558a0',
    bg: '#e8f1fb',
    desc: 'Composite item built from multiple parts. Status rolls up — complete only when all parts are done.',
  },
];

const DETAIL_PLACEHOLDER: Record<FType, string> = {
  RAW: 'e.g. Bolt packs M12 stainless',
  MADE: 'e.g. [TLW-H2050] TWIN LANE WAVY SLIDE',
  COMP: 'e.g. [STS-540D-3400H] SPIRAL TUBE SLIDE',
};

/**
 * Full "Add Ticket" form — a 1:1 port of the t-card.html ticket form.
 * Bought-in (RAW) / Slide (MADE) are created as manual tickets; Assembly (COMP)
 * is built from a catalogue template (the backend expands it into a COMP + parts).
 */
export function TicketForm({
  orderId,
  orderNumber,
  defaultResin,
  onClose,
}: {
  orderId: number;
  orderNumber: string;
  defaultResin?: string;
  onClose: () => void;
}) {
  const { data: catalogue } = useCatalogue();
  const add = useAddTicket(orderId);

  const [type, setType] = useState<FType>('MADE');
  const [catId, setCatId] = useState<number | ''>('');
  const [parts, setParts] = useState<CataloguePart[]>([]);
  const [detail, setDetail] = useState('');
  const [spec, setSpec] = useState('');
  const [drawing, setDrawing] = useState('');
  const [status, setStatus] = useState<string>('1. Spec Required');
  const [hrs, setHrs] = useState(0);
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const netPrice = useMemo(() => (unitPrice || 0) * (qty || 1), [unitPrice, qty]);
  const stageOptions = type === 'RAW' ? RAW_STAGES : GRP_STAGES;

  function changeType(next: FType) {
    setType(next);
    setCatId('');
    setParts([]);
    setStatus(next === 'RAW' ? 'Ordered' : '1. Spec Required');
  }

  // MADE: selecting a catalogue product just pre-fills the description fields.
  function pickCatalogueMade(id: number | '') {
    setCatId(id);
    const tpl = id ? (catalogue ?? []).find((c) => c.id === id) : undefined;
    if (!tpl) return;
    setDetail((prev) => prev || `[${tpl.code ?? tpl.productCode}] ${tpl.name.toUpperCase()}`);
    setDrawing(tpl.drawing ?? tpl.code ?? '');
    setHrs(tpl.parts[0]?.hrs ?? tpl.assemblyHrs ?? 0);
    setUnitPrice(tpl.unitPrice ?? 0);
  }

  // COMP: selecting a template previews the parts that will be created with it.
  function pickTemplate(id: number | '') {
    setCatId(id);
    const tpl: Catalogue | undefined = id ? (catalogue ?? []).find((c) => c.id === id) : undefined;
    if (!tpl) {
      setParts([]);
      return;
    }
    setParts(tpl.parts ?? []);
    setDetail((prev) => prev || tpl.name);
    setDrawing(tpl.drawing ?? tpl.code ?? '');
    setHrs(tpl.assemblyHrs ?? 0);
    setUnitPrice(tpl.unitPrice ?? 0);
  }

  async function submit() {
    setError(null);
    let input: AddTicketInput;
    if (type === 'COMP') {
      if (!catId) {
        setError('Choose a product template for an assembly item.');
        return;
      }
      input = {
        fromCatalogueId: Number(catId),
        colour: spec.trim() || undefined,
        resin: defaultResin || undefined,
        unitPrice: unitPrice || undefined,
      };
    } else {
      const d = detail.trim();
      if (!d) {
        setError('Enter a detail description.');
        return;
      }
      input = {
        type,
        detail: d,
        spec: spec.trim() || null,
        drawing: type === 'RAW' ? null : drawing.trim() || null,
        qty,
        unitPrice,
        hrs: type === 'RAW' ? 0 : hrs,
        status,
      };
    }
    try {
      await add.mutateAsync(input);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal
      title="Add Ticket"
      sub={`Order ${orderNumber}`}
      onClose={onClose}
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add ticket'}
          </Button>
        </>
      }
    >
      {/* PRODUCT TYPE */}
      <FormSection title="Product type">
        <div className="grid grid-cols-3 gap-2">
          {TYPE_CARDS.map((c) => {
            const sel = type === c.type;
            return (
              <button
                key={c.type}
                type="button"
                onClick={() => changeType(c.type)}
                className={`rounded-lg border-2 p-2.5 text-left transition ${sel ? '' : 'border-border hover:border-border2'}`}
                style={sel ? { borderColor: c.color, backgroundColor: c.bg } : undefined}
              >
                <div className="mb-1 text-sm font-extrabold tracking-wide" style={{ color: c.color }}>
                  {c.label}
                </div>
                <div className="text-[11px] leading-snug text-text3">{c.desc}</div>
              </button>
            );
          })}
        </div>
      </FormSection>

      {/* PARENT ORDER */}
      <FormSection title="Parent order">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order">
            <div className="rounded-md border border-border bg-surface2 px-3 py-1.5 text-sm font-semibold">
              {orderNumber}
            </div>
          </Field>
          <Field label="Ticket number">
            <div className="rounded-md border border-border bg-surface2 px-3 py-1.5 text-sm font-semibold text-text2">
              Auto-assigned on release
            </div>
          </Field>
        </div>
      </FormSection>

      {/* CATALOGUE / TEMPLATE PICKER */}
      {type === 'MADE' && (
        <FormSection title="Select from catalogue">
          <Field label="Product catalogue">
            <select
              className={inputClass}
              value={catId}
              onChange={(e) => pickCatalogueMade(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— Select a slide or enter manually below —</option>
              {(catalogue ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </FormSection>
      )}

      {type === 'COMP' && (
        <FormSection title="Start from template">
          <Field label="Product template" required>
            <select
              className={inputClass}
              value={catId}
              onChange={(e) => pickTemplate(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">— Select a template —</option>
              {(catalogue ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.parts.length} part{c.parts.length === 1 ? '' : 's'}
                </option>
              ))}
            </select>
          </Field>
          {catId !== '' && parts.length > 0 && (
            <>
              <div className="mt-2 overflow-hidden rounded-md border border-border">
                <div className="grid grid-cols-[1fr_120px_48px] gap-2 border-b border-border bg-surface2 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-text3">
                  <span>Part detail</span>
                  <span>Spec / colour</span>
                  <span className="text-right">Hrs</span>
                </div>
                {parts.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_120px_48px] gap-2 border-b border-border px-2.5 py-1 text-xs last:border-0">
                    <span className="truncate">{p.detail}</span>
                    <span className="truncate text-text3">{p.spec || '—'}</span>
                    <span className="text-right tabular-nums text-text2">{p.hrs || 0}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-[10px] text-text3">
                {parts.length} fixed part{parts.length === 1 ? '' : 's'} from template — created automatically with this assembly.
              </div>
            </>
          )}
        </FormSection>
      )}

      {/* DESCRIPTION */}
      <FormSection title="Description">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Detail" required>
              <input
                className={inputClass}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder={DETAIL_PLACEHOLDER[type]}
              />
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Specification / colour">
              <textarea
                className={`${inputClass} min-h-16 resize-y`}
                value={spec}
                onChange={(e) => setSpec(e.target.value)}
                placeholder="e.g. RAL 5002 Dark Blue"
              />
            </Field>
          </div>
          {type !== 'RAW' && (
            <Field label="Drawing ref">
              <input className={inputClass} value={drawing} onChange={(e) => setDrawing(e.target.value)} />
            </Field>
          )}
        </div>
      </FormSection>

      {/* SCHEDULING & PRICING */}
      <FormSection title="Scheduling & pricing">
        <div className="grid grid-cols-3 gap-3">
          <Field label={type === 'RAW' ? 'Initial status' : 'Initial stage'}>
            <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              {stageOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          {type !== 'RAW' && (
            <Field label="Labour hrs">
              <input
                type="number"
                min={0}
                step={0.5}
                className={inputClass}
                value={hrs}
                onChange={(e) => setHrs(Number(e.target.value) || 0)}
              />
            </Field>
          )}
          <Field label="Qty">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 1)}
            />
          </Field>
          <Field label="Unit price £">
            <input
              type="number"
              min={0}
              className={inputClass}
              value={unitPrice}
              onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Net price £ (auto)">
            <input
              readOnly
              className={`${inputClass} bg-surface2 text-text2`}
              value={netPrice.toFixed(2)}
            />
          </Field>
        </div>
      </FormSection>

      {error && <div className="mt-1 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
    </Modal>
  );
}
