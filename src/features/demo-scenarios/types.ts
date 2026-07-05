export type DemoScenarioId = 'drowsy_driver' | 'phone_usage' | 'device_operation'

export type DemoRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export type DemoDrivingMode = 'MOVING' | 'ENDED'

export type DemoEventType =
  | 'SESSION_STARTED'
  | 'DETECTION_UPDATE'
  | 'AGENT_MESSAGE'
  | 'USER_RESPONSE'
  | 'RISK_UPDATED'
  | 'ACTION_PREVIEW'
  | 'ACTION_COMPLETED'
  | 'FOCUS_MODE_ENABLED'
  | 'SESSION_ENDED'
  | 'REPORT_READY'

export type DemoSetupEventType =
  | 'DRIVING_SCREEN_OPENED'
  | 'ROUTE_SEARCH_OPENED'
  | 'DESTINATION_TYPING'
  | 'DESTINATION_CANDIDATE_SHOWN'
  | 'DESTINATION_SELECTED'
  | 'ROUTE_CANDIDATES_LOADED'
  | 'RECOMMENDED_ROUTE_SELECTED'
  | 'GUIDANCE_STARTED'
  | 'SIMULATION_STARTED'

export interface DemoUiState {
  drivingMode: DemoDrivingMode
  riskLevel: DemoRiskLevel
  visibleStatus: string
}

export interface DemoReportMarker {
  include: boolean
  eventName: string | null
}

export interface DemoResponseOption {
  label: string
  value: string
  asUserSpeech: string
  nextEventId: string
}

export interface DemoScenarioEvent {
  id: string
  at: number
  eventType: DemoEventType
  uiState: DemoUiState
  romiMessage: string | null
  userSpeech?: string
  requiresResponse: boolean
  responseOptions: DemoResponseOption[]
  report: DemoReportMarker
  debugNote: string | null
  nextEventId: string | null
}

export interface DemoScenarioEnding {
  showReportModal: boolean
  detailReportAvailable: boolean
  emailUiAvailable: boolean
}

export interface DemoScenarioDefinition {
  scenarioId: DemoScenarioId
  title: string
  description: string
  durationSeconds: number
  tags: string[]
  events: DemoScenarioEvent[]
  ending: DemoScenarioEnding
}

export interface DemoSetupEvent {
  id: string
  eventType: DemoSetupEventType
  title: string
  visibleStatus: string
  description: string
  lockedNavigation: boolean
  nextEventId: string | null
}

export type DemoScenarioPhase = 'setup' | 'scenario' | 'ended'

export interface DemoScenarioControllerState {
  phase: DemoScenarioPhase
  scenario: DemoScenarioDefinition
  setupEvent: DemoSetupEvent | null
  scenarioEvent: DemoScenarioEvent | null
}
