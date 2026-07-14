import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  advanceDemoScenarioForPresenter,
  createDemoAssistantStep,
  getAssistantSpeechCharacterDelaySeconds,
  getAssistantVisibleOrbState,
  getRoadieAssistantPanelWidth,
  isAssistantVoiceWaveVisible,
  NavigationShell,
  personalizeDemoRoadieMessage,
  resolveAgentPersonalityTtsOptions,
  shouldCompleteDemoScenario,
  shouldEndDemoDrive,
  shouldOpenDemoReport,
} from './NavigationShell'
import {
  advanceDemoScenario,
  createInitialDemoScenarioState,
  getDemoScenarios,
  respondToDemoScenario,
} from '@/features/demo-scenarios'
import {
  createProfile,
  DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  deleteProfile,
  selectProfile,
  updateProfile,
  type Profile,
} from '../api/profileApi'
import { getBootstrap } from '../api/bootstrapApi'
import { createFavorite, deleteSavedPlace, listSavedPlaces, updateSavedPlace } from '../api/savedPlaceApi'
import { createSearchHistory, listSearchHistories } from '../api/searchHistoryApi'
import { getCurrentAddress, getRoadMatch, getRouteOptions, searchPlaces } from '../api/tmapApi'
import { getMusicRecommendations } from '../api/musicApi'
import { synthesizeVoice } from '../api/voiceApi'
import { submitDriveSummary } from '../api/behaviorWarningSensitivityApi'

let routeOptionsOverlayReadyByDefault = true
let latestRouteOptionsOverlayReady: ((ready: boolean) => void) | undefined
const mockPlyrDestroy = vi.hoisted(() => vi.fn())
const mockPlyr = vi.hoisted(() => vi.fn(function PlyrMock() {
  return { destroy: mockPlyrDestroy }
}))

vi.mock('../api/tmapApi', () => ({
  searchPlaces: vi.fn(),
  getRouteOptions: vi.fn(),
  getRoadMatch: vi.fn(),
  getCurrentAddress: vi.fn(),
}))

vi.mock('../api/profileApi', async () => {
  const actual = await vi.importActual<typeof import('../api/profileApi')>('../api/profileApi')

  return {
    ...actual,
    createProfile: vi.fn(),
    deleteProfile: vi.fn(),
    selectProfile: vi.fn(),
    updateProfile: vi.fn(),
  }
})

vi.mock('../api/savedPlaceApi', () => ({
  createFavorite: vi.fn(),
  deleteSavedPlace: vi.fn(),
  listSavedPlaces: vi.fn(),
  updateSavedPlace: vi.fn(),
}))

vi.mock('../api/bootstrapApi', () => ({
  getBootstrap: vi.fn(),
}))

vi.mock('../api/searchHistoryApi', () => ({
  createSearchHistory: vi.fn(),
  listSearchHistories: vi.fn(),
}))

vi.mock('../api/musicApi', () => ({
  getMusicRecommendations: vi.fn(),
}))

vi.mock('../api/voiceApi', () => ({
  synthesizeVoice: vi.fn(async () => new Blob(['audio'], { type: 'audio/mpeg' })),
}))

vi.mock('../api/behaviorWarningSensitivityApi', () => ({
  submitDriveSummary: vi.fn(),
}))

vi.mock('@/features/orb', () => ({
  VoiceOrb: ({
    state,
    energy,
    size,
    colorTheme,
    reducedMotion,
    className,
  }: {
    state: string
    energy?: number
    size?: number | string
    colorTheme?: string
    reducedMotion?: boolean
    className?: string
  }) => (
    <div
      className={className}
      data-color-theme={colorTheme}
      data-energy={energy}
      data-reduced-motion={String(reducedMotion)}
      data-size={size}
      data-state={state}
      data-testid="voice-orb"
    />
  ),
}))

vi.mock('@/features/voice-wave', () => ({
  VoiceWave: ({
    active,
    energy,
    colorTheme,
    reducedMotion,
  }: {
    active: boolean
    energy?: number
    colorTheme?: string
    reducedMotion?: boolean
  }) => (
    <div
      data-active={String(active)}
      data-color-theme={colorTheme}
      data-energy={energy}
      data-reduced-motion={String(reducedMotion)}
      data-testid="voice-wave"
    />
  ),
}))

vi.mock('plyr', () => {
  return {
    default: mockPlyr,
  }
})

vi.mock('boring-avatars', () => ({
  default: ({
    colors,
    name,
    size,
    square,
    variant,
  }: {
    colors?: string[]
    name?: string
    size?: number | string
    square?: boolean
    variant?: string
  }) => (
    <div
      data-colors={colors?.join(',')}
      data-name={name}
      data-size={size}
      data-square={String(square)}
      data-testid="boring-avatar"
      data-variant={variant}
    />
  ),
}))

vi.mock('./TmapPanel', () => ({
  TmapPanel: ({
    currentPosition,
    cameraSettings,
    route,
    routeOptions,
    routeSelectionMode,
    simulationPosition,
    simulationSpeedKph,
    activeRouteOptionId,
    onCameraSettingsChange,
    onRouteOptionsOverlayReady,
    onRouteOptionPreviewChange,
    onSimulationFrameRendererReady,
  }: {
    cameraSettings?: { mode: '2d' | '3d'; zoom: number; pitch: number }
    currentPosition?: { lat: number; lng: number }
    route?: { coordinates: { lat: number; lng: number }[] }
    routeOptions?: Array<{ id: string; label: string; route: { coordinates: { lat: number; lng: number }[] } }>
    routeSelectionMode?: boolean
    simulationPosition?: { lat: number; lng: number }
    simulationSpeedKph?: number
    activeRouteOptionId?: string
    onCameraSettingsChange?: (settings: Partial<{ mode: '2d' | '3d'; zoom: number; pitch: number }>) => void
    onRouteOptionsOverlayReady?: (ready: boolean) => void
    onRouteOptionPreviewChange?: (id: string | undefined) => void
    onSimulationFrameRendererReady?: (renderFrame: ((position: { lat: number; lng: number }) => void) | undefined) => void
  }) => {
    useEffect(() => {
      latestRouteOptionsOverlayReady = onRouteOptionsOverlayReady
      onRouteOptionsOverlayReady?.(Boolean(routeOptions?.length) && routeOptionsOverlayReadyByDefault)

      return () => {
        if (latestRouteOptionsOverlayReady === onRouteOptionsOverlayReady) {
          latestRouteOptionsOverlayReady = undefined
        }
      }
    }, [onRouteOptionsOverlayReady, routeOptions?.length])

    useEffect(() => {
      onSimulationFrameRendererReady?.((position) => {
        window.__lastRenderedSimulationFrame = position
      })
      return () => onSimulationFrameRendererReady?.(undefined)
    }, [onSimulationFrameRendererReady])

    return (
      <div
        data-camera-pitch={cameraSettings?.pitch}
        data-camera-mode={cameraSettings?.mode}
        data-camera-zoom={cameraSettings?.zoom}
        data-route-points={route?.coordinates.length ?? 0}
        data-route-options={routeOptions?.length ?? 0}
        data-route-selection-mode={String(Boolean(routeSelectionMode))}
        data-active-route-option={activeRouteOptionId ?? ''}
        data-simulation-lat={simulationPosition?.lat}
        data-testid="tmap-panel"
      >
        <button
          aria-label="테스트 지도 피치 변경"
          onClick={() => onCameraSettingsChange?.({ pitch: 24 })}
          type="button"
        />
        {routeOptions?.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onRouteOptionPreviewChange?.(option.id)}
          >
            {`지도에서 ${option.label} 경로 선택`}
          </button>
        ))}
        {typeof simulationSpeedKph === 'number' ? (
          <span data-testid="current-speed-number">{Math.max(0, Math.round(simulationSpeedKph))}</span>
        ) : null}
        {simulationPosition
          ? `sim:${simulationPosition.lat.toFixed(4)},${simulationPosition.lng.toFixed(4)}`
          : currentPosition
            ? `current:${currentPosition.lat.toFixed(4)},${currentPosition.lng.toFixed(4)}`
            : 'idle'}
      </div>
    )
  },
}))

const mockedSearchPlaces = vi.mocked(searchPlaces)
const mockedGetRouteOptions = vi.mocked(getRouteOptions)
const mockedGetRoute = vi.fn()
const mockedGetRoadMatch = vi.mocked(getRoadMatch)
const mockedGetCurrentAddress = vi.mocked(getCurrentAddress)
const mockedGetBootstrap = vi.mocked(getBootstrap)
const mockedCreateProfile = vi.mocked(createProfile)
const mockedDeleteProfile = vi.mocked(deleteProfile)
const mockedSelectProfile = vi.mocked(selectProfile)
const mockedUpdateProfile = vi.mocked(updateProfile)
const mockedCreateFavorite = vi.mocked(createFavorite)
const mockedDeleteSavedPlace = vi.mocked(deleteSavedPlace)
const mockedListSavedPlaces = vi.mocked(listSavedPlaces)
const mockedUpdateSavedPlace = vi.mocked(updateSavedPlace)
const mockedCreateSearchHistory = vi.mocked(createSearchHistory)
const mockedListSearchHistories = vi.mocked(listSearchHistories)
const mockedGetMusicRecommendations = vi.mocked(getMusicRecommendations)
const mockedSynthesizeVoice = vi.mocked(synthesizeVoice)
const mockedSubmitDriveSummary = vi.mocked(submitDriveSummary)

const mockProfiles: Profile[] = [
  {
    id: 'profile-1',
    displayName: '민준',
    agentCallName: '로디',
    profileImageUrl: '/storage/profile-images/default-family/father.svg',
    reportEmail: null,
    agentPersonality: 'FRIENDLY' as const,
    warningSensitivity: 'MEDIUM' as const,
    behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
    ttsVoiceId: null,
    ttsSpeed: 1,
    guidanceVolume: 70,
    theme: 'SYSTEM' as const,
    lastUsedAt: null,
    createdAt: '2026-07-02T00:00:00.000000Z',
    updatedAt: '2026-07-02T00:00:00.000000Z',
  },
  {
    id: 'profile-2',
    displayName: '서윤',
    agentCallName: '로디',
    profileImageUrl: null,
    reportEmail: 'seoyun@example.com',
    agentPersonality: 'WARM' as const,
    warningSensitivity: 'HIGH' as const,
    behaviorWarningSensitivity: {
      ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
      FOOD_OR_DRINK: 4,
    },
    ttsVoiceId: null,
    ttsSpeed: 1.2,
    guidanceVolume: 80,
    theme: 'DARK' as const,
    lastUsedAt: '2026-07-02T00:00:00.000000Z',
    createdAt: '2026-07-02T00:00:00.000000Z',
    updatedAt: '2026-07-02T00:00:00.000000Z',
  },
]

function createMockRouteOption(route: Awaited<ReturnType<typeof mockedGetRoute>>) {
  return {
    id: 'route-option-0',
    label: '추천',
    searchOption: '0',
    color: '#0EA5E9',
    isRecommended: true,
    route,
  }
}

describe('NavigationShell', () => {
  it('personalizes demo 로디 messages with the selected profile name', () => {
    expect(
      personalizeDemoRoadieMessage('{{profileName}}, 지금 눈이 조금 무거워 보여요.', '아빠'),
    ).toBe('아빠, 지금 눈이 조금 무거워 보여요.')
    expect(
      personalizeDemoRoadieMessage('{{profileName}}, 전방을 봐주세요.', '지우'),
    ).toBe('지우, 전방을 봐주세요.')
  })

  it('maps Agent personality to distinct CLOVA TTS options', () => {
    expect(resolveAgentPersonalityTtsOptions('FRIENDLY')).toEqual({
      speed: 0,
      pitch: 0,
      volume: 0,
    })
    expect(resolveAgentPersonalityTtsOptions('FORMAL')).toEqual({
      speed: -1,
      pitch: 2,
      volume: 5,
    })
    expect(resolveAgentPersonalityTtsOptions('WARM')).toEqual({
      speed: 0,
      pitch: 4,
      volume: 2,
    })
    expect(resolveAgentPersonalityTtsOptions('WITTY')).toEqual({
      speed: -3,
      pitch: -2,
      volume: 1,
    })
  })

  it('updates the selected profile voice style from the manual risk settings', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const voiceStyleSettingsButton = screen.getByRole('button', { name: '안내 음성 스타일 설정' })
    await waitFor(() => {
      expect(voiceStyleSettingsButton).toBeEnabled()
    })
    fireEvent.click(voiceStyleSettingsButton)
    expect(screen.getByText('안내 음성 스타일')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '크고 또렷한 안내' }))

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-1', { agentPersonality: 'FORMAL' })
    })

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    await waitFor(() => {
      expect(mockedSynthesizeVoice).toHaveBeenCalledWith(
        expect.objectContaining({ speed: -1, pitch: 2, volume: 5 }),
        undefined,
        expect.any(AbortSignal),
      )
    })
  })

  it('updates the selected profile speaker from the manual risk settings', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const settingsButton = screen.getByRole('button', { name: '안내 음성 스타일 설정' })
    await waitFor(() => {
      expect(settingsButton).toBeEnabled()
    })
    fireEvent.click(settingsButton)
    fireEvent.click(screen.getByRole('button', { name: '혜리' }))

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-1', { ttsVoiceId: 'nes_c_hyeri' })
    })
  })

  it('restores profile voice settings after re-entering the selected profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const initialSettingsButton = screen.getByRole('button', { name: '안내 음성 스타일 설정' })
    await waitFor(() => {
      expect(initialSettingsButton).toBeEnabled()
    })
    fireEvent.click(initialSettingsButton)
    fireEvent.click(screen.getByRole('button', { name: '크고 또렷한 안내' }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 선택으로 돌아가기' }))
    fireEvent.click(await screen.findByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByTestId('demo-entry-manual-control-button'))

    const settingsButton = await screen.findByRole('button', { name: '안내 음성 스타일 설정' })
    fireEvent.click(settingsButton)

    expect(screen.getByRole('button', { name: '기본 안내' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '아라' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('uses the selected profile speaker for Roadie TTS', async () => {
    mockedGetBootstrap.mockResolvedValue({
      account: {
        id: 'account-1',
        displayName: '안정현',
        email: 'admin@example.com',
      },
      profiles: [{ ...mockProfiles[0], ttsVoiceId: 'nes_c_hyeri' }],
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '핸드폰 위험 상황 선택' }))

    await waitFor(() => {
      expect(mockedSynthesizeVoice).toHaveBeenCalledWith(
        expect.objectContaining({ speakerId: 'nes_c_hyeri', speakerRole: 'assistant' }),
        undefined,
        expect.any(AbortSignal),
      )
    })
  })

  it('uses the mini scenario personality override for the next Roadie TTS tone', () => {
    const scenario = getDemoScenarios().find((item) => item.scenarioId === 'agent_personality_voice_change')
    const overrideEvent = scenario?.events.find((event) => event.id === 'personality_clear_mode_applied')

    expect(scenario).toBeDefined()
    expect(overrideEvent).toBeDefined()

    const step = createDemoAssistantStep({
      phase: 'scenario',
      scenario: scenario!,
      setupEvent: null,
      scenarioEvent: overrideEvent!,
    }, '민준')

    expect(step.text).toContain('크게, 또박또박')
    expect(step.ttsOptions).toEqual({
      speed: -1,
      pitch: 2,
      volume: 5,
    })
  })

  it('uses a slightly wider 로디 assistant panel while preserving the mobile width cap', () => {
    expect(getRoadieAssistantPanelWidth({ expanded: false, hasRecommendations: false })).toBe('min(21.75rem, calc(100vw - 2rem))')
    expect(getRoadieAssistantPanelWidth({ expanded: true, hasRecommendations: false })).toBe('min(21.75rem, calc(100vw - 2rem))')
    expect(getRoadieAssistantPanelWidth({ expanded: true, hasRecommendations: true })).toBe('min(23.5rem, calc(100vw - 2rem))')
  })

  it('shows the remaining user response before the next 로디 response for drowsiness', () => {
    let state = createInitialDemoScenarioState('drowsy_driver')

    while (state.scenarioEvent?.id !== 'drowsy_first_warning') {
      state = advanceDemoScenario(state)
    }

    state = respondToDemoScenario(state, 'I_AM_OK')

    const userStep = createDemoAssistantStep(state, '민준')

    expect(userStep.userText).toBe('괜찮아')
    expect(userStep.text).toBeUndefined()
    expect(userStep.mode).toBe('user-listening')

    state = advanceDemoScenario(state)

    const roadieStep = createDemoAssistantStep(state, '민준')

    expect(roadieStep.userText).toBeUndefined()
    expect(roadieStep.text).toBe('알겠어요. 그래도 피곤해 보이면 한 번 더 알려드릴게요.')
    expect(roadieStep.mode).toBe('assistant-speaking')
  })

  it('preserves user speech before the next 로디 response for every demo response branch', () => {
    getDemoScenarios().forEach((scenario) => {
      scenario.events
        .filter((event) => event.requiresResponse)
        .forEach((event) => {
          event.responseOptions.forEach((option) => {
            const state = respondToDemoScenario(
              {
                phase: 'scenario',
                scenario,
                setupEvent: null,
                scenarioEvent: event,
              },
              option.value,
            )
            const targetEvent = state.scenarioEvent
            const userStep = createDemoAssistantStep(state, '민준')

            expect(targetEvent?.userSpeech, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe(option.asUserSpeech)
            expect(targetEvent?.eventType, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe('USER_RESPONSE')
            expect(userStep.userText, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe(option.asUserSpeech)
            expect(userStep.text, `${scenario.scenarioId}:${event.id}:${option.value}`).toBeUndefined()

            const nextState = advanceDemoScenario(state)
            const nextEvent = nextState.scenarioEvent
            const roadieStep = createDemoAssistantStep(nextState, '민준')

            if (nextEvent?.roadieMessage) {
              expect(roadieStep.userText, `${scenario.scenarioId}:${event.id}:${option.value}`).toBeUndefined()
              expect(roadieStep.text, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe(
                personalizeDemoRoadieMessage(nextEvent.roadieMessage, '민준'),
              )
              expect(roadieStep.mode, `${scenario.scenarioId}:${event.id}:${option.value}`).toBe('assistant-speaking')
            }
          })
        })
    })
  })

  it('attaches recommendation cards only to demo action detail responses', () => {
    const drowsyScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'drowsy_driver')
    const phoneScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'phone_usage')
    const deviceScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'device_operation')
    const routeEvent = drowsyScenario?.events.find((event) => event.id === 'drowsy_rest_area_guidance_started')
    const phonePreviewEvent = phoneScenario?.events.find((event) => event.id === 'phone_message_preview')
    const deviceAssistEvent = deviceScenario?.events.find((event) => event.id === 'device_music_offer')
    const musicEvent = deviceScenario?.events.find((event) => event.id === 'device_music_preview')

    expect(routeEvent).toBeDefined()
    expect(phonePreviewEvent).toBeDefined()
    expect(deviceAssistEvent).toBeDefined()
    expect(musicEvent).toBeDefined()

    const routeStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: drowsyScenario!,
      setupEvent: null,
      scenarioEvent: routeEvent!,
    }, '민준')
    const phonePreviewStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: phoneScenario!,
      setupEvent: null,
      scenarioEvent: phonePreviewEvent!,
    }, '민준')
    const deviceAssistStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: deviceScenario!,
      setupEvent: null,
      scenarioEvent: deviceAssistEvent!,
    }, '민준')
    const musicStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: deviceScenario!,
      setupEvent: null,
      scenarioEvent: musicEvent!,
    }, '민준')

    expect(routeStep.recommendations).toEqual([
      expect.objectContaining({ type: 'place', title: '경로 변경 완료' }),
    ])
    expect(phonePreviewStep.recommendations).toEqual([
      expect.objectContaining({ type: 'action', title: '석현님에게 보낼 메시지', action: '보내기' }),
    ])
    expect(deviceAssistStep.recommendations).toBeUndefined()
    expect(musicStep.recommendations).toEqual([
      expect.objectContaining({ type: 'music', title: '붉은 노을', meta: '빅뱅' }),
    ])
  })

  it('creates phone message preview recommendation data for the message confirmation panel', () => {
    const phoneScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'phone_usage')
    const phonePreviewEvent = phoneScenario?.events.find((event) => event.id === 'phone_message_preview')

    expect(phonePreviewEvent).toBeDefined()

    const previewStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: phoneScenario!,
      setupEvent: null,
      scenarioEvent: phonePreviewEvent!,
    }, '민준')

    expect(previewStep.recommendations).toEqual([
      expect.objectContaining({
        type: 'action',
        title: '석현님에게 보낼 메시지',
        meta: '문자 초안',
        detail: '20분정도 늦을 것 같아.',
        action: '보내기',
      }),
    ])
  })

  it('does not show a duplicate recommendation card for the phone assist offer prompt', () => {
    const phoneScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'phone_usage')
    const phoneAssistEvent = phoneScenario?.events.find((event) => event.id === 'phone_assist_offer')

    expect(phoneAssistEvent).toBeDefined()

    const phoneAssistStep = createDemoAssistantStep({
      phase: 'scenario',
      scenario: phoneScenario!,
      setupEvent: null,
      scenarioEvent: phoneAssistEvent!,
    }, '민준')

    expect(phoneAssistStep.text).toBe('지금 확인하려는 내용, 제가 대신 처리해드릴까요?')
    expect(phoneAssistStep.recommendations).toBeUndefined()
  })

  it('skips silent demo presenter states instead of rendering an empty panel across scenarios', () => {
    getDemoScenarios().forEach((scenario) => {
      const startedEvent = scenario.events.find((event) => event.id.endsWith('_session_started'))

      expect(startedEvent, scenario.scenarioId).toBeDefined()

      const firstVisibleState = advanceDemoScenarioForPresenter({
        phase: 'scenario',
        scenario,
        setupEvent: null,
        scenarioEvent: startedEvent!,
      })

      expect(firstVisibleState.scenarioEvent?.uiState.visibleStatus, scenario.scenarioId).not.toBe('정상 주행')
      expect(firstVisibleState.scenarioEvent?.id, scenario.scenarioId).not.toBe(startedEvent?.id)
    })

    const drowsyScenario = getDemoScenarios().find((scenario) => scenario.scenarioId === 'drowsy_driver')
    const monitoringEvent = drowsyScenario?.events.find((event) => event.id === 'drowsy_monitoring_resumed')

    expect(monitoringEvent).toBeDefined()

    const repeatedDetectionState = advanceDemoScenarioForPresenter({
      phase: 'scenario',
      scenario: drowsyScenario!,
      setupEvent: null,
      scenarioEvent: monitoringEvent!,
    })

    expect(repeatedDetectionState.scenarioEvent?.id).toBe('drowsy_repeated_detection')
  })

  it('keeps the drive-end message visible before opening the report panel across scenarios', () => {
    getDemoScenarios().forEach((scenario) => {
      const endingSourceEvent = [...scenario.events].reverse().find((event) => event.nextEventId?.endsWith('_session_ended'))

      expect(endingSourceEvent, scenario.scenarioId).toBeDefined()

      const endedState = advanceDemoScenarioForPresenter({
        phase: 'scenario',
        scenario,
        setupEvent: null,
        scenarioEvent: endingSourceEvent!,
      })
      const reportReadyState = advanceDemoScenarioForPresenter(endedState)

      expect(endedState.scenarioEvent?.eventType, scenario.scenarioId).toBe('SESSION_ENDED')
      expect(endedState.scenarioEvent?.roadieMessage, scenario.scenarioId).toBe('오늘 주행이 끝났어요. 운전 리포트를 정리해드릴게요.')
      expect(shouldEndDemoDrive(endedState), scenario.scenarioId).toBe(true)
      expect(shouldCompleteDemoScenario(endedState), scenario.scenarioId).toBe(false)
      expect(shouldOpenDemoReport(endedState), scenario.scenarioId).toBe(false)
      expect(reportReadyState.scenarioEvent?.eventType, scenario.scenarioId).toBe('REPORT_READY')
      expect(shouldEndDemoDrive(reportReadyState), scenario.scenarioId).toBe(false)
      expect(shouldCompleteDemoScenario(reportReadyState), scenario.scenarioId).toBe(true)
      expect(shouldOpenDemoReport(reportReadyState), scenario.scenarioId).toBe(true)
    })
  })

  const mockGeolocationSuccess = (latitude = 37.5665, longitude = 126.978) => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: { latitude, longitude },
          } as GeolocationPosition)
        }),
      },
    })
  }

  const mockGeolocationError = () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((_: PositionCallback, error: PositionErrorCallback) => {
          error({ code: 1 } as GeolocationPositionError)
        }),
      },
    })
  }

  beforeEach(() => {
    routeOptionsOverlayReadyByDefault = true
    latestRouteOptionsOverlayReady = undefined
    vi.useRealTimers()
    window.history.replaceState(null, '', '/')
    mockedSearchPlaces.mockReset()
    mockedGetRoute.mockReset()
    mockedGetRouteOptions.mockReset()
    mockedGetRouteOptions.mockImplementation(async (...args) => [
      createMockRouteOption(await mockedGetRoute(...args)),
    ])
    mockedGetRoadMatch.mockReset()
    mockedGetCurrentAddress.mockReset()
    mockedGetBootstrap.mockReset()
    mockedCreateProfile.mockReset()
    mockedDeleteProfile.mockReset()
    mockedSelectProfile.mockReset()
    mockedUpdateProfile.mockReset()
    mockedCreateFavorite.mockReset()
    mockedDeleteSavedPlace.mockReset()
    mockedListSavedPlaces.mockReset()
    mockedUpdateSavedPlace.mockReset()
    mockedCreateSearchHistory.mockReset()
    mockedListSearchHistories.mockReset()
    mockedGetMusicRecommendations.mockReset()
    mockedSynthesizeVoice.mockReset()
    mockedSubmitDriveSummary.mockReset()
    mockedSubmitDriveSummary.mockResolvedValue({
      behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
    })
    mockedSynthesizeVoice.mockResolvedValue(new Blob(['audio'], { type: 'audio/mpeg' }))
    mockedGetMusicRecommendations.mockResolvedValue([
      {
        id: 'itunes-soft-focus',
        title: 'Soft Focus',
        artist: 'Evening Route',
        album: 'Bright Pop Drive',
        duration: '3:08',
        durationSeconds: 188,
        coverUrl: 'https://example.com/soft-focus.jpg',
        sourceUrl: 'https://music.apple.com/kr/album/soft-focus/123?i=123',
        provider: 'itunes',
      },
      {
        id: 'itunes-drive-neon',
        title: 'Drive Neon',
        artist: 'ROADIE Session',
        album: 'City Pulse',
        duration: '3:24',
        durationSeconds: 204,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/album/drive-neon/456?i=456',
        provider: 'itunes',
      },
    ])
    mockedGetBootstrap.mockResolvedValue({
      account: {
        id: 'account-1',
        displayName: '안정현',
        email: 'admin@example.com',
      },
      profiles: mockProfiles,
      selectedProfileId: null,
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    mockedCreateProfile.mockImplementation(async (payload) => ({
      ...mockProfiles[0],
      id: 'profile-created',
      displayName: payload.displayName,
      agentCallName: payload.agentCallName,
      reportEmail: payload.reportEmail,
      agentPersonality: payload.agentPersonality,
      behaviorWarningSensitivity: payload.behaviorWarningSensitivity,
      ttsVoiceId: payload.ttsVoiceId,
      ttsSpeed: payload.ttsSpeed,
      guidanceVolume: payload.guidanceVolume,
    }))
    mockedDeleteProfile.mockResolvedValue(undefined)
    mockedSelectProfile.mockResolvedValue({
      selectedProfileId: 'profile-1',
      selectedAt: '2026-07-02T00:00:00.000000Z',
    })
    mockedUpdateProfile.mockImplementation(async (profileId, payload) => ({
      ...mockProfiles[0],
      ...payload,
      id: profileId,
    }))
    mockedListSavedPlaces.mockResolvedValue({
      fixedPlaces: {
        home: {
          id: 'home-id',
          placeType: 'HOME',
          label: '집',
          provider: 'TMAP',
          providerPlaceId: 'origin:default-home',
          address: '서울 중구 세종대로 110',
          latitude: 37.5547,
          longitude: 126.9706,
        },
        work: {
          id: 'work-id',
          placeType: 'WORK',
          label: '회사',
          provider: 'TMAP',
          providerPlaceId: 'destination:default-work',
          address: '서울 강남구 테헤란로 152',
          latitude: 37.4979,
          longitude: 127.0276,
        },
        school: null,
      },
      favorites: [
        {
          id: 'favorite-id',
          placeType: 'FAVORITE',
          label: '성수 카페',
          provider: 'KAKAO',
          providerPlaceId: null,
          address: '서울 성동구 성수동',
          latitude: 37.5442,
          longitude: 127.0557,
        },
      ],
    })
    mockedCreateFavorite.mockResolvedValue({
      id: 'added-label-id',
      placeType: 'FAVORITE',
      label: '세종대학교',
      provider: 'TMAP',
      providerPlaceId: 'current-location',
      address: '서울특별시 중구 세종대로 110',
      latitude: 37.5665,
      longitude: 126.978,
      createdAt: '2026-07-03T00:00:00.000000Z',
      updatedAt: '2026-07-03T00:00:00.000000Z',
    })
    mockedDeleteSavedPlace.mockResolvedValue(undefined)
    mockedUpdateSavedPlace.mockResolvedValue({
      id: 'favorite-id',
      placeType: 'FAVORITE',
      label: '성수 작업실',
      provider: 'KAKAO',
      providerPlaceId: null,
      address: '서울 성동구 성수동',
      latitude: 37.5442,
      longitude: 127.0557,
    })
    mockedCreateSearchHistory.mockResolvedValue({
      id: 1,
      query: '서울역',
      provider: 'TMAP',
      providerPlaceId: 'poi-1',
      placeName: '서울역',
      address: '서울 중구 봉래동2가',
      latitude: 37.5547,
      longitude: 126.9706,
      searchedAt: '2026-07-03T00:00:00.000000Z',
    })
    mockedListSearchHistories.mockResolvedValue({
      items: [
        {
          id: 11,
          query: '서울역',
          provider: 'TMAP',
          providerPlaceId: 'poi-history-1',
          placeName: '서울역',
          address: '서울 중구 봉래동2가',
          latitude: 37.5547,
          longitude: 126.9706,
          searchedAt: '2026-07-03T00:00:00.000000Z',
        },
      ],
      page: 1,
      size: 10,
      total: 1,
      totalPages: 1,
    })
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(new Error('test audio fallback')))
    HTMLMediaElement.prototype.pause = vi.fn()
    mockedGetRoadMatch.mockResolvedValue([
      {
        sourceIndex: 0,
        coordinate: { lat: 37.5665, lng: 126.978 },
        speedLimitKph: 50,
        roadCategory: 5,
      },
    ])
    mockedGetCurrentAddress.mockResolvedValue('서울특별시 중구 세종대로 110')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 24,
          weather_code: 0,
        },
      }),
    })))
    mockGeolocationSuccess()
  })

  const clickManualRiskNext = () => {
    fireEvent.click(within(screen.getByTestId('manual-risk-control-panel')).getByRole('button', { name: '다음' }))
  }

  const openRouteSearchSummary = async () => {
    await enterFreeNavigationIfNeeded()

    const existingDestinationField = screen.queryByPlaceholderText('목적지 검색')
    if (existingDestinationField) {
      return existingDestinationField
    }

    const summaryDestinationField = screen.queryByRole('combobox', { name: '목적지' })
    if (summaryDestinationField) {
      fireEvent.focus(summaryDestinationField)
      return screen.findByPlaceholderText('목적지 검색')
    }

    const searchButton = await screen.findByRole('button', { name: /어디로 갈까요/ })
    await waitFor(() => {
      expect(searchButton).not.toBeDisabled()
    })
    fireEvent.click(searchButton)

    return screen.findByPlaceholderText('목적지 검색')
  }

  const enterFreeNavigationIfNeeded = async () => {
    if (!screen.queryByTestId('tmap-panel')) {
      await waitFor(() => {
        expect(
          screen.queryByTestId('demo-entry-manual-control-button') ??
            screen.queryByRole('button', { name: '네비게이션 이용하기' }),
        ).toBeTruthy()
      })

      const directControlButton = screen.queryByTestId('demo-entry-manual-control-button')
      if (directControlButton) {
        fireEvent.click(directControlButton)
      } else {
        fireEvent.click(await screen.findByRole('button', { name: '네비게이션 이용하기' }))
      }
    }

    await screen.findByTestId('tmap-panel')
  }

  it('opens on demo mode selection without requiring a profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    expect(await screen.findByTestId('demo-entry-mode-selection')).toBeInTheDocument()
    expect(screen.queryByTestId('navigation-profile-setup')).not.toBeInTheDocument()
    expect(screen.getByTestId('demo-entry-scenario-button')).toBeInTheDocument()
    expect(screen.getByTestId('demo-entry-manual-control-button')).toBeInTheDocument()
  })

  it('uses 상우 in representative scenario selection without selecting a profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-scenario-button'))

    expect(await screen.findByTestId('demo-scenario-selection')).toHaveTextContent('상우')
    expect(screen.getByTestId('demo-scenario-selection')).not.toHaveTextContent('민준 프로필')
  })

  it('opens profile selection for manual control and enters navigation after choosing a profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-manual-control-button'))
    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))

    await waitFor(() => {
      expect(mockedSelectProfile).toHaveBeenCalledWith('profile-1')
    })
    expect(await screen.findByTestId('manual-risk-control-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '프로필 변경' })).toBeInTheDocument()
  })

  const openOriginEditor = async () => {
    await openRouteSearchSummary()
    fireEvent.click(screen.getByRole('button', { name: '경로 입력으로 돌아가기' }))
    await screen.findByRole('combobox', { name: '출발 위치' })
    fireEvent.focus(screen.getByRole('combobox', { name: '출발 위치' }))

    return screen.findByPlaceholderText('출발지 검색')
  }

  const openDestinationEditor = async () => {
    await openRouteSearchSummary()
    fireEvent.focus(screen.getByRole('combobox', { name: '목적지' }))

    return screen.findByPlaceholderText('목적지 검색')
  }

  it('loads backend profiles before entering navigation and selects one', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('navigation-profile-setup')).toBeInTheDocument()
    expect(screen.getByTestId('navigation-viewport')).toContainElement(screen.getByTestId('navigation-profile-setup'))
    expect(screen.getByTestId('navigation-stage')).not.toBe(screen.getByTestId('navigation-profile-setup').parentElement)
    expect(screen.queryByTestId('tmap-panel')).not.toBeInTheDocument()
    expect(mockedGetCurrentAddress).not.toHaveBeenCalled()
    expect(mockedGetRoadMatch).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '오늘은 누가 운전할까요?' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /민준 프로필 선택/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /서윤 프로필 선택/ })).toBeInTheDocument()
    const minjunProfileButton = screen.getByRole('button', { name: /민준 프로필 선택/ })
    const minjunProfileImage = minjunProfileButton.querySelector('img')
    expect(minjunProfileImage).toHaveAttribute('src', '/storage/profile-images/default-family/father.svg')
    const avatars = screen.getAllByTestId('boring-avatar')
    expect(avatars).toHaveLength(1)
    expect(avatars[0]).toHaveAttribute('data-name', '서윤')
    expect(avatars[0]).toHaveAttribute('data-variant', 'beam')
    expect(avatars[0]).toHaveAttribute('data-size', '176')
    expect(avatars[0]).toHaveAttribute('data-square', 'true')
    expect(screen.queryByText('로디')).not.toBeInTheDocument()
    expect(screen.queryByText('로디')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '프로필 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로디 시작' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '프로필 수정' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '민준 프로필 메뉴' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /민준 프로필 선택/ }))
    expect(screen.getByRole('button', { name: '민준(으)로 시작' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '프로필 수정' })).not.toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))

    await waitFor(() => {
      expect(mockedSelectProfile).toHaveBeenCalledWith('profile-1')
      expect(screen.queryByTestId('navigation-profile-setup')).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('demo-entry-mode-selection')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /대표 시나리오 보기/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /실시간 위험 상황 조작/ })).toBeInTheDocument()
    expect(screen.getByText('준비된 위험행동 흐름을 순서대로 확인합니다.')).not.toHaveClass('max-w-[18rem]')
    expect(screen.getByText('데모 사용자가 직접 위험 상황을 선택하고 조작합니다.')).not.toHaveClass('max-w-[18rem]')
    fireEvent.click(screen.getByRole('button', { name: /대표 시나리오 보기/ }))
    expect(screen.getByTestId('demo-scenario-selection')).toBeInTheDocument()
    expect(screen.getByTestId('demo-scenario-card-agent_personality_voice_change')).not.toHaveClass('col-span-full')
    expect(screen.getByTestId('demo-scenario-card-agent_personality_voice_change').querySelector(':scope > span')).toHaveClass(
      'inset-x-0',
      'top-0',
      'h-1',
    )
    expect(screen.getByTestId('demo-scenario-card-drowsy_driver')).toHaveClass('min-h-[12rem]')
    expect(screen.getByTestId('demo-scenario-card-gaze_away_attention')).toHaveTextContent('시선 이탈 감지')
    expect(screen.getByTestId('demo-scenario-card-reaching_behind_check')).toHaveTextContent('뒷좌석 확인 감지')
    expect(within(screen.getByTestId('demo-scenario-card-drowsy_driver')).getByText('01')).toHaveClass('text-2xl')
    expect(screen.queryByTestId('demo-scenario-placeholder-card')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '< 데모 모드 선택' }))
    expect(screen.getByTestId('demo-entry-mode-selection')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /실시간 위험 상황 조작/ }))
    expect(await screen.findByTestId('manual-risk-control-panel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '졸음 위험 상황 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기기조작 위험 상황 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '섭취 위험 상황 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '경고 위험 상황 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /어디로 갈까요/ })).toBeInTheDocument()
  })

  it('does not render a free navigation entry button in demo scenario selection', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: /대표 시나리오 보기/ }))
    expect(screen.getByTestId('demo-scenario-selection')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '네비게이션 이용하기' })).not.toBeInTheDocument()
  })

  it('returns between demo selection screens with labeled back buttons', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))

    fireEvent.click(await screen.findByRole('button', { name: '< 프로필 선택' }))

    expect(await screen.findByRole('heading', { name: '오늘은 누가 운전할까요?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: /대표 시나리오 보기/ }))
    fireEvent.click(await screen.findByRole('button', { name: '< 데모 모드 선택' }))

    expect(screen.getByTestId('demo-entry-mode-selection')).toBeInTheDocument()
  })

  it('stacks manual risk depth only for the same driver behavior', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' })).not.toHaveAttribute('aria-pressed')
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('핸드폰')).toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('1/3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰으로 할 일이 있으면 제가 도와드릴게요. 어떤 도움이 필요하세요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.' })).toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('2/3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰 사용을 즉시 중단하세요. 지금은 전방만 봐야 합니다.')).toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('3/3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('1/3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '괜찮아. 조금 더 갈 수 있어.' })).not.toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('졸음')).toBeInTheDocument()
    expect(within(screen.getByTestId('manual-risk-stack-status')).getByText('1/3')).toBeInTheDocument()
  })

  it('submits the final manual risk summary and opens sensitivity settings after completion', async () => {
    let resolveDriveSummary: ((value: { behaviorWarningSensitivity: typeof DEFAULT_BEHAVIOR_WARNING_SENSITIVITY }) => void) | undefined
    mockedSubmitDriveSummary.mockImplementation(() => new Promise((resolve) => {
      resolveDriveSummary = resolve
    }))
    const queryClient = new QueryClient()

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
        </QueryClientProvider>,
      )

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '안내 음성 스타일 설정' })).toBeEnabled()
      })

      const status = screen.getByTestId('manual-risk-stack-status')
      const controlPanel = screen.getByTestId('manual-risk-control-panel')
      expect(within(status).queryByRole('button', { name: '운전 종료' })).not.toBeInTheDocument()
      expect(within(controlPanel).getByRole('button', { name: '운전 종료' })).toBeDisabled()

      fireEvent.click(screen.getByRole('button', { name: '안내 음성 스타일 설정' }))
      expect(screen.getByRole('button', { name: '기본 안내' })).toBeEnabled()

      fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
      fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
      fireEvent.click(within(controlPanel).getByRole('button', { name: '운전 종료' }))

      expect(await screen.findByText('오늘 운전 결과를 기반으로 민감도 업데이트를 진행할까요?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '경고 위험 상황 선택' })).toBeDisabled()
      expect(within(controlPanel).getByRole('button', { name: '운전 종료' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '안내 음성 스타일 설정' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '기본 안내' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '응 반영해줘.' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '프로필 선택으로 돌아가기' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '설정' })).toBeEnabled()

      fireEvent.click(screen.getByRole('button', { name: '응 반영해줘.' }))

      expect(screen.getByTestId('drive-summary-navigation-lock')).toBeInTheDocument()

      await new Promise((resolve) => window.setTimeout(resolve, 0))
      await act(async () => {
        await Promise.resolve()
      })
      expect(mockedSubmitDriveSummary).toHaveBeenCalledWith('profile-1', {
        telemetryEvents: expect.arrayContaining([
          { behaviorType: 'PHONE_USE', clickCount: 1, level: 1 },
          { behaviorType: 'DROWSINESS', clickCount: 1, level: 1 },
          { behaviorType: 'SECONDARY_TASK', clickCount: 0, level: 0 },
          { behaviorType: 'FOOD_OR_DRINK', clickCount: 0, level: 0 },
        ]),
      })
      expect(screen.getByText('반영 중…')).toBeInTheDocument()

      vi.useFakeTimers()
      await act(async () => {
        resolveDriveSummary?.({ behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY })
        await Promise.resolve()
      })
      expect(screen.getByText('반영 완료되었습니다!')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '프로필 선택으로 돌아가기' })).toHaveAttribute(
        'data-profile-return-attention',
        'true',
      )

      await act(async () => {
        vi.advanceTimersByTime(2_999)
      })
      expect(screen.queryByRole('heading', { name: '행동별 경고 민감도' })).not.toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(1)
      })
      vi.useRealTimers()
      expect(await screen.findByRole('heading', { name: '행동별 경고 민감도' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns to profile selection from the manual risk control panel', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const controlPanel = screen.getByTestId('manual-risk-control-panel')
    fireEvent.click(within(controlPanel).getByRole('button', { name: '프로필 선택으로 돌아가기' }))

    expect(await screen.findByRole('heading', { name: '오늘은 누가 운전할까요?' })).toBeInTheDocument()
  })

  it('resets the drive-summary session and reloads backend sensitivity after returning to the profile', async () => {
    const refreshedBehaviorWarningSensitivity = {
      ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
      DROWSINESS: 6 as const,
    }
    let bootstrapRequestCount = 0
    mockedGetBootstrap.mockImplementation(async () => ({
      account: {
        id: 'account-1',
        displayName: '안정현',
        email: 'admin@example.com',
      },
      profiles: mockProfiles.map((profile) => profile.id === 'profile-1'
        ? {
            ...profile,
            behaviorWarningSensitivity: bootstrapRequestCount++ === 0
              ? DEFAULT_BEHAVIOR_WARNING_SENSITIVITY
              : refreshedBehaviorWarningSensitivity,
          }
        : profile),
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    }))
    mockedSubmitDriveSummary.mockResolvedValue({
      behaviorWarningSensitivity: {
        ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        DROWSINESS: 10 as const,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const controlPanel = await screen.findByTestId('manual-risk-control-panel')
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(within(controlPanel).getByRole('button', { name: '운전 종료' }))
    fireEvent.click(await screen.findByRole('button', { name: '응 반영해줘.' }))
    expect(await screen.findByText('반영 완료되었습니다!')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '프로필 선택으로 돌아가기' }))
    expect(await screen.findByRole('heading', { name: '오늘은 누가 운전할까요?' })).toBeInTheDocument()
    expect(mockedUpdateProfile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    await waitFor(() => {
      expect(mockedSelectProfile).toHaveBeenCalledWith('profile-1')
    })
    fireEvent.click(await screen.findByTestId('demo-entry-manual-control-button'))

    const resetControlPanel = await screen.findByTestId('manual-risk-control-panel')
    expect(screen.getByRole('button', { name: '졸음 위험 상황 선택' })).toBeEnabled()
    expect(within(resetControlPanel).getByRole('button', { name: '운전 종료' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    fireEvent.click(await screen.findByRole('button', { name: '민감도 수정' }))
    expect(await screen.findByLabelText('졸음 민감도 값')).toHaveTextContent('6')
  })

  it('renders manual risk response options at the bottom of the manual control panel', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰으로 할 일이 있으면 제가 도와드릴게요. 어떤 도움이 필요하세요?')).toBeInTheDocument()

    const controlPanel = screen.getByTestId('manual-risk-control-panel')
    const roadiePanel = screen.getByTestId('roadie-assistant-panel')
    const messageOptionName = '아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.'

    expect(within(controlPanel).getByRole('button', { name: messageOptionName })).toBeInTheDocument()
    expect(within(roadiePanel).queryByRole('button', { name: messageOptionName })).not.toBeInTheDocument()
  })

  it('renders the confirmed manual risk text and options for every driver behavior', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰으로 할 일이 있으면 제가 도와드릴게요. 어떤 도움이 필요하세요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '대전역 성심당 근처에 뭐가 있는지 찾아줘.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '여름 휴가가는 중이야. 신나는 노래 틀어줘.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰 사용을 즉시 중단하세요. 지금은 전방만 봐야 합니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('졸음이 계속되면 위험해요. 잠 깰 수 있게 도와드릴까요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '괜찮아. 조금 더 갈 수 있어.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '창문 조금만 열어줘.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '잠 깨는 밝은 음악 틀어줘.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('더 이상 운전하면 안 됩니다. 가까운 곳에 정차하고 반드시 쉬어가세요.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작은 잠시 멈추고 운전에 집중해주세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작이 필요하면 제가 도와드릴게요. 어떤 기능이 필요하세요?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '빅뱅의 붉은 노을 틀어줘.' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '성심당으로 도착지 변경해줘.' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작을 즉시 중단하세요. 두 손은 운전에만 사용해야 합니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    expect(await screen.findByText('음식이나 음료는 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    expect(await screen.findByText('먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '빅뱅의 붉은 노을 틀어줘.' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '성심당으로 도착지 변경해줘.' })).not.toBeInTheDocument()
    })
  })

  it('keeps the sent message panel for two seconds and handles closing it first', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.' }))

    expect(screen.getByTestId('roadie-assistant-user-text')).toHaveTextContent('아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.')
    expect(within(screen.getByTestId('manual-risk-control-panel')).getByRole('button', { name: '다음' })).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 600))
    })

    expect(screen.getByTestId('roadie-assistant-user-text')).toHaveTextContent('아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.')
    expect(screen.queryByText('아빠에게 10분 정도 늦을 것 같다고 보낼게요. 이렇게 보내면 될까요?')).not.toBeInTheDocument()

    clickManualRiskNext()
    expect(await screen.findByText('아빠에게 10분 정도 늦을 것 같다고 보낼게요. 이렇게 보내면 될까요?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '응 그렇게 보내줘.' }))

    expect(screen.getByTestId('roadie-assistant-user-text')).toHaveTextContent('응 그렇게 보내줘.')
    clickManualRiskNext()
    expect(await screen.findByText('전송 완료되었습니다.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_700))
    })
    expect(screen.getByText('전송 완료되었습니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('전송 완료되었습니다.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '아빠한테 10분 정도 늦을 것 같다고 문자 보내줘.' }))
    clickManualRiskNext()
    fireEvent.click(await screen.findByRole('button', { name: '응 그렇게 보내줘.' }))
    clickManualRiskNext()
    expect(await screen.findByText('전송 완료되었습니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '로디 AI 에이전트 닫기' }))
    expect(screen.queryByText('전송 완료되었습니다.')).not.toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2_100))
    })
    expect(screen.queryByText('전송 완료되었습니다.')).not.toBeInTheDocument()
    expect(screen.getByTestId('manual-risk-control-panel')).toBeInTheDocument()
  }, 10_000)

  it('closes intake manual risk warnings after the configured timing', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    expect(await screen.findByText('음식이나 음료는 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 4_700))
    })
    expect(screen.getByText('음식이나 음료는 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('음식이나 음료는 잠시 내려두고 전방을 봐주세요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    expect(await screen.findByText('먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 6_700))
    })
    expect(screen.getByText('먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })
  }, 15_000)

  it('closes depth one manual risk warnings after their configured timing', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_700))
    })
    expect(screen.getByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5_700))
    })
    expect(screen.getByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작은 잠시 멈추고 운전에 집중해주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_700))
    })
    expect(screen.getByText('기기 조작은 잠시 멈추고 운전에 집중해주세요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('기기 조작은 잠시 멈추고 운전에 집중해주세요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })
  }, 20_000)

  it('uses configured search cards and real music data for manual risk follow-up cards', async () => {
    const queryClient = new QueryClient()
    mockedSearchPlaces.mockResolvedValue([])
    mockedGetMusicRecommendations.mockResolvedValueOnce([
      {
        id: 'red-sunset',
        title: '붉은 노을',
        artist: '빅뱅',
        album: 'Remember',
        duration: '4:03',
        durationSeconds: 243,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/song/red-sunset',
        provider: 'itunes',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '대전역 성심당 근처에 뭐가 있는지 찾아줘.' }))
    clickManualRiskNext()
    await waitFor(() => expect(screen.getByText('맛집과 관광지 중에서 어떤 걸 찾아볼까요?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '대전역 성심당 근처 맛집 찾아줘.' }))
    clickManualRiskNext()

    expect(mockedSearchPlaces).not.toHaveBeenCalled()
    expect(await screen.findByText('월산본가')).toBeInTheDocument()
    expect(screen.getByText('선화동소머리해장국')).toBeInTheDocument()
    expect(screen.getByText('미도인 대전')).toBeInTheDocument()
    expect(screen.getByText('대전역 성심당 근처 맛집들은 아래와 같아요. 특히 월산본가가 좋아 보여요.')).toBeInTheDocument()
    expect(screen.getByTestId('manual-risk-result-cards')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('manual-risk-result-cards')).toHaveClass('max-h-[16rem]')
    expect(screen.getByTestId('manual-risk-result-cards-scroll')).toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('manual-risk-result-cards-scroll')).toHaveClass('overscroll-contain')
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 8_700))
    })
    expect(screen.getByText('월산본가')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('월산본가')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '대전역 성심당 근처에 뭐가 있는지 찾아줘.' }))
    clickManualRiskNext()
    fireEvent.click(await screen.findByRole('button', { name: '대전 관광지 찾아줘.' }))
    clickManualRiskNext()

    expect(mockedSearchPlaces).not.toHaveBeenCalled()
    expect(await screen.findByText('한밭수목원')).toBeInTheDocument()
    expect(screen.getByText('국립중앙과학관')).toBeInTheDocument()
    expect(screen.getByText('대전 관광지는 아래와 같아요. 특히 한밭수목원이 좋아 보여요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로디 AI 에이전트 닫기' }))
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 7_100))
    })
    expect(screen.queryByText('한밭수목원')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작은 잠시 멈추고 운전에 집중해주세요.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    expect(await screen.findByText('기기 조작이 필요하면 제가 도와드릴게요. 어떤 기능이 필요하세요?')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '빅뱅의 붉은 노을 틀어줘.' }))
    clickManualRiskNext()

    expect(await screen.findByTestId('music-mini-player')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedGetMusicRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '빅뱅 붉은 노을' }),
        undefined,
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findAllByText('붉은 노을')).toHaveLength(2)
    expect(screen.getAllByText('빅뱅')).toHaveLength(2)
    expect(screen.getByText('빅뱅의 붉은 노을을 재생해드릴게요.')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_700))
    })
    expect(screen.getByTestId('music-mini-player')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('music-mini-player')).not.toBeInTheDocument()
      expect(screen.queryByTestId('roadie-assistant-music-recommendation-card')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '빅뱅의 붉은 노을 틀어줘.' }))
    clickManualRiskNext()
    expect(await screen.findByTestId('music-mini-player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '로디 AI 에이전트 닫기' }))
    expect(screen.queryByTestId('roadie-assistant-music-recommendation-card')).not.toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_600))
    })
    expect(screen.queryByTestId('roadie-assistant-music-recommendation-card')).not.toBeInTheDocument()
  }, 30_000)

  it('keeps the phone music result panel for four seconds before closing it', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '여름 휴가가는 중이야. 신나는 노래 틀어줘.' }))
    clickManualRiskNext()

    expect(await screen.findByTestId('music-mini-player')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedGetMusicRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '여름 휴가 신나는 노래', mood: 'drive' }),
        undefined,
        expect.any(AbortSignal),
      )
    })
    expect(screen.getByText('신나는 분위기에 맞는 음악을 준비할게요.')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_700))
    })
    expect(screen.getByTestId('music-mini-player')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('music-mini-player')).not.toBeInTheDocument()
      expect(screen.queryByTestId('roadie-assistant-music-recommendation-card')).not.toBeInTheDocument()
    }, { timeout: 1_000 })
  }, 10_000)

  it('clears configured search cards when another manual risk is selected', async () => {
    const queryClient = new QueryClient()
    mockedSearchPlaces.mockResolvedValue([])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '대전역 성심당 근처에 뭐가 있는지 찾아줘.' }))
    clickManualRiskNext()
    await waitFor(() => expect(screen.getByText('맛집과 관광지 중에서 어떤 걸 찾아볼까요?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '대전역 성심당 근처 맛집 찾아줘.' }))
    clickManualRiskNext()
    expect(screen.getByText('월산본가')).toBeInTheDocument()
    expect(mockedSearchPlaces).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()

    expect(screen.getByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('월산본가')).not.toBeInTheDocument()
    })
  })

  it('runs drowsiness follow-up actions with the configured close timing', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '괜찮아. 조금 더 갈 수 있어.' }))
    clickManualRiskNext()

    expect(await screen.findByText('알겠습니다. 그래도 졸리면 바로 쉬어가야 해요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 4_700))
    })
    expect(screen.getByText('알겠습니다. 그래도 졸리면 바로 쉬어가야 해요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('알겠습니다. 그래도 졸리면 바로 쉬어가야 해요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '창문 조금만 열어줘.' }))
    clickManualRiskNext()

    expect(await screen.findByText('창문을 살짝 열게요. 그래도 잠이 깨지 않는다면 쉬어가는걸 추천드려요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 6_200))
    })
    expect(screen.getByText('창문을 살짝 열게요. 그래도 잠이 깨지 않는다면 쉬어가는걸 추천드려요.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('창문을 살짝 열게요. 그래도 잠이 깨지 않는다면 쉬어가는걸 추천드려요.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '잠 깨는 밝은 음악 틀어줘.' }))
    clickManualRiskNext()

    expect(await screen.findByTestId('music-mini-player')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedGetMusicRecommendations).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: '잠 깨는 밝은 노래', mood: 'bright' }),
        undefined,
        expect.any(AbortSignal),
      )
    })
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 7_700))
    })
    expect(screen.getByTestId('music-mini-player')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('music-mini-player')).not.toBeInTheDocument()
      expect(screen.queryByTestId('roadie-assistant-music-recommendation-card')).not.toBeInTheDocument()
    }, { timeout: 1_000 })
  }, 20_000)

  it('does not apply an older destination change after another manual risk is selected', async () => {
    const queryClient = new QueryClient()
    let resolveRouteOptions!: (options: Awaited<ReturnType<typeof getRouteOptions>>) => void
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'wrong-sungsimdang',
        name: '성심당 한의원',
        address: '대전 서구',
        coordinate: { lat: 36.3501, lng: 127.3849 },
      },
    ])
    mockedGetRouteOptions.mockReturnValue(new Promise((resolve) => {
      resolveRouteOptions = resolve
    }))
    const route = {
      coordinates: [
        { lat: 37.5547, lng: 126.9706 },
        { lat: 36.3326, lng: 127.4347 },
      ],
      summary: {
        distanceMeters: 154_300,
        durationSeconds: 7_860,
      },
      maneuvers: [],
    }
    const routeOption = createMockRouteOption(route)

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '성심당으로 도착지 변경해줘.' }))
    clickManualRiskNext()
    await waitFor(() => {
      expect(mockedSearchPlaces).not.toHaveBeenCalled()
      expect(mockedGetRouteOptions).toHaveBeenCalledWith(
        expect.any(Object),
        { lat: 36.3326, lng: 127.4347 },
        undefined,
        expect.any(AbortSignal),
      )
    })

    fireEvent.click(screen.getByRole('button', { name: '졸음 위험 상황 선택' }))
    expect(await screen.findByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()

    await act(async () => {
      resolveRouteOptions([routeOption])
    })

    expect(screen.getByText('눈이 무거워 보여요. 전방을 보고 자세를 바로잡아주세요.')).toBeInTheDocument()
    expect(screen.queryByText('성심당 대전역점까지 약 154.3 km, 131분 소요됩니다.')).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-selection-mode', 'false')
  })

  it('applies strong manual warnings and destination route changes', async () => {
    const queryClient = new QueryClient()
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'wrong-sungsimdang',
        name: '성심당 한의원',
        address: '대전 서구',
        coordinate: { lat: 36.3501, lng: 127.3849 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5547, lng: 126.9706 },
        { lat: 36.3326, lng: 127.4347 },
      ],
      summary: {
        distanceMeters: 154_300,
        durationSeconds: 7_860,
      },
      maneuvers: [],
    })
    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    expect(await screen.findByText('먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '기기조작 위험 상황 선택' }))
    fireEvent.click(await screen.findByRole('button', { name: '성심당으로 도착지 변경해줘.' }))
    clickManualRiskNext()

    await waitFor(() => {
      expect(mockedSearchPlaces).not.toHaveBeenCalled()
      expect(mockedGetRouteOptions).toHaveBeenCalledWith(
        expect.any(Object),
        { lat: 36.3326, lng: 127.4347 },
        undefined,
        expect.any(AbortSignal),
      )
    })
    expect(await screen.findByText('성심당 대전역점까지 약 154.3 km, 131분 소요됩니다.')).toBeInTheDocument()
    expect(screen.getByText('대전 동구 중앙로 215 대전역사')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 7_700))
    })
    expect(screen.getByText('성심당 대전역점까지 약 154.3 km, 131분 소요됩니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByText('성심당 대전역점까지 약 154.3 km, 131분 소요됩니다.')).not.toBeInTheDocument()
    }, { timeout: 1_000 })
  }, 10_000)

  it('plays the strong warning sound before strong manual risk TTS', async () => {
    const queryClient = new QueryClient()
    const resolveVoiceRequests: Array<(blob: Blob) => void> = []
    const audioPlayOrder: string[] = []
    const audioInstances: Array<{
      src: string
      dispatch: (eventName: string) => void
    }> = []

    class MockAudio {
      src: string
      private listeners = new Map<string, Set<() => void>>()

      constructor(src: string) {
        this.src = src
        audioInstances.push({
          src,
          dispatch: (eventName: string) => {
            this.listeners.get(eventName)?.forEach((listener) => listener())
          },
        })
      }

      play = vi.fn(() => {
        audioPlayOrder.push(this.src)
        return Promise.resolve()
      })

      pause = vi.fn()

      addEventListener(eventName: string, listener: () => void) {
        const listeners = this.listeners.get(eventName) ?? new Set<() => void>()
        listeners.add(listener)
        this.listeners.set(eventName, listeners)
      }

      removeEventListener(eventName: string, listener: () => void) {
        this.listeners.get(eventName)?.delete(listener)
      }
    }

    const createObjectURL = vi.fn(() => 'blob:manual-risk-strong-tts')
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    vi.stubGlobal('Audio', MockAudio)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    mockedSynthesizeVoice.mockImplementation(() => new Promise((resolve) => {
      resolveVoiceRequests.push(resolve)
    }))

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))

    expect(await screen.findByText('휴대폰 사용을 즉시 중단하세요. 지금은 전방만 봐야 합니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(mockedSynthesizeVoice).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '휴대폰 사용을 즉시 중단하세요. 지금은 전방만 봐야 합니다.',
          speakerId: 'dara_ang',
          speed: -2,
          pitch: 2,
          volume: 5,
        }),
        undefined,
        expect.any(AbortSignal),
      )
    })
    await waitFor(() => {
      expect(audioPlayOrder[0]).toBe('/sounds/manual-risk-stage-3.wav')
    })
    expect(createObjectURL).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(resolveVoiceRequests.length).toBeGreaterThanOrEqual(3)
    })

    act(() => {
      resolveVoiceRequests.forEach((resolve) => resolve(new Blob(['audio'], { type: 'audio/mpeg' })))
    })

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })

    const warningAudio = [...audioInstances]
      .reverse()
      .find((audio) => audio.src === '/sounds/manual-risk-stage-3.wav')
    expect(warningAudio).toBeDefined()

    act(() => {
      warningAudio?.dispatch('ended')
    })

    await waitFor(() => {
      expect(audioPlayOrder[audioPlayOrder.length - 1]).toBe('blob:manual-risk-strong-tts')
    })

    vi.unstubAllGlobals()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
  })

  it('starts and cancels the emergency warning countdown from the warning button', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '경고 위험 상황 선택' }))

    expect(screen.getByText('3초 후 긴급 경고가 시작됩니다.')).toBeInTheDocument()
    expect(mockedSynthesizeVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        text: '졸음 경고! 졸음 경고!',
        speakerRole: 'assistant',
        speakerId: 'dara_ang',
        speed: 0,
        pitch: 4,
        volume: 5,
      }),
      undefined,
      expect.any(AbortSignal),
    )

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_100))
    })
    expect(screen.getByText('2초 후 긴급 경고가 시작됩니다.')).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    })
    expect(screen.getByText('1초 후 긴급 경고가 시작됩니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    await waitFor(() => {
      expect(screen.queryByText(/초 후 긴급 경고가 시작됩니다./)).not.toBeInTheDocument()
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_100))
    })

    expect(screen.queryByText('졸음 경고! 졸음 경고!')).not.toBeInTheDocument()
  }, 8_000)

  it('dismisses first-stage and emergency manual warnings after six seconds', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 위험 상황 선택' }))
    expect(await screen.findByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5_100))
    })
    expect(screen.getByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_100))
    })
    expect(screen.queryByText('휴대폰은 잠시 내려두고 전방을 봐주세요.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '경고 위험 상황 선택' }))
    expect(screen.getByText('3초 후 긴급 경고가 시작됩니다.')).toBeInTheDocument()
    expect(mockedSynthesizeVoice).toHaveBeenCalledWith(
      expect.objectContaining({ text: '핸드폰 사용 경고! 핸드폰 사용 경고!' }),
      undefined,
      expect.any(AbortSignal),
    )

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_100))
    })

    expect(await screen.findByText('핸드폰 사용 경고! 핸드폰 사용 경고!')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 6_100))
    })
    expect(screen.queryByText('핸드폰 사용 경고! 핸드폰 사용 경고!')).not.toBeInTheDocument()
  }, 20_000)

  it('dismisses strong manual warnings after six seconds', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))
    fireEvent.click(screen.getByRole('button', { name: '섭취 위험 상황 선택' }))

    const warningText = '먹거나 마시는 행동을 즉시 멈추세요. 지금은 운전에만 집중해야 합니다.'
    expect(await screen.findByText(warningText)).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 5_100))
    })
    expect(screen.getByText(warningText)).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 1_100))
    })
    expect(screen.queryByText(warningText)).not.toBeInTheDocument()
  }, 8_000)

  it('limits the emergency warning sound to 2.2 seconds before preloaded emergency TTS', async () => {
    const queryClient = new QueryClient()
    const resolveVoiceRequests: Array<(blob: Blob) => void> = []
    const audioPlayOrder: string[] = []
    const audioInstances: Array<{
      src: string
      dispatch: (eventName: string) => void
      pause: ReturnType<typeof vi.fn>
    }> = []

    class MockAudio {
      src: string
      private listeners = new Map<string, Set<() => void>>()

      constructor(src: string) {
        this.src = src
        audioInstances.push({
          src,
          dispatch: (eventName: string) => {
            this.listeners.get(eventName)?.forEach((listener) => listener())
          },
          pause: this.pause,
        })
      }

      play = vi.fn(() => {
        audioPlayOrder.push(this.src)
        return Promise.resolve()
      })

      pause = vi.fn()

      addEventListener(eventName: string, listener: () => void) {
        const listeners = this.listeners.get(eventName) ?? new Set<() => void>()
        listeners.add(listener)
        this.listeners.set(eventName, listeners)
      }

      removeEventListener(eventName: string, listener: () => void) {
        this.listeners.get(eventName)?.delete(listener)
      }
    }

    const createObjectURL = vi.fn(() => 'blob:manual-risk-emergency-tts')
    const revokeObjectURL = vi.fn()
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const audioGainValues: number[] = []
    const mockConnect = vi.fn()
    const mockClose = vi.fn(() => Promise.resolve())

    class MockAudioContext {
      destination = {}

      createMediaElementSource = vi.fn(() => ({
        connect: mockConnect,
      }))

      createGain = vi.fn(() => {
        const gainNode = {
          gain: {
            set value(nextValue: number) {
              audioGainValues.push(nextValue)
            },
            get value() {
              return audioGainValues[audioGainValues.length - 1] ?? 1
            },
          },
          connect: mockConnect,
        }

        return gainNode
      })

      close = mockClose
    }

    vi.stubGlobal('Audio', MockAudio)
    vi.stubGlobal('AudioContext', MockAudioContext)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    mockedSynthesizeVoice.mockImplementation(() => new Promise((resolve) => {
      resolveVoiceRequests.push(resolve)
    }))

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '경고 위험 상황 선택' }))
    expect(screen.getByText('3초 후 긴급 경고가 시작됩니다.')).toBeInTheDocument()
    await waitFor(() => {
      expect(resolveVoiceRequests).toHaveLength(1)
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 3_100))
    })

    expect(screen.getByText('졸음 경고! 졸음 경고!')).toBeInTheDocument()
    await waitFor(() => {
      expect(audioPlayOrder).toEqual(['/sounds/manual-risk-emergency-warning.wav'])
    })
    expect(createObjectURL).not.toHaveBeenCalled()

    act(() => {
      resolveVoiceRequests.forEach((resolve) => resolve(new Blob(['audio'], { type: 'audio/mpeg' })))
    })

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })

    const warningAudio = [...audioInstances]
      .reverse()
      .find((audio) => audio.src === '/sounds/manual-risk-emergency-warning.wav')
    expect(warningAudio).toBeDefined()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2_100))
    })
    expect(audioPlayOrder[audioPlayOrder.length - 1]).toBe('/sounds/manual-risk-emergency-warning.wav')

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 200))
    })

    await waitFor(() => {
      expect(audioPlayOrder[audioPlayOrder.length - 1]).toBe('blob:manual-risk-emergency-tts')
    })
    expect(warningAudio?.pause).toHaveBeenCalledTimes(1)
    expect(audioGainValues).toContain(2)

    vi.unstubAllGlobals()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: originalCreateObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: originalRevokeObjectURL,
    })
  }, 10_000)

  it('starts a fixed demo scenario after profile selection', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: /대표 시나리오 보기/ }))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-drowsy_driver'))

    expect(await screen.findByTestId('demo-scenario-presenter-panel')).toBeInTheDocument()
    expect(screen.getByTestId('demo-navigation-lock')).toBeInTheDocument()
    expect(screen.getByText('주행 화면 진입')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /다음/ }))

    expect(await screen.findByText('목적지 검색 열림')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '데모 선택으로' }))

    expect(await screen.findByTestId('demo-entry-mode-selection')).toBeInTheDocument()
    expect(screen.queryByTestId('demo-scenario-presenter-panel')).not.toBeInTheDocument()
  })

  it('keeps navigation interactions locked during every demo scenario stage', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'ossi-kalguksu',
        name: '오씨칼국수 본점',
        address: '대전 동구 옛신탄진로 13',
        coordinate: { lat: 36.3378, lng: 127.4309 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5502, lng: 127.073 },
        { lat: 36.3378, lng: 127.4309 },
      ],
      summary: {
        distanceMeters: 166_800,
        durationSeconds: 8_280,
      },
      maneuvers: [],
    })
    const queryClient = new QueryClient()
    const clickPresenterNext = async () => {
      const nextButton = screen.getByRole('button', { name: /다음/ })

      await waitFor(() => expect(nextButton).not.toBeDisabled())
      fireEvent.click(nextButton)
    }

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: /대표 시나리오 보기/ }))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-drowsy_driver'))

    expect(await screen.findByTestId('demo-navigation-lock')).toBeInTheDocument()

    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()

    expect(await screen.findByText('졸음 주의')).toBeInTheDocument()
    expect(screen.getByTestId('demo-navigation-lock')).toBeInTheDocument()

    await clickPresenterNext()

    expect(await screen.findByRole('button', { name: '괜찮아' })).toBeInTheDocument()
    expect(screen.getByTestId('demo-navigation-lock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '괜찮아' }))
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()

    expect(await screen.findByText('위험도 높음 · 휴식 안내 필요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '신탄진 졸음쉼터 안내' })).toBeInTheDocument()
    expect(screen.getByTestId('demo-navigation-lock')).toBeInTheDocument()
  })

  it('starts the mini player when a demo music scenario reaches the music started step', async () => {
    mockedGetMusicRecommendations.mockResolvedValue([
      {
        id: 'red-sunset',
        title: '붉은 노을',
        artist: '빅뱅',
        album: 'Remember',
        duration: '4:03',
        durationSeconds: 243,
        coverUrl: null,
        sourceUrl: '',
        provider: 'itunes',
      },
    ])
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'ossi-kalguksu',
        name: '오씨칼국수 본점',
        address: '대전 동구 옛신탄진로 13',
        coordinate: { lat: 36.3378, lng: 127.4309 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5502, lng: 127.073 },
        { lat: 36.3378, lng: 127.4309 },
      ],
      summary: {
        distanceMeters: 166_800,
        durationSeconds: 8_280,
      },
      maneuvers: [],
    })
    const queryClient = new QueryClient()
    const clickPresenterNext = async () => {
      const nextButton = screen.getByRole('button', { name: /다음/ })

      await waitFor(() => expect(nextButton).not.toBeDisabled())
      fireEvent.click(nextButton)
    }

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    fireEvent.click(await screen.findByRole('button', { name: /대표 시나리오 보기/ }))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-device_operation'))

    await screen.findByTestId('demo-scenario-presenter-panel')
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()
    await clickPresenterNext()

    await screen.findByText('기기 조작 주의')
    expect(screen.queryByTestId('music-popover')).not.toBeInTheDocument()

    await clickPresenterNext()
    expect(await screen.findByTestId('roadie-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '민준, 전방 확인이 계속 안 되고 있어요. 시선을 앞으로 돌려주세요.',
    )

    await clickPresenterNext()
    await screen.findByText('기기 조작 반복')

    await clickPresenterNext()
    expect(await screen.findByTestId('roadie-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '계속 화면을 조작하면 위험해요. 필요한 건 제가 대신 도와드릴까요?',
    )
    fireEvent.click(await screen.findByRole('button', { name: '음악 바꿔줘.' }))

    await clickPresenterNext()
    expect(await screen.findByTestId('roadie-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '어떤 음악으로 바꿔드릴까요?',
    )
    fireEvent.click(await screen.findByRole('button', { name: '빅뱅의 붉은 노을 틀어줘.' }))

    await clickPresenterNext()
    expect(await screen.findByTestId('roadie-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '빅뱅의 붉은 노을을 찾았어요. 이 곡으로 재생할까요?',
    )
    expect(await screen.findByText('붉은 노을')).toBeInTheDocument()
    expect(screen.getByText('빅뱅')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: '응, 재생해줘.' }))

    await clickPresenterNext()

    const miniPlayer = await screen.findByTestId('music-mini-player')

    expect(miniPlayer).toBeInTheDocument()
    expect(within(miniPlayer).getByText('붉은 노을')).toBeInTheDocument()
    expect(within(miniPlayer).getByText('빅뱅')).toBeInTheDocument()

    await clickPresenterNext()

    expect(await screen.findAllByText('오늘 주행이 끝났어요. 운전 리포트를 정리해드릴게요.')).not.toHaveLength(0)
    expect(screen.queryByTestId('music-mini-player')).not.toBeInTheDocument()
  })

  it('keeps profile cards on one horizontal scroll row', async () => {
    mockedGetBootstrap.mockResolvedValueOnce({
      account: {
        id: 'account-1',
        displayName: '안정현',
        email: 'admin@example.com',
      },
      profiles: [
        ...mockProfiles,
        {
          ...mockProfiles[0],
          id: 'profile-3',
          displayName: '아빠',
          profileImageUrl: '/storage/profile-images/default-family/father.svg',
        },
        {
          ...mockProfiles[1],
          id: 'profile-4',
          displayName: '엄마',
          profileImageUrl: '/storage/profile-images/default-family/mother.svg',
        },
      ],
      selectedProfileId: null,
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    await screen.findByRole('button', { name: /엄마 프로필 선택/ })

    const profileScrollRow = screen.getByTestId('profile-scroll-row')
    expect(profileScrollRow).toHaveClass('overflow-x-auto')
    expect(profileScrollRow.firstElementChild).toHaveClass('flex-nowrap')
    expect(screen.getByRole('button', { name: '프로필 추가' })).toHaveClass('shrink-0')
  })

  it('opens a profile settings page from the add button and creates a profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: '프로필 추가' }))

    expect(screen.getByRole('heading', { name: '프로필 설정' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '오늘은 누가 운전할까요?' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('프로필 이름')).toHaveAttribute('data-slot', 'input')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '기본 정보' })).toHaveAttribute('data-state', 'active')
    expect(screen.getByRole('button', { name: '이전' })).toHaveAttribute('data-slot', 'button')
    expect(screen.queryByLabelText('안내 음성 스타일')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('프로필 이름'), {
      target: { value: '도현' },
    })
    fireEvent.change(screen.getByLabelText('호출 이름'), {
      target: { value: '도현아' },
    })
    fireEvent.change(screen.getByLabelText('리포트 이메일'), {
      target: { value: 'dohyun@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByRole('tab', { name: '안내 설정' })).toHaveAttribute('data-state', 'active')
    fireEvent.click(screen.getByRole('combobox', { name: '안내 음성 스타일' }))
    expect(await screen.findByRole('listbox')).toHaveClass('z-[100]')
    fireEvent.click(await screen.findByRole('option', { name: '밝고 빠른 안내' }))
    fireEvent.click(screen.getByRole('combobox', { name: '안내 화자' }))
    fireEvent.click(await screen.findByRole('option', { name: '혜리' }))
    fireEvent.change(screen.getByLabelText('TTS 속도'), {
      target: { value: '1.4' },
    })
    fireEvent.change(screen.getByLabelText('안내 음량'), {
      target: { value: '82' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByRole('tab', { name: '행동 민감도' })).toHaveAttribute('data-state', 'active')
    expect(screen.queryByLabelText('경고 민감도')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('테마')).not.toBeInTheDocument()
    const profileSettingsContent = screen.queryByTestId('profile-settings-content')
    expect(profileSettingsContent).not.toBeNull()
    expect(profileSettingsContent).toHaveClass('overflow-y-auto', 'overscroll-contain')
    fireEvent.click(screen.getByRole('button', { name: '음식/음료 섭취 민감도 낮추기' }))
    fireEvent.click(screen.getByRole('button', { name: '음식/음료 섭취 민감도 낮추기' }))
    fireEvent.click(screen.getByRole('button', { name: '음식/음료 섭취 민감도 낮추기' }))
    expect(screen.getByText((content) => content.includes("'음식/음료 섭취' 감지 민감도를 4 이하로 설정하면"))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByRole('tab', { name: '안내 설정' })).toHaveAttribute('data-state', 'active')
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }))

    await waitFor(() => {
      expect(mockedCreateProfile).toHaveBeenCalledWith({
        displayName: '도현',
        agentCallName: '도현아',
        reportEmail: 'dohyun@example.com',
        agentPersonality: 'WITTY',
        behaviorWarningSensitivity: {
          ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
          FOOD_OR_DRINK: 4,
        },
        ttsVoiceId: 'nes_c_hyeri',
        ttsSpeed: 1.4,
        guidanceVolume: 82,
      })
    })
    expect(await screen.findByTestId('profile-calibration-flow')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '로디가 개인화 맞춤 설정을 준비하고 있어요' })).toBeInTheDocument()
  })

  it('runs calibration automatically for a newly created profile before manual navigation', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell calibrationTiming={{ progressIntervalMs: 1, progressStep: 100, stepCompleteDelayMs: 1 }} />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-manual-control-button'))
    fireEvent.click(await screen.findByRole('button', { name: '프로필 추가' }))
    fireEvent.change(screen.getByLabelText('프로필 이름'), {
      target: { value: '도현' },
    })
    fireEvent.change(screen.getByLabelText('호출 이름'), {
      target: { value: '도현아' },
    })
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }))

    expect(await screen.findByTestId('profile-calibration-flow')).toBeInTheDocument()
    expect(screen.getByText('정면을 바라봐 주세요')).toBeInTheDocument()

    await waitFor(() => {
      expect(mockedSelectProfile).toHaveBeenCalledWith('profile-created')
    })
    expect(await screen.findByTestId('manual-risk-control-panel')).toBeInTheDocument()
  })

  it('deletes a backend profile from the profile settings screen', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 수정' }))
    fireEvent.click(await screen.findByRole('button', { name: '프로필 삭제' }))

    await waitFor(() => {
      expect(mockedDeleteProfile).toHaveBeenCalledWith('profile-1')
    })
    expect(await screen.findByRole('heading', { name: '오늘은 누가 운전할까요?' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '프로필 설정' })).not.toBeInTheDocument()
  })

  it('opens a profile settings page from the selected profile edit button and updates a profile', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 수정' }))

    expect(screen.getByRole('heading', { name: '프로필 설정' })).toBeInTheDocument()
    expect(screen.getByLabelText('프로필 이름')).toHaveValue('민준')
    expect(screen.getByLabelText('호출 이름')).toHaveValue('로디')
    expect(screen.queryByLabelText('안내 음성 스타일')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('프로필 이름'), {
      target: { value: '민준 수정' },
    })
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }))

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-1', {
        displayName: '민준 수정',
        agentCallName: '로디',
        reportEmail: null,
        agentPersonality: 'FRIENDLY',
        behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        ttsVoiceId: 'nara',
        ttsSpeed: 1,
        guidanceVolume: 70,
      })
    })
  })

  it('falls back to default numeric guidance settings when updating an older profile payload', async () => {
    const legacyProfile = {
      ...mockProfiles[0],
      agentPersonality: 'WARM' as const,
      guidanceVolume: undefined,
      ttsSpeed: undefined,
    } as unknown as typeof mockProfiles[number]
    mockedGetBootstrap.mockResolvedValueOnce({
      account: {
        id: 'account-1',
        displayName: '안정현',
        email: 'admin@example.com',
      },
      profiles: [legacyProfile],
      selectedProfileId: null,
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 수정' }))
    fireEvent.click(screen.getByRole('button', { name: '다음' }))
    fireEvent.click(screen.getByRole('combobox', { name: '안내 음성 스타일' }))
    fireEvent.click(await screen.findByRole('option', { name: '차분한 저음 안내' }))
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }))

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-1', expect.objectContaining({
        agentPersonality: 'WARM',
        guidanceVolume: 70,
        ttsSpeed: 1,
      }))
    })
  })

  it('centers the manual risk workspace without rendering the driver-video panel', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const stage = screen.getByTestId('navigation-stage')
    const manualLayout = screen.getByTestId('manual-navigation-layout')
    const viewport = screen.getByTestId('navigation-viewport')
    const manualControlPanel = screen.getByTestId('manual-risk-control-panel')
    const manualRiskStackStatus = screen.getByTestId('manual-risk-stack-status')

    expect(stage).toHaveClass('grid')
    expect(stage).toHaveClass('grid-cols-[minmax(0,1fr)_24rem]')
    expect(stage).not.toHaveClass('grid-rows-[minmax(17rem,38vh)_minmax(0,1fr)]')
    expect(screen.queryByTestId('driver-video-panel')).not.toBeInTheDocument()
    expect(manualLayout).toHaveClass('flex')
    expect(manualLayout).toHaveClass('flex-col')
    expect(manualLayout).toHaveClass('self-center')
    expect(viewport).toHaveClass('aspect-[16/10]')
    expect(viewport).toHaveClass('col-start-1')
    expect(viewport).toHaveClass('self-center')
    expect(manualLayout).toContainElement(manualControlPanel)
    expect(manualLayout).toContainElement(manualRiskStackStatus)
    expect(manualControlPanel).toHaveClass('w-full')
    expect(manualRiskStackStatus).toHaveClass('w-full')
  })

  it('keeps the driver-video panel in the demo scenario cockpit', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-scenario-button'))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-drowsy_driver'))

    expect(await screen.findByTestId('demo-scenario-presenter-panel')).toBeInTheDocument()
    expect(screen.getByTestId('driver-video-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('manual-navigation-layout')).not.toBeInTheDocument()
  })

  it('loads a selected local driver video into the demo scenario cockpit', async () => {
    const queryClient = new QueryClient()
    const createObjectURL = vi.fn(() => 'blob:test-driver-video')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-scenario-button'))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-drowsy_driver'))

    const file = new File(['driver video'], 'driver.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText('운전자 영상 파일 선택'), {
      target: { files: [file] },
    })

    expect(createObjectURL).toHaveBeenCalledWith(file)
    const player = screen.getByTestId('driver-video-player')
    const source = player.querySelector('source')
    expect(source).toHaveAttribute('src', 'blob:test-driver-video')
    expect(source).toHaveAttribute('type', 'video/mp4')
    expect(player).toHaveAttribute('controls')
    expect(player).toHaveClass('h-full')
    expect(player).toHaveClass('w-full')
    expect(player).toHaveClass('object-contain')
    expect(screen.getByText('driver.mp4')).toBeInTheDocument()
    expect(screen.queryByText('영상 선택')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('운전자 영상 썸네일 VTT 파일 선택')).not.toBeInTheDocument()
    expect(mockPlyr).toHaveBeenLastCalledWith(expect.any(HTMLVideoElement), expect.not.objectContaining({
      previewThumbnails: expect.anything(),
    }))
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('opens the driver video picker from the non-playing demo scenario panel', async () => {
    const queryClient = new QueryClient()
    const createObjectURL = vi.fn(() => 'blob:test-driver-video')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    })
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByTestId('demo-entry-scenario-button'))
    fireEvent.click(await screen.findByTestId('demo-scenario-card-drowsy_driver'))

    fireEvent.click(screen.getByTestId('driver-video-panel'))
    expect(inputClick).toHaveBeenCalledTimes(1)

    const file = new File(['driver video'], 'driver.mp4', { type: 'video/mp4' })
    fireEvent.change(screen.getByLabelText('운전자 영상 파일 선택'), {
      target: { files: [file] },
    })

    fireEvent.click(screen.getByTestId('driver-video-player'))
    expect(inputClick).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('driver-video-panel'))
    expect(inputClick).toHaveBeenCalledTimes(1)

    inputClick.mockRestore()
  })

  it('renders the 로디 assistant orb with the internal VoiceOrb contract', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: '로디 호출' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로디 호출' })).toHaveClass('right-0')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'idle')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-energy', '0')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-color-theme', 'daylight')
  })

  it('steps through the dummy 로디 assistant scenario without auto-playing it', async () => {
    const queryClient = new QueryClient()
    window.history.replaceState(null, '', '/?debugAssistant=1')

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('roadie-assistant-debug-panel')).toBeInTheDocument()
    expect(screen.getByText('정상 주행')).toBeInTheDocument()
    expect(screen.getByText('1 / 8')).toBeInTheDocument()
    expect(screen.queryByTestId('roadie-assistant-panel')).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '졸음 감지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '로디야 호출' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))

    expect(screen.getByTestId('roadie-assistant-panel')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-panel')).toHaveClass('max-h-full')
    expect(screen.getByTestId('roadie-assistant-panel')).toHaveClass('self-start')
    expect(screen.getByTestId('roadie-assistant-panel')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('roadie-assistant-panel')).toHaveClass('pointer-events-none')
    expect(screen.getByTestId('roadie-assistant-aura')).toHaveClass('roadie-assistant-aura')
    expect(screen.getByTestId('roadie-assistant-orb-slot')).toHaveClass('absolute')
    expect(screen.getByTestId('roadie-assistant-content')).toHaveClass('flex-1')
    expect(screen.getByTestId('roadie-assistant-content')).toHaveClass('pt-[12rem]')
    expect(screen.getByRole('button', { name: '로디 AI 에이전트 닫기' })).toBeInTheDocument()
    expect(await screen.findByTestId('roadie-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '잠시 쉬어가면 좋겠습니다. 신탄진 졸음쉼터를 찾아드릴까요?',
    )
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'speaking')
    expect(screen.getByTestId('voice-wave')).toHaveAttribute('data-active', 'true')
    expect(screen.getByTestId('voice-wave')).toHaveAttribute('data-energy', '0.6')
    expect(screen.getByTestId('voice-wave')).toHaveAttribute('data-color-theme', 'daylight')

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByText('듣는 중...')).toBeInTheDocument()
    expect(screen.queryByTestId('voice-wave')).not.toBeInTheDocument()
    expect(await screen.findByTestId('roadie-assistant-user-text')).toHaveAttribute(
      'aria-label',
      '신탄진 졸음쉼터로 안내해줘',
    )

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByTestId('roadie-assistant-recommendations')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-recommendations')).toHaveClass('pointer-events-auto')
    expect(screen.getByTestId('roadie-assistant-recommendations')).toHaveClass('shrink')
    expect(screen.getByTestId('roadie-assistant-recommendations')).not.toHaveClass('flex-1')
    expect(screen.getByTestId('roadie-assistant-recommendations-scroll')).toHaveClass('shrink')
    expect(screen.getByTestId('roadie-assistant-recommendations-scroll')).not.toHaveClass('flex-1')
    expect(screen.getByTestId('roadie-assistant-recommendations-scroll')).toHaveClass('overscroll-contain')
    expect(screen.getByTestId('roadie-assistant-route-recommendation')).toBeInTheDocument()
    expect(await screen.findByTestId('voice-wave')).toHaveAttribute('data-active', 'true')
    expect(screen.queryByText('추천 경로')).not.toBeInTheDocument()
    expect(screen.queryByText('최단 거리 경로')).not.toBeInTheDocument()
    expect(screen.queryByText('정체 회피 경로')).not.toBeInTheDocument()
    const recommendedRouteButton = screen.getByRole('button', { name: '신탄진 졸음쉼터(부산방향) 경유지 추가' })
    expect(recommendedRouteButton).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '죽암휴게소(부산방향) 경유지 추가' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '망향휴게소(부산방향) 경유지 추가' })).toBeInTheDocument()
    expect(within(recommendedRouteButton).getByText('18')).toBeInTheDocument()
    expect(within(recommendedRouteButton).getByText('분')).toBeInTheDocument()
    expect(within(recommendedRouteButton).getByText('21.4km')).toBeInTheDocument()
    expect(screen.getAllByText('통행료 0원')).toHaveLength(3)
    expect(screen.getByText('신탄진 졸음쉼터(부산방향)')).toBeInTheDocument()
    expect(screen.getByText('죽암휴게소(부산방향)')).toBeInTheDocument()
    expect(screen.getByText('망향휴게소(부산방향)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    const selectedRouteCard = screen.getByTestId('roadie-assistant-selected-route-card')
    expect(selectedRouteCard).toBeInTheDocument()
    expect(screen.queryByText('추천')).not.toBeInTheDocument()
    expect(screen.queryByText('1개')).not.toBeInTheDocument()
    expect(screen.queryByTestId('roadie-assistant-route-recommendation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '죽암휴게소(부산방향) 경유지 추가' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '망향휴게소(부산방향) 경유지 추가' })).not.toBeInTheDocument()
    expect(within(selectedRouteCard).getByText('신탄진 졸음쉼터(부산방향)')).toBeInTheDocument()
    expect(within(selectedRouteCard).getByText('안내 중')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    const completionCard = screen.getByTestId('roadie-assistant-completion-card')
    expect(completionCard).toBeInTheDocument()
    expect(screen.queryByText('추천')).not.toBeInTheDocument()
    expect(screen.queryByText('1개')).not.toBeInTheDocument()
    expect(screen.queryByText('완료')).not.toBeInTheDocument()
    expect(completionCard).not.toHaveClass('border')
    expect(completionCard).not.toHaveClass('min-h-[3.625rem]')
    expect(within(completionCard).getByText('안내 경로가 적용되었습니다.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI 시나리오 초기화' }))
    expect(screen.queryByTestId('roadie-assistant-panel')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 8')).toBeInTheDocument()
  })

  it('renders a music assistant recommendation without an inline play action', async () => {
    const queryClient = new QueryClient()
    window.history.replaceState(null, '', '/?debugAssistant=1')
    mockedGetMusicRecommendations.mockResolvedValueOnce([
      {
        id: 'itunes-bright-road',
        title: 'Bright Road',
        artist: 'Real Artist',
        album: 'Morning Drive',
        duration: '2:58',
        durationSeconds: 178,
        coverUrl: 'https://example.com/bright-road.jpg',
        sourceUrl: 'https://music.apple.com/kr/album/bright-road/789?i=789',
        provider: 'itunes',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('AI 시나리오 선택'), {
      target: { value: 'fatigue-music' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))

    expect(screen.getByTestId('roadie-assistant-recommendations')).toBeInTheDocument()
    expect(await screen.findByText('Bright Road')).toBeInTheDocument()
    expect(screen.getByTestId('roadie-assistant-music-recommendation-card')).toBeInTheDocument()
    expect(screen.queryByText('음악 추천 열기')).not.toBeInTheDocument()
    expect(screen.getByText('Real Artist')).toBeInTheDocument()
    expect(screen.getByText('Morning Drive')).toBeInTheDocument()
    expect(screen.getByText('2:58')).toBeInTheDocument()
    expect(within(screen.getByTestId('roadie-assistant-music-recommendation-card')).queryByRole('button', { name: '재생' })).not.toBeInTheDocument()
  })

  it('shows a spinner instead of fallback music while assistant recommendation is loading', async () => {
    const queryClient = new QueryClient()
    window.history.replaceState(null, '', '/?debugAssistant=1')
    mockedGetMusicRecommendations.mockImplementationOnce(() => new Promise(() => undefined))

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.change(screen.getByLabelText('AI 시나리오 선택'), {
      target: { value: 'fatigue-music' },
    })
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))

    expect(await screen.findByTestId('music-recommendation-loading')).toBeInTheDocument()
    expect(screen.queryByText('Soft Focus')).not.toBeInTheDocument()
    expect(screen.queryByText('Evening Route')).not.toBeInTheDocument()
    expect(screen.queryByText('Bright Pop Drive')).not.toBeInTheDocument()
  })

  it('keeps assistant speech reveal timing deterministic without audio playback', () => {
    expect(getAssistantSpeechCharacterDelaySeconds(0)).toBe(0)
    expect(getAssistantSpeechCharacterDelaySeconds(3)).toBeCloseTo(0.054)
  })

  it('shows assistant speaking orb and voice wave without audio playback', () => {
    const agentStep = {
      energy: 0.6,
      id: 'agent-step',
      label: '에이전트 음성 안내',
      mode: 'assistant-speaking' as const,
      orbState: 'speaking' as const,
      text: '어디로 안내할까요?',
    }

    expect(getAssistantVisibleOrbState(agentStep)).toBe('speaking')
    expect(isAssistantVoiceWaveVisible(agentStep)).toBe(true)
  })

  it('closes the expanded 로디 assistant panel back to the floating orb', () => {
    const queryClient = new QueryClient()
    window.history.replaceState(null, '', '/?debugAssistant=1')

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByTestId('roadie-assistant-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '로디 AI 에이전트 닫기' }))

    expect(screen.queryByTestId('roadie-assistant-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로디 호출' })).toBeInTheDocument()
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'idle')
  })

  it('starts on a current-location map without the route setup panel', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    expect(screen.queryByText('현재 위치 대기 중')).not.toBeInTheDocument()
    expect(screen.queryByText('길안내')).not.toBeInTheDocument()
    expect(screen.queryByText('출발지와 도착지를 입력하세요')).not.toBeInTheDocument()
    expect(screen.queryByText('API 키는 백엔드 env에서만 사용됩니다.')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('출발지를 입력하세요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /어디로 갈까요/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연동 상태' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '음악' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => {
      expect(screen.getByTestId('bottom-status-bar')).toHaveClass('grid-cols-3')
    })
    expect(screen.getByTestId('bottom-status-bar')).toHaveClass('h-[43px]')
    expect(screen.queryByText('시간')).not.toBeInTheDocument()
    expect(screen.queryByText('현재 위치')).not.toBeInTheDocument()
    expect(screen.queryByText('날씨')).not.toBeInTheDocument()
    expect(await screen.findByLabelText('제한속도 50km/h')).toBeInTheDocument()
    expect(await screen.findByText('서울특별시 중구 세종대로 110')).toBeInTheDocument()
  })

  it('opens the connected settings drawer for map mode, zoom, pitch, selected profile, and location retry', async () => {
    mockedGetBootstrap.mockResolvedValueOnce({
      account: {
        id: 'account-1',
        displayName: '백엔드 사용자',
        email: 'driver@example.com',
      },
      profiles: mockProfiles,
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))

    expect(await screen.findByRole('dialog', { name: '설정' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '로디 호출' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('민준')).toBeInTheDocument()
    expect(screen.queryByText('백엔드 사용자')).not.toBeInTheDocument()
    expect(screen.getByText('로그인됨')).toBeInTheDocument()
    expect(screen.queryByText('내 계정으로 길안내 설정을 저장합니다')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '현재 위치 다시 받기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2D 지도' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '3D 지도' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('slider', { name: '확대' })).toHaveValue('18.3')
    expect(screen.queryByRole('slider', { name: '기울기' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-zoom', '18.3')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '0')

    fireEvent.click(screen.getByRole('button', { name: '3D 지도' }))
    expect(screen.getByRole('button', { name: '3D 지도' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: '기울기' })).toHaveValue('45')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '45')

    fireEvent.change(screen.getByRole('slider', { name: '확대' }), { target: { value: '17.6' } })
    fireEvent.change(screen.getByRole('slider', { name: '기울기' }), { target: { value: '35' } })

    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-zoom', '17.6')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '35')

    fireEvent.click(screen.getByRole('button', { name: '2D 지도' }))
    expect(screen.queryByRole('slider', { name: '기울기' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '0')
  })

  it('edits the selected profile behavior sensitivities from the settings drawer', async () => {
    mockedGetBootstrap.mockResolvedValueOnce({
      account: {
        id: 'account-1',
        displayName: '백엔드 사용자',
        email: 'driver@example.com',
      },
      profiles: mockProfiles,
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: {
        vitModelAvailable: true,
        geminiAvailable: false,
        emailAvailable: true,
        demoMode: true,
      },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('민준')
    fireEvent.click(await screen.findByRole('button', { name: '민감도 수정' }))

    expect(screen.getByRole('button', { name: '설정으로 돌아가기' })).toBeInTheDocument()
    const drowsinessSlider = screen.getAllByRole('slider')[0]
    expect(drowsinessSlider).toHaveValue(9)
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('9')

    const sliderRoot = drowsinessSlider.parentElement
    expect(sliderRoot).toBeTruthy()
    Object.defineProperty(sliderRoot, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ bottom: 16, height: 16, left: 0, right: 70, top: 0, width: 70 }),
    })

    fireEvent.pointerDown(sliderRoot!, { button: 0, clientX: 60, pointerId: 1 })
    fireEvent.pointerMove(sliderRoot!, { clientX: 50, pointerId: 1 })
    fireEvent.pointerMove(sliderRoot!, { clientX: 40, pointerId: 1 })
    await act(async () => {})

    expect(mockedUpdateProfile).not.toHaveBeenCalled()
    expect(screen.getAllByRole('slider')[0]).toHaveValue(3)

    fireEvent.keyDown(drowsinessSlider, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledTimes(1)
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-1', {
        behaviorWarningSensitivity: {
          ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
          DROWSINESS: 4,
        },
      })
    })

    fireEvent.click(screen.getByRole('button', { name: '설정으로 돌아가기' }))
    expect(screen.getByRole('button', { name: '민감도 수정' })).toBeInTheDocument()
  })

  it('renders seven accessible behavior sensitivity sliders with labelled values', async () => {
    mockedGetBootstrap.mockResolvedValueOnce({
      account: { id: 'account-1', displayName: '백엔드 사용자', email: 'driver@example.com' },
      profiles: mockProfiles,
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: { vitModelAvailable: true, geminiAvailable: false, emailAvailable: true, demoMode: true },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('민준')
    fireEvent.click(screen.getByRole('button', { name: '민감도 수정' }))
    await screen.findByRole('button', { name: '설정으로 돌아가기' })

    const labels = ['졸음', '휴대폰 사용', '음식/음료 섭취', '시선 이탈', '부주의 행동', '뒤쪽 확인/손 뻗기', '흡연']
    expect(screen.getAllByRole('slider')).toHaveLength(labels.length)

    labels.forEach((label) => {
      expect(screen.getByRole('slider', { name: label })).toHaveAttribute('min', '3')
      expect(screen.getByRole('slider', { name: label })).toHaveAttribute('max', '10')
      expect(screen.getByRole('slider', { name: label })).toHaveAttribute('step', '1')
      expect(screen.getByRole('status', { name: `${label} 민감도 값` })).toBeInTheDocument()
    })
  })

  it('serializes rapid sensitivity changes without stale responses or failures overwriting later edits', async () => {
    let rejectFirstUpdate: ((reason?: unknown) => void) | undefined
    let resolveSecondUpdate: ((profile: Profile) => void) | undefined
    const firstUpdate = new Promise<Profile>((_resolve, reject) => {
      rejectFirstUpdate = reject
    })
    const secondUpdate = new Promise<Profile>((resolve) => {
      resolveSecondUpdate = resolve
    })
    mockedUpdateProfile
      .mockImplementationOnce(() => firstUpdate)
      .mockImplementationOnce(() => secondUpdate)
    mockedGetBootstrap.mockResolvedValueOnce({
      account: { id: 'account-1', displayName: '백엔드 사용자', email: 'driver@example.com' },
      profiles: mockProfiles,
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: { vitModelAvailable: true, geminiAvailable: false, emailAvailable: true, demoMode: true },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('민준')
    fireEvent.click(screen.getByRole('button', { name: '민감도 수정' }))
    await screen.findByRole('button', { name: '설정으로 돌아가기' })

    const drowsinessSlider = screen.getByRole('slider', { name: '졸음' })
    fireEvent.keyDown(drowsinessSlider, { key: 'ArrowLeft' })
    fireEvent.keyDown(drowsinessSlider, { key: 'ArrowLeft' })

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledTimes(1))
    expect(drowsinessSlider).toHaveValue(7)
    rejectFirstUpdate?.(new Error('first save failed'))

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledTimes(2))
    expect(drowsinessSlider).toHaveValue(7)
    expect(mockedUpdateProfile).toHaveBeenNthCalledWith(2, 'profile-1', {
      behaviorWarningSensitivity: {
        ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        DROWSINESS: 7,
      },
    })

    resolveSecondUpdate?.({
      ...mockProfiles[0],
      behaviorWarningSensitivity: {
        ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        DROWSINESS: 7,
      },
    })
    await waitFor(() => expect(drowsinessSlider).toHaveValue(7))
  })

  it('keeps per-profile sensitivity saves ordered across settings drawer remounts', async () => {
    let resolveFirstUpdate: ((profile: Profile) => void) | undefined
    const firstUpdate = new Promise<Profile>((resolve) => {
      resolveFirstUpdate = resolve
    })
    mockedUpdateProfile
      .mockImplementationOnce(() => firstUpdate)
      .mockImplementationOnce(async (profileId, payload) => ({
        ...mockProfiles[0],
        ...payload,
        id: profileId,
      }))
    mockedGetBootstrap.mockResolvedValueOnce({
      account: { id: 'account-1', displayName: '백엔드 사용자', email: 'driver@example.com' },
      profiles: mockProfiles,
      selectedProfileId: 'profile-1',
      profileLimit: 5,
      capabilities: { vitModelAvailable: true, geminiAvailable: false, emailAvailable: true, demoMode: true },
    })
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('민준')
    fireEvent.click(screen.getByRole('button', { name: '민감도 수정' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: '졸음' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    await screen.findByText('민준')
    fireEvent.click(screen.getByRole('button', { name: '민감도 수정' }))
    fireEvent.keyDown(screen.getByRole('slider', { name: '휴대폰 사용' }), { key: 'ArrowLeft' })

    expect(mockedUpdateProfile).toHaveBeenCalledTimes(1)

    resolveFirstUpdate?.({
      ...mockProfiles[0],
      behaviorWarningSensitivity: {
        ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        DROWSINESS: 8,
      },
    })

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledTimes(2))
    expect(mockedUpdateProfile).toHaveBeenNthCalledWith(2, 'profile-1', {
      behaviorWarningSensitivity: {
        ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
        DROWSINESS: 8,
        PHONE_USE: 8,
      },
    })
  })

  it('keeps the rail inside the navigation viewport and connects the drawer on its right side', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))

    const viewport = screen.getByTestId('navigation-viewport')
    const contentRegion = screen.getByTestId('navigation-content-region')
    const overlays = screen.getByTestId('navigation-overlays')
    const railDock = screen.getByTestId('right-rail-dock')
    const drawer = await screen.findByRole('dialog', { name: '설정' })
    const railRoot = railDock.closest('[aria-label="오른쪽 도구 모음"]')

    expect(viewport).toContainElement(overlays)
    expect(viewport).toContainElement(railDock)
    expect(viewport).toContainElement(drawer)
    expect(viewport).toContainElement(contentRegion)
    expect(viewport).not.toHaveClass('md:w-[calc(100%-320px)]')
    expect(contentRegion).toHaveClass('w-full')
    expect(contentRegion).not.toHaveClass('md:w-[calc(100%-320px)]')
    expect(railRoot).not.toBeNull()
    expect(railRoot).toHaveClass('absolute')
    expect(railRoot).toHaveClass('bottom-[43px]')
    expect(railRoot).toHaveClass('right-0')
    expect(railRoot).not.toHaveClass('right-[320px]')
    expect(railRoot).not.toHaveClass('transition-[right]')
    expect(railDock).toHaveClass('rounded-tl-[1.15rem]')
    expect(railDock).toHaveClass('rounded-bl-none')
    expect(railDock).not.toHaveClass('rounded-l-[1.15rem]')
    expect(railDock).toHaveClass('border-t')
    expect(railDock).not.toHaveClass('border-b')
    expect(railDock).not.toHaveClass('border-l')
    expect(drawer).toHaveClass('bg-white')
    expect(drawer).not.toHaveClass('rounded-l-[1.15rem]')
    expect(drawer).not.toHaveClass('rounded-r-[1.15rem]')
    expect(drawer).not.toHaveClass('max-sm:bottom-2')
    expect(drawer).not.toHaveClass('max-sm:right-2')
    expect(drawer).toHaveClass('absolute')
    expect(drawer).toHaveClass('top-0')
    expect(drawer).toHaveClass('bottom-[43px]')
    expect(drawer).toHaveClass('max-sm:bottom-[37px]')
    expect(drawer).not.toHaveClass('bottom-0')
    expect(drawer).toHaveClass('right-0')
  })

  it('opens the report drawer and the connect drawer from the rail', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '보고서' }))
    expect(await screen.findByRole('dialog', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByTestId('report-drawer')).toBeInTheDocument()
    expect(screen.getByText('이번 주 운행 리포트')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보고서' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: '전체 보고서 보기' }))
    expect(await screen.findByRole('dialog', { name: '전체 운행 보고서' })).toBeInTheDocument()
    expect(screen.getByText('운행 리포트')).toBeInTheDocument()
    expect(screen.getByText('최근 7일 · 전체 행동 · 3회 운행')).toBeInTheDocument()
    expect(screen.queryByText('API 요청 조건')).not.toBeInTheDocument()
    expect(screen.queryByText('periodStart=2026-06-27')).not.toBeInTheDocument()
    expect(screen.queryByText('periodEnd=2026-07-03')).not.toBeInTheDocument()
    expect(screen.getAllByText('평균 안전 점수').length).toBeGreaterThan(0)
    expect(screen.getByText('총 운행 거리')).toBeInTheDocument()
    expect(screen.getByText('이상행동')).toBeInTheDocument()
    expect(screen.getAllByText('교정률').length).toBeGreaterThan(0)
    const averageScoreValue = screen.getAllByText('82점').find((element) => element.classList.contains('text-2xl'))!
    expect(averageScoreValue).toHaveClass('text-2xl')
    expect(averageScoreValue).not.toHaveClass('text-3xl')
    const totalDistanceValue = screen.getAllByText('500.4 km').find((element) => element.classList.contains('text-2xl'))!
    expect(totalDistanceValue).toHaveClass('whitespace-nowrap')
    expect(totalDistanceValue).not.toHaveClass('truncate')
    expect(totalDistanceValue.parentElement).toHaveClass('flex-1')
    expect(screen.getByText('안전 점수 추이')).toBeInTheDocument()
    expect(screen.getByTestId('daily-safety-chart')).toHaveAttribute('data-chart-library', 'recharts')
    expect(screen.getByText('교정 성공률')).toBeInTheDocument()
    expect(screen.getByTestId('correction-rate-chart')).toHaveAttribute('data-chart-library', 'recharts')
    fireEvent.click(screen.getByRole('button', { name: '최근 30일' }))
    expect(screen.getByText('최근 30일 · 전체 행동 · 3회 운행')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '부주의 행동' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '뒤쪽 확인/손 뻗기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '흡연' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '휴대폰 사용' }))
    expect(screen.getByText('최근 30일 · 휴대폰 사용 · 3회 운행')).toBeInTheDocument()
    expect(screen.queryByText('behaviorTypes=PHONE_USE')).not.toBeInTheDocument()
    expect(screen.getByText('최근 운행 세션')).toBeInTheDocument()
    expect(screen.getByText('행동 유형별 분석')).toBeInTheDocument()
    expect(screen.getAllByText('휴대폰 사용').length).toBeGreaterThan(0)
    expect(screen.queryByText('졸음 4건')).not.toBeInTheDocument()
    expect(screen.getByTestId('behavior-type-chart')).toHaveAttribute('data-chart-library', 'recharts')
    const hourlyEventGrid = screen.getByTestId('hourly-event-grid')
    expect(hourlyEventGrid).toHaveAttribute('data-chart-library', 'recharts')
    expect(within(hourlyEventGrid).getByText('17시')).toBeInTheDocument()
    expect(within(hourlyEventGrid).getAllByText('1건').length).toBeGreaterThan(0)
    expect(screen.getByText('세션 상세')).toBeInTheDocument()
    expect(screen.getByTestId('report-sessions-layout')).toHaveClass('h-[26rem]')
    expect(screen.getByTestId('report-sessions-layout')).toHaveClass('min-h-0')
    expect(screen.getByTestId('report-session-list-panel')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('report-session-list-scroll')).toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('report-session-detail-panel')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('report-session-detail-scroll')).toHaveClass('overflow-y-auto')
    fireEvent.click(screen.getByRole('button', { name: /17:42/ }))
    expect(screen.getByText('종료 상태 COMPLETED')).toBeInTheDocument()
    expect(screen.getByText('위치 기록 3개')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '전체 운행 보고서 닫기' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '전체 운행 보고서' })).not.toBeInTheDocument()
    })
    expect(await screen.findByRole('button', { name: '연동 상태' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '연동 상태' }))
    expect(await screen.findByRole('dialog', { name: '연동 상태' })).toBeInTheDocument()
    expect(screen.getByTestId('connect-drawer')).toBeInTheDocument()
    expect(screen.getByText('연결 상태')).toBeInTheDocument()
    expect(screen.getByText('기기 정보')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연결 다시 확인' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '연동 상태' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens the music popover and starts the mini player from the rail', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))

    expect(await screen.findByRole('dialog', { name: '음악' })).toBeInTheDocument()
    expect(screen.getByTestId('music-popover')).toBeInTheDocument()
    expect(screen.getByTestId('music-popover')).toHaveClass('bottom-14')
    expect(screen.getByTestId('music-popover')).toHaveClass('max-h-[calc(100%-4.25rem)]')
    expect(screen.getByTestId('music-popover')).toHaveClass('flex')
    expect(screen.getByTestId('music-track-list')).toHaveClass('min-h-0')
    expect(screen.getByTestId('music-track-list')).toHaveClass('flex-1')
    expect(screen.getByTestId('music-track-list')).toHaveClass('overflow-y-auto')
    expect(screen.getByLabelText('음악 검색')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Drive Neon/ })).toBeInTheDocument()
    expect(screen.getByText('City Pulse')).toBeInTheDocument()
    expect(screen.getByText('3:24')).toBeInTheDocument()
    expect(screen.queryByText('도심 주행')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Soft Focus/ }))
    fireEvent.click(screen.getByRole('button', { name: '재생' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '음악' })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('music-mini-player')).toBeInTheDocument()
    expect(screen.getByText('Soft Focus')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('0:00 / 3:08'))).toBeInTheDocument()
    expect(screen.getByText('Evening Route')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '음악 일시정지' })).toBeInTheDocument()
  })

  it('keeps tracks matching a combined title and artist search visible', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))
    expect(await screen.findByRole('button', { name: /Soft Focus/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('음악 검색'), { target: { value: 'Soft Evening' } })

    expect(screen.getByRole('button', { name: /Soft Focus/ })).toBeInTheDocument()
  })

  it('matches music titles regardless of spaces in the search keyword', async () => {
    const queryClient = new QueryClient()
    mockedGetMusicRecommendations.mockResolvedValueOnce([
      {
        id: 'red-sunset-original',
        title: '붉은 노을',
        artist: '빅뱅',
        album: 'Remember',
        duration: '4:03',
        durationSeconds: 243,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/song/red-sunset-original',
        provider: 'itunes',
      },
      {
        id: 'red-sunset-live',
        title: '붉은 노을 Live',
        artist: '빅뱅',
        album: 'BIGBANG 10',
        duration: '4:12',
        durationSeconds: 252,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/song/red-sunset-live',
        provider: 'itunes',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))
    expect(await screen.findAllByRole('button', { name: /붉은 노을/ })).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('음악 검색'), { target: { value: '붉은노을' } })

    expect(screen.getAllByRole('button', { name: /붉은 노을/ })).toHaveLength(2)
  })

  it('keeps API results visible when a Korean artist search returns an English artist name', async () => {
    const queryClient = new QueryClient()
    mockedGetMusicRecommendations.mockResolvedValueOnce([
      {
        id: 'bigbang-blue',
        title: 'Blue',
        artist: 'BIGBANG',
        album: 'Alive',
        duration: '3:54',
        durationSeconds: 234,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/song/bigbang-blue',
        provider: 'itunes',
      },
      {
        id: 'bigbang-if-you',
        title: 'IF YOU',
        artist: 'BIGBANG',
        album: 'MADE',
        duration: '3:44',
        durationSeconds: 224,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/song/bigbang-if-you',
        provider: 'itunes',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))
    expect(await screen.findAllByText('BIGBANG')).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('음악 검색'), { target: { value: '빅뱅' } })

    expect(screen.getAllByText('BIGBANG')).toHaveLength(2)
  })

  it('advances visible playback time and loads the next track when the current track ends', async () => {
    const queryClient = new QueryClient()
    mockedGetMusicRecommendations.mockResolvedValueOnce([
      {
        id: 'track-short',
        title: 'Short Start',
        artist: 'First Artist',
        album: 'Quick Drive',
        duration: '0:02',
        durationSeconds: 2,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/album/short-start/1?i=1',
        provider: 'itunes',
      },
      {
        id: 'track-next',
        title: 'Next Road',
        artist: 'Second Artist',
        album: 'Continue Drive',
        duration: '0:04',
        durationSeconds: 4,
        coverUrl: null,
        sourceUrl: 'https://music.apple.com/kr/album/next-road/2?i=2',
        provider: 'itunes',
      },
    ])

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))
    fireEvent.click(await screen.findByRole('button', { name: /Short Start/ }))
    fireEvent.click(screen.getByRole('button', { name: '재생' }))

    expect(await screen.findByText('Short Start')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('0:00 / 0:02'))).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText((content) => content.includes('0:01 / 0:02'))).toBeInTheDocument()
    }, { timeout: 1_500 })

    await waitFor(() => {
      expect(screen.getByText('Next Road')).toBeInTheDocument()
      expect(screen.getByText((content) => content.includes('0:00 / 0:04'))).toBeInTheDocument()
    }, { timeout: 1_500 })
  })

  it('requests location on entry and centers the map on the granted position', async () => {
    mockGeolocationSuccess(37.5512, 127.0738)
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled()
    })
    expect(screen.getByTestId('tmap-panel')).toHaveTextContent('current:37.5512,127.0738')
    expect(screen.getByRole('button', { name: /어디로 갈까요/ })).not.toBeDisabled()
  })

  it('uses Sejong University as the current location when location permission is denied', async () => {
    mockGeolocationError()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('세종대학교를 현재 위치로 사용 중입니다')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveTextContent('current:37.5502,127.0730')
    const searchButton = screen.getByRole('button', { name: /어디로 갈까요/ })
    expect(searchButton).not.toBeDisabled()

    fireEvent.click(searchButton)

    expect(screen.getByDisplayValue('세종대학교')).toBeInTheDocument()
    expect(await screen.findByPlaceholderText('목적지 검색')).toHaveFocus()
  })

  it('hides the fallback location toast after 5 seconds and keeps retry available in settings', async () => {
    mockGeolocationError()
    const queryClient = new QueryClient()

    vi.useFakeTimers()

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
        </QueryClientProvider>,
      )

      expect(screen.getByText('세종대학교를 현재 위치로 사용 중입니다')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(5000)
      })

      expect(screen.queryByText('세종대학교를 현재 위치로 사용 중입니다')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '설정' }))

      expect(screen.getByRole('dialog', { name: '설정' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '현재 위치 다시 받기' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens destination search as a navigation bottom sheet from the current location', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const searchButton = await screen.findByRole('button', { name: /어디로 갈까요/ })
    await waitFor(() => {
      expect(searchButton).not.toBeDisabled()
    })
    fireEvent.click(searchButton)

    expect(screen.queryByText('현재 위치에서')).not.toBeInTheDocument()
    expect(screen.queryByText('출발지는 변경할 수 있습니다')).not.toBeInTheDocument()
    expect(screen.queryByText('선택됨')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('서울특별시 중구 세종대로 110')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목적지')).toBeInTheDocument()
    expect(await screen.findByPlaceholderText('목적지 검색')).toHaveFocus()
    expect(screen.queryByDisplayValue('서울특별시 중구 세종대로 110')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('목적지')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '경로 입력으로 돌아가기' }))
    expect(await screen.findByDisplayValue('서울특별시 중구 세종대로 110')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목적지')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /어디로 갈까요/ })).not.toBeInTheDocument()
    })
    expect(screen.queryByText('NAVI DEMO')).not.toBeInTheDocument()
  })

  it('selects origin and destination, then requests a TMAP route through the backend', async () => {
    mockedSearchPlaces.mockImplementation(async (keyword) => {
      if (keyword === '서울역') {
        return [
          {
            id: 'origin',
            name: '서울역',
            address: '서울 중구',
            coordinate: { lat: 37.5547, lng: 126.9706 },
          },
        ]
      }

      return [
        {
          id: 'destination',
          name: '강남역',
          address: '서울 강남구',
          coordinate: { lat: 37.4979, lng: 127.0276 },
        },
      ]
    })
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
      maneuvers: [
        {
          id: 'left-500',
          type: 'left',
          label: '좌회전',
          description: '좌회전',
          coordinate: { lat: 37.56, lng: 126.98 },
          distanceFromStartMeters: 500,
        },
        {
          id: 'right-900',
          type: 'right',
          label: '우회전',
          description: '우회전',
          coordinate: { lat: 37.55, lng: 126.99 },
          distanceFromStartMeters: 900,
        },
        {
          id: 'overpass-120',
          type: 'overpass',
          label: '고가도로',
          description: '고가도로',
          coordinate: { lat: 37.557, lng: 126.977 },
          distanceFromStartMeters: 120,
          facilityType: 'overpass',
          signCode: 120,
        },
      ],
      safetyAlerts: [
        {
          id: 'school-zone-40',
          type: 'caution',
          label: '어린이보호구역',
          description: '어린이보호구역 안내',
          coordinate: { lat: 37.557, lng: 126.976 },
          distanceFromStartMeters: 40,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const originInput = await openOriginEditor()
    fireEvent.change(originInput, {
      target: { value: '서울역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /서울역/ }))
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(mockedGetRoute).toHaveBeenCalledWith(
        { lat: 37.5547, lng: 126.9706 },
        { lat: 37.4979, lng: 127.0276 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
    expect(await screen.findByText('22분')).toBeInTheDocument()
    expect(screen.getByText('12.3 km')).toBeInTheDocument()
    const bottomStatusBar = screen.getByTestId('bottom-status-bar')
    expect(bottomStatusBar).toHaveClass('grid-cols-5')
    expect(bottomStatusBar).toHaveClass('bg-white')
    expect(bottomStatusBar).not.toHaveClass('bg-white/82')
    expect(bottomStatusBar).not.toHaveClass('backdrop-blur-xl')
    expect(bottomStatusBar).toHaveClass('rounded-tl-xl')
    expect(bottomStatusBar).toHaveClass('rounded-tr-none')
    expect(bottomStatusBar).toHaveClass('h-[43px]')
    expect(screen.queryByText('도착')).not.toBeInTheDocument()
    expect(screen.queryByText('남은시간')).not.toBeInTheDocument()
    expect(screen.queryByText('목적지')).not.toBeInTheDocument()
    expect(screen.queryByText('남은거리')).not.toBeInTheDocument()
    expect(screen.queryByText('날씨')).not.toBeInTheDocument()
    expect(bottomStatusBar).toContainElement(screen.getByText('서울 강남구'))
    expect(screen.getByText('좌회전')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    const assistSigns = await screen.findByTestId('driving-assist-signs')
    const speedLimitSlot = screen.getByTestId('speed-limit-slot')
    const eventSigns = screen.getByTestId('driving-event-signs')
    expect(eventSigns).toContainElement(screen.getByLabelText('어린이보호구역 40m 남음'))
    expect(eventSigns).toContainElement(screen.getByLabelText('고가도로 120m 남음'))
    expect(speedLimitSlot).toContainElement(screen.getByLabelText('제한속도 50km/h'))
    expect(assistSigns).toContainElement(speedLimitSlot)
    expect(assistSigns).toContainElement(eventSigns)
    const primaryManeuverCard = screen.getByTestId('primary-maneuver-card')
    const nextManeuverCard = screen.getByTestId('next-maneuver-card')
    expect(primaryManeuverCard).toHaveClass('w-fit')
    expect(primaryManeuverCard).toHaveClass('max-w-[min(22rem,calc(100%-7rem))]')
    expect(primaryManeuverCard).toContainElement(screen.getByText('좌회전'))
    expect(primaryManeuverCard.querySelector('img[src*="left"]')).toBeInTheDocument()
    expect(nextManeuverCard).toHaveClass('w-fit')
    expect(nextManeuverCard).not.toHaveClass('w-[min(16rem,calc(100%-10rem))]')
    expect(nextManeuverCard).toContainElement(screen.getByText('900m'))
    expect(nextManeuverCard.querySelector('img[src*="right"]')).toBeInTheDocument()
    expect(primaryManeuverCard).not.toContainElement(nextManeuverCard)
  })

  it('shows route candidates before starting guidance and starts with the selected option', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    await waitFor(() => {
      expect(mockedGetRouteOptions).toHaveBeenCalledWith(
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    const routeSelectionSummary = screen.getByTestId('route-selection-summary')
    expect(routeSelectionSummary).toHaveClass('bottom-20')
    expect(routeSelectionSummary).toHaveClass('left-1/2')
    expect(routeSelectionSummary).toHaveClass('-translate-x-1/2')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-points', '0')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-active-route-option', 'route-recommended')
    expect(screen.getByRole('button', { name: '최적 경로 안내 시작' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최적 경로 경로 보기' })).toHaveAttribute('aria-pressed', 'true')
    const fastestRouteCard = screen.getByRole('button', { name: '최소시간 경로 보기' })
    expect(fastestRouteCard).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(fastestRouteCard)
    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-active-route-option', 'route-fastest')
    })
    expect(fastestRouteCard).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '최소시간 안내 시작' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '최소시간 안내 시작' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(Number(screen.getByTestId('tmap-panel').getAttribute('data-route-points'))).toBeGreaterThan(0)
    expect(screen.getByText('21분')).toBeInTheDocument()
    expect(screen.getByText('12.8 km')).toBeInTheDocument()
  })

  it('shows a 로디 thinking modal while route candidates are loading', async () => {
    let resolveRouteOptions!: (options: Awaited<ReturnType<typeof getRouteOptions>>) => void
    mockedGetRouteOptions.mockReturnValue(new Promise((resolve) => {
      resolveRouteOptions = resolve
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    const loadingModal = await screen.findByTestId('route-search-loading-modal')
    expect(within(loadingModal).getByText('경로를 계산하고 있어요')).toBeInTheDocument()
    expect(within(loadingModal).getByText('교통 흐름과 후보 경로를 비교하는 중')).toBeInTheDocument()
    expect(within(loadingModal).getByTestId('voice-orb')).toHaveAttribute('data-state', 'thinking')
    expect(within(loadingModal).getByTestId('voice-orb')).toHaveAttribute('data-color-theme', 'ocean')

    act(() => {
      resolveRouteOptions([
        {
          id: 'route-recommended',
          label: '추천',
          searchOption: '0',
          color: '#0EA5E9',
          isRecommended: true,
          route: {
            coordinates: [
              { lat: 37.5665, lng: 126.978 },
              { lat: 37.4979, lng: 127.0276 },
            ],
            summary: {
              distanceMeters: 12340,
              durationSeconds: 1320,
            },
          },
        },
        {
          id: 'route-fastest',
          label: '최소시간',
          searchOption: '2',
          color: '#F97316',
          isRecommended: false,
          route: {
            coordinates: [
              { lat: 37.5665, lng: 126.978 },
              { lat: 37.51, lng: 127.01 },
              { lat: 37.4979, lng: 127.0276 },
            ],
            summary: {
              distanceMeters: 12800,
              durationSeconds: 1260,
            },
          },
        },
      ])
    })

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('route-search-loading-modal')).not.toBeInTheDocument()
    })
  })

  it('keeps route cards hidden until route overlays are ready', async () => {
    routeOptionsOverlayReadyByDefault = false
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    await waitFor(() => {
      expect(mockedGetRouteOptions).toHaveBeenCalled()
    })
    expect(await screen.findByTestId('route-search-loading-modal')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '최적 경로 경로 보기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '최소시간 경로 보기' })).not.toBeInTheDocument()

    act(() => {
      latestRouteOptionsOverlayReady?.(true)
    })

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최적 경로 경로 보기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '최소시간 경로 보기' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('route-search-loading-modal')).not.toBeInTheDocument()
    })
  })

  it('paints the route loading modal before starting route candidate requests', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByTestId('route-search-loading-modal')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-selection-mode', 'true')
    expect(mockedGetRouteOptions).not.toHaveBeenCalled()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    await waitFor(() => {
      expect(mockedGetRouteOptions).toHaveBeenCalledTimes(1)
    })
  })

  it('restores 3D map mode after selecting a route option from route selection', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    fireEvent.click(await screen.findByRole('button', { name: '3D 지도' }))
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }))

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    })
    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '최소시간 경로 보기' }))
    fireEvent.click(screen.getByRole('button', { name: '최소시간 안내 시작' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '45')
  })

  it('disables map settings while choosing a route option', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    expect(await screen.findByRole('dialog', { name: '설정' })).toBeInTheDocument()

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    const settingsButton = screen.getByRole('button', { name: '설정' })
    expect(settingsButton).toBeDisabled()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
    })

    fireEvent.click(settingsButton)

    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument()
  })

  it('keeps route candidates visible while editing the destination before selecting a route', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('목적지 검색')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '변경' }))
    const destinationInput = await screen.findByPlaceholderText('목적지 검색')
    fireEvent.change(destinationInput, {
      target: { value: '' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
    })
    expect(screen.getByText('2개 경로')).toBeInTheDocument()
  })

  it('ends route selection from the summary control bar', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    const summary = await screen.findByTestId('route-selection-summary')
    expect(within(summary).getByRole('button', { name: '종료' })).toBeInTheDocument()
    expect(within(summary).getByRole('button', { name: '변경' })).toBeInTheDocument()
    const summaryButtons = within(summary).getAllByRole('button').map((button) => button.textContent)
    expect(summaryButtons.indexOf('종료')).toBeGreaterThan(summaryButtons.indexOf('변경'))
    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
    })

    fireEvent.click(within(summary).getByRole('button', { name: '종료' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(screen.queryByTestId('route-selection-summary')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('목적지 검색')).not.toBeInTheDocument()
    })
  })

  it('hides stale route candidates when the destination draft no longer matches the selected place', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')

    fireEvent.click(screen.getByRole('button', { name: '변경' }))
    const destinationInput = await screen.findByPlaceholderText('목적지 검색')
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })

    expect(within(screen.getByTestId('route-selection-summary')).queryByText('강남역')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('route-selection-summary')).getByText('회사')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(screen.queryByRole('button', { name: '최적 경로 경로 보기' })).not.toBeInTheDocument()
  })

  it('cancels route selection when the destination editor is closed with an empty destination', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))
    fireEvent.click(await screen.findByRole('button', { name: '3D 지도' }))
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    })
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('목적지 검색')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '변경' }))
    const destinationInput = await screen.findByPlaceholderText('목적지 검색')
    fireEvent.change(destinationInput, {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: '경로 검색 닫기' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(screen.queryByTestId('route-selection-summary')).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
  })

  it('cancels route selection when the route editor is closed from route selection', async () => {
    mockedGetRouteOptions.mockResolvedValue([
      {
        id: 'route-recommended',
        label: '추천',
        searchOption: '0',
        color: '#0EA5E9',
        isRecommended: true,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        },
      },
      {
        id: 'route-fastest',
        label: '최소시간',
        searchOption: '2',
        color: '#F97316',
        isRecommended: false,
        route: {
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.51, lng: 127.01 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12800,
            durationSeconds: 1260,
          },
        },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByText('2개 경로')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('목적지 검색')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: '변경' }))
    expect(await screen.findByPlaceholderText('목적지 검색')).toHaveValue('회사')
    fireEvent.click(screen.getByRole('button', { name: '경로 검색 닫기' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(screen.queryByTestId('route-selection-summary')).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /어디로 갈까요/ })).toBeInTheDocument()
  })

  it('cycles every driving assist sign in debug mode', async () => {
    const debugSequenceWaitMs = 1450
    window.history.replaceState(null, '', '/?debugSigns=1')
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5547, lng: 126.9706 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12300,
        durationSeconds: 1320,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openOriginEditor()
    mockedSearchPlaces.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '출발지를 집으로 설정' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '목적지' })).toBeInTheDocument()
    })
    fireEvent.focus(screen.getByRole('combobox', { name: '목적지' }))
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByLabelText('어린이보호구역 40m 남음')).toBeInTheDocument()
    expect(screen.queryByLabelText('제한속도 30km/h')).not.toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, debugSequenceWaitMs))
    })
    expect(screen.getByLabelText('단속구간 80m 남음')).toBeInTheDocument()
    expect(screen.queryByLabelText('제한속도 30km/h')).not.toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, debugSequenceWaitMs))
    })
    expect(screen.getByLabelText('급커브 120m 남음')).toBeInTheDocument()
    expect(screen.queryByLabelText('제한속도 30km/h')).not.toBeInTheDocument()
  })

  it('sets origin and destination from saved places without a POI search request', async () => {
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5547, lng: 126.9706 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12300,
        durationSeconds: 1320,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    await openOriginEditor()
    fireEvent.click(screen.getByRole('button', { name: '출발지를 집으로 설정' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '목적지' })).toBeInTheDocument()
    })
    fireEvent.focus(screen.getByRole('combobox', { name: '목적지' }))
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(mockedSearchPlaces).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mockedGetRoute).toHaveBeenCalledWith(
        { lat: 37.5547, lng: 126.9706 },
        { lat: 37.4979, lng: 127.0276 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
  })

  it('manages quick labels and uses them in the route search sheet', async () => {
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5501, lng: 127.0734 },
        { lat: 37.5442, lng: 127.0557 },
      ],
      summary: {
        distanceMeters: 6200,
        durationSeconds: 960,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: /민준 프로필 선택/ }))
    fireEvent.click(screen.getByRole('button', { name: '민준(으)로 시작' }))
    await enterFreeNavigationIfNeeded()

    const railButtons = within(await screen.findByTestId('right-rail-dock')).getAllByRole('button')
    expect(railButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '설정',
      '라벨 설정',
      '보고서',
      '연동 상태',
      '음악',
    ])

    fireEvent.click(await screen.findByRole('button', { name: '라벨 설정' }))
    expect(await screen.findByTestId('labels-drawer')).toBeInTheDocument()
    expect(screen.getByTestId('side-drawer-content')).toHaveClass('overflow-x-hidden')
    expect(screen.getByTestId('side-drawer-content')).toHaveClass('overflow-y-auto')
    await waitFor(() => {
      expect(mockedListSavedPlaces).toHaveBeenCalledWith('profile-1', undefined, expect.any(AbortSignal))
    })
    expect(screen.getByText('성수 카페')).toBeInTheDocument()
    expect(screen.queryByText('경로 설정')).not.toBeInTheDocument()
    expect(screen.queryByText('현재 선택 위치 추가')).not.toBeInTheDocument()
    expect(screen.getByText('출발지 라벨')).toBeInTheDocument()
    expect(screen.getByText('목적지 라벨')).toBeInTheDocument()
    expect(screen.queryByText('즐겨찾기')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '집을 출발지로 설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '성수 카페를 목적지로 설정' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '성수 카페 목적지 라벨 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '성수 카페 목적지 라벨 수정' }))
    fireEvent.change(screen.getByLabelText('성수 카페 라벨 이름 수정'), {
      target: { value: '성수 작업실' },
    })
    fireEvent.click(screen.getByRole('button', { name: '성수 카페 라벨 수정 저장' }))
    await waitFor(() => {
      expect(mockedUpdateSavedPlace).toHaveBeenCalledWith('favorite-id', { label: '성수 작업실' })
    })
    fireEvent.click(screen.getByRole('button', { name: '성수 카페 목적지 라벨 메뉴' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '성수 카페 목적지 라벨 삭제' }))
    await waitFor(() => {
      expect(mockedDeleteSavedPlace).toHaveBeenCalledWith('favorite-id')
    })
    mockedSearchPlaces.mockResolvedValueOnce([
      {
        id: 'sejong-poi',
        name: '세종대학교',
        address: '서울 광진구 능동로 209',
        coordinate: { lat: 37.5502, lng: 127.073 },
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: '출발지 라벨 추가' }))
    fireEvent.change(await screen.findByRole('combobox', { name: '출발지 라벨 주소 검색' }), {
      target: { value: '세종대' },
    })
    fireEvent.click(await screen.findByRole('button', { name: '세종대학교 주소 선택' }))
    fireEvent.change(screen.getByLabelText('출발지 라벨 이름'), {
      target: { value: '학교' },
    })
    fireEvent.click(screen.getByRole('button', { name: '출발지 라벨 저장' }))
    await waitFor(() => {
      expect(mockedCreateFavorite).toHaveBeenCalledWith('profile-1', {
        label: '학교',
        provider: 'TMAP',
        providerPlaceId: 'origin:sejong-poi',
        address: '서울 광진구 능동로 209',
        latitude: 37.5502,
        longitude: 127.073,
      })
    })
    expect(screen.getByRole('button', { name: '목적지 라벨 추가' })).not.toBeDisabled()
    mockedSearchPlaces.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '라벨 설정 닫기' }))
    await openOriginEditor()
    const originQuickLabels = screen.getByLabelText('출발지 빠른 설정')
    expect(originQuickLabels).toHaveClass('flex')
    expect(originQuickLabels).toHaveClass('flex-nowrap')
    expect(originQuickLabels).toHaveClass('w-full')
    expect(originQuickLabels).toHaveClass('max-w-full')
    expect(originQuickLabels).toHaveClass('min-w-0')
    expect(originQuickLabels).toHaveClass('overflow-x-auto')
    expect(originQuickLabels).not.toHaveClass('grid-cols-3')
    expect(screen.getByRole('button', { name: '출발지를 집으로 설정' })).toHaveClass('w-fit')
    fireEvent.click(await screen.findByRole('button', { name: '출발지를 집으로 설정' }))
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: '목적지' })).toBeInTheDocument()
    })
    fireEvent.focus(screen.getByRole('combobox', { name: '목적지' }))
    fireEvent.click(await screen.findByRole('button', { name: /도착지를 성수 카페.*설정/ }))

    expect(mockedSearchPlaces).not.toHaveBeenCalled()
    expect(mockedCreateSearchHistory).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mockedGetRouteOptions).toHaveBeenCalledWith(
        { lat: 37.5547, lng: 126.9706 },
        { lat: 37.5442, lng: 127.0557 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
  })

  it('shows recent search histories when the active route search input is empty', async () => {
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5547, lng: 126.9706 },
      ],
      summary: {
        distanceMeters: 2800,
        durationSeconds: 540,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    await openDestinationEditor()

    await waitFor(() => {
      expect(mockedListSearchHistories).toHaveBeenCalledWith('profile-1', { page: 1, size: 10 })
    })
    expect(screen.getByRole('listbox', { name: '최근 검색 기록' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: /서울역/ }))

    expect(mockedCreateSearchHistory).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(mockedGetRouteOptions).toHaveBeenCalledWith(
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5547, lng: 126.9706 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
  })

  it('supports keyboard selection for autocomplete results', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'origin',
        name: '세종대학교',
        address: '서울 광진구',
        coordinate: { lat: 37.5502, lng: 127.073 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5502, lng: 127.073 },
      ],
      summary: {
        distanceMeters: 9100,
        durationSeconds: 1180,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '세종' },
    })

    expect(await screen.findByRole('option', { name: /세종대학교/ })).toBeInTheDocument()
    expect(screen.getByTestId('route-search-results')).toContainElement(screen.getByRole('listbox'))
    fireEvent.keyDown(destinationInput, { key: 'ArrowDown' })
    fireEvent.keyDown(destinationInput, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(mockedCreateSearchHistory).toHaveBeenCalledWith('profile-1', {
        query: '세종',
        provider: 'TMAP',
        providerPlaceId: 'origin',
        placeName: '세종대학교',
        address: '서울 광진구',
        latitude: 37.5502,
        longitude: 127.073,
      })
    })
    await waitFor(() => {
      expect(mockedGetRoute).toHaveBeenCalledWith(
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5502, lng: 127.073 },
        undefined,
        expect.objectContaining({ aborted: false }),
      )
    })
    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-points', '2')
    })
  })

  it('debounces autocomplete API calls while keeping the input responsive', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()

    fireEvent.change(destinationInput, { target: { value: '강' } })
    fireEvent.change(destinationInput, { target: { value: '강남' } })
    fireEvent.change(destinationInput, { target: { value: '강남역' } })

    expect(destinationInput).toHaveValue('강남역')
    expect(mockedSearchPlaces).not.toHaveBeenCalled()

    expect(await screen.findByRole('option', { name: /강남역/ })).toBeInTheDocument()
    expect(mockedSearchPlaces).toHaveBeenCalledTimes(1)
    expect(mockedSearchPlaces).toHaveBeenCalledWith(
      '강남역',
      undefined,
      expect.objectContaining({ aborted: false }),
    )
  })

  it('renders all autocomplete results and scrolls the active option into view during keyboard navigation', async () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    mockedSearchPlaces.mockResolvedValue(Array.from({ length: 7 }, (_, index) => ({
      id: `place-${index}`,
      name: `검색 결과 ${index + 1}`,
      address: `주소 ${index + 1}`,
      coordinate: { lat: 37 + index * 0.001, lng: 127 },
    })))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '검색' },
    })

    expect(await screen.findByRole('option', { name: /검색 결과 7/ })).toBeInTheDocument()
    const destinationResults = screen.getByRole('listbox', { name: '도착지 검색 결과' })
    expect(within(destinationResults).getAllByRole('option')).toHaveLength(7)

    for (let index = 0; index < 6; index += 1) {
      fireEvent.keyDown(destinationInput, { key: 'ArrowDown' })
    }

    expect(destinationInput).toHaveAttribute('aria-activedescendant', 'place-results-destination-option-6')
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('starts route simulation from the selected route', async () => {
    mockedSearchPlaces.mockImplementation(async (keyword) => {
      if (keyword === '서울역') {
        return [
          {
            id: 'origin',
            name: '서울역',
            address: '서울 중구',
            coordinate: { lat: 37.5547, lng: 126.9706 },
          },
        ]
      }

      return [
        {
          id: 'destination',
          name: '강남역',
          address: '서울 강남구',
          coordinate: { lat: 37.4979, lng: 127.0276 },
        },
      ]
    })
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
      maneuvers: [
        {
          id: 'left-500',
          type: 'left',
          label: '좌회전',
          description: '좌회전',
          coordinate: { lat: 37.56, lng: 126.98 },
          distanceFromStartMeters: 500,
        },
        {
          id: 'right-900',
          type: 'right',
          label: '우회전',
          description: '우회전',
          coordinate: { lat: 37.52, lng: 127.01 },
          distanceFromStartMeters: 900,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    const startSimulationButton = screen.getByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })
    fireEvent.click(startSimulationButton)

    expect(screen.getByRole('button', { name: '시뮬레이션 중지' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '보고서' }))
    expect(await screen.findByRole('dialog', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '운행 종료 후 확인' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '보고서 닫기' }))
    expect(screen.getByTestId('primary-maneuver-card')).toBeInTheDocument()
    expect(screen.getByText('좌회전')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-points', '2')

    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 중지' }))

    expect(screen.getByRole('button', { name: '시뮬레이션 시작' })).toBeInTheDocument()
  })

  it('ends active route guidance and returns to the current-location status view', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    fireEvent.click(screen.getByRole('button', { name: '길안내 종료' }))

    await waitFor(() => {
      expect(screen.getByTestId('bottom-status-bar')).toHaveClass('grid-cols-3')
    })
    expect(screen.queryByRole('button', { name: '시뮬레이션 시작' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel').dataset.routePoints).toBe('0')
  })

  it('uses a map pin icon for arrival maneuver guidance', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
      maneuvers: [
        {
          id: 'arrive-12340',
          type: 'arrive',
          label: '도착',
          description: '목적지 도착',
          coordinate: { lat: 37.4979, lng: 127.0276 },
          distanceFromStartMeters: 12340,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))

    const primaryManeuverCard = await screen.findByTestId('primary-maneuver-card')

    expect(within(primaryManeuverCard).getByText('도착')).toBeInTheDocument()
    expect(primaryManeuverCard).toContainElement(screen.getByTestId('arrive-maneuver-map-pin-icon'))
  })

  it('keeps route guidance visible during simulation when TMAP returns no maneuver points', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
      maneuvers: [],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    const startSimulationButton = screen.getByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })
    fireEvent.click(startSimulationButton)

    expect(screen.getByTestId('primary-maneuver-card')).toBeInTheDocument()
    expect(screen.getByText('경로 따라 주행')).toBeInTheDocument()
    expect(screen.queryByText('경로 안내')).not.toBeInTheDocument()
  })

  it('updates sub-kilometer maneuver distance every 500ms during simulation', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5575, lng: 126.978 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
      maneuvers: [
        {
          id: 'left-500',
          type: 'left',
          label: '좌회전',
          description: '좌회전',
          coordinate: { lat: 37.56, lng: 126.98 },
          distanceFromStartMeters: 500,
        },
        {
          id: 'right-900',
          type: 'right',
          label: '우회전',
          description: '우회전',
          coordinate: { lat: 37.52, lng: 127.01 },
          distanceFromStartMeters: 900,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('좌회전')
    expect(screen.getByText('500')).toBeInTheDocument()

    const startSimulationButton = screen.getByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })
    fireEvent.click(startSimulationButton)
    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    const simulationLatAfterFirstFrame = screen.getByTestId('tmap-panel').dataset.simulationLat
    await act(async () => {
      rafCallbacks.shift()?.(16)
    })
    expect(screen.getByTestId('tmap-panel').dataset.simulationLat).toBe(simulationLatAfterFirstFrame)
    expect(window.__lastRenderedSimulationFrame?.lat).not.toBe(Number(simulationLatAfterFirstFrame))

    await act(async () => {
      rafCallbacks.shift()?.(240)
    })
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('900m')).toBeInTheDocument()

    await act(async () => {
      rafCallbacks.shift()?.(500)
    })

    await waitFor(() => {
      expect(screen.getByText('494')).toBeInTheDocument()
      expect(screen.getByText('894m')).toBeInTheDocument()
    })
    expect(screen.getByTestId('current-speed-number')).toHaveTextContent('45')

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('starts simulation camera frames after the zero-progress route point', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    const startSimulationButton = await screen.findByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })

    fireEvent.click(startSimulationButton)

    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(1000)
    })
    expect(window.__lastRenderedSimulationFrame).toEqual({ lat: 37.5665, lng: 126.978 })

    await act(async () => {
      rafCallbacks.shift()?.(1016)
    })
    expect(window.__lastRenderedSimulationFrame?.lat).toBeLessThan(37.5665)
    expect(window.__lastRenderedSimulationFrame?.lng).toBeGreaterThan(126.978)

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('limits a delayed animation frame from jumping far ahead in simulation', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    const startSimulationButton = await screen.findByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })

    fireEvent.click(startSimulationButton)

    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(1000)
    })
    await act(async () => {
      rafCallbacks.shift()?.(11_000)
    })

    expect(window.__lastRenderedSimulationFrame?.lat).toBeGreaterThan(37.565)
    expect(window.__lastRenderedSimulationFrame?.lng).toBeLessThan(126.98)

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('starts route simulation even when road-match data is still pending', async () => {
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1)
    mockedGetRoadMatch.mockReturnValue(new Promise<Awaited<ReturnType<typeof getRoadMatch>>>(() => undefined))
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    const startSimulationButton = await screen.findByRole('button', { name: '시뮬레이션 시작' })

    expect(startSimulationButton).toBeEnabled()
    fireEvent.click(startSimulationButton)
    expect(screen.getByRole('button', { name: '시뮬레이션 중지' })).toBeInTheDocument()
    expect(requestAnimationFrameSpy).toHaveBeenCalled()

    requestAnimationFrameSpy.mockRestore()
  })

  it('syncs moving speed with road-match limits that arrive after simulation starts', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    let resolveRoadMatch!: (value: Awaited<ReturnType<typeof getRoadMatch>>) => void
    mockedGetRoadMatch.mockReturnValue(new Promise((resolve) => {
      resolveRoadMatch = resolve
    }))
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5575, lng: 126.978 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    fireEvent.click(await screen.findByRole('button', { name: '시뮬레이션 시작' }))

    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(300)
    })
    expect(screen.getByTestId('current-speed-number')).toHaveTextContent('45')

    await act(async () => {
      resolveRoadMatch([
        {
          sourceIndex: 0,
          coordinate: { lat: 37.5665, lng: 126.978 },
          speedLimitKph: 10,
          roadCategory: 5,
        },
      ])
    })
    expect(await screen.findByLabelText('제한속도 10km/h')).toBeInTheDocument()

    await act(async () => {
      rafCallbacks.shift()?.(600)
    })

    const syncedSpeedKph = Number(screen.getByTestId('current-speed-number').textContent)
    expect(syncedSpeedKph).toBeGreaterThanOrEqual(13)
    expect(syncedSpeedKph).toBeLessThanOrEqual(25)

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('uses road-match speed limits as the simulation speed baseline', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedGetRoadMatch.mockResolvedValue([
      {
        sourceIndex: 0,
        coordinate: { lat: 37.5665, lng: 126.978 },
        speedLimitKph: 30,
        roadCategory: 5,
      },
    ])
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    const startSimulationButton = await screen.findByRole('button', { name: '시뮬레이션 시작' })
    expect(await screen.findByLabelText('제한속도 30km/h')).toBeInTheDocument()

    fireEvent.click(startSimulationButton)

    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(300)
    })

    expect(screen.getByTestId('current-speed-number')).toHaveTextContent('25')

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('keeps a school-zone alert visible as active after the simulation passes the alert point', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5575, lng: 126.978 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
      safetyAlerts: [
        {
          id: 'school-zone-40',
          type: 'caution',
          label: '어린이보호구역',
          description: '어린이보호구역 안내',
          coordinate: { lat: 37.564, lng: 126.981 },
          distanceFromStartMeters: 40,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))

    expect(await screen.findByLabelText('어린이보호구역 40m 남음')).toBeInTheDocument()
    const startSimulationButton = screen.getByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })
    fireEvent.click(startSimulationButton)
    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      for (let timestamp = 300; timestamp <= 3600; timestamp += 300) {
        rafCallbacks.shift()?.(timestamp)
      }
    })

    expect(await screen.findByLabelText('어린이보호구역 구간 내')).toBeInTheDocument()
    expect(screen.queryByLabelText('어린이보호구역 40m 남음')).not.toBeInTheDocument()

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('keeps non-school zone warning alerts visible briefly after passing their alert point', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '강남역',
        address: '서울 강남구',
        coordinate: { lat: 37.4979, lng: 127.0276 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.5575, lng: 126.978 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 60,
      },
      safetyAlerts: [
        {
          id: 'accident-40',
          type: 'accident',
          label: '사고다발',
          description: '사고다발구간 안내',
          coordinate: { lat: 37.564, lng: 126.981 },
          distanceFromStartMeters: 40,
        },
      ],
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))

    expect(await screen.findByLabelText('사고다발 40m 남음')).toBeInTheDocument()
    const startSimulationButton = screen.getByRole('button', { name: '시뮬레이션 시작' })
    await waitFor(() => {
      expect(startSimulationButton).toBeEnabled()
    })
    fireEvent.click(startSimulationButton)
    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      for (let timestamp = 300; timestamp <= 3600; timestamp += 300) {
        rafCallbacks.shift()?.(timestamp)
      }
    })

    expect(await screen.findByLabelText('사고다발 구간 내')).toBeInTheDocument()
    expect(screen.queryByLabelText('사고다발 40m 남음')).not.toBeInTheDocument()

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('passes a rounded driving path to the map instead of raw right-angle route vertices', async () => {
    mockedSearchPlaces.mockResolvedValue([
      {
        id: 'destination',
        name: '도착지',
        address: '서울 중구',
        coordinate: { lat: 37.002, lng: 127.002 },
      },
    ])
    mockedGetRoute.mockResolvedValue({
      coordinates: [
        { lat: 37, lng: 127 },
        { lat: 37, lng: 127.001 },
        { lat: 37.001, lng: 127.001 },
        { lat: 37.001, lng: 127.002 },
        { lat: 37.002, lng: 127.002 },
      ],
      summary: {
        distanceMeters: 500,
        durationSeconds: 60,
      },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell initialProfileSetupComplete initialSelectedProfileId="profile-1" />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '도착지' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /도착지/ }))

    await waitFor(() => {
      expect(Number(screen.getByTestId('tmap-panel').dataset.routePoints)).toBeGreaterThan(5)
    })
  })
})
