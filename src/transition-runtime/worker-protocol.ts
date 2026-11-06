import type { DisplayList } from '../shared/display-list'
import type { RuntimeConfig, TransitionMeta } from './runtime'

export interface ErrorInfo {
  message: string
  line?: number
  col?: number
  phase?: 'load' | 'init' | 'render'
}

export type ToWorker =
  | { t: 'load'; id: number; source: string }
  | { t: 'create'; id: number; key: string; source: string; config: RuntimeConfig }
  | { t: 'render'; id: number; key: string; progress: number; frame: number; totalFrames: number }
  | { t: 'dispose'; key: string }

export type FromWorker =
  | { t: 'ready' }
  | { t: 'loaded'; id: number; meta?: TransitionMeta; error?: ErrorInfo }
  | { t: 'created'; id: number; error?: ErrorInfo; ms: number }
  | { t: 'rendered'; id: number; dl?: DisplayList; error?: ErrorInfo; ms: number }
  | { t: 'log'; key?: string; text: string }
