import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NavigationShell } from './NavigationShell'
import { getCurrentAddress, getRoadMatch, getRouteOptions, searchPlaces } from '../api/tmapApi'

let routeOptionsOverlayReadyByDefault = true
let latestRouteOptionsOverlayReady: ((ready: boolean) => void) | undefined

vi.mock('../api/tmapApi', () => ({
  searchPlaces: vi.fn(),
  getRouteOptions: vi.fn(),
  getRoadMatch: vi.fn(),
  getCurrentAddress: vi.fn(),
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

vi.mock('./TmapPanel', () => ({
  TmapPanel: ({
    currentPosition,
    cameraSettings,
    route,
    routeOptions,
    simulationPosition,
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
    simulationPosition?: { lat: number; lng: number }
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

  const openRouteSearchSummary = async () => {
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

  it('centers a 16:10 navigation viewport on the AI mobility stage', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    const stage = screen.getByTestId('navigation-stage')
    const viewport = screen.getByTestId('navigation-viewport')

    expect(stage).toHaveClass('bg-black')
    expect(stage).toHaveClass('flex')
    expect(stage).toHaveClass('items-center')
    expect(stage).toHaveClass('justify-center')
    expect(viewport).toHaveClass('aspect-[16/10]')
    expect(viewport).toHaveClass('w-[min(100vw,calc(100vh*1.6))]')
  })

  it('renders the Navi assistant orb with the internal VoiceOrb contract', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('button', { name: 'Navi 호출' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Navi 호출' })).toHaveClass('right-0')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'idle')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-energy', '0')
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-color-theme', 'daylight')
  })

  it('steps through the dummy Navi assistant scenario without auto-playing it', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    expect(screen.getByTestId('navi-assistant-debug-bar')).toBeInTheDocument()
    expect(screen.getByText('대기')).toBeInTheDocument()
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
    expect(screen.queryByTestId('navi-assistant-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))

    expect(screen.getByTestId('navi-assistant-panel')).toBeInTheDocument()
    expect(screen.getByTestId('navi-assistant-panel')).toHaveClass('overflow-visible')
    expect(screen.getByTestId('navi-assistant-panel')).toHaveClass('pointer-events-none')
    expect(screen.getByTestId('navi-assistant-aura')).toHaveClass('navi-assistant-aura')
    expect(screen.getByTestId('navi-assistant-orb-slot')).toHaveClass('absolute')
    expect(screen.getByTestId('navi-assistant-content')).toHaveClass('pt-[12rem]')
    expect(screen.getByRole('button', { name: 'Navi AI 에이전트 닫기' })).toBeInTheDocument()
    expect(screen.getByText('오늘 피곤한 하루였나봐요. 잠 깰 수 있게 도와드릴까요?')).toBeInTheDocument()
    expect(screen.getByTestId('navi-assistant-speech-text')).toHaveAttribute(
      'aria-label',
      '오늘 피곤한 하루였나봐요. 잠 깰 수 있게 도와드릴까요?',
    )
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'speaking')

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByText('듣는 중...')).toBeInTheDocument()
    expect(screen.queryByTestId('navi-assistant-user-text')).not.toBeInTheDocument()
    expect(await screen.findByTestId('navi-assistant-user-text')).toHaveAttribute(
      'aria-label',
      '가까운 졸음쉼터랑 기분 전환할 음악 추천해줘',
    )

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByText('생각 중...')).toBeInTheDocument()
    expect(screen.getByTestId('navi-assistant-user-text')).toHaveAttribute(
      'aria-label',
      '가까운 졸음쉼터랑 기분 전환할 음악 추천해줘',
    )
    expect(screen.getByTestId('navi-assistant-user-text').querySelector('.navi-assistant-user-word')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByTestId('navi-assistant-recommendations')).toBeInTheDocument()
    expect(screen.getByText('서울만남 졸음쉼터')).toBeInTheDocument()
    expect(screen.getByText('Drive Boost')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'AI 시나리오 초기화' }))
    expect(screen.queryByTestId('navi-assistant-panel')).not.toBeInTheDocument()
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
  })

  it('closes the expanded Navi assistant panel back to the floating orb', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '다음 AI 시나리오 단계' }))
    expect(screen.getByTestId('navi-assistant-panel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Navi AI 에이전트 닫기' }))

    expect(screen.queryByTestId('navi-assistant-panel')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Navi 호출' })).toBeInTheDocument()
    expect(screen.getByTestId('voice-orb')).toHaveAttribute('data-state', 'idle')
  })

  it('starts on a current-location map without the route setup panel', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
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

  it('opens the connected settings drawer for map mode, zoom, pitch, signed-in account, and location retry', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))

    expect(await screen.findByRole('dialog', { name: '설정' })).toBeInTheDocument()
    expect(screen.getByTestId('settings-drawer')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Navi 호출' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('안정현')).toBeInTheDocument()
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

  it('keeps the rail inside the navigation viewport and connects the drawer on its right side', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
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
    expect(railRoot).toHaveClass('right-[320px]')
    expect(railRoot).not.toHaveClass('right-0')
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
    expect(drawer).toHaveClass('right-0')
  })

  it('opens the report drawer and the connect drawer from the rail', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '보고서' }))
    expect(await screen.findByRole('dialog', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByTestId('report-drawer')).toBeInTheDocument()
    expect(screen.getByText('운행 리포트')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보고서' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '리포트 확인' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '보고서 닫기' }))
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '음악' }))

    expect(await screen.findByRole('dialog', { name: '음악' })).toBeInTheDocument()
    expect(screen.getByTestId('music-popover')).toBeInTheDocument()
    expect(screen.getByTestId('music-popover')).toHaveClass('bottom-14')
    expect(screen.getByTestId('music-popover')).not.toHaveClass('top-3')
    expect(screen.getByLabelText('음악 검색')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Drive Neon/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Soft Focus/ }))
    fireEvent.click(screen.getByRole('button', { name: '재생' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '음악' })).not.toBeInTheDocument()
    })
    expect(screen.getByTestId('music-mini-player')).toBeInTheDocument()
    expect(screen.getByText('Soft Focus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '음악 일시정지' })).toBeInTheDocument()
  })

  it('requests location on entry and centers the map on the granted position', async () => {
    mockGeolocationSuccess(37.5512, 127.0738)
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
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
        <NavigationShell />
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
          <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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

  it('shows a Navi thinking modal while route candidates are loading', async () => {
    let resolveRouteOptions!: (options: Awaited<ReturnType<typeof getRouteOptions>>) => void
    mockedGetRouteOptions.mockReturnValue(new Promise((resolve) => {
      resolveRouteOptions = resolve
    }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    await openDestinationEditor()
    fireEvent.click(await screen.findByRole('button', { name: '도착지를 회사로 설정' }))

    expect(await screen.findByTestId('route-search-loading-modal')).toBeInTheDocument()
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
    expect(screen.getByLabelText('제한속도 30km/h')).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, debugSequenceWaitMs))
    })
    expect(screen.getByLabelText('제한속도 30km/h')).toBeInTheDocument()

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, debugSequenceWaitMs))
    })
    expect(screen.getByLabelText('단속구간 80m 남음')).toBeInTheDocument()
    expect(screen.getByLabelText('제한속도 30km/h')).toBeInTheDocument()
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))

    expect(screen.getByRole('button', { name: '시뮬레이션 중지' })).toBeInTheDocument()
    expect(screen.getByTestId('primary-maneuver-card')).toBeInTheDocument()
    expect(screen.getByText('좌회전')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveTextContent('sim:37.5665,126.9780')

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
        <NavigationShell />
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
        <NavigationShell />
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))

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
        { lat: 37.4979, lng: 127.0276 },
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('좌회전')
    expect(screen.getByText('500')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))
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
        { lat: 37.4979, lng: 127.0276 },
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))

    expect(await screen.findByLabelText('어린이보호구역 40m 남음')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))
    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(6000)
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
        { lat: 37.4979, lng: 127.0276 },
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
        <NavigationShell />
      </QueryClientProvider>,
    )

    const destinationInput = await openDestinationEditor()
    fireEvent.change(destinationInput, {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))

    expect(await screen.findByLabelText('사고다발 40m 남음')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))
    await waitFor(() => {
      expect(rafCallbacks.length).toBeGreaterThan(0)
    })

    await act(async () => {
      rafCallbacks.shift()?.(0)
    })
    await act(async () => {
      rafCallbacks.shift()?.(6000)
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
        <NavigationShell />
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
