import { atom, read, update } from 'claude-code'
import type { EngineInterface, FsEntry, Register } from 'claude-code'

const PANE = 'file-tree'
const TITLE = 'Arquivos'
const MAX_ROWS = 400
const IGNORE = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'target', '.cache', 'coverage',
])

const expanded = atom({ plugin: 'je-mods', key: 'expanded' } as const, [])
const touched = atom({ plugin: 'je-mods', key: 'touched' } as const, [])
const tick = atom({ plugin: 'je-mods', key: 'tick' } as const, 0)
const selected = atom({ plugin: 'je-mods', key: 'selected' } as const, null)
const previewTop = atom({ plugin: 'je-mods', key: 'previewTop' } as const, 0)

const MAX_PREVIEW_BYTES = 1024 * 1024
const WIDE_LAYOUT = 70

type Preview = { lines: string[] } | { notice: string }

// Lê o arquivo para o preview; binário e arquivo grande viram aviso
async function loadPreview($: EngineInterface, absolute: string): Promise<Preview> {
  const stat = await $.fs.stat(absolute).catch(() => undefined)
  if (!stat) return { notice: 'arquivo não encontrado' }
  if (stat.size > MAX_PREVIEW_BYTES) return { notice: `arquivo grande demais (${Math.round(stat.size / 1024)} KB)` }
  const text = await $.fs.read(absolute).catch(() => undefined)
  if (text === undefined) return { notice: 'não foi possível ler' }
  if (text.includes('\u0000')) return { notice: 'arquivo binário' }

  return { lines: text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').split('\n') }
}

type Row = { path: string; name: string; depth: number; kind: FsEntry['kind'] }

const byKind = (a: FsEntry, b: FsEntry) =>
  a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1

// Marca o que o agente escreveu e redesenha a árvore
const markTouched = async ($: EngineInterface, path: string) => {
  const root = await $.session.cwd()
  const rel = path.startsWith(root + '/') ? path.slice(root.length + 1) : path
  await update($, touched, list => (list.includes(rel) ? list : [...list, rel]))
  await update($, tick, n => n + 1)
}

export const registerFileTree: Register = on => {
  on('command.run', { command: 'arvore' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Árvore de arquivos aberta.' }
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.deny) await markTouched($, e.file_path)
    return ran
  })
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.deny) await markTouched($, e.file_path)
    return ran
  })
  on('tool.call', { tool: 'NotebookEdit' }, async ($, e, next) => {
    const ran = await next(e)
    if (!ran.deny) await markTouched($, e.notebook_path)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Code, Text } = $.ui.resolve(e)
    const root = await $.session.cwd()
    const open = new Set(await read($, expanded))
    const changed = new Set(await read($, touched))
    const file = await read($, selected)
    const top = await read($, previewTop)
    await read($, tick)

    const rows: Row[] = []
    const walk = async (dir: string, depth: number) => {
      const entries = await $.fs.list(dir ? `${root}/${dir}` : root).catch(() => [])
      for (const entry of [...entries].sort(byKind)) {
        if (rows.length >= MAX_ROWS) return
        if (IGNORE.has(entry.name)) continue
        const path = dir ? `${dir}/${entry.name}` : entry.name
        rows.push({ path, name: entry.name, depth, kind: entry.kind })
        if (entry.kind === 'dir' && open.has(path)) await walk(path, depth + 1)
      }
    }
    await walk('', 0)

    const toggle = (path: string) =>
      update($, expanded, list =>
        list.includes(path) ? list.filter(p => p !== path && !p.startsWith(path + '/')) : [...list, path],
      )
    const mention = (path: string) => $.prompt.fill({ text: `@${path} `, mode: 'insert' })
    const select = async (path: string) => {
      await update($, previewTop, () => 0)
      await update($, selected, () => path)
    }
    const isDirty = (path: string, kind: Row['kind']) =>
      kind === 'dir' ? [...changed].some(p => p.startsWith(path + '/')) : changed.has(path)

    const tree = (
      <Box flexDirection="column" flexShrink={0}>
        <Box flexDirection="row">
          <Text bold wrap="truncate-start">{root.split('/').pop() || root}/ </Text>
          <Button key="refresh" plain label="↻" onPress={() => update($, tick, n => n + 1)} />
          <Text> </Text>
          <Button key="collapse" plain label="⊟" onPress={() => update($, expanded, () => [])} />
        </Box>
        {rows.map(row => {
          const isDir = row.kind === 'dir'
          const icon = isDir ? (open.has(row.path) ? '▾ ' : '▸ ') : '  '
          const dirty = isDirty(row.path, row.kind)

          return (
            <Button
              key={row.path}
              plain
              onPress={() => (isDir ? toggle(row.path) : select(row.path))}
            >
              {'  '.repeat(row.depth)}
              {icon}
              <Text
                color={isDir ? 'claude' : undefined}
                dimColor={row.name.startsWith('.')}
                inverse={row.path === file}
              >
                {row.name}
                {isDir ? '/' : ''}
              </Text>
              {dirty ? <Text color="warning"> ●</Text> : ''}
            </Button>
          )
        })}
        {rows.length >= MAX_ROWS && <Text dimColor>… lista cortada em {MAX_ROWS} itens</Text>}
      </Box>
    )

    if (!file) {
      return tree
    }

    const columns = e.props.bodyColumns
    const isWide = columns >= WIDE_LAYOUT
    const rowsForCode = Math.max(5, e.props.scroll.bodyRows - (isWide ? 4 : rows.length + 6))
    const content = await loadPreview($, `${root}/${file}`)
    const total = 'lines' in content ? content.lines.length : 0
    const start = Math.min(top, Math.max(0, total - rowsForCode))
    const end = Math.min(total, start + rowsForCode)
    const page = (delta: number) =>
      update($, previewTop, n => Math.max(0, Math.min(Math.max(0, total - rowsForCode), n + delta)))

    const preview = (
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        borderStyle="single"
        borderDimColor
        paddingX={1}
        marginLeft={isWide ? 1 : 0}
        marginTop={isWide ? 0 : 1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-start">
            {file}
          </Text>
          <Box flexDirection="row" flexShrink={0}>
            {total > 0 && (
              <Text dimColor>
                {' '}
                {start + 1}–{end}/{total}{' '}
              </Text>
            )}
            <Button key="page-up" plain label="▲" onPress={() => page(-rowsForCode)} />
            <Text> </Text>
            <Button key="page-down" plain label="▼" onPress={() => page(rowsForCode)} />
            <Text> </Text>
            <Button key="mention" plain label="@" onPress={() => mention(file)} />
            <Text> </Text>
            <Button key="close-preview" plain label="✕" onPress={() => update($, selected, () => null)} />
          </Box>
        </Box>
        {'lines' in content ? (
          <Code
            source={content.lines.slice(start, end).join('\n')}
            path={file}
            startLine={start + 1}
            wrap="truncate-end"
          />
        ) : (
          <Text dimColor>{content.notice}</Text>
        )}
      </Box>
    )

    return (
      <Box flexDirection={isWide ? 'row' : 'column'}>
        <Box flexDirection="column" width={isWide ? Math.min(32, Math.floor(columns * 0.35)) : undefined} overflow="hidden">
          {tree}
        </Box>
        {preview}
      </Box>
    )
  })
}
