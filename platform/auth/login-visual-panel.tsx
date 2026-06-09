"use client";

import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";

export function LoginVisualPanel() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && resolvedTheme === "light";

  const imageSrc = isLight
    ? "/gerit-login-light.png"
    : "/gerit-login-dark.png";

  return (
    <aside className="relative hidden h-[100dvh] overflow-hidden lg:block">
      <Image
        src={imageSrc}
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="object-cover"
      />
      {!isLight && (
        <>
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,12,19,0.18)_0%,rgba(0,12,19,0.28)_45%,rgba(0,9,14,0.74)_88%,rgba(0,7,11,0.92)_100%)]" />
          <div className="absolute inset-y-0 right-0 w-24 bg-[linear-gradient(90deg,transparent_0%,rgba(2,10,14,0.92)_100%)]" />
          <div className="absolute left-[12%] top-[18%] h-44 w-44 rounded-full bg-primary/18 blur-3xl" />
          <div className="absolute bottom-[16%] left-[18%] h-52 w-52 rounded-full bg-primary/14 blur-3xl" />
        </>
      )}

      <div className="absolute bottom-24 left-10 max-w-sm xl:left-14">
        <h2 className={`mt-4 font-[family:var(--font-login)] text-3xl font-semibold leading-tight xl:text-4xl ${
          isLight ? "text-gray-900" : "text-white"
        }`}>
          Operacao, agenda e produtividade numa unica entrada.
        </h2>
        <p className={`mt-4 max-w-xs text-sm leading-6 xl:text-base ${
          isLight ? "text-gray-600" : "text-white/72"
        }`}>
          Aceda ao ecossistema de gestao com uma interface focada em rapidez,
          contexto e continuidade de trabalho.
        </p>
      </div>

      <div className="absolute right-0 top-0 h-full w-px bg-border" />
    </aside>
  );
}
