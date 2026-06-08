# Análise Detalhada: Tema Clockfy (Rota /clients) vs Gerit Web

**Data:** 2026-06-07
**Autor:** Developer Senior
**Issue:** [#61](https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web/issues/61)
**Relatório complementar a:** `theme-clockfy-comparison-2026-06-07.md`

---

## Sumário Executivo

Esta análise complementar identifica o **design system completo do Clockfy** através da extração do arquivo CSS principal (`styles-NUCBP5CG.css`, ~841KB). O Clockfy utiliza um sistema de design maduro com variáveis CSS para **todos os componentes UI**, não apenas as variáveis globais de tema. Esta descoberta é crucial para uma implementação fiel.

---

## 1. Descoberta: Design System Completo do Clockfy

### 1.1 Estrutura de Variáveis do Tema

O Clockfy possui **três camadas de variáveis**:

| Camada | Propósito | Exemplo |
|--------|-----------|---------|
| `:root` | Escala de rem e variáveis legadas | `--ui-lib-rem-scale: 1` |
| `.ui-theme__light` / `.ui-theme__dark` | Variáveis globais de tema | `--ui-global-background-color` |
| `body.new-design` | Border-radius do novo design | `--border-radius: 8px` |

### 1.2 Variáveis Globais de Tema (UI Library)

```css
/* LIGHT MODE */
.ui-theme__light {
  --ui-global-background-color: #F2F6F8;
  --ui-global-text-color: #0A0E10;
  --ui-global-focus-outline: #0015AF;
}

/* DARK MODE */
.ui-theme__dark {
  --ui-global-background-color: #0A0E10;
  --ui-global-text-color: #F2F6F8;
  --ui-global-focus-outline: #B3BBFF;
}
```

> **Nota:** O fundo escuro do Clockfy (`#0A0E10`) é **quase idêntico** ao da Gerit Web (`#0a0a14`). A diferença é de apenas 4 valores em vermelho.

---

## 2. Sistema de Elevação (Elevation System)

O Clockfy possui um sistema de elevação com **5 níveis**, cada um com background e border:

### Light Mode

| Nível | Background | Border | Uso esperado |
|-------|------------|--------|--------------|
| `sunken` | `#F2F6F8` | `#E4EDF1` | Fundo retraído |
| `default` | `#F8FAFB` | `#E4EDF1` | Cards padrão |
| `raised` | `#FFF` | `#E4EDF1` | Cards elevados |
| `overlay` | `#FFF` | `#B4C6D0` | Dropdowns, popovers |
| `prominent` | `#03A9F4` | `transparent` | Botões primários |
| `prominent-sunken` | `#026897` | `transparent` | Botões primários pressionados |

### Dark Mode

| Nível | Background | Border | Uso esperado |
|-------|------------|--------|--------------|
| `sunken` | `#12191D` | `#12191D` | Fundo retraído |
| `default` | `#1D272B` | `#12191D` | Cards padrão |
| `raised` | `#253238` | `#12191D` | Cards elevados |
| `overlay` | `#324148` | `#37474F` | Dropdowns, popovers |
| `prominent` | `#03A9F4` | `transparent` | Botões primários |
| `prominent-sunken` | `#026897` | `transparent` | Botões primários pressionados |

> **Impacto na Gerit Web:** A Gerit Web não possui sistema de elevação. Os componentes usam apenas `--card`, `--popover`, `--background`. Recomenda-se adicionar variáveis de elevação ao `tailwind.config.js`.

---

## 3. Sistema de Botões

O Clockfy define **7 variantes de botão** com estados completos (default, hover, active):

### Botões Light Mode

| Variante | Background | Border | Color | Font Weight |
|----------|------------|--------|-------|-------------|
| `primary` | `#DEF4FF` | `#BDEAFE` | `#026897` | 600 |
| `cta` | `#027DB6` | `transparent` | `#FFF` | 600 |
| `secondary` | `#F8FAFB` | `#D7E2EA` | `var(--ui-global-text-color)` | - |
| `tertiary` | `transparent` | `transparent` | `var(--ui-global-text-color)` | - |
| `destructive` | `#BC3232` | `#BC3232` | `#FFF` | - |
| `destructive-outline` | `transparent` | `#BC3232` | `#BC3232` | - |
| `destructive-text` | `transparent` | `transparent` | `#BC3232` | - |

### Botões Dark Mode

| Variante | Background | Border | Color | Font Weight |
|----------|------------|--------|-------|-------------|
| `primary` | `#015379` | `#0292D4` | `#FFF` | 600 |
| `cta` | `#027DB6` | `transparent` | `#FFF` | 600 |
| `secondary` | `#253238` | `#4F6773` | `var(--ui-global-text-color)` | - |
| `tertiary` | `transparent` | `transparent` | `var(--ui-global-text-color)` | - |
| `destructive` | `#BC3232` | `#BC3232` | `#FFF` | - |
| `destructive-outline` | `transparent` | `#ECB7B7` | `#ECB7B7` | - |
| `destructive-text` | `transparent` | `transparent` | `#ECB7B7` | - |

### Botão Desabilitado

| Mode | Background | Border | Color |
|------|------------|--------|-------|
| Light | `#F8FAFB` | `#D7E2EA` | `#75919F` |
| Dark | `#1D272B` | `#455A64` | `#75919F` |

> **Diferença crítica:** O botão `primary` do Clockfy **NÃO é o CTA**. O `primary` é uma variação leve (background azul claro), enquanto o `cta` é o botão de ação principal (background azul sólido). A Gerit Web mapeia `--primary` para o botão principal, mas no Clockfy o equivalente é `cta`.

---

## 4. Sistema de Inputs

### Light Mode

```css
--ui-input-background: #F8FAFB;
--ui-input-border: #75919F;
--ui-input-color: #0A0E10;
--ui-input-placeholder: #75919F;
--ui-input-focus-background: #FFF;
--ui-input-disabled-background: transparent;
--ui-input-disabled-border: #C4D3DB;
--ui-input-disabled-color: #607D8B;
--ui-input-invalid-border: #BC3232;
```

### Dark Mode

```css
--ui-input-background: #253238;
--ui-input-border: #75919F;
--ui-input-color: #FFF;
--ui-input-placeholder: #A2B8C3;
--ui-input-focus-border: #B3BBFF;
--ui-input-focus-background: #1D272B;
--ui-input-disabled-background: transparent;
--ui-input-disabled-border: #546E7A;
--ui-input-disabled-color: #607D8B;
--ui-input-invalid-border: #DE8282;
```

> **Observação:** O input do Clockfy usa `#F8FAFB` (não branco puro) como background no light mode. No dark mode, usa `#253238` (mais claro que o fundo `#12191D`). O foco no dark mode usa `#B3BBFF` (azul claro), não a cor primária `#03A9F4`.

---

## 5. Sistema de Tabelas (Relevante para /clients)

### Light Mode (new-design)

```css
body.new-design .cl-table thead {
  background: #e1e9ef;
}
body.new-design .cl-table thead th {
  border-top-width: 0;
  color: #333;
  font-weight: 700;
  padding-top: 1rem;
  padding-bottom: 1rem;
}
body.new-design .cl-table tbody tr:hover {
  background: #f2f6f8;
}
body.new-design .cl-table td:not(:first-child),
body.new-design .cl-table th:not(:first-child) {
  border-left: 1px solid #c4d3db;
}
```

### Dark Mode (new-design)

```css
body.dark.new-design thead {
  background: #1d272b;
}
body.dark.new-design thead th {
  color: #f2f6f8;
}
body.dark.new-design tbody tr {
  background: #253238;
}
body.dark.new-design tbody tr:hover {
  background: #161e22;
}
body.dark.new-design td:not(:first-child),
body.dark.new-design th:not(:first-child) {
  border-left-color: #12191d;
}
```

### Bordas de Tabela (por tipo de entidade)

O Clockfy usa bordas coloridas na borda inferior de cada linha da tabela, dependendo da entidade:

| Entidade | Cor da borda |
|----------|--------------|
| Projetos | `#7cd2f9` (azul claro) |
| Clientes | `#a2d5a4` (verde claro) |
| Equipes | `#7adce9` (ciano) |
| Relatórios | `#ffc97a` (amarelo) |
| Erros | `#f99d96` (vermelho claro) |
| Padrão | `#f1f4f6` (cinza claro) |

> **Impacto na Gerit Web:** A página `/clients` do Clockfy provavelmente usa bordas `#a2d5a4` nas linhas da tabela. A Gerit Web usa `--border` (slate-200) uniformemente.

---

## 6. Sistema de Tags e Badges

### Tags (Light Mode)

| Tipo | Background | Text | Hover |
|------|------------|------|-------|
| `neutral` | `#B4C6D0` | `#0A0E10` | `#8CA5B2` |
| `accent` | `#BDEAFE` | `#012A3D` | `#7CD5FE` |
| `hard-accent` | `#9DDFFE` | `#013E5B` | `#5BCAFD` |
| `light-accent` | `#DEF4FF` | `#026897` | `#DEF4FF` |
| `info` | `#ECE5F7` | `#412472` | `#C5B2E7` |
| `warning` | `#FFEA00` | `#6B4000` | `#E8D500` |
| `invalid` | `#ECB7B7` | `#581818` | `#E59C9C` |

### Tags (Dark Mode)

| Tipo | Background | Text | Hover |
|------|------------|------|-------|
| `neutral` | `#B4C6D0` | `#0A0E10` | `#8CA5B2` |
| `accent` | `#BDEAFE` | `#012A3D` | `#7CD5FE` |
| `hard-accent` | `#015379` | `#FFF` | `#013E5B` |
| `light-accent` | `#013E5B` | `#9DDFFE` | `#013E5B` |
| `info` | `#5A329F` | `#FFF` | `#412472` |
| `warning` | `#FDD14F` | `#523100` | `#FFAB00` |
| `invalid` | `#ECB7B7` | `#581818` | `#E59C9C` |

### Chips

| Tipo | Background (Light) | Text (Light) | Background (Dark) | Text (Dark) |
|------|-------------------|--------------|-------------------|-------------|
| `neutral` | `#D7E2EA` | `#161E22` | `#37474F` | `#FFF` |
| `success` | `#E2E8D3` | `#3B4620` | `#3B4620` | `#FFF` |
| `incomplete` | `#FFECB3` | `#6B4000` | `#664D00` | `#FFF` |
| `error` | `#FFD1D1` | `#581818` | `#581818` | `#FFF` |
| `info` | `#BDEAFE` | `#012A3D` | `#015379` | `#FFF` |
| `deleted` | `#EEF4F6` | `#546E7A` | `#161E22` | `#8CA5B2` |

### Badges

```css
--ui-badge-background-color: #FF5722;
--ui-badge-color: #FFF;
```

> **Nota:** O badge do Clockfy usa laranja (`#FF5722`), não a cor de destructive (`#BC3232`).

---

## 7. Sistema de Alertas

### Light Mode

| Tipo | Background | Contrast |
|------|------------|----------|
| `info` | `#DEF4FF` | `#026897` |
| `success` | `#E2E8D3` | `#596D26` |
| `warning` | `#FFECB3` | `#856400` |
| `error` | `#FFD1D1` | `#BC3232` |

### Dark Mode

| Tipo | Background | Contrast |
|------|------------|----------|
| `info` | `#013E5B` | `#9DDFFE` |
| `success` | `#3B4620` | `#E2E8D3` |
| `warning` | `#664D00` | `#FFECB3` |
| `error` | `#581818` | `#FFD1D1` |

---

## 8. Sistema de Toast

```css
--ui-toast-info-background: #2254E1;
--ui-toast-info-text: #FFF;
--ui-toast-success-background: #689F38;
--ui-toast-success-text: #FFF;
--ui-toast-warning-background: #FF9800;
--ui-toast-warning-text: #FFF;
--ui-toast-error-background: #BC3232;
--ui-toast-error-text: #FFF;
```

> **Nota:** O toast usa azul mais escuro (`#2254E1`) para info, não `#03A9F4`.

---

## 9. Sistema de Formulários

### Checkbox

| Propriedade | Light | Dark |
|-------------|-------|------|
| `size` | `22px` | `22px` |
| `border-color` | `#C4D3DB` | `#546E7A` |
| `default-background` | `#F2F6F8` | `#253238` |
| `checked-background` | `#027DB6` | `#027DB6` |
| `disabled-background` | `#E1E9EF` | `#253238` |
| `error-border` | `#BC3232` | `#DE8282` |

### Radio

| Propriedade | Light | Dark |
|-------------|-------|------|
| `size` | `24px` | `24px` |
| `border-color` | `#546E7A` | `#75919F` |
| `active` | `#027DB6` | `#3ABFFD` |
| `background` | `#F2F6F8` | `#253238` |

### Switch

| Propriedade | Light | Dark |
|-------------|-------|------|
| `size` | `24px` | `24px` |
| `checked-background` | `#027DB6` | `#027DB6` |
| `checked-indicator` | `#FFF` | `#FFF` |

> **Padrão:** O azul de controle (`#027DB6`) é consistente em checkbox, radio e switch.

---

## 10. Sistema de Tooltips e Popovers

### Tooltips

```css
/* Light */
--ui-tooltip-background: #2D3C43;
--ui-tooltip-color: #FFF;

/* Dark */
--ui-tooltip-background: #E8EFF3;
--ui-tooltip-color: #000;
```

> **Inversão:** No dark mode, o tooltip fica claro (background claro, texto escuro).

### Popovers

| Propriedade | Light | Dark |
|-------------|-------|------|
| `light-background` | `#FCFDFD` | `#34444B` |
| `light-color` | `#546E7A` | `#A2B8C3` |
| `accent-background` | `#03A9F4` | `#19B5FD` |
| `primary-button-bg` | `#03A9F4` | `#03A9F4` |

---

## 11. Border-radius (Novo Design)

O Clockfy tem uma variante `new-design` que usa border-radius maiores:

```css
body.new-design {
  --border-radius-small: 4px;
  --border-radius: 8px;
  --border-big: 12px;
  --border-radius-lg: 8px;
  --border-radius-sm: 8px;
}
```

> **Comparação:**
> - Clockfy (legado): `2px`
> - Clockfy (new-design): `8px`
> - Gerit Web: `0.5rem` (8px)
>
> **Conclusão:** O novo design do Clockfy usa **exatamente 8px**, igual ao shadcn/ui. A Gerit Web já está alinhada com o novo design do Clockfy neste aspecto.

---

## 12. Fontes

```css
body {
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, 'Noto Sans', sans-serif,
    'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
  font-size: calc(0.875 * 1rem * var(--ui-lib-rem-scale));
  line-height: 1.5;
  font-weight: 400;
}
```

### Pesos de Fonte Disponíveis

- `100` (Thin)
- `400` (Regular)
- `500` (Medium)
- `700` (Bold)

> **Nota:** O Clockfy usa `font-size: 14px` como base (`0.875rem * 16/14`). A Gerit Web usa `16px` (padrão do navegador).

---

## 13. Tabela Comparativa Atualizada

### Variáveis Globais

| Aspecto | Gerit Web | Clockfy (legado) | Clockfy (new-design) |
|---------|-----------|------------------|----------------------|
| `--background` | `#ffffff` | `#f2f6f8` | `#f2f6f8` |
| `--foreground` | `#0a0a14` | `#333333` | `#0A0E10` |
| `--primary` | `#0f172a` | `#03a9f4` | `#03A9F4` |
| `--border` | `#e2e8f0` | `#e4eaee` | `#E4EDF1` |
| `--radius` | `8px` | `2px` | `8px` |
| `--ring` (foco) | `#0f172a` | `#03a9f4` | `#0015AF` |

### Dark Mode

| Aspecto | Gerit Web | Clockfy |
|---------|-----------|---------|
| `--background` | `#0a0a14` | `#0A0E10` |
| `--foreground` | `#f8fafc` | `#F2F6F8` |
| `--primary` | `#f8fafc` | `#03A9F4` |
| `--border` | `#1e293b` | `#12191D` |
| `--ring` (foco) | `#cbd5e1` | `#B3BBFF` |
| Card background | `#0a0a14` | `#1D272B` |

### Componentes que Faltam na Gerit Web

| Componente | Clockfy | Gerit Web |
|------------|---------|-----------|
| Botão CTA | `#027DB6` | Não existe (usa `--primary`) |
| Botão Primary (leve) | `#DEF4FF` bg | Não existe |
| Elevação (sunken/default/raised) | 5 níveis | Não existe |
| Tags (neutral/accent/info/warning) | 6 tipos | Não existe |
| Chips (neutral/success/error/info) | 6 tipos | Não existe |
| Toast colors | 4 tipos | Não mapeado |
| Alert colors | 4 tipos | Não mapeado |
| Table row border colors | Por entidade | Não existe |

---

## 14. Diferenças Críticas Não Documentadas

### 14.1 Sistema de Elevação Ausente

A Gerit Web não possui o conceito de **elevation levels**. O Clockfy usa `sunken`, `default`, `raised`, `overlay` para criar profundidade visual. Componentes como cards, dropdowns e popovers dependem disso.

**Recomendação:** Adicionar variáveis de elevação ao `tailwind.config.js`:

```js
colors: {
  elevation: {
    sunken: { bg: '#F2F6F8', border: '#E4EDF1' },
    default: { bg: '#F8FAFB', border: '#E4EDF1' },
    raised: { bg: '#FFFFFF', border: '#E4EDF1' },
    overlay: { bg: '#FFFFFF', border: '#B4C6D0' },
    // dark variants...
  }
}
```

### 14.2 Botão CTA vs Primary

O Clockfy diferencia **botão CTA** (ação principal, `#027DB6`) de **botão primary** (variação leve, `#DEF4FF`). A Gerit Web usa apenas `--primary` para ambos.

**Recomendação:** Criar variante `cta` no sistema de botões:

```tsx
<Button variant="cta">Ação Principal</Button>
<Button variant="primary">Variação Leve</Button>
```

### 14.3 Cor de Foco Diferente

O Clockfy usa `#0015AF` (azul escuro) no light mode e `#B3BBFF` (azul claro) no dark mode para o outline de foco. A Gerit Web usa `--ring` que é `#0f172a` (slate-900) no light e `#cbd5e1` (slate-300) no dark.

**Recomendação:** Atualizar `--ring`:
- Light: `210 100% 36%` (equivalente a `#0015AF`)
- Dark: `228 100% 85%` (equivalente a `#B3BBFF`)

### 14.4 Tabela com Bordas por Entidade

A tabela do Clockfy usa bordas coloridas na lateral baseado no tipo de entidade. A Gerit Web usa borda uniforme.

**Recomendação:** Adicionar classes utilitárias para bordas de entidade:

```css
.table-border-clients { border-left-color: #a2d5a4; }
.table-border-projects { border-left-color: #7cd2f9; }
.table-border-teams { border-left-color: #7adce9; }
```

### 14.5 Tooltip com Inversão de Tema

O tooltip do Clockfy inverte as cores no dark mode (fundo claro, texto escuro). A Gerit Web pode não fazer isso.

**Recomendação:** Verificar se o componente Tooltip da Gerit Web inverte cores no dark mode.

### 14.6 Input com Background Específico

O input do Clockfy usa `#F8FAFB` (não branco puro) no light mode e `#253238` no dark mode. A Gerit Web usa `--input` que é `#e2e8f0` (slate-200).

**Recomendação:** Atualizar `--input`:
- Light: `210 40% 98%` (equivalente a `#f8fafb`)
- Dark: `200 20% 15%` (equivalente a `#253238`)

### 14.7 Badge com Cor Laranja

O badge do Clockfy usa laranja (`#FF5722`), não vermelho de destructive. A Gerit Web usa `--destructive` para badges.

**Recomendação:** Criar variante `badge` separada de `destructive`:

```css
--badge: 10 80% 55%; /* #FF5722 */
```

---

## 15. Recomendações Atualizadas

### Prioridade Alta

1. **Adicionar sistema de elevação** ao `tailwind.config.js` e `globals.css`
2. **Criar variante `cta`** para botões ( separada de `primary`)
3. **Atualizar `--ring`** para as cores de foco do Clockfy (`#0015AF` light, `#B3BBFF` dark)
4. **Atualizar `--input`** para `#f8fafb` (light) e `#253238` (dark)

### Prioridade Média

5. **Adicionar variáveis de toast** (`--toast-info`, `--toast-success`, `--toast-warning`, `--toast-error`)
6. **Adicionar variáveis de alert** (`--alert-info`, `--alert-success`, `--alert-warning`, `--alert-error`)
7. **Adicionar variáveis de tag/chip** para status de entidades
8. **Implementar bordas coloridas** por tipo de entidade na tabela

### Prioridade Baixa

9. **Verificar tooltip** se inverte cores no dark mode
10. **Adicionar badge com cor laranja** separada de destructive
11. **Considerar font-size 14px** como base (opcional, pode impactar layout)

---

## 16. Mapa de Cores Completo do Clockfy

### Paleta Principal

| Nome | Hex | Uso |
|------|-----|-----|
| `blue` | `#03A9F4` | Primary brand, prominent bg |
| `blue-2` | `#2F80ED` | Alternativa azul |
| `blue-3` | `#0288D1` | Azul mais escuro |
| `blue-cta` | `#027DB6` | Botão CTA |
| `blue-focus-light` | `#0015AF` | Foco light mode |
| `blue-focus-dark` | `#B3BBFF` | Foco dark mode |
| `blue-dark-1` | `#015379` | Primary dark mode |
| `blue-dark-2` | `#013E5B` | Hover dark mode |
| `blue-dark-3` | `#00151E` | Active dark mode |

### Paleta Blue-Gray

| Nome | Hex | Uso |
|------|-----|-----|
| `blue-gray-1` | `#F2F6F8` | Background light, sunken |
| `blue-gray-2` | `#E4EDF1` | Border light, default |
| `blue-gray-3` | `#C6D2D9` | Text secondary dark |
| `blue-gray-4` | `#9BA8B0` | Text muted dark |
| `blue-gray-5` | `#37474F` | Hover dark |
| `blue-gray-6` | `#607D8B` | Text muted |
| `blue-gray-7` | `#546E7A` | Text medium |
| `blue-gray-8` | `#455A64` | Dark gray |
| `blue-gray-9` | `#37474F` | Darker gray |
| `blue-gray-10` | `#263238` | Page bg dark |
| `blue-gray-11` | `#1D272C` | Card bg dark |
| `blue-gray-12` | `#12191D` | Darkest, border dark |

### Paleta Semantic

| Nome | Hex | Uso |
|------|-----|-----|
| `success` | `#4CAF50` | Verde |
| `warning` | `#FF9800` | Laranja |
| `danger` | `#F44336` | Vermelho |
| `danger-dark` | `#BC3232` | Vermelho escuro (buttons, alerts) |
| `danger-darker` | `#7D2121` | Hover destructive |
| `danger-darkest` | `#581818` | Active destructive |
| `info` | `#00BCD4` | Ciano |

### Paleta de Fundo

| Nome | Hex | Uso |
|------|-----|-----|
| `bg-light` | `#F2F6F8` | Background principal |
| `bg-card` | `#F8FAFB` | Cards default |
| `bg-raised` | `#FFFFFF` | Cards elevados |
| `bg-input` | `#F8FAFB` | Inputs light |
| `bg-hover` | `#E8EFF3` | Hover light |
| `bg-active` | `#E1E9EF` | Active light |
| `bg-dark-page` | `#263238` | Background dark |
| `bg-dark-card` | `#1D272B` | Cards dark |
| `bg-dark-input` | `#253238` | Inputs dark |
| `bg-dark-hover` | `#161E22` | Hover dark |

### Paleta de Texto

| Nome | Hex | Uso |
|------|-----|-----|
| `text-primary` | `#0A0E10` | Texto principal light |
| `text-dark` | `#333333` | Texto escuro light |
| `text-muted` | `#75919F` | Texto muted light |
| `text-dark-mode` | `#F2F6F8` | Texto principal dark |
| `text-dark-secondary` | `#C6D2D9` | Texto secundário dark |
| `text-dark-muted` | `#9BA8B0` | Texto muted dark |
| `text-dark-dimmed` | `#607D8B` | Texto mais muted dark |

---

## 17. Conclusão

O design system do Clockfy é **muito mais granular** do que o shadcn/ui. Enquanto o shadcn/ui usa ~15 variáveis semânticas, o Clockfy usa **100+ variáveis** organizadas por componente.

A Gerit Web pode approximar o visual do Clockfy atualizando as variáveis semânticas existentes, mas **não será possível uma correspondência perfeita** sem adicionar variáveis novas para:

1. Sistema de elevação
2. Variantes de botão (CTA vs Primary)
3. Cores de toast/alert por tipo
4. Cores de tag/chip por status
5. Bordas de tabela por entidade

A implementação deve ser incremental, começando pelas variáveis globais (fundo, texto, borda, foco) e avançando para componentes específicos.

---

## 18. Próximos Passos

1. [ ] Atualizar `--ring` para cores de foco do Clockfy
2. [ ] Atualizar `--input` para background `#f8fafb` / `#253238`
3. [ ] Adicionar variáveis de elevação ao `tailwind.config.js`
4. [ ] Criar variante `cta` no componente Button
5. [ ] Adicionar variáveis de toast e alert
6. [ ] Implementar bordas coloridas na HubGrid
7. [ ] Testar contraste WCAG com novas cores
8. [ ] Validar com PO se a paleta blue-gray deve substituir o slate do Tailwind
