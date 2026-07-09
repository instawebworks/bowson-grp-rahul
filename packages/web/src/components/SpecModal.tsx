import { Button, Modal } from './ui';
import type { Catalogue } from '../lib/types';

/**
 * Specification viewer — ported from viewSpecById / kbViewSpec: renders the
 * spec document (PDF via iframe, else image) in black & white with a download
 * link; when the template has no document, falls back to a parts / drawing
 * reference table.
 */
export function SpecModal({ template, onClose }: { template: Catalogue; onClose: () => void }) {
  const url = template.specUrl;
  const isPdf = !!url && url.startsWith('data:application/pdf');
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
                template.parts.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5">{p.detail}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-text2">{p.drawing ?? '—'}</td>
                    <td className="px-3 py-1.5 tabular-nums text-text2">{p.hrs}</td>
                  </tr>
                ))
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
