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
          },
          {
            key: "interventions",
            label: t("workspace.sidebar.interventions"),
            href: "/operations",
            icon: Clock,
            matchExact: true,
          },
          {
            key: "clients",
            label: t("workspace.sidebar.clients"),
            href: "/clients",
            icon: UserRound,
          },
          {
            key: "equipments",
            label: t("workspace.sidebar.equipments"),
            href: "/operations/equipments",
            icon: Drill,
          },
          {
            key: "vehicles",
            label: t("workspace.sidebar.vehicles"),
            href: "/operations/vehicles",
            icon: Car,
          },
          {
            key: "teamMembers",
            label: t("workspace.sidebar.teamMembers"),
            href: "/operations/teamMembers",
            icon: Users,
            matchExact: true,
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
          },
          {
            key: "teams",
            label: t("workspace.sidebar.teams"),
            href: "/operations/teams",
            icon: Handshake,
            matchExact: true,
          },
          {
            key: "roles",
            label: t("workspace.sidebar.roles"),
            href: "/operations/roles",
            icon: UserCog,
          },
          {
            key: "users",
            label: t("workspace.sidebar.users"),
            href: "/operations/users",
            icon: User,
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
