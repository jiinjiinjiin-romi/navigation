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

  it('includes gaze-away and reaching-behind mini scenarios without the common driving setup', () => {
    const gazeAwayScenario = getDemoScenario('gaze_away_attention')
    const reachingBehindScenario = getDemoScenario('reaching_behind_check')

    expect(gazeAwayScenario).toMatchObject({
      title: '시선 이탈 감지',
      skipDrivingSetup: true,
      tags: expect.arrayContaining(['시선 이탈', '전방 주시', '미니 시나리오']),
    })
    expect(gazeAwayScenario.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: 'DETECTION_UPDATE',
        uiState: expect.objectContaining({
          riskLevel: 'MEDIUM',
          visibleStatus: '시선 이탈 주의',
        }),
      }),
      expect.objectContaining({
        eventType: 'AGENT_MESSAGE',
        roadieMessage: '전방을 봐주세요. 시선이 도로에서 오래 벗어났어요.',
      }),
      expect.objectContaining({
        eventType: 'USER_RESPONSE',
        userSpeech: '알겠어, 앞 볼게.',
      }),
      expect.objectContaining({
        eventType: 'AGENT_MESSAGE',
        roadieMessage: '좋아요. 지금처럼 전방 주시를 유지해 주세요.',
      }),
    ]))
    expect(createInitialDemoScenarioState('gaze_away_attention')).toMatchObject({
      phase: 'scenario',
      setupEvent: null,
      scenarioEvent: expect.objectContaining({ id: 'gaze_away_session_started' }),
    })

    expect(reachingBehindScenario).toMatchObject({
      title: '뒷좌석 확인 감지',
      skipDrivingSetup: true,
      tags: expect.arrayContaining(['뒷좌석 확인', '위험 자세', '미니 시나리오']),
    })
    expect(reachingBehindScenario.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: 'DETECTION_UPDATE',
        uiState: expect.objectContaining({
          riskLevel: 'MEDIUM',
          visibleStatus: '뒤돌아봄 주의',
        }),
      }),
      expect.objectContaining({
        eventType: 'AGENT_MESSAGE',
        roadieMessage: '뒤쪽 확인할 일이 있으면 잠깐 멈춘 뒤에 보는 게 좋아요.',
      }),
      expect.objectContaining({
        eventType: 'USER_RESPONSE',
        userSpeech: '응, 잠깐 정차하고 볼게.',
      }),
      expect.objectContaining({
        eventType: 'AGENT_MESSAGE',
        roadieMessage: '좋아요. 정차 후 확인하면 훨씬 안전해요.',
      }),
    ]))
    expect(createInitialDemoScenarioState('reaching_behind_check')).toMatchObject({
      phase: 'scenario',
      setupEvent: null,
      scenarioEvent: expect.objectContaining({ id: 'reaching_behind_session_started' }),
    })
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
      userSpeech: '조금 졸리네... 창문 좀 열어줘.',
    })

    state = advanceDemoScenario(state)

    expect(state.scenarioEvent?.id).toBe('drowsy_window_started')
    expect(state.scenarioEvent?.roadieMessage).toBe('창문을 살짝 열게요. 너무 피곤하면 쉬어가시는걸 추천드려요.')

    let musicState = createInitialDemoScenarioState('drowsy_driver')
    while (musicState.scenarioEvent?.id !== 'drowsy_first_warning') {
      musicState = advanceDemoScenario(musicState)
    }

    musicState = respondToDemoScenario(musicState, 'PLAY_BRIGHT_MUSIC')
    expect(musicState.scenarioEvent).toMatchObject({
      id: 'drowsy_music_response',
      eventType: 'USER_RESPONSE',
      userSpeech: '조금 졸리네... 잠깨는 신나는 음악 틀어줄래?',
    })

    musicState = advanceDemoScenario(musicState)
    expect(musicState.scenarioEvent?.roadieMessage).toBe('밝은 음악으로 바꿔드릴게요. 너무 피곤하면 쉬어가시는걸 추천드려요.')
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

  it('starts device operation with a safety warning before handling a music request', () => {
    let state = createInitialDemoScenarioState('device_operation')

    while (state.scenarioEvent?.id !== 'device_first_warning') {
      state = advanceDemoScenario(state)
    }

    expect(state.scenarioEvent?.roadieMessage).toBe('{{profileName}}, 전방 확인이 계속 안 되고 있어요. 시선을 앞으로 돌려주세요.')

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent?.id).toBe('device_repeated_detection')

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'device_music_offer',
      roadieMessage: '계속 화면을 조작하면 위험해요. 필요한 건 제가 대신 도와드릴까요?',
    })

    state = respondToDemoScenario(state, 'START_VOICE_MUSIC')
    expect(state.scenarioEvent?.userSpeech).toBe('지금 듣는 노래 말고 다른 음악으로 바꿔줘.')

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'device_music_type_prompt',
      roadieMessage: '어떤 음악으로 바꿔드릴까요?',
      requiresResponse: true,
    })

    state = respondToDemoScenario(state, 'PLAY_RED_SUNSET')
    expect(state.scenarioEvent?.userSpeech).toBe('빅뱅의 붉은 노을 틀어줘.')

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'device_music_preview',
      roadieMessage: '빅뱅의 붉은 노을을 찾았어요. 이 곡으로 재생할까요?',
    })

    state = respondToDemoScenario(state, 'PLAY_RED_SUNSET_CONFIRMED')
    state = advanceDemoScenario(state)
    expect(state.scenarioEvent?.roadieMessage).toBe('빅뱅의 붉은 노을을 재생할게요.')
  })

  it('moves directly from a complete phone request to message preview', () => {
    const scenario = getDemoScenario('phone_usage')
    let state = createInitialDemoScenarioState('phone_usage')

    while (state.scenarioEvent?.id !== 'phone_assist_offer') {
      state = advanceDemoScenario(state)
    }

    state = respondToDemoScenario(state, 'ASSIST_MESSAGE')
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_assist_approved',
      eventType: 'USER_RESPONSE',
      userSpeech: '석현이에게 20분정도 늦을 것 같다고 문자 보내줘.',
    })

    state = advanceDemoScenario(state)
    expect(state.scenarioEvent).toMatchObject({
      id: 'phone_message_preview',
      eventType: 'ACTION_PREVIEW',
      roadieMessage: '석현님에게 20분정도 늦을 것 같아 라고 보낼까요?',
      requiresResponse: true,
    })
    expect(scenario.events.find((event) => event.id === 'phone_message_preview')).toBeDefined()
    expect(scenario.events.find((event) => event.id === 'phone_recipient_prompt')).toBeUndefined()
    expect(scenario.events.find((event) => event.id === 'phone_recipient_selected')).toBeUndefined()
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
