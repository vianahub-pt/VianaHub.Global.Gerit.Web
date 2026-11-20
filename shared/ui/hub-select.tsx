"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/shared/ui/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

export interface HubSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export type HubSelectVariant = "default" | "compact";

export interface HubSelectProps {
  options: readonly HubSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  label?: ReactNode;
  ariaLabel?: string;
  description?: ReactNode;
  error?: ReactNode;
  variant?: HubSelectVariant;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  testId?: string;
}

export function HubSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  required = false,
  name,
  id,
  label,
  ariaLabel,
  description,
  error,
  variant = "default",
  className,
  triggerClassName,
  contentClassName,
  testId,
}: HubSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `hub-select-${generatedId}`;
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <label id={labelId} htmlFor={controlId} className="text-sm font-medium text-foreground">
          {label}{required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      <Select
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onValueChange={onValueChange}
        disabled={disabled}
        required={required}
        name={name}
      >
        <SelectTrigger
          id={controlId}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          data-testid={testId}
          className={cn(
            variant === "compact" && "h-8 w-full rounded-md px-2 py-1 text-xs",
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}