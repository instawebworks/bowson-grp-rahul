import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="board" element={<Board />} />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="tickets" element={<Tickets />} />
          <Route
            path="in-production"
            element={<Orders title="In Production" statuses={['In Progress']} />}
          />
          <Route
            path="ready"
            element={<Orders title="Ready to Despatch" statuses={['Ready to Despatch']} />}
          />
          <Route
            path="despatched"
            element={<Orders title="Despatched" statuses={['Despatched', 'Completed']} />}
          />
          <Route path="schedule" element={<PagePlaceholder title="Schedule" phase="Phase 5" />} />
          <Route path="moulds" element={<Moulds />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="customers" element={<Customers />} />
          <Route path="operatives" element={<Operatives />} />
          <Route path="*" element={<PagePlaceholder title="Not found" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
