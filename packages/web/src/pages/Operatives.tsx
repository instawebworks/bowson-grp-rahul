import { useState } from 'react';
import { useOperatives } from '../lib/hooks';
import { Button, Card, Content, PageHeader, QueryState, Table } from '../components/ui';
import { OperativeForm } from '../components/OperativeForm';
import { useAuth } from '../lib/auth';
import type { Operative } from '../lib/types';

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
        <Card>
          <Table head={['Name', 'Skills', 'Default hrs/day', '']}>
            <QueryState isLoading={isLoading} error={error} colSpan={4} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-xs text-text3">No operatives yet.</td>
              </tr>
            )}
            {rows.map((o) => (
              <tr
                key={o.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                onClick={() => setEditing(o)}
              >
                <td className="px-3 py-2 font-semibold">{o.name}</td>
                <td className="px-3 py-2">
                  {o.skills.length ? (
                    <div className="flex flex-wrap gap-1">
                      {o.skills.map((s) => (
                        <span key={s} className="rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] text-text2">
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-text3">—</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums text-text2">{o.defaultHrs ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <Button onClick={(e) => { e.stopPropagation(); setEditing(o); }}>Edit</Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}
