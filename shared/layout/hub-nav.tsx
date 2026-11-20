"use client";

import { type ReactNode } from "react";
import { cn } from "@/shared/ui/utils";

export type HubNavVariant = "sticky" | "static";

export type HubNavProps = {
  logo?: ReactNode;
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  variant?: HubNavVariant;
  className?: string;
};

export function HubNav({
  logo,
  left,
  center,
  right,
  variant = "sticky",
  className,
}: HubNavProps) {
  return (
    <header
      data-testid="hub-nav-root"
      className={cn(
        "flex h-14 items-center justify-between gap-2 border-b bg-card px-2 sm:px-4",
        variant === "sticky" && "sticky top-0 z-50 backdrop-blur",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">{left}{logo}</div>
      {center && <div className="flex items-center">{center}</div>}
      <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div>
    </header>
  );
}
