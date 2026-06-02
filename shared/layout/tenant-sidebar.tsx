"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  CalendarRange,
  Car,
  Clock,
  Cog,
  Drill,
  Handshake,
  LayoutDashboard,
  Package,
  User,
  UserCog,
  UserRound,
  Users,
  Users2,
  Wrench,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "@/platform/i18n";

function isActiveRoute(pathname: string, href: string, matchExact?: boolean) {
  if (matchExact) {
    return pathname === href;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TenantSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const { t } = useTranslation();

  const sections = useMemo(
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

  return (
    <nav className="gerit-calendar-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-3 px-1">
      {sections.map((section, sectionIndex) => (
        <div key={section.key} className={clsx(sectionIndex > 0 && "mt-6")}>
          <p className="gerit-sidebar-label px-2 pb-2 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#56717e] dark:text-[#86a4b0]">
            {section.title}
          </p>

          <div className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = isActiveRoute(
                pathname,
                item.href,
                item.matchExact,
              );

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={clsx(
                    "group relative flex h-10 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#f4f7f9] text-[#11191f] dark:bg-[#0f2029] dark:text-white"
                      : "text-[#5f7079] hover:bg-[#f7fafb] hover:text-[#11191f] dark:text-[#9ab2bc] dark:hover:bg-[#0e1d25] dark:hover:text-white",
                  )}
                  aria-current={isActive ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  {isActive ? (
                    <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[#11b7ff]" />
                  ) : null}
                  <Icon
                    className={clsx(
                      "h-4 w-4 shrink-0",
                      isActive
                        ? "text-[#06a8a8] dark:text-[#11b7ff]"
                        : "text-[#7b8f99] dark:text-[#90a5af]",
                    )}
                    aria-hidden="true"
                  />
                  <span className="gerit-sidebar-label break-words whitespace-normal leading-5">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
