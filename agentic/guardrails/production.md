# Guardrails de produção

Produção é somente leitura para goals funcionais. Não altere VPS, Cloudflare, Traefik, containers, imagens em produção, banco, GitHub Environments ou secrets; não inicie deploy. O fluxo de branch não promove para `main`. Um goal explícito de infraestrutura precisa de política e validações próprias e ainda para antes de merge/deploy.
