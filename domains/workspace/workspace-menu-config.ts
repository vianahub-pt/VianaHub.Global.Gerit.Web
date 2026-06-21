"use client";

import { useMemo } from "react";
import { useTranslation } from "@/platform/i18n";
import {
  LayoutDashboard,
  CalendarDays,
  MapPin,
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
  Globe,
  Activity,
} from "lucide-react";
import type { HubMenuSection } from "@/shared/layout/hub-menu";

export function useWorkspaceMenuConfig(): HubMenuSection[] {
  const { t } = useTranslation();

  return useMemo<HubMenuSection[]>(
    () => [
      {
        key: "operacao",
        title: t("workspace.sidebar.operacao"),
        icon: LayoutDashboard,
        collapsible: true,
        defaultExpanded: true,
        items: [
          {
            key: "dashboard",
            label: t("workspace.sidebar.dashboard"),
            href: "/dashboard",
            icon: LayoutDashboard,
            matchExact: true,
          },
          {
            key: "visitas",
            label: t("workspace.sidebar.visitas"),
            href: "/visitas",
            icon: CalendarDays,
          },
          {
            key: "calendario",
            label: t("workspace.sidebar.calendario"),
            href: "/visitas/calendario",
            icon: CalendarDays,
          },
          {
            key: "roteiros",
            label: t("workspace.sidebar.roteiros"),
            href: "/visitas/roteiros",
            icon: MapPin,
          },
        ],
      },
      {
        key: "clientes",
        title: t("workspace.sidebar.clientes"),
        icon: Users,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "clientes",
            label: t("workspace.sidebar.clientesList"),
            href: "/clients",
            icon: Users,
          },
          {
            key: "novoCliente",
            label: t("workspace.sidebar.novoCliente"),
            href: "/clients/new",
            icon: UserRound,
          },
          {
            key: "tiposCliente",
            label: t("workspace.sidebar.tiposCliente"),
            href: "/configuracoes/tipos-cliente",
            icon: Tag,
          },
          {
            key: "consentimentos",
            label: t("workspace.sidebar.consentimentos"),
            href: "/clientes/consentimentos",
            icon: FileText,
          },
        ],
      },
      {
        key: "equipasRecursos",
        title: t("workspace.sidebar.equipasRecursos"),
        icon: Building2,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "equipas",
            label: t("workspace.sidebar.equipas"),
            href: "/equipas",
            icon: Building2,
          },
          {
            key: "colaboradores",
            label: t("workspace.sidebar.colaboradores"),
            href: "/colaboradores",
            icon: UserRound,
          },
          {
            key: "funcoes",
            label: t("workspace.sidebar.funcoes"),
            href: "/funcoes",
            icon: UserCog,
          },
          {
            key: "equipamentos",
            label: t("workspace.sidebar.equipamentos"),
            href: "/equipamentos",
            icon: HardHat,
          },
          {
            key: "tiposEquipamento",
            label: t("workspace.sidebar.tiposEquipamento"),
            href: "/equipamentos/tipos",
            icon: HardHat,
          },
          {
            key: "veiculos",
            label: t("workspace.sidebar.veiculos"),
            href: "/veiculos",
            icon: Truck,
          },
        ],
      },
      {
        key: "parametrizacao",
        title: t("workspace.sidebar.parametrizacao"),
        icon: Settings,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "tiposMorada",
            label: t("workspace.sidebar.tiposMorada"),
            href: "/configuracoes/tipos-morada",
            icon: MapPin,
          },
          {
            key: "tiposEstado",
            label: t("workspace.sidebar.tiposEstado"),
            href: "/configuracoes/tipos-estado",
            icon: Tag,
          },
          {
            key: "estadosVisita",
            label: t("workspace.sidebar.estadosVisita"),
            href: "/configuracoes/estados",
            icon: FileText,
          },
          {
            key: "tiposConsentimento",
            label: t("workspace.sidebar.tiposConsentimento"),
            href: "/configuracoes/tipos-consentimento",
            icon: FileText,
          },
          {
            key: "tiposFicheiro",
            label: t("workspace.sidebar.tiposFicheiro"),
            href: "/configuracoes/tipos-ficheiro",
            icon: FileStack,
          },
          {
            key: "categoriasAnexo",
            label: t("workspace.sidebar.categoriasAnexo"),
            href: "/configuracoes/categorias-anexo",
            icon: FolderKanban,
          },
          {
            key: "origens",
            label: t("workspace.sidebar.origens"),
            href: "/configuracoes/origens",
            icon: Globe,
          },
        ],
      },
      {
        key: "administracao",
        title: t("workspace.sidebar.administracao"),
        icon: Shield,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "utilizadores",
            label: t("workspace.sidebar.utilizadores"),
            href: "/admin/utilizadores",
            icon: Users,
          },
          {
            key: "papeis",
            label: t("workspace.sidebar.papeis"),
            href: "/admin/papeis",
            icon: UserCog,
          },
          {
            key: "permissoes",
            label: t("workspace.sidebar.permissoes"),
            href: "/admin/permissoes",
            icon: Shield,
          },
          {
            key: "recursos",
            label: t("workspace.sidebar.recursos"),
            href: "/admin/recursos",
            icon: Database,
          },
          {
            key: "acoes",
            label: t("workspace.sidebar.acoes"),
            href: "/admin/acoes",
            icon: Activity,
          },
          {
            key: "preferenciasUtilizador",
            label: t("workspace.sidebar.preferenciasUtilizador"),
            href: "/admin/preferencias-utilizador",
            icon: Settings,
          },
        ],
      },
      {
        key: "saasBilling",
        title: t("workspace.sidebar.saasBilling"),
        icon: CreditCard,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "tenants",
            label: t("workspace.sidebar.tenants"),
            href: "/admin/tenants",
            icon: Building,
          },
          {
            key: "planos",
            label: t("workspace.sidebar.planos"),
            href: "/admin/planos",
            icon: CreditCard,
          },
          {
            key: "subscricoes",
            label: t("workspace.sidebar.subscricoes"),
            href: "/admin/subscricoes",
            icon: CreditCard,
          },
        ],
      },
      {
        key: "tecnico",
        title: t("workspace.sidebar.tecnico"),
        icon: Activity,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "jobs",
            label: t("workspace.sidebar.jobs"),
            href: "/admin/jobs",
            icon: Activity,
          },
          {
            key: "jwtKeys",
            label: t("workspace.sidebar.jwtKeys"),
            href: "/admin/jwt-keys",
            icon: Key,
          },
          {
            key: "swagger",
            label: t("workspace.sidebar.swagger"),
            href: "/admin/swagger",
            icon: Globe,
          },
          {
            key: "hangfire",
            label: t("workspace.sidebar.hangfire"),
            href: "/admin/hangfire",
            icon: Database,
          },
        ],
      },
    ],
    [t],
  );
}