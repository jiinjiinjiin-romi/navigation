import { AIAI_SCENARIO_IDS, debugScenarios } from './debugScenarios'
import type {
  AiaiScenarioStep,
  RoadieAssistantScenario,
  RoadieAssistantStep,
} from './types'

export { AIAI_SCENARIO_IDS }

export function createRoadieAssistantScenarios(): RoadieAssistantScenario[] {
  return debugScenarios.map((scenario) => ({
    id: scenario.id,
    title: createVisibleScenarioTitle(scenario.title),
    steps: getVisibleScenarioSteps(scenario.steps).map(({ step, sourceIndex }) => (
      createRoadieAssistantStep(step, sourceIndex)
    )),
  }))
}

function createVisibleScenarioTitle(title: string) {
  return title
    .replace(/^졸음 감지\s*→\s*/, '')
    .replace(/^휴대폰 사용 감지\s*→\s*/, '')
    .replace(/^주의 분산 감지\s*→\s*/, '')
}

function getVisibleScenarioSteps(steps: AiaiScenarioStep[]) {
  return steps.flatMap((step, sourceIndex) => (
    isDetectionOnlyStep(step) ? [] : [{ step, sourceIndex }]
  ))
}

function isDetectionOnlyStep(step: AiaiScenarioStep) {
  return Boolean(step.detectionEvent && !step.agentSpeech && !step.userSpeech && !step.actionLabel)
}

function createRoadieAssistantStep(
  step: AiaiScenarioStep,
  index: number,
): RoadieAssistantStep {
  const successKeywords = ['완료', '재생', '전송 완료', '경로 시작', '차량 제어', '음성 안내 강화']
  const successText = `${step.title} ${step.actionLabel ?? ''}`
  const isSuccessStep = successKeywords.some((keyword) => successText.includes(keyword))

  if (index === 0 && !step.agentSpeech && !step.userSpeech && !step.actionLabel && !step.detectionEvent) {
    return {
      id: `step-${index}`,
      label: step.title,
      mode: 'idle',
      orbState: 'idle',
      energy: 0,
    }
  }

  if (step.userSpeech) {
    return {
      id: `step-${index}`,
      label: step.title,
      mode: 'user-listening',
      orbState: 'listening',
      energy: 0.72,
      statusLabel: '듣는 중...',
      userText: step.userSpeech,
    }
  }

  if (step.actionLabel) {
    return {
      id: `step-${index}`,
      label: step.title,
      mode: 'recommendation',
      orbState: step.agentSpeech ? 'speaking' : isSuccessStep ? 'success' : 'speaking',
      energy: isSuccessStep ? 0.7 : 0.58,
      text: step.agentSpeech,
      recommendations: [
        {
          type: step.actionLabel.includes('음악') ? 'music' : step.actionLabel.includes('장소') || step.actionLabel.includes('경로') ? 'place' : 'action',
          title: step.actionLabel,
          meta: step.detectionEvent ?? step.title,
          detail: step.agentSpeech ?? step.description,
          action: step.actionLabel.includes('완료') ? '확인' : '실행',
        },
      ],
    }
  }

  return {
    id: `step-${index}`,
    label: step.title,
    mode: 'assistant-speaking',
    orbState: step.agentSpeech ? 'speaking' : isSuccessStep ? 'success' : 'speaking',
    energy: isSuccessStep ? 0.7 : 0.6,
    text: step.agentSpeech ?? step.description,
  }
}
