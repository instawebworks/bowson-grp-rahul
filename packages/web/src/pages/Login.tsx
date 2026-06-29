import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button, inputClass } from '../components/ui';
import logoUrl from '../assets/bowson-logo.jpg';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setError(error);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <img src={logoUrl} alt="Bowson GRP" className="mx-auto mb-5 h-auto w-40" />
        <div className="mb-4 text-center text-sm font-bold">Sign in</div>
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] font-semibold text-text2">Email</span>
          <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-[11px] font-semibold text-text2">Password</span>
          <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="mb-3 rounded-md bg-red/10 px-3 py-2 text-xs text-red">{error}</div>}
        <Button variant="primary" type="submit" disabled={busy} className="w-full justify-center">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}
