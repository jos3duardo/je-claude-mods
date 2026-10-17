import type { Register } from 'claude-code'

import { registerAgentSquad } from './agent-squad.tsx'
import { registerFileTree } from './file-tree.tsx'
import { registerTaskProgress } from './task-progress.tsx'

export const register: Register = (on, options) => {
  // Um plugin só aceita um session.start sem matcher: os comandos dos três mods nascem aqui
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agentes',
      description: 'Abre o painel com o progresso dos subagentes',
    })
    await $.command.register({
      name: 'arvore',
      description: 'Abre o painel com a árvore de arquivos do projeto',
    })

    return next(e)
  })

  registerTaskProgress(on, options)
  registerAgentSquad(on, options)
  registerFileTree(on, options)
}
