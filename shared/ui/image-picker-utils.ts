export const IMAGE_PICKER_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IMAGE_PICKER_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export type ImageFileValidation = "valid" | "unsupported-type" | "too-large";

export function validateImageFile(file: Pick<File, "type" | "size">): ImageFileValidation {
  if (!(IMAGE_PICKER_ACCEPTED_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    return "unsupported-type";
  }
  if (file.size <= 0 || file.size > IMAGE_PICKER_MAX_SIZE_BYTES) {
    return "too-large";
  }
  return "valid";
}
