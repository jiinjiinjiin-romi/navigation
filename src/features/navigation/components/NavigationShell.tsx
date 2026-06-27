import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowUp,
  Buildings,
  CaretLeft,
  CloudSun,
  Clock,
  HouseLine,
  MagnifyingGlass,
  MapPin,
  Play,
  RoadHorizon,
  Stop,
  Timer,
  Warning,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentAddress, getRoadMatch, getRoute, searchPlaces } from '../api/tmapApi'
import { createRoundedRoutePath } from '../map/routeGeometry'
import { createRouteSimulationPlan, getSimulatedRoutePosition } from '../simulation/routeSimulation'
import { getSimulationDurationMs } from '../simulation/simulationTiming'
import type { Coordinate, NavigationRoute, Place, RoadMatchPoint, RouteManeuver, SafetyAlert } from '../types'
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
const SEARCH_DEBOUNCE_MS = 250
const ADDRESS_COORDINATE_PRECISION = 5
const WEATHER_COORDINATE_PRECISION = 3
const GUIDANCE_DISTANCE_STEP_MIN_METERS = 3
const GUIDANCE_DISTANCE_STEP_MAX_METERS = 10
const GUIDANCE_DISTANCE_SHARED_STEP_KEY = '__guidance-distance-shared-step__'
const ROUTE_SEARCH_SUMMARY_FIELDS_HEIGHT = 140
const ROUTE_SEARCH_EDITOR_FIELDS_HEIGHT = 380
const SIMULATION_UI_UPDATE_INTERVAL_MS = 200
const DRIVING_ASSIST_DEBUG_QUERY_PARAM = 'debugSigns'
const DRIVING_ASSIST_DEBUG_SEQUENCE_INTERVAL_MS = 1400
const SAVED_PLACES: Place[] = [
  {
    id: 'saved-home',
    name: '집',
    address: '서울 중구 세종대로 110',
    coordinate: { lat: 37.5547, lng: 126.9706 },
  },
  {
    id: 'saved-work',
    name: '회사',
    address: '서울 강남구 테헤란로 152',
    coordinate: { lat: 37.4979, lng: 127.0276 },
  },
]
const DEBUG_DRIVING_ASSIST_SEQUENCE: DrivingAssistInfo[] = [
  {
    alert: {
      type: 'caution',
      label: '어린이보호구역',
      distanceLabel: '40m',
      schoolZone: true,
    },
  },
  { speedLimitKph: 30 },
  {
    alert: {
      type: 'enforcement',
      label: '단속구간',
      distanceLabel: '80m',
      schoolZone: false,
    },
  },
  {
    alert: {
      type: 'curve',
      label: '급커브',
      distanceLabel: '120m',
      schoolZone: false,
    },
  },
  {
    alert: {
      type: 'falling-rock',
      label: '낙석주의',
      distanceLabel: '180m',
      schoolZone: false,
    },
  },
  {
    alert: {
      type: 'accident',
      label: '사고주의',
      distanceLabel: '240m',
      schoolZone: false,
    },
  },
  {
    alert: {
      type: 'caution',
      label: '주의',
      distanceLabel: '300m',
      schoolZone: false,
    },
  },
]

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
  const simulationLastUiUpdateAtRef = useRef<number | undefined>(undefined)
  const guidanceDistanceDisplayRef = useRef<GuidanceDistanceDisplayStore>(new Map())
  const debouncedOriginKeyword = useDebouncedValue(originKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const debouncedDestinationKeyword = useDebouncedValue(destinationKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const addressQueryCoordinate = useMemo(
    () => currentPosition ? roundCoordinate(currentPosition, ADDRESS_COORDINATE_PRECISION) : undefined,
    [currentPosition],
  )
  const weatherQueryCoordinate = useMemo(
    () => currentPosition ? roundCoordinate(currentPosition, WEATHER_COORDINATE_PRECISION) : undefined,
    [currentPosition],
  )

  const originSearch = useQuery({
    queryKey: ['places', debouncedOriginKeyword],
    queryFn: ({ signal }) => searchPlaces(debouncedOriginKeyword, undefined, signal),
    enabled: activeField === 'origin' && debouncedOriginKeyword.length >= 2 && debouncedOriginKeyword !== origin?.name,
    placeholderData: keepPreviousData,
  })

  const destinationSearch = useQuery({
    queryKey: ['places', debouncedDestinationKeyword],
    queryFn: ({ signal }) => searchPlaces(debouncedDestinationKeyword, undefined, signal),
    enabled: activeField === 'destination' && debouncedDestinationKeyword.length >= 2 && debouncedDestinationKeyword !== destination?.name,
    placeholderData: keepPreviousData,
  })

  const routeQuery = useQuery({
    queryKey: [
      'route',
      origin?.id,
      origin?.coordinate.lat,
      origin?.coordinate.lng,
      destination?.id,
      destination?.coordinate.lat,
      destination?.coordinate.lng,
    ],
    queryFn: ({ signal }) => getRoute(origin!.coordinate, destination!.coordinate, undefined, signal),
    enabled: locationStatus === 'granted' && Boolean(origin && destination),
  })
  const roadMatchQuery = useQuery({
    queryKey: ['road-match', origin?.id, destination?.id],
    queryFn: ({ signal }) => getRoadMatch(routeQuery.data!.coordinates, undefined, signal),
    enabled: Boolean(routeQuery.data?.coordinates.length),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const weatherQuery = useQuery({
    queryKey: ['weather', weatherQueryCoordinate?.lat, weatherQueryCoordinate?.lng],
    queryFn: () => getCurrentWeatherLabel(weatherQueryCoordinate!),
    enabled: Boolean(weatherQueryCoordinate),
    staleTime: WEATHER_STALE_TIME_MS,
    retry: false,
  })
  const currentAddressQuery = useQuery({
    queryKey: ['current-address', addressQueryCoordinate?.lat, addressQueryCoordinate?.lng],
    queryFn: ({ signal }) => getCurrentAddress(addressQueryCoordinate!, undefined, signal),
    enabled: Boolean(addressQueryCoordinate),
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
  const activeRouteSimulationPlan = useMemo(
    () => activeRoute ? createRouteSimulationPlan(activeRoute) : undefined,
    [activeRoute],
  )

  useEffect(() => {
    guidanceDistanceDisplayRef.current.clear()
  }, [activeRoute])
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
  const debugDrivingAssist = useDrivingAssistDebugSequence(Boolean(activeRoute))
  const maneuverGuidance = activeRoute
    ? getManeuverGuidance(
      activeRoute,
      travelledDistanceMeters,
      guidanceDistanceDisplayRef.current,
    )
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
    setActiveField(null)
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

  const selectSavedPlace = (field: SearchFieldId, place: Place) => {
    selectPlace(field, place)
    setActiveField(null)
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
    guidanceDistanceDisplayRef.current.clear()
    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    setSimulationRunning(true)
  }

  const stopSimulation = useCallback(() => {
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }

    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    setSimulationRunning(false)
  }, [])

  useEffect(() => {
    const route = activeRoute
    const simulationPlan = activeRouteSimulationPlan

    if (!simulationRunning || !route || !simulationPlan) {
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
      const progress = getSimulatedRoutePosition(simulationPlan, elapsed / simulationDurationMs)
      const shouldUpdateUiState = (
        progress.completed ||
        simulationLastUiUpdateAtRef.current === undefined ||
        timestamp - simulationLastUiUpdateAtRef.current >= SIMULATION_UI_UPDATE_INTERVAL_MS
      )

      setSimulationPosition(progress.coordinate)

      if (shouldUpdateUiState) {
        setSimulationRemainingDistance(progress.remainingDistanceMeters)
        setSimulationRemainingDuration(progress.remainingDurationSeconds)
        simulationLastUiUpdateAtRef.current = timestamp
      }

      if (progress.completed) {
        setSimulationRunning(false)
        animationFrameRef.current = undefined
        simulationLastUiUpdateAtRef.current = undefined
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
  }, [activeRoute, activeRouteSimulationPlan, simulationRunning])

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
          onRequestLocation={requestCurrentLocation}
        />

        {!activeRoute ? (
          <>
            <IdleMapControls
              locationStatus={locationStatus}
              motionTiming={motionTiming}
              searchOpen={routeSearchOpen}
              onOpenSearch={() => {
                setRouteSearchOpen(true)
                setActiveField(null)
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
          savedPlaces={SAVED_PLACES}
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
                onBackToSummary={() => {
                  setActiveField(null)
                  setHighlightedIndex(0)
                }}
                onFocusOrigin={() => setActiveField('origin')}
                onFocusDestination={() => setActiveField('destination')}
                onKeyDown={(field, event) => handleSearchKeyDown(field, event)}
                onSelectPlace={(place) => selectPlace(activeField ?? 'destination', place)}
                onSelectSavedPlace={selectSavedPlace}
                onFillOriginWithCurrentLocation={fillOriginWithCurrentLocation}
                />
              ) : null}
            </AnimatePresence>
          </>
        ) : (
          <DrivingHud
            assist={debugDrivingAssist ?? drivingAssist}
            guidance={maneuverGuidance}
            motionTiming={motionTiming}
            simulationRunning={simulationRunning}
            onToggleSimulation={simulationRunning ? stopSimulation : startSimulation}
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
  savedPlaces,
  showSuggestions,
  onChangeOrigin,
  onChangeDestination,
  onClose,
  onBackToSummary,
  onFocusOrigin,
  onFocusDestination,
  onKeyDown,
  onSelectPlace,
  onSelectSavedPlace,
  onFillOriginWithCurrentLocation,
}: {
  activeField: SearchFieldId | null
  activeIndex: number
  activeLabel: string
  destinationKeyword: string
  motionTiming: MotionTiming
  originKeyword: string
  places: Place[]
  savedPlaces: Place[]
  showSuggestions: boolean
  onChangeOrigin: (value: string) => void
  onChangeDestination: (value: string) => void
  onClose: () => void
  onBackToSummary: () => void
  onFocusOrigin: () => void
  onFocusDestination: () => void
  onKeyDown: (field: SearchFieldId, event: KeyboardEvent<HTMLInputElement>) => void
  onSelectPlace: (place: Place) => void
  onSelectSavedPlace: (field: SearchFieldId, place: Place) => void
  onFillOriginWithCurrentLocation: () => void
}) {
  const activeListId = activeField ? `place-results-${activeField}` : 'place-results'
  const isEditingField = activeField !== null
  const activeFieldTitle = activeField === 'origin' ? '출발 위치' : '목적지'
  const routeSearchFieldsHeight = isEditingField
    ? ROUTE_SEARCH_EDITOR_FIELDS_HEIGHT
    : ROUTE_SEARCH_SUMMARY_FIELDS_HEIGHT
  const routeSearchLayoutTransition = {
    ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1] as [number, number, number, number],
    duration: motionTiming.duration === 0 ? 0 : 0.36,
  }
  const routeSearchItemTransition = {
    ...motionTiming,
    duration: motionTiming.duration === 0 ? 0 : 0.18,
  }
  const routeSearchGroupVariants = {
    hidden: {
      transition: {
        staggerChildren: motionTiming.duration === 0 ? 0 : 0.035,
        staggerDirection: -1,
      },
    },
    visible: {
      transition: {
        delayChildren: motionTiming.duration === 0 ? 0 : 0.04,
        staggerChildren: motionTiming.duration === 0 ? 0 : 0.045,
      },
    },
  }
  const routeSearchElementVariants = {
    hidden: {
      opacity: 0,
      y: motionTiming.duration === 0 ? 0 : 8,
      scale: motionTiming.duration === 0 ? 1 : 0.985,
      transition: routeSearchItemTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: routeSearchItemTransition,
    },
  }
  const renderSuggestions = (field: SearchFieldId) => {
    const showForField = showSuggestions && activeField === field

    return (
      <div
        className="mt-3 min-h-[10.5rem] overflow-hidden rounded-xl"
        data-testid={showForField ? 'route-search-results' : 'route-search-results-empty'}
      >
        <AnimatePresence initial={false} mode="wait">
          {showForField ? (
            <PlaceResults
              activeIndex={activeIndex}
              key={`${field}-results`}
              label={activeLabel}
              listId={activeListId}
              motionTiming={motionTiming}
              places={places}
              onSelect={onSelectPlace}
            />
          ) : (
            <motion.div
              aria-hidden="true"
              className="h-[10.5rem]"
              key={`${field}-empty`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={routeSearchItemTransition}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <motion.div
      className="pointer-events-none absolute bottom-18 left-1/2 z-20 w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 text-[var(--nav-ink)] max-sm:bottom-15 max-sm:w-[calc(100%-1rem)]"
      initial={{ opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.985 }}
      transition={routeSearchLayoutTransition}
    >
      <motion.div
        className="pointer-events-auto relative rounded-[1.25rem] bg-[var(--nav-surface-raised)] p-3 shadow-[var(--nav-shadow-panel)]"
        transition={routeSearchLayoutTransition}
      >
        <motion.button
          aria-label="경로 검색 닫기"
          className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white text-[var(--nav-muted)] shadow-[0_4px_10px_rgba(15,23,42,0.12)] transition hover:text-[var(--nav-ink)]"
          onClick={onClose}
          whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.94 }}
          type="button"
        >
          <X className="h-4.5 w-4.5" weight="bold" />
        </motion.button>

        <motion.div
          animate={{ height: routeSearchFieldsHeight }}
          className="grid overflow-hidden"
          data-testid="route-search-fields"
          initial={false}
          transition={routeSearchLayoutTransition}
        >
            <AnimatePresence initial={false} mode="wait">
              {!isEditingField ? (
                <motion.div
                  animate="visible"
                  className="grid grid-cols-[1rem_1fr] gap-x-3 rounded-2xl bg-white p-3"
                  exit="hidden"
                  initial="hidden"
                  key="route-fields-summary"
                  variants={routeSearchGroupVariants}
                >
                  <motion.div
                    className="grid content-start justify-center pt-4.5"
                    variants={routeSearchElementVariants}
                  >
                    <span className="size-2 rounded-full bg-[var(--nav-primary)]" />
                    <span className="mx-auto h-[3.8rem] w-px bg-[var(--nav-border)]" />
                    <span className="size-2 rounded-full bg-[var(--nav-guidance)]" />
                  </motion.div>
                  <motion.div
                    className="grid gap-3"
                    variants={routeSearchGroupVariants}
                  >
                    <motion.div variants={routeSearchElementVariants}>
                      <SearchField
                        active={false}
                        activeOptionId={undefined}
                        expanded={false}
                        controlsId={undefined}
                        icon={<MapPin className="h-5 w-5" weight="bold" />}
                        label="출발 위치"
                        labelHidden
                        value={originKeyword}
                        onChange={onChangeOrigin}
                        onFocus={onFocusOrigin}
                        onKeyDown={(event) => onKeyDown('origin', event)}
                        placeholder="출발 위치"
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      <SearchField
                        active={false}
                        activeOptionId={undefined}
                        expanded={false}
                        controlsId={undefined}
                        icon={<MagnifyingGlass className="h-5 w-5" weight="bold" />}
                        label="목적지"
                        labelHidden
                        value={destinationKeyword}
                        onChange={onChangeDestination}
                        onFocus={onFocusDestination}
                        onKeyDown={(event) => onKeyDown('destination', event)}
                        placeholder="목적지"
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  animate="visible"
                  className="rounded-2xl bg-white p-3"
                  exit="hidden"
                  initial="hidden"
                  key={`route-field-editor-${activeField}`}
                  variants={routeSearchGroupVariants}
                >
                <motion.div
                  className="mb-3 flex items-center gap-2"
                  variants={routeSearchElementVariants}
                >
                  <motion.button
                    aria-label="경로 입력으로 돌아가기"
                    className="grid h-9 w-9 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
                    onClick={onBackToSummary}
                    type="button"
                    whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.94 }}
                  >
                    <CaretLeft className="h-5 w-5" weight="bold" />
                  </motion.button>
                  <span className="text-[15px] font-bold text-[var(--nav-ink)]">{activeFieldTitle}</span>
                </motion.div>

                {activeField === 'origin' ? (
                  <>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SearchField
                        active
                        activeOptionId={showSuggestions ? `${activeListId}-option-${activeIndex}` : undefined}
                        autoFocus
                        expanded={showSuggestions}
                        controlsId={activeListId}
                        icon={<MapPin className="h-5 w-5" weight="bold" />}
                        label="출발 위치"
                        labelHidden
                        value={originKeyword}
                        onChange={onChangeOrigin}
                        onFocus={onFocusOrigin}
                        onKeyDown={(event) => onKeyDown('origin', event)}
                        placeholder="출발지 검색"
                      />
                    </motion.div>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SavedPlaceButtons
                        field="origin"
                        places={savedPlaces}
                        onFillCurrentLocation={onFillOriginWithCurrentLocation}
                        onSelect={onSelectSavedPlace}
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      {renderSuggestions('origin')}
                    </motion.div>
                  </>
                ) : (
                  <>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SearchField
                        active
                        activeOptionId={showSuggestions ? `${activeListId}-option-${activeIndex}` : undefined}
                        autoFocus
                        expanded={showSuggestions}
                        controlsId={activeListId}
                        icon={<MagnifyingGlass className="h-5 w-5" weight="bold" />}
                        label="목적지"
                        labelHidden
                        value={destinationKeyword}
                        onChange={onChangeDestination}
                        onFocus={onFocusDestination}
                        onKeyDown={(event) => onKeyDown('destination', event)}
                        placeholder="목적지 검색"
                      />
                    </motion.div>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SavedPlaceButtons
                        field="destination"
                        places={savedPlaces}
                        onSelect={onSelectSavedPlace}
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      {renderSuggestions('destination')}
                    </motion.div>
                  </>
                )}
                </motion.div>
              )}
            </AnimatePresence>
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
      <AnimatePresence initial={false}>
        {!searchOpen ? (
          <motion.div
            className="absolute bottom-20 left-1/2 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 max-sm:bottom-18 max-sm:w-[min(22rem,calc(100%-1.5rem))]"
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
              className="pointer-events-auto flex h-15 w-full items-center gap-3.5 rounded-full bg-white px-5 text-left text-base font-semibold text-[var(--nav-ink)] shadow-[var(--nav-shadow-panel)] transition hover:bg-[var(--nav-panel)] disabled:cursor-not-allowed disabled:bg-white/80 disabled:text-[var(--nav-subtle)] max-sm:h-14 max-sm:px-5"
              disabled={navigationBlocked}
              onClick={onOpenSearch}
              type="button"
              whileHover={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 1.01 }}
              whileTap={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 0.985 }}
            >
              <MagnifyingGlass className="h-5 w-5 text-[var(--nav-primary)]" weight="bold" />
              <span className="min-w-0 flex-1">어디로 갈까요?</span>
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
  onToggleSimulation,
}: {
  assist?: DrivingAssistInfo
  guidance?: ManeuverGuidance
  motionTiming: MotionTiming
  simulationRunning: boolean
  onToggleSimulation: () => void
}) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40 text-[var(--nav-ink)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTiming}
    >
      <motion.div
        className="absolute left-0 top-0 w-fit max-w-[min(22rem,calc(100%-7rem))] overflow-hidden rounded-br-xl bg-[var(--nav-guidance)] text-white shadow-[0_5px_12px_rgba(13,97,65,0.18)] max-sm:max-w-[calc(100%-5rem)]"
        data-testid="primary-maneuver-card"
        initial={{ opacity: 0, x: -24, y: -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={motionTiming}
      >
        <div className="flex h-[7rem] max-w-full items-center gap-3.5 py-3 pl-5 pr-8 max-sm:h-[5.75rem] max-sm:gap-3 max-sm:pl-3 max-sm:pr-5">
          <ManeuverIcon className="h-20 w-20 stroke-[3.5] max-sm:h-16 max-sm:w-16" type={guidance?.current.type ?? 'straight'} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold leading-none max-sm:text-4xl">{guidance?.current.distanceValue ?? '0'}</span>
              <span className="text-2xl font-bold max-sm:text-xl">{guidance?.current.distanceUnit ?? 'm'}</span>
            </div>
            <div className="mt-1 truncate text-2xl font-semibold max-sm:text-xl">{guidance?.current.label ?? '경로 안내'}</div>
          </div>
        </div>
      </motion.div>

      {guidance?.next ? (
        <motion.div
          className="absolute left-0 top-[7rem] flex h-14 w-fit max-w-[calc(100%-10rem)] items-center gap-3 rounded-br-xl bg-[var(--nav-guidance-strong)] py-0 pl-5 pr-7 text-white shadow-[0_4px_10px_rgba(13,97,65,0.16)] max-sm:top-[5.75rem] max-sm:h-12 max-sm:max-w-[calc(100%-7rem)] max-sm:pl-3 max-sm:pr-5"
          data-testid="next-maneuver-card"
          initial={{ opacity: 0, x: -18, y: -4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.04 }}
        >
          <ManeuverIcon className="h-7 w-7 stroke-[3] max-sm:h-6 max-sm:w-6" type={guidance.next.type} />
          <span className="whitespace-nowrap text-2xl font-bold max-sm:text-xl">{guidance.next.distanceLabel}</span>
        </motion.div>
      ) : null}

      {assist ? (
        <motion.div
          className="absolute left-4 top-[11rem] max-sm:left-2 max-sm:top-[9rem]"
          data-testid="driving-assist-signs"
          initial={{ opacity: 0, x: -12, y: -4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.08 }}
        >
          <DrivingAssistSigns assist={assist} />
        </motion.div>
      ) : null}

      <motion.div
        className="absolute bottom-17 right-5 flex items-center gap-3 max-sm:bottom-16 max-sm:right-3"
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionTiming}
      >
        <motion.button
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--nav-primary-hover)] max-sm:px-3"
          onClick={onToggleSimulation}
          type="button"
          whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.97 }}
        >
          {simulationRunning ? (
            <Stop className="h-4 w-4" weight="fill" />
          ) : (
            <Play className="h-4 w-4" weight="fill" />
          )}
          <span>{simulationRunning ? '시뮬레이션 중지' : '시뮬레이션 시작'}</span>
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
        { label: '도착', value: `${arrivalLabel} 예정`, icon: <Clock className="h-4 w-4" weight="bold" /> },
        { label: '거리', value: distanceLabel, icon: <RoadHorizon className="h-4 w-4" weight="bold" /> },
        { label: '소요시간', value: durationLabel, icon: <Timer className="h-4 w-4" weight="bold" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-4 w-4" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-4 w-4" weight="bold" /> },
      ]
    : [
        { label: '시간', value: currentTimeLabel, icon: <Clock className="h-4 w-4" weight="bold" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-4 w-4" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-4 w-4" weight="bold" /> },
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

interface DrivingAssistInfo {
  alert?: {
    type?: SafetyAlert['type']
    label: string
    distanceLabel: string
    schoolZone: boolean
  }
  speedLimitKph?: number
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

interface GuidanceDistanceDisplayState {
  displayMeters: number
  nextStepMeters?: number
}

type GuidanceDistanceDisplayStore = Map<string, GuidanceDistanceDisplayState>

function getManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
  distanceDisplayStore: GuidanceDistanceDisplayStore,
): ManeuverGuidance | undefined {
  const maneuvers = route.maneuvers ?? []

  if (maneuvers.length === 0) {
    return createFallbackManeuverGuidance(route, travelledDistanceMeters)
  }

  const currentIndex = maneuvers.findIndex((maneuver) => (
    maneuver.distanceFromStartMeters >= travelledDistanceMeters - 5
  ))
  const currentManeuver = currentIndex >= 0 ? maneuvers[currentIndex] : undefined
  const nextManeuver = currentIndex >= 0 ? maneuvers[currentIndex + 1] : undefined

  if (!currentManeuver) {
    return createFallbackManeuverGuidance(route, travelledDistanceMeters)
  }

  const sharedStepMeters = getSharedGuidanceDistanceStep(distanceDisplayStore, travelledDistanceMeters)

  return {
    current: createManeuverGuidanceItem(
      currentManeuver,
      currentManeuver.distanceFromStartMeters - travelledDistanceMeters,
      distanceDisplayStore,
      sharedStepMeters,
    ),
    next: nextManeuver
      ? createManeuverGuidanceItem(
        nextManeuver,
        nextManeuver.distanceFromStartMeters - travelledDistanceMeters,
        distanceDisplayStore,
        sharedStepMeters,
      )
      : undefined,
  }
}

function createFallbackManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
): ManeuverGuidance {
  const remainingDistanceMeters = Math.max(0, route.summary.distanceMeters - travelledDistanceMeters)
  const distance = formatGuidanceDistance(remainingDistanceMeters)
  const isArriving = remainingDistanceMeters <= 30

  return {
    current: {
      type: isArriving ? 'arrive' : 'straight',
      label: isArriving ? '목적지' : '경로 따라 주행',
      distanceLabel: `${distance.value}${distance.unit}`,
      distanceValue: distance.value,
      distanceUnit: distance.unit,
    },
  }
}

function createManeuverGuidanceItem(
  maneuver: RouteManeuver,
  distanceMeters: number,
  distanceDisplayStore: GuidanceDistanceDisplayStore,
  stepMeters: number,
): ManeuverGuidanceItem {
  const displayDistanceMeters = getSteppedGuidanceDistance(
    distanceDisplayStore,
    maneuver.id,
    distanceMeters,
    stepMeters,
  )
  const distance = formatGuidanceDistance(displayDistanceMeters)

  return {
    type: maneuver.type,
    label: maneuver.label,
    distanceLabel: `${distance.value}${distance.unit}`,
    distanceValue: distance.value,
    distanceUnit: distance.unit,
  }
}

function getSteppedGuidanceDistance(
  store: GuidanceDistanceDisplayStore,
  key: string,
  distanceMeters: number,
  stepMeters: number,
) {
  const actualMeters = Math.max(0, Math.round(distanceMeters))

  if (actualMeters >= 1000) {
    store.delete(key)
    return actualMeters
  }

  const existing = store.get(key)

  if (!existing || actualMeters > existing.displayMeters || actualMeters === 0) {
    const nextState = {
      displayMeters: actualMeters,
    }
    store.set(key, nextState)
    return nextState.displayMeters
  }

  while (
    existing.displayMeters > 0 &&
    actualMeters <= existing.displayMeters - stepMeters
  ) {
    existing.displayMeters = Math.max(0, existing.displayMeters - stepMeters)
  }

  return existing.displayMeters
}

function getSharedGuidanceDistanceStep(
  store: GuidanceDistanceDisplayStore,
  travelledDistanceMeters: number,
) {
  const travelledMeters = Math.max(0, Math.round(travelledDistanceMeters))
  const existing = store.get(GUIDANCE_DISTANCE_SHARED_STEP_KEY)

  if (!existing || existing.nextStepMeters === undefined || travelledMeters < existing.displayMeters) {
    const nextState = {
      displayMeters: travelledMeters,
      nextStepMeters: getRandomGuidanceDistanceStep(),
    }
    store.set(GUIDANCE_DISTANCE_SHARED_STEP_KEY, nextState)
    return nextState.nextStepMeters
  }

  let activeStepMeters = existing.nextStepMeters

  while (travelledMeters >= existing.displayMeters + existing.nextStepMeters) {
    activeStepMeters = existing.nextStepMeters
    existing.displayMeters += existing.nextStepMeters
    existing.nextStepMeters = getRandomGuidanceDistanceStep()
  }

  return activeStepMeters
}

function getRandomGuidanceDistanceStep() {
  return (
    Math.floor(
      Math.random() * (
        GUIDANCE_DISTANCE_STEP_MAX_METERS -
        GUIDANCE_DISTANCE_STEP_MIN_METERS +
        1
      ),
    ) + GUIDANCE_DISTANCE_STEP_MIN_METERS
  )
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
  if (type === 'left') return <ArrowBendUpLeft className={className} weight="bold" />
  if (type === 'right') return <ArrowBendUpRight className={className} weight="bold" />
  if (type === 'arrive' || type === 'caution') return <Warning className={className} weight="bold" />
  return <ArrowUp className={className} weight="bold" />
}

function DrivingAssistSigns({ assist }: { assist: DrivingAssistInfo }) {
  return (
    <div className="grid w-30 gap-2 max-sm:w-24">
      {assist.alert ? (
        <div
          aria-label={`${assist.alert.label} ${assist.alert.distanceLabel} 남음`}
          className="grid justify-items-center"
        >
          {assist.alert.schoolZone ? (
            <SchoolZoneSign />
          ) : (
            <WarningZoneSign label={assist.alert.label} type={assist.alert.type} />
          )}
          <DistancePlaque label={assist.alert.distanceLabel} tone="danger" />
        </div>
      ) : null}
      {assist.speedLimitKph ? (
        <SpeedLimitSign speed={assist.speedLimitKph} />
      ) : null}
    </div>
  )
}

function SchoolZoneSign() {
  return (
    <svg aria-hidden="true" className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.26)]" viewBox="0 0 128 112">
      <path d="M64 4 124 108H4L64 4Z" fill="#E94B2F" />
      <path d="M64 18 108 96H20L64 18Z" fill="#FFD940" />
      <path d="M57 42a7 7 0 1 0-14 0 7 7 0 0 0 14 0ZM45 52h10l6 21h-8l-3-10-3 10h-8l6-21Z" fill="#050505" />
      <path d="M82 52a5 5 0 1 0-10 0 5 5 0 0 0 10 0ZM73 60h8l5 18h-7l-2-8-2 8h-7l5-18Z" fill="#050505" />
      <path d="M57 56c7 5 13 5 18 1" stroke="#050505" strokeLinecap="round" strokeWidth="5" />
    </svg>
  )
}

function WarningZoneSign({
  label,
  type,
}: {
  label: string
  type?: SafetyAlert['type']
}) {
  const iconPath = getWarningSignIconPath(type)

  return (
    <svg
      aria-hidden="true"
      className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.26)]"
      viewBox="0 0 128 112"
    >
      <path d="M64 4 124 108H4L64 4Z" fill="#E94B2F" />
      <path d="M64 18 108 96H20L64 18Z" fill="#FFD940" />
      <path d={iconPath} fill="#050505" />
      <text
        fill="#050505"
        fontFamily="Pretendard, sans-serif"
        fontSize="13"
        fontWeight="900"
        textAnchor="middle"
        x="64"
        y="91"
      >
        {label}
      </text>
    </svg>
  )
}

function getWarningSignIconPath(type?: SafetyAlert['type']) {
  if (type === 'curve') {
    return 'M44 37h16c18 0 30 12 30 30v5h-13v-5c0-11-6-18-17-18H44l9 9-9 9-24-24 24-24 9 9-9 9Z'
  }

  if (type === 'falling-rock') {
    return 'M38 31h22l-8 14 14-7-9 18 18-7 13 26H40L28 54l10-23Zm43 5 9 5-5 9-9-5 5-9Zm-18-14 11 7-7 11-11-7 7-11Z'
  }

  if (type === 'accident') {
    return 'M37 57h54l8 15v14h-9a10 10 0 0 1-20 0H58a10 10 0 0 1-20 0h-9V72l8-15Zm7 9-4 8h47l-4-8H44Zm5 26a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm31 0a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM43 29l9-5 8 15 8-15 9 5-10 19H53L43 29Z'
  }

  if (type === 'enforcement') {
    return 'M38 39h52a8 8 0 0 1 8 8v30a8 8 0 0 1-8 8H38a8 8 0 0 1-8-8V47a8 8 0 0 1 8-8Zm26 10a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm0 10a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-20-30h40l6 10H38l6-10Z'
  }

  return 'M58 33h12l-2 34H60l-2-34Zm6 44a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z'
}

function DistancePlaque({ label, tone }: { label: string; tone: 'danger' }) {
  return (
    <div className={[
      'mt-[-2px] w-[78%] rounded-md px-2 py-1 text-center text-2xl font-black leading-none text-white shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:text-xl',
      tone === 'danger' ? 'bg-[#E84B2F]' : 'bg-[var(--nav-primary)]',
    ].join(' ')}
    >
      {label}
    </div>
  )
}

function SpeedLimitSign({ speed }: { speed: number }) {
  return (
    <div
      aria-label={`제한속도 ${speed}km/h`}
      className="grid h-20 w-20 place-items-center rounded-full border-[8px] border-[#E6462E] bg-white text-center font-black leading-none text-[#111] shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:h-16 max-sm:w-16 max-sm:border-[6px]"
    >
      <span className="text-3xl max-sm:text-2xl">{speed}</span>
    </div>
  )
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
  const speedLimitKph = nearestRoadMatch?.speedLimitKph

  if (upcomingAlert) {
    return {
      alert: {
        type: upcomingAlert.type,
        label: upcomingAlert.label,
        distanceLabel: formatMeters(upcomingAlert.distanceFromStartMeters - travelledDistanceMeters),
        schoolZone: isSchoolZoneAlert(upcomingAlert),
      },
      speedLimitKph,
    }
  }

  if (speedLimitKph) {
    return {
      speedLimitKph,
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

function isSchoolZoneAlert(alert: SafetyAlert) {
  return /어린이|보호구역|school/i.test(`${alert.label} ${alert.description}`)
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

function useDrivingAssistDebugSequence(hasRoute: boolean) {
  const debugEnabled = hasRoute && isDrivingAssistDebugSequenceEnabled()
  const [debugIndex, setDebugIndex] = useState(0)

  useEffect(() => {
    if (!debugEnabled) {
      setDebugIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setDebugIndex((index) => (index + 1) % DEBUG_DRIVING_ASSIST_SEQUENCE.length)
    }, DRIVING_ASSIST_DEBUG_SEQUENCE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [debugEnabled])

  if (!debugEnabled) {
    return undefined
  }

  return DEBUG_DRIVING_ASSIST_SEQUENCE[debugIndex]
}

function isDrivingAssistDebugSequenceEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(DRIVING_ASSIST_DEBUG_QUERY_PARAM) === '1'
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debouncedValue
}

function roundCoordinate(coordinate: Coordinate, precision: number): Coordinate {
  return {
    lat: roundNumber(coordinate.lat, precision),
    lng: roundNumber(coordinate.lng, precision),
  }
}

function roundNumber(value: number, precision: number) {
  const factor = 10 ** precision

  return Math.round(value * factor) / factor
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
              'grid min-h-12 w-full gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
              index === activeIndex ? 'bg-[var(--nav-selection)] text-[var(--nav-ink)]' : 'text-[var(--nav-ink)] hover:bg-[var(--nav-selection)]',
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
  expanded,
  icon,
  label,
  labelHidden = false,
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder,
}: {
  active: boolean
  activeOptionId?: string
  autoFocus?: boolean
  controlsId?: string
  expanded: boolean
  icon: React.ReactNode
  label: string
  labelHidden?: boolean
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  return (
    <label className="block text-sm">
      <span className={[
        'mb-2 block font-semibold text-[var(--nav-muted)]',
        labelHidden ? 'sr-only' : '',
      ].join(' ')}
      >
        {label}
      </span>
      <span
        className={[
          'flex h-13 items-center gap-2.5 rounded-xl border px-3.5 py-1.5 text-[var(--nav-muted)] transition',
          active ? 'border-[var(--nav-primary)] bg-white shadow-[0_0_0_3px_var(--nav-focus-ring)]' : 'border-transparent bg-white',
        ].join(' ')}
      >
        {icon}
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-controls={controlsId}
          aria-expanded={expanded}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-muted)]"
          placeholder={placeholder}
        />
      </span>
    </label>
  )
}

function SavedPlaceButtons({
  field,
  places,
  onFillCurrentLocation,
  onSelect,
}: {
  field: SearchFieldId
  places: Place[]
  onFillCurrentLocation?: () => void
  onSelect: (field: SearchFieldId, place: Place) => void
}) {
  const fieldLabel = field === 'origin' ? '출발지' : '도착지'

  return (
    <div
      className={[
        'mt-2 grid gap-2',
        onFillCurrentLocation ? 'grid-cols-3' : 'grid-cols-2',
      ].join(' ')}
      aria-label={`${fieldLabel} 빠른 설정`}
    >
      {onFillCurrentLocation ? (
        <button
          aria-label={`${fieldLabel}를 현재 위치로 설정`}
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-[var(--nav-panel)] px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)]"
          onClick={onFillCurrentLocation}
          type="button"
        >
          <MapPin className="h-4 w-4" weight="bold" />
          <span className="min-w-0 truncate">현재 위치</span>
        </button>
      ) : null}
      {places.map((place) => (
        <button
          aria-label={`${fieldLabel}를 ${formatSavedPlaceDirection(place.name)} 설정`}
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-[var(--nav-panel)] px-3 text-[13px] font-semibold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)]"
          key={`${field}-${place.id}`}
          onClick={() => onSelect(field, place)}
          type="button"
        >
          {place.id === 'saved-home' ? (
            <HouseLine className="h-4 w-4 text-[var(--nav-primary)]" weight="bold" />
          ) : (
            <Buildings className="h-4 w-4 text-[var(--nav-primary)]" weight="bold" />
          )}
          <span className="min-w-0 truncate">{place.name}</span>
        </button>
      ))}
    </div>
  )
}

function formatSavedPlaceDirection(name: string) {
  return name === '회사' ? '회사로' : `${name}으로`
}
