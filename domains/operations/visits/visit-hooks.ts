/**
 * Visit Hooks
 *
 * Hooks de dados para gestão de Visits.
 * Backend: VianaHub.Global.Gerit - API REST para Visits
 */

"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/platform/auth";
import { useToast } from "@/shared/feedback";

export interface VisitItem {
  id: number;
  clientId: number;
  clientName: string;
  visitDate: string;
  status: string;
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

export interface VisitListParams {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export function useVisits() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loadVisits = useCallback(
    async (params: VisitListParams = {}): Promise<PaginatedResponse<VisitItem> | null> => {
      setLoading(true);
      try {
        const searchParams = new URLSearchParams();
        const { pageNumber = 1, pageSize = 10, search, sortBy, sortDirection } = params;
        searchParams.set("PageNumber", pageNumber.toString());
        searchParams.set("PageSize", pageSize.toString());
        if (search) searchParams.set("Search", search);
        if (sortBy) searchParams.set("SortBy", sortBy);
        if (sortDirection) searchParams.set("SortDirection", sortDirection);

        const response = await fetchWithAuth("/api/gerit/v1/visits/paged?" + searchParams.toString());

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao listar visits");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao listar visits",
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

  return { loadVisits, loading };
}

export function useVisit() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const getVisit = useCallback(
    async (id: number): Promise<VisitItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/visits/" + id);

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao obter visit");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao obter visit",
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

  return { getVisit, loading };
}

export function useCreateVisit() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const createVisit = useCallback(
    async (data: Omit<VisitItem, "id" | "createdAt" | "updatedAt">): Promise<VisitItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/visits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao criar visit");
        }

        toast({
          title: "Visit criado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao criar visit",
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

  return { createVisit, loading };
}

export function useUpdateVisit() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const updateVisit = useCallback(
    async ({ id, data }: { id: number; data: Partial<VisitItem> }): Promise<VisitItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/visits/" + id, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao atualizar visit");
        }

        toast({
          title: "Visit atualizado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao atualizar visit",
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

  return { updateVisit, loading };
}

export function useDeleteVisit() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deleteVisit = useCallback(
    async (id: number): Promise<boolean> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/visits/" + id, {
          method: "DELETE",
        });

        if (!response) return false;

        if (!response.ok) {
          throw new Error("Erro ao excluir visit");
        }

        toast({
          title: "Visit excluído com sucesso",
          variant: "default",
        });

        return true;
      } catch (error) {
        toast({
          title: "Erro ao excluir visit",
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

  return { deleteVisit, loading };
}
