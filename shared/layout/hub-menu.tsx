"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui/utils";

import { ChevronLeft } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";

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

  const isActive = (item: HubMenuItem) => {
    if (item.matchExact) return pathname === item.href;
    const cleanPathname = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
    const cleanHref = item.href.endsWith("/") ? item.href.slice(0, -1) : item.href;
    if (item.href === "/") return cleanPathname === "" || cleanPathname === "/";
    return cleanPathname.startsWith(cleanHref);
  };

  return (
    <TooltipProvider>
      <aside
        data-testid="hub-menu-root"
        className={cn(
          "relative flex flex-col border-r bg-card transition-all duration-300",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {sections.map((section) => (
            <div key={section.key} className="mb-4">
              {!collapsed && (
                <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item);
                  return (
                    <li key={item.key}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={item.href}
                              aria-label={item.label}
                              className={cn(
                                "flex h-9 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-secondary",
                                active && "bg-secondary text-primary",
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{item.label}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Link
                          href={item.href}
                          className={cn(
                            "flex h-9 items-center gap-3 rounded-md px-2 text-sm font-medium transition-colors hover:bg-secondary",
                            active && "bg-secondary",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              active && "text-primary",
                            )}
                          />
                          <span>{item.label}</span>
                          {active && (
                            <span className="ml-auto h-4 w-0.5 rounded-full bg-primary" />
                          )}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="flex justify-end border-t p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onToggleCollapse}
          >
            <ChevronLeft
              className={cn(
                "h-4 w-4 transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
