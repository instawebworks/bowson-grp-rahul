import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/api';
import { useAuth } from '../lib/auth';
import logoUrl from '../assets/bowson-logo.jpg';

/**
 * Unified PIN login, ported from login_part.html:
 * a "Who are you?" grid of operative names + a Manager Login button,
 * then a PIN pad for whoever was selected. No email/password accounts.
 */

interface LoginOp {
  id: number;
  name: string;
  onShift: boolean;
}

const initials = (name: string) =>
  name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export function Login() {
  const { signIn } = useAuth();
  // null = choosing; {operativeId:null} = manager PIN; {operativeId:n} = operative PIN
  const [target, setTarget] = useState<{ operativeId: number | null; name: string } | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const dotsRef = useRef<HTMLDivElement>(null);

  const { data: ops, isLoading, error: loadError } = useQuery({
    queryKey: ['auth-operatives'],
    queryFn: () => apiClient.get<LoginOp[]>('/api/auth/operatives'),
    refetchInterval: 30_000,
  });

  function back() {
    setTarget(null);
    setPin('');
    setError(null);
  }

  async function submit(value?: string) {
    const entered = value ?? pin;
    if (!target || !entered || busy) return;
    setBusy(true);
    const { error } = await signIn(target.operativeId, entered);
    setBusy(false);
    if (error) {
      setPin('');
      setError(error.includes('Incorrect') || error.includes('401') ? 'Incorrect PIN — try again' : error);
      setShake((s) => s + 1);
    }
  }

  function pressDigit(d: string) {
    setError(null);
    setPin((p) => (p.length >= 8 ? p : p + d));
  }

  // Physical keyboard support on the PIN screen.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressDigit(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') void submit();
      else if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pin, busy]);

  // Shake the dots on a failed attempt (prototype's grpPinError).
  useEffect(() => {
    if (!shake || !dotsRef.current) return;
    const el = dotsRef.current;
    el.style.transition = 'transform .1s';
    el.style.transform = 'translateX(8px)';
    const t1 = setTimeout(() => (el.style.transform = 'translateX(-8px)'), 100);
    const t2 = setTimeout(() => (el.style.transform = 'translateX(0)'), 200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [shake]);

  const dotCount = Math.max(4, pin.length);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6">
      <div className="mb-8 text-center">
        <img src={logoUrl} alt="Bowson GRP" className="mx-auto mb-2 h-auto w-44" />
        <div className="text-[11px] font-extrabold uppercase tracking-[2px] text-text3">Factory</div>
      </div>

      {!target ? (
        /* ── Phase 1: who are you? ─────────────────────────────────── */
        <div className="w-full max-w-md">
          <div className="mb-4 text-center text-[11px] font-extrabold uppercase tracking-wider text-text3">
            Who are you?
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2.5">
            {isLoading && (
              <div className="col-span-2 py-6 text-center text-xs text-text3">Loading…</div>
            )}
            {!!loadError && (
              <div className="col-span-2 py-6 text-center text-xs text-red">
                ⚠ Cannot reach the server. Check your connection.
              </div>
            )}
            {ops && ops.length === 0 && (
              <div className="col-span-2 py-6 text-center text-xs text-text3">
                No operatives set up yet.<br />A manager must add them first.
              </div>
            )}
            {(ops ?? []).map((op) => (
              <button
                key={op.id}
                onClick={() => { setTarget({ operativeId: op.id, name: op.name }); setPin(''); setError(null); }}
                className={`rounded-2xl border-[1.5px] bg-surface px-3 py-4 text-center shadow-sm transition hover:border-teal hover:shadow ${
                  op.onShift ? 'border-teal' : 'border-border'
                }`}
              >
                <div className="mx-auto mb-2.5 flex h-12 w-12 items-center justify-center rounded-full bg-teal-l text-[17px] font-extrabold text-teal">
                  {initials(op.name)}
                </div>
                <div className="text-sm font-bold">{op.name}</div>
                <div className={`mt-1 text-[10px] font-semibold uppercase tracking-wide ${op.onShift ? 'text-teal' : 'text-text3'}`}>
                  {op.onShift ? '● On shift' : 'Tap to sign in'}
                </div>
              </button>
            ))}
          </div>
          <button
            onClick={() => { setTarget({ operativeId: null, name: 'Manager' }); setPin(''); setError(null); }}
            className="w-full rounded-xl border-[1.5px] border-border bg-surface px-3 py-3 text-xs font-bold uppercase tracking-wide text-text2 shadow-sm transition hover:border-teal hover:text-teal"
          >
            🔐 Manager Login
          </button>
        </div>
      ) : (
        /* ── Phase 2: PIN entry ────────────────────────────────────── */
        <div className="w-full max-w-xs text-center">
          <button onClick={back} className="mb-5 text-[13px] text-text3 hover:text-text">← Back</button>
          <div className="mb-1 text-[22px] font-extrabold">{target.name}</div>
          <div className="mb-7 text-xs text-text3">Enter your PIN to sign in</div>

          <div ref={dotsRef} className="mb-8 flex justify-center gap-3">
            {Array.from({ length: dotCount }, (_, i) => (
              <div
                key={i}
                className={`h-3.5 w-3.5 rounded-full border-2 transition ${
                  i < pin.length ? 'border-teal bg-teal' : 'border-border2 bg-transparent'
                }`}
              />
            ))}
          </div>

          <div className="mx-auto grid max-w-[260px] grid-cols-3 gap-2.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button key={d} onClick={() => pressDigit(d)} className="rounded-2xl border border-border bg-surface py-4 text-[22px] font-semibold shadow-sm active:bg-surface2">
                {d}
              </button>
            ))}
            <button onClick={() => { setPin((p) => p.slice(0, -1)); setError(null); }} className="rounded-2xl border border-border bg-surface py-4 text-xl text-text2 shadow-sm active:bg-surface2">
              ⌫
            </button>
            <button onClick={() => pressDigit('0')} className="rounded-2xl border border-border bg-surface py-4 text-[22px] font-semibold shadow-sm active:bg-surface2">
              0
            </button>
            <button
              onClick={() => void submit()}
              disabled={busy || !pin}
              className="rounded-2xl border border-teal bg-teal-l py-4 text-[22px] font-bold text-teal shadow-sm disabled:opacity-40"
            >
              {busy ? '…' : '→'}
            </button>
          </div>

          <div className="mt-4 min-h-[18px] text-xs font-bold text-red">{error}</div>
        </div>
      )}
    </div>
  );
}
