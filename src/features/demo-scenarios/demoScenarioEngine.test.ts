import { describe, expect, it } from 'vitest'
import {
  advanceDemoScenario,
  createInitialDemoScenarioState,
  getCommonDrivingSetupEvents,
  getDemoScenario,
  getDemoScenarios,
  respondToDemoScenario,
  validateDemoScenarioDefinition,
} from './demoScenarioEngine'

describe('demo scenario engine', () => {
  it('exposes the three fixed demo scenarios only', () => {
    expect(getDemoScenarios().map((scenario) => scenario.scenarioId)).toEqual([
      'drowsy_driver',
      'phone_usage',
      'device_operation',
    ])
  })

  it('keeps every scenario event graph valid', () => {
    const errors = getDemoScenarios().flatMap(validateDemoScenarioDefinition)

    expect(errors).toEqual([])
  })

  it('runs the common destination setup before the selected scenario starts', () => {
    const setupEvents = getCommonDrivingSetupEvents()
    let state = createInitialDemoScenarioState('phone_usage')

    expect(state.phase).toBe('setup')
    expect(state.setupEvent?.id).toBe(setupEvents[0]?.id)

    setupEvents.slice(1).forEach((setupEvent) => {
      state = advanceDemoScenario(state)
      expect(state.phase).toBe('setup')
      expect(state.setupEvent?.id).toBe(setupEvent.id)
      expect(state.scenarioEvent).toBeNull()
    })

    state = advanceDemoScenario(state)

    expect(state.phase).toBe('scenario')
    expect(state.setupEvent).toBeNull()
    expect(state.scenarioEvent?.id).toBe('phone_session_started')
  })

  it('blocks next-button advancement while a user response is required', () => {
    let state = createInitialDemoScenarioState('phone_usage')
    while (state.scenarioEvent?.id !== 'phone_assist_offer') {
      state = advanceDemoScenario(state)
    }

    const blockedState = advanceDemoScenario(state)

    expect(blockedState).toBe(state)
    expect(blockedState.scenarioEvent?.id).toBe('phone_assist_offer')
  })

  it('continues through response buttons as user speech events', () => {
    let state = createInitialDemoScenarioState('drowsy_driver')
    while (state.scenarioEvent?.id !== 'drowsy_first_warning') {
      state = advanceDemoScenario(state)
    }

    state = respondToDemoScenario(state, 'OPEN_WINDOW')

    expect(state.scenarioEvent).toMatchObject({
      id: 'drowsy_window_response',
      eventType: 'USER_RESPONSE',
      userSpeech: '창문 살짝 열어줘',
    })

    state = advanceDemoScenario(state)

    expect(state.scenarioEvent?.id).toBe('drowsy_monitoring_resumed')
  })

  it('does not use destination setup as the device operation scenario content', () => {
    const scenarioText = JSON.stringify(getDemoScenario('device_operation'))

    expect(scenarioText).not.toMatch(/세종대학교|목적지 설정|목적지 음성|목적지 후보|내비 목적지/)
    expect(scenarioText).toContain('음악')
  })

  it('can complete every scenario with its first available response path', () => {
    getDemoScenarios().forEach((scenario) => {
      let state = createInitialDemoScenarioState(scenario.scenarioId)
      let guard = 0

      while (state.phase !== 'ended' && guard < 100) {
        const currentEvent = state.scenarioEvent

        if (currentEvent?.requiresResponse) {
          state = respondToDemoScenario(state, currentEvent.responseOptions[0]?.value ?? '')
        } else {
          state = advanceDemoScenario(state)
        }

        guard += 1
      }

      expect(state.phase, scenario.scenarioId).toBe('ended')
      expect(guard, scenario.scenarioId).toBeLessThan(100)
    })
  })
})
