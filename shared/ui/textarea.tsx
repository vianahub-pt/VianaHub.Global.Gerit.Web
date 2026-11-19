"use client";

import * as React from "react";
import { cn } from "@/shared/ui/utils";
import { controlClasses } from "@/shared/ui/input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        controlClasses.replace("h-12", "min-h-24").replace("flex ", "block ").replace("py-2", "py-3") + " resize-y",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };