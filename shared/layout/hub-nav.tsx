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
      className={cn(
        "flex h-14 items-center justify-between border-b bg-card px-4",
        variant === "sticky" && "sticky top-0 z-50 backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center gap-3">{left}{logo}</div>
      {center && <div className="flex items-center">{center}</div>}
      <div className="flex items-center gap-2">{right}</div>
    </header>
  );
}
