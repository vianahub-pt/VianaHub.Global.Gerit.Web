export const HUB_IMAGE_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const HUB_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;

export type HubImageFileValidation = "valid" | "unsupported-type" | "too-large";

export function validateHubImageFile(file: Pick<File, "type" | "size">): HubImageFileValidation {
  if (!(HUB_IMAGE_ACCEPTED_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
    return "unsupported-type";
  }
  if (file.size <= 0 || file.size > HUB_IMAGE_MAX_SIZE_BYTES) {
    return "too-large";
  }
  return "valid";
}
