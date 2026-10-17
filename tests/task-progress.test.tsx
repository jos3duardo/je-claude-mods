import { expect, mock, test } from 'claude-code/testing'

test('mostra o progresso do TodoWrite acima do prompt', async ($, on) => {
  on('tool.call', () => ({ result: {} }))

  await $.tool.call({
    tool: 'TodoWrite',
    todos: [
      { content: 'A', status: 'completed', activeForm: 'Fazendo A' },
      { content: 'B', status: 'in_progress', activeForm: 'Fazendo B' },
      { content: 'C', status: 'pending', activeForm: 'Fazendo C' },
    ],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'je-mods',
      surface,
      component: 'AbovePrompt',
      props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80 },
    })
    expect(await ui.find({ text: ' 1/3' })).toBeDefined()
    expect(await ui.find({ text: ' ▶ Fazendo B' })).toBeDefined()
    await ui.unmount()
  }
})

test('sem todos, mostra o progresso do turno e o fechamento', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => ({ result: {} }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  await $.prompt.submit({ text: 'oi' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(3000)

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 80 },
  })
  expect(await ui.find({ text: '⏳ 3s' })).toBeDefined()
  expect(await ui.find({ text: ' · ⚒ 1 ferramentas' })).toBeDefined()

  await $.turn.complete({ answer: 'ok', durationMs: 3000, isAborted: false, reason: 'answer', turnId: 't' } as never)
  expect(await ui.find({ text: '✓ concluído em 3s' })).toBeDefined()
})
