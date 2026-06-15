"use client";

import Image from "next/image";
import { useTheme } from "next-themes";

import { useTranslation } from "@/platform/i18n";

export function LoginVisualPanel() {
  const { resolvedTheme } = useTheme();
  const { t } = useTranslation();

  const isLight = resolvedTheme !== "dark";
  const imageSrc = isLight ? "/gerit-login-light.jpg" : "/gerit-login-dark.jpg";

  return (
    <aside
      data-testid="login-visual-panel-root"
      className="relative hidden h-[100dvh] overflow-hidden lg:block"
      aria-hidden="true"
    >
      <Image
        src={imageSrc}
        alt=""
        fill
        loading="eager"
        fetchPriority="high"
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover"
      />

      {!isLight ? (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,12,19,0.18)_0%,rgba(0,12,19,0.28)_45%,rgba(0,9,14,0.74)_88%,rgba(0,7,11,0.92)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-24 bg-[linear-gradient(90deg,transparent_0%,rgba(2,10,14,0.92)_100%)]" />
          <div className="absolute left-[12%] top-[18%] h-44 w-44 rounded-full bg-primary/18 blur-3xl" />
          <div className="absolute bottom-[16%] left-[18%] h-52 w-52 rounded-full bg-primary/14 blur-3xl" />
        </>
      ) : (
        <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background via-background/80 to-transparent" />
      )}

      <div className="absolute bottom-24 left-10 max-w-sm xl:left-14">
        <h2
          className={`mt-4 font-sans text-3xl font-semibold leading-tight xl:text-4xl ${
            isLight ? "text-gray-950" : "text-white"
          }`}
        >
          {t("auth.login.visualPanelTagline")}
        </h2>

        <p
          className={`mt-4 max-w-xs text-sm leading-6 xl:text-base ${
            isLight ? "text-gray-800" : "text-white/72"
          }`}
        >
          {t("auth.login.visualPanelBody")}
        </p>
      </div>
    </aside>
  );
}
