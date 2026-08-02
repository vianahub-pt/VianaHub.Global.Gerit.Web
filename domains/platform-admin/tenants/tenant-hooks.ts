/**
 * Tenant Hooks
 *
 * Hooks de dados para gestão de Tenants do Platform Admin.
 * Backend: VianaHub.Global.Gerit - API REST para Tenants
 *
 * Referência:
 * - GET /tenants/paged - Listar tenants paginados
 * - GET /tenants/{id} - Obter tenant por ID
 * - POST - Criar tenant
 * - PUT - Atualizar tenant
 * - PATCH /activate|deactivate - Ativar/desativar tenant
 * - DELETE - Excluir tenant
 */

"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/platform/auth";
import { queryKeys } from "@/platform/query";

/**
 * Interface para item de tenant
 */
export interface TenantItem {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Interface para resposta paginada
 */
export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Interface para parâmetros de listagem
 */
export interface TenantListParams {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

/**
 * Hook para listar tenants paginados
 */
export function useTenants(params: TenantListParams = {}) {
  const { fetchWithAuth } = useAuth();
  const { pageNumber = 1, pageSize = 10, search, sortBy, sortDirection } = params;

  return useQuery({
    queryKey: queryKeys.tenants.list({ pageNumber, pageSize, search, sortBy, sortDirection }),
    queryFn: async (): Promise<PaginatedResponse<TenantItem>> => {
      const searchParams = new URLSearchParams();
      searchParams.set("PageNumber", pageNumber.toString());
      searchParams.set("PageSize", pageSize.toString());
      if (search) searchParams.set("Search", search);
      if (sortBy) searchParams.set("SortBy", sortBy);
      if (sortDirection) searchParams.set("SortDirection", sortDirection);

      const response = await fetchWithAuth(`/api/gerit/v1/tenants/paged?${searchParams.toString()}`);

      if (!response.ok) {
        throw new Error("Erro ao listar tenants");
      }

      return response.json();
    },
  });
}

/**
 * Hook para obter tenant por ID
 */
export function useTenant(id: number) {
  const { fetchWithAuth } = useAuth();

  return useQuery({
    queryKey: queryKeys.tenants.detail(id),
    queryFn: async (): Promise<TenantItem> => {
      const response = await fetchWithAuth(`/api/gerit/v1/tenants/${id}`);

      if (!response.ok) {
        throw new Error("Erro ao obter tenant");
      }

      return response.json();
    },
    enabled: !!id,
  });
}

/**
 * Hook para criar tenant
 */
export function useCreateTenant() {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Omit<TenantItem, "id" | "createdAt" | "updatedAt">) => {
      const response = await fetchWithAuth("/api/gerit/v1/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Erro ao criar tenant");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}

/**
 * Hook para atualizar tenant
 */
export function useUpdateTenant() {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TenantItem> }) => {
      const response = await fetchWithAuth(`/api/gerit/v1/tenants/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error("Erro ao atualizar tenant");
      }

      return response.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.detail(id) });
    },
  });
}

/**
 * Hook para ativar tenant
 */
export function useActivateTenant() {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetchWithAuth(`/api/gerit/v1/tenants/${id}/activate`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Erro ao ativar tenant");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}

/**
 * Hook para desativar tenant
 */
export function useDeactivateTenant() {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetchWithAuth(`/api/gerit/v1/tenants/${id}/deactivate`, {
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Erro ao desativar tenant");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}

/**
 * Hook para excluir tenant
 */
export function useDeleteTenant() {
  const { fetchWithAuth } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const response = await fetchWithAuth(`/api/gerit/v1/tenants/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Erro ao excluir tenant");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tenants.all });
    },
  });
}
