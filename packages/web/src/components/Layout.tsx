import { NavLink, Outlet } from 'react-router-dom';
import { NAV } from '../nav';
import { NavIcon } from './icons';
import { useAuth } from '../lib/auth';
import { useOrders, useTickets } from '../lib/hooks';
import { daysToDeadline } from '../lib/format';
import logoUrl from '../assets/bowson-logo.jpg';

/** Red overdue-count badge on the "All Orders" nav item (prototype od-pill). */
function OverduePill() {
  const { data: orders } = useOrders();
  const n = (orders ?? []).filter(
    (o) =>
      o.deadline && (daysToDeadline(o.deadline) ?? 0) < 0 &&
      !['Despatched', 'Completed', 'Cancelled'].includes(o.status),
  ).length;
  if (!n) return null;
  return (
    <span className="ml-auto rounded-full bg-red px-1.5 py-px text-[9px] font-bold text-white">{n}</span>
  );
}

export function Layout() {
  return (
    <div className="grid min-h-screen grid-cols-[204px_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-3.5 py-2.5">
          <img src={logoUrl} alt="Bowson GRP" className="block h-auto w-full max-w-40" />
        </div>

        <nav className="flex-1 overflow-y-auto px-1.5 py-2">
          {NAV.map((section) => (
            <div key={section.label}>
              <div className="px-2 pb-1 pt-2 text-[9.5px] font-bold uppercase tracking-wider text-text3">
                {section.label}
              </div>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    [
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition',
                      isActive
                        ? 'bg-teal-l font-semibold text-teal [&_svg]:opacity-100'
                        : 'text-text2 hover:bg-surface2 hover:text-text [&_svg]:opacity-70',
                    ].join(' ')
                  }
                >
                  <NavIcon name={item.icon} />
                  {item.label}
                  {item.path === '/orders' && <OverduePill />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <SidebarStats />
        <SidebarFooter />
      </aside>

      {/* Main */}
      <main className="flex min-w-0 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarStats() {
  const { data: orders } = useOrders();
  const { data: tickets } = useTickets();
  const o = orders?.length ?? 0;
  const t = tickets?.length ?? 0;
  return (
    <div className="border-t border-border px-4 py-2 text-[10px] text-text3">
      {o} order{o === 1 ? '' : 's'} · {t} ticket{t === 1 ? '' : 's'}
    </div>
  );
}

function SidebarFooter() {
  const { session, signOut } = useAuth();
  if (session) {
    return (
      <div className="border-t border-border px-4 py-2.5">
        <button onClick={() => void signOut()} className="text-sm font-semibold text-teal hover:underline">
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-border px-4 py-2.5 text-[10px] leading-relaxed text-text3">
      Bowson GRP · rebuild
    </div>
  );
}
