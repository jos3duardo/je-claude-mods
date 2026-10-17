export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = {
  id: string
  source: 'todo' | 'task'
  subject: string
  activeForm?: string
  status: TaskStatus
}

export type SquadStatus = 'running' | 'done' | 'failed'
export type SquadAgent = {
  id: string
  description: string
  type: string
  model?: string
  status: SquadStatus
  tools: number
  lastTool?: string
  startedAt: number
  endedAt?: number
}

export type TreePath = string

export type TurnInfo = {
  startedAt: number
  tools: number
  isDone: boolean
  isAborted?: boolean
  endedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'je-mods': {
      tasks: Task[]
      agents: SquadAgent[]
      frame: number
      expanded: TreePath[]
      touched: TreePath[]
      tick: number
      selected: TreePath | null
      previewTop: number
      turn: TurnInfo | null
      now: number
    }
  }
}
