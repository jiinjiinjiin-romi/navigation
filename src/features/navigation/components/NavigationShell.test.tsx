import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NavigationShell } from './NavigationShell'
import { getCurrentAddress, getRoadMatch, getRoute, searchPlaces } from '../api/tmapApi'

vi.mock('../api/tmapApi', () => ({
  searchPlaces: vi.fn(),
  getRoute: vi.fn(),
  getRoadMatch: vi.fn(),
  getCurrentAddress: vi.fn(),
}))

vi.mock('./TmapPanel', () => ({
  TmapPanel: ({
    currentPosition,
    route,
    simulationPosition,
  }: {
    currentPosition?: { lat: number; lng: number }
    route?: { coordinates: { lat: number; lng: number }[] }
    simulationPosition?: { lat: number; lng: number }
  }) => (
    <div data-route-points={route?.coordinates.length ?? 0} data-testid="tmap-panel">
      {simulationPosition
        ? `sim:${simulationPosition.lat.toFixed(4)},${simulationPosition.lng.toFixed(4)}`
        : currentPosition
          ? `current:${currentPosition.lat.toFixed(4)},${currentPosition.lng.toFixed(4)}`
          : 'idle'}
    </div>
  ),
}))

const mockedSearchPlaces = vi.mocked(searchPlaces)
const mockedGetRoute = vi.mocked(getRoute)
const mockedGetRoadMatch = vi.mocked(getRoadMatch)
const mockedGetCurrentAddress = vi.mocked(getCurrentAddress)

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
    mockedSearchPlaces.mockReset()
    mockedGetRoute.mockReset()
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
    await waitFor(() => {
      expect(screen.getByTestId('bottom-status-bar')).toHaveClass('grid-cols-3')
    })
    expect(await screen.findByText('서울특별시 중구 세종대로 110')).toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))

    expect(screen.queryByText('현재 위치에서')).not.toBeInTheDocument()
    expect(screen.queryByText('출발지는 변경할 수 있습니다')).not.toBeInTheDocument()
    expect(screen.queryByText('선택됨')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('현재 위치')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('목적지 검색')).toHaveFocus()
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

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))
    fireEvent.change(screen.getByDisplayValue('현재 위치'), {
      target: { value: '서울역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /서울역/ }))
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('목적지 검색'), {
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
      )
    })
    expect(await screen.findByText('22분')).toBeInTheDocument()
    expect(screen.getByText('12.3 km')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-status-bar')).toHaveClass('grid-cols-5')
    expect(screen.getByText('도착')).toBeInTheDocument()
    expect(screen.getByText('거리')).toBeInTheDocument()
    expect(screen.getByText('소요시간')).toBeInTheDocument()
    expect(screen.getByText('좌회전')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(await screen.findByText('제한속도 50km/h')).toBeInTheDocument()
    expect(screen.getByText('주요도로 1')).toBeInTheDocument()
    const primaryManeuverCard = screen.getByTestId('primary-maneuver-card')
    const nextManeuverCard = screen.getByTestId('next-maneuver-card')
    expect(primaryManeuverCard).toContainElement(screen.getByText('좌회전'))
    expect(nextManeuverCard).toContainElement(screen.getByText('900m'))
    expect(primaryManeuverCard).not.toContainElement(nextManeuverCard)
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
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <NavigationShell />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))
    const destinationInput = screen.getByPlaceholderText('목적지 검색')
    fireEvent.change(destinationInput, {
      target: { value: '세종' },
    })

    expect(await screen.findByRole('option', { name: /세종대학교/ })).toBeInTheDocument()
    expect(screen.getByTestId('route-search-results')).toContainElement(screen.getByRole('listbox'))
    fireEvent.keyDown(destinationInput, { key: 'ArrowDown' })
    fireEvent.keyDown(destinationInput, { key: 'Enter' })

    expect(destinationInput).toHaveValue('세종대학교')
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })
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

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))
    const destinationInput = screen.getByPlaceholderText('목적지 검색')
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

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))
    fireEvent.change(screen.getByPlaceholderText('목적지 검색'), {
      target: { value: '강남역' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /강남역/ }))
    await screen.findByText('22분')

    fireEvent.click(screen.getByRole('button', { name: '시뮬레이션 시작' }))

    expect(screen.getByText('시뮬레이션 중')).toBeInTheDocument()
    expect(screen.getByTestId('tmap-panel')).toHaveTextContent('sim:37.5665,126.9780')
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

    fireEvent.click(screen.getByRole('button', { name: /어디로 갈까요/ }))
    fireEvent.change(screen.getByPlaceholderText('목적지 검색'), {
      target: { value: '도착지' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /도착지/ }))

    await waitFor(() => {
      expect(Number(screen.getByTestId('tmap-panel').dataset.routePoints)).toBeGreaterThan(5)
    })
  })
})
