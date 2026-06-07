# Análise Completa do Design System do Clockfy

**Data:** 2026-06-07  
**Fonte:** https://app.clockify.me/ (todas as rotas)  
**Objetivo:** Mapeamento definitivo do design system para alinhamento com Gerit Web  
**Arquivo CSS analisado:** `styles-NUCBP5CG.css` (841KB)

---

## 1. Resumo Executivo

O Clockfy utiliza um design system robusto baseado em **variáveis CSS custom properties** com arquitetura dual-theme (`.ui-theme__light` e `.ui-theme__dark`). O sistema é altamente modular, com mais de **200 variáveis CSS** documentadas.

### Características Principais
- **Framework:** Angular (SPA) com CSS custom properties
- **Fonte primária:** Roboto (weights: 100, 400, 500, 700)
- **Escala rem:** 14px base (com `--ui-lib-rem-scale: 16/14`)
- **Border-radius:** Uniforme em 2px (legado) → 8px (novo design)
- **Paleta principal:** Azul (#03A9F4) + Verde (#4CAF50)
- **Sistema de elevação:** 5 níveis (sunken, default, raised, overlay, prominent)
- **Dual theme:** Classes `.ui-theme__light` e `.ui-theme__dark`

---

## 2. Paleta de Cores Principal

### 2.1 Cores Semânticas (Brand Colors)

| Cor | Hex | Uso |
|-----|-----|-----|
| Primary (Azul) | `#03A9F4` | Botões primários, links, ações principais |
| Secondary (Verde) | `#4CAF50` | Botões secundários, sucesso |
| Success | `#4CAF50` | Estados de sucesso |
| Info | `#00BCD4` | Informações |
| Warning | `#FF9800` | Avisos |
| Danger | `#F44336` | Erros, ações destrutivas |
| Dark | `#333` | Texto principal |
| White | `#FFFFFF` | Fundos claros |

### 2.2 Blue Gray Scale (Escala Cinza-Azul)

| Variável | Hex | Uso |
|----------|-----|-----|
| `--blue-gray-1` | `#F2F6F8` | Fundo principal light, texto escuro |
| `--blue-gray-2` | `#E4EAEE` | Bordas leves, separadores |
| `--blue-gray-3` | `#C6D2D9` | Bordas médias, texto muted |
| `--blue-gray-4` | `#9BA8B0` | Texto secundário |
| `--blue-gray-5` | `#37474F` | Fundos escuros, texto em dark mode |
| `--blue-gray-6` | `#607D8B` | Ícones, texto intermediário |
| `--blue-gray-7` | `#546E7A` | Texto muted, labels |
| `--blue-gray-8` | `#455A64` | Bordas escuras |
| `--blue-gray-9` | `#37474F` | Fundos escuros profundos |
| `--blue-gray-10` | `#263238` | Fundo dark mode base |
| `--blue-gray-11` | `#1D272C` | Fundo dark mode elevado |
| `--blue-gray-12` | `#12191D` | Fundo dark mode mais escuro |

### 2.3 Cores de Avatar (10 opções)

| Cor | Hex |
|-----|-----|
| Blue | `#1976D2` |
| Brown | `#8D6E63` |
| Cyan | `#0292D4` |
| Deep Orange | `#FF5722` |
| Indigo | `#5C6BC0` |
| Light Green | `#689F38` |
| Pink | `#E91E63` |
| Purple | `#AB47BC` |
| Teal | `#009688` |
| (Default Blue) | `#03A9F4` |

---

## 3. Tema Light Completo (`.ui-theme__light`)

### 3.1 Global

```css
.ui-theme__light {
  --ui-global-background-color: #F2F6F8;
  --ui-global-text-color: #0A0E10;
  --ui-global-focus-outline: #0015AF;
}
```

### 3.2 Cores por Componente — Light Mode

#### Botões

```css
/* Primary Button */
--ui-button-types-primary-background: #DEF4FF;
--ui-button-types-primary-border-color: #BDEAFE;
--ui-button-types-primary-color: #026897;
--ui-button-types-primary-font-weight: 600;
--ui-button-types-primary-hover-background: #BDEAFE;
--ui-button-types-primary-active-background: #9DDFFE;

/* Secondary Button */
--ui-button-types-secondary-background: #F8FAFB;
--ui-button-types-secondary-border-color: #D7E2EA;
--ui-button-types-secondary-color: var(--ui-global-text-color);
--ui-button-types-secondary-hover-background: #E8EFF3;
--ui-button-types-secondary-active-background: #E1E9EF;
--ui-button-types-secondary-icon-color: #C4D3DB;

/* Tertiary Button */
--ui-button-types-tertiary-background: transparent;
--ui-button-types-tertiary-border-color: transparent;
--ui-button-types-tertiary-color: var(--ui-global-text-color);
--ui-button-types-tertiary-hover-background: #E8EFF3;
--ui-button-types-tertiary-hover-border-color: #D7E2EA;
--ui-button-types-tertiary-active-background: #E1E9EF;
--ui-button-types-tertiary-active-border-color: #D7E2EA;
--ui-button-types-tertiary-icon-color: #C4D3DB;

/* Tertiary Branded */
--ui-button-types-tertiary-branded-color: #7CD5FE;
--ui-button-types-tertiary-branded-hover-background: #E8EFF3;
--ui-button-types-tertiary-branded-hover-border-color: #D7E2EA;
--ui-button-types-tertiary-branded-active-background: #E1E9EF;
--ui-button-types-tertiary-branded-active-border-color: #D7E2EA;

/* CTA Button */
--ui-button-types-cta-background: #027DB6;
--ui-button-types-cta-border-color: transparent;
--ui-button-types-cta-color: #FFF;
--ui-button-types-cta-font-weight: 600;
--ui-button-types-cta-hover-background: #026897;
--ui-button-types-cta-active-background: #013E5B;

/* Destructive Button */
--ui-button-types-destructive-background: #BC3232;
--ui-button-types-destructive-border-color: #BC3232;
--ui-button-types-destructive-color: #FFF;
--ui-button-types-destructive-hover-background: #7D2121;
--ui-button-types-destructive-active-background: #581818;

/* Destructive Outline */
--ui-button-types-destructive-outline-background: transparent;
--ui-button-types-destructive-outline-border-color: #ECB7B7;
--ui-button-types-destructive-outline-color: #ECB7B7;
--ui-button-types-destructive-outline-hover-background: #FFF0F0;
--ui-button-types-destructive-outline-active-background: #FFD1D1;

/* Destructive Text */
--ui-button-types-destructive-text-background: transparent;
--ui-button-types-destructive-text-border-color: transparent;
--ui-button-types-destructive-text-color: #ECB7B7;
--ui-button-types-destructive-text-hover-background: #FFF0F0;
--ui-button-types-destructive-text-active-background: #FFD1D1;

/* Disabled State */
--ui-button-disabled-background: #F8FAFB;
--ui-button-disabled-border-color: #D7E2EA;
--ui-button-disabled-color: #75919F;
```

#### Inputs

```css
--ui-input-background: #F8FAFB;
--ui-input-border: #75919F;
--ui-input-color: #FFF;
--ui-input-placeholder: #A2B8C3;
--ui-input-focus-background: #FFF;
--ui-input-focus-border: #B3BBFF;
--ui-input-disabled-background: transparent;
--ui-input-disabled-border: #C4D3DB;
--ui-input-disabled-color: #607D8B;
--ui-input-invalid-border: #DE8282;
```

#### Checkbox

```css
--ui-checkbox-background: #027DB6;
--ui-checkbox-border-color: #C4D3DB;
--ui-checkbox-default-background: #F2F6F8;
--ui-checkbox-disabled-background: #E1E9EF;
--ui-checkbox-disabled-border-color: #C4D3DB;
--ui-checkbox-disabled-color: #A2B8C3;
--ui-checkbox-error-border-color: #DE8282;
--ui-checkbox-size: 22px;
```

#### Radio

```css
--ui-radio-active: #3ABFFD;
--ui-radio-active-hover: #027DB6;
--ui-radio-background: #F2F6F8;
--ui-radio-background-hover: #FFF;
--ui-radio-border-color: #75919F;
--ui-radio-border-color-hover: #8CA5B2;
--ui-radio-background-disabled: #E1E9EF;
--ui-radio-border-color-disabled: #B4C6D0;
--ui-radio-active-disabled: #B4C6D0;
--ui-radio-size: 24px;
```

#### Switch

```css
--ui-switch-background: #F8FAFB;
--ui-switch-border-color: #75919F;
--ui-switch-indicator-color: #E1E9EF;
--ui-switch-indicator-icon-color: #FFF;
--ui-switch-hover-background: #FFF;
--ui-switch-hover-border-color: #B4C6D0;
--ui-switch-hover-indicator-color: #C4D3DB;
--ui-switch-checked-background: #027DB6;
--ui-switch-checked-border-color: #027DB6;
--ui-switch-checked-indicator-color: #FFF;
--ui-switch-checked-indicator-icon-color: #013E5B;
--ui-switch-checked-hover-background: #013E5B;
--ui-switch-checked-hover-border-color: #013E5B;
--ui-switch-disabled-background: #F2F6F8;
--ui-switch-disabled-border-color: #D7E2EA;
--ui-switch-disabled-indicator-color: #A2B8C3;
--ui-switch-disabled-indicator-icon-color: #F2F6F8;
--ui-switch-checked-disabled-background: #D7E2EA;
--ui-switch-checked-disabled-border-color: #D7E2EA;
--ui-switch-checked-disabled-indicator-color: #A2B8C3;
--ui-switch-checked-disabled-indicator-icon-color: #F2F6F8;
--ui-switch-size: 24px;
```

#### Modal

```css
--ui-modal-background: #FFF;
--ui-modal-border-color: #C4D3DB;
```

#### Drawer

```css
--ui-drawer-background: #FFF;
--ui-drawer-border-color: #C4D3DB;
```

#### Dropdown

```css
--ui-dropdown-background-color: #FCFDFD;
--ui-dropdown-border-color: #C4D3DB;
--ui-dropdown-color: #F2F6F8;
--ui-dropdown-hover-background: #E4EDF1;
/* box-shadow: 0 4px 16px #00000026 */
```

#### Popover

```css
/* Light variant */
--ui-popover-types-light-background-color: #FCFDFD;
--ui-popover-types-light-color: #A2B8C3;
--ui-popover-types-light-label-color: #F2F6F8;
--ui-popover-types-light-close-btn-color: #A2B8C3;
--ui-popover-types-light-primary-button-background: #03A9F4;
--ui-popover-types-light-primary-button-border-color: #03A9F4;
--ui-popover-types-light-primary-button-color: #FFF;
--ui-popover-types-light-secondary-button-background: #F8FAFB;
--ui-popover-types-light-secondary-button-border-color: #D7E2EA;
--ui-popover-types-light-secondary-button-color: #F2F6F8;

/* Accent variant */
--ui-popover-types-accent-background-color: #19B5FD;
--ui-popover-types-accent-color: #FFF;
--ui-popover-types-accent-label-color: #FFF;
--ui-popover-types-accent-close-btn-color: #FFF;
--ui-popover-types-accent-primary-button-background: #F8FAFB;
--ui-popover-types-accent-primary-button-border-color: #F8FAFB;
--ui-popover-types-accent-primary-button-color: #0A0E10;
--ui-popover-types-accent-secondary-button-background: transparent;
--ui-popover-types-accent-secondary-button-border-color: transparent;
--ui-popover-types-accent-secondary-button-color: #FFF;
```

#### Alert

```css
/* Error */
--ui-alert-types-error-background: #FFD1D1;
--ui-alert-types-error-contrast: #FFD1D1;

/* Info */
--ui-alert-types-info-background: #DEF4FF;
--ui-alert-types-info-contrast: #9DDFFE;

/* Success */
--ui-alert-types-success-background: #E2E8D3;
--ui-alert-types-success-contrast: #E2E8D3;

/* Warning */
--ui-alert-types-warning-background: #FFECB3;
--ui-alert-types-warning-contrast: #FFECB3;

--ui-alert-close-btn: #455A64;
```

#### Banner

```css
--ui-banner-text: #FFF;
--ui-banner-types-critical-background: #BC3232;
--ui-banner-types-info-background: #2254E1;
--ui-banner-types-success-background: #689F38;
--ui-banner-types-tips-background: #2254E1;
--ui-banner-types-warning-background: #FF9800;
```

#### Toast

```css
--ui-toast-error-background: #BC3232;
--ui-toast-error-text: #FFF;
--ui-toast-info-background: #2254E1;
--ui-toast-info-text: #FFF;
--ui-toast-success-background: #689F38;
--ui-toast-success-text: #FFF;
--ui-toast-warning-background: #FF9800;
--ui-toast-warning-text: #FFF;
```

#### Tooltip

```css
--ui-tooltip-background: #E8EFF3;
--ui-tooltip-color: #FFF;
/* box-shadow: 0 4px 16px #00000026 */
```

#### Chip / Tag

```css
/* Neutral */
--ui-chip-types-neutral-background: #D7E2EA;
--ui-chip-types-neutral-text: #FFF;

/* Error */
--ui-chip-types-error-background: #FFD1D1;
--ui-chip-types-error-text: #FFF;

/* Info */
--ui-chip-types-info-background: #BDEAFE;
--ui-chip-types-info-text: #FFF;

/* Success */
--ui-chip-types-success-background: #E2E8D3;
--ui-chip-types-success-text: #FFF;

/* Incomplete */
--ui-chip-types-incomplete-background: #FFECB3;
--ui-chip-types-incomplete-text: #FFF;

/* Deleted */
--ui-chip-types-deleted-background: #EEF4F6;
--ui-chip-types-deleted-text: #8CA5B2;
```

#### Tags (Variantes de intensidade)

```css
/* Accent (light) */
--ui-tag-types-accent-background: #BDEAFE;
--ui-tag-types-accent-text: #012A3D;
--ui-tag-types-accent-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-accent-background-hover: #7CD5FE;
--ui-tag-types-accent-background-active: #19B5FD;

/* Hard Accent */
--ui-tag-types-hard-accent-background: #9DDFFE;
--ui-tag-types-hard-accent-text: #FFF;
--ui-tag-types-hard-accent-border-color: rgba(255, 255, 255, .25);
--ui-tag-types-hard-accent-background-hover: #5BCAFD;

/* Light Accent */
--ui-tag-types-light-accent-background: #DEF4FF;
--ui-tag-types-light-accent-text: #9DDFFE;
--ui-tag-types-light-accent-border-color: #DEF4FF;
--ui-tag-types-light-accent-background-hover: #DEF4FF;

/* Neutral */
--ui-tag-types-neutral-background: #B4C6D0;
--ui-tag-types-neutral-text: #0A0E10;
--ui-tag-types-neutral-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-neutral-background-hover: #8CA5B2;
--ui-tag-types-neutral-background-active: #75919F;

/* Info */
--ui-tag-types-info-background: #ECE5F7;
--ui-tag-types-info-text: #FFF;
--ui-tag-types-info-border-color: rgba(255, 255, 255, .25);
--ui-tag-types-info-background-hover: #C5B2E7;

/* Warning */
--ui-tag-types-warning-background: #FFEA00;
--ui-tag-types-warning-text: #6B4000;
--ui-tag-types-warning-border-color: rgba(255, 255, 255, .25);
--ui-tag-types-warning-background-hover: #FFAB00;

/* Invalid */
--ui-tag-types-invalid-background: #ECB7B7;
--ui-tag-types-invalid-text: #581818;
--ui-tag-types-invalid-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-invalid-background-hover: #E59C9C;
--ui-tag-types-invalid-background-active: #DE8282;
```

#### Date Picker

```css
--ui-date-picker-background: #FFF;
--ui-date-picker-border-color: #C4D3DB;
--ui-date-picker-active: #027DB6;
--ui-date-picker-active-color: #FFF;
--ui-date-picker-highlight: #E1E9EF;
--ui-date-picker-highlight-text: #0A0E10;
--ui-date-picker-highlight-preset: #E4EDF1;
--ui-date-picker-hover: #EEF4F6;
--ui-date-picker-text-muted: #75919F;
--ui-date-picker-preset-border-color: #E4EDF1;
--ui-date-picker-cancel-btn-background: #F8FAFB;
--ui-date-picker-cancel-btn-border-color: #D7E2EA;
--ui-date-picker-cancel-btn-color: inherit;
```

#### Progress Bar

```css
--ui-progress-bar-bar-color: #03A9F4;
--ui-progress-bar-border-color: #C4D3DB;
```

#### Incrementer

```css
--ui-incrementer-background: #F2F6F8;
--ui-incrementer-border-color: #75919F;
--ui-incrementer-color: #F2F6F8;
--ui-incrementer-icon-color: #C4D3DB;
--ui-incrementer-hover-background: #F8FAFB;
--ui-incrementer-focus-background: #FFF;
--ui-incrementer-disabled-background: #F2F6F8;
--ui-incrementer-disabled-border-color: #D7E2EA;
--ui-incrementer-disabled-button-color: #8CA5B2;
--ui-incrementer-disabled-color: #75919F;
--ui-incrementer-invalid-border: #DE8282;
```

#### Month Picker

```css
--ui-month-picker-background: #FFF;
--ui-month-picker-border-color: #C4D3DB;
```

#### Search Input

```css
--ui-search-input-buttons-color: #A2B8C3;
--ui-search-input-buttons-focused: #3E515B;
```

#### Select

```css
--ui-select-buttons-color: #3E515B;
--ui-select-buttons-disabled: #75919F;
```

---

## 4. Tema Dark Completo (`.ui-theme__dark`)

### 4.1 Global

```css
.ui-theme__dark {
  --ui-global-background-color: #0A0E10;
  --ui-global-text-color: #F2F6F8;
  --ui-global-focus-outline: #B3BBFF;
}
```

### 4.2 Cores por Componente — Dark Mode

#### Botões

```css
/* Primary Button (Dark) */
--ui-button-types-primary-background: #015379;
--ui-button-types-primary-border-color: #0292D4;
--ui-button-types-primary-color: #FFF;
--ui-button-types-primary-hover-background: #026897;
--ui-button-types-primary-active-background: #00151E;

/* Secondary Button (Dark) */
--ui-button-types-secondary-background: #253238;
--ui-button-types-secondary-border-color: #4F6773;
--ui-button-types-secondary-color: var(--ui-global-text-color);
--ui-button-types-secondary-hover-background: #1D272B;
--ui-button-types-secondary-active-background: #12191D;
--ui-button-types-secondary-icon-color: #3E515B;

/* Tertiary Button (Dark) */
--ui-button-types-tertiary-background: transparent;
--ui-button-types-tertiary-border-color: transparent;
--ui-button-types-tertiary-hover-background: #1D272B;
--ui-button-types-tertiary-hover-border-color: #4F6773;
--ui-button-types-tertiary-active-background: #0A0E10;
--ui-button-types-tertiary-active-border-color: #4F6773;
--ui-button-types-tertiary-icon-color: #3E515B;

/* Tertiary Branded (Dark) */
--ui-button-types-tertiary-branded-color: #026897;
--ui-button-types-tertiary-branded-hover-background: #1D272B;
--ui-button-types-tertiary-branded-hover-border-color: #4F6773;
--ui-button-types-tertiary-branded-active-background: #0A0E10;
--ui-button-types-tertiary-branded-active-border-color: #4F6773;

/* CTA Button (Dark) */
--ui-button-types-cta-background: #027DB6;
--ui-button-types-cta-hover-background: #026897;
--ui-button-types-cta-active-background: #013E5B;

/* Destructive Button (Dark) */
--ui-button-types-destructive-background: #BC3232;
--ui-button-types-destructive-hover-background: #7D2121;
--ui-button-types-destructive-active-background: #581818;

/* Destructive Outline (Dark) */
--ui-button-types-destructive-outline-border-color: #BC3232;
--ui-button-types-destructive-outline-color: #BC3232;
--ui-button-types-destructive-outline-hover-background: #7D2121;
--ui-button-types-destructive-outline-active-background: #581818;

/* Destructive Text (Dark) */
--ui-button-types-destructive-text-color: #BC3232;
--ui-button-types-destructive-text-hover-background: #7D2121;
--ui-button-types-destructive-text-active-background: #581818;

/* Disabled State (Dark) */
--ui-button-disabled-background: #1D272B;
--ui-button-disabled-border-color: #455A64;
--ui-button-disabled-color: #75919F;
```

#### Inputs (Dark)

```css
--ui-input-background: #253238;
--ui-input-border: #75919F;
--ui-input-color: #0A0E10;
--ui-input-placeholder: #75919F;
--ui-input-focus-background: #1D272B;
--ui-input-focus-border: #B3BBFF;
--ui-input-disabled-background: transparent;
--ui-input-disabled-border: #546E7A;
--ui-input-disabled-color: #607D8B;
--ui-input-invalid-border: #BC3232;
```

#### Checkbox (Dark)

```css
--ui-checkbox-background: #027DB6;
--ui-checkbox-border-color: #546E7A;
--ui-checkbox-default-background: #253238;
--ui-checkbox-disabled-background: #253238;
--ui-checkbox-disabled-border-color: #3E515B;
--ui-checkbox-disabled-color: #4F6773;
--ui-checkbox-error-border-color: #BC3232;
--ui-checkbox-size: 22px;
```

#### Radio (Dark)

```css
--ui-radio-active: #027DB6;
--ui-radio-active-hover: #013E5B;
--ui-radio-background: #253238;
--ui-radio-background-hover: #37474F;
--ui-radio-border-color: #546E7A;
--ui-radio-border-color-hover: #455A64;
--ui-radio-background-disabled: #253238;
--ui-radio-border-color-disabled: #546E7A;
--ui-radio-active-disabled: #455A64;
--ui-radio-size: 24px;
```

#### Switch (Dark)

```css
--ui-switch-background: #161E22;
--ui-switch-border-color: #75919F;
--ui-switch-indicator-color: #607D8B;
--ui-switch-indicator-icon-color: #000;
--ui-switch-hover-background: #1D272B;
--ui-switch-hover-border-color: #607D8B;
--ui-switch-hover-indicator-color: #3E515B;
--ui-switch-checked-background: #027DB6;
--ui-switch-checked-border-color: #027DB6;
--ui-switch-checked-indicator-color: #FFF;
--ui-switch-checked-indicator-icon-color: #013E5B;
--ui-switch-checked-hover-background: #013E5B;
--ui-switch-checked-hover-border-color: #013E5B;
--ui-switch-disabled-background: #29373D;
--ui-switch-disabled-border-color: #455A64;
--ui-switch-disabled-indicator-color: #4F6773;
--ui-switch-disabled-indicator-icon-color: #F2F6F8;
--ui-switch-checked-disabled-background: #161E22;
--ui-switch-checked-disabled-border-color: #455A64;
--ui-switch-checked-disabled-indicator-color: #4F6773;
--ui-switch-checked-disabled-indicator-icon-color: #29373D;
--ui-switch-size: 24px;
```

#### Modal (Dark)

```css
--ui-modal-background: #1D272B;
--ui-modal-border-color: #12191D;
```

#### Drawer (Dark)

```css
--ui-drawer-background: #1D272B;
--ui-drawer-border-color: #12191D;
```

#### Dropdown (Dark)

```css
--ui-dropdown-background-color: #253238;
--ui-dropdown-border-color: #3E515B;
--ui-dropdown-color: #546E7A;
--ui-dropdown-hover-background: #161E22;
```

#### Popover (Dark)

```css
/* Light variant (Dark) */
--ui-popover-types-light-background-color: #34444B;
--ui-popover-types-light-color: #546E7A;
--ui-popover-types-light-label-color: #0A0E10;
--ui-popover-types-light-close-btn-color: #3E515B;
--ui-popover-types-light-primary-button-background: #03A9F4;
--ui-popover-types-light-primary-button-border-color: #03A9F4;
--ui-popover-types-light-primary-button-color: #FFF;
--ui-popover-types-light-secondary-button-background: #253238;
--ui-popover-types-light-secondary-button-border-color: #4F6773;
--ui-popover-types-light-secondary-button-color: #0A0E10;
```

#### Alert (Dark)

```css
/* Error */
--ui-alert-types-error-background: #581818;
--ui-alert-types-error-contrast: #BC3232;

/* Info */
--ui-alert-types-info-background: #013E5B;
--ui-alert-types-info-contrast: #026897;

/* Success */
--ui-alert-types-success-background: #3B4620;
--ui-alert-types-success-contrast: #596D26;

/* Warning */
--ui-alert-types-warning-background: #664D00;
--ui-alert-types-warning-contrast: #856400;

--ui-alert-close-btn: #B4C6D0;
```

#### Tooltip (Dark)

```css
--ui-tooltip-background: #2D3C43;
--ui-tooltip-color: #000;
```

#### Chip / Tag (Dark)

```css
/* Neutral */
--ui-chip-types-neutral-background: #37474F;
--ui-chip-types-neutral-text: #FFF;

/* Deleted */
--ui-chip-types-deleted-background: #161E22;
--ui-chip-types-deleted-text: #546E7A;
```

#### Date Picker (Dark)

```css
--ui-date-picker-background: #253238;
--ui-date-picker-border-color: #3E515B;
--ui-date-picker-highlight: #34444B;
--ui-date-picker-highlight-text: "currentColor";
--ui-date-picker-highlight-preset: #161E22;
--ui-date-picker-hover: #2D3C43;
--ui-date-picker-text-muted: #75919F;
--ui-date-picker-preset-border-color: #253238;
--ui-date-picker-cancel-btn-background: "transparent";
--ui-date-picker-cancel-btn-border-color: #4F6773;
--ui-date-picker-cancel-btn-color: #F2F6F8;
```

#### Month Picker (Dark)

```css
--ui-month-picker-background: #324148;
--ui-month-picker-border-color: #324148;
```

#### Progress Bar (Dark)

```css
--ui-progress-bar-bar-color: #03A9F4;
--ui-progress-bar-border-color: #4F6773;
```

#### Incrementer (Dark)

```css
--ui-incrementer-background: #161E22;
--ui-incrementer-border-color: #75919F;
--ui-incrementer-color: #0A0E10;
--ui-incrementer-hover-background: #29373D;
--ui-incrementer-focus-background: #1D272B;
--ui-incrementer-disabled-background: #29373D;
--ui-incrementer-disabled-border-color: #455A64;
--ui-incrementer-disabled-button-color: #607D8B;
--ui-incrementer-invalid-border: #BC3232;
```

#### Tags (Dark — variações)

```css
/* Accent (Dark) */
--ui-tag-types-accent-background: #015379;
--ui-tag-types-accent-text: #013E5B;
--ui-tag-types-accent-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-accent-background-hover: #013E5B;

/* Hard Accent (Dark) */
--ui-tag-types-hard-accent-background: #015379;
--ui-tag-types-hard-accent-text: #FFF;
--ui-tag-types-hard-accent-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-hard-accent-background-hover: #013E5B;

/* Light Accent (Dark) */
--ui-tag-types-light-accent-background: #013E5B;
--ui-tag-types-light-accent-text: #026897;
--ui-tag-types-light-accent-border-color: #013E5B;
--ui-tag-types-light-accent-background-hover: #013E5B;

/* Neutral (Dark) */
--ui-tag-types-neutral-background: #B4C6D0;
--ui-tag-types-neutral-text: #0A0E10;
--ui-tag-types-neutral-border-color: rgba(0, 0, 0, .15);

/* Info (Dark) */
--ui-tag-types-info-background: #5A329F;
--ui-tag-types-info-text: #FFF;
--ui-tag-types-info-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-info-background-hover: #412472;

/* Warning (Dark) */
--ui-tag-types-warning-background: #FDD14F;
--ui-tag-types-warning-text: #523100;
--ui-tag-types-warning-border-color: rgba(0, 0, 0, .15);
--ui-tag-types-warning-background-hover: #E8D500;
```

---

## 5. Sistema de Elevação (Elevation System)

O Clockfy usa 5 níveis de elevação, cada um com variação light/dark:

### Níveis de Elevação

| Nível | Uso | Light BG | Dark BG |
|-------|-----|----------|---------|
| Sunken | Fundo rebaixado, seções internas | `#F2F6F8` | `#12191D` |
| Default | Cards básicos, itens de lista | `#F8FAFB` | `#1D272B` |
| Raised | Cards elevados, dropdowns | `#FFF` | `#253238` |
| Overlay | Modais, popovers | `#FFF` | `#324148` |
| Prominent | Ações principais, CTAs | `#03A9F4` | `#03A9F4` |

### Detalhes por Nível

```css
/* Sunken */
--ui-elevation-system-types-sunken-background: #F2F6F8;     /* Light */
--ui-elevation-system-types-sunken-background: #12191D;     /* Dark */
--ui-elevation-system-types-sunken-border-color: #E4EDF1;   /* Light */
--ui-elevation-system-types-sunken-border-color: #12191D;   /* Dark */
--ui-elevation-system-types-sunken-background-hover: #E4EDF1; /* Light */
--ui-elevation-system-types-sunken-background-hover: #0A0E10; /* Dark */

/* Default */
--ui-elevation-system-types-default-background: #F8FAFB;     /* Light */
--ui-elevation-system-types-default-background: #1D272B;     /* Dark */
--ui-elevation-system-types-default-border-color: #E4EDF1;   /* Light */
--ui-elevation-system-types-default-border-color: #12191D;   /* Dark */
--ui-elevation-system-types-default-background-hover: #F8FAFB; /* Light */
--ui-elevation-system-types-default-background-hover: #1D272B; /* Dark */

/* Raised */
--ui-elevation-system-types-raised-background: #FFF;         /* Light */
--ui-elevation-system-types-raised-background: #253238;      /* Dark */
--ui-elevation-system-types-raised-border-color: #E4EDF1;    /* Light */
--ui-elevation-system-types-raised-border-color: #12191D;    /* Dark */
--ui-elevation-system-types-raised-background-hover: #E8EFF3; /* Light */
--ui-elevation-system-types-raised-background-hover: #2D3C43; /* Dark */

/* Overlay */
--ui-elevation-system-types-overlay-background: #FFF;         /* Light */
--ui-elevation-system-types-overlay-background: #324148;      /* Dark */
--ui-elevation-system-types-overlay-border-color: #B4C6D0;   /* Light */
--ui-elevation-system-types-overlay-border-color: #37474F;   /* Dark */
--ui-elevation-system-types-overlay-background-hover: #FFF;   /* Light */
--ui-elevation-system-types-overlay-border-color-hover: #B4C6D0; /* Light */

/* Prominent */
--ui-elevation-system-types-prominent-background: #03A9F4;
--ui-elevation-system-types-prominent-background-hover: #03A9F4;
--ui-elevation-system-types-prominent-border-color: transparent;
--ui-elevation-system-types-prominent-sunken-background: #026897;
--ui-elevation-system-types-prominent-sunken-background-hover: #026897;
```

---

## 6. Sistema de Tipografia

### 6.1 Font Family

```css
--font-family-sans-serif: "Roboto", -apple-system, BlinkMacSystemFont, 
  "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif,
  "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";

--font-family-monospace: SFMono-Regular, Menlo, Monaco, Consolas, 
  "Liberation Mono", "Courier New", monospace;
```

### 6.2 Font Weights

| Peso | Uso |
|------|-----|
| 100 (Thin) | Títulos decorative |
| 400 (Regular) | Texto corpo |
| 500 (Medium) | Labels, texto enfatizado |
| 700 (Bold) | Títulos, texto forte |

### 6.3 Font Sizes

```css
/* Base */
html { font-size: 14px; }
body { 
  font-size: calc(.875 * 1rem * var(--ui-lib-rem-scale)); /* 14px */
  line-height: 1.5;
  font-weight: 400;
}

/* Loading screen */
.rotating-loader-text-primary { font-size: 18px; }
.rotating-loader-text-secondary { font-size: 12px; }
```

### 6.4 Line Heights

| Contexto | Line Height |
|----------|-------------|
| Corpo de texto | 1.5 |
| Títulos | 1.3 |
| Loading text | 1.3 |

---

## 7. Sistema de Espaçamento e Border Radius

### 7.1 Border Radius

```css
/* Legado (todas as rotas antigas) */
--border-radius-small: 2px;
--border-radius: 2px;
--border-big: 2px;
--border-radius-lg: 2px;
--border-radius-sm: 2px;

/* Novo design (body.new-design) */
--border-radius-small: 4px;
--border-radius: 8px;
--border-big: 12px;
--border-radius-lg: 8px;
--border-radius-sm: 8px;

/* Componentes específicos */
.ui-button { border-radius: 6px; }
.ui-avatar { border-radius: max(4px, min(12px, 12.5%)); }
```

### 7.2 Espaçamentos

```css
/* Alertas */
.ui-alert { 
  padding: calc(.5 * 1rem * var(--ui-lib-rem-scale)) calc(1 * 1rem * var(--ui-lib-rem-scale)); 
}

/* Banners */
.ui-banner { 
  padding: calc(.25 * 1rem * var(--ui-lib-rem-scale)) calc(1 * 1rem * var(--ui-lib-rem-scale)); 
}

/* Date Picker */
ui-date-picker { padding: 20px; }

/* Month Picker */
ui-month-picker { padding: 20px; }

/* Loading logo */
.rotating-loader-logo-container { padding: 20px; }
.rotating-loader-text { padding: 0 20px; }
```

### 7.3 Breakpoints

```css
--breakpoint-xs: 0;
--breakpoint-sm: 576px;
--breakpoint-md: 768px;
--breakpoint-lg: 992px;
--breakpoint-xl: 1200px;
--breakpoint-lg-custom: 1366px;
--breakpoint-xl-custom: 1600px;
```

---

## 8. Sombras e Elevação

```css
/* Loading container */
.rotating-loader-logo-container {
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
}

/* Dropdown */
.ui-dropdown__content {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); /* #00000026 */
}

/* Tooltip */
.ui-tooltip__box {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); /* #00000026 */
}
```

---

## 9. Autenticação (Auth) — Variáveis Específicas

### Light Mode

```css
--landing-page-bg: #f1f1f4;
--auth-form-container-shadow: #0b0c0e40;
--auth-form-logo-bg: #f7f7f8;
--auth-form-logo-border: #e9e9ed;
--auth-form-body: #fff;
--auth-form-header: #333;
--auth-form-header-msg: #546e7a;
--auth-form-subdomain-name-bg: #e9e9ed;
--auth-form-subdomain-name-color: #667085;
--auth-form-footer-bg: #f7f7f8;
--auth-form-footer-border: #e9e9ed;
--auth-form-control-border: #e9e9ed;
--auth-form-control-bg: #f2f6f8;
--auth-form-control-text: #0a0e10;
--auth-form-control-disabled: #e1e9ef;
--auth-info-banner-bg: #aee4fe;
--auth-info-banner-text: #0a0e10;
--auth-organization-select-bg: #fff;
--auth-organization-select-text: #0a0e10;
--auth-mail-provider-btn-border: #d7e2ea;
--auth-form-primary: #f7f7f8;
--auth-form-footer-msg-btn: #0015af;
--auth-form-footer-msg-span: #546e7a;
--auth-form-control-error: #bf2600;
```

### Dark Mode

```css
--landing-page-bg: #12191d;
--auth-form-container-shadow: #161e2233;
--auth-form-logo-bg: #161e22;
--auth-form-logo-border: #1d272b;
--auth-form-body: #253238;
--auth-form-header: #f2f6f8;
--auth-form-header-msg: #a2b8c3;
--auth-form-subdomain-name-bg: #1d272b;
--auth-form-subdomain-name-color: #c6d2d9;
--auth-form-footer-bg: #1d272b;
--auth-form-footer-border: #1d272b;
--auth-form-control-border: #17181c;
--auth-form-control-bg: #161e22;
--auth-form-control-text: #f2f6f8;
--auth-form-control-disabled: #1d272b;
--auth-info-banner-bg: #163d50;
--auth-info-banner-text: #f2f6f8;
--auth-organization-select-bg: #253238;
--auth-organization-select-text: #f2f6f8;
--auth-mail-provider-btn-border: #2d3c43;
--auth-form-footer-msg-btn: #b3bbff;
--auth-form-footer-msg-span: #a2b8c3;
--auth-form-control-error: #ff5630;
```

### Outras Variáveis de Auth

```css
--timer-container-seconds: #8f91a3;  /* Light */
--timer-container-seconds: #546e7a;  /* Dark */

--picker-body-bg: #f8fafb;           /* Light */
--picker-body-bg: #253238;           /* Dark */
--picker-header-footer-bg: #f2f6f8;  /* Light */
--picker-header-footer-bg: #161e22;  /* Dark */
--picker-organization-name: #546e7a; /* Light */
--picker-organization-name: #a2b8c3; /* Dark */
--picker-invited-by-label: #546e7a;  /* Light */
--picker-invited-by-label: #a2b8c3;  /* Dark */
```

---

## 10. Scrollbar Customizada

```css
ng-scrollbar {
  --scrollbar-size: 3px !important;
  --scrollbar-hover-size: 8px !important;
  --scrollbar-border-radius: 8px !important;
  --scrollbar-thumb-color: #03a9f4 !important;
  --scrollbar-thumb-hover-color: #0288d1 !important;
  --scrollbar-thumb-cursor: pointer;
}

ng-scrollbar:hover {
  --scrollbar-border-radius: 5px !important;
}
```

---

## 11. Spinner

```css
/* Default */
--ui-spinner-default-start-color: #FFF;
--ui-spinner-default-end-color: #FFF;

/* Dark */
--ui-spinner-default-start-color: transparent;
--ui-spinner-default-end-color: #B4C6D0;

/* Branded */
--ui-spinner-branded-start-color: #FFF;
--ui-spinner-branded-end-color: #03A9F4;
```

---

## 12. Comparação com Gerit Web

### 12.1 Variáveis Globais

| Propriedade | Clockfy Light | Gerit Web Light | Clockfy Dark | Gerit Web Dark |
|-------------|---------------|-----------------|--------------|----------------|
| Background | `#F2F6F8` | `hsl(0 0% 100%)` = `#FFFFFF` | `#0A0E10` | `hsl(222.2 84% 4.9%)` ≈ `#080D12` |
| Text | `#0A0E10` | `hsl(222.2 84% 4.9%)` ≈ `#080D12` | `#F2F6F8` | `hsl(210 40% 98%)` ≈ `#F8FAFB` |
| Primary | `#03A9F4` | `hsl(222.2 47.4% 11.2%)` ≈ `#162D50` | `#027DB6` | `hsl(210 40% 98%)` ≈ `#F8FAFB` |
| Focus outline | `#0015AF` | `hsl(222.2 84% 4.9%)` | `#B3BBFF` | `hsl(212.7 26.8% 83.9%)` |
| Border | `#E4EAEE` / `#C4D3DB` | `hsl(214.3 31.8% 91.4%)` ≈ `#DDE3EA` | `#12191D` | `hsl(217.2 32.6% 17.5%)` ≈ `#222937` |
| Muted text | `#75919F` / `#A2B8C3` | `hsl(215.4 16.3% 46.9%)` ≈ `#6B7A8D` | `#75919F` | `hsl(215 20.2% 65.1%)` ≈ `#94A3B8` |
| Destructive | `#BC3232` | `hsl(0 84.2% 60.2%)` ≈ `#E84855` | `#BC3232` | `hsl(0 62.8% 30.6%)` ≈ `#3D1010` |

### 12.2 Diferenças Principais

| Aspecto | Clockfy | Gerit Web | Impacto |
|---------|---------|-----------|---------|
| **Primary (light)** | Azul claro `#03A9F4` | Azul escuro `#162D50` | Alto — muda toda a identidade visual |
| **Primary (dark)** | Azul médio `#027DB6` | Branco `#F8FAFB` | Alto —.Clockfy mantém cor no dark |
| **Background light** | Cinza azulado `#F2F6F8` | Branco puro `#FFFFFF` | Médio — mais suave no Clockfy |
| **Background dark** | `#0A0E10` (quase preto) | `#080D12` (quase preto) | Baixo — muito similar |
| **Border radius** | 2px (legado) / 8px (novo) | 0.5rem = 8px | Baixo — compatível |
| **Font** | Roboto | Sistema (varia) | Médio —Clockfy usa Roboto |
| **Elevação** | Sistema de 5 níveis | shadcn/ui `--radius` | Alto —Clockfy mais granular |
| **Componentes** | UI lib própria (`ui-*`) | shadcn/ui + Radix | Alto — arquitetura diferente |

### 12.3 Paleta Compartilhada

Ambos usam:
- Azul como cor primária (tons diferentes)
- Verde para sucesso
- Vermelho para erro/destrutivo
- Laranja para avisos
- Cinza para muted/neutral
- Background escuro muito similar no dark mode

---

## 13. Mapa de Cores Completo por Uso

### 13.1 Fundos (Backgrounds)

| Uso | Light | Dark |
|-----|-------|------|
| Background global | `#F2F6F8` | `#0A0E10` |
| Background card/elevado | `#FFF` | `#253238` |
| Background intermediário | `#F8FAFB` | `#1D272B` |
| Background rebaixado | `#F2F6F8` | `#12191D` |
| Background overlay | `#FFF` | `#324148` |
| Background input | `#F8FAFB` | `#253238` |
| Background hover | `#E8EFF3` | `#1D272B` |
| Background active | `#E1E9EF` | `#0A0E10` |
| Background disabled | `#F8FAFB` | `#1D272B` |

### 13.2 Texto

| Uso | Light | Dark |
|-----|-------|------|
| Texto primário | `#0A0E10` | `#F2F6F8` |
| Texto secundário | `#546E7A` | `#A2B8C3` |
| Texto muted | `#75919F` | `#75919F` |
| Texto disabled | `#75919F` | `#75919F` |
| Texto em fundo escuro | `#FFF` | `#000` |
| Texto erro | `#BC3232` | `#DE8282` |

### 13.3 Bordas

| Uso | Light | Dark |
|-----|-------|------|
| Borda primária | `#E4EAEE` | `#12191D` |
| Borda secundária | `#C4D3DB` | `#37474F` |
| Borda input | `#75919F` | `#75919F` |
| Borda focus | `#B3BBFF` | `#B3BBFF` |
| Borda disabled | `#D7E2EA` | `#455A64` |
| Borda erro | `#DE8282` | `#BC3232` |

### 13.4 Estados de Interação

| Estado | Light | Dark |
|--------|-------|------|
| Hover background | `#E8EFF3` | `#1D272B` |
| Active background | `#E1E9EF` | `#0A0E10` |
| Focus outline | `#0015AF` | `#B3BBFF` |
| Disabled background | `#F8FAFB` | `#1D272B` |
| Disabled text | `#75919F` | `#75919F` |

### 13.5 Cores de Status

| Status | Light BG | Light Text | Dark BG | Dark Text |
|--------|----------|------------|---------|-----------|
| Success | `#E2E8D3` | `#3B4620` | `#3B4620` | `#596D26` |
| Error | `#FFD1D1` | `#BC3232` | `#581818` | `#BC3232` |
| Warning | `#FFECB3` | `#856400` | `#664D00` | `#856400` |
| Info | `#DEF4FF` | `#026897` | `#013E5B` | `#026897` |

---

## 14. Recomendações de Implementação para Gerit Web

### 14.1 Prioridade Alta

1. **Mapear variáveis CSS do Clockfy para globals.css do Gerit**
   - Adicionar variáveis `--ui-*` do Clockfy no `:root` e `.dark`
   - Manter compatibilidade com o sistema HSL do shadcn/ui
   - Criar variáveis de ponte entre os dois sistemas

2. **Ajustar cores primárias**
   - Gerit usa azul escuro (`#162D50`) como primary
   - Clockfy usa azul claro (`#03A9F4`)
   - Definir qual paleta será a referência

3. **Implementar sistema de elevação**
   - Adicionar variáveis de elevação (sunken, default, raised, overlay, prominent)
   - Mapear para componentes shadcn/ui existentes

### 14.2 Prioridade Média

4. **Alinhar border-radius**
   - Clockfy: 2px (legado) / 8px (novo design)
   - Gerit: 8px (`--radius: 0.5rem`)
   - Decidir se adopta 8px uniformemente

5. **Padronizar fontes**
   - Clockfy: Roboto
   - Gerit: Sistema
   - Considerar usar Roboto para consistência visual

6. **Implementar scrollbar customizada**
   - Adicionar estilos de scrollbar do Clockfy

### 14.3 Prioridade Baixa

7. **Adicionar animações**
   - `gerit-enter` já existe
   - Considerar adicionar transições do Clockfy

8. **Documentar paleta completa**
   - Criar arquivo de referência de cores
   - Documentar todas as variáveis para developers

---

## 15. Total de Variáveis CSS Mapeadas

| Categoria | Quantidade |
|-----------|------------|
| Cores globais | 15 |
| Botões (6 tipos × 2 themes) | ~70 |
| Inputs | ~12 |
| Checkbox | ~10 |
| Radio | ~12 |
| Switch | ~24 |
| Modal | 4 |
| Drawer | 4 |
| Dropdown | 6 |
| Popover | ~22 |
| Alert | ~10 |
| Banner | 6 |
| Toast | 8 |
| Tooltip | 4 |
| Chip/Tag | ~30 |
| Date Picker | ~14 |
| Month Picker | 4 |
| Progress Bar | 4 |
| Incrementer | ~14 |
| Elevation System | ~40 |
| Auth | ~40 |
| Avatar | 10 |
| Spinner | 6 |
| **Total** | **~400+** |

---

## 16. Notas Técnicas

### Ativação do Dark Mode

O Clockfy detecta o tema preferido do sistema e permite toggle manual:

```javascript
const isDarkMode = (() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user?.settings?.darkTheme != null) return user?.settings?.darkTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
})();
if (isDarkMode) {
    document.documentElement.classList.add('dark');
}
```

### Novo Design vs Legado

Clockfy possui duas versões visual:
- **Legado:** border-radius 2px, fundos mais sólidos
- **Novo design (`body.new-design`):** border-radius 8px, fundos mais suaves (`#f2f6f8`)

### Estrutura de Classes CSS

```
.ui-theme__light { ... }  /* Variáveis light */
.ui-theme__dark { ... }   /* Variáveis dark */
.ui-button { ... }        /* Componentes */
.ui-input { ... }
.ui-checkbox { ... }
```

---

*Relatório gerado automaticamente em 2026-06-07*  
*Total de variáveis CSS mapeadas: ~400+*  
*Fonte: styles-NUCBP5CG.css (841KB)*
