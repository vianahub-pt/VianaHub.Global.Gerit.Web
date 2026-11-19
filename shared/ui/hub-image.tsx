"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "@/platform/i18n";
import {
  HUB_IMAGE_ACCEPTED_TYPES,
  validateHubImageFile,
} from "@/shared/ui/hub-image-utils";

export interface HubImageProps {
  urlImage: string;
  onUrlImageChange: (urlImage: string) => void;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  disabled?: boolean;
}

export function HubImage({
  urlImage,
  onUrlImageChange,
  pendingFile,
  onPendingFileChange,
  disabled = false,
}: HubImageProps) {
  const inputId = useId();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const displayedUrl = previewUrl ?? urlImage;

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
    if (!file || disabled) return;
    const result = validateHubImageFile(file);
    if (result !== "valid") {
      onPendingFileChange(null);
      setFileError(t(result === "unsupported-type" ? "hubImage.invalidType" : "hubImage.tooLarge"));
      return;
    }
    onPendingFileChange(file);
  };

  const openFilePicker = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openFilePicker();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    const containsSupportedFile = Array.from(event.dataTransfer.items).some((item) =>
      item.kind === "file" && (HUB_IMAGE_ACCEPTED_TYPES as readonly string[]).includes(item.type.toLowerCase()),
    );
    if (containsSupportedFile) setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragOver(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? "none" : "copy";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragOver(false);
    if (!disabled) chooseFile(event.dataTransfer.files.item(0) ?? undefined);
  };

  const removeImage = () => {
    if (disabled) return;
    if (pendingFile) {
      onPendingFileChange(null);
      setFileError(null);
      setPreviewStatus("idle");
      return;
    }
    onPendingFileChange(null);
    onUrlImageChange("");
    setFileError(null);
    setPreviewStatus("idle");
  };

  return (
    <section data-testid="hub-image" className="space-y-2" aria-labelledby={inputId + "-heading"}>
      <h2 id={inputId + "-heading"} className="text-sm font-semibold text-foreground">{t("hubImage.title")}</h2>
      <div
        data-testid="hub-image-dropzone"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label={t("hubImage.dropZoneLabel")}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex min-h-56 flex-col items-center justify-center gap-2 overflow-hidden rounded-sm border bg-card p-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary"} ${isDragOver ? "border-primary bg-primary/5 ring-2 ring-primary/40" : "border-border"}`}
      >
        <input
          ref={fileInputRef}
          id={inputId + "-file"}
          data-testid="hub-image-file"
          type="file"
          accept={HUB_IMAGE_ACCEPTED_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          disabled={disabled}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => {
            chooseFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        {displayedUrl ? (
          <>
            {previewStatus === "loading" ? <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("hubImage.loading")}</span> : null}
            {/* Local object URLs are kept for preview only and never emitted as form values. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayedUrl}
              alt={t("hubImage.previewAlt")}
              className="max-h-56 w-full object-contain"
              onLoad={() => setPreviewStatus("success")}
              onError={() => setPreviewStatus("error")}
            />
            {previewStatus === "error" ? <span role="status" className="text-sm text-destructive">{t("hubImage.loadError")}</span> : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
            <ImagePlus className="h-8 w-8" aria-hidden="true" />
            <span>{t("hubImage.empty")}</span>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{t("hubImage.dropHint")}</span>
      </div>
      {urlImage || pendingFile ? (
        <button type="button" data-testid="hub-image-remove" onClick={removeImage} disabled={disabled} className="inline-flex h-10 items-center gap-2 rounded-sm border border-destructive/40 bg-card px-4 text-sm font-semibold text-destructive hover:border-destructive disabled:opacity-50">
          <Trash2 className="h-4 w-4" aria-hidden="true" />{t("hubImage.remove")}
        </button>
      ) : null}
      {fileError ? <p role="alert" className="text-sm text-destructive">{fileError}</p> : null}
      {pendingFile ? <p role="status" aria-live="polite" className="text-sm text-amber-700 dark:text-amber-400">{t("hubImage.uploadUnavailable")}</p> : null}
      {!pendingFile && previewStatus === "success" ? <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{t("hubImage.loaded")}</p> : null}
    </section>
  );
}