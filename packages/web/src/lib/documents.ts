// Printable despatch documents — ported 1:1 from t-card.html
// (_buildDespatchHtml / _buildInvoiceHtml / writeDespatchNote / writeInvoice).
// Layout, CSS and wording are the prototype's; only the data plumbing differs
// (camelCase API shapes with the order + customer embedded on each ticket).
import logoUrl from '../assets/bowson-logo.jpg';
import type { Order, Ticket } from './types';

/** A ticket with its owning order attached (Ready view tickets embed it; the
 * Despatched view attaches the order itself). */
export type DocTicket = Ticket & { order?: Order };

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** yyyy-mm-dd → dd/mm/yyyy (prototype _fmt). */
function fmt(d: string | null | undefined): string {
  if (!d) return '—';
  const p = d.slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

/** Absolute logo URL so it renders in about:blank / data-URL windows. */
const LOGO = () =>
  `<img src="${new URL(logoUrl, window.location.origin).href}" style="height:70px;width:auto;" alt="Bowson GRP">`;

// Shared print stylesheet — verbatim from the prototype.
const CSS =
  '*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:13px;color:#1a1917;background:#fff;padding:20px;max-width:960px;margin:0 auto}.np{display:flex;gap:8px;margin-bottom:20px}@media print{.np{display:none}}table{width:100%;border-collapse:collapse;margin-bottom:20px}th{background:#1a1917;color:#fff;padding:8px 12px;font-size:11px;font-weight:600;text-align:left}td{padding:7px 12px;border-bottom:1px solid #eee;font-size:12px;vertical-align:top}.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:4px solid #1a1917;margin-bottom:20px}.addr{font-size:11px;color:#555;line-height:1.8;margin-top:6px}.doc-ref{font-size:22px;font-weight:700;color:#1a1917}.doc-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;margin-bottom:4px}.shdr{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin:16px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}.oh{background:#f5f4f1}.ft{display:flex;justify-content:space-between;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:12px;margin-top:24px}.pp{background:#e8f0fe;color:#1558a0;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px}.cp{background:#e6f7f1;color:#0c6b50;font-size:10px;font-weight:600;padding:1px 5px;border-radius:3px}.tobox{border:1px solid #eee;border-radius:6px;padding:12px 16px;font-size:12px;line-height:1.8}.tolbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:6px}';

const typePill = (tp: string) =>
  tp === 'PART' ? '<span class="pp">Part</span> ' : tp === 'COMP' ? '<span class="cp">Assembly</span> ' : '';

function orderIdsOf(tickets: DocTicket[]): number[] {
  return [...new Set(tickets.map((t) => t.orderId))];
}

const orderOf = (tickets: DocTicket[], oid: number) => tickets.find((t) => t.orderId === oid)?.order;

/** Build the printable Delivery Note HTML (prototype _buildDespatchHtml). */
export function buildDespatchHtml(tickets: DocTicket[], dDate: string, isPartial: boolean): string {
  const orderIds = orderIdsOf(tickets);
  const firstOrder = orderOf(tickets, orderIds[0]!);
  const cust = firstOrder?.customer;
  const dnRef =
    (isPartial ? 'PDN-' : 'DN-') +
    orderIds.map((id) => orderOf(tickets, id)?.orderNumber ?? id).join('-') +
    '-' + dDate.replace(/-/g, '');

  const rows = orderIds
    .map((oid) => {
      const o = orderOf(tickets, oid);
      const cu = o?.customer;
      const ts = tickets.filter((t) => t.orderId === oid);
      let r =
        `<tr class="oh"><td colspan="5" style="padding:8px 12px;font-size:11px;font-weight:700;border-bottom:1px solid #ddd">Order ${esc(o?.orderNumber)}&mdash;${esc(o?.siteName)}` +
        `<span style="font-weight:400;color:#888;margin-left:6px">${esc(cu?.name)}</span></td></tr>`;
      r += ts
        .map(
          (t) =>
            `<tr><td style="width:80px;font-weight:600">#${t.tn ?? ''}</td><td>${typePill(t.type)}${esc(t.detail)}</td>` +
            `<td style="color:#666;width:140px">${esc(t.spec) || '&mdash;'}</td>` +
            `<td style="width:40px;text-align:center">${t.qty || 1}</td>` +
            `<td style="width:100px;color:#0c6b50;font-weight:600">&mdash;</td></tr>`,
        )
        .join('');
      return r;
    })
    .join('');

  const pb = isPartial
    ? '<div style="background:#fff8e6;border:2px solid #f0a500;border-radius:6px;padding:10px 14px;margin-bottom:20px;font-size:12px"><strong>&#9888; Partial Despatch</strong></div>'
    : '';
  const toLines = [cust?.name, firstOrder?.siteName, cust?.address].filter(Boolean).map((x) => esc(x)).join('<br>');

  return (
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${dnRef}</title><style>${CSS}</style></head><body>` +
    '<div class="np"><button onclick="window.print()" style="padding:8px 20px;background:#1a1917;color:#fff;border:none;border-radius:5px;font-size:13px;cursor:pointer">Print</button>' +
    '<button onclick="window.close()" style="padding:8px 14px;background:#f5f4f1;color:#444;border:1px solid #ccc;border-radius:5px;font-size:13px;cursor:pointer">Close</button></div>' +
    `<div class="hdr"><div>${LOGO()}<div class="addr">Unit 4B Askern Road, Carcroft, Doncaster DN6 8DD<br>info@bowsongrp.co.uk</div></div>` +
    `<div style="text-align:right"><div class="doc-label">Delivery Note</div><div class="doc-ref">${dnRef}</div><div style="font-size:12px;color:#444;margin-top:4px">Date: <strong>${fmt(dDate)}</strong></div></div></div>` +
    pb +
    '<div style="display:flex;gap:20px;margin-bottom:20px">' +
    `<div class="tobox" style="flex:1"><div class="tolbl">Deliver To</div>${toLines || '&mdash;'}</div>` +
    '<div class="tobox" style="flex:1"><div class="tolbl">Order Details</div>' +
    `<table style="margin:0"><tr><td style="border:none;padding:2px 0;color:#888;font-size:11px;width:110px">Order #</td><td style="border:none;padding:2px 0;font-size:11px;font-weight:600">${esc(firstOrder?.orderNumber) || '&mdash;'}</td></tr>` +
    `<tr><td style="border:none;padding:2px 0;color:#888;font-size:11px">Customer Ref</td><td style="border:none;padding:2px 0;font-size:11px">${esc(firstOrder?.despatch) || '&mdash;'}</td></tr>` +
    `<tr><td style="border:none;padding:2px 0;color:#888;font-size:11px">Deadline</td><td style="border:none;padding:2px 0;font-size:11px">${firstOrder?.deadline ? esc(firstOrder.deadline.slice(0, 10)) : '&mdash;'}</td></tr></table></div></div>` +
    '<div class="shdr">Items Despatched</div>' +
    `<table><thead><tr><th style="width:80px">T/Card #</th><th>Description</th><th style="width:140px">Spec / Theme</th><th style="width:40px;text-align:center">Qty</th><th style="width:100px">QC Ref</th></tr></thead><tbody>${rows}</tbody></table>` +
    '<div style="background:#f5f4f1;border-radius:6px;padding:14px 16px;font-size:12px;margin-bottom:20px"><strong>Received in good condition by:</strong>' +
    '<div style="display:flex;gap:40px;margin-top:12px"><div>Name: <span style="display:inline-block;border-bottom:1px solid #999;width:160px">&nbsp;</span></div>' +
    '<div>Signature: <span style="display:inline-block;border-bottom:1px solid #999;width:160px">&nbsp;</span></div>' +
    '<div>Date: <span style="display:inline-block;border-bottom:1px solid #999;width:90px">&nbsp;</span></div></div></div>' +
    `<div class="ft"><span>Bowson GRP &middot; Unit 4B Askern Road &middot; Doncaster DN6 8DD</span><span>${dnRef}</span></div>` +
    '</body></html>'
  );
}

/** Build the printable Invoice HTML (prototype _buildInvoiceHtml). */
export function buildInvoiceHtml(tickets: DocTicket[], dDate: string): string {
  const orderIds = orderIdsOf(tickets);
  const firstOrder = orderOf(tickets, orderIds[0]!);
  const cust = firstOrder?.customer;
  const invRef =
    'INV-' + orderIds.map((id) => orderOf(tickets, id)?.orderNumber ?? id).join('-') + '-' + dDate.replace(/-/g, '');
  const grandTotal = tickets.reduce((a, t) => a + (t.netPrice || 0), 0);

  const rows = orderIds
    .map((oid) => {
      const o = orderOf(tickets, oid);
      const cu = o?.customer;
      const ts = tickets.filter((t) => t.orderId === oid);
      const ot = ts.reduce((a, t) => a + (t.netPrice || 0), 0);
      let r =
        `<tr class="oh"><td colspan="6" style="padding:8px 12px;font-size:11px;font-weight:700;border-bottom:1px solid #ddd">Order ${esc(o?.orderNumber)}&mdash;${esc(o?.siteName)}` +
        `<span style="font-weight:400;color:#888;margin-left:6px">${esc(cu?.name)}</span></td></tr>`;
      r += ts
        .map(
          (t) =>
            `<tr><td style="width:80px;font-weight:600">#${t.tn ?? ''}</td><td>${typePill(t.type)}${esc(t.detail)}</td>` +
            `<td style="color:#666;width:140px">${esc(t.spec) || '&mdash;'}</td>` +
            `<td style="width:40px;text-align:center">${t.qty || 1}</td>` +
            `<td style="width:80px;text-align:right">${t.unitPrice ? '&pound;' + t.unitPrice.toFixed(2) : '&mdash;'}</td>` +
            `<td style="width:90px;text-align:right;font-weight:600">${t.netPrice ? '&pound;' + t.netPrice.toFixed(2) : '&mdash;'}</td></tr>`,
        )
        .join('');
      if (ot) {
        r +=
          `<tr style="background:#fafaf8"><td colspan="5" style="text-align:right;font-size:11px;color:#888;padding:6px 12px;border-bottom:none">Order subtotal</td>` +
          `<td style="text-align:right;font-weight:700;padding:6px 12px;border-bottom:none">&pound;${ot.toFixed(2)}</td></tr>`;
      }
      return r;
    })
    .join('');

  const toLines = [cust?.name, firstOrder?.siteName, cust?.address].filter(Boolean).map((x) => esc(x)).join('<br>');

  return (
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${invRef}</title><style>${CSS}</style></head><body>` +
    '<div class="np"><button onclick="window.print()" style="padding:8px 20px;background:#1a1917;color:#fff;border:none;border-radius:5px;font-size:13px;cursor:pointer">Print Invoice</button>' +
    '<button onclick="window.close()" style="padding:8px 14px;background:#f5f4f1;color:#444;border:1px solid #ccc;border-radius:5px;font-size:13px;cursor:pointer">Close</button></div>' +
    `<div class="hdr"><div>${LOGO()}<div class="addr">Unit 4B Askern Road, Carcroft, Doncaster DN6 8DD<br>info@bowsongrp.co.uk</div></div>` +
    `<div style="text-align:right"><div class="doc-label">Invoice</div><div class="doc-ref">${invRef}</div><div style="font-size:12px;color:#444;margin-top:4px">Date: <strong>${fmt(dDate)}</strong></div></div></div>` +
    '<div style="display:flex;gap:20px;margin-bottom:20px">' +
    `<div class="tobox" style="flex:1"><div class="tolbl">Invoice To</div>${toLines || '&mdash;'}</div>` +
    '<div class="tobox" style="flex:1"><div class="tolbl">Order Details</div>' +
    `<table style="margin:0"><tr><td style="border:none;padding:2px 0;color:#888;font-size:11px;width:110px">Order #</td><td style="border:none;padding:2px 0;font-size:11px;font-weight:600">${esc(firstOrder?.orderNumber) || '&mdash;'}</td></tr>` +
    `<tr><td style="border:none;padding:2px 0;color:#888;font-size:11px">Customer Ref</td><td style="border:none;padding:2px 0;font-size:11px">${esc(firstOrder?.despatch) || '&mdash;'}</td></tr>` +
    `<tr><td style="border:none;padding:2px 0;color:#888;font-size:11px">Despatch Date</td><td style="border:none;padding:2px 0;font-size:11px">${fmt(dDate)}</td></tr></table></div></div>` +
    '<div class="shdr">Items</div>' +
    `<table><thead><tr><th style="width:80px">T/Card #</th><th>Description</th><th style="width:140px">Spec / Theme</th><th style="width:40px;text-align:center">Qty</th><th style="width:80px;text-align:right">Unit &pound;</th><th style="width:90px;text-align:right">Net &pound;</th></tr></thead><tbody>${rows}</tbody>` +
    (grandTotal
      ? `<tfoot><tr style="background:#1a1917;color:#fff"><td colspan="5" style="padding:10px 12px;font-weight:700;text-align:right;font-size:13px">Total</td><td style="padding:10px 12px;font-weight:700;text-align:right;font-size:15px">&pound;${grandTotal.toFixed(2)}</td></tr></tfoot>`
      : '') +
    '</table>' +
    '<div style="background:#f5f4f1;border-radius:6px;padding:14px 16px;font-size:12px;margin-bottom:20px"><strong>Payment Terms:</strong> 30 days from invoice date. Please quote invoice reference when making payment.</div>' +
    `<div class="ft"><span>Bowson GRP &middot; Unit 4B Askern Road &middot; Doncaster DN6 8DD</span><span>${invRef}</span></div>` +
    '</body></html>'
  );
}

/** Open a document in a popup, falling back to a data URL if blocked. */
export function openDocument(html: string, width = 860, height = 680): void {
  const win = window.open('', '_blank', `width=${width},height=${height},scrollbars=yes`);
  if (win && !win.closed) {
    win.document.write(html);
    win.document.close();
    return;
  }
  const a = document.createElement('a');
  a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
  a.target = '_blank';
  a.click();
}
