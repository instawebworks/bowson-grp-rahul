import { useMemo, useRef, useState, type ComponentProps } from 'react';
import { RESIN_TYPES, STAGE_HRS_REMAINING, formatWc, wcForDeadline } from '@bowson/shared';
import {
  useAddTicket,
  useCatalogue,
  useDeleteTicket,
  useOperatives,
  useOrder,
  useSettings,
  useTickets,
  useUpdateOrder,
  useUpdateTicket,
} from '../lib/hooks';
import { computeSuggestedSchedule } from '../lib/suggestSchedule';
import { Button, Field as FieldBase, FormSection as FormSectionBase, inputClassLg as inputClass } from './ui';
import { CatalogueForm } from './CatalogueForm';
import { TicketForm } from './TicketForm';
import type { Catalogue, Ticket } from '../lib/types';

// Larger, more legible field sizing for this customer-facing order form.
const Field = (props: ComponentProps<typeof FieldBase>) => <FieldBase size="lg" {...props} />;
const FormSection = (props: ComponentProps<typeof FormSectionBase>) => <FormSectionBase size="lg" {...props} />;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cellInput = 'w-full rounded-md border border-border2 bg-surface px-2 py-1.5 text-xs outline-none focus:border-teal';

/** Friendly "W/C 29 Jun 2026" label for a Monday date. */
function weekLabel(monday: Date): string {
  return `W/C ${monday.getDate()} ${MONTHS[monday.getMonth()]} ${monday.getFullYear()}`;
}

export function OrderStep2({
  orderId,
  orderNumber,
  resin: initialResin,
  onDone,
  onAbandon,
}: {
  orderId: number;
  orderNumber: string;
  resin: string;
  onDone: () => void;
  onAbandon?: () => void;
}) {
  const { data: order } = useOrder(orderId);
  const { data: catalogue } = useCatalogue();
  const { data: operatives } = useOperatives();
  const { data: allTickets } = useTickets();
  const { data: settings } = useSettings();
  const add = useAddTicket(orderId);
  const del = useDeleteTicket(orderId);
  const updateOrder = useUpdateOrder(orderId);
  const updateTicket = useUpdateTicket(orderId);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Catalogue | null>(null);
  const [colour, setColour] = useState('');
  const [resin, setResin] = useState(initialResin || 'Standard');
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [manualDl, setManualDl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (catalogue ?? [])
      .filter((c) => [c.name, c.code, c.productCode].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 6);
  }, [catalogue, query]);

  const tickets = order?.tickets ?? [];
  const tops = tickets.filter((t) => t.compParentId == null);
  const partsOf = (id: number) => tickets.filter((t) => t.compParentId === id);
  const totalHrs = tickets.reduce((s, t) => s + (t.hrs || 0), 0);

  // Suggested schedule — week-walk filling spare capacity (prototype maths).
  const suggestion = useMemo(
    () =>
      computeSuggestedSchedule({
        ops: operatives ?? [],
        allTickets: allTickets ?? [],
        totalHrs,
        weights: settings?.stageWeights ?? STAGE_HRS_REMAINING,
        excludeOrderId: orderId,
      }),
    [operatives, allTickets, totalHrs, settings, orderId],
  );
  const weeksNeeded = totalHrs > 0 ? suggestion.weeksNeeded : 0;
  const suggestedWc = formatWc(new Date(suggestion.startKey));
  const suggestedDeadline = suggestion.deadline;
  const scheduleSet = !!order?.deadline;

  function editDetail(id: number, value: string) {
    const v = value.trim();
    if (!v) return; // detail is required — ignore empty edits
    updateTicket.mutate({ ticketId: id, input: { detail: v } });
  }
  function editSpec(id: number, value: string) {
    updateTicket.mutate({ ticketId: id, input: { spec: value.trim() || null } });
  }
  async function removeTicket(t: Ticket) {
    setError(null);
    try {
      for (const p of partsOf(t.id)) await del.mutateAsync(p.id);
      await del.mutateAsync(t.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  }

  async function addFromCatalogue() {
    setError(null);
    if (!selected) {
      setError('Search and select a product first.');
      return;
    }
    try {
      await add.mutateAsync({
        fromCatalogueId: selected.id,
        colour: colour || undefined,
        resin,
        themeImage: image || undefined,
      });
      // Reset for the next slide (keep resin).
      setSelected(null);
      setQuery('');
      setColour('');
      setImage(null);
      setImageName(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal bg-teal-l/50 px-3 py-2 text-xs">
        <span className="font-semibold text-teal">✓ Order {orderNumber} created</span>
        <span className="text-teal">· {resin} Resin</span>
      </div>

      <FormSection title="Add from product catalogue">
        <Field label="Search product catalogue">
          <input
            className={inputClass}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="Type to search — name, code or SKU…"
            autoFocus
          />
        </Field>
        <div className="mt-1 flex justify-end">
          <Button onClick={() => setShowNewProduct(true)}>+ New product</Button>
        </div>
        {matches.length > 0 && !selected && (
          <div className="mt-1 overflow-hidden rounded-md border border-border">
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => { setSelected(c); setQuery(c.name); }}
                className="flex w-full items-center justify-between border-b border-border px-3 py-1.5 text-left text-xs last:border-0 hover:bg-teal-l/40"
              >
                <span><span className="font-semibold">{c.name}</span> <span className="text-text3">· {c.code ?? c.productCode}</span></span>
                <span className="text-text3">{c.parts.length > 1 ? `${c.parts.length} parts` : '1 piece'}</span>
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="mt-1 rounded-md bg-surface2 px-3 py-1.5 text-xs">
            Selected: <span className="font-semibold">{selected.name}</span>
            <button onClick={() => { setSelected(null); setQuery(''); }} className="ml-2 text-text3 hover:text-red">✕</button>
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Colour / RAL / theme">
            <input className={inputClass} value={colour} onChange={(e) => setColour(e.target.value)} placeholder="e.g. RAL 5002 Dark Blue" />
          </Field>
          <Field label="Resin type">
            <select className={inputClass} value={resin} onChange={(e) => setResin(e.target.value)}>
              {RESIN_TYPES.map((r) => <option key={r} value={r}>{r === 'M2' ? 'M2 — USA / Fire rated ⚠' : r}</option>)}
            </select>
          </Field>
        </div>

        <div className="mt-3">
          <span className="mb-1 block text-[11px] font-semibold text-text2">Slide image / colour reference photo</span>
          {image && <img src={image} alt="reference" className="mb-2 max-h-32 rounded-md border border-border" />}
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
            <Button onClick={() => fileRef.current?.click()}>🖼 Upload image</Button>
            <span className="text-xs text-text3">{imageName ?? 'No image — each slide can have its own'}</span>
          </div>
        </div>

        {selected && <CataloguePreview selected={selected} colour={colour} resin={resin} />}

        <div className="mt-3">
          <Button variant="primary" onClick={addFromCatalogue} disabled={add.isPending || !selected}>
            {add.isPending ? 'Adding…' : 'Add tickets from catalogue'}
          </Button>
        </div>
      </FormSection>

      <FormSection title="Or add a custom ticket manually">
        <Button onClick={() => setShowTicketForm(true)}>+ Add manual ticket</Button>
        <p className="mt-1.5 text-xs text-text3">
          Opens the full ticket form — Bought-in, Slide or Assembly, with description, stage and pricing.
        </p>
      </FormSection>

      <FormSection title={`Tickets on this order (${tickets.length})`}>
        {tops.length === 0 ? (
          <div className="text-xs text-text3">No tickets yet — add a product above.</div>
        ) : (
          <div>
            {tops.map((t) => (
              <TicketCard
                key={t.id}
                t={t}
                parts={partsOf(t.id)}
                onEditDetail={editDetail}
                onEditSpec={editSpec}
                onRemove={() => removeTicket(t)}
                removing={del.isPending}
              />
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Suggested Schedule">
        {tickets.length === 0 ? (
          <div className="rounded-md bg-surface2 px-3 py-3 text-xs text-text3">
            Add tickets above to see a suggested schedule and deadline.
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-surface2 p-3">
              <div className="mb-3 grid grid-cols-3 gap-3">
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text3">Total hours</div>
                  <div className="text-xl font-bold leading-none">{Math.round(totalHrs * 10) / 10}h</div>
                  <div className="mt-1 text-xs text-text3">{tickets.length} ticket{tickets.length === 1 ? '' : 's'}</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text3">Suggested W/C start</div>
                  <div className="text-[15px] font-bold text-teal">{suggestedWc}</div>
                  <div className="mt-1 text-xs text-text3">{weeksNeeded} week{weeksNeeded === 1 ? '' : 's'} of production</div>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text3">Suggested deadline</div>
                  <div className="text-[15px] font-bold text-teal">{suggestedDeadline}</div>
                  <div className="mt-1 text-xs text-text3">inc. 1 week buffer</div>
                </div>
              </div>
              {scheduleSet ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-l/60 px-3 py-2 text-xs text-teal">
                  <span>✓ Deadline confirmed: <strong>{order?.deadline}</strong> · W/C: <strong>{order?.wc ?? '—'}</strong></span>
                  <Button className="ml-auto" onClick={() => updateOrder.mutate({ wc: null, deadline: null })} disabled={updateOrder.isPending}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="primary" onClick={() => updateOrder.mutate({ wc: suggestedWc, deadline: suggestedDeadline })} disabled={updateOrder.isPending}>
                    ✓ Accept suggestion
                  </Button>
                  <span className="text-xs text-text3">or set manually:</span>
                  <input
                    type="date"
                    value={manualDl}
                    onChange={(e) => setManualDl(e.target.value)}
                    className="rounded-md border border-border2 bg-surface px-2 py-1 text-xs outline-none focus:border-teal"
                  />
                  <Button
                    onClick={() => manualDl && updateOrder.mutate({ wc: wcForDeadline(manualDl), deadline: manualDl })}
                    disabled={updateOrder.isPending || !manualDl}
                  >
                    Set
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <Button variant="danger" onClick={() => onAbandon?.()}>✕ Abandon order</Button>
              {scheduleSet ? (
                <Button variant="primary" onClick={onDone}>✓ Confirm &amp; Add to Order Book</Button>
              ) : (
                <span className="text-xs text-text3">Accept a schedule above to confirm the order</span>
              )}
            </div>
          </>
        )}
      </FormSection>

      {error && <div className="mb-2 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}

      {showNewProduct && (
        <CatalogueForm
          onClose={() => setShowNewProduct(false)}
          onCreated={(c) => { setSelected(c); setQuery(c.name); }}
        />
      )}

      {showTicketForm && (
        <TicketForm
          orderId={orderId}
          orderNumber={orderNumber}
          defaultResin={resin}
          onClose={() => setShowTicketForm(false)}
        />
      )}
    </div>
  );
}

/** Ticket-type pill (labels + colours match t-card.html's typeBadge). */
function PreviewTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    RAW: { label: 'Raw Stock', color: '#5c574f', bg: '#f0ede8' },
    MADE: { label: 'Slide', color: '#0c6b50', bg: '#dff2eb' },
    COMP: { label: 'Slide (Assembly)', color: '#1558a0', bg: '#e8f1fb' },
    PART: { label: 'Part', color: '#6d28d9', bg: '#ede9fe' },
  };
  const s = map[type] ?? { label: type, color: '#5c574f', bg: '#f0ede8' };
  return (
    <span className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ color: s.color, backgroundColor: s.bg }}>
      {s.label}
    </span>
  );
}

/**
 * Live preview of the tickets a catalogue product will create — a single Slide
 * (MADE), or a Slide (Assembly) COMP plus one Part per piece. Mirrors the backend
 * expansion in POST /orders/:id/tickets and t-card.html's s2UpdatePreview.
 */
function CataloguePreview({ selected, colour, resin }: { selected: Catalogue; colour: string; resin: string }) {
  const parts = selected.parts ?? [];
  const isMulti = !selected.singlePiece && parts.length > 1;
  const asmHrs = selected.assemblyHrs || 0;
  const totalHrs = parts.reduce((s, p) => s + (p.hrs || 0), 0) + asmHrs;
  const resinTag = resin === 'M2' ? ' / M2 RESIN' : '';
  const spec = (colour ? colour + resinTag : resinTag).replace(/^\s*\/\s*/, '');
  const single = parts[0];

  return (
    <div className="mt-3">
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface2 px-3 py-2">
          <span className="text-xs font-bold">Preview — tickets to be created</span>
          <div className="flex items-center gap-2">
            <span
              className="whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold"
              style={isMulti ? { color: '#6d28d9', backgroundColor: '#ede9fe' } : { color: '#0c6b50', backgroundColor: '#dff2eb' }}
            >
              {isMulti ? `Slide (Assembly) — ${parts.length} parts` : 'Single Slide — 1 ticket'}
            </span>
            <span className="whitespace-nowrap text-xs text-text3">{Math.round(totalHrs * 10) / 10}h total</span>
          </div>
        </div>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-text3">
              <th className="border-b border-border px-2.5 py-1 text-left font-semibold">Ticket type</th>
              <th className="border-b border-border px-2.5 py-1 text-left font-semibold">Detail</th>
              <th className="border-b border-border px-2.5 py-1 text-left font-semibold">Spec</th>
              <th className="border-b border-border px-2.5 py-1 text-right font-semibold">Hrs</th>
            </tr>
          </thead>
          <tbody>
            {isMulti ? (
              <>
                <tr className="bg-surface2">
                  <td className="px-2.5 py-1"><PreviewTypeBadge type="COMP" /></td>
                  <td className="px-2.5 py-1 font-semibold">
                    {selected.name} <span className="text-[10px] font-normal text-text3">(assembly)</span>
                  </td>
                  <td className="px-2.5 py-1">{spec || '—'}</td>
                  <td className="px-2.5 py-1 text-right">{asmHrs ? `${asmHrs}h` : '—'}</td>
                </tr>
                {parts.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-2.5 py-1 pl-5"><PreviewTypeBadge type="PART" /></td>
                    <td className="px-2.5 py-1 text-text2">{p.detail}</td>
                    <td className="px-2.5 py-1">{spec || p.spec || '—'}</td>
                    <td className="px-2.5 py-1 text-right">{p.hrs || 0}h</td>
                  </tr>
                ))}
              </>
            ) : (
              <tr>
                <td className="px-2.5 py-1"><PreviewTypeBadge type="MADE" /></td>
                <td className="px-2.5 py-1 font-semibold">{selected.name}</td>
                <td className="px-2.5 py-1">{spec || single?.spec || '—'}</td>
                <td className="px-2.5 py-1 text-right">{single?.hrs || 0}h</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {resin === 'M2' && (
        <div className="mt-1.5 rounded-md border border-[#f0c040] bg-[#fff3cd] px-3 py-2 text-xs font-bold text-[#7a4800]">
          ⚠ M2 RESIN selected — all tickets will be marked M2.
        </div>
      )}
    </div>
  );
}

/**
 * Editable ticket card for Step 2 — inline detail + colour/spec, plus a read-only
 * list of the assembly's parts (each with its own editable detail/spec). Ports
 * t-card.html's renderStep2Tickets. Edits save on blur.
 */
function TicketCard({
  t,
  parts,
  onEditDetail,
  onEditSpec,
  onRemove,
  removing,
}: {
  t: Ticket;
  parts: Ticket[];
  onEditDetail: (id: number, value: string) => void;
  onEditSpec: (id: number, value: string) => void;
  onRemove: () => void;
  removing?: boolean;
}) {
  const isComp = t.type === 'COMP';
  const totalHrs = isComp ? parts.reduce((s, p) => s + (p.hrs || 0), 0) : t.hrs || 0;

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-border">
      <div className="border-b border-border bg-surface2 px-3 py-2.5">
        <div className="mb-2 flex items-center gap-2">
          <PreviewTypeBadge type={t.type} />
          <span className="text-xs text-text3">{Math.round(totalHrs * 10) / 10}h</span>
          {t.netPrice ? (
            <span className="ml-auto text-xs font-semibold">£{t.netPrice.toLocaleString()}</span>
          ) : (
            <span className="ml-auto" />
          )}
          <button
            onClick={onRemove}
            disabled={removing}
            aria-label="Remove ticket"
            className="rounded px-1.5 py-0.5 text-xs text-red hover:bg-red/10 disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text3">Detail</label>
            <input
              className={cellInput}
              defaultValue={t.detail}
              onBlur={(e) => e.target.value !== t.detail && onEditDetail(t.id, e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text3">Colour / Spec</label>
            <input
              className={cellInput}
              defaultValue={t.spec ?? ''}
              placeholder="e.g. RAL 5002 Dark Blue"
              onBlur={(e) => e.target.value !== (t.spec ?? '') && onEditSpec(t.id, e.target.value)}
            />
          </div>
        </div>
      </div>

      {parts.length > 0 && (
        <div className="bg-surface px-3 pb-2.5 pt-2">
          <div className="mb-1.5 pl-5 text-[11px] font-bold uppercase tracking-wide text-text3">Parts</div>
          {parts.map((p) => (
            <div key={p.id} className="mb-1.5 grid grid-cols-[16px_1fr_1fr_40px] items-center gap-1.5 last:mb-0">
              <span className="text-xs text-text3">↳</span>
              <input
                className={cellInput}
                defaultValue={p.detail}
                onBlur={(e) => e.target.value !== p.detail && onEditDetail(p.id, e.target.value)}
              />
              <input
                className={cellInput}
                defaultValue={p.spec ?? ''}
                placeholder="Spec / colour"
                onBlur={(e) => e.target.value !== (p.spec ?? '') && onEditSpec(p.id, e.target.value)}
              />
              <span className="text-right text-xs text-text3">{p.hrs || 0}h</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
