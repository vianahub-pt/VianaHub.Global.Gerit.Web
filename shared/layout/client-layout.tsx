"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  CookieBanner,
  Footer,
  Navbar,
  ScrollIndicator,
} from "@/shared/layout";

interface ClientLayoutProps {
  children: React.ReactNode;
}

/**
 * ClientLayout — camada de layout client-side.
 *
 * Responsabilidades:
 *  - Montar a Navbar e o Footer ao redor do conteúdo principal.
 *  - Exibir o ScrollIndicator de progresso de leitura.
 *  - Exibir o CookieBanner de consentimento (LGPD / GDPR).
 *
 * Padrões aplicados:
 *  - `useMemo` para derivar estilos e classes condicionais sem re-computação.
 *  - `useCallback` para handlers estáveis passados como props.
 *  - `useEffect` para leitura do localStorage sem hidratação mismatch.
 */
export function ClientLayout({ children }: ClientLayoutProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const normalizedPathname =
    pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  const isPublicRoute =
    normalizedPathname === "/login" || normalizedPathname === "/terms";
  const isLoginRoute = normalizedPathname === "/login";
  const isImmersiveRoute = !isPublicRoute;
  const locksDocumentScroll = isImmersiveRoute;

  // Evita mismatch de hidratação entre servidor e cliente
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleScroll = useCallback(() => {
    const el = document.documentElement;
    const scrolled = el.scrollTop;
    const total = el.scrollHeight - el.clientHeight;
    setScrollProgress(total > 0 ? Math.round((scrolled / total) * 100) : 0);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (!locksDocumentScroll) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [locksDocumentScroll]);

  // Estilos condicionais do indicador de progresso (CSS Conditional Rule equivalente em JS)
  const indicatorStyle = useMemo<React.CSSProperties>(
    () => ({
      width: `${scrollProgress}%`,
      transition: scrollProgress === 0 ? "none" : "width 0.1s linear",
    }),
    [scrollProgress],
  );

  return (
    <>
      {!isImmersiveRoute && (
        <>
          {/* Indicador de progresso de leitura acessível */}
          <div
            role="progressbar"
            aria-valuenow={scrollProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso de leitura da página"
            className="fixed top-0 left-0 h-1 bg-primary z-[60]"
            style={indicatorStyle}
          />

          {/* Barra de navegação sticky */}
          <Navbar />
        </>
      )}

      {/* Conteúdo principal da página */}
      <main
        id="main-content"
        tabIndex={-1}
        className={
          isImmersiveRoute
            ? `h-[100dvh] overflow-hidden focus:outline-none${
                isLoginRoute ? " bg-[#041017]" : ""
              }`
            : "flex-1 focus:outline-none"
        }
      >
        {children}
      </main>

      {!isImmersiveRoute && (
        <>
          {/* Rodapé */}
          <Footer />

          {/* Componente original de scroll (mantido por compatibilidade) */}
          <ScrollIndicator />
        </>
      )}

      {/* Banner de cookies — renderizado apenas após montagem para evitar SSR mismatch */}
      {mounted && <CookieBanner />}
    </>
  );
}
