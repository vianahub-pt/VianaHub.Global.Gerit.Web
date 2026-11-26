"use client";

import {
  HubConfirmDialog,
  type HubConfirmDialogProps,
} from "@/shared/ui/hub-confirm-dialog";

export interface ConfirmDialogProps extends Omit<HubConfirmDialogProps, "testId"> {
  testId?: string;
}

/** Backwards-compatible name for existing capability consumers. */
export function ConfirmDialog({ testId = "confirm-dialog", ...props }: ConfirmDialogProps) {
  return (
    <HubConfirmDialog
      {...props}
      testId={testId}
      onConfirm={() => {
        const result = props.onConfirm();
        // Preserve the legacy AlertDialogAction contract for existing consumers.
        props.onOpenChange(false);
        return result;
      }}
    />
  );
}
