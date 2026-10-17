import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { SquadAgent } from '../types'

import { countTool, elapsed, endTurn } from './turn.ts'

const PANE = 'agent-squad'
const TITLE = 'Subagentes'
const KEEP = 12
const FRAME_MS = 400
// mmc(2, 3, 4, 7): antena, peito, olhar/braço e piscar fecham o ciclo juntos
const CYCLE = 84
// Subagente "trabalhando" há mais que isso não segura a animação ligada
const STALE_MS = 30 * 60_000
const agents = atom({ plugin: 'je-mods', key: 'agents' } as const, [])
const frame = atom({ plugin: 'je-mods', key: 'frame' } as const, 0)

// Um timer só enquanto houver robô trabalhando; para sozinho quando todos terminam
let animation: Timer | undefined
let lastTick = 0

const isAnimating = (list: SquadAgent[], now: number) =>
  list.some(one => one.status === 'running' && now - one.startedAt < STALE_MS)

async function animate($: EngineInterface) {
  const now = await $.clock.now()
  // Um período recusado encerra o every sem aviso: timer sem tick recente conta como morto
  if (animation && now - lastTick <= 2 * FRAME_MS) {
    return
  }
  animation?.cancel()
  lastTick = now
  const timer = $.clock.every(FRAME_MS, async () => {
    try {
      lastTick = await $.clock.now()
      if (!isAnimating(await read($, agents), lastTick)) {
        timer.cancel()
        animation = animation === timer ? undefined : animation
        // Um spawn pode ter chegado entre a leitura e o cancel
        if (isAnimating(await read($, agents), lastTick)) {
          void animate($)
        }
      }
      await update($, frame, n => (n + 1) % CYCLE)
    } catch {
      timer.cancel()
      animation = animation === timer ? undefined : animation
    }
  })
  animation = timer
}

// Robô em pixel art: cada célula do terminal leva dois pixels (▀ com cor de frente e de fundo).
// Corpo na cor da família do modelo; olho e nome pelo id; o quadro anima enquanto ele trabalha.
// A antena · R haste · H brilho · B corpo · S sombra · K visor · c peito · L braço/perna
const SPRITE = [
  '.....AA.....',
  '.....RR.....',
  '..HHHHHHHH..',
  '.HBBBBBBBBS.',
  '.BKKKKKKKKS.',
  '.BKKKKKKKKS.',
  '.BKKKKKKKKS.',
  '..SSSSSSSS..',
  'LLHBcccBBSLL',
  'L.BBBBBBBS.L',
  '..LL....LL..',
  '..LL....LL..',
]
const EYE_ROW = 5
const EYE_COLS = [3, 4, 7, 8]
const CHEST_ROW = 8
const CHEST = [4, 5, 6]
// Braço esquerdo: pixel de baixo quando parado, de cima quando acena
const ARM = { col: 0, down: 9, up: 7 }
const GREEN = '#22c55e'

type Body = { H: string; B: string; S: string }

const BODIES: Record<string, Body> = {
  Opus: { H: '#d8b4fe', B: '#a855f7', S: '#6b21a8' },
  Sonnet: { H: '#bfdbfe', B: '#3b82f6', S: '#1e3a8a' },
  Haiku: { H: '#bbf7d0', B: '#22c55e', S: '#14532d' },
  Fable: { H: '#fef08a', B: '#eab308', S: '#713f12' },
}
const STEEL: Body = { H: '#e5e7eb', B: '#9ca3af', S: '#4b5563' }
const FIXED: Record<string, string> = { R: '#9ca3af', L: '#6b7280', K: '#0f172a', c: '#1f2937' }
const EYE_COLORS = ['#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#e0e7ff']
const NAMES = ['Bit', 'Pixel', 'Byte', 'Nano', 'Kiko', 'Zeca', 'Tico', 'Juca', 'Lua', 'Faísca', 'Bolota', 'Pipoca']
const LOOK = [0, -1, 0, 1]

const hash = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const pick = <T,>(list: T[], seed: number, salt: number) =>
  list[Math.floor(seed / Math.pow(7, salt)) % list.length]!

type Pixel = string | undefined

// Antena pisca, olhos varrem e piscam, luz corre no peito, um braço acena
const pixels = (agent: SquadAgent, body: Body, seed: number, tick: number): Pixel[][] => {
  const f = tick + (seed % 5)
  const running = agent.status === 'running'
  const failed = agent.status === 'failed'
  const done = agent.status === 'done'
  const palette: Record<string, string> = {
    ...FIXED,
    ...(failed ? { H: body.S, B: body.S, S: '#1f2937' } : body),
    A: done ? GREEN : failed ? '#4b5563' : f % 2 === 0 ? '#ff4d4d' : '#5c1a1a',
  }
  const grid: Pixel[][] = SPRITE.map(row => [...row].map(key => (key === '.' ? undefined : palette[key])))
  const eye = done ? GREEN : failed ? '#ef4444' : f % 7 === 0 ? '#334155' : pick(EYE_COLORS, seed, 2)
  const look = running ? LOOK[f % LOOK.length]! : 0
  for (const col of EYE_COLS) {
    grid[EYE_ROW]![col + look] = eye
  }
  CHEST.forEach((col, i) => {
    const lit = done || (running && i === f % CHEST.length)
    grid[CHEST_ROW]![col] = lit ? (done ? GREEN : '#fbbf24') : palette.c
  })
  if (running && f % 4 < 2) {
    grid[ARM.down]![ARM.col] = undefined
    grid[ARM.up]![ARM.col] = palette.L
  }

  return grid
}

type Segment = { text: string; color?: string; backgroundColor?: string }

const rows = (grid: Pixel[][]) => {
  const out: Segment[][] = []
  for (let y = 0; y < grid.length; y += 2) {
    const line: Segment[] = []
    grid[y]!.forEach((top, x) => {
      const bottom = grid[y + 1]?.[x]
      const cell: Segment =
        top && bottom
          ? top === bottom
            ? { text: '█', color: top }
            : { text: '▀', color: top, backgroundColor: bottom }
          : top
            ? { text: '▀', color: top }
            : bottom
              ? { text: '▄', color: bottom }
              : { text: ' ' }
      const last = line[line.length - 1]
      if (last && last.color === cell.color && last.backgroundColor === cell.backgroundColor) {
        last.text += cell.text
      } else {
        line.push(cell)
      }
    })
    out.push(line)
  }
  return out
}

const robot = (agent: SquadAgent, family: string | undefined, tick: number) => {
  const seed = hash(agent.id)
  const body = (family && BODIES[family]) || STEEL

  return {
    name: pick(NAMES, seed, 5),
    color: body.B,
    rows: rows(pixels(agent, body, seed, tick)),
  }
}

const STATES = {
  running: { label: '● trabalhando', color: 'warning' },
  done: { label: '✓ pronto', color: 'success' },
  failed: { label: '✗ falhou', color: 'error' },
} as const

// 'claude-opus-5-5' → 'Opus 5.5'; 'claude-3-5-sonnet-…' → 'Sonnet 3.5'; alias 'sonnet' → 'Sonnet'
const modelLabel = (model?: string) => {
  if (!model) {
    return undefined
  }
  // Formato antigo traz a versão antes da família: claude-3-5-sonnet-20241022
  const legacy = model.match(/claude-(\d)(?:-(\d))?-(opus|sonnet|haiku)/i)
  const modern = model.match(/(opus|sonnet|haiku|fable)(?:-(\d{1,2})(?!\d)(?:-(\d{1,2})(?!\d))?)?/i)
  const [name, major, minor] = legacy
    ? [legacy[3], legacy[1], legacy[2]]
    : modern
      ? [modern[1], modern[2], modern[3]]
      : []
  if (!name) {
    return { text: model, family: undefined, color: undefined }
  }
  const family = name[0]!.toUpperCase() + name.slice(1).toLowerCase()
  const version = major ? ` ${major}${minor ? `.${minor}` : ''}` : ''

  return { text: `${family}${version}`, family, color: BODIES[family]?.B }
}

export const registerAgentSquad: Register = on => {
  on('command.run', { command: 'agentes' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Painel de subagentes aberto.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const spawned = await next(e)
    if (spawned.deny || !spawned.agentId) {
      return spawned
    }

    const agent: SquadAgent = {
      id: spawned.agentId,
      // O modelo escreve a descrição: tamanho limitado para a árvore não estourar o teto do host
      description: e.description.slice(0, 200),
      type: e.subagentType.slice(0, 64),
      model: spawned.model,
      status: 'running',
      tools: 0,
      startedAt: await $.clock.now(),
    }
    await update($, agents, list =>
      [...list.filter(one => one.id !== agent.id), agent].slice(-KEEP),
    )
    void $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    void animate($)

    return spawned
  })

  // Sem agentId é o loop principal: alimenta a barra do turno (turn.ts)
  on('tool.call', async ($, e, next) => {
    const { agentId, tool } = e
    if (agentId) {
      await update($, agents, list =>
        list.map(one =>
          one.id === agentId ? { ...one, tools: one.tools + 1, lastTool: tool } : one,
        ),
      )
      // Depois de um reload o timer do módulo some: o próximo passo do subagente religa
      void animate($)
    } else {
      await countTool($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const { agentId } = e
    if (agentId) {
      const now = await $.clock.now()
      const status: SquadAgent['status'] = e.isAborted || e.reason === 'error' || e.reason === 'refusal' ? 'failed' : 'done'
      await update($, agents, list =>
        list.map(one => (one.id === agentId ? { ...one, status, endedAt: now } : one)),
      )
    } else {
      await endTurn($, e.isAborted)
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const tick = await read($, frame)
    const now = await $.clock.now()
    const total = list.length
    const done = list.filter(one => one.status !== 'running').length
    const width = Math.max(8, Math.min(24, (e.props.bodyColumns ?? 40) - 16))
    const filled = total === 0 ? 0 : Math.round((done / total) * width)

    return (
      <Box flexDirection="column">
        {total === 0 ? (
          <Text dimColor>Nenhum subagente ainda.</Text>
        ) : (
          <Box flexDirection="row" marginBottom={1}>
            <Text color="claude">{'█'.repeat(filled)}</Text>
            <Text dimColor>{'░'.repeat(width - filled)}</Text>
            <Text bold> {done}/{total} concluídos</Text>
          </Box>
        )}
        {list.map(agent => {
          const model = modelLabel(agent.model)
          const bot = robot(agent, model?.family, tick)
          const time = elapsed((agent.endedAt ?? now) - agent.startedAt)
          const state = STATES[agent.status]

          return (
            <Box key={agent.id} flexDirection="row" marginBottom={1}>
              <Box flexDirection="column" marginRight={1} flexShrink={0}>
                {bot.rows.map((row, y) => (
                  <Text key={`${agent.id}-${y}`}>
                    {row.map((segment, x) => (
                      <Text key={String(x)} color={segment.color} backgroundColor={segment.backgroundColor}>
                        {segment.text}
                      </Text>
                    ))}
                  </Text>
                ))}
              </Box>
              <Box flexDirection="column" flexShrink={1}>
                <Text wrap="truncate-end">
                  <Text bold color={bot.color}>{bot.name}</Text>
                  <Text dimColor> {agent.type} </Text>
                  <Text color={state.color}>{state.label}</Text>
                </Text>
                {model && (
                  <Text wrap="truncate-end">
                    <Text dimColor>modelo </Text>
                    <Text bold color={model.color}>{model.text}</Text>
                  </Text>
                )}
                <Text wrap="truncate-end">{agent.description}</Text>
                <Text dimColor wrap="truncate-end">
                  ⚒ {agent.tools} {agent.lastTool ? `· ${agent.lastTool} ` : ''}· {time}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )
  })
}
