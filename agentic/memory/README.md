# Integração ai-memory

Discovery local encontrou ai-memory `2.1.1` via imagem `akitaonrails/ai-memory:2.1.1`, servido em HTTP MCP stateless no endpoint `/mcp` (porta host `127.0.0.1:49374`). A instância local estava parada, com volume Docker persistente `/data`, health `unhealthy` e exit code 137. Ela não foi iniciada nem alterada.

`.codex/config.toml` registra o MCP nativo do Codex usando `http://127.0.0.1:49374/mcp`. O CLI local suporta bearer token por `bearer_token_env_var`; se a instância exigir auth, forneça `AI_MEMORY_AUTH_TOKEN` no ambiente privado do usuário. O valor não pertence ao repositório. Não há bearer token embutido no snippet de configuração da instância inspecionada.

O servidor estava parado durante o discovery, portanto não foi possível listar as ferramentas MCP realmente anunciadas por esta instância. Use somente ferramentas verificadas na conexão ativa. A abstração lógica é health → ferramenta de status; search → ferramenta de consulta; store → ferramenta de escrita durável de páginas. Não codifique nomes ou parâmetros até o MCP local anunciá-los. MCP é a interface deste fluxo; não invente endpoints REST.

O health depende do servidor estar rodando; este projeto não o inicia automaticamente. A configuração do volume não deve ser alterada pelo runner. Se MCP estiver ausente ou indisponível, registre `MEMORY_UNAVAILABLE` e use state/plano/journal locais. Nunca grave credenciais, tokens, JWT, cookies, connection strings ou PII desnecessária.
