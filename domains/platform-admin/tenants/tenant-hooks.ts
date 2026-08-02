/**
 * Tenant Hooks
 *
 * Hooks de dados para gestão de Tenants do Platform Admin.
 * Backend: VianaHub.Global.Gerit - API REST para Tenants
 */

"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/platform/auth";
import { useToast } from "@/shared/feedback";

export interface TenantItem {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface TenantListParams {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export function useTenants() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loadTenants = useCallback(
    async (params: TenantListParams = {}): Promise<PaginatedResponse<TenantItem> | null> => {
      setLoading(true);
      try {
        const searchParams = new URLSearchParams();
        const { pageNumber = 1, pageSize = 10, search, sortBy, sortDirection } = params;
        searchParams.set("PageNumber", pageNumber.toString());
        searchParams.set("PageSize", pageSize.toString());
        if (search) searchParams.set("Search", search);
        if (sortBy) searchParams.set("SortBy", sortBy);
        if (sortDirection) searchParams.set("SortDirection", sortDirection);

        const response = await fetchWithAuth("/api/gerit/v1/tenants/paged?" + searchParams.toString());

        if (!response.ok) {
          throw new Error("Erro ao listar tenants");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao listar tenants",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { loadTenants, loading };
}

export function useTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const getTenant = useCallback(
    async (id: number): Promise<TenantItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/tenants/" + id);

        if (!response.ok) {
          throw new Error("Erro ao obter tenant");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao obter tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { getTenant, loading };
}

export function useCreateTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const createTenant = useCallback(
    async (data: Omit<TenantItem, "id" | "createdAt" | "updatedAt">): Promise<TenantItem | null> => {
      setLoading(true);
      try {
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

        toast({
          title: "Tenant criado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao criar tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { createTenant, loading };
}

export function useUpdateTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const updateTenant = useCallback(
    async ({ id, data }: { id: number; data: Partial<TenantItem> }): Promise<TenantItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/tenants/" + id, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error("Erro ao atualizar tenant");
        }

        toast({
          title: "Tenant atualizado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao atualizar tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { updateTenant, loading };
}

export function useActivateTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const activateTenant = useCallback(
    async (id: number): Promise<TenantItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/tenants/" + id + "/activate", {
          method: "PATCH",
        });

        if (!response.ok) {
          throw new Error("Erro ao ativar tenant");
        }

        toast({
          title: "Tenant ativado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao ativar tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { activateTenant, loading };
}

export function useDeactivateTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deactivateTenant = useCallback(
    async (id: number): Promise<TenantItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/tenants/" + id + "/deactivate", {
          method: "PATCH",
        });

        if (!response.ok) {
          throw new Error("Erro ao desativar tenant");
        }

        toast({
          title: "Tenant desativado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao desativar tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { deactivateTenant, loading };
}

export function useDeleteTenant() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deleteTenant = useCallback(
    async (id: number): Promise<boolean> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/tenants/" + id, {
          method: "DELETE",
        });

        if (!response.ok) {
          throw new Error("Erro ao excluir tenant");
        }

        toast({
          title: "Tenant excluído com sucesso",
          variant: "default",
        });

        return true;
      } catch (error) {
        toast({
          title: "Erro ao excluir tenant",
          description: error instanceof Error ? error.message : "Erro desconhecido",
          variant: "destructive",
        });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchWithAuth, toast]
  );

  return { deleteTenant, loading };
}
