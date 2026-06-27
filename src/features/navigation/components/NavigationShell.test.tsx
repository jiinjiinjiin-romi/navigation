import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NavigationShell } from './NavigationShell'
import { getCurrentAddress, getRoadMatch, getRouteOptions, searchPlaces } from '../api/tmapApi'

vi.mock('../api/tmapApi', () => ({
  searchPlaces: vi.fn(),
  getRouteOptions: vi.fn(),
  getRoadMatch: vi.fn(),
  getCurrentAddress: vi.fn(),
}))

vi.mock('./TmapPanel', () => ({
  TmapPanel: ({
    currentPosition,
    cameraSettings,
	    route,
	    routeOptions,
	    simulationPosition,
	    onCameraSettingsChange,
	    onSelectRouteOption,
	    onSimulationFrameRendererReady,
	  }: {
	    cameraSettings?: { mode: '2d' | '3d'; zoom: number; pitch: number }
	    currentPosition?: { lat: number; lng: number }
	    route?: { coordinates: { lat: number; lng: number }[] }
	    routeOptions?: Array<{ id: string; label: string; route: { coordinates: { lat: number; lng: number }[] } }>
	    simulationPosition?: { lat: number; lng: number }
	    onCameraSettingsChange?: (settings: Partial<{ mode: '2d' | '3d'; zoom: number; pitch: number }>) => void
	    onSelectRouteOption?: (id: string) => void
	    onSimulationFrameRendererReady?: (renderFrame: ((position: { lat: number; lng: number }) => void) | undefined) => void
	  }) => {
	    useEffect(() => {
	      onSimulationFrameRendererReady?.((position) => {
	        window.__lastRenderedSimulationFrame = position
	      })
	      return () => onSimulationFrameRendererReady?.(undefined)
	    }, [onSimulationFrameRendererReady])
	    useEffect(() => {
	      if (routeOptions?.length === 1) {
	        onSelectRouteOption?.(routeOptions[0].id)
	      }
	    }, [onSelectRouteOption, routeOptions])

    return (
      <div
        data-camera-pitch={cameraSettings?.pitch}
        data-camera-mode={cameraSettings?.mode}
	        data-camera-zoom={cameraSettings?.zoom}
	        data-route-points={route?.coordinates.length ?? 0}
	        data-route-options={routeOptions?.length ?? 0}
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
	            onClick={() => onSelectRouteOption?.(option.id)}
	          >
	            {`${option.label} 여기서 경로 선택`}
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
    const existingDestinationField = screen.queryByRole('combobox', { name: '목적지' })
    if (existingDestinationField) {
      return existingDestinationField
    }

    const searchButton = await screen.findByRole('button', { name: /어디로 갈까요/ })
    await waitFor(() => {
      expect(searchButton).not.toBeDisabled()
    })
    fireEvent.click(searchButton)

    return screen.findByRole('combobox', { name: '목적지' })
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

  it('centers a 16:10 navigation viewport on a black stage', () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    const stage = screen.getByTestId('navigation-stage')
    const viewport = screen.getByTestId('navigation-viewport')

    expect(stage).toHaveClass('bg-black')
    expect(stage).toHaveClass('grid')
    expect(stage).toHaveClass('place-items-center')
    expect(viewport).toHaveClass('aspect-[16/10]')
    expect(viewport).toHaveClass('w-[min(100vw,calc(100vh*1.6))]')
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
    await waitFor(() => {
      expect(screen.getByTestId('bottom-status-bar')).toHaveClass('grid-cols-3')
    })
    expect(await screen.findByLabelText('제한속도 50km/h')).toBeInTheDocument()
    expect(await screen.findByText('서울특별시 중구 세종대로 110')).toBeInTheDocument()
  })

  it('opens a floating settings panel for map mode, zoom, pitch, and signed-in account state', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '설정' }))

    expect(await screen.findByRole('dialog', { name: '설정' })).toBeInTheDocument()
    expect(screen.getByText('안정현')).toBeInTheDocument()
    expect(screen.getByText('로그인됨')).toBeInTheDocument()
    expect(screen.queryByText('내 계정으로 길안내 설정을 저장합니다')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2D 지도' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '3D 지도' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('slider', { name: '지도 줌' })).toHaveValue('18.3')
    expect(screen.queryByRole('slider', { name: '지도 피치' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-zoom', '18.3')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '0')

    fireEvent.click(screen.getByRole('button', { name: '3D 지도' }))
    expect(screen.getByRole('button', { name: '3D 지도' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('slider', { name: '지도 피치' })).toHaveValue('45')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '3d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '45')

    fireEvent.change(screen.getByRole('slider', { name: '지도 줌' }), { target: { value: '17.6' } })
    fireEvent.change(screen.getByRole('slider', { name: '지도 피치' }), { target: { value: '35' } })

    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-zoom', '17.6')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '35')

    fireEvent.click(screen.getByRole('button', { name: '2D 지도' }))
    expect(screen.queryByRole('slider', { name: '지도 피치' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-mode', '2d')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-camera-pitch', '0')
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

  it('blocks navigation search when location permission is denied', async () => {
    mockGeolocationError()
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('위치 권한을 허용해야 길안내를 사용할 수 있습니다')).toBeInTheDocument()
    const searchButton = screen.getByRole('button', { name: /어디로 갈까요/ })
    expect(searchButton).toBeDisabled()

    fireEvent.click(searchButton)

    expect(screen.queryByPlaceholderText('목적지 검색')).not.toBeInTheDocument()
  })

  it('opens destination search as a navigation bottom sheet from the current location', async () => {
    const queryClient = new QueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    await openRouteSearchSummary()

    expect(screen.queryByText('현재 위치에서')).not.toBeInTheDocument()
    expect(screen.queryByText('출발지는 변경할 수 있습니다')).not.toBeInTheDocument()
    expect(screen.queryByText('선택됨')).not.toBeInTheDocument()
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
    expect(screen.getByText('도착')).toBeInTheDocument()
    expect(screen.getByText('남은거리')).toBeInTheDocument()
    expect(bottomStatusBar).toContainElement(screen.getByText('남은 시간'))
    expect(bottomStatusBar).toContainElement(screen.getByText('목적지'))
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
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '2')
    expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-points', '0')

    fireEvent.click(screen.getByRole('button', { name: '최소시간 여기서 경로 선택' }))

    await waitFor(() => {
      expect(screen.getByTestId('tmap-panel')).toHaveAttribute('data-route-options', '0')
    })
    expect(Number(screen.getByTestId('tmap-panel').getAttribute('data-route-points'))).toBeGreaterThan(0)
    expect(screen.getByText('21분')).toBeInTheDocument()
    expect(screen.getByText('12.8 km')).toBeInTheDocument()
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
    expect(screen.getAllByRole('option')).toHaveLength(7)

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
