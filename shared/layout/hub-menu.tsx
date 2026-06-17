"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/platform/i18n";
import { cn } from "@/shared/ui/utils";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

export type HubMenuItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchExact?: boolean;
};

export type HubMenuSection = {
  key: string;
  title: string;
  items: HubMenuItem[];
};

export type HubMenuProps = {
  sections: HubMenuSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
};

export function HubMenu({ sections, collapsed, onToggleCollapse }: HubMenuProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { state } = useSidebar();

  const isActive = (item: HubMenuItem) => {
    if (item.matchExact) return pathname === item.href;
    const cleanPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const cleanHref = item.href.endsWith("/") ? item.href.slice(0, -1) : item.href;
    if (item.href === "/") return cleanPathname === "" || cleanPathname === "/";
    return cleanPathname.startsWith(cleanHref);
  };

  // Use the collapsed prop from parent for UI state, but useSidebar state for tooltip behavior
  const sidebarCollapsed = state === "collapsed";

  return (
    <TooltipProvider>
      <nav className="flex-1 overflow-y-auto px-2 py-4" data-testid="hub-menu-root">
        {sections.map((section) => (
          <div key={section.key} className="mb-4">
            {!collapsed && (
              <SidebarGroupLabel
                className={cn(
                  "px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  "mb-2"
                )}
              >
                {section.title}
              </SidebarGroupLabel>
            )}
            <SidebarMenu>
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      size="default"
                    >
                      <Link
                        href={item.href}
                        className={cn(
                          "flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors hover:bg-secondary",
                          active && "bg-secondary",
                          collapsed && "justify-center"
                        )}
                        aria-label={collapsed ? item.label : undefined}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active && "text-primary",
                          )}
                        />
                        {!collapsed && <span>{item.label}</span>}
                        {active && !collapsed && (
                          <span className="ml-auto h-4 w-0.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            <SidebarSeparator className="my-2" />
          </div>
        ))}
      </nav>
    </TooltipProvider>
  );
}