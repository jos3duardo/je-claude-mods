# je-mods

Mods pessoais do Claude Code, num plugin só:

- **Progresso das tarefas**: barra acima do prompt com o andamento do `TodoWrite`/`TaskCreate`.
- **Subagentes** (`/agentes`): painel com cada subagente, um robô em pixel art animado por agente (corpo na cor da família do modelo), modelo usado, ferramentas e tempo.
- **Árvore de arquivos** (`/arvore`): painel com a árvore do diretório da sessão; Enter numa pasta abre/fecha, num arquivo insere `@caminho` no prompt; `●` marca o que o agente editou.

## Instalação (outra máquina)

O repositório é privado: a máquina precisa ter a chave SSH com acesso ao Gitea. Na prompt de uma sessão do Claude Code:

```
/plugin install je-mods --marketplace ssh://git@git-ssh.jos3duardo.com.br:222/jos3duardo/je-claude-mods.git
```

Responder `y` para adicionar o marketplace e escolher o escopo (user, o primeiro, vale para toda sessão). Pelo terminal, o equivalente é:

```bash
claude plugin marketplace add ssh://git@git-ssh.jos3duardo.com.br:222/jos3duardo/je-claude-mods.git
claude plugin install je-mods@je-claude-mods
```

Instalado assim, roda a cópia do commit instalado: para pegar mudança nova, `claude plugin update je-mods@je-claude-mods` e depois `/reload-plugins`.

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
