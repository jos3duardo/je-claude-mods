import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { SquadAgent } from '../types'

import { countTool, elapsed, endTurn } from './turn.ts'

const PANE = 'agent-squad'
const TITLE = 'Subagentes'
const KEEP = 12
const FRAME_MS = 400
// mmc(2, 4, 7): antena, olhar e piscar fecham o ciclo juntos
const CYCLE = 28
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
// Só a cabeça, com contorno, luz de cima à esquerda e reflexo no visor; a expressão é toda nos olhos.
// Casco, olho e nome por agente, escolhidos no spawn sem repetir no painel; a cor do modelo fica só no rótulo.
// a/A antena (brilho/base) · R haste · O contorno · H luz · B casco · S sombra · V visor · v reflexo · W orelha
const SPRITE = [
  '......aA......',
  '......RR......',
  '...OOOOOOOO...',
  '..OHHHHHHHBO..',
  '.OHBvvVVVVBSO.',
  'WOHBVVVVVVBSOW',
  'WOBBVVVVVVBSOW',
  '.OBBVVVVVVSSO.',
  '..OSSSSSSSSO..',
  '...OOOOOOOO...',
]
// Olhos de dois pixels de altura; piscar e "falhou" acendem só o de baixo
const EYE_ROWS = [5, 6]
const EYE_COLS = [5, 8]
const GREEN = '#22c55e'
const RED = '#ef4444'

// Pele do robô: luz, casco, sombra, contorno e olho (contrastando com o casco)
type Skin = { H: string; B: string; S: string; O: string; E: string }

// Uma por agente: são KEEP peles, então não repete entre os que estão no painel
const SKINS: Skin[] = [
  { H: '#fecaca', B: '#ef4444', S: '#991b1b', O: '#450a0a', E: '#67e8f9' },
  { H: '#fed7aa', B: '#f97316', S: '#9a3412', O: '#431407', E: '#67e8f9' },
  { H: '#fde68a', B: '#f59e0b', S: '#92400e', O: '#451a03', E: '#a5b4fc' },
  { H: '#d9f99d', B: '#84cc16', S: '#3f6212', O: '#1a2e05', E: '#f0abfc' },
  { H: '#a7f3d0', B: '#10b981', S: '#065f46', O: '#022c22', E: '#fde047' },
  { H: '#a5f3fc', B: '#06b6d4', S: '#155e75', O: '#083344', E: '#fde047' },
  { H: '#bfdbfe', B: '#3b82f6', S: '#1e40af', O: '#0b1a3a', E: '#fde047' },
  { H: '#c7d2fe', B: '#6366f1', S: '#3730a3', O: '#1e1b4b', E: '#67e8f9' },
  { H: '#e9d5ff', B: '#a855f7', S: '#6b21a8', O: '#2e1065', E: '#67e8f9' },
  { H: '#fbcfe8', B: '#ec4899', S: '#9d174d', O: '#500724', E: '#67e8f9' },
  { H: '#f5d0fe', B: '#d946ef', S: '#86198f', O: '#4a044e', E: '#fde047' },
  { H: '#e5e7eb', B: '#9ca3af', S: '#4b5563', O: '#1f2937', E: '#67e8f9' },
]
// Cor da família no rótulo do modelo
const FAMILY_COLORS: Record<string, string> = {
  Opus: '#a855f7',
  Sonnet: '#3b82f6',
  Haiku: '#22c55e',
  Fable: '#eab308',
}
const FIXED: Record<string, string> = { R: '#9ca3af', V: '#0f172a', v: '#334155', W: '#e5e7eb' }
// Antena: [brilho, base] por estado; trabalhando alterna aceso e apagado
const ANTENNA: Record<'on' | 'off' | 'done' | 'failed', [string, string]> = {
  on: ['#ffb3b3', '#ff4d4d'],
  off: ['#5c1a1a', '#5c1a1a'],
  done: ['#bbf7d0', GREEN],
  failed: ['#4b5563', '#374151'],
}
// Planetas, planetas-anões, luas e estrelas; também sem repetir entre os que estão no painel
const NAMES = [
  'Mercúrio', 'Vênus', 'Terra', 'Marte', 'Júpiter', 'Saturno', 'Urano', 'Netuno',
  'Plutão', 'Ceres', 'Éris', 'Haumea', 'Makemake',
  'Lua', 'Fobos', 'Deimos', 'Io', 'Europa', 'Ganimedes', 'Calisto', 'Titã', 'Encélado',
  'Mimas', 'Reia', 'Jápeto', 'Tritão', 'Caronte', 'Oberon', 'Titânia', 'Miranda', 'Ariel',
  'Sirius', 'Vega', 'Rigel', 'Betelgeuse', 'Antares', 'Polaris', 'Proxima', 'Trappist', 'Kepler',
]
const LOOK = [0, -1, 0, 1]

const hash = (text: string) => {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

type Pixel = string | undefined

// Primeiro índice livre a partir do hash do id; com tudo ocupado, fica o do hash
const firstFree = (size: number, seed: number, isFree: (index: number) => boolean) => {
  for (let step = 0; step < size; step++) {
    const index = (seed + step) % size
    if (isFree(index)) {
      return index
    }
  }
  return seed % size
}

// Antena pisca, olhos varrem e piscam
const pixels = (agent: SquadAgent, skin: Skin, seed: number, tick: number): Pixel[][] => {
  const f = tick + (seed % 5)
  const running = agent.status === 'running'
  const failed = agent.status === 'failed'
  const done = agent.status === 'done'
  const [glint, bulb] = done ? ANTENNA.done : failed ? ANTENNA.failed : f % 2 === 0 ? ANTENNA.on : ANTENNA.off
  const palette: Record<string, string> = {
    ...FIXED,
    ...skin,
    ...(failed ? { H: skin.S, B: skin.S } : {}),
    a: glint,
    A: bulb,
  }
  const grid: Pixel[][] = SPRITE.map(row => [...row].map(key => (key === '.' ? undefined : palette[key])))
  const eye = done ? GREEN : failed ? RED : skin.E
  const look = running ? LOOK[f % LOOK.length]! : 0
  const blink = running && f % 7 === 0
  // Falhou: olhos caídos, só o pixel de baixo, alargado para fora
  const cols = failed ? [EYE_COLS[0]! - 1, EYE_COLS[0]!, EYE_COLS[1]!, EYE_COLS[1]! + 1] : EYE_COLS
  const rows = failed || blink ? EYE_ROWS.slice(1) : EYE_ROWS
  for (const row of rows) {
    for (const col of cols) {
      grid[row]![col + look] = eye
    }
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

const robot = (agent: SquadAgent, tick: number) => {
  const seed = hash(agent.id)
  // Agente gravado antes de existir pele e nome guardados cai no hash
  // Estado gravado por uma versão com mais peles não quebra o desenho
  const skin = SKINS[(agent.skin ?? seed) % SKINS.length]!

  return {
    name: agent.name ?? NAMES[seed % NAMES.length]!,
    color: skin.B,
    rows: rows(pixels(agent, skin, seed, tick)),
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
    return { text: model, color: undefined }
  }
  const family = name[0]!.toUpperCase() + name.slice(1).toLowerCase()
  const version = major ? ` ${major}${minor ? `.${minor}` : ''}` : ''

  return { text: `${family}${version}`, color: FAMILY_COLORS[family] }
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
    await update($, agents, list => {
      // Só quem continua no painel ocupa pele e nome
      const others = list.filter(one => one.id !== agent.id).slice(-(KEEP - 1))
      const seed = hash(agent.id)
      const skins = new Set(others.map(one => one.skin))
      const names = new Set(others.map(one => one.name))
      const skin = firstFree(SKINS.length, seed, index => !skins.has(index))
      const name = NAMES[firstFree(NAMES.length, seed, index => !names.has(NAMES[index]))]

      return [...others, { ...agent, skin, name }]
    })
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
          const bot = robot(agent, tick)
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
