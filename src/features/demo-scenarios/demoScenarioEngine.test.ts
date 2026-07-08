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
import scenarioDatabase from './data/scenario-db.json'

describe('demo scenario engine', () => {
  it('exposes the configured JSON demo scenario ids', () => {
    expect(getDemoScenarios().map((scenario) => scenario.scenarioId)).toEqual(
      scenarioDatabase.scenarios.map((scenario) => scenario.scenarioId),
    )
  })

  it('includes a short personalization scenario for changing Roadie tone during conversation', () => {
    const scenario = getDemoScenario('agent_personality_voice_change')

    expect(scenario.title).toBe('오늘은 크게 또박또박 말해줘')
    expect(scenario.events.length).toBeLessThanOrEqual(6)
    expect(scenario.events.some((event) => (
      event.eventType === 'USER_RESPONSE'
      && event.userSpeech === '로디야, 오늘 좀 피곤해서 크게 또박또박 말해줘'
    ))).toBe(true)
    expect(scenario.events.some((event) => (
      event.roadieMessage?.includes('크게, 또박또박')
      && (event as { agentPersonalityOverride?: string }).agentPersonalityOverride === 'FORMAL'
    ))).toBe(true)
  })

  it('starts the personalization mini scenario without the common driving setup', () => {
    const state = createInitialDemoScenarioState('agent_personality_voice_change')

    expect(state.phase).toBe('scenario')
    expect(state.setupEvent).toBeNull()
    expect(state.scenarioEvent?.id).toBe('personality_session_started')
  })

  it('loads demo scenario scripts from the JSON scenario database', () => {
    expect(getDemoScenarios()).toEqual(scenarioDatabase.scenarios)
  })

  it('keeps every scenario event graph valid', () => {
    const errors = getDemoScenarios().flatMap(validateDemoScenarioDefinition)

    expect(errors).toEqual([])
  })

  it('uses Roadie naming for assistant scenario script fields and visible text', () => {
    const scenarioText = JSON.stringify(getDemoScenarios())
    const previousFieldName = ['romi', 'Message'].join('')
    const previousEnglishName = ['Ro', 'mi'].join('')
    const previousKoreanName = ['나', '비'].join('')

    expect(scenarioText).toContain('roadieMessage')
    expect(scenarioText).not.toContain(previousFieldName)
    expect(scenarioText).not.toContain(previousEnglishName)
    expect(scenarioText).not.toContain(previousKoreanName)
  })

  it('runs the common destination setup before the selected scenario starts', () => {
    const setupEvents = getCommonDrivingSetupEvents()
    let state = createInitialDemoScenarioState('phone_usage')

    expect(setupEvents.map((event) => event.id)).toContain('setup_recommended_route_selected')
    expect(setupEvents.map((event) => event.id)).toContain('setup_destination_selected')
    expect(setupEvents.findIndex((event) => event.id === 'setup_destination_selected')).toBeLessThan(
      setupEvents.findIndex((event) => event.id === 'setup_recommended_route_selected'),
    )
    expect(setupEvents[setupEvents.length - 1]?.id).toBe('setup_simulation_started')

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
      userSpeech: '보조석 창문 살짝 열어줘',
    })

    state = advanceDemoScenario(state)

    expect(state.scenarioEvent?.id).toBe('drowsy_window_started')
    expect(state.scenarioEvent?.roadieMessage).toBe('창문을 살짝 열게요. 그래도 피곤한 모습이 반복되면 바로 알려드릴게요.')
  })

  it('keeps every response branch split into user speech and the next Roadie step', () => {
    getDemoScenarios().forEach((scenario) => {
      scenario.events
        .filter((event) => event.requiresResponse)
        .forEach((event) => {
          event.responseOptions.forEach((option) => {
            const userState = respondToDemoScenario(
              {
                phase: 'scenario',
                scenario,
                setupEvent: null,
                scenarioEvent: event,
              },
              option.value,
            )
            const userEvent = userState.scenarioEvent
            const nextState = advanceDemoScenario(userState)

            expect(userEvent?.eventType, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe('USER_RESPONSE')
            expect(userEvent?.userSpeech, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe(option.asUserSpeech)
            expect(userEvent?.roadieMessage, `${scenario.scenarioId}:${event.id}:${option.value}`).toBeNull()
            expect(nextState.scenarioEvent?.id, `${scenario.scenarioId}:${event.id}:${option.value}`).not.toBe(userEvent?.id)
            expect(nextState.scenarioEvent?.roadieMessage, `${scenario.scenarioId}:${event.id}:${option.value}`).toBeTruthy()
          })
        })
    })
  })

  it('does not use destination setup as the device operation scenario content', () => {
    const scenarioText = JSON.stringify(getDemoScenario('device_operation'))

    expect(scenarioText).not.toMatch(/세종대학교|목적지 설정|목적지 음성|목적지 후보|내비 목적지/)
      expect(scenarioText).toContain('음악')
  })

  it('asks for a message recipient before showing the phone scenario message preview', () => {
    const scenario = getDemoScenario('phone_usage')
    let state = createInitialDemoScenarioState('phone_usage')

    while (state.scenarioEvent?.id !== 'phone_assist_offer') {
      state = advanceDemoScenario(state)
    }

    state = respondToDemoScenario(state, 'ASSIST_MESSAGE')
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_assist_approved',
      eventType: 'USER_RESPONSE',
      userSpeech: '응, 해줘',
    })

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_recipient_prompt',
      eventType: 'AGENT_MESSAGE',
      roadieMessage: '문자를 누구에게 보낼까요?',
      requiresResponse: true,
    })

    state = respondToDemoScenario(state, 'SEND_TO_JIWOO')
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_recipient_selected',
      eventType: 'USER_RESPONSE',
      userSpeech: '지우에게 보내줘',
    })

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_message_preview',
      roadieMessage: '지우에게 “운전 중이라 조금 뒤에 연락할게.” 이렇게 보낼까요?',
    })
    expect(scenario.events.find((event) => event.id === 'phone_message_preview')).toBeDefined()
  })

  it('does not expose focus driving mode as a demo scenario step', () => {
    const scenarioText = JSON.stringify(getDemoScenarios())

    expect(scenarioText).not.toMatch(/집중 운전 모드|FOCUS_MODE_ENABLED|focus_mode/)
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
