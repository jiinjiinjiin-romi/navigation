import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  AIAI_SCENARIO_IDS,
  createNaviAssistantScenarios,
  getScenarioSpeech,
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

  it('maps aiai steps into Navi assistant states with audio sources', () => {
    const scenarios = createNaviAssistantScenarios()
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
      text: '잠시 쉬어가면 좋겠습니다. 가까운 쉼터를 찾아드릴까요?',
      audioSrc: '/audio/tts/agent/잠시 쉬어가면 좋겠습니다. 가까운 쉼터를 찾아드릴까요_.mp3',
      speechRole: 'agent',
    })
    expect(scenario?.steps[2]).toMatchObject({
      mode: 'user-listening',
      orbState: 'listening',
      userText: '가까운 졸음쉼터로 안내해줘',
      audioSrc: '/audio/tts/user/02_가까운_졸음쉼터로_안내해줘.mp3',
      speechRole: 'user',
    })
    expect(scenario?.steps[3]).toMatchObject({
      mode: 'recommendation',
      recommendations: [
        expect.objectContaining({
          detail: '가장 가까운 졸음쉼터를 찾았습니다. 현재 경로에서 2.4km 거리이고 4분 뒤 도착할 수 있습니다.',
        }),
      ],
    })
  })

  it('does not expose detection-only events as assistant conversation steps', () => {
    const detectionTexts = ['졸음 감지', '휴대폰 사용 감지', '장시간 운전', '주의 분산']
    const visibleConversationText = createNaviAssistantScenarios().flatMap((scenario) => (
      scenario.steps.flatMap((step) => [step.text, step.userText, step.statusLabel].filter(Boolean))
    ))

    expect(visibleConversationText).not.toEqual(expect.arrayContaining(detectionTexts))
  })

  it('does not expose detection metadata in scenario titles', () => {
    const scenarioTitles = createNaviAssistantScenarios().map((scenario) => scenario.title)

    expect(scenarioTitles).not.toEqual(expect.arrayContaining([
      expect.stringContaining('졸음 감지'),
      expect.stringContaining('휴대폰 사용 감지'),
      expect.stringContaining('주의 분산 감지'),
    ]))
  })

  it('resolves speech payloads by scenario and step', () => {
    expect(getScenarioSpeech('route-search-voice', 1)).toMatchObject({
      key: 'route-search-voice-1-agent:어디로 안내할까요?',
      role: 'agent',
      text: '어디로 안내할까요?',
      audioSrc: '/audio/tts/agent/어디로 안내할까요_.mp3',
    })
  })

  it('provides an existing audio file for every aiai speech step', () => {
    const missingAudio = createNaviAssistantScenarios().flatMap((scenario) => (
      scenario.steps.flatMap((step) => {
        if (!step.audioSrc) {
          return []
        }

        const filePath = resolve(process.cwd(), 'public', step.audioSrc.replace(/^\//, ''))

        return existsSync(filePath)
          ? []
          : [`${scenario.id}-${step.id}`]
      })
    ))

    expect(missingAudio).toEqual([])
  })

  it('matches each visible conversation text to the correct orb state', () => {
    const mismatches = createNaviAssistantScenarios().flatMap((scenario) => (
      scenario.steps.flatMap((step, stepIndex) => {
        const location = `${scenario.id}-${stepIndex}-${step.label}`

        if (step.userText) {
          return step.orbState === 'listening' && step.mode === 'user-listening' && step.statusLabel === '듣는 중...' && step.speechRole === 'user'
            ? []
            : [`${location}: user speech should be listening`]
        }

        if (step.text && step.speechRole === 'agent') {
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
