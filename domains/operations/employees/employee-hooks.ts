/**
 * Employee Hooks
 *
 * Hooks de dados para gestão de Employees.
 * Backend: VianaHub.Global.Gerit - API REST para Employees
 */

"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@/platform/auth";
import { useToast } from "@/shared/feedback";

export interface EmployeeItem {
  id: number;
  name: string;
  email: string;
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

export interface EmployeeListParams {
  pageNumber?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDirection?: "asc" | "desc";
}

export function useEmployees() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const loadEmployees = useCallback(
    async (params: EmployeeListParams = {}): Promise<PaginatedResponse<EmployeeItem> | null> => {
      setLoading(true);
      try {
        const searchParams = new URLSearchParams();
        const { pageNumber = 1, pageSize = 10, search, sortBy, sortDirection } = params;
        searchParams.set("PageNumber", pageNumber.toString());
        searchParams.set("PageSize", pageSize.toString());
        if (search) searchParams.set("Search", search);
        if (sortBy) searchParams.set("SortBy", sortBy);
        if (sortDirection) searchParams.set("SortDirection", sortDirection);

        const response = await fetchWithAuth("/api/gerit/v1/employees/paged?" + searchParams.toString());

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao listar employees");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao listar employees",
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

  return { loadEmployees, loading };
}

export function useEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const getEmployee = useCallback(
    async (id: number): Promise<EmployeeItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees/" + id);

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao obter employee");
        }

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao obter employee",
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

  return { getEmployee, loading };
}

export function useCreateEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const createEmployee = useCallback(
    async (data: Omit<EmployeeItem, "id" | "createdAt" | "updatedAt">): Promise<EmployeeItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao criar employee");
        }

        toast({
          title: "Employee criado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao criar employee",
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

  return { createEmployee, loading };
}

export function useUpdateEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const updateEmployee = useCallback(
    async ({ id, data }: { id: number; data: Partial<EmployeeItem> }): Promise<EmployeeItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees/" + id, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao atualizar employee");
        }

        toast({
          title: "Employee atualizado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao atualizar employee",
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

  return { updateEmployee, loading };
}

export function useActivateEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const activateEmployee = useCallback(
    async (id: number): Promise<EmployeeItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees/" + id + "/activate", {
          method: "PATCH",
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao ativar employee");
        }

        toast({
          title: "Employee ativado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao ativar employee",
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

  return { activateEmployee, loading };
}

export function useDeactivateEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deactivateEmployee = useCallback(
    async (id: number): Promise<EmployeeItem | null> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees/" + id + "/deactivate", {
          method: "PATCH",
        });

        if (!response) return null;

        if (!response.ok) {
          throw new Error("Erro ao desativar employee");
        }

        toast({
          title: "Employee desativado com sucesso",
          variant: "default",
        });

        return await response.json();
      } catch (error) {
        toast({
          title: "Erro ao desativar employee",
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

  return { deactivateEmployee, loading };
}

export function useDeleteEmployee() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const deleteEmployee = useCallback(
    async (id: number): Promise<boolean> => {
      setLoading(true);
      try {
        const response = await fetchWithAuth("/api/gerit/v1/employees/" + id, {
          method: "DELETE",
        });

        if (!response) return false;

        if (!response.ok) {
          throw new Error("Erro ao excluir employee");
        }

        toast({
          title: "Employee excluído com sucesso",
          variant: "default",
        });

        return true;
      } catch (error) {
        toast({
          title: "Erro ao excluir employee",
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

  return { deleteEmployee, loading };
}
