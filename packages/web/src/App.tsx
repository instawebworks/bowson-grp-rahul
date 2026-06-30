import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { LIVE_STATUSES } from '@bowson/shared';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { PagePlaceholder } from './components/PagePlaceholder';
import { Dashboard } from './pages/Dashboard';
import { Board } from './pages/Board';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { Tickets } from './pages/Tickets';
import { Customers } from './pages/Customers';
import { Operatives } from './pages/Operatives';
import { Moulds } from './pages/Moulds';
import { Catalogue } from './pages/Catalogue';
import { Search } from './pages/Search';
import { Audit } from './pages/Audit';
import { Schedule } from './pages/Schedule';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-sm text-text3">{children}</div>;
}

function Gate() {
  const { required, loading, configured, session } = useAuth();
  if (required) {
    if (loading) return <FullScreen>Loading…</FullScreen>;
    if (!configured)
      return <FullScreen>Auth is required but Supabase isn’t configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).</FullScreen>;
    if (!session) return <Login />;
  }
  return (
    <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="board" element={<Board />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="in-production" element={<Tickets title="In Production" statuses={[...LIVE_STATUSES]} />} />
          <Route path="ready" element={<Tickets title="Ready to Despatch" statuses={['10. Ready to Despatch']} />} />
          <Route path="despatched" element={<Orders title="Despatched" statuses={['Despatched', 'Completed']} />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="moulds" element={<Moulds />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="customers" element={<Customers />} />
          <Route path="operatives" element={<Operatives />} />
          <Route path="audit" element={<Audit />} />
          <Route path="search" element={<Search />} />
          <Route path="*" element={<PagePlaceholder title="Not found" />} />
        </Route>
    </Routes>
  );
}
