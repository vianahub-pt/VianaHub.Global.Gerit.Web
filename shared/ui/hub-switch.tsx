"use client";

import * as React from "react";
import { cn } from "@/shared/ui/utils";
import { useTranslation } from "@/platform/i18n";

export interface HubSwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "checked" | "defaultChecked" | "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  testId?: string;
  label?: React.ReactNode;
  checkedLabel?: React.ReactNode;
  uncheckedLabel?: React.ReactNode;
}

export function HubSwitch({ checked, onCheckedChange, className, testId, disabled, id, label, checkedLabel, uncheckedLabel, ...props }: HubSwitchProps) {
  const generatedId = React.useId();
  const { t } = useTranslation();
  const inputId = id ?? `hub-switch-${generatedId}`;
  const labelId = `hub-switch-label-${generatedId}`;
  const showStateLabel = label !== undefined || checkedLabel !== undefined || uncheckedLabel !== undefined;
  const stateLabel = checked
    ? checkedLabel ?? (showStateLabel ? t("common.yes") : undefined)
    : uncheckedLabel ?? (showStateLabel ? t("common.no") : undefined);

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      {label !== undefined ? <label id={labelId} htmlFor={inputId} className="text-xs font-semibold text-muted-foreground">{label}</label> : null}
      <span className="inline-flex items-center gap-2">
        <span className="relative inline-flex h-7 w-12 shrink-0">
          <input
            {...props}
            id={inputId}
            disabled={disabled}
            type="checkbox"
            role="switch"
            aria-checked={checked}
            {...(label !== undefined ? { "aria-labelledby": labelId } : {})}
            checked={checked}
            data-testid={testId}
            onChange={(event) => onCheckedChange(event.currentTarget.checked)}
            className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
          <span
            aria-hidden="true"
            className={cn("pointer-events-none flex h-7 w-12 items-center rounded-full px-1 transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background", checked ? "bg-primary" : "bg-muted", disabled && "cursor-not-allowed opacity-50", "dark:bg-muted", checked ? "dark:bg-primary" : "dark:bg-muted")}
          >
            <span className={cn("h-5 w-5 rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-5")} />
          </span>
        </span>
        {stateLabel !== undefined ? <span className="text-sm text-foreground">{stateLabel}</span> : null}
      </span>
    </span>
  );
}
