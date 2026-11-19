"use client";

import * as React from "react";
import { cn } from "@/shared/ui/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const controlClasses = "flex h-12 w-full rounded-[12px] border border-border bg-card px-4 py-2 text-sm font-normal text-foreground shadow-none outline-none transition-colors placeholder:text-muted-foreground hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/55 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted read-only:text-muted-foreground";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn(controlClasses, className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

export { Input };