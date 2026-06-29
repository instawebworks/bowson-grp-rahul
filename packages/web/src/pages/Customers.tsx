import { useState } from 'react';
import { useCustomers } from '../lib/hooks';
import { Button, Card, Content, PageHeader, QueryState, Table } from '../components/ui';
import { CustomerForm } from '../components/CustomerForm';
import { useAuth } from '../lib/auth';
import type { Customer } from '../lib/types';

export function Customers() {
  const { data, isLoading, error } = useCustomers();
  const rows = data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const { canManage } = useAuth();

  return (
    <>
      {showCreate && <CustomerForm onClose={() => setShowCreate(false)} />}
      {editing && <CustomerForm customer={editing} onClose={() => setEditing(null)} />}
      <PageHeader
        title="Customers"
        sub={`${rows.length} customer${rows.length === 1 ? '' : 's'}`}
        actions={canManage ? <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Customer</Button> : undefined}
      />
      <Content>
        <Card>
          <Table head={['Name', 'Contact', 'Phone', 'Email', 'Region', '']}>
            <QueryState isLoading={isLoading} error={error} colSpan={6} />
            {!isLoading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-xs text-text3">
                  No customers yet.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-teal-l/40"
                onClick={() => setEditing(c)}
              >
                <td className="px-3 py-2 font-semibold">{c.name}</td>
                <td className="px-3 py-2 text-text2">{c.contact ?? '—'}</td>
                <td className="px-3 py-2 text-text2">{c.phone ?? '—'}</td>
                <td className="px-3 py-2 text-text2">{c.email ?? '—'}</td>
                <td className="px-3 py-2 text-text2">{c.region ?? '—'}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(c);
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </Content>
    </>
  );
}
