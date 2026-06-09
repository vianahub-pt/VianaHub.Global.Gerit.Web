import Image from "next/image";
import { cn } from "@/shared/ui/utils";

type GeritLogoVariant = "horizontal" | "wordmark";
type GeritLogoTheme = "light" | "dark";

interface GeritLogoProps {
  variant?: GeritLogoVariant;
  theme?: GeritLogoTheme;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}

const logoSources: Record<GeritLogoVariant, Record<GeritLogoTheme, string>> = {
  horizontal: {
    light: "/logo/gerit-horizontal-light.svg",
    dark: "/logo/gerit-horizontal-dark.svg",
  },
  wordmark: {
    light: "/logo/gerit-wordmark-light.svg",
    dark: "/logo/gerit-wordmark-dark.svg",
  },
};

const logoSizes: Record<GeritLogoVariant, { width: number; height: number }> = {
  horizontal: { width: 640, height: 160 },
  wordmark: { width: 520, height: 120 },
};

export function GeritLogo({
  variant = "horizontal",
  theme = "light",
  alt = "Gerit",
  width,
  height,
  className,
  priority = false,
}: GeritLogoProps) {
  const intrinsicSize = logoSizes[variant];

  return (
    <Image
      src={logoSources[variant][theme]}
      alt={alt}
      width={width ?? intrinsicSize.width}
      height={height ?? intrinsicSize.height}
      priority={priority}
      className={cn("block", className)}
    />
  );
}
