"use client";

import { useTranslation } from "@/platform/i18n";
import {
  HubConfirmDialog,
  type HubConfirmDialogProps,
} from "@/shared/ui/hub-confirm-dialog";

export interface ConfirmDialogProps extends Omit<HubConfirmDialogProps, "testId" | "cancelLabel" | "confirmLabel"> {
  testId?: string;
  confirmLabel?: HubConfirmDialogProps["confirmLabel"];
  cancelLabel?: HubConfirmDialogProps["cancelLabel"];
}

/** Backwards-compatible name for existing capability consumers. */
export function ConfirmDialog({ testId = "confirm-dialog", ...props }: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <HubConfirmDialog
      {...props}
      testId={testId}
      confirmLabel={props.confirmLabel ?? t("clients.actions.confirm")}
      cancelLabel={props.cancelLabel ?? t("clients.actions.cancel")}
      onConfirm={() => {
        const result = props.onConfirm();
        // Preserve the legacy AlertDialogAction contract for existing consumers.
        props.onOpenChange(false);
        return result;
      }}
    />
  );
}
