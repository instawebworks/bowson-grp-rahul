import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Open an order as a right-side drawer over the current page (prototype parity).
 * Passes the current location as `backgroundLocation` so App.tsx keeps this page
 * rendered underneath and shows the order detail as a drawer. A plain visit to
 * /orders/:id (no background) still renders the full-page order detail.
 */
export function useOpenOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  return (orderId: number) =>
    navigate(`/orders/${orderId}`, { state: { backgroundLocation: location } });
}
