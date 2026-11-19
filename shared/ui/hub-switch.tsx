"use client";

import * as React from "react";
import { cn } from "@/shared/ui/utils";

export interface HubSwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "defaultChecked" | "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  testId?: string;
}

export function HubSwitch({ checked, onCheckedChange, className, testId, disabled, ...props }: HubSwitchProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <input
        {...props}
        disabled={disabled}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        data-testid={testId}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={cn("flex h-7 w-12 items-center rounded-full px-1 transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background", checked ? "bg-primary" : "bg-muted", disabled && "cursor-not-allowed opacity-50", "dark:bg-muted", checked ? "dark:bg-primary" : "dark:bg-muted")}
      >
        <span className={cn("h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-5")} />
      </span>
    </span>
  );
}