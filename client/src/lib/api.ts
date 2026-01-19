import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Session, Pool, Campaign, Debtor, Message, SystemLog } from '@shared/schema';

const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetchApi<{
      totalSessions: number;
      activeSessions: number;
      totalCampaigns: number;
      activeCampaigns: number;
      totalDebtors: number;
      messagesSent: number;
    }>('/dashboard/stats'),
    refetchInterval: 5000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetchApi<Session[]>('/sessions'),
    refetchInterval: 3000,
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => fetchApi<Session>(`/sessions/${id}`),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => fetchApi<Session>('/sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<void>(`/sessions/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePools() {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchApi<Pool[]>('/pools'),
  });
}

export function usePool(id: string) {
  return useQuery({
    queryKey: ['pools', id],
    queryFn: () => fetchApi<Pool>(`/pools/${id}`),
    enabled: !!id,
  });
}

export function useCreatePool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (pool: Partial<Pool>) => fetchApi<Pool>('/pools', {
      method: 'POST',
      body: JSON.stringify(pool),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    },
  });
}

export function useUpdatePool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pool> }) =>
      fetchApi<Pool>(`/pools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    },
  });
}

export function useDeletePool() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<void>(`/pools/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    },
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => fetchApi<Campaign[]>('/campaigns'),
    refetchInterval: 5000,
  });
}

export function useCampaign(id: string) {
  return useQuery({
    queryKey: ['campaigns', id],
    queryFn: () => fetchApi<Campaign>(`/campaigns/${id}`),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (campaign: Partial<Campaign>) => fetchApi<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(campaign),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Campaign> }) =>
      fetchApi<Campaign>(`/campaigns/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useStartCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<Campaign>(`/campaigns/${id}/start`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<Campaign>(`/campaigns/${id}/pause`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<void>(`/campaigns/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDebtors(campaignId?: string) {
  return useQuery({
    queryKey: ['debtors', campaignId],
    queryFn: () => fetchApi<Debtor[]>(`/debtors${campaignId ? `?campaignId=${campaignId}` : ''}`),
  });
}

export function useDebtor(id: string) {
  return useQuery({
    queryKey: ['debtors', id],
    queryFn: () => fetchApi<Debtor>(`/debtors/${id}`),
    enabled: !!id,
  });
}

export function useCreateDebtor() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (debtor: Partial<Debtor>) => fetchApi<Debtor>('/debtors', {
      method: 'POST',
      body: JSON.stringify(debtor),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateDebtorsBulk() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (debtors: Partial<Debtor>[]) => fetchApi<Debtor[]>('/debtors/bulk', {
      method: 'POST',
      body: JSON.stringify(debtors),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export const useBulkCreateDebtors = useCreateDebtorsBulk;

export function useUpdateDebtor() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Debtor> }) =>
      fetchApi<Debtor>(`/debtors/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
    },
  });
}

export function useDeleteDebtor() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<void>(`/debtors/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useMessages(campaignId?: string) {
  return useQuery({
    queryKey: ['messages', campaignId],
    queryFn: () => fetchApi<Message[]>(`/messages${campaignId ? `?campaignId=${campaignId}` : ''}`),
  });
}

export function useSystemLogs(limit = 100) {
  return useQuery({
    queryKey: ['logs', limit],
    queryFn: () => fetchApi<SystemLog[]>(`/logs?limit=${limit}`),
    refetchInterval: 5000,
  });
}
