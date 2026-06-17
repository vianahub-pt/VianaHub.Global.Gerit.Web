"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "@/platform/i18n";
import { cn } from "@/shared/ui/utils";
import { ChevronDown } from "lucide-react";
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
  collapsible?: boolean;
  defaultExpanded?: boolean;
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
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      sections.forEach((section) => {
        if (section.collapsible) {
          initial[section.key] = section.defaultExpanded ?? true;
        }
      });
      return initial;
    }
  );

  const isActive = (item: HubMenuItem) => {
    if (item.matchExact) return pathname === item.href;
    const cleanPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const cleanHref = item.href.endsWith("/") ? item.href.slice(0, -1) : item.href;
    if (item.href === "/") return cleanPathname === "" || cleanPathname === "/";
    return cleanPathname.startsWith(cleanHref);
  };

  // Use the collapsed prop from parent for UI state, but useSidebar state for tooltip behavior
  const sidebarCollapsed = state === "collapsed";

  const toggleSection = (sectionKey: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const isSectionExpanded = (sectionKey: string) => {
    const section = sections.find((s) => s.key === sectionKey);
    if (!section?.collapsible) return true;
    return expandedSections[sectionKey] ?? section.defaultExpanded ?? true;
  };

  return (
    <TooltipProvider>
      <nav className="flex-1 overflow-y-auto px-2 py-4" data-testid="hub-menu-root">
        {sections.map((section) => {
          const expanded = isSectionExpanded(section.key);
          const isCollapsible = section.collapsible === true;

          return (
            <SidebarGroup key={section.key} className="mb-2">
              <SidebarGroupLabel
                className={cn(
                  "px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                  "mb-2",
                  collapsed && "opacity-0 pointer-events-none h-0 mb-0",
                  isCollapsible && "flex items-center justify-between cursor-pointer",
                  isCollapsible && "hover:text-foreground"
                )}
                onClick={isCollapsible ? () => toggleSection(section.key) : undefined}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {section.title}
                  {isCollapsible && (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform duration-200 text-muted-foreground",
                        expanded && "rotate-180"
                      )}
                      aria-hidden="true"
                    />
                  )}
                </span>
              </SidebarGroupLabel>
              <SidebarGroupContent className={cn("transition-all duration-200 ease-in-out", !expanded && "h-0 overflow-hidden opacity-0 pb-0")}>
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
              </SidebarGroupContent>
              <SidebarSeparator className="my-2" />
            </SidebarGroup>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}