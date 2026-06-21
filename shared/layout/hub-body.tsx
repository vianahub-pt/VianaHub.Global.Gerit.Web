import type { ReactNode } from "react";

interface HubBodyProps {
  children: ReactNode;
}

/**
 * HubBody — Container central da aplicação.
 *
 * Responsabilidades:
 *  - Renderizar o conteúdo das páginas da aplicação
 *  - Isolar scroll, overflow, largura e altura
 *  - Impedir que uma página quebre ou impacte HubNav e HubMenu
 *
 * Padrões aplicados:
 *  - Usar classes CSS para isolamento visual
 *  - Garantir que o scroll fique isolado no corpo central
 */
export function HubBody({ children }: HubBodyProps) {
  return (
    <div
      id="hub-body"
      role="main"
      data-testid="hub-body"
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background dark:bg-background"
    >
      {children}
    </div>
  );
}
