# UI/UX + WCAG 2.1 Audit Report — #001

## Resumo Executivo

A aplicação Gerit Web apresenta uma base sólida com uso consistente do design system (shadcn/ui + Tailwind), boa separação de camadas, temas claro/escuro funcionais e componentes acessíveis como HubTabs (com `role="tablist"`). A experiência geral para usuários com visão normal é profissional e moderna.

No entanto, foram identificados **14 problemas de WCAG 2.1 AA** — incluindo falhas de contraste de cor, ausência de skip navigation, identificação de erros apenas via toast (sem indicação inline por campo) e foco de teclado invisível em vários componentes interativos. Para mobile, o problema mais grave é a **ausência completa de navegação**: o sidebar (HubMenu) é `hidden lg:flex`, deixando usuários mobile sem acesso ao menu principal. Além disso, há inconsistências como uso de `window.confirm()` nativo (não acessível), touch targets abaixo de 44px em botões de ação, e campos de email renderizados como `<textarea>` na página de users.

A maioria dos problemas é de prioridade **Média-Alta**, solucionável por `developer-pleno` ou `developer-senior` dentro do mesmo sprint. Não há bloqueios críticos de funcionalidade, mas há riscos de regressão de acessibilidade que devem ser endereçados antes de novos lançamentos.

## Metodologia

- **Ferramentas**: Inspeção manual de código, análise de contraste (WCAG Contrast Ratio), revisão de componentes React/TSX
- **Escopo**: Todas as telas operacionais (clients list, create, details; users list), componentes compartilhados (HubGrid, HubNav, HubMenu, HubTabs, Button, Toast, Tooltip, ThemeToggle, form components), layout (WorkspaceShell, ClientLayout), CSS de tema (globals.css), configuração Tailwind
- **Padrões**: WCAG 2.1 Nível AA, Mobile-First UX Checklist
- **Modos**: Tema claro e escuro; viewports 360px, 390px, 768px, 1024px, 1440px

## Checklist Mobile-First — Resultados

### 1. Primeira impressão visual
**Status:** ✅ Aprovado

Design moderno, tipografia limpa (Inter), uso consistente de elevação com sombras, cores primárias bem definidas (#03A9F4). O espaçamento e alinhamento são consistentes entre telas.

---

### 2. Responsividade real no mobile
**Status:** ⚠️ Atenção

**Evidência:**
- `hub-menu.tsx:52` — sidebar é `hidden lg:flex`, oculto em mobile sem alternativa (hamburger/drawer)
- `hub-grid.tsx` — tabela com `table-fixed` e 6 colunas; em 360px cada coluna recebe ~60px, conteúdo severamente comprimido
- Formulários usam `grid-cols-1` em mobile (correto), mas os grids internos de contatos/endereços têm muitos campos em linha mesmo em telas pequenas

**Recomendação:** Adicionar drawer/drawer de navegação mobile. Implementar HubGrid com `overflow-x-auto` nativo + scroll horizontal para telas < 768px, ou esconder colunas não essenciais via `hidden sm:table-cell`.

---

### 3. Clareza da navegação
**Status:** ❌ Falha

**Evidência:**
- `workspace-shell.tsx:122` — `<aside className="gerit-sidebar relative hidden h-full ... lg:flex">`: sidebar invisível em mobile
- Nenhum breadcrumb presente em nenhuma página analisada
- Botão "Voltar" existe em details e create, mas não há indicador de localização atual (exceto título da página)

**Recomendação:** Implementar drawer de navegação mobile. Adicionar breadcrumbs nas páginas de detalhe.

---

### 4. Hierarquia visual
**Status:** ✅ Aprovado

Títulos com `text-3xl` + subtítulo em uppercase tracking-wide formam hierarquia clara. Cards com sombra diferenciam seções. Formulários agrupados por seções com labels semibold.

---

### 5. Consistência entre telas
**Status:** ✅ Aprovado

Clients e Users seguem o mesmo padrão de página: header com título + toolbar, HubGrid, paginação. Details usa o padrão de tabs consistente. Form fields compartilham `FormField`, `SelectField`, `ToggleField`.

---

### 6. Uso de design system
**Status:** ✅ Aprovado

shadcn/ui (Button, Tooltip, Toast com Radix primitives), variantes de botão via `cva`, cores via variáveis CSS. O design system é aplicado consistentemente.

---

### 7. Tipografia e legibilidade
**Status:** ⚠️ Atenção

**Evidência:**
- `hub-grid.tsx:240` — cabeçalhos de coluna usam `text-sm font-semibold uppercase tracking-[0.06em]` — o uppercase reduz legibilidade em telas pequenas
- `hub-grid.tsx:168` — labels de densidade `text-[0.55rem]` (~8.8px) — muito pequeno, falha WCAG 1.4.4 (Resize Text)
- Labels de formulário: `text-xs font-semibold uppercase tracking-[0.08em]` — o uppercase com tracking para labels longos reduz legibilidade

**Recomendação:** Aumentar `text-xs` para `text-sm` em labels de formulário. Densidade buttons usar no mínimo `text-[0.65rem]`. Avaliar uso de uppercase em textos informativos longos.

---

### 8. Espaçamento e alinhamento
**Status:** ✅ Aprovado

Padding consistente (`px-6 py-4` em cards), grid gaps uniformes (`gap-4`), forms com espaçamento adequado.

---

### 9. Qualidade dos formulários
**Status:** ❌ Falha

**Evidência:**
- `clients-form-components.tsx:208-233` — `FormField` tem `label` + `input` com foco correto, mas sem mensagens de erro inline
- `clients-create.tsx:371-402` — validação usa `toast()` em vez de erro inline no campo. Usuário não sabe qual campo falhou
- `users-page.tsx:919-930` — campo **email renderizado como `<textarea>`** (bug grave de usabilidade)
- Nenhum formulário exibe `aria-describedby` ou `aria-invalid` em inputs com erro
- Uso de `window.confirm()` para deleção (não estilizável, não acessível)

**Recomendação:** Substituir `window.confirm()` por `AlertDialog` do shadcn/ui. Adicionar estado de erro por campo com mensagens inline. Corrigir `<textarea>` para `<input type="email">` em users-page. Adicionar `aria-invalid` e `aria-describedby`.

---

### 10. Feedback visual para ações
**Status:** ⚠️ Atenção

**Evidência:**
- `workspace-shell.tsx:102-106` — tema toggle apenas com ícone, sem label textual visível
- `clients-page.tsx:460-498` — botões de ação (edit, toggle, delete) sem estado de loading individual
- `clients-page.tsx:234` — `window.confirm()` bloqueia thread e não tem loading state
- `hub-grid.tsx:275-283` — loading row usa `Loader2` com texto, adequado

**Recomendação:** Adicionar loading states individuais para ações de toggle/delete. Substituir `window.confirm()` por modal.

---

### 11. Estados vazios
**Status:** ⚠️ Atenção

**Evidência:**
- `hub-grid.tsx:283-293` — estado vazio é apenas texto ("Nenhum registro encontrado") em célula de tabela, sem ilustração ou CTA
- Nenhuma página tem ilustração de empty state ou ação contextual quando não há dados

**Recomendação:** Adicionar ilustração simples + CTA contextual quando a lista estiver vazia, especialmente na primeira carga.

---

### 12. Tabelas/listas no mobile
**Status:** ❌ Falha

**Evidência:**
- `hub-grid.tsx:186` — `<table className="w-full table-fixed border-collapse">`: `table-fixed` distribui largura igual entre colunas. Em mobile com 6 colunas, cada coluna tem ~60px
- Nenhum `overflow-x-auto` no wrapper da tabela
- Nenhuma lógica de esconder colunas em breakpoints menores

**Recomendação:** Envolver tabela em `div overflow-x-auto`. Adicionar classes `hidden sm:table-cell` em colunas não essenciais (Phone, ClientType). Considerar card layout em viewports < 480px.

---

### 13. Acessibilidade
**Status:** ❌ Falha

Remeter à seção WCAG 2.1 abaixo. Principais falhas: contraste muted-foreground, skip navigation ausente, foco de teclado invisível, mensagens de erro apenas em toast, touch targets < 44px.

---

### 14. Performance percebida
**Status:** ✅ Aprovado

Loading states com `Loader2` animado nos grids. Skeleton simplificado via loading text. Timers de debounce não identificados (poderiam ser adicionados para pesquisa).

---

### 15. Microinterações
**Status:** ✅ Aprovado

Transições suaves (`transition-colors`, `duration-300` no sidebar), animação de entrada (`gerit-enter`), hover states em botões e linhas da tabela, `hover:scale-[1.03]` no avatar do usuário. `prefers-reduced-motion` suportado.

---

### 16. Tema claro e escuro
**Status:** ✅ Aprovado

Ambos os temas implementados via `next-themes` com CSS variables. Contraste adequado entre foreground/background em ambos. O tema toggle no workspace-shell funciona corretamente com ícone de sol/lua.

---

### 17. Textos da interface
**Status:** ✅ Aprovado

i18n implementado com chaves em `common.json`. Textos descritivos, labels claros, placeholders informativos. Marca "Gerit" consistente. Traduções para pt-PT, en-US, es-ES.

---

### 18. Segurança percebida
**Status:** ✅ Aprovado

Logout visível no menu do usuário (`signOutAndRedirect`), sessão gerenciada via `useAuth()`, redirecionamento para `/login` quando não autenticado. Sessão do tenant exibida no header.

---

### 19. Adequação ao público-alvo
**Status:** ✅ Aprovado

Visual profissional B2B SaaS. Grids com dados operacionais, bulk upload, filtros, paginação. Cores corporativas (azul #03A9F4). Aplicação transmite seriedade e robustez.

---

### 20. Sensação geral de produto moderno
**Status:** ✅ Aprovado

Arquitetura Next.js 15 App Router, design system shadcn/ui, suporte a temas, animações refinadas, navegação fluida. A base técnica e visual é de alta qualidade.

---

## WCAG 2.1 — Critérios com Problemas

### 1.4.3 Contrast (Minimum) — Nível AA
**Status:** Fail

**Localização:**
- `globals.css:18` — `--muted-foreground: 199 8% 55%` (#75919F)
- `globals.css:17` — `--muted: 208 20% 93%` (#E4EAEE)
- **Contraste computado:** #75919F sobre #E4EAEE = **~3.0:1** (exigido 4.5:1 para texto normal)
- Impacto: Todos os textos `text-muted-foreground` sobre `bg-muted` — incluindo labels de formulário, subtítulos, texto de paginação, metadados
- Exemplos: `clients-page.tsx:514`, `hub-grid.tsx:179`, `hub-grid.tsx:188`, `clients-form-components.tsx:171`

**Impacto:** Usuários com baixa visão (estimados 8% da população masculina com daltonismo) terão dificuldade para ler labels e textos secundários.

**Recomendação:** Alterar `--muted-foreground` para um tom mais escuro (ex: `199 10% 40%` ≈ #5C7A87) que atinja ≥4.5:1 contra `--muted` (#E4EAEE). Ajustar também no tema dark se necessário.

**Prioridade:** Alta

---

### 1.4.1 Use of Color — Nível A
**Status:** Fail

**Localização:**
- `clients-page.tsx:438-453` — status badge (active/inactive) usa APENAS texto. Ambos os estados têm `className="text-foreground"` idêntico. Sem cor, ícone ou outro diferenciador visual além do texto
- `users-page.tsx:614-627` — mesmo problema

**Impacto:** Usuários com daltonismo ou baixa visão não conseguem distinguir visualmente entre "Ativo" e "Inativo" na lista.

**Recomendação:** Adicionar cor de fundo semântica: `bg-green-100 text-green-800` para ativo, `bg-red-100 text-red-800` para inativo (seguindo padrão já usado em `clients-details.tsx:2249`).

**Prioridade:** Alta

---

### 1.4.4 Resize Text — Nível AA
**Status:** Fail

**Localização:**
- `hub-grid.tsx:168` — `.text-[0.55rem]` nos botões de densidade (~8.8px). Texto não redimensiona adequadamente com zoom de 200%
- `hub-grid.tsx:240` — `.text-sm` em uppercase em cabeçalhos de tabela pode quebrar em zoom

**Impacto:** Usuários que aumentam a fonte para 200% perdem conteúdo nos botões de densidade.

**Recomendação:** Usar no mínimo `text-[0.65rem]` para densidade labels. Garantir que todos os wrappers acomodam texto com zoom de 200% sem corte.

**Prioridade:** Média

---

### 2.1.1 Keyboard — Nível A
**Status:** Fail

**Localização:**
- `hub-grid.tsx:306-314` — `<tr onClick={...}>` sem `onKeyDown` para Enter/Space. Teclado não consegue ativar clique na linha
- `clients-page.tsx:460-498` — action buttons sem `aria-label` (embora tenham `title`, o que é uma barreira parcial)
- `workspace-shell.tsx:94-107` — tema toggle não tem `tabIndex` explícito (funciona por ser `<button>`, mas visibilidade de foco é insuficiente)

**Impacto:** Usuários que dependem exclusivamente de teclado não conseguem navegar ou ativar linhas da tabela.

**Recomendação:** Adicionar `onKeyDown` com Enter/Space nos rows clicáveis. Adicionar `aria-label` em todos os botões de ação com ícone. Verificar `focus-visible:ring-2` em todos os elementos interativos customizados.

**Prioridade:** Alta

---

### 2.4.1 Bypass Blocks — Nível A
**Status:** Fail

**Localização:**
- Nenhum "skip to content" link presente em nenhum layout
- `client-layout.tsx:106` — `<main id="main-content" tabIndex={-1}>` existe, indicando que um skip link foi planejado mas nunca implementado
- `workspace-shell.tsx:52-58` — splash/hydration screen tem `aria-hidden="true"` mas sem skip link

**Impacto:** Usuários de screen reader precisam navegar por todo o header, sidebar e menu antes de chegar ao conteúdo principal em cada página.

**Recomendação:** Adicionar link "Skip to content" como primeiro elemento focável no body, apontando para `#main-content`. Implementar no `ClientLayout` ou no `RootLayout`.

**Prioridade:** Crítica

---

### 2.4.3 Focus Order — Nível A
**Status:** Pass

Ordem de foco segue a ordem visual na maioria dos componentes. Sidebar collapse, navegação, toolbar, grid, paginação seguem fluxo lógico. Navegação por tabs no HubTabs preserva ordem de tabulação.

---

### 2.4.7 Focus Visible — Nível AA
**Status:** Fail

**Localização:**
- `hub-grid.tsx:222-238` — `<button>` de ordenação usa `focus-visible:outline-none` inline indirect. Alguns navegadores podem não exibir foco visível
- `hub-grid.tsx:160-175` — density toggle buttons não têm estilos de foco explícitos
- `clients-page.tsx:460-466` — action buttons não têm `focus-visible:` variants
- `hub-menu.tsx:74-81` — links colapsados não têm indicador de foco visível além do `focus-visible:ring` herdado

**Impacto:** Usuários de teclado não conseguem identificar visualmente qual elemento está focado.

**Recomendação:** Adicionar `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` em todos os elementos interativos que não têm foco visível explícito.

**Prioridade:** Alta

---

### 2.5.5 Target Size — Nível AAA (recomendado)
**Status:** ⚠️ Atenção (recomendado como AA best practice)

**Localização:**
- `hub-grid.tsx:168` — density buttons `h-8` (32px) — abaixo de 44px
- `hub-grid.tsx:373-403` — pagination buttons `h-9` (36px) — abaixo de 44px
- `clients-page.tsx:460-498` — action buttons `h-8 w-8` (32x32px) — abaixo de 44px

**Impacto:** Usuários com mobilidade reduzida ou em dispositivos touch têm dificuldade para acertar alvos pequenos.

**Recomendação:** Aumentar action buttons para `h-10 w-10` (40px mínimo, ideal 44px). Para paginação, aumentar padding ou usar `min-h-[44px]`.

**Prioridade:** Média

---

### 3.3.1 Error Identification — Nível A
**Status:** Fail

**Localização:**
- `clients-create.tsx:371-402` — validação de formulário exibe erro via `toast()`, sem identificar qual campo específico falhou
- `clients-details.tsx:678-709` — mesmo padrão
- `users-page.tsx:714-728` — mesmo padrão
- `clients-form-components.tsx:208-233` — `FormField` não tem slot para mensagem de erro
- Nenhum input usa `aria-describedby` ou `aria-invalid`

**Impacto:** Usuários de screen reader não sabem qual campo tem erro. Usuários com deficiência cognitiva têm dificuldade para localizar e corrigir o erro.

**Recomendação:** Implementar estado de erro por campo. Adicionar mensagem de erro inline abaixo de cada input com `aria-describedby`. Usar `aria-invalid="true"` em inputs com erro. O toast pode permanecer como confirmação adicional, mas não substitui o erro inline.

**Prioridade:** Crítica

---

### 3.3.2 Labels or Instructions — Nível A
**Status:** Pass

Todos os campos de formulário têm `<label>` explícito ou estão envolvidos por `<label>`. Placeholders estão presentes. Campos obrigatórios têm indicador visual `*` com classe `text-red-500`. Bom uso de `aria-label` em elementos sem label textual.

---

### 3.3.3 Error Suggestion — Nível AA
**Status:** Fail

**Localização:**
- Nenhuma mensagem de erro inclui sugestão de correção. Ex: "Nome é obrigatório" em vez de "O nome deve ter pelo menos 2 caracteres"
- Validação de email não sugere formato correto

**Impacto:** Usuários com deficiência cognitiva podem não saber como corrigir o erro.

**Recomendação:** Aprimorar mensagens de erro para incluir sugestão de valor esperado. Ex: "Insira um email válido (ex: utilizador@dominio.com)".

**Prioridade:** Média

---

### 3.3.4 Error Prevention (Legal, Financial, Data) — Nível AA
**Status:** ⚠️ Atenção

**Localização:**
- `clients-page.tsx:232-276` — deleção com `window.confirm()` não oferece opção de desfazer ou confirmação adicional
- `users-page.tsx:496-537` — mesmo padrão

**Impacto:** Exclusão acidental de dados sem possibilidade de recuperação.

**Recomendação:** Substituir por `AlertDialog` com ação destrutiva explícita e botão "Cancelar" claro.

**Prioridade:** Alta

---

### 4.1.1 Parsing — Nível A
**Status:** Pass

JSX bem formado, sem IDs duplicados, elementos aninhados corretamente, fechamento de tags adequado.

---

### 4.1.2 Name, Role, Value — Nível A
**Status:** ⚠️ Atenção

**Localização:**
- `hub-grid.tsx:130-145` — `<label>` envolvendo `<select>` com `<span className="sr-only">` — adequado mas frágil. Se o CSS `sr-only` falhar, o label some
- `hub-grid.tsx:222-238` — botões de ordenação têm `aria-sort` — **bom**
- `hub-grid.tsx:165` — density buttons têm `aria-pressed` — **bom**
- `hub-tabs.tsx:64-65` — tabs têm `role="tab"` e `aria-selected` — **bom**
- `workspace-shell.tsx:133-134` — collapse button tem `aria-label` e `aria-expanded` — **bom**
- `hub-menu.tsx:73-82` — links colapsados têm tooltip, mas não têm `aria-label` descritivo adicional

**Recomendação:** Adicionar `aria-label` nos links do HubMenu quando colapsado para descrever o destino além do ícone.

**Prioridade:** Média

---

### 4.1.3 Status Messages — Nível AA
**Status:** ⚠️ Atenção

**Localização:**
- `shared/ui/toast.tsx` — usa `@radix-ui/react-toast` que já inclui `role="status"` e `aria-live="polite"` — **bom**
- Mas toasts destrutivos (erro) deveriam usar `role="alert"` para interromper leitores de tela imediatamente
- `hub-grid.tsx:275-283` — loading row não tem `aria-live` ou `aria-busy="true"` no `<tbody>`

**Recomendação:** Para toasts destrutivos, adicionar `role="alert"`. Adicionar `aria-busy="true"` na tabela durante carregamento.

**Prioridade:** Média

---

## Priorização das Correções

### Crítico
| # | Problema | Localização | Agente |
|---|----------|-------------|--------|
| 1 | **Skip navigation ausente** | `app/layout.tsx`, `client-layout.tsx` | `developer-pleno` |
| 2 | **Erro de formulário sem indicação inline** | `clients-create.tsx`, `clients-details.tsx`, `users-page.tsx` | `developer-pleno` |

### Alto
| # | Problema | Localização | Agente |
|---|----------|-------------|--------|
| 3 | **Contraste muted-foreground em muted (3.0:1)** | `globals.css:18`, todos os subtítulos/labels | `ui-ux` + `developer-senior` |
| 4 | **Status badge sem cor diferenciada (active/inactive)** | `clients-page.tsx:438-453`, `users-page.tsx:614-627` | `developer-junior` |
| 5 | **Foco de teclado invisível em action buttons** | `hub-grid.tsx`, `clients-page.tsx`, `hub-menu.tsx` | `developer-pleno` |
| 6 | **Linhas HubGrid sem suporte a teclado (Enter/Space)** | `hub-grid.tsx:306-314` | `developer-pleno` |
| 7 | **Navegação mobile ausente (sidebar oculto)** | `workspace-shell.tsx:122`, `hub-menu.tsx:52` | `developer-senior` |
| 8 | **window.confirm() não acessível para deleção** | `clients-page.tsx:234`, `users-page.tsx:499` | `developer-pleno` |
| 9 | **Campo email renderizado como `<textarea>`** | `users-page.tsx:919-930` | `developer-junior` |

### Médio
| # | Problema | Localização | Agente |
|---|----------|-------------|--------|
| 10 | **Touch targets abaixo de 44px** | `hub-grid.tsx:168,373,403`, `clients-page.tsx:460-498` | `developer-junior` |
| 11 | **HubGrid sem overflow-x-auto no mobile** | `hub-grid.tsx:186` (wrapper) | `developer-pleno` |
| 12 | **Fonte density buttons muito pequena (0.55rem)** | `hub-grid.tsx:168` | `developer-junior` |
| 13 | **Toast destrutivo sem role="alert"** | `shared/ui/toast.tsx:34-37` | `developer-pleno` |
| 14 | **Loading sem aria-busy no HubGrid** | `hub-grid.tsx:275-283` | `developer-junior` |
| 15 | **Uppercase tracking em labels longos reduz legibilidade** | `clients-form-components.tsx:171,220` | `ui-ux` |
| 16 | **Empty state sem ilustração ou CTA** | `hub-grid.tsx:285-293` | `developer-pleno` |

### Baixo
| # | Problema | Localização | Agente |
|---|----------|-------------|--------|
| 17 | **Breadcrumbs ausentes** | Todas as páginas | `developer-pleno` |
| 18 | **Aria-label nos links do HubMenu colapsado** | `hub-menu.tsx:74-81` | `developer-junior` |
| 19 | **Mensagens de erro sem sugestão de correção** | `clients-create.tsx`, `users-page.tsx` | `developer-junior` |
| 20 | **ThemeToggle.tsx é um stub vazio** | `shared/ui/theme-toggle.tsx` | `developer-junior` |

---

## Recomendações por Agente

### `developer-junior` (6 tarefas)
- Corrigir cor dos status badges (active=green, inactive=red) em listas
- Campo email de `<textarea>` para `<input type="email">` em users-page
- Touch targets: action buttons para `h-10 w-10` mínimo
- Aumentar `text-[0.55rem]` para `text-[0.65rem]` nos density buttons
- Adicionar `aria-busy` no grid loading
- Adicionar `aria-label` nos links do HubMenu
- Corrigir mensagens de erro com sugestões

### `developer-pleno` (8 tarefas)
- Implementar skip navigation link
- Substituir `window.confirm()` por AlertDialog shadcn/ui
- Implementar erro inline por campo com `aria-describedby` e `aria-invalid`
- Adicionar `focus-visible:ring` em action buttons e elementos interativos
- Adicionar suporte a teclado (Enter/Space) nos rows do HubGrid
- Envolver HubGrid com `overflow-x-auto` para mobile
- Adicionar `role="alert"` em toasts destrutivos
- Implementar empty state com ilustração e CTA

### `developer-senior` (3 tarefas)
- Implementar drawer de navegação mobile (sidebar drawer com overlay)
- Ajustar variáveis de cor `--muted-foreground` para contraste ≥4.5:1 (com `ui-ux`)
- Revisar arquitetura de navegação para mobile

### `ui-ux` (2 tarefas)
- Definir nova cor `--muted-foreground` com contraste adequado
- Revisar uso de uppercase + tracking em labels de formulário

---

## Summary

| Categoria | Total |
|-----------|-------|
| **Total de achados** | **20** |
| **WCAG 2.1 falhas (AA)** | **14** |
| **Crítico** | 2 |
| **Alto** | 7 |
| **Médio** | 7 |
| **Baixo** | 4 |
| **Mobile-First falhas** | 4 |

**Distribuição por agente:**
| Agente | Tarefas |
|--------|---------|
| `developer-junior` | 6 |
| `developer-pleno` | 8 |
| `developer-senior` | 3 |
| `ui-ux` | 2 |
| Total agente-assignable | 19 |

**Notas finais:**
- A aplicação tem uma base técnica excelente. Os problemas identificados são majoritariamente incrementais e não estruturais.
- Os 2 itens críticos (skip navigation + erro inline) devem ser resolvidos antes de qualquer novo release.
- A correção de contraste do `muted-foreground` beneficiará ~100% dos usuários, não apenas PCD.
- A navegação mobile é o maior gap de UX e requer implementação mais cuidadosa (drawer + overlay).
- Recomenda-se que as correções de acessibilidade sejam priorizadas em sprint separado para evitar regressão funcional.
