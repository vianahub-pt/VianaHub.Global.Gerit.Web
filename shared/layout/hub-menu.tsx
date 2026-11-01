"use client";

import { useId, useState } from "react";
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
  icon?: React.ComponentType<{ className?: string }>;
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export type HubMenuProps = {
  sections: HubMenuSection[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  hoveredSection?: string;
  onSectionHover?: (sectionKey: string | null) => void;
  /** When true, renders only items without section header/separator (for floating panels) */
  floating?: boolean;
  /** Callback when a section icon is clicked in collapsed mode, passes the section key and the icon's top offset */
  onSectionClick?: (sectionKey: string | null, topOffset?: number) => void;
};

export function HubMenu({ sections, collapsed, onToggleCollapse, hoveredSection, onSectionHover, floating, onSectionClick }: HubMenuProps) {
  const contentIdPrefix = useId();
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
    setExpandedSections((prev) => {
      const isCurrentlyExpanded = prev[sectionKey];
      if (isCurrentlyExpanded) {
        // Se já está aberta, fecha
        return { ...prev, [sectionKey]: false };
      }
      // Se está fechando, fecha todas e abre apenas a clicada
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) {
        next[key] = false;
      }
      next[sectionKey] = true;
      return next;
    });
  };

  const isSectionExpanded = (sectionKey: string) => {
    const section = sections.find((s) => s.key === sectionKey);
    if (!section?.collapsible) return true;
    return expandedSections[sectionKey] ?? section.defaultExpanded ?? true;
  };

  // In collapsed mode, show only section icons with tooltips
  // In expanded mode, show full section with items
  if (collapsed) {
    return (
      <TooltipProvider>
        <nav className="flex-1 overflow-y-auto px-2 py-4" data-testid="hub-menu-root">
          {sections.map((section) => {
            const isHovered = hoveredSection === section.key;
            return (
              <div
                key={section.key}
                className="mb-1"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                        "hover:bg-secondary",
                        isHovered && "bg-secondary"
                      )}
                      aria-label={section.title}
                      onClick={(e) => {
                        const btn = e.currentTarget;
                        const topOffset = btn.offsetTop;
                        if (isHovered) {
                          onSectionClick?.(null);
                        } else {
                          onSectionClick?.(section.key, topOffset);
                        }
                      }}
                    >
                      {section.icon && (
                        <section.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" align="center">
                    {section.title}
                  </TooltipContent>
                </Tooltip>
              </div>
            );
          })}
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <nav className="flex-1 overflow-y-auto px-2 py-4" data-testid="hub-menu-root">
        {sections.map((section) => {
          const expanded = floating ? true : isSectionExpanded(section.key);
          const isCollapsible = section.collapsible === true;
          const contentId = `${contentIdPrefix}-${section.key}`;

          return (
            <SidebarGroup key={section.key} className={cn("mb-2", !expanded && isCollapsible && "mb-1")}>
              {!floating && (isCollapsible ? (
                <SidebarGroupLabel asChild className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                    aria-expanded={expanded}
                    aria-controls={contentId}
                    onClick={() => toggleSection(section.key)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {section.icon && <section.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                      <span className="truncate">{section.title}</span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                        expanded && "rotate-180"
                      )}
                      aria-hidden="true"
                    />
                  </button>
                </SidebarGroupLabel>
              ) : (
                <SidebarGroupLabel className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="flex min-w-0 items-center gap-2">
                    {section.icon && <section.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <span className="truncate">{section.title}</span>
                  </span>
                </SidebarGroupLabel>
              ))}
              <SidebarGroupContent className={cn(
                "transition-all duration-200 ease-in-out",
                !expanded && "h-0 overflow-hidden opacity-0 pb-0",
                expanded && !floating && "bg-accent/30 rounded-md px-2 py-1 -mx-2",
                expanded && floating && "px-2 py-1"
              )} id={contentId}>
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
                              active && "bg-secondary"
                            )}
                          >
                            <Icon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                active && "text-primary",
                              )}
                            />
                            <span className="whitespace-nowrap truncate overflow-hidden">{item.label}</span>
                            {active && (
                              <span className="ml-auto h-4 w-0.5 rounded-full bg-primary" />
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
              {!floating && <SidebarSeparator className="my-2" />}
            </SidebarGroup>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}
