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
        key: "operations",
        title: t("workspace.sidebar.operations"),
        icon: LayoutDashboard,
        collapsible: true,
        defaultExpanded: true,
        items: [
          {
            key: "dashboard",
            label: t("workspace.sidebar.dashboard"),
            href: "/workspace",
            icon: LayoutDashboard,
            matchExact: true,
          },
          {
            key: "visits",
            label: t("workspace.sidebar.visits"),
            href: "/operations",
            icon: CalendarDays,
          },
          {
            key: "calendar",
            label: t("workspace.sidebar.calendar"),
            href: "/operations/calendar",
            icon: CalendarDays,
          },
          {
            key: "routes",
            label: t("workspace.sidebar.routes"),
            href: "/operations/routes",
            icon: MapPin,
          },
        ],
      },
      {
        key: "clients",
        title: t("workspace.sidebar.clients"),
        icon: Users,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "clientsList",
            label: t("workspace.sidebar.clientsList"),
            href: "/clients",
            icon: Users,
          },
          {
            key: "newClient",
            label: t("workspace.sidebar.newClient"),
            href: "/clients/new",
            icon: UserRound,
          },
        ],
      },
      {
        key: "teamsResources",
        title: t("workspace.sidebar.teamsResources"),
        icon: Building2,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "teams",
            label: t("workspace.sidebar.teams"),
            href: "/operations/teams",
            icon: Building2,
          },
          {
            key: "teamMembers",
            label: t("workspace.sidebar.teamMembers"),
            href: "/operations/teamMembers",
            icon: UserRound,
          },
          {
            key: "functions",
            label: t("workspace.sidebar.functions"),
            href: "/operations/functions",
            icon: UserCog,
          },
          {
            key: "equipments",
            label: t("workspace.sidebar.equipments"),
            href: "/operations/equipments",
            icon: HardHat,
          },
          {
            key: "equipmentTypes",
            label: t("workspace.sidebar.equipmentTypes"),
            href: "/operations/equipment-types",
            icon: HardHat,
          },
          {
            key: "vehicles",
            label: t("workspace.sidebar.vehicles"),
            href: "/operations/vehicles",
            icon: Truck,
          },
        ],
      },
      {
        key: "settings",
        title: t("workspace.sidebar.settings"),
        icon: Settings,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "addressTypes",
            label: t("workspace.sidebar.addressTypes"),
            href: "/settings/address-types",
            icon: MapPin,
          },
          {
            key: "statusTypes",
            label: t("workspace.sidebar.statusTypes"),
            href: "/settings/status-types",
            icon: Tag,
          },
          {
            key: "visitStatus",
            label: t("workspace.sidebar.visitStatus"),
            href: "/settings/visit-status",
            icon: FileText,
          },
          {
            key: "consentTypes",
            label: t("workspace.sidebar.consentTypes"),
            href: "/settings/consent-types",
            icon: FileText,
          },
          {
            key: "fileTypes",
            label: t("workspace.sidebar.fileTypes"),
            href: "/settings/file-types",
            icon: FileStack,
          },
          {
            key: "attachmentCategories",
            label: t("workspace.sidebar.attachmentCategories"),
            href: "/settings/attachment-categories",
            icon: FolderKanban,
          },
          {
            key: "preferences",
            label: t("workspace.sidebar.preferences"),
            href: "/settings/preferences",
            icon: Settings,
          },
        ],
      },
      {
        key: "administration",
        title: t("workspace.sidebar.administration"),
        icon: Shield,
        collapsible: true,
        defaultExpanded: false,
        items: [
          {
            key: "users",
            label: t("workspace.sidebar.users"),
            href: "/operations/users",
            icon: Users,
          },
          {
            key: "roles",
            label: t("workspace.sidebar.roles"),
            href: "/operations/roles",
            icon: UserCog,
          },
          {
            key: "permissions",
            label: t("workspace.sidebar.permissions"),
            href: "/admin/permissions",
            icon: Shield,
          },
          {
            key: "resources",
            label: t("workspace.sidebar.resources"),
            href: "/admin/resources",
            icon: Database,
          },
          {
            key: "actions",
            label: t("workspace.sidebar.actions"),
            href: "/admin/actions",
            icon: Activity,
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
            key: "plans",
            label: t("workspace.sidebar.plans"),
            href: "/admin/plans",
            icon: CreditCard,
          },
          {
            key: "subscriptions",
            label: t("workspace.sidebar.subscriptions"),
            href: "/admin/subscriptions",
            icon: CreditCard,
          },
        ],
      },
      {
        key: "technical",
        title: t("workspace.sidebar.technical"),
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