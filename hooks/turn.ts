import { atom, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

// Progresso do turno do loop principal: a barra acima do prompt lê daqui quando não há todos
const turn = atom({ plugin: 'je-mods', key: 'turn' } as const, null)
const clockNow = atom({ plugin: 'je-mods', key: 'now' } as const, 0)

let ticker: Timer | undefined

export const elapsed = (ms: number) => {
  const sec = Math.max(0, Math.round(ms / 1000))
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`
}

function tickEverySecond($: EngineInterface) {
  ticker?.cancel()
  ticker = $.clock.every(1000, () => {
    void $.clock.now().then(now => update($, clockNow, () => now))
  })
}

export async function startTurn($: EngineInterface) {
  const now = await $.clock.now()
  await update($, clockNow, () => now)
  await update($, turn, () => ({ startedAt: now, tools: 0, isDone: false }))
  tickEverySecond($)
}

export function countTool($: EngineInterface) {
  return update($, turn, current =>
    current && !current.isDone ? { ...current, tools: current.tools + 1 } : current,
  )
}

export async function endTurn($: EngineInterface, isAborted: boolean) {
  ticker?.cancel()
  ticker = undefined
  const now = await $.clock.now()
  await update($, clockNow, () => now)
  await update($, turn, current =>
    current ? { ...current, isDone: true, isAborted, endedAt: now } : current,
  )
}
