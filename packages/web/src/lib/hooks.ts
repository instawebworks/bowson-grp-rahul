import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api';
import type {
  Catalogue,
  Customer,
  DashboardData,
  Mould,
  Operative,
  Order,
  Ticket,
} from './types';

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => apiClient.get<DashboardData>('/api/dashboard') });
}

export function useOrders() {
  return useQuery({ queryKey: ['orders'], queryFn: () => apiClient.get<Order[]>('/api/orders') });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiClient.get<Order>(`/api/orders/${id}`),
    enabled: id != null,
  });
}

export interface AddTicketInput {
  fromCatalogueId?: number;
  colour?: string;
  resin?: string;
  type?: string;
  detail?: string;
  spec?: string | null;
  qty?: number;
  unitPrice?: number;
  hrs?: number;
  resinType?: string | null;
}

export function useAddTicket(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddTicketInput) => apiClient.post<Order>(`/api/orders/${orderId}/tickets`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useChangeTicketStatus(orderId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, status, note }: { ticketId: number; status: string; note?: string }) =>
      apiClient.post(`/api/tickets/${ticketId}/status`, { status, note }),
    onSuccess: () => {
      if (orderId != null) qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useTickets(params?: { status?: string; orderId?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.orderId) qs.set('orderId', String(params.orderId));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return useQuery({
    queryKey: ['tickets', params ?? {}],
    queryFn: () => apiClient.get<Ticket[]>(`/api/tickets${suffix}`),
  });
}

/** All tickets, polled, for the live T-Card board. */
export function useBoardTickets() {
  return useQuery({
    queryKey: ['board-tickets'],
    queryFn: () => apiClient.get<Ticket[]>('/api/tickets'),
    refetchInterval: 5000,
  });
}

function invalidateBoard(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['board-tickets'] });
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useBoardStatusChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: number; status: string }) =>
      apiClient.post(`/api/tickets/${ticketId}/status`, { status }),
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useAssignTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, operativeIds }: { ticketId: number; operativeIds: number[] }) =>
      apiClient.post(`/api/tickets/${ticketId}/assign`, { operativeIds }),
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useToggleTimer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, operativeId, action }: { ticketId: number; operativeId: number; action: 'start' | 'stop' }) =>
      apiClient.post(`/api/tickets/${ticketId}/time/${action}`, { operativeId }),
    onSuccess: () => invalidateBoard(qc),
  });
}

export function useCustomers() {
  return useQuery({ queryKey: ['customers'], queryFn: () => apiClient.get<Customer[]>('/api/customers') });
}

export function useOperatives() {
  return useQuery({ queryKey: ['operatives'], queryFn: () => apiClient.get<Operative[]>('/api/operatives') });
}

export function useMoulds() {
  return useQuery({ queryKey: ['moulds'], queryFn: () => apiClient.get<Mould[]>('/api/moulds') });
}

export function useCatalogue() {
  return useQuery({ queryKey: ['catalogue'], queryFn: () => apiClient.get<Catalogue[]>('/api/catalogue') });
}

// ─── Mutations ───────────────────────────────────────────────────────────────
export interface CreateOrderInput {
  orderNumber: string;
  customerId?: number | null;
  siteName?: string | null;
  despatch?: string | null;
  resinType?: string;
  deadline?: string | null;
  notes?: string | null;
  themeImage?: string | null;
  isDraft?: boolean;
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => apiClient.post<Order>('/api/orders', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface CustomerFormInput {
  name: string;
  contact?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  region?: string | null;
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomerFormInput) => apiClient.post<Customer>('/api/customers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CustomerFormInput }) =>
      apiClient.patch<Customer>(`/api/customers/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
