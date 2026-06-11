## Descrição

Como **usuário do sistema Gerit**, quero que o fundo dos formulários (seções de edição/detalhe) tenha **15% menos luminosidade/saturação** em relação ao fundo dos inputs, textareas e selects, para que **a leitura e o preenchimento dos campos sejam mais confortáveis**, especialmente no tema dark.

Atualmente, a tela de detalhes de clientes apresenta baixo contraste entre o fundo do formulário e os campos de entrada no tema dark, dificultando a identificação visual de cada campo.

## Classificação

- **Tipo:** improvement
- **Prioridade:** Média
- **Severidade:** Não aplicável
- **Complexidade sugerida pelo PO:** Baixa
- **Developer provável:** developer-junior
- **Motivo da complexidade:** alteração puramente visual em variáveis CSS globais (--card), sem lógica de negócio, sem nova API, sem impacto arquitetural e sem risco de regressão funcional. Ajuste localizado em um único arquivo (app/globals.css).

## Contexto

A tela de detalhes de clientes (domains/operations/clients/clients-details.tsx) utiliza containers com bg-card e dark:bg-card como fundo dos formulários (seções de Individual, Empresa, Contactos e Endereços). Os inputs, textareas e selects, por sua vez, usam bg-input / dark:bg-input definidos via variáveis CSS --input.

Atualmente no tema **dark**:

- `--card` (fundo do formulário): hsl(210 20% 11%)
- `--input` (fundo dos campos): hsl(210 20% 19%)

A diferença de luminosidade de 8 pontos percentuais é insuficiente para destacar visualmente os campos de entrada, causando cansaço visual e dificuldade de leitura.

No tema **light**:

- `--card` (fundo do formulário): hsl(0 0% 100%) (branco puro)
- `--input` (fundo dos campos): hsl(208 20% 93%)

O formulário já é mais claro que os inputs no tema light, mas o ajuste de 15% tornará a diferença ainda mais perceptível e confortável.

## Objetivo da Interface

O usuário deve perceber claramente a diferença visual entre o fundo do formulário (container da seção) e o fundo dos campos de entrada, em ambos os temas (light e dark), sem perda de contraste ou acessibilidade.

- **Tema dark:** fundo do formulário mais escuro que o fundo dos inputs (inputs destacam-se como áreas claras)
- **Tema light:** fundo do formulário mais claro que o fundo dos inputs (inputs aparecem como áreas ligeiramente mais escuras)
- Contraste de ~15% na luminosidade entre as duas superfícies

## Critérios de Aceite

- [ ] A variável CSS `--card` em `:root` (tema light) deve ter o valor de luminosidade ajustado para ficar aproximadamente 15% mais clara que `--input`, mantendo branco puro ou tom muito claro
- [ ] A variável CSS `--card` em `.dark` (tema dark) deve ter o valor de luminosidade ajustado para ficar aproximadamente 15% mais escura que `--input`, reduzindo a luminosidade atual
- [ ] A alteração deve ser feita exclusivamente no arquivo app/globals.css, ajustando as variáveis CSS --card e, se necessário, --card-foreground para manter contraste de texto WCAG AA
- [ ] O contraste entre --card e --card-foreground deve manter-se dentro dos padrões WCAG AA (4.5:1 para texto normal)
- [ ] Todos os formulários que usam bg-card (seções de cliente, contactos, endereços) devem refletir a melhoria visual
- [ ] A alteração não deve quebrar build, lint ou typecheck do projeto
- [ ] A alteração não deve impactar a legibilidade de elementos que usam bg-card em outras partes do sistema

## Cenário de Sucesso

**Dado que** o usuário acessa a tela de detalhes de um cliente no tema dark  
**Quando** a seção de formulário é renderizada  
**Então** o fundo do formulário deve ser visivelmente mais escuro que o fundo dos inputs, textareas e selects, facilitando a distinção visual dos campos editáveis

## Cenário de Insucesso

**Dado que** a variável --card foi alterada  
**Quando** o usuário alterna entre temas light e dark  
**Então** o contraste entre o fundo do formulário e os campos deve ser consistente e não causar perda de legibilidade

## Cenários de Borda

- **Responsividade:** a alteração é puramente CSS via variáveis HSL, portanto responsiva por natureza
- **Tema personalizado:** se o usuário tiver preferência por tema não-padrão, a alteração respeita os seletores :root e .dark
- **Alto contraste:** a alteração não interfere em prefers-contrast: more; manter comportamento atual do sistema
- **Reduced motion:** sem impacto, pois a alteração é estática (cores)

## Impacto Frontend

- **Arquivo alterado:** app/globals.css (variáveis --card e --card-foreground nos seletores :root e .dark)
- **Estilos globais:** sim — afeta todo componente que usa bg-card / dark:bg-card (shadcn/ui Card, seções de formulário, etc.)
- **Nenhum componente, hook, service, rota ou lógica alterada**
- **Nenhuma dependência nova**
- **Risco de regressão visual:** baixo — a alteração é apenas em luminosidade, mantendo matiz e saturação consistentes com a paleta atual

## Contrato de API

- **Dependência pendente:** Não aplicável (alteração puramente CSS, sem API)

## UI/UX Esperado

- **Tema light fundo do formulário:** branco puro ou levemente mais claro que o fundo dos inputs (--input: hsl(208 20% 93%))
- **Tema dark fundo do formulário:** tom mais escuro que o fundo dos inputs (--input: hsl(210 20% 19%)). Sugestão: aproximadamente hsl(210 20% 8%)
- **Contraste texto/fundo:** --card-foreground deve ser ajustado proporcionalmente para manter taxa de contraste >= 4.5:1
- **Feedback ao usuário:** melhoria visual imediata sem necessidade de notificação

## Definition of Ready

- [x] Requisitos de negócio claros
- [x] Critérios de aceite objetivos
- [x] Cenários de sucesso, insucesso e borda definidos
- [x] Contrato de API conhecido ou dependência documentada (não aplicável)
- [x] Impacto em rotas/componentes identificado (apenas globals.css)
- [x] Regras de UI/UX descritas
- [x] Prioridade definida
- [x] Severidade definida (não aplicável)
- [x] Complexidade sugerida pelo PO definida
- [x] Sem bloqueios para o Developer iniciar

## Labels sugeridas

improvement, frontend, ui, css, priority:medium, complexity:low
