# REGRAS DO PROJETO — nikkeybox-store.com

> Único arquivo de regras (consolidado). Substitui o antigo `.clinerules.legacy`.
> **Recarregado a cada nova sessão do Cline.**

## 1. PERFIL & ORÇAMENTO DE TOKENS
- **Usuário:** Não-programador, dono da loja nikkeybox-store.com.
- **Agente Core:** GLM 5.2 via Z.ai (1M Context Window).
- **Prioridade de tokens:** Alta sensibilidade ao acúmulo em loops longos. O usuário roda tarefas no piloto automático, então o agente deve economizar tokens por conta própria, sem resets manuais da janela.

## 2. CONSERVAÇÃO DE TOKENS (CRÍTICO)
1. **Sem leituras redundantes:** Antes de ler um arquivo, verifique se já tem o conteúdo completo no histórico da conversa. Não leia o mesmo arquivo duas vezes na mesma sessão.
2. **Operações atômicas:** Quebre tarefas em pequenos passos lógicos. Não rode loops multi-arquivo se o objetivo cabe num único arquivo.
3. **Sem reescrever arquivos inteiros:** Produza *apenas* os blocos/linhas que mudam (diffs). Nunca reescreva um arquivo de 500 linhas para trocar 2 linhas.
4. **Parar e pedir direção:** Se um loop de debug/geração falhar mais de 3 iterações seguidas, PARE, resuma o bloqueio em 1–2 frases e peça orientação antes de gastar mais tokens.

## 3. PADRÕES DE DESENVOLVIMENTO
- **Site-alvo:** nikkeybox-store.com (e-commerce de produtos japoneses importados para o Brasil, sob regras de Remessa Conforme).
- **Integridade do código:** Todo HTML, CSS e JS deve permanecer leve, de carregamento rápido e moderno.
- **Verificação:** Sempre explicar o que foi alterado em português claro e não-técnico após uma edição, para que o usuário teste facilmente no ambiente ao vivo.

## 4. VERSIONAMENTO COM GIT — OBRIGATÓRIO E IMEDIATO
- **Commit + push a cada alteração concluída:** Assim que terminar e validar qualquer edição (código, config ou conteúdo), execute na hora `git add` → `git commit` → `git push`. Sem exceções, sem deixar para depois, sem acumular.
- **Um commit por alteração concluída:** Nunca encerre uma tarefa com mudanças pendentes no working tree.
- **Mensagens de commit:** Curtas e em português, descrevendo o que mudou (ex.: "ajusta espaçamento do header", "corrige bug do orçamento no KimiClaw").
- **Ordem:** `git add` → `git commit -m "..."` → `git push`. Confirmar que o push foi concluído antes de considerar a tarefa finalizada.
