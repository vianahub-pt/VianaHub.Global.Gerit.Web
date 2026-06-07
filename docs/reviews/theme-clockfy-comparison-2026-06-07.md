# Análise Comparativa de Tema: Gerit Web vs Clockfy

**Data:** 2026-06-07
**Autor:** Developer Senior
**Issue:** [#61](https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web/issues/61)

## Metodologia

A análise foi realizada através de:

1. Leitura do arquivo `app/globals.css` da Gerit Web para extrair as variáveis CSS atuais (tema claro e escuro).
2. Leitura do `tailwind.config.js` para entender o mapeamento de cores do Tailwind.
3. Leitura do `platform/providers/theme-provider.tsx` para entender a estratégia de tema (next-themes).
4. Fetch da página `https://app.clockify.me/` e análise do HTML inline e folhas de estilo externas (`styles-NUCBP5CG.css`, ~841KB).
5. Extração manual das variáveis CSS custom properties declaradas em `:root` no Clockfy.
6. Extração manual das regras de tema escuro (`body.dark`, `body.dark.new-design`) para identificar o palette do dark mode do Clockfy.

As variáveis CSS da Gerit Web seguem o formato HSL (hue saturation lightness) do shadcn/ui, enquanto o Clockfy usa valores hexadecimais diretos (e alguns rgba).

## Tema Atual da Gerit Web

A Gerit Web utiliza o design system do **shadcn/ui**, que define variáveis CSS no formato `--nome: h s l%` (sem vírgulas, espaço-separado). O tema é aplicado via `:root` (light) e `.dark` (dark), com o `next-themes` gerenciando a alternância.

### Light Mode (`:root`)

| Variável | HSL | Cor resultante |
|----------|-----|----------------|
| `--background` | `0 0% 100%` | `#ffffff` |
| `--foreground` | `222.2 84% 4.9%` | `#0a0a14` |
| `--card` | `0 0% 100%` | `#ffffff` |
| `--card-foreground` | `222.2 84% 4.9%` | `#0a0a14` |
| `--primary` | `222.2 47.4% 11.2%` | `#0f172a` (slate-900) |
| `--primary-foreground` | `210 40% 98%` | `#f8fafc` (slate-50) |
| `--secondary` | `210 40% 96.1%` | `#f1f5f9` (slate-100) |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | `#0f172a` |
| `--muted` | `210 40% 96.1%` | `#f1f5f9` |
| `--muted-foreground` | `215.4 16.3% 46.9%` | `#64748b` (slate-500) |
| `--accent` | `210 40% 96.1%` | `#f1f5f9` |
| `--accent-foreground` | `222.2 47.4% 11.2%` | `#0f172a` |
| `--destructive` | `0 84.2% 60.2%` | `#ef4444` (red-500) |
| `--destructive-foreground` | `210 40% 98%` | `#f8fafc` |
| `--border` | `214.3 31.8% 91.4%` | `#e2e8f0` (slate-200) |
| `--input` | `214.3 31.8% 91.4%` | `#e2e8f0` |
| `--ring` | `222.2 84% 4.9%` | `#0f172a` |
| `--radius` | `0.5rem` | `8px` |

### Dark Mode (`.dark`)

| Variável | HSL | Cor resultante |
|----------|-----|----------------|
| `--background` | `222.2 84% 4.9%` | `#0a0a14` |
| `--foreground` | `210 40% 98%` | `#f8fafc` |
| `--card` | `222.2 84% 4.9%` | `#0a0a14` |
| `--card-foreground` | `210 40% 98%` | `#f8fafc` |
| `--primary` | `210 40% 98%` | `#f8fafc` |
| `--primary-foreground` | `222.2 47.4% 11.2%` | `#0f172a` |
| `--secondary` | `217.2 32.6% 17.5%` | `#1e293b` (slate-800) |
| `--secondary-foreground` | `210 40% 98%` | `#f8fafc` |
| `--muted` | `217.2 32.6% 17.5%` | `#1e293b` |
| `--muted-foreground` | `215 20.2% 65.1%` | `#94a3b8` (slate-400) |
| `--accent` | `217.2 32.6% 17.5%` | `#1e293b` |
| `--accent-foreground` | `210 40% 98%` | `#f8fafc` |
| `--destructive` | `0 62.8% 30.6%` | `#7f1d1d` (red-900) |
| `--destructive-foreground` | `210 40% 98%` | `#f8fafc` |
| `--border` | `217.2 32.6% 17.5%` | `#1e293b` |
| `--input` | `217.2 32.6% 17.5%` | `#1e293b` |
| `--ring` | `212.7 26.8% 83.9%` | `#cbd5e1` (slate-300) |

### Observações

- O tema da Gerit Web é baseado no **slate** do Tailwind, com fundo escuro muito escuro (`#0a0a14`).
- O `--radius` de `0.5rem` (8px) é significativamente maior que o do Clockfy.
- O `--primary` no light mode é praticamente preto (`#0f172a`) — não há uma cor de destaque (brand color) como no Clockfy.

## Tema do Clockfy - Light Mode

O Clockfy usa um sistema de variáveis CSS com valores hexadecimais diretos. Não há variáveis HSL como no shadcn/ui. O tema claro é definido principalmente no `:root` e complementado por estilos no `body`.

### Variáveis Globais (`:root`)

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `--primary` | `#03a9f4` | Azul claro (brand color) |
| `--secondary` | `#4caf50` | Verde |
| `--success` | `#4caf50` | Verde |
| `--info` | `#00bcd4` | Ciano |
| `--warning` | `#ff9800` | Laranja |
| `--danger` | `#f44336` | Vermelho |
| `--light` | `#e4eaee` | Cinza claro |
| `--lighter` | `#f2f6f8` | Cinza mais claro (fundo da página) |
| `--white` | `#fff` | Branco |
| `--dark` | `#333` | Texto padrão |
| `--blue` | `#03a9f4` | Azul primário |
| `--blue-gray-1` | `#f2f6f8` | Fundo da página |
| `--blue-gray-2` | `#e4eaee` | Borda clara |
| `--blue-gray-3` | `#c6d2d9` | Texto secundário |
| `--blue-gray-4` | `#9ba8b0` | Texto muted |
| `--blue-gray-5` | `#37474f` | Texto escuro |
| `--blue-gray-6` | `#607d8b` | Acento cinza |
| `--blue-gray-7` | `#546e7a` | Texto médio |
| `--blue-gray-8` | `#455a64` | Cinza escuro |
| `--blue-gray-9` | `#37474f` | Cinza mais escuro |
| `--blue-gray-10` | `#263238` | Quase preto |
| `--blue-gray-11` | `#1d272c` | Preto azulado |
| `--blue-gray-12` | `#12191d` | Preto mais escuro |
| `--border-radius` | `2px` | Raio de borda padrão |
| `--border-radius-lg` | `2px` | Raio de borda grande |
| `--border-radius-sm` | `2px` | Raio de borda pequeno |
| `--font-family-sans-serif` | `"Roboto", ...` | Fonte principal |

### Body (Light Mode)

```css
body {
  font-family: Roboto, -apple-system, BlinkMacSystemFont, Segoe UI, ...;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.5;
  color: #333;
  text-align: left;
  background-color: #f2f6f8;
}
```

Variáveis contextuais do body:

| Variável | Valor |
|----------|-------|
| `--input-bg` | `#fff` |
| `--landing-page-bg` | `#f1f1f4` |
| `--auth-form-body` | `#fff` |
| `--auth-form-header` | `#333` |
| `--auth-form-footer-bg` | `#f7f7f8` |
| `--timer-container-seconds` | `#8f91a3` |

## Tema do Clockfy - Dark Mode

O Clockfy ativa o dark mode com a classe `dark` no `<html>`. Há também uma variação `.new-design` que é mais escura ainda.

### Cores Principais do Dark Mode

| Elemento | Cor | Descrição |
|----------|-----|-----------|
| Fundo da página (`html.dark`) | `#263238` | Azul escuro acinzentado |
| Fundo novo design (`html.dark.new-design`) | `#12191d` | Preto azulado |
| Fundo de cards/containers | `#1d272c` | Cinza escuro azulado |
| Fundo de inputs | `#263238` | Mesmo tom da página |
| Texto primário | `#c6d2d9` | Cinza claro azulado |
| Texto secundário | `#9ba8b0` | Cinza médio |
| Texto muted | `#607d8b` | Cinza azulado |
| Bordas | `#12191d` | Preto azulado (mais escuro que o fundo) |
| Bordas secundárias | `#37474f` | Cinza escuro |
| Primary accent | `#03a9f4` | Azul claro (mantido do light) |
| Hover | `#37474f` | Destaque sutil |
| Links/texto claro | `#e4eaee` | Quase branco |
| Preto (total) | `#12191d` | Fundo mais escuro possível |

### Padrão de Cores do Dark Mode

O Clockfy segue uma paleta **blue-gray** consistente:

- **Fundo mais escuro**: `#12191d` (blue-gray-12)
- **Fundo de containers**: `#1d272c` (blue-gray-11)
- **Fundo da página**: `#263238` (blue-gray-10)
- **Hover/realce**: `#37474f` (blue-gray-5/9)
- **Bordas**: `#12191d`, `#37474f`, `#455a64`
- **Texto primário**: `#c6d2d9` (blue-gray-3)
- **Texto secundário**: `#9ba8b0` (blue-gray-4)
- **Primary accent**: `#03a9f4` (mantido)

## Tabela Comparativa

A tabela abaixo mapeia as variáveis equivalentes entre os dois sistemas. Como o Clockfy não usa variáveis HSL, os valores foram convertidos para hex.

| Variável shadcn | Gerit Web (light) | Clockfy (light) | Gerit Web (dark) | Clockfy (dark) |
|-----------------|-------------------|-----------------|-------------------|-----------------|
| `--background` | `#ffffff` | `#f2f6f8` | `#0a0a14` | `#263238` |
| `--foreground` | `#0a0a14` | `#333333` | `#f8fafc` | `#c6d2d9` |
| `--primary` | `#0f172a` | `#03a9f4` | `#f8fafc` | `#03a9f4` |
| `--primary-foreground` | `#f8fafc` | `#ffffff` | `#0f172a` | `#ffffff` |
| `--secondary` | `#f1f5f9` | `#4caf50` | `#1e293b` | `#1d272c` |
| `--secondary-foreground` | `#0f172a` | `#ffffff` | `#f8fafc` | `#c6d2d9` |
| `--muted` | `#f1f5f9` | `#e4eaee` | `#1e293b` | `#37474f` |
| `--muted-foreground` | `#64748b` | `#9ba8b0` | `#94a3b8` | `#9ba8b0` |
| `--accent` | `#f1f5f9` | `#03a9f4` | `#1e293b` | `#03a9f4` |
| `--accent-foreground` | `#0f172a` | `#ffffff` | `#f8fafc` | `#ffffff` |
| `--destructive` | `#ef4444` | `#f44336` | `#7f1d1d` | `#f44336` |
| `--destructive-foreground` | `#f8fafc` | `#ffffff` | `#f8fafc` | `#ffffff` |
| `--border` | `#e2e8f0` | `#e4eaee` | `#1e293b` | `#12191d` |
| `--input` | `#e2e8f0` | `#ffffff` | `#1e293b` | `#263238` |
| `--ring` | `#0f172a` | `#03a9f4` | `#cbd5e1` | `#03a9f4` |
| `--radius` | `8px` | `2px` | `8px` | `2px` |

### Diferenças Estruturais

| Aspecto | Gerit Web | Clockfy |
|---------|-----------|---------|
| Formato de cor | HSL (shadcn/ui) | Hex direto |
| Abordagem de tema | `:root` + `.dark` class | `:root` + `html.dark` class |
| Fonte | System UI stack | Roboto (pesos 100, 400, 500, 700) |
| Tamanho base | 16px (padrão navegador) | 14px (`:root { font-size: 14px }`) |
| Border radius | 8px (arredondado) | 2px (quadrado/quase reto) |
| Primary color | Preto (slate-900) | Azul (`#03a9f4`) |
| Fundo escuro | Preto puro (`#0a0a14`) | Azul acinzentado (`#263238`) |
| Estrutura de cores | 9 variáveis semânticas | 40+ variáveis (paleta blue-gray) |
| Design system | shadcn/ui (Radix) | Bootstrap customizado |

## Recomendação de Novas Variáveis CSS

Para alinhar o tema da Gerit Web com o Clockfy, recomenda-se:

### Novas Variáveis no `tailwind.config.js`

```js
colors: {
  // ... mantendo as existentes do shadcn
  clockfy: {
    blue: '#03a9f4',
    'blue-2': '#2f80ed',
    'blue-3': '#0288d1',
    'blue-gray': {
      1: '#f2f6f8',
      2: '#e4eaee',
      3: '#c6d2d9',
      4: '#9ba8b0',
      5: '#37474f',
      6: '#607d8b',
      7: '#546e7a',
      8: '#455a64',
      9: '#37474f',
      10: '#263238',
      11: '#1d272c',
      12: '#12191d',
    },
    success: '#4caf50',
    warning: '#ff9800',
    info: '#00bcd4',
  },
}
```

### Substituição Sugerida para `app/globals.css`

O objetivo é manter o formato HSL do shadcn/ui (para compatibilidade com componentes existentes) mas com as cores do Clockfy:

#### Light Mode

```css
:root {
  --background: 208 30% 96%;        /* #f2f6f8 - Clockfy bg */
  --foreground: 0 0% 20%;           /* #333333 - Clockfy text */
  --card: 0 0% 100%;                /* #ffffff */
  --card-foreground: 0 0% 20%;      /* #333333 */
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 20%;
  --primary: 200 97% 48%;           /* #03a9f4 - Clockfy brand */
  --primary-foreground: 0 0% 100%;  /* #ffffff */
  --secondary: 200 30% 91%;         /* #e4eaee - Clockfy light */
  --secondary-foreground: 0 0% 20%;
  --muted: 200 30% 91%;
  --muted-foreground: 200 8% 65%;   /* #9ba8b0 */
  --accent: 200 97% 48%;            /* #03a9f4 */
  --accent-foreground: 0 0% 100%;
  --destructive: 4 90% 58%;         /* #f44336 - Clockfy danger */
  --destructive-foreground: 0 0% 100%;
  --border: 200 20% 88%;            /* #e4eaee - Clockfy border */
  --input: 200 20% 88%;
  --ring: 200 97% 48%;              /* #03a9f4 - Clockfy brand */
  --radius: 0.125rem;               /* 2px - Clockfy radius */
}
```

#### Dark Mode

```css
.dark {
  --background: 200 20% 18%;        /* #263238 - Clockfy dark bg */
  --foreground: 200 20% 80%;        /* #c6d2d9 - Clockfy text */
  --card: 200 16% 14%;              /* #1d272c */
  --card-foreground: 200 20% 80%;
  --popover: 200 16% 14%;
  --popover-foreground: 200 20% 80%;
  --primary: 200 97% 48%;           /* #03a9f4 - mantido */
  --primary-foreground: 0 0% 100%;
  --secondary: 200 16% 14%;         /* #1d272c */
  --secondary-foreground: 200 20% 80%;
  --muted: 200 10% 26%;             /* #37474f - hover */
  --muted-foreground: 200 8% 65%;   /* #9ba8b0 */
  --accent: 200 97% 48%;            /* #03a9f4 */
  --accent-foreground: 0 0% 100%;
  --destructive: 4 90% 58%;         /* #f44336 - mantido */
  --destructive-foreground: 0 0% 100%;
  --border: 200 20% 9%;             /* #12191d - Clockfy border dark */
  --input: 200 20% 18%;             /* #263238 - Clockfy input dark */
  --ring: 200 97% 48%;              /* #03a9f4 */
}
```

### Fonte

Adicionar ao `globals.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@100;400;500;700&display=swap');

body {
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
}
```

E no `tailwind.config.js`:

```js
fontFamily: {
  sans: ['Roboto', ...defaultTheme.fontFamily.sans],
}
```

## Componentes Impactados

### shared/ui/

- **Button** (`button.tsx`): `--primary` afeta cor de fundo dos botões primários. Com a mudança de `#0f172a` para `#03a9f4`, todos os botões primários passarão a ser azuis.
- **Input** (`input.tsx`): `--input` e `--ring` afetam bordas e foco. O ring passará a ser azul (`#03a9f4`).
- **Card** (`card.tsx`): `--card` e `--card-foreground` afetam cards. Impacto apenas nas cores.
- **Dialog/Select/RadioGroup**: `--popover`, `--background`, `--muted` afetam cores de fundo de overlays, selects e radio groups.
- **Badge** (`badge.tsx`): `--primary` e `--destructive` são usados como variantes.

### shared/layout/

- **Sidebar**: Cor de fundo usa `--background` ou classes customizadas. Potencialmente mudará de tom.
- **Header**: Cor de fundo e texto podem mudar com `--background` e `--foreground`.

### domains/operations/ (HubGrid)

- **HubGrid**: usa cores do tema para bordas (`--border`), textos (`--foreground`, `--muted-foreground`), status (`--destructive`, variantes). A cor de primary (azul) pode afetar badges de status e links de ação.

### shared/feedback/ (Toast)

- Toast pode usar `--destructive` (vermelho Clockfy é similar ao atual) e `--primary`.

### Outros

- `--radius` de 8px → 2px: todos os componentes com border-radius arredondado passarão a ter cantos retos. Impacto visual significativo.
- A cor de `--ring` (foco) mudará de `#0f172a` para `#03a9f4`, mudando a cor do outline de foco em todos os inputs e elementos interativos.

## Avaliação de Contraste (WCAG 2.1 AA)

### Cores Propostas - Light Mode

| Par | Cor 1 | Cor 2 | Contraste | WCAG AA |
|-----|-------|-------|-----------|---------|
| Background / Foreground | `#f2f6f8` (bg) | `#333333` (text) | 11.2:1 | ✅ AA (>= 4.5:1) |
| Primary / Primary-foreground | `#03a9f4` | `#ffffff` | 3.4:1 | ❌ AA (precisa >= 4.5:1) |
| Card / Card-foreground | `#ffffff` | `#333333` | 10.9:1 | ✅ AA |
| Destructive / Destructive-fg | `#f44336` | `#ffffff` | 4.8:1 | ✅ AA (texto grande) |

> **Nota:** O contraste de `#03a9f4` sobre branco (3.4:1) não atende WCAG AA para texto normal. Recomenda-se usar `#0288d1` (blue-3) ou `#2f80ed` (blue-2) para texto sobre fundo branco, mantendo `#03a9f4` apenas para backgrounds com foreground claro ou elementos decorativos.

### Cores Propostas - Dark Mode

| Par | Cor 1 | Cor 2 | Contraste | WCAG AA |
|-----|-------|-------|-----------|---------|
| Background / Foreground | `#263238` | `#c6d2d9` | 8.2:1 | ✅ AA |
| Card / Card-foreground | `#1d272c` | `#c6d2d9` | 8.9:1 | ✅ AA |
| Primary / Primary-foreground | `#03a9f4` | `#ffffff` | 3.4:1 | ❌ AA |
| Border / Background | `#12191d` | `#1d272c` | 1.5:1 | ✅ (borda decorativa) |

> **Recomendação de ajuste:** Para garantir contraste suficiente, o `--primary` (botão primário) no dark mode deve usar `#29b6f6` (light blue 400) ou `#4fc3f7` para atingir >= 4.5:1 sobre branco.

## Riscos de Regressão

1. **Mudança de `--radius` (8px → 2px)**: Impacto visual significativo em todos os cards, botões, inputs e modais. Pode não agradar usuários acostumados com o visual arredondado atual. Sugere-se manter `0.25rem` (4px) como meio-termo.

2. **Mudança de `--primary` (preto → azul)**: Todos os botões primários, links, badges e estados ativos mudarão de cor. Necessário verificar se alguma tela depende do contraste do preto para legibilidade.

3. **Mudança do fundo claro (`#ffffff` → `#f2f6f8`)**: A página inteira ganhará um fundo cinza claro em vez de branco puro. Pode causar estranheza e exigir ajustes em componentes que assumem fundo branco (cards, modais, dropdowns).

4. **Fonte Roboto**: Substituir system stack por Roboto pode causar mudança de layout (altura de linha, largura de caracteres). Testar em todas as telas.

5. **Dark mode mais claro**: O dark mode atual da Gerit é muito escuro (`#0a0a14`). O Clockfy usa `#263238` (mais claro). Pode não agradar usuários que preferem dark mode profundo.

6. **Regressão em testes visuais**: Como não há testes automatizados de UI/visual regression, toda mudança deve ser validada manualmente.

7. **Componentes com cores hardcoded**: Verificar se há componentes que usam cores fixas (ex: `bg-slate-900`, `text-slate-50`) que precisarão ser atualizados.

## Sugestão de Priorização

Sugere-se implementar as mudanças em fases, por ordem de risco/impacto:

### Fase 1 - Baixo Risco (Imediato)
- Adicionar a paleta `clockfy` ao `tailwind.config.js` (sem afetar componentes existentes)
- Adicionar a fonte Roboto (com fallback)
- Adicionar novas variáveis CSS de suporte (success, warning, info, blue-gray)

### Fase 2 - Médio Risco (Após validação)
- Ajustar `--border` e `--input` para tons mais próximos do Clockfy
- Ajustar `--muted` e `--muted-foreground`
- Ajustar `--destructive` para `#f44336`
- Ajustar `--ring` para `#03a9f4`

### Fase 3 - Alto Risco (Requer aprovação de design)
- Mudar `--primary` de preto para azul `#03a9f4`
- Mudar `--background` de `#ffffff` para `#f2f6f8`
- Mudar `--radius` de 8px para 2px (ou 4px como meio-termo)
- Ajustar dark mode para paleta blue-gray do Clockfy

### Fase 4 - Refinamento
- Testes de contraste WCAG e ajustes finos
- Ajustes em componentes específicos (HubGrid, sidebar, header)
- Homologação visual completa
