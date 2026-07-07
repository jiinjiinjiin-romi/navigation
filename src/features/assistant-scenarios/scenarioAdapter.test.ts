import { describe, expect, it } from 'vitest'
import {
  AIAI_SCENARIO_IDS,
  createRoadieAssistantScenarios,
} from './scenarioAdapter'

describe('aiai scenario adapter', () => {
  it('only exposes scenarios that exist in aiai', () => {
    expect(AIAI_SCENARIO_IDS).toEqual([
      'drowsiness-rest-area',
      'fatigue-music',
      'phone-message',
      'fatigue-window',
      'fatigue-conversation',
      'long-drive-rest-area',
      'distraction-voice-guide',
      'route-search-voice',
      'safety-report',
      'settings-check',
    ])
    expect(AIAI_SCENARIO_IDS).not.toContain('drowsy-assist')
    expect(AIAI_SCENARIO_IDS).not.toContain('wake-call')
  })

  it('maps aiai steps into ROADIE assistant states', () => {
    const scenarios = createRoadieAssistantScenarios()
    const scenario = scenarios.find((item) => item.id === 'drowsiness-rest-area')

    expect(scenario?.steps).toHaveLength(8)
    expect(scenario?.steps.map((step) => step.text ?? step.userText ?? step.label)).not.toContain('졸음 감지')
    expect(scenario?.steps[0]).toMatchObject({
      mode: 'idle',
      orbState: 'idle',
      energy: 0,
    })
    expect(scenario?.steps[1]).toMatchObject({
      mode: 'assistant-speaking',
      orbState: 'speaking',
      text: '잠시 쉬어가면 좋겠습니다. 신탄진 졸음쉼터를 찾아드릴까요?',
    })
    expect(scenario?.steps[2]).toMatchObject({
      mode: 'user-listening',
      orbState: 'listening',
      userText: '신탄진 졸음쉼터로 안내해줘',
    })
    expect(scenario?.steps[3]).toMatchObject({
      mode: 'recommendation',
      recommendations: [
        expect.objectContaining({
          detail: '신탄진 졸음쉼터를 찾았습니다. 현재 경로에서 21.4km 거리이고 18분 뒤 도착할 수 있습니다.',
        }),
      ],
    })
  })

  it('does not expose detection-only events as assistant conversation steps', () => {
    const detectionTexts = ['졸음 감지', '휴대폰 사용 감지', '장시간 운전', '주의 분산']
    const visibleConversationText = createRoadieAssistantScenarios().flatMap((scenario) => (
      scenario.steps.flatMap((step) => [step.text, step.userText, step.statusLabel].filter(Boolean))
    ))

    expect(visibleConversationText).not.toEqual(expect.arrayContaining(detectionTexts))
  })

  it('does not expose detection metadata in scenario titles', () => {
    const scenarioTitles = createRoadieAssistantScenarios().map((scenario) => scenario.title)

    expect(scenarioTitles).not.toEqual(expect.arrayContaining([
      expect.stringContaining('졸음 감지'),
      expect.stringContaining('휴대폰 사용 감지'),
      expect.stringContaining('주의 분산 감지'),
    ]))
  })

  it('matches each visible conversation text to the correct orb state', () => {
    const mismatches = createRoadieAssistantScenarios().flatMap((scenario) => (
      scenario.steps.flatMap((step, stepIndex) => {
        const location = `${scenario.id}-${stepIndex}-${step.label}`

        if (step.userText) {
          return step.orbState === 'listening' && step.mode === 'user-listening' && step.statusLabel === '듣는 중...'
            ? []
            : [`${location}: user speech should be listening`]
        }

        if (step.text) {
          return step.orbState === 'speaking' && !step.statusLabel
            ? []
            : [`${location}: agent speech should be speaking`]
        }

        if (step.mode === 'idle') {
          return step.orbState === 'idle' && !step.text && !step.userText && !step.statusLabel
            ? []
            : [`${location}: idle should not show conversation text`]
        }

        return []
      })
    ))

    expect(mismatches).toEqual([])
  })
})
