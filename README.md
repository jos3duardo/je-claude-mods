# je-mods

Mods pessoais do Claude Code, num plugin só:

- **Progresso das tarefas**: barra acima do prompt com o andamento do `TodoWrite`/`TaskCreate`.
- **Subagentes** (`/agentes`): painel com cada subagente, um avatar determinístico por agente, ferramentas usadas e tempo.
- **Árvore de arquivos** (`/arvore`): painel com a árvore do diretório da sessão; Enter numa pasta abre/fecha, num arquivo insere `@caminho` no prompt; `●` marca o que o agente editou.

## Instalação (nesta máquina)

```bash
claude plugin marketplace add ~/projetos/je-claude-mods
claude plugin install je-mods@je-claude-mods
```

O marketplace é a própria pasta: editar aqui e rodar `/reload-plugins` numa sessão aberta já aplica, sem reinstalar.

## Desenvolvimento

```bash
claude plugin validate ~/projetos/je-claude-mods
claude plugin test ~/projetos/je-claude-mods
```
