import { Button, Modal } from './ui';
import type { Catalogue } from '../lib/types';

/** The ticket the viewer was opened from — its own part is called out. */
export interface SpecTicketRef {
  type: string;
  detail: string;
  drawing: string | null;
  hrs: number;
}

/**
 * Specification viewer — ported from viewSpecById / kbViewSpec: renders the
 * spec document (PDF via iframe, else image) in black & white with a download
 * link; when the template has no document, falls back to a parts / drawing
 * reference table. When opened from a ticket, that ticket's part is named up
 * top and highlighted in the table (client snag #19: "populate the part").
 */
export function SpecModal({ template, ticket, onClose }: { template: Catalogue; ticket?: SpecTicketRef; onClose: () => void }) {
  const url = template.specUrl;
  const isPdf = !!url && url.startsWith('data:application/pdf');
  const isPart = ticket?.type === 'PART' || ticket?.type === 'MADE';
  const matches = (p: { detail: string; drawing: string | null }) =>
    !!ticket && isPart && (p.detail === ticket.detail || (!!ticket.drawing && p.drawing === ticket.drawing));
  return (
    <Modal
      title={`Specification — ${template.name}`}
      sub={template.code ?? template.productCode}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <>
          {url && (
            <a
              href={url}
              download={`${template.productCode || 'spec'}-specification`}
              className="rounded-md border border-border2 bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface2"
            >
              ⬇ Download
            </a>
          )}
          <Button variant="primary" onClick={onClose}>✕ Close</Button>
        </>
      }
    >
      {ticket && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-teal bg-teal-l px-3 py-2 text-xs">
          <span className="text-[10px] font-bold uppercase tracking-wide text-teal">{isPart ? 'This part' : 'This ticket'}</span>
          <span className="font-semibold">{ticket.detail}</span>
          {ticket.drawing && <span className="font-mono text-[11px] text-text2">Drawing {ticket.drawing}</span>}
          <span className="text-[11px] text-text2">{ticket.hrs}h</span>
        </div>
      )}
      {url ? (
        <>
          {isPdf ? (
            <iframe
              src={`${url}#toolbar=0`}
              title="Specification"
              className="h-[60vh] w-full rounded-lg border-0"
              style={{ filter: 'grayscale(100%)' }}
            />
          ) : (
            <img
              src={url}
              alt="Specification"
              className="mx-auto block max-h-[60vh] max-w-full rounded-lg"
              style={{ filter: 'grayscale(100%)' }}
            />
          )}
          <div className="mt-2 text-[10px] text-text3">Displayed in black &amp; white · Use ⬇ Download to save</div>
        </>
      ) : (
        <>
          <p className="mb-2 text-xs text-text2">No specification document on file — parts &amp; drawing references:</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface2 text-left text-[10px] font-bold uppercase text-text3">
                <th className="px-3 py-1.5">Part</th>
                <th className="px-3 py-1.5">Drawing ref</th>
                <th className="px-3 py-1.5">Hrs</th>
              </tr>
            </thead>
            <tbody>
              {template.parts.length ? (
                template.parts.map((p) => {
                  const mine = matches(p);
                  return (
                    <tr key={p.id} className={`border-b border-border last:border-0 ${mine ? 'bg-teal-l/60 font-semibold' : ''}`}>
                      <td className="px-3 py-1.5">
                        {p.detail}
                        {mine && <span className="ml-2 rounded bg-teal px-1.5 py-px text-[9px] font-bold text-white">THIS PART</span>}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-text2">{p.drawing ?? '—'}</td>
                      <td className="px-3 py-1.5 tabular-nums text-text2">{p.hrs}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={3} className="px-3 py-6 text-center text-text3">Single-piece product — no part list.</td></tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
