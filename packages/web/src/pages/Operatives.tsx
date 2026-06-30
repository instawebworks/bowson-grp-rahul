import { useState } from 'react';
import { useOperatives } from '../lib/hooks';
import { Button, Content, PageHeader } from '../components/ui';
import { OperativeForm } from '../components/OperativeForm';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/format';
import type { Operative } from '../lib/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Operatives() {
  const { data, isLoading, error } = useOperatives();
  const rows = data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Operative | null>(null);
  const { canManage } = useAuth();

  return (
    <>
      {showCreate && <OperativeForm onClose={() => setShowCreate(false)} />}
      {editing && <OperativeForm operative={editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Operatives & Settings"
        sub={`${rows.length} operative${rows.length === 1 ? '' : 's'}`}
        actions={canManage ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Operative</Button> : undefined}
      />
      <Content>
        {isLoading && <div className="text-xs text-text3">Loading…</div>}
        {error && <div className="text-xs text-text3">Could not load — {(error as Error).message}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-border2 bg-surface p-8 text-center text-xs text-text3">No operatives yet.</div>
        )}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((o) => {
            const std = o.dayPattern.length ? o.dayPattern.slice(0, 5).reduce((a, b) => a + b, 0) : (o.defaultHrs ?? 7.5) * 5;
            return (
              <button key={o.id} onClick={() => setEditing(o)} className="rounded-lg border border-border bg-surface p-3.5 text-left transition hover:border-teal">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-l text-xs font-bold text-teal">{initials(o.name)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{o.name}</div>
                    <div className="text-[10px] text-text3">{o.defaultHrs ?? 7.5}h/day · {std}h standard week</div>
                  </div>
                </div>
                {o.skills.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {o.skills.map((s) => (
                      <span key={s} className="rounded-full bg-teal-l px-2 py-0.5 text-[9px] font-semibold text-teal">{s.replace(/^\d+\.\s*/, '')}</span>
                    ))}
                  </div>
                )}
                {o.dayPattern.length >= 7 && (
                  <div className="mt-2.5 flex gap-1.5 border-t border-border pt-2 text-[9px]">
                    {DAYS.map((d, i) => {
                      const h = o.dayPattern[i] ?? 0;
                      const col = h === 0 ? 'text-red' : h < 7.5 ? 'text-amber' : 'text-teal';
                      return <span key={d} className={col}>{d} {h}h</span>;
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Content>
    </>
  );
}
