import { expect, mock, test } from 'claude-code/testing'

// Cada cena sai como "DUMP <nome> <colunas> <árvore em JSON>"; scripts/render_preview.py vira imagem.
// A largura vai junto para o render desenhar com o mesmo bodyColumns que o mod recebeu.
const dump = (name: string, cols: number, tree: unknown) => console.log(`DUMP ${name} ${cols} ${JSON.stringify(tree)}`)

test('agentes', async ($, on) => {
  const spawns = [
    ['a-opus', 'claude-opus-5-5', 'Revisar o módulo de autenticação', 'general-purpose'],
    ['b-sonnet', 'claude-sonnet-5-5', 'Mapear as consultas do painel', 'Explore'],
    ['c-haiku', 'claude-haiku-5-5', 'Atualizar dependências do projeto', 'general-purpose'],
    // Id antigo e datado, para o rótulo mostrar outra versão (Sonnet 4.5)
    ['d-fail', 'claude-sonnet-4-5-20250929', 'Rodar a migração no staging', 'general-purpose'],
  ]
  let i = 0
  on('agent.spawn', () => ({ model: spawns[i]![1]!, agentId: spawns[i++]![0]! }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const clock = mock.clock(on, { now: 0 })
  for (const [, , description, subagentType] of spawns) {
    await $.agent.spawn({ prompt: 'x', description: description!, subagentType: subagentType! })
  }
  const tools: [string, string, number][] = [['a-opus', 'Read', 14], ['b-sonnet', 'Grep', 9], ['c-haiku', 'Bash', 6], ['d-fail', 'Bash', 3]]
  for (const [agentId, tool, n] of tools) {
    for (let k = 0; k < n; k++) await $.tool.call({ tool, agentId } as never)
  }
  await clock.advance(52_000)
  await $.turn.complete({ agentId: 'c-haiku', answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't' } as never)
  await clock.advance(9_000)
  await $.turn.complete({ agentId: 'd-fail', answer: '', durationMs: 1, isAborted: true, reason: 'answer', turnId: 't' } as never)
  await clock.advance(23_000)
  const cols = 64
  const ui = await $.ui.mount({ plugin: 'je-mods', surface: 'terminal', component: 'Pane', requestId: 'agent-squad', props: { bodyColumns: cols } })
  for (let f = 0; f < 28; f++) {
    dump(`agentes-${f}`, cols, await ui.drawn())
    await clock.advance(400)
  }
  expect(1).toBe(1)
})

test('tarefas', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'Ler o schema do banco', status: 'completed', activeForm: 'Lendo o schema do banco' },
      { content: 'Escrever as consultas', status: 'completed', activeForm: 'Escrevendo as consultas' },
      { content: 'Montar a tela do painel', status: 'in_progress', activeForm: 'Montando a tela do painel' },
      { content: 'Rodar os testes', status: 'pending', activeForm: 'Rodando os testes' },
      { content: 'Revisar a entrega', status: 'pending', activeForm: 'Revisando a entrega' },
    ],
  } as never)
  const cols = 80
  const ui = await $.ui.mount({ plugin: 'je-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: cols } })
  dump('tarefas', cols, await ui.drawn())
  expect(1).toBe(1)
})

const FS: Record<string, { name: string; kind: 'file' | 'dir' }[]> = {
  '/proj': [
    { name: 'src', kind: 'dir' },
    { name: 'tests', kind: 'dir' },
    { name: 'package.json', kind: 'file' },
    { name: 'README.md', kind: 'file' },
  ],
  '/proj/src': [
    { name: 'lib', kind: 'dir' },
    { name: 'app.ts', kind: 'file' },
    { name: 'server.ts', kind: 'file' },
  ],
  '/proj/src/lib': [
    { name: 'db.ts', kind: 'file' },
    { name: 'auth.ts', kind: 'file' },
  ],
}

const SOURCE = `import { Pool } from 'pg'

// Pool só-leitura apontando para a réplica
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 15_000,
  max: 5,
})

export async function query<T>(sql: string, params: unknown[] = []) {
  const { rows } = await pool.query(sql, params)
  return rows as T[]
}`

test('arvore', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.list', ($, e) => ({ value: (FS[e.path ?? '/proj'] ?? []).map(x => ({ ...x, size: 0, mtimeMs: 0, isLink: false })) }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 400, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: SOURCE }))
  on('tool.call', () => ({ result: {} }))
  const cols = 96
  const ui = await $.ui.mount({ plugin: 'je-mods', surface: 'terminal', component: 'Pane', requestId: 'file-tree', props: { bodyColumns: cols, scroll: { offset: 0, bodyRows: 18 } } })
  await ui.press({ key: 'src' })
  await ui.press({ key: 'src/lib' })
  await $.tool.call({ tool: 'Edit', file_path: '/proj/src/lib/auth.ts', old_string: 'a', new_string: 'b' } as never)
  await ui.press({ key: 'src/lib/db.ts' })
  dump('arvore', cols, await ui.drawn())
  expect(1).toBe(1)
})
