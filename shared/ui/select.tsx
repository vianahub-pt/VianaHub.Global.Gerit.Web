"use client";

import { useId } from "react";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/shared/ui/utils";

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { dataTestId?: string }
>(({ className, children, dataTestId, id: propId, ...props }, ref) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      id={id}
      data-testid={dataTestId ?? `select-trigger-${generatedId}`}
      className={cn(
        "flex h-12 w-full items-center justify-between rounded-[12px] border border-border bg-card px-4 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[placeholder]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { dataTestId?: string }
>(({ className, children, position = "popper", dataTestId, id: propId, ...props }, ref) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        id={id}
        data-testid={dataTestId ?? `select-content-${generatedId}`}
        className={cn(
          "relative z-50 max-h-48 min-w-[5rem] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg backdrop-blur-xl",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { dataTestId?: string }
>(({ className, children, dataTestId, id: propId, ...props }, ref) => {
  const generatedId = useId();
  const id = propId ?? generatedId;
  return (
    <SelectPrimitive.Item
      ref={ref}
      id={id}
      data-testid={dataTestId ?? `select-item-${generatedId}`}
      className={cn(
        "relative flex w-full cursor-default select-none items-center rounded-lg px-3 py-1.5 text-xs font-medium outline-none",
        "text-muted-foreground hover:text-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="ml-auto flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-3 w-3" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = SelectPrimitive.Item.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
};
