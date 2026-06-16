"use client";

import { useMemo } from "react";
import { useTranslation } from "@/platform/i18n";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Building2,
  Truck,
  HardHat,
  FolderKanban,
  FileText,
  Settings,
  Key,
  Building,
  CreditCard,
  UserCog,
  Shield,
  Database,
  UserRound,
  FileStack,
  Tag,
  GitBranch,
  MapPin,
  Globe,
  Activity,
} from "lucide-react";
import type { HubMenuSection } from "@/shared/layout/hub-menu";

export function useWorkspaceMenuConfig(): HubMenuSection[] {
  const { t } = useTranslation();

  return useMemo<HubMenuSection[]>(
    () => [
      {
        key: "inicio",
        title: t("workspace.sidebar.inicio"),
        items: [
          {
            key: "dashboard",
            label: t("workspace.sidebar.dashboard"),
            href: "/",
            icon: LayoutDashboard,
            matchExact: true,
          },
        ],
      },
      {
        key: "fila",
        title: t("workspace.sidebar.fila"),
        items: [
          {
            key: "visitas",
            label: t("workspace.sidebar.visitas"),
            href: "/operations/visits",
            icon: CalendarDays,
          },
          {
            key: "clientes",
            label: t("workspace.sidebar.clients"),
            href: "/operations/clients",
            icon: Users,
          },
          {
            key: "colaboradores",
            label: t("workspace.sidebar.colaboradores"),
            href: "/operations/collaborators",
            icon: UserRound,
          },
          {
            key: "equipas",
            label: t("workspace.sidebar.equipas"),
            href: "/operations/teams",
            icon: Building2,
            matchExact: true,
          },
          {
            key: "equipamentos",
            label: t("workspace.sidebar.equipamentos"),
            href: "/operations/equipments",
            icon: HardHat,
          },
          {
            key: "veiculos",
            label: t("workspace.sidebar.veiculos"),
            href: "/operations/vehicles",
            icon: Truck,
          },
        ],
      },
      {
        key: "apoio",
        title: t("workspace.sidebar.apoio"),
        items: [
          {
            key: "categoriasAnexos",
            label: t("workspace.sidebar.categoriasAnexos"),
            href: "/catalogs/attachment-categories",
            icon: FolderKanban,
          },
          {
            key: "estados",
            label: t("workspace.sidebar.estados"),
            href: "/catalogs/states",
            icon: FileText,
          },
          {
            key: "tiposFicheiro",
            label: t("workspace.sidebar.tiposFicheiro"),
            href: "/catalogs/file-types",
            icon: FileStack,
          },
          {
            key: "tiposEquipamento",
            label: t("workspace.sidebar.tiposEquipamento"),
            href: "/catalogs/equipment-types",
            icon: HardHat,
          },
          {
            key: "tiposEstado",
            label: t("workspace.sidebar.tiposEstado"),
            href: "/catalogs/state-types",
            icon: Tag,
          },
          {
            key: "tiposMorada",
            label: t("workspace.sidebar.tiposMorada"),
            href: "/catalogs/address-types",
            icon: MapPin,
          },
          {
            key: "tiposOrigem",
            label: t("workspace.sidebar.tiposOrigem"),
            href: "/catalogs/origin-types",
            icon: Globe,
          },
        ],
      },
      {
        key: "identidade",
        title: t("workspace.sidebar.identidade"),
        items: [
          {
            key: "acoes",
            label: t("workspace.sidebar.acoes"),
            href: "/identity/actions",
            icon: Activity,
          },
          {
            key: "recursos",
            label: t("workspace.sidebar.recursos"),
            href: "/identity/resources",
            icon: Database,
          },
          {
            key: "papeis",
            label: t("workspace.sidebar.papeis"),
            href: "/identity/roles",
            icon: UserCog,
          },
          {
            key: "permissoesFuncao",
            label: t("workspace.sidebar.permissoesFuncao"),
            href: "/identity/role-permissions",
            icon: Shield,
          },
          {
            key: "utilizadores",
            label: t("workspace.sidebar.utilizadores"),
            href: "/identity/users",
            icon: Users,
          },
          {
            key: "utilizadorFuncao",
            label: t("workspace.sidebar.utilizadorFuncao"),
            href: "/identity/user-roles",
            icon: UserRound,
          },
        ],
      },
      {
        key: "backoffice",
        title: t("workspace.sidebar.backoffice"),
        items: [
          {
            key: "chavesJwt",
            label: t("workspace.sidebar.chavesJwt"),
            href: "/platform-admin/jwt-keys",
            icon: Key,
          },
          {
            key: "definicoesTrabalho",
            label: t("workspace.sidebar.definicoesTrabalho"),
            href: "/platform-admin/work-definitions",
            icon: Settings,
          },
          {
            key: "inquilinos",
            label: t("workspace.sidebar.inquilinos"),
            href: "/platform-admin/tenants",
            icon: Building,
          },
          {
            key: "planos",
            label: t("workspace.sidebar.planos"),
            href: "/platform-admin/plans",
            icon: CreditCard,
          },
          {
            key: "subscricoes",
            label: t("workspace.sidebar.subscricoes"),
            href: "/platform-admin/subscriptions",
            icon: CreditCard,
          },
        ],
      },
    ],
    [t],
  );
}