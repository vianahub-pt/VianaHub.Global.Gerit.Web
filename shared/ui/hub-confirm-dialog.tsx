"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { cn } from "@/shared/ui/utils";

export type HubConfirmDialogVariant = "default" | "destructive";

export interface HubConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onConfirmError?: (error: unknown) => void;
  variant?: HubConfirmDialogVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
  testId?: string;
}

const actionFocusClasses =
  "outline-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function HubConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onConfirmError,
  variant = "default",
  loading = false,
  disabled = false,
  icon,
  className,
  testId = "hub-confirm-dialog",
}: HubConfirmDialogProps) {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const confirmLock = React.useRef(false);
  const [callbackPending, setCallbackPending] = React.useState(false);
  const busy = loading || callbackPending;
  const destructiveBusy = variant === "destructive" && busy;

  React.useEffect(() => {
    if (!open) return;

    const keepFocusInside = (event: PointerEvent) => {
      const content = contentRef.current;
      const target = event.target;
      if (!content || !(target instanceof Node) || content.contains(target)) return;

      // AlertDialog retains its own modal focus scope and blocks outside dismissal.
      // Prevent the pointer target from taking focus as a side effect of the click.
      event.preventDefault();
      const activeElement = document.activeElement;
      queueMicrotask(() => {
        if (!content.isConnected || content.contains(document.activeElement)) return;
        const focusTarget = activeElement instanceof HTMLElement && content.contains(activeElement)
          ? activeElement
          : cancelRef.current;
        focusTarget?.focus({ preventScroll: true });
      });
    };

    document.addEventListener("pointerdown", keepFocusInside, true);
    return () => document.removeEventListener("pointerdown", keepFocusInside, true);
  }, [open]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && destructiveBusy) return;
      onOpenChange(nextOpen);
    },
    [destructiveBusy, onOpenChange],
  );

  const handleConfirm = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      // AlertDialogAction normally closes itself. Keep it controlled so the caller
      // can close only after its operation has actually succeeded.
      event.preventDefault();
      if (disabled || busy || confirmLock.current) return;

      confirmLock.current = true;
      let result: void | Promise<void>;
      try {
        result = onConfirm();
      } catch (error) {
        confirmLock.current = false;
        onConfirmError?.(error);
        return;
      }

      if (result && typeof result.then === "function") {
        setCallbackPending(true);
        void Promise.resolve(result).then(
          () => {
            confirmLock.current = false;
            setCallbackPending(false);
          },
          (error: unknown) => {
            confirmLock.current = false;
            setCallbackPending(false);
            onConfirmError?.(error);
          },
        );
      } else {
        confirmLock.current = false;
      }
    },
    [busy, disabled, onConfirm, onConfirmError],
  );

  const handleActionKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target !== cancelRef.current && target !== confirmRef.current) return;

      const nextTarget = event.key === "ArrowRight" ? confirmRef.current : cancelRef.current;
      if (!nextTarget || nextTarget.disabled) return;

      event.preventDefault();
      nextTarget.focus();
    },
    [],
  );

  return (
    <div data-testid={testId + "-root"}>
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent
          ref={contentRef}
          data-testid={testId + "-content"}
          className={className}
          onOpenAutoFocus={(event) => {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement && activeElement !== document.body) {
              returnFocusRef.current = activeElement;
            }
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            const returnFocusTarget = returnFocusRef.current;
            returnFocusRef.current = null;
            if (returnFocusTarget?.isConnected) {
              event.preventDefault();
              returnFocusTarget.focus();
            }
          }}
          onKeyDown={handleActionKeyDown}
          onEscapeKeyDown={(event) => {
            if (destructiveBusy) event.preventDefault();
          }}
        >
          <AlertDialogHeader>
            {icon ? <div aria-hidden="true" className="text-muted-foreground">{icon}</div> : null}
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              ref={cancelRef}
              disabled={destructiveBusy}
              className={cn(actionFocusClasses, "focus-visible:ring-offset-2")}
              onClick={(event) => {
                if (destructiveBusy) event.preventDefault();
              }}
            >
              {cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              ref={confirmRef}
              disabled={disabled || busy}
              aria-busy={busy || undefined}
              className={cn(
                actionFocusClasses,
                variant === "destructive"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "",
              )}
              onClick={handleConfirm}
            >
              {busy ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
