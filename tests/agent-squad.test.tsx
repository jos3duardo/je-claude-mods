import { expect, mock, test } from 'claude-code/testing'

test('lista o subagente com a barra de progresso', async ($, on) => {
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  mock.clock(on, { now: 1000 })

  await $.agent.spawn({ prompt: 'x', description: 'Revisar código', subagentType: 'Explore' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'je-mods',
      surface,
      component: 'Pane',
      requestId: 'agent-squad',
      props: { bodyColumns: 50 },
    })
    expect(await ui.find({ text: 'Revisar código' })).toBeDefined()
    expect(await ui.find({ text: ' 0/1 concluídos' })).toBeDefined()
    await ui.unmount()
  }
})

test('termina pronto, com robô verde parado e tempo decorrido', async ($, on) => {
  on('agent.spawn', () => ({ model: 'sonnet', agentId: 'a2' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const clock = mock.clock(on, { now: 0 })

  await $.agent.spawn({ prompt: 'x', description: 'Testes', subagentType: 'general-purpose' })
  await clock.advance(42_000)
  await $.turn.complete({ agentId: 'a2', answer: 'ok', durationMs: 42_000, isAborted: false, reason: 'answer', turnId: 't' } as never)

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-squad',
    props: { bodyColumns: 50 },
  })
  expect(await ui.find({ text: '✓ pronto' })).toBeDefined()
  const sprite = async () => JSON.stringify((await ui.findAll({ type: 'Text', text: /^[▀▄█ ]+$/ })).map(pixel => pixel.props))
  const before = await sprite()
  expect(before).toContain('#22c55e')
  await clock.advance(4000)
  expect(await sprite()).toBe(before)
  expect(await ui.find({ text: 'Sonnet' })).toBeDefined()
  expect(await ui.find({ text: ' 1/1 concluídos' })).toBeDefined()
})

test('mostra a versão do modelo e o robô anima enquanto trabalha', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a3' }))
  const clock = mock.clock(on, { now: 0 })

  await $.agent.spawn({ prompt: 'x', description: 'Implementar', subagentType: 'general-purpose' })

  const mount = () =>
    $.ui.mount({
      plugin: 'je-mods',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'agent-squad',
      props: { bodyColumns: 50 },
    })
  const first = await mount()
  expect(await first.find({ text: 'Opus 5.5' })).toBeDefined()
  const sprite = async (ui: Awaited<ReturnType<typeof mount>>) =>
    JSON.stringify((await ui.findAll({ type: 'Text', text: /^[▀▄█ ]+$/ })).map(pixel => pixel.props))
  const before = await sprite(first)
  expect(before).toContain('#')
  await first.unmount()

  await clock.advance(400)
  const second = await mount()
  const after = await sprite(second)
  expect(after).not.toBe(before)
})

test('a animação tem um timer só e para quando o subagente termina', async ($, on) => {
  let agent = 0
  on('agent.spawn', () => ({ model: 'claude-3-5-sonnet-20241022', agentId: `b${++agent}` }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  const frames: unknown[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'frame') frames.push(e.value)
    return next(e)
  })
  const clock = mock.clock(on, { now: 0 })

  await $.agent.spawn({ prompt: 'x', description: 'Um', subagentType: 'Explore' })
  await $.agent.spawn({ prompt: 'x', description: 'Dois', subagentType: 'Explore' })
  await clock.advance(4000)
  expect(frames.length).toBe(10)

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-squad',
    props: { bodyColumns: 50 },
  })
  expect(await ui.find({ text: 'Sonnet 3.5' })).toBeDefined()
  await ui.unmount()

  for (const agentId of ['b1', 'b2']) {
    await $.turn.complete({ agentId, answer: 'ok', durationMs: 1, isAborted: false, reason: 'answer', turnId: 't' } as never)
  }
  await clock.advance(400)
  const stopped = frames.length
  await clock.advance(4000)
  expect(frames.length).toBe(stopped)
})

test('falha com olhos vermelhos', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'c1' }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  mock.clock(on, { now: 0 })

  await $.agent.spawn({ prompt: 'x', description: 'Quebra', subagentType: 'Explore' })
  await $.turn.complete({ agentId: 'c1', answer: '', durationMs: 1, isAborted: true, reason: 'answer', turnId: 't' } as never)

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'agent-squad',
    props: { bodyColumns: 50 },
  })
  expect(await ui.find({ text: '✗ falhou' })).toBeDefined()
  const pixels = JSON.stringify((await ui.findAll({ type: 'Text', text: /^[▀▄█ ]+$/ })).map(pixel => pixel.props))
  expect(pixels).toContain('#ef4444')
})

// Mesmo hash do módulo: monta ids que caem na mesma pele e no mesmo nome, para a regra ter o que desviar
const hash = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

test('cada agente no painel tem cor e nome astronômico próprios', async ($, on) => {
  // 12 ids com o mesmo hash % 12 (pele) e % 40 (nome): sem a regra, todos sairiam iguais
  const first = hash('d0')
  const ids = ['d0']
  for (let i = 1; ids.length < 12; i++) {
    const h = hash(`d${i}`)
    if (h % 12 === first % 12 && h % 40 === first % 40) ids.push(`d${i}`)
  }
  let next = 0
  on('agent.spawn', () => ({ model: 'sonnet', agentId: ids[next++]! }))
  let saved: { skin?: number; name?: string }[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'agents') saved = e.value as typeof saved
    return next(e)
  })
  mock.clock(on, { now: 0 })

  for (let i = 0; i < 12; i++) {
    await $.agent.spawn({ prompt: 'x', description: `Tarefa ${i}`, subagentType: 'Explore' })
  }

  expect(saved).toHaveLength(12)
  expect(new Set(saved.map(one => one.skin)).size).toBe(12)
  expect(new Set(saved.map(one => one.name)).size).toBe(12)
})
