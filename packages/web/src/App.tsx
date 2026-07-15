import { BrowserRouter, Route, Routes, useLocation, type Location } from 'react-router-dom';
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
import { Schedule } from './pages/Schedule';
import { Ready } from './pages/Ready';
import { Despatched } from './pages/Despatched';
import { InProduction } from './pages/InProduction';
import { ShopFloor } from './pages/ShopFloor';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}

function Gate() {
  const { required, user } = useAuth();
  const location = useLocation();
  if (required && !user) return <Login />;
  // Operatives get the shop-floor view (My Tickets / Available / Board) only.
  if (user?.role === 'operative') return <ShopFloor />;

  // Order detail opens as a right-side drawer over the page you came from
  // (prototype parity): navigating with a `backgroundLocation` renders that
  // page underneath and the order as a drawer. A direct visit / refresh with
  // no background falls back to the full-page order route (URL-shareable).
  const backgroundLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;

  return (
    <>
      <Routes location={backgroundLocation ?? location}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="board" element={<Board />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="tickets" element={<Tickets />} />
          <Route path="in-production" element={<InProduction />} />
          <Route path="ready" element={<Ready />} />
          <Route path="despatched" element={<Despatched />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="moulds" element={<Moulds />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="customers" element={<Customers />} />
          <Route path="operatives" element={<Operatives />} />
          <Route path="search" element={<Search />} />
          <Route path="*" element={<PagePlaceholder title="Not found" />} />
        </Route>
      </Routes>
      {backgroundLocation && (
        <Routes>
          <Route path="orders/:id" element={<OrderDetail asDrawer />} />
        </Routes>
      )}
    </>
  );
}
