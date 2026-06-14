# Relatório de QA — Issue #79: Silent Token Refresh

- **Data:** 2026-06-09
- **Branch:** `fix/issue-79-silent-token-refresh`
- **PR:** [#80](https://github.com/vianahub-pt/VianaHub.Global.Gerit.Web/pull/80)
- **Resultado:** APROVADO

---

## 1. Validação do Código Core (`platform/auth/auth-context.tsx`)

### 1.1 `fetchWithAuth` retorna `null` em vez de `throw` em 401 pós-refresh

**Status:** ✅ OK

- `auth-context.tsx:531-548`: Quando `response.status === 401` após o primeiro fetch, `refreshSession()` é chamado. Se `renewedSession` for `null`, retorna `null` (linha 538-539).
- Se o segundo fetch também retorna 401, `signOutAndRedirect()` é chamado e retorna `null` (linhas 546-548).
- Nenhum `throw new Error` é executado na path de 401 silencioso.

### 1.2 Buffer de refresh proativo = 60s

**Status:** ✅ OK

- `auth-context.tsx:21`: `ACCESS_TOKEN_REFRESH_BUFFER_MS = 60000` (60 segundos).
- `auth-context.tsx:218-222`: `isAccessTokenExpiring()` usa o buffer corretamente.

### 1.3 Deduplicação via `refreshPromiseRef`

**Status:** ✅ OK

- `auth-context.tsx:324`: `refreshPromiseRef` declarado como `useRef`.
- `auth-context.tsx:445-446`: Se `refreshPromiseRef.current` já existe, retorna a promise existente (deduplicação).
- `auth-context.tsx:480`: `refreshPromiseRef.current = null` no `finally` block.

---

## 2. Validação dos Call Sites (12 arquivos do diff)

Todos os call sites de `fetchWithAuth` que atribuem resultado a `const response` possuem `if (!response) return;` imediatamente após a chamada.

| Arquivo | Call Sites | Null Guards | Status |
|---------|-----------|-------------|--------|
| `clients-page.tsx` | 4 | 4 | ✅ |
| `clients-create.tsx` | 1 | 1 | ✅ |
| `clients-details.tsx` | 14 | 14 | ✅ |
| `users-page.tsx` | 5 | 5 | ✅ |
| `vehicles-page.tsx` | 5 | 5 | ✅ |
| `teams-page.tsx` | 5 | 5 | ✅ |
| `roles-page.tsx` | 5 | 5 | ✅ |
| `equipments-page.tsx` | 5 | 5 | ✅ |
| `team-members-page.tsx` | 5 | 5 | ✅ |
| `use-user-preferences.ts` | 3 | 3 | ✅ |
| `subscription-context.tsx` | 0 | N/A | ✅ |
| `clients-form-components.tsx` | 0 | N/A | ✅ |

**Total:** 52 call sites, 52 null guards.

---

## 3. Validações Técnicas

| Check | Resultado |
|-------|-----------|
| `npm run lint` | ✅ Sem warnings ou errors |
| `npx tsc --project tsconfig.typecheck.json --noEmit` | ✅ Sem erros de tipo |

---

## 4. Conclusão

Todas as mudanças estão corretas e aderentes ao escopo da issue:

1. `fetchWithAuth` agora retorna `null` silenciosamente em caso de falha de refresh (401 pós-refresh), evitando erros indesejados no console e comportamento inesperado.
2. O buffer de refresh proativo foi aumentado de 30s para 60s, reduzindo a probabilidade de requests durante transição de token.
3. A deduplicação de refresh via `refreshPromiseRef` continua funcionando corretamente.
4. Todos os 52 call sites de `fetchWithAuth` nos 12 arquivos do diff possuem o null guard adequado.
5. Lint e TypeScript passam sem erros.

**APROVADO**
