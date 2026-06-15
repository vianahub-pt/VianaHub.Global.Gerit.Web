"use client";

import { useId } from "react";
import * as React from "react";
import { cn } from "@/shared/ui/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  dataTestId?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, dataTestId, id: propId, ...props }, ref) => {
    const generatedId = useId();
    const id = propId ?? generatedId;
    return (
      <input
        id={id}
        type={type}
        data-testid={dataTestId ?? `input-${generatedId}`}
        className={cn(
          "flex h-12 w-full rounded-[12px] border bg-card px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
