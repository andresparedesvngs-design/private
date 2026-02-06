import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Session,
  Pool,
  GsmLine,
  GsmPool,
  Campaign,
  Debtor,
  Contact,
  Message,
  SystemLog,
} from '@shared/schema';

const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    const message = error?.message || error?.error || 'Request failed';
    const err = new Error(message);
    (err as any).response = { data: error };
    throw err;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export type AuthMe = {
  id: string;
  username: string;
  role: string;
  displayName?: string | null;
  executivePhone?: string | null;
  notifyEnabled?: boolean;
  notifyBatchWindowSec?: number;
  notifyBatchMaxItems?: number;
  permissions?: string[];
};

export type CampaignWindowSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  source?: string;
};

export type CampaignPauseSettings = {
  enabled: boolean;
  strategy: "auto" | "fixed";
  targetPauses: number;
  everyMessages: number;
  minMessages: number;
  durationsMinutes: number[];
  durationsMode?: "list" | "range";
  applyToWhatsapp: boolean;
  applyToSms: boolean;
  source?: string;
};

export type WhatsAppPollingSettings = {
  enabled: boolean;
  intervalMs: number;
  source: "env" | "override";
  connectedSessions: number;
  activePollingSessions: number;
};

export type SessionHealthSnapshot = {
  sessionId: string;
  phoneNumber: string | null;
  status: string;
  verifiedConnected: boolean;
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
  lastActive: string | null;
  messagesSent: number;
};

export type VerifyNowResult = {
  checked: number;
  verified: number;
  failed: number;
  results: Array<{
    sessionId: string;
    phoneNumber: string | null;
    verifiedConnected: boolean;
    error?: string;
  }>;
};

export type WhatsAppVerificationBatch = {
  id: string;
  poolId?: string | null;
  requestedBy?: string | null;
  total: number;
  verified: number;
  failed: number;
  status: "running" | "completed";
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppVerificationResult = {
  id: string;
  batchId: string;
  poolId?: string | null;
  rut?: string | null;
  phone: string;
  whatsapp: boolean;
  waId?: string | null;
  verifiedBy?: string | null;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function useAuthMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
      });

      if (response.status === 401) {
        return null;
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        const message = error?.message || error?.error || 'Request failed';
        const err = new Error(message);
        (err as any).response = { data: error };
        throw err;
      }

      return response.json() as Promise<AuthMe>;
    },
    refetchInterval: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      fetchApi<AuthMe>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      await queryClient.refetchQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<{ success: boolean }>('/auth/logout', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], null);
    },
  });
}

export type AdminUser = {
  id: string;
  username: string;
  role: string;
  active: boolean;
  displayName?: string | null;
  executivePhone?: string | null;
  permissions?: string[];
  notifyEnabled?: boolean;
  notifyBatchWindowSec?: number;
  notifyBatchMaxItems?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ExecutiveOption = {
  id: string;
  username: string;
  displayName?: string | null;
  executivePhone?: string | null;
  active: boolean;
};

export function useUsers(enabled: boolean = true) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => fetchApi<AdminUser[]>("/users"),
    enabled,
  });
}

export function useExecutives(enabled: boolean = true) {
  return useQuery({
    queryKey: ["users", "executives"],
    queryFn: () => fetchApi<ExecutiveOption[]>("/users/executives"),
    enabled,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      username: string;
      password: string;
      role?: "admin" | "supervisor" | "executive";
      active?: boolean;
      displayName?: string | null;
      executivePhone?: string | null;
      permissions?: string[];
      notifyEnabled?: boolean;
      notifyBatchWindowSec?: number;
      notifyBatchMaxItems?: number;
    }) =>
      fetchApi<AdminUser>("/users", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      id: string;
      data: {
        active?: boolean;
        role?: "admin" | "supervisor" | "executive";
        displayName?: string | null;
        executivePhone?: string | null;
      };
    }) =>
      fetchApi<AdminUser>(`/users/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload.data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useResetUserPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; password: string }) =>
      fetchApi<{ success: boolean }>(`/users/${payload.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: payload.password }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { id: string; permissions: string[] }) =>
      fetchApi<AdminUser>(`/users/${payload.id}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: payload.permissions }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      displayName?: string | null;
      executivePhone?: string | null;
      notifyEnabled?: boolean;
      notifyBatchWindowSec?: number;
      notifyBatchMaxItems?: number;
    }) =>
      fetchApi<AuthMe>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
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

export function useSessions(enabled: boolean = true) {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetchApi<Session[]>('/sessions'),
    refetchInterval: 3000,
    enabled,
  });
}

export function useSessionsHealth(enabled: boolean = true) {
  return useQuery({
    queryKey: ['sessions', 'health'],
    queryFn: () => fetchApi<SessionHealthSnapshot[]>('/sessions/health'),
    enabled,
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

export function useReconnectSession() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (id: string) => fetchApi<{ message: string }>(`/sessions/${id}/reconnect`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useResetSessionAuth() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => fetchApi<{ message: string }>(`/sessions/${id}/reset-auth`, {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useEnableSessionQr() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, windowMs }: { id: string; windowMs?: number }) =>
      fetchApi<{ qrCode: string | null; expiresAt: string | null }>(`/sessions/${id}/qr`, {
        method: 'POST',
        body: JSON.stringify(windowMs ? { windowMs } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}

export function useVerifySessionsNow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<VerifyNowResult>('/sessions/verify-now', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions', 'health'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useVerifyDebtorsWhatsApp() {
  return useMutation({
    mutationFn: ({
      poolId,
      debtors,
      batchId,
      complete,
      persist,
    }: {
      poolId: string;
      debtors: Array<{ rut?: string | null; phone: string }>;
      batchId?: string;
      complete?: boolean;
      persist?: boolean;
    }) =>
      fetchApi<{
        batchId: string | null;
        checked: number;
        verified: number;
        failed: number;
        results: Array<{
          rut: string | null;
          phone: string;
          whatsapp: boolean;
          wa_id: string | null;
          verifiedBy: string | null;
          verifiedAt: string;
        }>;
      }>(`/pools/${poolId}/verify-debtors`, {
        method: "POST",
        body: JSON.stringify({
          debtors,
          batchId,
          complete,
          persist,
        }),
      }),
  });
}

export function useWhatsAppVerificationBatches(enabled: boolean = true, limit = 20) {
  return useQuery({
    queryKey: ["whatsapp", "verifications", "batches", limit],
    queryFn: () =>
      fetchApi<WhatsAppVerificationBatch[]>(
        `/whatsapp-verifications/batches?limit=${limit}`
      ),
    enabled,
  });
}

export function useWhatsAppVerificationResults(
  batchId: string | null,
  options?: { limit?: number; skip?: number; enabled?: boolean }
) {
  const limit = options?.limit ?? 0;
  const skip = options?.skip ?? 0;
  const enabled = options?.enabled ?? Boolean(batchId);
  return useQuery({
    queryKey: ["whatsapp", "verifications", batchId, limit, skip],
    queryFn: () =>
      fetchApi<WhatsAppVerificationResult[]>(
        `/whatsapp-verifications/${batchId}?limit=${limit}&skip=${skip}`
      ),
    enabled,
  });
}

export function usePools(enabled: boolean = true) {
  return useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchApi<Pool[]>('/pools'),
    enabled,
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

export function useGsmLines(enabled: boolean = true) {
  return useQuery({
    queryKey: ['gsm-lines'],
    queryFn: () => fetchApi<GsmLine[]>('/gsm-lines'),
    enabled,
  });
}

export function useGsmLine(id: string) {
  return useQuery({
    queryKey: ['gsm-lines', id],
    queryFn: () => fetchApi<GsmLine>(`/gsm-lines/${id}`),
    enabled: !!id,
  });
}

export function useCreateGsmLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (line: Partial<GsmLine>) =>
      fetchApi<GsmLine>('/gsm-lines', {
        method: 'POST',
        body: JSON.stringify(line),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-lines'] });
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
    },
  });
}

export function useUpdateGsmLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GsmLine> }) =>
      fetchApi<GsmLine>(`/gsm-lines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-lines'] });
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
    },
  });
}

export function useDeleteGsmLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<void>(`/gsm-lines/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-lines'] });
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
    },
  });
}

export function useGsmPools(enabled: boolean = true) {
  return useQuery({
    queryKey: ['gsm-pools'],
    queryFn: () => fetchApi<GsmPool[]>('/gsm-pools'),
    enabled,
  });
}

export function useGsmPool(id: string) {
  return useQuery({
    queryKey: ['gsm-pools', id],
    queryFn: () => fetchApi<GsmPool>(`/gsm-pools/${id}`),
    enabled: !!id,
  });
}

export function useCreateGsmPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (pool: Partial<GsmPool>) =>
      fetchApi<GsmPool>('/gsm-pools', {
        method: 'POST',
        body: JSON.stringify(pool),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
    },
  });
}

export function useUpdateGsmPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<GsmPool> }) =>
      fetchApi<GsmPool>(`/gsm-pools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
    },
  });
}

export function useDeleteGsmPool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<void>(`/gsm-pools/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gsm-pools'] });
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

export function useContacts(limit?: number) {
  return useQuery({
    queryKey: ['contacts', limit],
    queryFn: () => fetchApi<Contact[]>(`/contacts${limit ? `?limit=${limit}` : ''}`),
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      fetchApi<Contact>(`/contacts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useCampaignWindowSettings(enabled: boolean = true) {
  return useQuery({
    queryKey: ['settings', 'campaign-window'],
    queryFn: () => fetchApi<CampaignWindowSettings>('/settings/campaign-window'),
    enabled,
  });
}

export function useUpdateCampaignWindowSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<CampaignWindowSettings>) =>
      fetchApi<CampaignWindowSettings>('/settings/campaign-window', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'campaign-window'] });
    },
  });
}

export function useCampaignPauseSettings(enabled: boolean = true) {
  return useQuery({
    queryKey: ['settings', 'campaign-pauses'],
    queryFn: () => fetchApi<CampaignPauseSettings>('/settings/campaign-pauses'),
    enabled,
  });
}

export function useUpdateCampaignPauseSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<CampaignPauseSettings>) =>
      fetchApi<CampaignPauseSettings>('/settings/campaign-pauses', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'campaign-pauses'] });
    },
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

export function useAssignDebtor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ownerUserId }: { id: string; ownerUserId: string }) =>
      fetchApi<Debtor>(`/debtors/${id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ ownerUserId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
    },
  });
}

export function useAssignDebtorsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { debtorIds: string[]; ownerUserId: string }) =>
      fetchApi<{ success: boolean; count: number }>("/debtors/assign-bulk", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
    },
  });
}

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

export function useResetDebtors() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: () => fetchApi<{ success: boolean; count: number }>('/debtors/reset', {
      method: 'POST',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCleanupDebtors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { statuses?: string[]; deleteAll?: boolean }) =>
      fetchApi<{ success: boolean; count: number }>('/debtors/cleanup', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useReleaseDebtors() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (statuses: string[]) =>
      fetchApi<{ success: boolean; count: number }>('/debtors/release', {
        method: 'POST',
        body: JSON.stringify({ statuses }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ sessionId, phone, message }: { sessionId: string; phone: string; message: string }) =>
      fetchApi<{ success: boolean; message: string }>(`/sessions/${sessionId}/send`, {
        method: 'POST',
        body: JSON.stringify({ phone, message }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useMessages(campaignId?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['messages', campaignId],
    queryFn: () => fetchApi<Message[]>(`/messages${campaignId ? `?campaignId=${campaignId}` : ''}`),
    enabled,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ phone, read }: { phone: string; read: boolean }) =>
      fetchApi<{ success: boolean; count: number }>('/messages/conversation/read', {
        method: 'PATCH',
        body: JSON.stringify({ phone, read }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
    },
  });
}

export function useArchiveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ phone, archived }: { phone: string; archived: boolean }) =>
      fetchApi<{ success: boolean; count: number }>('/messages/conversation/archive', {
        method: 'PATCH',
        body: JSON.stringify({ phone, archived }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ phone }: { phone: string }) =>
      fetchApi<{ success: boolean; count: number }>('/messages/conversation/delete', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
    },
  });
}

export function useSystemLogs(limit = 100, enabled: boolean = true) {
  return useQuery({
    queryKey: ['logs', limit],
    queryFn: () => fetchApi<SystemLog[]>(`/logs?limit=${limit}`),
    refetchInterval: 5000,
    enabled,
  });
}

export function useRetryFailedCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchApi<{ success: boolean; count: number }>(`/campaigns/${id}/retry-failed`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['debtors'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useWhatsAppPollingSettings(enabled: boolean = true) {
  return useQuery({
    queryKey: ['settings', 'whatsapp-polling'],
    queryFn: () => fetchApi<WhatsAppPollingSettings>('/settings/whatsapp-polling'),
    refetchInterval: 5000,
    enabled,
  });
}

export function useUpdateWhatsAppPollingSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { enabled: boolean; intervalMs?: number | null }) =>
      fetchApi<WhatsAppPollingSettings>('/settings/whatsapp-polling', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'whatsapp-polling'] });
    },
  });
}
