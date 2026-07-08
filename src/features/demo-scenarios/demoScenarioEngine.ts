import {
  COMMON_DRIVING_SETUP_EVENTS,
  DEMO_SCENARIOS,
} from './fixtures/scenarioFixtures'
import type {
  DemoScenarioControllerState,
  DemoScenarioDefinition,
  DemoScenarioEvent,
  DemoScenarioId,
  DemoSetupEvent,
} from './types'

export function getDemoScenarios() {
  return DEMO_SCENARIOS
}

export function getCommonDrivingSetupEvents() {
  return COMMON_DRIVING_SETUP_EVENTS
}

export function getDemoScenario(scenarioId: DemoScenarioId) {
  const scenario = DEMO_SCENARIOS.find((item) => item.scenarioId === scenarioId)

  if (!scenario) {
    throw new Error(`Unknown demo scenario: ${scenarioId}`)
  }

  return scenario
}

export function createInitialDemoScenarioState(
  scenarioId: DemoScenarioId,
): DemoScenarioControllerState {
  const scenario = getDemoScenario(scenarioId)

  if (scenario.skipDrivingSetup) {
    return {
      phase: 'scenario',
      scenario,
      setupEvent: null,
      scenarioEvent: scenario.events[0] ?? null,
    }
  }

  return {
    phase: 'setup',
    scenario,
    setupEvent: COMMON_DRIVING_SETUP_EVENTS[0] ?? null,
    scenarioEvent: null,
  }
}

export function advanceDemoScenario(
  state: DemoScenarioControllerState,
): DemoScenarioControllerState {
  if (state.phase === 'setup') {
    return advanceSetup(state)
  }

  if (state.phase === 'scenario') {
    if (!state.scenarioEvent || state.scenarioEvent.requiresResponse) {
      return state
    }

    const nextScenarioEvent = getNextScenarioEvent(state.scenario, state.scenarioEvent.nextEventId)

    return {
      ...state,
      phase: nextScenarioEvent ? 'scenario' : 'ended',
      scenarioEvent: nextScenarioEvent,
      setupEvent: null,
    }
  }

  return state
}

export function respondToDemoScenario(
  state: DemoScenarioControllerState,
  responseValue: string,
): DemoScenarioControllerState {
  if (state.phase !== 'scenario' || !state.scenarioEvent?.requiresResponse) {
    return state
  }

  const option = state.scenarioEvent.responseOptions.find((item) => item.value === responseValue)

  if (!option) {
    return state
  }

  return {
    ...state,
    scenarioEvent: getRequiredScenarioEvent(state.scenario, option.nextEventId),
  }
}

export function validateDemoScenarioDefinition(scenario: DemoScenarioDefinition) {
  const errors: string[] = []
  const ids = new Set<string>()

  scenario.events.forEach((event) => {
    if (ids.has(event.id)) {
      errors.push(`${scenario.scenarioId}: duplicate event id ${event.id}`)
    }
    ids.add(event.id)
  })

  scenario.events.forEach((event) => {
    if (event.requiresResponse && event.nextEventId) {
      errors.push(`${event.id}: response event must not also use nextEventId`)
    }

    if (event.requiresResponse && event.responseOptions.length === 0) {
      errors.push(`${event.id}: response event requires options`)
    }

    if (!event.requiresResponse && event.responseOptions.length > 0) {
      errors.push(`${event.id}: non-response event must not expose options`)
    }

    if (event.eventType === 'USER_RESPONSE' && !event.userSpeech) {
      errors.push(`${event.id}: USER_RESPONSE must include userSpeech`)
    }

    if (event.nextEventId && !ids.has(event.nextEventId)) {
      errors.push(`${event.id}: nextEventId ${event.nextEventId} does not exist`)
    }

    event.responseOptions.forEach((option) => {
      const nextEvent = scenario.events.find((item) => item.id === option.nextEventId)

      if (!nextEvent) {
        errors.push(`${event.id}: option ${option.value} points to missing ${option.nextEventId}`)
        return
      }

      if (nextEvent.eventType !== 'USER_RESPONSE') {
        errors.push(`${event.id}: option ${option.value} must point to USER_RESPONSE`)
      }

      if (nextEvent.userSpeech !== option.asUserSpeech) {
        errors.push(`${event.id}: option ${option.value} speech does not match target USER_RESPONSE`)
      }
    })
  })

  return errors
}

function advanceSetup(
  state: DemoScenarioControllerState,
): DemoScenarioControllerState {
  const currentSetupEvent = state.setupEvent

  if (!currentSetupEvent) {
    return state
  }

  const nextSetupEvent = getNextSetupEvent(currentSetupEvent.nextEventId)

  if (nextSetupEvent) {
    return {
      ...state,
      setupEvent: nextSetupEvent,
      scenarioEvent: null,
    }
  }

  return {
    ...state,
    phase: 'scenario',
    setupEvent: null,
    scenarioEvent: state.scenario.events[0] ?? null,
  }
}

function getNextSetupEvent(nextEventId: string | null): DemoSetupEvent | null {
  if (!nextEventId) {
    return null
  }

  return COMMON_DRIVING_SETUP_EVENTS.find((event) => event.id === nextEventId) ?? null
}

function getNextScenarioEvent(
  scenario: DemoScenarioDefinition,
  nextEventId: string | null,
): DemoScenarioEvent | null {
  if (!nextEventId) {
    return null
  }

  return getRequiredScenarioEvent(scenario, nextEventId)
}

function getRequiredScenarioEvent(
  scenario: DemoScenarioDefinition,
  eventId: string,
): DemoScenarioEvent {
  const event = scenario.events.find((item) => item.id === eventId)

  if (!event) {
    throw new Error(`${scenario.scenarioId}: missing demo scenario event ${eventId}`)
  }

  return event
}
