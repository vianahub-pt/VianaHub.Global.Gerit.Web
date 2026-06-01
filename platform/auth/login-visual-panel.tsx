"use client";

import Image from "next/image";
import { GeritLogo } from "@/shared/ui/gerit-logo";

export function LoginVisualPanel() {
  return (
    <aside className="relative hidden h-[100dvh] overflow-hidden lg:block">
      <Image
        src="/login-wallpaper.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="object-cover object-left-top"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,12,19,0.18)_0%,rgba(0,12,19,0.28)_45%,rgba(0,9,14,0.74)_88%,rgba(0,7,11,0.92)_100%)]" />
      <div className="absolute inset-y-0 right-0 w-24 bg-[linear-gradient(90deg,transparent_0%,rgba(2,10,14,0.92)_100%)]" />
      <div className="absolute left-[12%] top-[18%] h-44 w-44 rounded-full bg-[#12d7ff]/18 blur-3xl" />
      <div className="absolute bottom-[16%] left-[18%] h-52 w-52 rounded-full bg-[#ff8d32]/14 blur-3xl" />

      <div className="absolute bottom-24 left-10 max-w-sm xl:left-14">
        <GeritLogo
          variant="horizontal"
          theme="dark"
          alt="Gerit"
          width={142}
          height={36}
          className="h-9 w-auto"
          priority
        />
        <h2 className="mt-4 font-[family:var(--font-login)] text-3xl font-semibold leading-tight text-white xl:text-4xl">
          Operacao, agenda e produtividade numa unica entrada.
        </h2>
        <p className="mt-4 max-w-xs text-sm leading-6 text-white/72 xl:text-base">
          Aceda ao ecossistema de gestao com uma interface focada em rapidez,
          contexto e continuidade de trabalho.
        </p>
      </div>
    </aside>
  );
}
