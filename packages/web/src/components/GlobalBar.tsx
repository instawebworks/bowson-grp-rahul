import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../lib/auth';
import { Button } from './ui';
import { OrderForm } from './OrderForm';
import { ImportWizard } from './ImportWizard';
import { ManagerPinGate } from './ManagerPinGate';
import { NewTicketForm } from './NewTicketForm';
import { GlobalSearch } from './GlobalSearch';

type Popup = null | 'order' | 'ticket-pin' | 'ticket' | 'import';

/**
 * Global controls shown on the right of every page header: search + the
 * Import / Ticket / Order actions + a saved indicator. Rendered by PageHeader
 * so the whole app has a single header row (matches the prototype's top bar).
 */
export function GlobalBar({ actions = true, leading }: { actions?: boolean; leading?: ReactNode }) {
  const { canManage } = useAuth();
  const [popup, setPopup] = useState<Popup>(null);

  return (
    <div className="flex items-center gap-1.5">
      <GlobalSearch />

      {leading}

      {actions && canManage && (
        <>
          <Button onClick={() => setPopup('import')}>⭱ Import CSV</Button>
          <Button onClick={() => setPopup('ticket-pin')}>+ Ticket</Button>
          <Button variant="primary" onClick={() => setPopup('order')}>+ Order</Button>
        </>
      )}
      <SavedIndicator />

      {popup === 'order' && <OrderForm onClose={() => setPopup(null)} />}
      {popup === 'ticket-pin' && (
        <ManagerPinGate
          action="add a standalone ticket"
          onSuccess={() => setPopup('ticket')}
          onCancel={() => setPopup(null)}
        />
      )}
      {popup === 'ticket' && <NewTicketForm onClose={() => setPopup(null)} />}
      {popup === 'import' && <ImportWizard onClose={() => setPopup(null)} />}
    </div>
  );
}

/**
 * Save indicator — mirrors the prototype's autosave status. Flashes teal with a
 * timestamp ("✓ Saved 11:52") whenever a write mutation succeeds, then fades back
 * to grey after 2s. Idle state shows a plain "✓ Saved".
 */
function SavedIndicator() {
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    return qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action?.type === 'success') {
        setSavedAt(new Date());
        setFlash(true);
      }
    });
  }, [qc]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(t);
  }, [flash, savedAt]);

  const label = savedAt
    ? `✓ Saved ${savedAt.getHours()}:${String(savedAt.getMinutes()).padStart(2, '0')}`
    : '✓ Saved';

  return (
    <span
      className={`ml-1 whitespace-nowrap text-[10px] transition-colors ${flash ? 'font-semibold text-teal' : 'text-text3'}`}
      title="Changes are saved to the database"
    >
      {label}
    </span>
  );
}
