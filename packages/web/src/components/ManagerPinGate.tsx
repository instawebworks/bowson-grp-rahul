import { useState } from 'react';
import { MANAGER_PIN } from '../lib/config';
import { Button, Modal } from './ui';

/**
 * Manager authorisation gate. Shows a PIN modal; calls onSuccess only when the
 * correct manager PIN is entered. Mirrors the prototype's promptManagerPin().
 */
export function ManagerPinGate({
  action,
  title = 'Manager Authorisation Required',
  prompt,
  confirmLabel = 'Authorise',
  onSuccess,
  onCancel,
}: {
  action?: string;
  title?: string;
  prompt?: string;
  confirmLabel?: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);

  function authorise() {
    if (pin !== MANAGER_PIN) {
      setErr(true);
      setPin('');
      return;
    }
    onSuccess();
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={authorise}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-text2">{prompt ?? `Enter the manager PIN to ${action ?? 'continue'}.`}</p>
      <label className="mb-1 block text-[11px] font-semibold text-text2">Manager PIN</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={pin}
          maxLength={8}
          autoFocus
          inputMode="numeric"
          placeholder="Enter PIN"
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === 'Enter' && authorise()}
          className="w-full rounded-md border border-border2 bg-surface px-3 py-2.5 pr-16 text-base font-semibold tracking-[6px] text-text outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-text3 focus:border-teal"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] font-semibold text-teal hover:bg-teal-l/50"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {err && <div className="mt-1.5 text-[11px] text-red">Incorrect PIN — try again</div>}
    </Modal>
  );
}
