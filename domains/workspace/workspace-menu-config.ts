"use client";

import { useMemo } from "react";
import { useTranslation } from "@/platform/i18n";
import {
  LayoutDashboard,
  Clock,
  UserRound,
  Drill,
  Car,
  Users,
  CalendarDays,
  Handshake,
  UserCog,
  User,
  Cog,
} from "lucide-react";
import type { HubMenuSection } from "@/shared/layout/hub-menu";

export function useWorkspaceMenuConfig(): HubMenuSection[] {
  const { t } = useTranslation();

  return useMemo<HubMenuSection[]>(
    () => [
      {
        key: "managing",
        title: t("workspace.sidebar.managing"),
        items: [
          {
            key: "dashboard",
            label: t("workspace.sidebar.dashboard"),
            href: "/",
            icon: LayoutDashboard,
            permission: { resource: "Dashboard", action: "Read" },
          },
          {
            key: "interventions",
            label: t("workspace.sidebar.interventions"),
            href: "/operations",
            icon: Clock,
            matchExact: true,
            permission: { resource: "Interventions", action: "Read" },
          },
          {
            key: "clients",
            label: t("workspace.sidebar.clients"),
            href: "/clients",
            icon: UserRound,
            permission: { resource: "Clients", action: "Read" },
          },
          {
            key: "equipments",
            label: t("workspace.sidebar.equipments"),
            href: "/operations/equipments",
            icon: Drill,
            permission: { resource: "Equipments", action: "Read" },
          },
          {
            key: "vehicles",
            label: t("workspace.sidebar.vehicles"),
            href: "/operations/vehicles",
            icon: Car,
            permission: { resource: "Vehicles", action: "Read" },
          },
          {
            key: "teamMembers",
            label: t("workspace.sidebar.teamMembers"),
            href: "/operations/teamMembers",
            icon: Users,
            matchExact: true,
            permission: { resource: "TeamMembers", action: "Read" },
          },
        ],
      },
      {
        key: "supportingData",
        title: t("workspace.sidebar.supportingData"),
        items: [
          {
            key: "overview",
            label: t("workspace.sidebar.overview"),
            href: "/workspace",
            icon: CalendarDays,
            permission: { resource: "Dashboard", action: "Read" },
          },
          {
            key: "teams",
            label: t("workspace.sidebar.teams"),
            href: "/operations/teams",
            icon: Handshake,
            matchExact: true,
            permission: { resource: "Teams", action: "Read" },
          },
          {
            key: "roles",
            label: t("workspace.sidebar.roles"),
            href: "/operations/roles",
            icon: UserCog,
            permission: { resource: "Roles", action: "Read" },
          },
          {
            key: "users",
            label: t("workspace.sidebar.users"),
            href: "/operations/users",
            icon: User,
            permission: { resource: "Users", action: "Read" },
          },
          {
            key: "settings",
            label: t("workspace.sidebar.settings"),
            href: "/settings/preferences",
            icon: Cog,
          },
        ],
      },
    ],
    [t],
  );
}
