"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/platform/i18n";
import {
  IMAGE_PICKER_ACCEPTED_TYPES,
  validateImageFile,
} from "@/shared/ui/image-picker-utils";

export interface ImagePickerProps {
  value: string;
  onChange: (value: string) => void;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  disabled?: boolean;
}

export function ImagePicker({
  value,
  onChange,
  pendingFile,
  onPendingFileChange,
  disabled = false,
}: ImagePickerProps) {
  const inputId = useId();
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [fileError, setFileError] = useState<string | null>(null);
  const displayedUrl = previewUrl ?? value;

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      setPreviewStatus("idle");
      return;
    }
    const objectUrl = URL.createObjectURL(pendingFile);
    setPreviewUrl(objectUrl);
    setPreviewStatus("loading");
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingFile]);

  const chooseFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    const result = validateImageFile(file);
    if (result !== "valid") {
      onPendingFileChange(null);
      setFileError(t(result === "unsupported-type" ? "users.image.invalidType" : "users.image.tooLarge"));
      return;
    }
    onPendingFileChange(file);
  };

  const removeImage = () => {
    if (pendingFile) {
      onPendingFileChange(null);
      setFileError(null);
      setPreviewStatus("idle");
      return;
    }
    onPendingFileChange(null);
    onChange("");
    setFileError(null);
    setPreviewStatus("idle");
  };

  return (
    <section className="space-y-4" aria-labelledby={inputId + "-heading"}>
      <h2 id={inputId + "-heading"} className="text-sm font-semibold text-foreground">{t("users.image.title")}</h2>
      <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-sm border border-border bg-card p-3">
        {displayedUrl ? (
          <>
            {previewStatus === "loading" ? <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("users.image.loading")}</span> : null}
            {/* Local object URLs are kept for preview only and never emitted as form values. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayedUrl}
              alt={t("users.image.previewAlt")}
              className="max-h-56 w-full object-contain"
              onLoad={() => setPreviewStatus("success")}
              onError={() => setPreviewStatus("error")}
            />
            {previewStatus === "error" ? <span role="status" className="text-sm text-destructive">{t("users.image.loadError")}</span> : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <ImagePlus className="h-8 w-8" aria-hidden="true" />
            <span>{t("users.image.empty")}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={inputId + "-file"} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-input bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-ring hover:text-primary has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
          {pendingFile ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
          {pendingFile ? t("users.image.selected") : value ? t("users.image.replace") : t("users.image.choose")}
          <input
            id={inputId + "-file"}
            type="file"
            accept={IMAGE_PICKER_ACCEPTED_TYPES.join(",")}
            className="sr-only"
            disabled={disabled}
            onChange={(event) => {
              chooseFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </label>
        {value || pendingFile ? (
          <button type="button" onClick={removeImage} disabled={disabled} className="inline-flex h-10 items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 text-sm font-semibold text-destructive hover:border-destructive disabled:opacity-50">
            <Trash2 className="h-4 w-4" aria-hidden="true" />{t("users.image.remove")}
          </button>
        ) : null}
      </div>
      {fileError ? <p role="alert" className="text-sm text-destructive">{fileError}</p> : null}
      {pendingFile ? <p role="status" aria-live="polite" className="text-sm text-amber-700 dark:text-amber-400">{t("users.image.uploadUnavailable")}</p> : null}
      {!pendingFile && previewStatus === "success" ? <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{t("users.image.loaded")}</p> : null}
    </section>
  );
}
