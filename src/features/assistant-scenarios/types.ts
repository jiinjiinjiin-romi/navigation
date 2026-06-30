import type { OrbAssistantState } from '@/features/orb'

export type AiaiScenarioId =
  | 'drowsiness-rest-area'
  | 'fatigue-music'
  | 'phone-message'
  | 'fatigue-window'
  | 'fatigue-conversation'
  | 'long-drive-rest-area'
  | 'distraction-voice-guide'
  | 'route-search-voice'
  | 'safety-report'
  | 'settings-check'

export type SpeechRole = 'agent' | 'user'

export interface AiaiScenarioStep {
  title: string
  description: string
  detectionEvent?: string
  agentSpeech?: string
  userSpeech?: string
  actionLabel?: string
}

export interface AiaiScenarioDefinition {
  id: AiaiScenarioId
  title: string
  steps: AiaiScenarioStep[]
}

export type NaviAssistantRecommendation =
  | {
    type: 'place'
    title: string
    meta: string
    detail: string
    action: string
  }
  | {
    type: 'music'
    title: string
    meta: string
    detail: string
    action: string
  }
  | {
    type: 'action'
    title: string
    meta: string
    detail: string
    action: string
  }

export interface NaviAssistantStep {
  id: string
  label: string
  mode: 'idle' | 'assistant-speaking' | 'user-listening' | 'thinking' | 'recommendation'
  orbState: OrbAssistantState
  energy: number
  statusLabel?: string
  text?: string
  userText?: string
  recommendations?: NaviAssistantRecommendation[]
  speechRole?: SpeechRole
  audioSrc?: string
}

export interface NaviAssistantScenario {
  id: AiaiScenarioId
  title: string
  steps: NaviAssistantStep[]
}

export interface ScenarioSpeech {
  key: string
  role: SpeechRole
  text: string
  audioSrc?: string
}
