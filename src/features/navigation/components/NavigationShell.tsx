import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  CloudSun,
  Clock3,
  LocateFixed,
  MapPin,
  Menu,
  Play,
  RefreshCw,
  Route,
  Search,
  Timer,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentAddress, getRoadMatch, getRoute, searchPlaces } from '../api/tmapApi'
import { createRoundedRoutePath } from '../map/routeGeometry'
import { getSimulatedRoutePosition } from '../simulation/routeSimulation'
import { getSimulationDurationMs } from '../simulation/simulationTiming'
import type { Coordinate, NavigationRoute, Place, RoadMatchPoint, RouteManeuver } from '../types'
import { TmapPanel } from './TmapPanel'

type SearchFieldId = 'origin' | 'destination'
type LocationStatus = 'checking' | 'granted' | 'denied' | 'unsupported'
type MotionTiming = {
  duration: number
  ease?: [number, number, number, number]
}

const CURRENT_LOCATION_PLACE_ID = 'current-location'
const PRODUCT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const WEATHER_STALE_TIME_MS = 10 * 60 * 1000

export function NavigationShell() {
  const shouldReduceMotion = useReducedMotion()
  const [now, setNow] = useState(() => new Date())
  const [originKeyword, setOriginKeyword] = useState('')
  const [destinationKeyword, setDestinationKeyword] = useState('')
  const [origin, setOrigin] = useState<Place>()
  const [destination, setDestination] = useState<Place>()
  const [currentPosition, setCurrentPosition] = useState<Coordinate>()
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('checking')
  const [activeField, setActiveField] = useState<SearchFieldId | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [routeSearchOpen, setRouteSearchOpen] = useState(false)
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simulationPosition, setSimulationPosition] = useState<Coordinate>()
  const [simulationRemainingDistance, setSimulationRemainingDistance] = useState(0)
  const [simulationRemainingDuration, setSimulationRemainingDuration] = useState(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const simulationStartedAtRef = useRef<number | undefined>(undefined)

  const originSearch = useQuery({
    queryKey: ['places', originKeyword],
    queryFn: () => searchPlaces(originKeyword),
    enabled: activeField === 'origin' && originKeyword.trim().length >= 2,
  })

  const destinationSearch = useQuery({
    queryKey: ['places', destinationKeyword],
    queryFn: () => searchPlaces(destinationKeyword),
    enabled: activeField === 'destination' && destinationKeyword.trim().length >= 2,
  })

  const routeQuery = useQuery({
    queryKey: ['route', origin?.id, destination?.id],
    queryFn: () => getRoute(origin!.coordinate, destination!.coordinate),
    enabled: locationStatus === 'granted' && Boolean(origin && destination),
  })
  const roadMatchQuery = useQuery({
    queryKey: ['road-match', origin?.id, destination?.id],
    queryFn: () => getRoadMatch(routeQuery.data!.coordinates),
    enabled: Boolean(routeQuery.data?.coordinates.length),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const weatherQuery = useQuery({
    queryKey: ['weather', currentPosition?.lat, currentPosition?.lng],
    queryFn: () => getCurrentWeatherLabel(currentPosition!),
    enabled: Boolean(currentPosition),
    staleTime: WEATHER_STALE_TIME_MS,
    retry: false,
  })
  const currentAddressQuery = useQuery({
    queryKey: ['current-address', currentPosition?.lat, currentPosition?.lng],
    queryFn: () => getCurrentAddress(currentPosition!),
    enabled: Boolean(currentPosition),
    staleTime: WEATHER_STALE_TIME_MS,
    retry: false,
  })

  const activeRoute = useMemo(() => {
    const route = routeQuery.data

    if (!route) {
      return undefined
    }

    return {
      ...route,
      coordinates: createRoundedRoutePath(route.coordinates),
    }
  }, [routeQuery.data])
  const remainingDurationSeconds = simulationRunning
    ? simulationRemainingDuration
    : activeRoute?.summary.durationSeconds ?? 0
  const remainingDistanceMeters = simulationRunning
    ? simulationRemainingDistance
    : activeRoute?.summary.distanceMeters ?? 0
  const routeMinutes = Math.max(1, Math.round(remainingDurationSeconds / 60))
  const arrivalLabel = activeRoute ? formatArrivalTime(remainingDurationSeconds) : ''
  const drivingDistance = activeRoute
    ? `${Math.max(0.1, remainingDistanceMeters / 1000).toFixed(1)} km`
    : ''
  const currentTimeLabel = formatClockTime(now)
  const currentLocationLabel = currentAddressQuery.data
    ?? (currentPosition ? 'GPS 위치' : '위치 확인 중')
  const weatherLabel = weatherQuery.data ?? (weatherQuery.isError ? '날씨 정보 없음' : '날씨 확인 중')
  const travelledDistanceMeters = activeRoute
    ? Math.max(0, activeRoute.summary.distanceMeters - remainingDistanceMeters)
    : 0
  const drivingAssist = activeRoute
    ? getDrivingAssistInfo({
        position: simulationPosition ?? currentPosition,
        roadMatches: roadMatchQuery.data ?? [],
        route: activeRoute,
        travelledDistanceMeters,
      })
    : undefined
  const maneuverGuidance = activeRoute
    ? getManeuverGuidance(activeRoute, travelledDistanceMeters)
    : undefined
  const activePlaces = activeField === 'origin'
    ? originSearch.data ?? []
    : activeField === 'destination'
      ? destinationSearch.data ?? []
      : []
  const activeLabel = activeField === 'origin' ? '출발지 검색 결과' : '도착지 검색 결과'
  const showSuggestions = Boolean(activeField && activePlaces.length > 0)
  const motionTiming = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: PRODUCT_EASE }

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    setLocationStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        const currentPlace: Place = {
          id: CURRENT_LOCATION_PLACE_ID,
          name: '현재 위치',
          address: 'GPS 위치',
          coordinate,
        }

        setCurrentPosition(coordinate)
        setOrigin((selectedOrigin) => selectedOrigin ?? currentPlace)
        setOriginKeyword((keyword) => keyword || currentPlace.name)
        setLocationStatus('granted')
      },
      () => {
        setCurrentPosition(undefined)
        setLocationStatus('denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      },
    )
  }, [])

  useEffect(() => {
    requestCurrentLocation()
  }, [requestCurrentLocation])

  const fillOriginWithCurrentLocation = useCallback(() => {
    if (!currentPosition) {
      requestCurrentLocation()
      return
    }

    const currentPlace: Place = {
      id: CURRENT_LOCATION_PLACE_ID,
      name: '현재 위치',
      address: 'GPS 위치',
      coordinate: currentPosition,
    }

    setOrigin(currentPlace)
    setOriginKeyword(currentPlace.name)
    setActiveField('destination')
    setHighlightedIndex(0)
    setRouteSearchOpen(true)
  }, [currentPosition, requestCurrentLocation])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (locationStatus !== 'granted') {
      setRouteSearchOpen(false)
    }
  }, [locationStatus])

  const selectPlace = (field: SearchFieldId, place: Place) => {
    if (field === 'origin') {
      setOrigin(place)
      setOriginKeyword(place.name)
    } else {
      setDestination(place)
      setDestinationKeyword(place.name)
    }

    setActiveField(null)
    setHighlightedIndex(0)
  }

  const handleSearchKeyDown = (field: SearchFieldId, event: KeyboardEvent<HTMLInputElement>) => {
    const places = field === activeField ? activePlaces : []

    if (event.key === 'Escape') {
      setActiveField(null)
      setHighlightedIndex(0)
      return
    }

    if (places.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveField(field)
      setHighlightedIndex((index) => Math.min(index + 1, places.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveField(field)
      setHighlightedIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      selectPlace(field, places[highlightedIndex] ?? places[0])
    }
  }

  const startSimulation = () => {
    const route = activeRoute
    const firstCoordinate = route?.coordinates[0]
    if (!firstCoordinate) {
      return
    }

    setSimulationPosition(firstCoordinate)
    setSimulationRemainingDistance(route.summary.distanceMeters)
    setSimulationRemainingDuration(route.summary.durationSeconds)
    simulationStartedAtRef.current = undefined
    setSimulationRunning(true)
  }

  useEffect(() => {
    const route = activeRoute

    if (!simulationRunning || !route) {
      return
    }

    const simulationDurationMs = getSimulationDurationMs(
      route.summary.durationSeconds,
      route.summary.distanceMeters,
    )

    const tick = (timestamp: number) => {
      if (simulationStartedAtRef.current === undefined) {
        simulationStartedAtRef.current = timestamp
      }

      const elapsed = timestamp - simulationStartedAtRef.current
      const progress = getSimulatedRoutePosition(route, elapsed / simulationDurationMs)

      setSimulationPosition(progress.coordinate)
      setSimulationRemainingDistance(progress.remainingDistanceMeters)
      setSimulationRemainingDuration(progress.remainingDurationSeconds)

      if (progress.completed) {
        setSimulationRunning(false)
        animationFrameRef.current = undefined
        return
      }

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [activeRoute, simulationRunning])

  return (
    <main
      data-testid="navigation-stage"
      className="grid min-h-screen place-items-center bg-black p-4"
    >
      <section
        data-testid="navigation-viewport"
        className="relative aspect-[16/10] w-[min(100vw,calc(100vh*1.6))] max-w-[1440px] overflow-hidden rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-frame)] shadow-[0_8px_24px_rgba(15,23,42,0.22)] max-sm:h-[calc(100vh-2rem)] max-sm:w-[calc(100vw-2rem)] max-sm:aspect-auto"
      >
        <TmapPanel
          currentPosition={currentPosition}
          route={activeRoute}
          origin={origin}
          destination={destination}
          simulationPosition={simulationPosition}
        />

        {!activeRoute ? (
          <>
            <IdleMapControls
              locationStatus={locationStatus}
              motionTiming={motionTiming}
              searchOpen={routeSearchOpen}
              onOpenSearch={() => {
                setRouteSearchOpen(true)
                setActiveField('destination')
              }}
              onRequestLocation={requestCurrentLocation}
            />
            <AnimatePresence initial={false}>
              {routeSearchOpen ? (
        <RouteSearchSheet
          activeField={activeField}
          activeIndex={highlightedIndex}
          activeLabel={activeLabel}
          destinationKeyword={destinationKeyword}
          motionTiming={motionTiming}
          originKeyword={originKeyword}
          places={activePlaces}
          showSuggestions={showSuggestions}
          onChangeOrigin={(value) => {
            setOriginKeyword(value)
            setOrigin(undefined)
            setActiveField('origin')
                    setHighlightedIndex(0)
                  }}
                  onChangeDestination={(value) => {
                    setDestinationKeyword(value)
                    setDestination(undefined)
                    setActiveField('destination')
                    setHighlightedIndex(0)
                  }}
                onClose={() => {
                  setRouteSearchOpen(false)
                  setActiveField(null)
                }}
                onFocusOrigin={() => setActiveField('origin')}
                onFocusDestination={() => setActiveField('destination')}
                onKeyDown={(field, event) => handleSearchKeyDown(field, event)}
                onSelectPlace={(place) => selectPlace(activeField ?? 'destination', place)}
                onFillOriginWithCurrentLocation={fillOriginWithCurrentLocation}
                />
              ) : null}
            </AnimatePresence>
          </>
        ) : (
          <DrivingHud
            assist={drivingAssist}
            guidance={maneuverGuidance}
            motionTiming={motionTiming}
            simulationRunning={simulationRunning}
            onStartSimulation={startSimulation}
          />
        )}

        <BottomStatusBar
          arrivalLabel={arrivalLabel}
          currentLocationLabel={currentLocationLabel}
          currentTimeLabel={currentTimeLabel}
          distanceLabel={drivingDistance}
          durationLabel={`${routeMinutes}분`}
          hasRoute={Boolean(activeRoute)}
          motionTiming={motionTiming}
          weatherLabel={weatherLabel}
        />
      </section>
    </main>
  )
}

function RouteSearchSheet({
  activeField,
  activeIndex,
  activeLabel,
  destinationKeyword,
  motionTiming,
  originKeyword,
  places,
  showSuggestions,
  onChangeOrigin,
  onChangeDestination,
  onClose,
  onFocusOrigin,
  onFocusDestination,
  onKeyDown,
  onSelectPlace,
  onFillOriginWithCurrentLocation,
}: {
  activeField: SearchFieldId | null
  activeIndex: number
  activeLabel: string
  destinationKeyword: string
  motionTiming: MotionTiming
  originKeyword: string
  places: Place[]
  showSuggestions: boolean
  onChangeOrigin: (value: string) => void
  onChangeDestination: (value: string) => void
  onClose: () => void
  onFocusOrigin: () => void
  onFocusDestination: () => void
  onKeyDown: (field: SearchFieldId, event: KeyboardEvent<HTMLInputElement>) => void
  onSelectPlace: (place: Place) => void
  onFillOriginWithCurrentLocation: () => void
}) {
  const activeListId = activeField ? `place-results-${activeField}` : 'place-results'
  const renderSuggestions = (field: SearchFieldId) => {
    const showForField = showSuggestions && activeField === field

    return (
      <div
        className="mt-2 min-h-0 overflow-hidden rounded-lg bg-[var(--nav-panel)]"
        data-testid={showForField ? 'route-search-results' : undefined}
      >
        <AnimatePresence initial={false} mode="wait">
          {showForField ? (
            <PlaceResults
              activeIndex={activeIndex}
              key={field}
              label={activeLabel}
              listId={activeListId}
              motionTiming={motionTiming}
              places={places}
              onSelect={onSelectPlace}
            />
          ) : (
            <motion.div
              aria-hidden="true"
              className="h-full"
              key="empty-results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionTiming}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <motion.div
      className="pointer-events-none absolute bottom-18 left-1/2 z-20 h-[22rem] w-[min(31rem,calc(100%-1.5rem))] -translate-x-1/2 text-[var(--nav-ink)] max-sm:bottom-16 max-sm:h-[21rem] max-sm:w-[calc(100%-1rem)]"
      initial={{ opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.985 }}
      transition={motionTiming}
    >
      <motion.div
        className="pointer-events-auto relative grid h-full grid-rows-[auto_1fr] overflow-hidden rounded-xl bg-[var(--nav-surface-raised)] p-3 shadow-[var(--nav-shadow-panel)]"
        transition={motionTiming}
      >
        <motion.button
          aria-label="경로 검색 닫기"
          className="absolute right-2 top-2 z-10 grid h-11 w-11 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
          onClick={onClose}
          whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.94 }}
          type="button"
        >
          <X className="h-5 w-5" />
        </motion.button>

        <motion.div
          className="space-y-3 pt-1.5"
          data-testid="route-search-fields"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.07 }}
        >
          <SearchField
            active={activeField === 'origin'}
            activeOptionId={showSuggestions && activeField === 'origin' ? `${activeListId}-option-${activeIndex}` : undefined}
            controlsId={activeListId}
            icon={<MapPin className="h-5 w-5" />}
            label="출발지"
            value={originKeyword}
            onChange={onChangeOrigin}
            onFocus={onFocusOrigin}
            onKeyDown={(event) => onKeyDown('origin', event)}
            placeholder="출발지 검색"
            onFillCurrentLocation={onFillOriginWithCurrentLocation}
          />
          {activeField === 'origin' ? renderSuggestions('origin') : null}

          <SearchField
            active={activeField === 'destination'}
            activeOptionId={showSuggestions && activeField === 'destination' ? `${activeListId}-option-${activeIndex}` : undefined}
            autoFocus
            controlsId={activeListId}
            icon={<Search className="h-5 w-5" />}
            label="도착지"
            value={destinationKeyword}
            onChange={onChangeDestination}
            onFocus={onFocusDestination}
            onKeyDown={(event) => onKeyDown('destination', event)}
            placeholder="목적지 검색"
          />
          {activeField === 'destination' ? renderSuggestions('destination') : null}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function IdleMapControls({
  locationStatus,
  motionTiming,
  searchOpen,
  onOpenSearch,
  onRequestLocation,
}: {
  locationStatus: LocationStatus
  motionTiming: MotionTiming
  searchOpen: boolean
  onOpenSearch: () => void
  onRequestLocation: () => void
}) {
  const navigationBlocked = locationStatus !== 'granted'
  const locationMessage = locationStatus === 'checking'
    ? '현재 위치를 확인하는 중입니다'
    : locationStatus === 'unsupported'
      ? '이 브라우저에서는 위치를 사용할 수 없습니다'
      : '위치 권한을 허용해야 길안내를 사용할 수 있습니다'

  return (
    <div className="pointer-events-none absolute inset-0 text-[var(--nav-ink)]">
      <div className="absolute bottom-[11.25rem] left-5 flex flex-col items-center gap-3 max-sm:bottom-[10.75rem] max-sm:left-3">
        <HudCircleButton label="현재 위치" onClick={onRequestLocation}>
          <LocateFixed className="h-7 w-7 max-sm:h-6 max-sm:w-6" />
        </HudCircleButton>
      </div>

      <AnimatePresence initial={false}>
        {!searchOpen ? (
          <motion.div
            className="absolute bottom-20 left-1/2 w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 max-sm:bottom-18"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={motionTiming}
          >
            <AnimatePresence initial={false}>
              {navigationBlocked ? (
                <motion.div
                  className="pointer-events-auto mb-2 flex min-h-11 items-center justify-between gap-3 rounded-full bg-white/95 px-4 py-2 text-sm font-medium text-[var(--nav-muted)] shadow-[var(--nav-shadow-control)] backdrop-blur max-sm:rounded-2xl max-sm:text-xs"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={motionTiming}
                >
                  <span className="min-w-0 truncate">{locationMessage}</span>
                  {locationStatus === 'denied' ? (
                    <motion.button
                      className="shrink-0 rounded-full bg-[var(--nav-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--nav-primary-hover)]"
                      onClick={onRequestLocation}
                      type="button"
                      whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.96 }}
                    >
                      다시 허용
                    </motion.button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
            <motion.button
              className="pointer-events-auto flex h-16 w-full items-center gap-4 rounded-full bg-white px-6 text-left text-lg font-semibold text-[var(--nav-ink)] shadow-[var(--nav-shadow-panel)] transition hover:bg-[var(--nav-panel)] disabled:cursor-not-allowed disabled:bg-white/80 disabled:text-[var(--nav-subtle)] max-sm:h-14 max-sm:px-5 max-sm:text-base"
              disabled={navigationBlocked}
              onClick={onOpenSearch}
              type="button"
              whileHover={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 1.01 }}
              whileTap={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 0.985 }}
            >
              <Search className="h-6 w-6 text-[var(--nav-primary)]" />
              <span className="min-w-0 flex-1">어디로 갈까요?</span>
              <Menu className="h-6 w-6 text-[var(--nav-muted)]" />
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DrivingHud({
  assist,
  guidance,
  motionTiming,
  simulationRunning,
  onStartSimulation,
}: {
  assist?: DrivingAssistInfo
  guidance?: ManeuverGuidance
  motionTiming: MotionTiming
  simulationRunning: boolean
  onStartSimulation: () => void
}) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 text-[var(--nav-ink)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTiming}
    >
      <motion.div
        className="absolute left-0 top-0 w-[min(26rem,calc(100%-7rem))] overflow-hidden rounded-br-xl bg-[var(--nav-guidance)] text-white shadow-[0_5px_12px_rgba(13,97,65,0.18)] max-sm:w-[calc(100%-5rem)]"
        data-testid="primary-maneuver-card"
        initial={{ opacity: 0, x: -24, y: -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={motionTiming}
      >
        <div className="flex h-[7rem] items-center gap-4 px-5 py-3 max-sm:h-[5.75rem] max-sm:gap-3 max-sm:px-3">
          <ManeuverIcon className="h-20 w-20 stroke-[3.5] max-sm:h-16 max-sm:w-16" type={guidance?.current.type ?? 'straight'} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold leading-none max-sm:text-4xl">{guidance?.current.distanceValue ?? '0'}</span>
              <span className="text-2xl font-bold max-sm:text-xl">{guidance?.current.distanceUnit ?? 'm'}</span>
            </div>
            <div className="mt-1 text-2xl font-semibold max-sm:text-xl">{guidance?.current.label ?? '경로 안내'}</div>
          </div>
        </div>
      </motion.div>

      {guidance?.next ? (
        <motion.div
          className="absolute left-0 top-[7rem] flex h-14 w-[min(16rem,calc(100%-10rem))] items-center gap-3 rounded-br-xl bg-[var(--nav-guidance-strong)] px-5 text-white shadow-[0_4px_10px_rgba(13,97,65,0.16)] max-sm:top-[5.75rem] max-sm:h-12 max-sm:w-[min(13.5rem,calc(100%-7rem))] max-sm:px-3"
          data-testid="next-maneuver-card"
          initial={{ opacity: 0, x: -18, y: -4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.04 }}
        >
          <ManeuverIcon className="h-7 w-7 stroke-[3] max-sm:h-6 max-sm:w-6" type={guidance.next.type} />
          <span className="text-2xl font-bold max-sm:text-xl">{guidance.next.distanceLabel}</span>
        </motion.div>
      ) : null}

      {assist ? (
        <motion.div
          className="absolute left-3 top-[10.9rem] flex min-h-16 w-[min(17.5rem,calc(100%-9rem))] items-center gap-3 rounded-xl bg-white/96 px-3.5 py-2.5 text-[var(--nav-ink)] shadow-[0_6px_18px_rgba(15,23,42,0.16)] backdrop-blur max-sm:left-2 max-sm:top-[9rem] max-sm:w-[min(15.5rem,calc(100%-6rem))]"
          data-testid="driving-assist-card"
          initial={{ opacity: 0, x: -12, y: -4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.08 }}
        >
          <span className={[
            'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white',
            assist.tone === 'warning' ? 'bg-[#e43d30]' : 'bg-[var(--nav-primary)]',
          ].join(' ')}
          >
            <AlertTriangle className="h-6 w-6" />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-sm font-bold leading-tight">{assist.title}</span>
            <span className="truncate text-xs font-medium leading-tight text-[var(--nav-muted)]">{assist.detail}</span>
          </span>
        </motion.div>
      ) : null}

      <motion.div
        className="absolute bottom-[11.25rem] left-5 flex flex-col items-center gap-3 max-sm:bottom-[10.75rem] max-sm:left-3"
        initial={{ opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.06 }}
      >
        <HudCircleButton label="현재 위치">
          <LocateFixed className="h-7 w-7 max-sm:h-6 max-sm:w-6" />
        </HudCircleButton>
      </motion.div>

      <motion.div
        className="absolute bottom-17 left-[5.25rem] flex items-center gap-3 max-sm:bottom-16 max-sm:left-[4.75rem]"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionTiming}
      >
        <motion.button
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--nav-primary-hover)] disabled:bg-[var(--nav-disabled)] disabled:text-[var(--nav-subtle)] max-sm:px-3"
          disabled={simulationRunning}
          onClick={onStartSimulation}
          type="button"
          whileTap={simulationRunning || motionTiming.duration === 0 ? undefined : { scale: 0.97 }}
        >
          {simulationRunning ? (
            <Play className="h-4 w-4 fill-current" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span>{simulationRunning ? '시뮬레이션 중' : '시뮬레이션 시작'}</span>
        </motion.button>
      </motion.div>

    </motion.div>
  )
}

function BottomStatusBar({
  arrivalLabel,
  currentLocationLabel,
  currentTimeLabel,
  distanceLabel,
  durationLabel,
  hasRoute,
  motionTiming,
  weatherLabel,
}: {
  arrivalLabel: string
  currentLocationLabel: string
  currentTimeLabel: string
  distanceLabel: string
  durationLabel: string
  hasRoute: boolean
  motionTiming: MotionTiming
  weatherLabel: string
}) {
  const items = hasRoute
    ? [
        { label: '도착', value: `${arrivalLabel} 예정`, icon: <Clock3 className="h-4 w-4" /> },
        { label: '거리', value: distanceLabel, icon: <Route className="h-4 w-4" /> },
        { label: '소요시간', value: durationLabel, icon: <Timer className="h-4 w-4" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-4 w-4" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-4 w-4" /> },
      ]
    : [
        { label: '시간', value: currentTimeLabel, icon: <Clock3 className="h-4 w-4" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-4 w-4" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-4 w-4" /> },
      ]

  return (
    <motion.div
      data-testid="bottom-status-bar"
      className={[
        'absolute bottom-0 left-0 right-0 z-30 grid h-14 items-center rounded-t-xl bg-white/96 text-[var(--nav-ink)] shadow-[0_-5px_14px_rgba(15,23,42,0.12)] backdrop-blur max-sm:h-13',
        hasRoute ? 'grid-cols-5' : 'grid-cols-3',
      ].join(' ')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      {items.map((item) => (
        <div
          className="flex min-w-0 items-center justify-center gap-2 border-r border-[var(--nav-border)] px-3 text-center last:border-r-0 max-sm:px-1.5"
          key={item.label}
        >
          <span className="shrink-0 text-[var(--nav-muted)] max-sm:hidden">{item.icon}</span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-[11px] font-medium leading-none text-[var(--nav-muted)] max-sm:text-[10px]">{item.label}</span>
            <span className="truncate text-sm font-semibold leading-tight max-sm:text-xs">{item.value}</span>
          </span>
        </div>
      ))}
    </motion.div>
  )
}

function HudCircleButton({
  children,
  className = '',
  label,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  label: string
  onClick?: () => void
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.button
      aria-label={label}
      className={[
        'pointer-events-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--nav-control)] text-[var(--nav-ink)] shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-surface-raised)] max-sm:h-13 max-sm:w-13',
        className,
      ].join(' ')}
      onClick={onClick}
      type="button"
      whileHover={shouldReduceMotion ? undefined : { scale: 1.04 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.94 }}
    >
      {children}
    </motion.button>
  )
}

interface DrivingAssistInfo {
  title: string
  detail: string
  tone: 'info' | 'warning'
}

interface ManeuverGuidanceItem {
  type: RouteManeuver['type']
  label: string
  distanceLabel: string
  distanceValue: string
  distanceUnit: string
}

interface ManeuverGuidance {
  current: ManeuverGuidanceItem
  next?: ManeuverGuidanceItem
}

function getManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
): ManeuverGuidance | undefined {
  const maneuvers = route.maneuvers ?? []
  const currentIndex = maneuvers.findIndex((maneuver) => (
    maneuver.distanceFromStartMeters >= travelledDistanceMeters - 5
  ))
  const currentManeuver = currentIndex >= 0 ? maneuvers[currentIndex] : undefined
  const nextManeuver = currentIndex >= 0 ? maneuvers[currentIndex + 1] : undefined

  if (!currentManeuver) {
    return undefined
  }

  return {
    current: createManeuverGuidanceItem(
      currentManeuver,
      currentManeuver.distanceFromStartMeters - travelledDistanceMeters,
    ),
    next: nextManeuver
      ? createManeuverGuidanceItem(
        nextManeuver,
        nextManeuver.distanceFromStartMeters - travelledDistanceMeters,
      )
      : undefined,
  }
}

function createManeuverGuidanceItem(
  maneuver: RouteManeuver,
  distanceMeters: number,
): ManeuverGuidanceItem {
  const distance = formatGuidanceDistance(distanceMeters)

  return {
    type: maneuver.type,
    label: maneuver.label,
    distanceLabel: `${distance.value}${distance.unit}`,
    distanceValue: distance.value,
    distanceUnit: distance.unit,
  }
}

function formatGuidanceDistance(distanceMeters: number) {
  const rounded = Math.max(0, Math.round(distanceMeters))

  if (rounded >= 1000) {
    return {
      value: (rounded / 1000).toFixed(1),
      unit: 'km',
    }
  }

  return {
    value: String(rounded),
    unit: 'm',
  }
}

function ManeuverIcon({
  className,
  type,
}: {
  className: string
  type: RouteManeuver['type']
}) {
  if (type === 'left') return <CornerUpLeft className={className} />
  if (type === 'right') return <CornerUpRight className={className} />
  if (type === 'arrive' || type === 'caution') return <AlertTriangle className={className} />
  return <ArrowUp className={className} />
}

function getDrivingAssistInfo({
  position,
  roadMatches,
  route,
  travelledDistanceMeters,
}: {
  position?: Coordinate
  roadMatches: RoadMatchPoint[]
  route: NavigationRoute
  travelledDistanceMeters: number
}): DrivingAssistInfo | undefined {
  const upcomingAlert = (route.safetyAlerts ?? []).find((alert) => (
    alert.distanceFromStartMeters >= travelledDistanceMeters &&
    alert.distanceFromStartMeters - travelledDistanceMeters <= 600
  ))
  const nearestRoadMatch = position
    ? getNearestRoadMatch(roadMatches, position)
    : roadMatches[0]

  if (upcomingAlert) {
    return {
      title: `${formatMeters(upcomingAlert.distanceFromStartMeters - travelledDistanceMeters)} ${upcomingAlert.label}`,
      detail: nearestRoadMatch?.speedLimitKph
        ? `${upcomingAlert.description} · 제한 ${nearestRoadMatch.speedLimitKph}km/h`
        : upcomingAlert.description,
      tone: 'warning',
    }
  }

  if (nearestRoadMatch?.speedLimitKph || nearestRoadMatch?.roadCategory !== undefined) {
    return {
      title: nearestRoadMatch.speedLimitKph
        ? `제한속도 ${nearestRoadMatch.speedLimitKph}km/h`
        : '도로 정보',
      detail: getRoadCategoryLabel(nearestRoadMatch.roadCategory),
      tone: 'info',
    }
  }

  return undefined
}

function getNearestRoadMatch(roadMatches: RoadMatchPoint[], position: Coordinate) {
  return roadMatches.reduce<RoadMatchPoint | undefined>((nearest, roadMatch) => {
    if (!nearest) {
      return roadMatch
    }

    return getApproximateSquaredDistance(roadMatch.coordinate, position) <
      getApproximateSquaredDistance(nearest.coordinate, position)
      ? roadMatch
      : nearest
  }, undefined)
}

function getRoadCategoryLabel(category?: number) {
  if (category === 0) return '고속국도'
  if (category === 1) return '도시고속화도로'
  if (category === 2) return '국도'
  if (category === 3) return '국가지원지방도'
  if (category === 4) return '지방도'
  if (category === 5) return '주요도로 1'
  if (category === 6) return '주요도로 2'
  if (category === 7) return '주요도로 3'
  if (category === 8) return '기타도로'
  if (category === 9) return '이면도로'
  if (category === 11) return '단지내도로'
  if (category === 12) return '이면도로'
  return '도로 정보'
}

function formatMeters(distanceMeters: number) {
  const rounded = Math.max(0, Math.round(distanceMeters))
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}km` : `${rounded}m`
}

function getApproximateSquaredDistance(from: Coordinate, to: Coordinate) {
  const latDelta = from.lat - to.lat
  const lngDelta = from.lng - to.lng

  return latDelta * latDelta + lngDelta * lngDelta
}

function formatArrivalTime(durationSeconds: number) {
  const arrival = new Date(Date.now() + durationSeconds * 1000)
  const hours = arrival.getHours()
  const period = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 || 12
  const minutes = arrival.getMinutes().toString().padStart(2, '0')

  return `${period} ${hour12.toString().padStart(2, '0')}:${minutes}`
}

function formatClockTime(date: Date) {
  const hours = date.getHours()
  const period = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 || 12
  const minutes = date.getMinutes().toString().padStart(2, '0')

  return `${period} ${hour12.toString().padStart(2, '0')}:${minutes}`
}

async function getCurrentWeatherLabel(position: Coordinate) {
  const params = new URLSearchParams({
    latitude: String(position.lat),
    longitude: String(position.lng),
    current: 'temperature_2m,weather_code',
    timezone: 'Asia/Seoul',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)

  if (!response.ok) {
    throw new Error('날씨 정보를 불러오지 못했습니다.')
  }

  const data = await response.json() as {
    current?: {
      temperature_2m?: number
      weather_code?: number
    }
  }
  const temperature = data.current?.temperature_2m
  const weatherCode = data.current?.weather_code

  if (typeof temperature !== 'number') {
    return '날씨 정보 없음'
  }

  return `${getWeatherConditionLabel(weatherCode)} ${Math.round(temperature)}°`
}

function getWeatherConditionLabel(code?: number) {
  if (code === 0) return '맑음'
  if (code === 1 || code === 2) return '대체로 맑음'
  if (code === 3) return '흐림'
  if (typeof code === 'number' && code >= 45 && code <= 48) return '안개'
  if (typeof code === 'number' && code >= 51 && code <= 67) return '비'
  if (typeof code === 'number' && code >= 71 && code <= 77) return '눈'
  if (typeof code === 'number' && code >= 80 && code <= 82) return '소나기'
  if (typeof code === 'number' && code >= 95) return '뇌우'

  return '날씨'
}

function PlaceResults({
  activeIndex,
  label,
  listId,
  motionTiming,
  places,
  onSelect,
}: {
  activeIndex: number
  label: string
  listId: string
  motionTiming: MotionTiming
  places: Place[]
  onSelect: (place: Place) => void
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const activeOption = optionRefs.current[activeIndex]

    if (typeof activeOption?.scrollIntoView !== 'function') {
      return
    }

    activeOption.scrollIntoView({
      block: 'nearest',
    })
  }, [activeIndex])

  return (
    <motion.div
      id={listId}
      role="listbox"
      aria-label={label}
      className="max-h-[10.5rem] overflow-hidden"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.99 }}
      transition={motionTiming}
    >
      <div className="max-h-[10.5rem] overflow-y-auto p-1.5">
        {places.map((place, index) => (
          <motion.button
            key={place.id}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            type="button"
            className={[
              'grid min-h-12 w-full gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition',
              index === activeIndex ? 'bg-[var(--nav-selection)] text-[var(--nav-ink)]' : 'text-[var(--nav-ink)] hover:bg-[var(--nav-surface-raised)]',
            ].join(' ')}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...motionTiming,
              delay: motionTiming.duration === 0 ? 0 : Math.min(index, 5) * 0.025,
            }}
            whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.99 }}
            onClick={() => onSelect(place)}
          >
            <span className="block font-medium text-[var(--nav-ink)]">{place.name}</span>
            <span className="block truncate text-xs text-[var(--nav-muted)]">{place.address || '주소 정보 없음'}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

function SearchField({
  active,
  activeOptionId,
  autoFocus = false,
  controlsId,
  icon,
  label,
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder,
  onFillCurrentLocation,
}: {
  active: boolean
  activeOptionId?: string
  autoFocus?: boolean
  controlsId: string
  icon: React.ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
  onFillCurrentLocation?: () => void
}) {
  return (
    <label className="block text-sm">
      <span className="mb-2 block text-[var(--nav-muted)]">{label}</span>
      <span
        className={[
          'flex h-12 items-center gap-2.5 rounded-xl border px-3 py-1 text-[var(--nav-muted)] transition',
          active ? 'border-[var(--nav-primary)] bg-[var(--nav-surface)] shadow-[0_0_0_3px_var(--nav-focus-ring)]' : 'border-transparent bg-[var(--nav-panel)]',
        ].join(' ')}
      >
        {icon}
        <input
          role="combobox"
          aria-activedescendant={activeOptionId}
          aria-controls={controlsId}
          aria-expanded={active}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-muted)]"
          placeholder={placeholder}
        />
        {onFillCurrentLocation ? (
          <button
            aria-label="현재 위치로 출발지 설정"
            className="rounded-full px-2 py-1 text-xs font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-surface)]"
            onClick={onFillCurrentLocation}
            type="button"
          >
            현재 위치
          </button>
        ) : null}
      </span>
    </label>
  )
}
