import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './api';
import { supabase } from './supabase';
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

export interface OrderUpdateInput {
  status?: string;
  customerId?: number | null;
  siteName?: string | null;
  despatch?: string | null;
  resinType?: string;
  deadline?: string | null;
  wc?: string | null;
  notes?: string | null;
}

export function useUpdateOrder(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderUpdateInput) => apiClient.patch<Order>(`/api/orders/${orderId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['board-tickets'] });
    },
  });
}

/** Quick order status change (inline dropdown on the Orders list). */
export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.del(`/api/orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSetOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiClient.patch(`/api/orders/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface ScheduleWeek {
  key: string;
  wc: string;
  capacityHrs: number;
  committedHrs: number;
  ticketCount: number;
  utilisation: number;
}
export interface ScheduleData {
  weeklyCapacity: number;
  operativeCount: number;
  weeks: ScheduleWeek[];
}

export function useSchedule() {
  return useQuery({ queryKey: ['schedule'], queryFn: () => apiClient.get<ScheduleData>('/api/schedule') });
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiClient.get<Order>(`/api/orders/${id}`),
    enabled: id != null,
  });
}

export function useTicket(id: number | undefined) {
  return useQuery({
    queryKey: ['ticket', id],
    queryFn: () => apiClient.get<Ticket>(`/api/tickets/${id}`),
    enabled: id != null,
  });
}

export function useAuditFor(entityType: string, entityId: number | undefined) {
  return useQuery({
    queryKey: ['audit', entityType, entityId],
    queryFn: () => apiClient.get<AuditEntry[]>(`/api/audit?entityType=${entityType}&entityId=${entityId}`),
    enabled: entityId != null,
  });
}

export function useOrderAudit(orderId: number | undefined) {
  return useQuery({
    queryKey: ['audit', 'order-full', orderId],
    queryFn: () => apiClient.get<AuditEntry[]>(`/api/audit?orderId=${orderId}`),
    enabled: orderId != null,
  });
}

export function useUpdateCatalogue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CatalogueFormInput }) =>
      apiClient.patch<Catalogue>(`/api/catalogue/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogue'] }),
  });
}

export function useDeleteCatalogue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.del(`/api/catalogue/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogue'] }),
  });
}

export interface AddTicketInput {
  fromCatalogueId?: number;
  colour?: string;
  resin?: string;
  type?: string;
  detail?: string;
  spec?: string | null;
  drawing?: string | null;
  qty?: number;
  unitPrice?: number;
  hrs?: number;
  resinType?: string | null;
  themeImage?: string | null;
  status?: string;
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

export interface TicketEditInput {
  detail?: string;
  spec?: string | null;
  hrs?: number;
}

/** Inline edit of a ticket's detail / spec / hrs (used by the Step 2 ticket cards). */
export function useUpdateTicket(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, input }: { ticketId: number; input: TicketEditInput }) =>
      apiClient.patch(`/api/tickets/${ticketId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteTicket(orderId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: number) => apiClient.del(`/api/tickets/${ticketId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', orderId] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

function invalidateTicketViews(qc: ReturnType<typeof useQueryClient>, orderId?: number) {
  if (orderId != null) qc.invalidateQueries({ queryKey: ['order', orderId] });
  qc.invalidateQueries({ queryKey: ['orders'] });
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['ticket'] });
  qc.invalidateQueries({ queryKey: ['board-tickets'] });
  qc.invalidateQueries({ queryKey: ['moulds'] });
  qc.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useAssignMould(orderId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, mouldId }: { ticketId: number; mouldId: number | null }) =>
      apiClient.post(`/api/tickets/${ticketId}/mould`, { mouldId }),
    onSuccess: () => invalidateTicketViews(qc, orderId),
  });
}

export function useSetCure(orderId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, mins, targetStage }: { ticketId: number; mins: number; targetStage?: string }) =>
      apiClient.post(`/api/tickets/${ticketId}/cure`, { mins, targetStage }),
    onSuccess: () => invalidateTicketViews(qc, orderId),
  });
}

export function useConfirmCure(orderId?: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId }: { ticketId: number }) => apiClient.post(`/api/tickets/${ticketId}/cure/clear`, {}),
    onSuccess: () => invalidateTicketViews(qc, orderId),
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
      qc.invalidateQueries({ queryKey: ['ticket'] });
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

/** All tickets for the live T-Card board. Polls as a fallback; Realtime (below)
 * gives near-instant updates when auth + RLS are enabled. */
export function useBoardTickets() {
  return useQuery({
    queryKey: ['board-tickets'],
    queryFn: () => apiClient.get<Ticket[]>('/api/tickets'),
    refetchInterval: 15000,
  });
}

/** Subscribe to Supabase Realtime so the board refreshes the instant data changes.
 * No-op if Supabase isn't configured; falls back to polling. */
export function useBoardRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    const invalidate = () => qc.invalidateQueries({ queryKey: ['board-tickets'] });
    const channel = client
      .channel('board-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_sessions' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_assignments' }, invalidate)
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [qc]);
}

function invalidateBoard(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['board-tickets'] });
  qc.invalidateQueries({ queryKey: ['tickets'] });
  qc.invalidateQueries({ queryKey: ['ticket'] });
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

// ─── Operatives CRUD ─────────────────────────────────────────────────────────
export interface OperativeFormInput {
  name: string;
  skills: string[];
  defaultHrs?: number | null;
  dayPattern?: number[];
}

export function useCreateOperative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OperativeFormInput) => apiClient.post<Operative>('/api/operatives', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operatives'] }),
  });
}

export function useUpdateOperative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: OperativeFormInput }) =>
      apiClient.patch<Operative>(`/api/operatives/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operatives'] }),
  });
}

// ─── Moulds CRUD ─────────────────────────────────────────────────────────────
export interface MouldFormInput {
  ref: string;
  name?: string | null;
  qty: number;
  status: string;
  notes?: string | null;
}

export function useCreateMould() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MouldFormInput) => apiClient.post<Mould>('/api/moulds', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moulds'] }),
  });
}

export function useUpdateMould() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: MouldFormInput }) =>
      apiClient.patch<Mould>(`/api/moulds/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moulds'] }),
  });
}

// ─── Search & audit ──────────────────────────────────────────────────────────
export interface SearchResult {
  orders: { id: number; orderNumber: string; siteName: string | null; status: string }[];
  tickets: { id: number; tn: number | null; detail: string; status: string; orderId: number; order?: { orderNumber: string } | null }[];
}

export function useSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => apiClient.get<SearchResult>(`/api/search?q=${encodeURIComponent(term)}`),
    enabled: term.length > 0,
  });
}

export interface AuditEntry {
  id: number;
  entityType: string;
  entityId: number;
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  note: string | null;
  at: string;
}

export function useAudit() {
  return useQuery({ queryKey: ['audit'], queryFn: () => apiClient.get<AuditEntry[]>('/api/audit') });
}

export function useCatalogue() {
  return useQuery({ queryKey: ['catalogue'], queryFn: () => apiClient.get<Catalogue[]>('/api/catalogue') });
}

// ─── App settings (stage weightings + manager PIN) ───────────────────────────
export interface AppSettings {
  stageWeights: Record<string, number>;
  managerPin: string;
}

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiClient.get<AppSettings>('/api/settings') });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AppSettings>) => apiClient.put<AppSettings>('/api/settings', input),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
      qc.invalidateQueries({ queryKey: ['schedule'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export interface CataloguePartInput { detail: string; drawing?: string | null; hrs?: number; price?: number; mouldId?: number | null }
export interface CatalogueFormInput {
  productCode: string;
  name: string;
  code?: string | null;
  unitPrice?: number;
  singlePiece?: boolean;
  assemblyHrs?: number;
  gelCureMins?: number | null;
  lamCureMins?: number | null;
  specUrl?: string | null;
  parts?: CataloguePartInput[];
  hardware?: { name: string; qty: number }[];
}

export function useCreateCatalogue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CatalogueFormInput) => apiClient.post<Catalogue>('/api/catalogue', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['catalogue'] }),
  });
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
