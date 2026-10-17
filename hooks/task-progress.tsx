import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Task } from '../types'

import { elapsed, startTurn } from './turn.ts'

const tasks = atom({ plugin: 'je-mods', key: 'tasks' } as const, [])
// Mesmas referências que turn.ts e agent-squad.tsx escrevem; o host só lê atom declarado no próprio arquivo
const turn = atom({ plugin: 'je-mods', key: 'turn' } as const, null)
const clockNow = atom({ plugin: 'je-mods', key: 'now' } as const, 0)
const agents = atom({ plugin: 'je-mods', key: 'agents' } as const, [])

const bar = (done: number, total: number, width: number) => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const registerTaskProgress: Register = on => {
  // Lista nova a cada prompt quando a anterior já terminou inteira
  on('prompt.submit', async ($, e, next) => {
    await update($, tasks, list =>
      list.length > 0 && list.every(t => t.status === 'completed') ? [] : list,
    )
    await startTurn($)

    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'TodoWrite' && !ran.deny) {
      const todos: Task[] = e.todos.map((todo, i) => ({
        id: `todo-${i}`,
        source: 'todo',
        subject: todo.content,
        activeForm: todo.activeForm,
        status: todo.status,
      }))
      await update($, tasks, list => [
        ...list.filter(t => t.source !== 'todo'),
        ...todos,
      ])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskCreate' }, async ($, e, next) => {
    if (e.tool !== 'TaskCreate') {
      return next(e)
    }
    const ran = await next(e)
    const created = ran.deny ? undefined : (ran.result as { task?: { id: string } } | undefined)
    if (created?.task) {
      const task: Task = {
        id: created.task.id,
        source: 'task',
        subject: e.subject,
        activeForm: e.activeForm,
        status: 'pending',
      }
      await update($, tasks, list => [...list.filter(t => t.id !== task.id), task])
    }

    return ran
  })

  on('tool.call', { tool: 'TaskUpdate' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool === 'TaskUpdate' && !ran.deny) {
      const { taskId, status, subject, activeForm } = e
      await update($, tasks, list =>
        status === 'deleted'
          ? list.filter(t => t.id !== taskId)
          : list.map(t =>
              t.source === 'task' && t.id === taskId
                ? {
                    ...t,
                    status: status ?? t.status,
                    subject: subject ?? t.subject,
                    activeForm: activeForm ?? t.activeForm,
                  }
                : t,
            ),
      )
    }

    return ran
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    const current = await read($, turn)
    if (e.props.hasSurvey || (list.length === 0 && current === null)) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    // Sem todos: progresso do turno (tempo, ferramentas e subagentes deste turno)
    if (list.length === 0 && current) {
      const now = await read($, clockNow)
      const spawned = (await read($, agents)).filter(one => one.startedAt >= current.startedAt)
      const finished = spawned.filter(one => one.status !== 'running').length
      const time = elapsed((current.endedAt ?? now) - current.startedAt)

      return (
        <Box flexDirection="row">
          {current.isDone && finished < spawned.length ? (
            <Text color="warning">◌ aguardando {spawned.length - finished} subagente(s) · turno em {time}</Text>
          ) : current.isDone ? (
            <Text color={current.isAborted ? 'warning' : 'success'}>
              {current.isAborted ? '■ interrompido' : '✓ concluído'} em {time}
            </Text>
          ) : (
            <Text color="claude">⏳ {time}</Text>
          )}
          <Text dimColor> · ⚒ {current.tools} ferramentas</Text>
          {spawned.length > 0 && (
            <Text>
              <Text dimColor> · subagentes </Text>
              <Text color="claude">{bar(finished, spawned.length, Math.min(10, spawned.length * 2))}</Text>
              <Text bold> {finished}/{spawned.length}</Text>
            </Text>
          )}
        </Box>
      )
    }
    const total = list.length
    const done = list.filter(t => t.status === 'completed').length
    const active = list.find(t => t.status === 'in_progress')
    const pct = Math.round((done / total) * 100)
    const width = Math.max(10, Math.min(30, (e.props.bodyColumns ?? 80) - 50))
    const isAllDone = done === total

    return (
      <Box flexDirection="row">
        <Text color={isAllDone ? 'success' : 'claude'}>{bar(done, total, width)}</Text>
        <Text bold> {done}/{total}</Text>
        <Text dimColor> ({pct}%)</Text>
        {isAllDone ? (
          <Text color="success"> ✓ tudo concluído</Text>
        ) : active ? (
          <Text wrap="truncate-end"> ▶ {active.activeForm ?? active.subject}</Text>
        ) : (
          <Text dimColor> aguardando próxima tarefa</Text>
        )}
      </Box>
    )
  })
}
