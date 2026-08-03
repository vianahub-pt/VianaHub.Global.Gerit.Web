/**
 * Subscription Hooks
 *
 * Hooks de dados para gestão de Subscriptions do Platform Admin.
 * Backend: VianaHub.Global.Gerit - API REST para Subscriptions
 */

"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/platform/auth";
import { useToast } from "@/shared/feedback";

export interface SubscriptionItem {
  id: number;
  tenantId: number;
  tenantName: string;
  planId: number;
  planName: string;
  status: string;
  startDate: string;
  endDate?: string;
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

export interface SubscriptionListParams {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export function useSubscriptions() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loadSubscriptions = useCallback(
    async (params: SubscriptionListParams = {}): Promise<PaginatedResponse<SubscriptionItem> | null> => {
      setLoading(true);
      try {
        const searchParams = new URLSearchParams();
        const { pageNumber = 1, pageSize = 10, search, sortBy, sortDirection } = params;
        searchParams.set("PageNumber", pageNumber.toString());
        searchParams.set("PageSize", pageSize.toString());
        if (search) searchParams.set("Search", search);
        if (sortBy) searchParams.set("SortBy", sortBy);
        if (sortDirection) searchParams.set("SortDirection", sortDirection);

        const response = await fetchWithAuth("/api/gerit/v1/subscriptions/paged?" + searchParams.toString());

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao listar subscriptions");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao listar subscriptions",
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

  return { loadSubscriptions, loading };
}

export function useSubscription() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const getSubscription = useCallback(
    async (id: number): Promise<SubscriptionItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/subscriptions/" + id);

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao obter subscription");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao obter subscription",
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

  return { getSubscription, loading };
}

export function useCreateSubscription() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const createSubscription = useCallback(
    async (data: Omit<SubscriptionItem, "id" | "createdAt" | "updatedAt">): Promise<SubscriptionItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/subscriptions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao criar subscription");
        }

        toast({
          title: "Subscription criada com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao criar subscription",
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

  return { createSubscription, loading };
}

export function useUpdateSubscription() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const updateSubscription = useCallback(
    async ({ id, data }: { id: number; data: Partial<SubscriptionItem> }): Promise<SubscriptionItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/subscriptions/" + id, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao atualizar subscription");
        }

        toast({
          title: "Subscription atualizada com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao atualizar subscription",
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

  return { updateSubscription, loading };
}

export function useDeleteSubscription() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deleteSubscription = useCallback(
    async (id: number): Promise<boolean> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/subscriptions/" + id, {
          method: "DELETE",
        });

        if (!response) return false;

        if (!response.ok) {
          throw new Error("Erro ao excluir subscription");
        }

        toast({
          title: "Subscription excluída com sucesso",
          variant: "default",
        });

        return true;
      } catch (error) {
        toast({
          title: "Erro ao excluir subscription",
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

  return { deleteSubscription, loading };
}
