import { expect, test } from 'claude-code/testing'

const FS: Record<string, { name: string; kind: 'file' | 'dir' }[]> = {
  '/proj': [
    { name: 'src', kind: 'dir' },
    { name: 'node_modules', kind: 'dir' },
    { name: 'README.md', kind: 'file' },
  ],
  '/proj/src': [{ name: 'main.ts', kind: 'file' }],
}

test('expande pasta, ignora node_modules e marca arquivo editado', async ($, on) => {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.list', ($, e) => ({
    value: (FS[e.path ?? '/proj'] ?? []).map(x => ({ ...x, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('tool.call', () => ({ result: {} }))

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'file-tree',
    props: { bodyColumns: 40 },
  })
  expect(await ui.find({ key: 'node_modules' })).toBeUndefined()
  expect(await ui.find({ key: 'src/main.ts' })).toBeUndefined()

  await ui.press({ key: 'src' })
  expect(await ui.find({ key: 'src/main.ts' })).toBeDefined()

  await $.tool.call({ tool: 'Write', file_path: '/proj/src/main.ts', content: 'x' })
  expect(await ui.find({ text: ' ●' })).toBeDefined()
})

test('clicar num arquivo abre o preview paginado com @ para mencionar', async ($, on) => {
  const lines = Array.from({ length: 100 }, (_, i) => `const linha${i + 1} = ${i + 1}`)
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.list', ($, e) => ({
    value: (FS[e.path ?? '/proj'] ?? []).map(x => ({ ...x, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.stat', () => ({ value: { kind: 'file', size: 2000, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: lines.join('\n') }))
  on('prompt.fill', () => ({ value: { isFilled: true } }))

  const ui = await $.ui.mount({
    plugin: 'je-mods',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'file-tree',
    props: { bodyColumns: 100, scroll: { offset: 0, bodyRows: 24 } },
  })
  await ui.press({ key: 'README.md' })
  expect(await ui.find({ key: 'close-preview' })).toBeDefined()
  expect(await ui.find({ text: ' 1–20/100 ' })).toBeDefined()

  await ui.press({ key: 'page-down' })
  expect(await ui.find({ text: ' 21–40/100 ' })).toBeDefined()

  await ui.press({ key: 'close-preview' })
  expect(await ui.find({ key: 'close-preview' })).toBeUndefined()
})
