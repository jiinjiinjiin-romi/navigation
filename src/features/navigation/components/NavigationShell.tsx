import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Plyr from 'plyr'
import {
  ArrowBendUpRight,
  ArrowCounterClockwise,
  ArrowUp,
  Article,
  Buildings,
  CaretLeft,
  CaretRight,
  CloudSun,
  Clock,
  CarSimple,
  ClipboardText,
  FileVideo,
  GearSix,
  HouseLine,
  MagnifyingGlass,
  MapPin,
  Minus,
  MusicNotes,
  Play,
  Pause,
  Plus,
  Phone,
  PlugsConnected,
  RoadHorizon,
  SpeakerHigh,
  Stop,
  Timer,
  UploadSimple,
  UserCircle,
  WifiHigh,
  Warning,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { VoiceOrb } from '@/features/orb'
import type { OrbAssistantState, OrbColorTheme } from '@/features/orb'
import {
  createNaviAssistantScenarios,
  getScenarioSpeech,
  startScenarioSpeech,
  type AiaiScenarioId,
  type NaviAssistantRecommendation,
  type NaviAssistantScenario,
  type NaviAssistantStep,
} from '@/features/assistant-scenarios'
import { VoiceWave } from '@/features/voice-wave'
import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentAddress, getRoadMatch, getRouteOptions, searchPlaces } from '../api/tmapApi'
import { createRoundedRoutePath } from '../map/routeGeometry'
import { markRoutePerformance, measureRoutePerformance } from '../performance/routePerformance'
import { createRouteSimulationPlan, getSimulatedRoutePosition } from '../simulation/routeSimulation'
import { getSimulationDurationMs } from '../simulation/simulationTiming'
import type { Coordinate, NavigationRoute, NavigationRouteOption, Place, RoadMatchPoint, RouteManeuver, SafetyAlert } from '../types'
import accidentSignSrc from '../assets/road-signs/141.png'
import bridgeSignSrc from '../assets/road-signs/122.png'
import boxTunnelSignSrc from '../assets/road-signs/130.png'
import cautionSignSrc from '../assets/road-signs/140.png'
import curveSignSrc from '../assets/road-signs/113.png'
import fallingRockSignSrc from '../assets/road-signs/130.png'
import leftManeuverSrc from '../assets/maneuvers/left.png'
import overpassSignSrc from '../assets/road-signs/120.png'
import rightManeuverSrc from '../assets/maneuvers/right.png'
import schoolZoneSignSrc from '../assets/road-signs/133.png'
import sideOverpassSignSrc from '../assets/road-signs/124.png'
import sideUnderpassSignSrc from '../assets/road-signs/123.png'
import tunnelSignSrc from '../assets/road-signs/121.png'
import underpassSignSrc from '../assets/road-signs/119.png'
import { TmapPanel, type MapCameraSettings } from './TmapPanel'

type SearchFieldId = 'origin' | 'destination'
type LocationStatus = 'checking' | 'granted' | 'denied' | 'unsupported'
type SidePanelId = 'settings' | 'report' | 'connect'
type DriverVideoSource = {
  name: string
  type: string
  url: string
}
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
const ROUTE_SEARCH_SUMMARY_FIELDS_HEIGHT = 140
const ROUTE_SEARCH_EDITOR_FIELDS_HEIGHT = 380
const SIDE_PANEL_WIDTH = 320
const MUSIC_POPOVER_WIDTH = 320
const MUSIC_MINI_PLAYER_IDLE_BOTTOM = 136
const MUSIC_MINI_PLAYER_GUIDANCE_BOTTOM = 72
const DEFAULT_MAP_CAMERA_SETTINGS: MapCameraSettings = {
  mode: '2d',
  zoom: 18.3,
  pitch: 0,
}
const MAP_SETTINGS_ZOOM_MIN = 16
const MAP_SETTINGS_ZOOM_MAX = 19
const MAP_SETTINGS_ZOOM_STEP = 0.1
const MAP_SETTINGS_3D_DEFAULT_PITCH = 45
const MAP_SETTINGS_PITCH_MIN = 0
const MAP_SETTINGS_PITCH_MAX = 60
const MAP_SETTINGS_PITCH_STEP = 1
const SIMULATION_UI_UPDATE_INTERVAL_MS = 200
const GUIDANCE_DISTANCE_UPDATE_INTERVAL_MS = 500
const NAVI_ORB_THEME: OrbColorTheme = 'daylight'
const NAVI_ORB_CONTROL_SIZE = 132
const NAVI_ASSISTANT_PANEL_ORB_SIZE = 132
const NAVI_ASSISTANT_CONTENT_REVEAL_DELAY_SECONDS = 0.52
const NAVI_ASSISTANT_TEXT_STAGGER_SECONDS = 0.018
const NAVI_ASSISTANT_USER_WORD_STAGGER_SECONDS = 0.08
const DRIVING_ASSIST_DEBUG_QUERY_PARAM = 'debugSigns'
const DRIVING_ASSIST_DEBUG_SEQUENCE_INTERVAL_MS = 1400
const DEFAULT_CURRENT_LOCATION_PLACE: Place = {
  id: CURRENT_LOCATION_PLACE_ID,
  name: '세종대학교',
  address: '서울 광진구 능동로 209',
  coordinate: { lat: 37.5502, lng: 127.073 },
}
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
const MUSIC_LIBRARY = [
  {
    id: 'drive-neon',
    title: 'Drive Neon',
    artist: 'Navi Session',
    mood: '도심 주행',
  },
  {
    id: 'soft-focus',
    title: 'Soft Focus',
    artist: 'Evening Route',
    mood: '집중 모드',
  },
  {
    id: 'night-line',
    title: 'Night Line',
    artist: 'Low Tide',
    mood: '야간 드라이브',
  },
] as const
type NaviAssistantScenarioId = AiaiScenarioId
const NAVI_ASSISTANT_SCENARIOS: NaviAssistantScenario[] = createNaviAssistantScenarios()
const DRIVER_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/3gp',
  'video/ogg',
  'video/avi',
  'video/mpeg',
  'video/object',
])

export function isAssistantPlaybackReady(playbackKey: string, expectedPlaybackKey: string) {
  return Boolean(playbackKey) && playbackKey === expectedPlaybackKey
}

function getDriverVideoMimeType(file: File) {
  if (DRIVER_VIDEO_MIME_TYPES.has(file.type)) {
    return file.type
  }

  const extension = file.name.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'webm':
      return 'video/webm'
    case '3gp':
    case '3gpp':
      return 'video/3gp'
    case 'ogv':
    case 'ogg':
      return 'video/ogg'
    case 'avi':
      return 'video/avi'
    case 'mpeg':
    case 'mpg':
      return 'video/mpeg'
    default:
      return 'video/mp4'
  }
}

export function getAssistantSpeechCharacterDelaySeconds(index: number) {
  return index * NAVI_ASSISTANT_TEXT_STAGGER_SECONDS
}

export function getAssistantVisibleOrbState(
  assistantStep: Pick<NaviAssistantStep, 'orbState' | 'speechRole'>,
  playbackKey: string,
): OrbAssistantState {
  if (assistantStep.orbState === 'speaking' && assistantStep.speechRole === 'agent' && !playbackKey) {
    return 'thinking'
  }

  return assistantStep.orbState
}

export function isAssistantVoiceWaveVisible(
  assistantStep: Pick<NaviAssistantStep, 'orbState' | 'speechRole' | 'statusLabel'>,
  playbackKey: string,
) {
  return getAssistantVisibleOrbState(assistantStep, playbackKey) === 'speaking' && !assistantStep.statusLabel
}

const DEBUG_DRIVING_ASSIST_SEQUENCE = ([
  {
    alert: {
      type: 'caution',
      label: '어린이보호구역',
      distanceLabel: '40m',
      schoolZone: true,
      active: false,
    },
  },
  { speedLimitKph: 30 },
  {
    alert: {
      type: 'enforcement',
      label: '단속구간',
      distanceLabel: '80m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'curve',
      label: '급커브',
      distanceLabel: '120m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'falling-rock',
      label: '낙석주의',
      distanceLabel: '180m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'accident',
      label: '사고주의',
      distanceLabel: '240m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'caution',
      label: '주의',
      distanceLabel: '300m',
      schoolZone: false,
      active: false,
    },
  },
  {
    facility: {
      type: 'underpass',
      label: '지하차도',
      distanceLabel: '120m',
      signCode: 119,
    },
  },
  {
    facility: {
      type: 'overpass',
      label: '고가도로',
      distanceLabel: '100m',
      signCode: 120,
    },
  },
  {
    facility: {
      type: 'tunnel',
      label: '터널',
      distanceLabel: '80m',
      signCode: 121,
    },
  },
  {
    facility: {
      type: 'bridge',
      label: '교량',
      distanceLabel: '70m',
      signCode: 122,
    },
  },
  {
    facility: {
      type: 'side-underpass',
      label: '지하차도 옆차로',
      distanceLabel: '60m',
      signCode: 123,
    },
  },
  {
    facility: {
      type: 'side-overpass',
      label: '고가도로 옆차로',
      distanceLabel: '50m',
      signCode: 124,
    },
  },
  {
    facility: {
      type: 'box-tunnel',
      label: '토끼굴',
      distanceLabel: '40m',
      signCode: 130,
    },
  },
] satisfies DrivingAssistInfo[]).map((assist) => ({ speedLimitKph: 30, ...assist }))

export function NavigationShell() {
  const shouldReduceMotion = useReducedMotion()
  const [now, setNow] = useState(() => new Date())
  const [originKeyword, setOriginKeyword] = useState(DEFAULT_CURRENT_LOCATION_PLACE.name)
  const [destinationKeyword, setDestinationKeyword] = useState('')
  const [origin, setOrigin] = useState<Place | undefined>(DEFAULT_CURRENT_LOCATION_PLACE)
  const [destination, setDestination] = useState<Place>()
  const [currentPosition, setCurrentPosition] = useState<Coordinate>(DEFAULT_CURRENT_LOCATION_PLACE.coordinate)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('checking')
  const [activeField, setActiveField] = useState<SearchFieldId | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [routeSearchOpen, setRouteSearchOpen] = useState(false)
  const [routeOptionsSearchReady, setRouteOptionsSearchReady] = useState(false)
  const [routeOptionsOverlayReady, setRouteOptionsOverlayReady] = useState(false)
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string>()
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelId | null>(null)
  const [musicModalOpen, setMusicModalOpen] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicTrackId, setMusicTrackId] = useState<(typeof MUSIC_LIBRARY)[number]['id']>(MUSIC_LIBRARY[0].id)
  const [musicSearchKeyword, setMusicSearchKeyword] = useState('')
  const [assistantScenarioId, setAssistantScenarioId] = useState<NaviAssistantScenarioId>('drowsiness-rest-area')
  const [assistantStepIndex, setAssistantStepIndex] = useState(0)
  const [driverVideo, setDriverVideo] = useState<DriverVideoSource | null>(null)
  const [driverVideoError, setDriverVideoError] = useState(false)
  const [speechPlaybackKey, setSpeechPlaybackKey] = useState('')
  const [showLocationFallbackToast, setShowLocationFallbackToast] = useState(false)
  const [mapCameraSettings, setMapCameraSettings] = useState<MapCameraSettings>(DEFAULT_MAP_CAMERA_SETTINGS)
  const updateMapCameraSettings = useCallback((settings: Partial<MapCameraSettings>) => {
    setMapCameraSettings((currentSettings) => {
      const nextSettings = getNextMapCameraSettings(currentSettings, settings)

      return isSameMapCameraSettings(currentSettings, nextSettings)
        ? currentSettings
        : nextSettings
    })
  }, [])
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simulationPosition, setSimulationPosition] = useState<Coordinate>()
  const [simulationRemainingDistance, setSimulationRemainingDistance] = useState(0)
  const [simulationRemainingDuration, setSimulationRemainingDuration] = useState(0)
  const [guidanceDistanceUpdateKey, setGuidanceDistanceUpdateKey] = useState(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const simulationStartedAtRef = useRef<number | undefined>(undefined)
  const simulationLastUiUpdateAtRef = useRef<number | undefined>(undefined)
  const simulationSkipInitialFrameWorkRef = useRef(false)
  const simulationSkipInitialUiUpdateRef = useRef(false)
  const simulationFrameRendererRef = useRef<((position: Coordinate, options?: { skipCamera?: boolean; skipRouteLineHead?: boolean }) => void) | undefined>(undefined)
  const guidanceDistanceDisplayRef = useRef<GuidanceDistanceDisplayStore>(new Map())
  const routeSelectionCameraSettingsRef = useRef<MapCameraSettings | undefined>(undefined)
  const routeSearchEditorTimerRef = useRef<number | undefined>(undefined)
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
  const currentRoadMatchCoordinates = useMemo(
    () => currentPosition ? createCurrentRoadMatchCoordinates(currentPosition) : undefined,
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

  const routeOptionsQuery = useQuery({
    queryKey: [
      'route-options',
      origin?.id,
      origin?.coordinate.lat,
      origin?.coordinate.lng,
      destination?.id,
      destination?.coordinate.lat,
      destination?.coordinate.lng,
    ],
    queryFn: async ({ signal }) => {
      markRoutePerformance('route-options-query-start')
      const options = await getRouteOptions(origin!.coordinate, destination!.coordinate, undefined, signal)
      markRoutePerformance('route-options-query-end')
      measureRoutePerformance('route-options-query-total', 'route-options-query-start', 'route-options-query-end')
      return options
    },
    enabled: Boolean(origin && destination && routeOptionsSearchReady) && !selectedRouteOptionId,
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

  const selectedRouteOption = useMemo(() => (
    routeOptionsQuery.data?.find((option) => option.id === selectedRouteOptionId)
  ), [routeOptionsQuery.data, selectedRouteOptionId])
  const activeRoute = useMemo(() => {
    const route = selectedRouteOption?.route

    if (!route) {
      return undefined
    }

    return {
      ...route,
      coordinates: createRoundedRoutePath(route.coordinates),
    }
  }, [selectedRouteOption?.route])
  const activeRouteSimulationPlan = useMemo(
    () => activeRoute ? createRouteSimulationPlan(activeRoute) : undefined,
    [activeRoute],
  )
  const routeSelectionMode = Boolean(origin && destination && !selectedRouteOptionId)
  const routeSelectionModeRef = useRef(routeSelectionMode)
  const hasRouteSearchDraftMismatch = routeSelectionMode && routeSearchOpen && (
    isRouteKeywordDraftMismatched(originKeyword, origin) ||
    isRouteKeywordDraftMismatched(destinationKeyword, destination)
  )
  const routeOptions = routeSelectionMode && !hasRouteSearchDraftMismatch
    ? routeOptionsQuery.data ?? []
    : undefined
  const routeOptionsReady = Boolean(routeOptions?.length && routeOptionsOverlayReady)
  const visibleRouteOptions = routeOptionsReady ? routeOptions : []
  const routeOptionsLoading = routeSelectionMode &&
    !hasRouteSearchDraftMismatch &&
    !routeOptionsReady &&
    (
      !routeOptionsSearchReady ||
      routeOptionsQuery.isFetching ||
      Boolean(routeOptions?.length)
    )
  const [previewRouteOptionId, setPreviewRouteOptionId] = useState<string | undefined>(undefined)
  const activeRouteOptionId = useMemo(() => (
    routeOptions?.some((option) => option.id === previewRouteOptionId)
      ? previewRouteOptionId
      : getDefaultRouteOptionId(routeOptions ?? [])
  ), [previewRouteOptionId, routeOptions])
  const roadMatchQuery = useQuery({
    queryKey: ['road-match', selectedRouteOptionId, activeRoute?.coordinates.length],
    queryFn: ({ signal }) => getRoadMatch(activeRoute!.coordinates, undefined, signal),
    enabled: Boolean(activeRoute?.coordinates.length),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const currentRoadMatchQuery = useQuery({
    queryKey: [
      'current-road-match',
      currentRoadMatchCoordinates?.[0].lat,
      currentRoadMatchCoordinates?.[0].lng,
    ],
    queryFn: ({ signal }) => getRoadMatch(currentRoadMatchCoordinates!, undefined, signal),
    enabled: Boolean(currentRoadMatchCoordinates) && !activeRoute,
    staleTime: 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    guidanceDistanceDisplayRef.current.clear()
  }, [activeRoute])
  useEffect(() => {
    if (!routeOptions?.some((option) => option.id === previewRouteOptionId)) {
      setPreviewRouteOptionId(undefined)
    }
  }, [previewRouteOptionId, routeOptions])
  useEffect(() => {
    routeSelectionModeRef.current = routeSelectionMode
  }, [routeSelectionMode])
  useEffect(() => {
    if (!routeSelectionMode || hasRouteSearchDraftMismatch) {
      setRouteOptionsSearchReady(false)
      return
    }

    setRouteOptionsSearchReady(false)
    markRoutePerformance('route-options-schedule')
    const timerId = window.setTimeout(() => {
      markRoutePerformance('route-options-query-enabled')
      measureRoutePerformance('route-options-schedule-delay', 'route-options-schedule', 'route-options-query-enabled')
      setRouteOptionsSearchReady(true)
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    destination?.coordinate.lat,
    destination?.coordinate.lng,
    destination?.id,
    hasRouteSearchDraftMismatch,
    origin?.coordinate.lat,
    origin?.coordinate.lng,
    origin?.id,
    routeSelectionMode,
  ])
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
    ?? (locationStatus === 'granted' ? 'GPS 위치' : DEFAULT_CURRENT_LOCATION_PLACE.name)
  const currentOriginLabel = locationStatus === 'granted'
    ? currentLocationLabel
    : DEFAULT_CURRENT_LOCATION_PLACE.name
  const destinationStatusLabel = destination?.address || destination?.name || '목적지'
  const weatherLabel = weatherQuery.data ?? (weatherQuery.isError ? '정보 없음' : '확인 중')
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
    : getDrivingAssistInfo({
        position: currentPosition,
        roadMatches: currentRoadMatchQuery.data ?? [],
        travelledDistanceMeters: 0,
      })
  const debugDrivingAssist = useDrivingAssistDebugSequence(Boolean(activeRoute))
  const maneuverGuidance = activeRoute
    ? getManeuverGuidance(
      activeRoute,
      travelledDistanceMeters,
      guidanceDistanceDisplayRef.current,
      simulationRunning ? guidanceDistanceUpdateKey : undefined,
    )
    : undefined
  const activePlaces = activeField === 'origin'
    ? originSearch.data ?? []
    : activeField === 'destination'
      ? destinationSearch.data ?? []
      : []
  const activeLabel = activeField === 'origin' ? '출발지 검색 결과' : '도착지 검색 결과'
  const showSuggestions = Boolean(activeField && activePlaces.length > 0)
  const assistantScenario = useMemo(
    () => NAVI_ASSISTANT_SCENARIOS.find((scenario) => scenario.id === assistantScenarioId) ?? NAVI_ASSISTANT_SCENARIOS[0],
    [assistantScenarioId],
  )
  const assistantStep = assistantScenario.steps[
    Math.min(assistantStepIndex, assistantScenario.steps.length - 1)
  ]
  const clampedAssistantStepIndex = Math.min(assistantStepIndex, assistantScenario.steps.length - 1)
  const assistantSpeech = useMemo(
    () => getScenarioSpeech(assistantScenario.id, clampedAssistantStepIndex),
    [assistantScenario.id, clampedAssistantStepIndex],
  )
  const expectedSpeechPlaybackKey = assistantSpeech?.key ?? `${assistantScenario.id}-${clampedAssistantStepIndex}-visual`
  const activeSpeechPlaybackKey = isAssistantPlaybackReady(speechPlaybackKey, expectedSpeechPlaybackKey)
    ? speechPlaybackKey
    : ''
  const motionTiming = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: PRODUCT_EASE }
  const navigationViewportClassName = [
    'relative col-start-1 row-start-2 h-full min-h-0 overflow-hidden rounded-[1.1rem] border border-white/70 bg-[var(--nav-frame)] shadow-[0_18px_46px_rgb(15_23_42/0.24)] ring-1 ring-[rgb(148_163_184/0.18)]',
  ].join(' ')

  useEffect(() => () => {
    if (driverVideo?.url) {
      URL.revokeObjectURL(driverVideo.url)
    }
  }, [driverVideo?.url])

  const selectDriverVideo = useCallback((file: File) => {
    setDriverVideo({
      name: file.name,
      type: getDriverVideoMimeType(file),
      url: URL.createObjectURL(file),
    })
    setDriverVideoError(false)
  }, [])

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
          name: 'GPS 위치',
          address: 'GPS 위치',
          coordinate,
        }

        setCurrentPosition(coordinate)
        setOrigin((selectedOrigin) => (
          !selectedOrigin || selectedOrigin.id === CURRENT_LOCATION_PLACE_ID
            ? currentPlace
            : selectedOrigin
        ))
        setOriginKeyword((keyword) => (
          !keyword || keyword === DEFAULT_CURRENT_LOCATION_PLACE.name
            ? currentPlace.name
            : keyword
        ))
        setLocationStatus('granted')
      },
      () => {
        setCurrentPosition(DEFAULT_CURRENT_LOCATION_PLACE.coordinate)
        setOrigin((selectedOrigin) => (
          !selectedOrigin || selectedOrigin.id === CURRENT_LOCATION_PLACE_ID
            ? DEFAULT_CURRENT_LOCATION_PLACE
            : selectedOrigin
        ))
        setOriginKeyword((keyword) => keyword || DEFAULT_CURRENT_LOCATION_PLACE.name)
        setLocationStatus('denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      },
    )
  }, [])

  const selectAssistantScenario = useCallback((scenarioId: NaviAssistantScenarioId) => {
    setAssistantScenarioId(scenarioId)
    setAssistantStepIndex(0)
  }, [])

  const moveAssistantScenarioStep = useCallback((direction: -1 | 1) => {
    setAssistantStepIndex((currentIndex) => clamp(
      currentIndex + direction,
      0,
      assistantScenario.steps.length - 1,
    ))
  }, [assistantScenario.steps.length])

  const resetAssistantScenario = useCallback(() => {
    setAssistantStepIndex(0)
  }, [])

  useEffect(() => {
    setSpeechPlaybackKey('')

    if (!assistantSpeech) {
      setSpeechPlaybackKey(expectedSpeechPlaybackKey)
      return
    }

    return startScenarioSpeech({
      ...assistantSpeech,
      onStart: ({ key }) => setSpeechPlaybackKey(key),
    })
  }, [assistantSpeech, expectedSpeechPlaybackKey])

  useEffect(() => {
    if (locationStatus === 'granted') {
      setShowLocationFallbackToast(false)
      return
    }

    setShowLocationFallbackToast(true)
    const timer = window.setTimeout(() => {
      setShowLocationFallbackToast(false)
    }, 5_000)

    return () => window.clearTimeout(timer)
  }, [locationStatus])

  const openSidePanel = useCallback((panel: SidePanelId) => {
    setMusicModalOpen(false)
    setActiveSidePanel((current) => (current === panel ? null : panel))
  }, [])

  const toggleMusicModal = useCallback(() => {
    setActiveSidePanel(null)
    setMusicModalOpen((open) => !open)
  }, [])

  const clearPendingRouteSearchEditor = useCallback(() => {
    if (routeSearchEditorTimerRef.current !== undefined) {
      window.clearTimeout(routeSearchEditorTimerRef.current)
      routeSearchEditorTimerRef.current = undefined
    }
  }, [])

  const openRouteSearchEditor = useCallback((field: SearchFieldId) => {
    clearPendingRouteSearchEditor()
    setRouteSearchOpen(true)
    setActiveField(null)
    setHighlightedIndex(0)
    routeSearchEditorTimerRef.current = window.setTimeout(() => {
      routeSearchEditorTimerRef.current = undefined
      setActiveField(field)
    }, 40)
  }, [clearPendingRouteSearchEditor])

  useEffect(() => () => {
    clearPendingRouteSearchEditor()
  }, [clearPendingRouteSearchEditor])

  useEffect(() => {
    requestCurrentLocation()
  }, [requestCurrentLocation])

  useEffect(() => {
    if (locationStatus !== 'granted' || origin?.id !== CURRENT_LOCATION_PLACE_ID || !currentPosition) {
      return
    }

    const nextLabel = currentOriginLabel

    if (origin.name === nextLabel && origin.address === nextLabel) {
      return
    }

    setOrigin({
      ...origin,
      name: nextLabel,
      address: nextLabel,
      coordinate: currentPosition,
    })
    setOriginKeyword((keyword) => (
      keyword === origin.name || keyword === '현재 위치' || keyword === 'GPS 위치'
        ? nextLabel
        : keyword
    ))
  }, [currentOriginLabel, currentPosition, locationStatus, origin])

  const fillOriginWithCurrentLocation = useCallback(() => {
    if (!currentPosition) {
      requestCurrentLocation()
      return
    }

    const currentPlace: Place = {
      id: CURRENT_LOCATION_PLACE_ID,
      name: currentOriginLabel,
      address: currentLocationLabel,
      coordinate: currentPosition,
    }

    setOrigin(currentPlace)
    setOriginKeyword(currentPlace.name)
    setActiveField(null)
    setHighlightedIndex(0)
    setRouteSearchOpen(true)
  }, [currentLocationLabel, currentOriginLabel, currentPosition, requestCurrentLocation])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  const restoreRouteSelectionCameraSettings = useCallback(() => {
    const previousSettings = routeSelectionCameraSettingsRef.current
    if (!previousSettings) {
      return
    }

    routeSelectionCameraSettingsRef.current = undefined
    setMapCameraSettings(previousSettings)
  }, [])

  useEffect(() => {
    if (!routeSelectionMode) {
      restoreRouteSelectionCameraSettings()
      return
    }

    setActiveSidePanel(null)
    setMusicModalOpen(false)
    setRouteSearchOpen(false)
    setActiveField(null)
    setHighlightedIndex(0)
    setMapCameraSettings((currentSettings) => {
      if (!routeSelectionCameraSettingsRef.current) {
        routeSelectionCameraSettingsRef.current = currentSettings
      }

      const nextSettings = {
        ...currentSettings,
        mode: '2d' as const,
        pitch: 0,
      }

      return isSameMapCameraSettings(currentSettings, nextSettings)
        ? currentSettings
        : nextSettings
    })
  }, [restoreRouteSelectionCameraSettings, routeSelectionMode])

  const selectRouteOption = useCallback((optionId: string) => {
    setSelectedRouteOptionId(optionId)
    guidanceDistanceDisplayRef.current.clear()
    restoreRouteSelectionCameraSettings()
  }, [restoreRouteSelectionCameraSettings])

  useEffect(() => {
    if (
      routeSelectionMode &&
      !hasRouteSearchDraftMismatch &&
      !routeOptionsQuery.isFetching &&
      routeOptionsReady &&
      routeOptions?.length === 1
    ) {
      selectRouteOption(routeOptions[0].id)
    }
  }, [
    hasRouteSearchDraftMismatch,
    routeOptions,
    routeOptionsReady,
    routeOptionsQuery.isFetching,
    routeSelectionMode,
    selectRouteOption,
  ])

  const selectPlace = (field: SearchFieldId, place: Place) => {
    stopSimulation()
    setSelectedRouteOptionId(undefined)
    setSimulationPosition(undefined)
    setSimulationRemainingDistance(0)
    setSimulationRemainingDuration(0)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()

    if (field === 'origin') {
      setOrigin(place)
      setOriginKeyword(place.name)
    } else {
      setDestination(place)
      setDestinationKeyword(place.name)
      setRouteSearchOpen(false)
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
    if (!route?.coordinates.length) {
      return
    }

    setSimulationRemainingDistance(route.summary.distanceMeters)
    setSimulationRemainingDuration(route.summary.durationSeconds)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()
    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    simulationSkipInitialFrameWorkRef.current = true
    simulationSkipInitialUiUpdateRef.current = true
    setSimulationRunning(true)
  }

  const stopSimulation = useCallback(() => {
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }

    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    simulationSkipInitialFrameWorkRef.current = false
    simulationSkipInitialUiUpdateRef.current = false
    setSimulationRunning(false)
  }, [])

  const endGuidance = useCallback(() => {
    stopSimulation()
    setSimulationPosition(undefined)
    setSimulationRemainingDistance(0)
    setSimulationRemainingDuration(0)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()
    setSelectedRouteOptionId(undefined)
    setDestination(undefined)
    setDestinationKeyword('')
    setActiveField(null)
    setHighlightedIndex(0)
    setRouteSearchOpen(false)
  }, [stopSimulation])

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
      const skipInitialUiUpdate = simulationSkipInitialUiUpdateRef.current
      if (skipInitialUiUpdate) {
        simulationFrameRendererRef.current?.(simulationPlan.coordinates[0] ?? route.coordinates[0], {
          skipCamera: true,
          skipRouteLineHead: true,
        })
        simulationStartedAtRef.current = timestamp
        simulationSkipInitialUiUpdateRef.current = false
        simulationSkipInitialFrameWorkRef.current = false
        simulationLastUiUpdateAtRef.current = timestamp
        animationFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      if (simulationStartedAtRef.current === undefined) {
        simulationStartedAtRef.current = timestamp
      }
      const elapsed = timestamp - simulationStartedAtRef.current
      const progress = getSimulatedRoutePosition(simulationPlan, elapsed / simulationDurationMs)
      const skipInitialFrameWork = simulationSkipInitialFrameWorkRef.current
      simulationFrameRendererRef.current?.(progress.coordinate, {
        skipCamera: skipInitialFrameWork,
        skipRouteLineHead: skipInitialFrameWork,
      })
      const shouldUpdateUiState = !skipInitialUiUpdate && (
        progress.completed ||
        simulationLastUiUpdateAtRef.current === undefined ||
        timestamp - simulationLastUiUpdateAtRef.current >= SIMULATION_UI_UPDATE_INTERVAL_MS
      )

      if (shouldUpdateUiState) {
        setSimulationPosition(progress.coordinate)
        setSimulationRemainingDistance(progress.remainingDistanceMeters)
        setSimulationRemainingDuration(progress.remainingDurationSeconds)
        setGuidanceDistanceUpdateKey(Math.floor(elapsed / GUIDANCE_DISTANCE_UPDATE_INTERVAL_MS))
        simulationLastUiUpdateAtRef.current = timestamp
        simulationSkipInitialFrameWorkRef.current = false
      }

      if (progress.completed) {
        setSimulationRunning(false)
        animationFrameRef.current = undefined
        simulationLastUiUpdateAtRef.current = undefined
        simulationSkipInitialFrameWorkRef.current = false
        simulationSkipInitialUiUpdateRef.current = false
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
      className="grid h-screen min-h-0 grid-cols-[minmax(0,1fr)_24rem] grid-rows-[minmax(17rem,38vh)_minmax(0,1fr)] gap-3 bg-[#06080c] p-3"
    >
      <DriverVideoPanel
        error={driverVideoError}
        fileName={driverVideo?.name}
        motionTiming={motionTiming}
        source={driverVideo ?? undefined}
        onError={() => setDriverVideoError(true)}
        onSelectVideo={selectDriverVideo}
      />
      <section
        data-testid="navigation-viewport"
        className={navigationViewportClassName}
      >
        <div
          data-testid="navigation-content-region"
          className={[
            'relative h-full min-w-0 overflow-hidden',
            'w-full',
          ].join(' ')}
        >
            <TmapPanel
              cameraSettings={mapCameraSettings}
              currentPosition={currentPosition}
              route={activeRoute}
              routeOptions={routeOptions}
              routeSelectionMode={routeSelectionMode}
              origin={origin}
              destination={destination}
              simulationPosition={simulationPosition}
              activeRouteOptionId={activeRouteOptionId}
              onCameraSettingsChange={updateMapCameraSettings}
              onRouteOptionsOverlayReady={setRouteOptionsOverlayReady}
              onRouteOptionPreviewChange={setPreviewRouteOptionId}
              onSimulationFrameRendererReady={(renderFrame) => {
                simulationFrameRendererRef.current = renderFrame
              }}
              onRequestLocation={requestCurrentLocation}
            />
            <NaviOrbControl
              assistantStep={assistantStep}
              hidden={Boolean(activeSidePanel || musicModalOpen)}
              motionTiming={motionTiming}
              onClose={resetAssistantScenario}
              onWakeCall={() => {
                selectAssistantScenario('route-search-voice')
                setAssistantStepIndex(1)
              }}
              reducedMotion={Boolean(shouldReduceMotion)}
              speechPlaybackKey={activeSpeechPlaybackKey}
            />
            {!activeRoute ? (
              <>
                {!routeSelectionMode ? (
                  <IdleMapControls
                    motionTiming={motionTiming}
                    searchOpen={routeSearchOpen}
                    showFallbackToast={showLocationFallbackToast}
                    onOpenSearch={() => openRouteSearchEditor('destination')}
                    onOpenSettings={() => openSidePanel('settings')}
                  />
                ) : (
                  <RouteSelectionSummary
                    destinationLabel={destination?.name || destinationKeyword || '목적지'}
                    error={routeOptionsQuery.isError}
                    loading={routeOptionsLoading}
                    motionTiming={motionTiming}
                    optionCount={routeOptions?.length ?? 0}
                    originLabel={origin?.name || originKeyword || currentOriginLabel}
                    activeRouteOptionId={activeRouteOptionId}
                    routeOptions={visibleRouteOptions ?? []}
                    onEditRoute={() => {
                      openRouteSearchEditor('destination')
                    }}
                    onPreviewRouteOption={setPreviewRouteOptionId}
                    onSelectRouteOption={selectRouteOption}
                  />
                )}
                <AnimatePresence initial={false}>
                  {routeSelectionMode && routeOptionsLoading ? (
                    <RouteSearchLoadingModal
                      motionTiming={motionTiming}
                      reducedMotion={Boolean(shouldReduceMotion)}
                    />
                  ) : null}
                </AnimatePresence>
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
                        if (!routeSelectionModeRef.current) {
                          setOrigin(undefined)
                        }
                        setActiveField('origin')
                        setHighlightedIndex(0)
                      }}
                      onChangeDestination={(value) => {
                        setDestinationKeyword(value)
                        if (!routeSelectionModeRef.current) {
                          setDestination(undefined)
                        }
                        setActiveField('destination')
                        setHighlightedIndex(0)
                      }}
                      onClose={() => {
                        clearPendingRouteSearchEditor()
                        if (routeSelectionMode) {
                          setDestination(undefined)
                          setDestinationKeyword('')
                          setSelectedRouteOptionId(undefined)
                          guidanceDistanceDisplayRef.current.clear()
                        }
                        setRouteSearchOpen(false)
                        setActiveField(null)
                      }}
                      onBackToSummary={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField(null)
                        setHighlightedIndex(0)
                      }}
                      onFocusOrigin={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField('origin')
                      }}
                      onFocusDestination={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField('destination')
                      }}
                      onKeyDown={(field, event) => handleSearchKeyDown(field, event)}
                      onSelectPlace={selectPlace}
                      onSelectSavedPlace={selectSavedPlace}
                      onFillOriginWithCurrentLocation={fillOriginWithCurrentLocation}
                    />
                  ) : null}
                </AnimatePresence>
                {debugDrivingAssist ?? drivingAssist ? (
                  <DrivingAssistOverlay
                    assist={(debugDrivingAssist ?? drivingAssist)!}
                    motionTiming={motionTiming}
                  />
                ) : null}
              </>
            ) : (
              <DrivingHud
                assist={debugDrivingAssist ?? drivingAssist}
                guidance={maneuverGuidance}
                motionTiming={motionTiming}
                simulationRunning={simulationRunning}
                onToggleSimulation={simulationRunning ? stopSimulation : startSimulation}
                onEndGuidance={endGuidance}
              />
            )}

            <BottomStatusBar
              arrivalLabel={arrivalLabel}
              currentLocationLabel={currentLocationLabel}
              currentTimeLabel={currentTimeLabel}
              destinationLabel={destinationStatusLabel}
              distanceLabel={drivingDistance}
              durationLabel={`${routeMinutes}분`}
              hasRoute={Boolean(activeRoute)}
              motionTiming={motionTiming}
              weatherLabel={weatherLabel}
            />
            <MiniPlayer
              activeRoute={Boolean(activeRoute)}
              motionTiming={motionTiming}
              musicPlaying={musicPlaying}
              selectedTrack={MUSIC_LIBRARY.find((track) => track.id === musicTrackId) ?? MUSIC_LIBRARY[0]}
              onClose={() => setMusicPlaying(false)}
              onTogglePlay={() => setMusicPlaying((playing) => !playing)}
            />

            <motion.div
              data-testid="navigation-overlays"
              className="pointer-events-none absolute inset-0 z-30"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTiming}
            >
              <AppIconDock
                activeSidePanel={activeSidePanel}
                className={[
                  'absolute bottom-[43px] z-40 transition-[right] max-sm:bottom-[37px]',
                  motionTiming.duration === 0
                    ? 'duration-0'
                    : 'duration-[340ms] ease-[cubic-bezier(0.34,0,0.2,1)]',
                  activeSidePanel
                    ? 'right-[320px] max-sm:right-[min(20rem,calc(100vw-4rem))]'
                    : 'right-0',
                ].join(' ')}
                motionTiming={motionTiming}
                onOpenSettings={() => openSidePanel('settings')}
                onOpenReport={() => openSidePanel('report')}
                onOpenConnect={() => openSidePanel('connect')}
                onToggleMusic={toggleMusicModal}
                settingsDisabled={routeSelectionMode}
                musicModalOpen={musicModalOpen}
              />

              <AnimatePresence initial={false} mode="wait">
                {musicModalOpen ? (
                  <MusicPopover
                    motionTiming={motionTiming}
                    musicSearchKeyword={musicSearchKeyword}
                    musicPlaying={musicPlaying}
                    selectedTrack={MUSIC_LIBRARY.find((track) => track.id === musicTrackId) ?? MUSIC_LIBRARY[0]}
                    onClose={() => setMusicModalOpen(false)}
                    onPickTrack={(trackId) => setMusicTrackId(trackId)}
                    onSearchKeywordChange={setMusicSearchKeyword}
                    onStartPlayback={() => {
                      setMusicPlaying(true)
                      setMusicModalOpen(false)
                    }}
                  />
                ) : null}
              </AnimatePresence>
            </motion.div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {activeSidePanel ? (
            <SideDrawerPanel
              cameraSettings={mapCameraSettings}
              currentLocationLabel={currentLocationLabel}
              locationStatus={locationStatus}
              motionTiming={motionTiming}
              panel={activeSidePanel}
              onChangeCameraSettings={updateMapCameraSettings}
              onClose={() => setActiveSidePanel(null)}
              onRequestCurrentLocation={requestCurrentLocation}
            />
          ) : null}
        </AnimatePresence>
      </section>
      <NaviAssistantDebugPanel
        motionTiming={motionTiming}
        scenario={assistantScenario}
        scenarioId={assistantScenarioId}
        stepIndex={assistantStepIndex}
        onNext={() => moveAssistantScenarioStep(1)}
        onPrevious={() => moveAssistantScenarioStep(-1)}
        onReset={resetAssistantScenario}
        onSelectScenario={selectAssistantScenario}
      />
    </main>
  )
}

function DriverVideoPanel({
  error,
  fileName,
  motionTiming,
  source,
  onError,
  onSelectVideo,
}: {
  error: boolean
  fileName?: string
  motionTiming: MotionTiming
  source?: DriverVideoSource
  onError: () => void
  onSelectVideo: (file: File) => void
}) {
  const videoInputId = 'driver-video-file-input'
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!source || !videoRef.current) {
      return undefined
    }

    const player = new Plyr(videoRef.current, {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'fullscreen',
      ],
      settings: ['speed'],
      speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.25, 1.5, 2],
      },
    })

    return () => {
      player.destroy()
    }
  }, [source])

  const openVideoFilePicker = useCallback(() => {
    videoInputRef.current?.click()
  }, [])

  return (
    <motion.section
      aria-label="운전자 영상"
      className="driver-video-player-surface relative col-start-1 row-start-1 flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[1.1rem] border border-white/10 bg-black text-white shadow-[0_18px_46px_rgb(0_0_0/0.28)]"
      data-testid="driver-video-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => {
        if (!source) {
          openVideoFilePicker()
        }
      }}
      transition={motionTiming}
    >
      {source ? (
        <video
          key={source.url}
          ref={videoRef}
          className="h-full w-full bg-black object-contain [--plyr-color-main:#2563eb] [--plyr-control-radius:0.55rem] [--plyr-video-background:#000]"
          controls
          data-testid="driver-video-player"
          onClick={(event) => event.stopPropagation()}
          onError={onError}
          playsInline
          title={fileName ?? '운전자 영상'}
        >
          <source src={source.url} type={source.type} />
        </video>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-white/10 text-white">
            <FileVideo className="size-7" weight="duotone" />
          </div>
          <div>
            <p className="text-base font-bold">운전자 영상을 선택하세요</p>
            <p className="mt-1 text-sm font-medium text-white/62">
              로컬 영상 파일은 브라우저에서만 재생됩니다.
            </p>
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-black/58 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
        <span className="min-w-0 truncate">{fileName ?? '선택된 영상 없음'}</span>
        {error ? <span className="shrink-0 text-[#fda4af]">재생 오류</span> : null}
      </div>

      <input
        accept="video/*"
        aria-label="운전자 영상 파일 선택"
        className="sr-only"
        id={videoInputId}
        ref={videoInputRef}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) {
            onSelectVideo(file)
            event.currentTarget.value = ''
          }
        }}
        type="file"
      />
      {!source ? (
        <label
          className="absolute right-4 top-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#101828] shadow-[0_8px_18px_rgb(0_0_0/0.18)] transition hover:bg-[#eef2ff] focus-within:ring-2 focus-within:ring-white/70"
          htmlFor={videoInputId}
          onClick={(event) => event.stopPropagation()}
        >
          <UploadSimple className="size-4" weight="bold" />
          <span>영상 선택</span>
          <span className="sr-only">운전자 영상 파일 선택</span>
        </label>
      ) : null}
    </motion.section>
  )
}

function NaviOrbControl({
  assistantStep,
  hidden,
  motionTiming,
  onClose,
  onWakeCall,
  reducedMotion,
  speechPlaybackKey,
}: {
  assistantStep: NaviAssistantStep
  hidden: boolean
  motionTiming: MotionTiming
  onClose: () => void
  onWakeCall: () => void
  reducedMotion: boolean
  speechPlaybackKey: string
}) {
  if (hidden) {
    return null
  }

  const expanded = assistantStep.mode !== 'idle'
  const visibleOrbState = getAssistantVisibleOrbState(assistantStep, speechPlaybackKey)
  const showVoiceWave = isAssistantVoiceWaveVisible(assistantStep, speechPlaybackKey)
  const contentRevealDelay = assistantStep.text || assistantStep.userText
    ? 0
    : NAVI_ASSISTANT_CONTENT_REVEAL_DELAY_SECONDS

  return (
    <motion.div
      aria-label="Navi AI 에이전트"
      className={[
        'pointer-events-none absolute right-6 top-6 z-40 text-center text-[var(--nav-ink)] max-sm:right-3 max-sm:top-3',
        'overflow-visible',
      ].join(' ')}
      data-testid={expanded ? 'navi-assistant-panel' : undefined}
      initial={false}
      animate={{
        borderRadius: expanded ? 20 : 999,
        height: expanded
          ? assistantStep.recommendations?.length ? 520 : 328
          : 132,
        opacity: 1,
        width: expanded
          ? assistantStep.recommendations?.length
            ? 'min(22.25rem, calc(100vw - 2rem))'
            : 'min(20.75rem, calc(100vw - 2rem))'
          : 'min(20.75rem, calc(100vw - 2rem))',
      }}
      transition={{
        borderRadius: {
          delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
          duration: motionTiming.duration === 0 ? 0 : 0.34,
          ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        },
        height: {
          delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
          duration: motionTiming.duration === 0 ? 0 : 0.34,
          ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        },
        opacity: motionTiming,
        width: {
          delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
          duration: motionTiming.duration === 0 ? 0 : 0.34,
          ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        },
      }}
    >
      <motion.div
        aria-hidden="true"
        className="navi-assistant-aura absolute inset-0 rounded-[inherit]"
        data-testid="navi-assistant-aura"
        initial={false}
        animate={{
          opacity: expanded ? 1 : 0,
          boxShadow: expanded
            ? '0 18px 46px rgba(16, 24, 40, 0.16), 0 18px 54px rgba(109, 93, 246, 0.18)'
            : '0 18px 46px rgba(16, 24, 40, 0)',
        }}
        transition={{
          delay: expanded && motionTiming.duration !== 0 ? 0.12 : 0,
          duration: motionTiming.duration === 0 ? 0 : 0.2,
          ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        }}
      />
      {expanded ? (
        <motion.button
          aria-label="Navi AI 에이전트 닫기"
          className="pointer-events-auto absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-ai-primary)]"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            ...motionTiming,
            delay: motionTiming.duration === 0 ? 0 : 0.26,
            duration: motionTiming.duration === 0 ? 0 : 0.16,
          }}
          onClick={onClose}
          type="button"
        >
          <X className="size-4" weight="bold" />
        </motion.button>
      ) : (
        <button
          aria-label="Navi 호출"
          className="pointer-events-auto absolute right-0 top-0 z-10 size-[8.25rem] rounded-full bg-transparent outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--nav-ai-secondary)]"
          data-testid="navi-orb-control"
          onClick={onWakeCall}
          type="button"
        >
          <span className="sr-only">Navi 음성 어시스턴트 호출</span>
        </button>
      )}
      <motion.div
        className="relative h-full min-h-0"
      >
        <motion.div
          className="absolute grid place-items-center overflow-visible"
          data-testid="navi-assistant-orb-slot"
          animate={{
            left: expanded ? '50%' : '100%',
            top: expanded ? 28 : 0,
            x: expanded ? '-50%' : '-100%',
          }}
          style={{
            height: NAVI_ASSISTANT_PANEL_ORB_SIZE,
            width: NAVI_ASSISTANT_PANEL_ORB_SIZE,
          }}
          transition={{
            ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
            duration: motionTiming.duration === 0 ? 0 : 0.34,
          }}
        >
          {/* Project-local orb contract: docs/assistant/orb.md */}
          <VoiceOrb
            className="pointer-events-none [&_canvas]:mx-auto [&_canvas]:block"
            colorTheme={NAVI_ORB_THEME}
            energy={assistantStep.energy}
            reducedMotion={reducedMotion}
            size={NAVI_ORB_CONTROL_SIZE}
            state={visibleOrbState}
          />
        </motion.div>
        {expanded ? (
          <div
            className="relative z-[1] flex h-full min-h-0 flex-col items-center px-5 pb-5 pt-[12rem]"
            data-testid="navi-assistant-content"
          >
            <motion.div
              className="flex min-h-25 w-full flex-col items-center"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...motionTiming,
                delay: motionTiming.duration === 0 ? 0 : contentRevealDelay,
                duration: motionTiming.duration === 0 ? 0 : 0.18,
              }}
            >
              <div className="flex h-5 items-center justify-center">
                {assistantStep.statusLabel ? (
                  <div className="text-sm font-bold text-[var(--nav-ai-primary)]">{assistantStep.statusLabel}</div>
                ) : showVoiceWave ? (
                  <VoiceWave
                    active
                    className="pointer-events-none"
                    colorTheme={NAVI_ORB_THEME}
                    energy={assistantStep.energy}
                    reducedMotion={reducedMotion}
                  />
                ) : null}
              </div>
              <div className="mt-2 flex min-h-[4.5rem] w-full items-center justify-center">
                {assistantStep.userText ? (
                  <AssistantUserText
                    animateWords={assistantStep.mode === 'user-listening'}
                    motionTiming={motionTiming}
                    playbackKey={speechPlaybackKey}
                    reducedMotion={reducedMotion}
                    text={assistantStep.userText}
                  />
                ) : null}
                {assistantStep.text ? (
                  <AssistantSpeechText
                    key={speechPlaybackKey}
                    motionTiming={motionTiming}
                    playbackKey={speechPlaybackKey}
                    reducedMotion={reducedMotion}
                    text={assistantStep.text}
                  />
                ) : null}
              </div>
            </motion.div>
            <AnimatePresence initial={false}>
              {assistantStep.recommendations?.length ? (
                <AssistantRecommendationList
                  motionTiming={motionTiming}
                  recommendations={assistantStep.recommendations}
                />
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

function AssistantSpeechText({
  motionTiming,
  playbackKey,
  reducedMotion,
  text,
}: {
  motionTiming: MotionTiming
  playbackKey: string
  reducedMotion: boolean
  text: string
}) {
  if (!playbackKey) {
    return null
  }

  if (reducedMotion || motionTiming.duration === 0) {
    return (
      <p className="max-w-[17rem] text-pretty text-xl font-bold leading-8 tracking-normal">
        {text}
      </p>
    )
  }

  return (
    <p
      aria-label={text}
      className="max-w-[17rem] text-pretty text-xl font-bold leading-8 tracking-normal"
      data-testid="navi-assistant-speech-text"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <motion.span
            className="inline-block whitespace-pre-wrap"
            initial={{ opacity: 0, y: 7, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            key={`${character}-${index}`}
            transition={{
              delay: getAssistantSpeechCharacterDelaySeconds(index),
              duration: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {character}
          </motion.span>
        ))}
      </span>
    </p>
  )
}

function AssistantUserText({
  animateWords,
  motionTiming,
  playbackKey,
  reducedMotion,
  text,
}: {
  animateWords: boolean
  motionTiming: MotionTiming
  playbackKey: string
  reducedMotion: boolean
  text: string
}) {
  const shouldReveal = Boolean(playbackKey)

  if (!animateWords || reducedMotion || motionTiming.duration === 0) {
    if (!shouldReveal) {
      return null
    }

    return (
      <p
        aria-label={text}
        className="max-w-[16rem] text-pretty text-xl font-bold leading-8 tracking-normal"
        data-testid="navi-assistant-user-text"
      >
        {text}
      </p>
    )
  }

  if (!shouldReveal) {
    return null
  }

  const words = text.split(/(\s+)/)

  return (
    <p
      aria-label={text}
      className="max-w-[16rem] text-pretty text-xl font-bold leading-8 tracking-normal"
      data-testid="navi-assistant-user-text"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => {
          const visibleWordIndex = words.slice(0, index).filter((part) => part.trim()).length
          const isSpace = !word.trim()

          return (
            <span
              className={[
                'inline-block whitespace-pre-wrap',
                isSpace ? '' : 'navi-assistant-user-word',
              ].join(' ')}
              key={`${word}-${index}`}
              style={{
                '--navi-assistant-user-word-delay': `${visibleWordIndex * NAVI_ASSISTANT_USER_WORD_STAGGER_SECONDS}s`,
              } as CSSProperties}
            >
              {word}
            </span>
          )
        })}
      </span>
    </p>
  )
}

function AssistantRecommendationList({
  motionTiming,
  recommendations,
}: {
  motionTiming: MotionTiming
  recommendations: NaviAssistantRecommendation[]
}) {
  return (
    <motion.div
      className="mt-2 flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl bg-[var(--nav-panel)]"
      data-testid="navi-assistant-recommendations"
      exit={{ opacity: 0, height: 0, y: 8 }}
      initial={{ opacity: 0, height: 0, y: 8 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      transition={{
        ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        duration: motionTiming.duration === 0 ? 0 : 0.28,
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-left">
        <h3 className="text-sm font-bold tracking-normal">추천</h3>
        <span className="text-xs font-semibold text-[var(--nav-muted)]">{recommendations.length}개</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        <div className="grid gap-2">
          {recommendations.map((item, index) => (
            <motion.div
              className="flex items-center gap-3 rounded-xl bg-white p-3 text-left"
              key={`${item.type}-${item.title}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...motionTiming,
                delay: motionTiming.duration === 0 ? 0 : index * 0.035,
                duration: motionTiming.duration === 0 ? 0 : 0.18,
              }}
            >
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]">
                {item.type === 'music' ? (
                  <MusicNotes className="size-5" weight="bold" />
                ) : item.type === 'place' ? (
                  <RoadHorizon className="size-5" weight="bold" />
                ) : (
                  <ArrowBendUpRight className="size-5" weight="bold" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{item.title}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-primary)]">{item.meta}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--nav-muted)]">{item.detail}</div>
              </div>
              <button
                className="shrink-0 rounded-full bg-[var(--nav-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
                type="button"
              >
                {item.action}
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function NaviAssistantDebugPanel({
  motionTiming,
  scenario,
  scenarioId,
  stepIndex,
  onNext,
  onPrevious,
  onReset,
  onSelectScenario,
}: {
  motionTiming: MotionTiming
  scenario: NaviAssistantScenario
  scenarioId: NaviAssistantScenarioId
  stepIndex: number
  onNext: () => void
  onPrevious: () => void
  onReset: () => void
  onSelectScenario: (scenarioId: NaviAssistantScenarioId) => void
}) {
  const currentStep = scenario.steps[stepIndex]
  const progress = `${stepIndex + 1} / ${scenario.steps.length}`

  return (
    <motion.section
      aria-label="Navi AI 시나리오 디버그"
      className="col-start-2 row-start-2 self-start rounded-[1.1rem] border border-white/70 bg-white p-4 text-[var(--nav-ink)] shadow-[0_18px_46px_rgb(0_0_0/0.24)]"
      data-testid="navi-assistant-debug-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="flex flex-col gap-4">
        <div className="border-b border-[var(--nav-border)] pb-3">
          <p className="text-sm font-black">시나리오 디버깅</p>
          <p className="mt-1 text-xs font-semibold text-[var(--nav-muted)]">
            운전자 이상행동 안내 흐름을 단계별로 점검합니다.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-xs font-bold text-[var(--nav-muted)]"
            htmlFor="navi-assistant-scenario-select"
          >
            시나리오
          </label>
          <select
            aria-label="AI 시나리오 선택"
            className="h-11 min-w-0 rounded-xl bg-[var(--nav-panel)] px-3 text-sm font-bold text-[var(--nav-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-focus-ring)]"
            id="navi-assistant-scenario-select"
            onChange={(event) => onSelectScenario(event.target.value as NaviAssistantScenarioId)}
            value={scenarioId}
          >
            {NAVI_ASSISTANT_SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-[var(--nav-panel)] p-3">
          <div className="text-xs font-bold text-[var(--nav-muted)]">현재 단계</div>
          <div className="mt-1 truncate text-base font-black">{currentStep.label}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--nav-muted)]">{progress}</div>
          {currentStep.text ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--nav-ink)]">
              {currentStep.text}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            aria-label="이전 AI 시나리오 단계"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-panel)] text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={onPrevious}
            type="button"
          >
            <CaretLeft className="size-4" weight="bold" />
          </button>
          <button
            aria-label="다음 AI 시나리오 단계"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-primary)] text-white transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={stepIndex === scenario.steps.length - 1}
            onClick={onNext}
            type="button"
          >
            <CaretRight className="size-4" weight="bold" />
          </button>
          <button
            aria-label="AI 시나리오 초기화"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-panel)] text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)]"
            onClick={onReset}
            type="button"
          >
            <ArrowCounterClockwise className="size-4" weight="bold" />
          </button>
        </div>
      </div>
    </motion.section>
  )
}

function AppIconDock({
  activeSidePanel,
  className,
  motionTiming,
  musicModalOpen,
  settingsDisabled,
  onOpenSettings,
  onOpenReport,
  onOpenConnect,
  onToggleMusic,
}: {
  activeSidePanel: SidePanelId | null
  className?: string
  motionTiming: MotionTiming
  musicModalOpen: boolean
  settingsDisabled: boolean
  onOpenSettings: () => void
  onOpenReport: () => void
  onOpenConnect: () => void
  onToggleMusic: () => void
}) {
  const railButtonClassName = (active: boolean, disabled = false) => [
    'grid size-11 place-items-center rounded-xl text-[var(--nav-ink)] transition',
    active
      ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)] shadow-[inset_0_0_0_1px_rgb(23_70_162/0.10)]'
      : 'hover:bg-[var(--nav-panel)] hover:text-[var(--nav-primary)]',
    disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--nav-ink)]' : '',
  ].join(' ')

  return (
    <motion.div
      aria-label="오른쪽 도구 모음"
      className={['pointer-events-none flex flex-none items-start', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div
        data-testid="right-rail-dock"
        className="pointer-events-auto inline-flex flex-col gap-1 rounded-bl-none rounded-r-none rounded-tl-[1.15rem] border-t border-white/70 bg-white p-1.5"
      >
        <button
          aria-controls="settings-drawer"
          aria-expanded={activeSidePanel === 'settings'}
          aria-label="설정"
          className={railButtonClassName(activeSidePanel === 'settings')}
          disabled={settingsDisabled}
          onClick={onOpenSettings}
          type="button"
        >
          <GearSix className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="report-drawer"
          aria-expanded={activeSidePanel === 'report'}
          aria-label="보고서"
          className={railButtonClassName(activeSidePanel === 'report')}
          onClick={onOpenReport}
          type="button"
        >
          <ClipboardText className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="connect-drawer"
          aria-expanded={activeSidePanel === 'connect'}
          aria-label="연동 상태"
          className={railButtonClassName(activeSidePanel === 'connect')}
          onClick={onOpenConnect}
          type="button"
        >
          <PlugsConnected className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="music-popover"
          aria-expanded={musicModalOpen}
          aria-label="음악"
          className={railButtonClassName(musicModalOpen)}
          onClick={onToggleMusic}
          type="button"
        >
          <MusicNotes className="size-5" weight="bold" />
        </button>
      </div>
    </motion.div>
  )
}

function SideDrawerPanel({
  cameraSettings,
  currentLocationLabel,
  locationStatus,
  motionTiming,
  panel,
  onChangeCameraSettings,
  onClose,
  onRequestCurrentLocation,
}: {
  cameraSettings: MapCameraSettings
  currentLocationLabel: string
  locationStatus: LocationStatus
  motionTiming: MotionTiming
  panel: SidePanelId
  onChangeCameraSettings: (settings: Partial<MapCameraSettings>) => void
  onClose: () => void
  onRequestCurrentLocation: () => void
}) {
  const itemTransition = {
    ...motionTiming,
    duration: motionTiming.duration === 0 ? 0 : 0.18,
  }
  const itemVariants = {
    hidden: {
      opacity: 0,
      y: motionTiming.duration === 0 ? 0 : 8,
      scale: motionTiming.duration === 0 ? 1 : 0.985,
      transition: itemTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: itemTransition,
    },
  }
  const drawerTransition = {
    ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1] as [number, number, number, number],
    duration: motionTiming.duration === 0 ? 0 : 0.34,
  }
  const drawerOffset = motionTiming.duration === 0 ? 0 : SIDE_PANEL_WIDTH
  const drawerMeta = {
    settings: {
      label: '설정',
      icon: GearSix,
    },
    report: {
      label: '보고서',
      icon: Article,
    },
    connect: {
      label: '연동 상태',
      icon: PlugsConnected,
    },
  }[panel]
  const content = panel === 'settings' ? (
    <SettingsDrawerContent
      cameraSettings={cameraSettings}
      currentLocationLabel={currentLocationLabel}
      itemVariants={itemVariants}
      locationStatus={locationStatus}
      onChangeCameraSettings={onChangeCameraSettings}
      onRequestCurrentLocation={onRequestCurrentLocation}
    />
  ) : panel === 'report' ? (
    <ReportDrawerContent itemVariants={itemVariants} />
  ) : (
    <ConnectDrawerContent itemVariants={itemVariants} />
  )

  return (
    <motion.aside
      aria-label={drawerMeta.label}
      className="pointer-events-auto absolute bottom-0 right-0 top-0 z-20 w-[320px] overflow-hidden bg-white text-[var(--nav-ink)] shadow-[0_14px_36px_rgb(15_23_42/0.12)] max-sm:w-[min(20rem,calc(100vw-4rem))]"
      id={`${panel}-drawer`}
      data-testid={`${panel}-drawer`}
      exit={{ opacity: 1, x: drawerOffset }}
      initial={{ opacity: 1, x: drawerOffset }}
      animate={{ opacity: 1, x: 0 }}
      transition={drawerTransition}
      role="dialog"
    >
      <div className="flex h-full max-h-full w-full min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 pb-1 px-4 pt-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-primary)]">
              <drawerMeta.icon className="size-4" weight="bold" />
            </span>
            <h2 className="truncate text-[15px] font-bold tracking-normal">{drawerMeta.label}</h2>
          </div>
          <button
            aria-label={`${drawerMeta.label} 닫기`}
            className="grid size-10 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" weight="bold" />
          </button>
        </div>
        <motion.div
          animate="visible"
          className="grid gap-3 overflow-auto px-4 py-4"
          initial="hidden"
          variants={{
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
          }}
        >
          {content}
        </motion.div>
      </div>
    </motion.aside>
  )
}

function SettingsDrawerContent({
  cameraSettings,
  currentLocationLabel,
  itemVariants,
  locationStatus,
  onChangeCameraSettings,
  onRequestCurrentLocation,
}: {
  cameraSettings: MapCameraSettings
  currentLocationLabel: string
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
  locationStatus: LocationStatus
  onChangeCameraSettings: (settings: Partial<MapCameraSettings>) => void
  onRequestCurrentLocation: () => void
}) {
  const mapModeControlTransition = {
    ease: itemVariants.visible.transition.duration === 0 ? undefined : [0.34, 0, 0.2, 1] as [number, number, number, number],
    duration: itemVariants.visible.transition.duration === 0 ? 0 : 0.72,
  }
  const mapModeItemVariants = {
    hidden: {
      opacity: 0,
      y: itemVariants.hidden.y,
      scale: itemVariants.hidden.scale,
      transition: mapModeControlTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: mapModeControlTransition,
    },
  }
  const updateZoom = (zoom: number) => {
    onChangeCameraSettings({
      zoom: clamp(zoom, MAP_SETTINGS_ZOOM_MIN, MAP_SETTINGS_ZOOM_MAX),
    })
  }
  const updatePitch = (pitch: number) => {
    onChangeCameraSettings({
      pitch: clamp(pitch, MAP_SETTINGS_PITCH_MIN, MAP_SETTINGS_PITCH_MAX),
    })
  }
  const updateMode = (mode: MapCameraSettings['mode']) => {
    onChangeCameraSettings({ mode })
  }

  return (
    <>
      <motion.div variants={itemVariants}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-bold">지도</span>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--nav-panel)] p-1" role="group" aria-label="지도 모드">
          {(['2d', '3d'] as const).map((mode) => {
            const selected = cameraSettings.mode === mode
            const label = mode === '2d' ? '2D 지도' : '3D 지도'

            return (
              <button
                aria-pressed={selected}
                className={[
                  'h-10 rounded-full text-sm font-bold transition duration-[600ms] ease-[cubic-bezier(0.34,0,0.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                  selected
                    ? 'bg-white text-[var(--nav-primary)]'
                    : 'text-[var(--nav-muted)] hover:bg-white/70 hover:text-[var(--nav-ink)]',
                ].join(' ')}
                key={mode}
                onClick={() => updateMode(mode)}
                type="button"
              >
                {label}
              </button>
            )
          })}
        </div>
      </motion.div>
      <motion.div variants={itemVariants}>
        <SettingSlider
          label="확대"
          max={MAP_SETTINGS_ZOOM_MAX}
          min={MAP_SETTINGS_ZOOM_MIN}
          step={MAP_SETTINGS_ZOOM_STEP}
          value={cameraSettings.zoom}
          valueLabel={cameraSettings.zoom.toFixed(1)}
          onDecrease={() => updateZoom(cameraSettings.zoom - MAP_SETTINGS_ZOOM_STEP)}
          onIncrease={() => updateZoom(cameraSettings.zoom + MAP_SETTINGS_ZOOM_STEP)}
          onChange={updateZoom}
        />
      </motion.div>
      {cameraSettings.mode === '3d' ? (
        <motion.div variants={mapModeItemVariants}>
          <SettingSlider
            label="기울기"
            max={MAP_SETTINGS_PITCH_MAX}
            min={MAP_SETTINGS_PITCH_MIN}
            resetLabel="0°"
            step={MAP_SETTINGS_PITCH_STEP}
            value={cameraSettings.pitch}
            valueLabel={`${Math.round(cameraSettings.pitch)}°`}
            onDecrease={() => updatePitch(cameraSettings.pitch - MAP_SETTINGS_PITCH_STEP)}
            onIncrease={() => updatePitch(cameraSettings.pitch + MAP_SETTINGS_PITCH_STEP)}
            onReset={() => updatePitch(0)}
            onChange={updatePitch}
          />
        </motion.div>
      ) : null}
      <motion.div
        className="flex items-center justify-between gap-3 pt-1"
        variants={itemVariants}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <UserCircle className="size-7 shrink-0 text-[var(--nav-muted)]" weight="fill" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[var(--nav-ink)]">안정현</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-muted)]">로그인됨</div>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="rounded-2xl bg-[var(--nav-panel)] p-3"
        variants={itemVariants}
      >
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-[var(--nav-primary)]" weight="fill" />
          <span className="text-sm font-bold">현재 위치</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          {locationStatus === 'granted'
            ? `${currentLocationLabel} 기준으로 탐색 중`
            : '세종대학교를 현재 위치로 사용 중입니다'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onRequestCurrentLocation}
            type="button"
          >
            <Clock className="size-4" weight="bold" />
            현재 위치 다시 받기
          </button>
          <span className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-muted)]">
            {locationStatus === 'granted' ? 'GPS 추적 중' : '권한 재시도 가능'}
          </span>
        </div>
      </motion.div>
    </>
  )
}

function ReportDrawerContent({
  itemVariants,
}: {
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
}) {
  return (
    <>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <Article className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">운행 리포트</span>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">안전 상태</span>
            <span className="font-semibold text-[var(--nav-guidance)]">양호</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">최근 감지</span>
            <span className="font-semibold">급커브 1건</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">오늘 운행</span>
            <span className="font-semibold">42분 · 11.8 km</span>
          </div>
        </div>
      </motion.div>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <Warning className="size-4 text-[var(--nav-warning)]" weight="fill" />
          <span className="text-sm font-bold">점검 메모</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          주행 중 감속 구간과 제한속도 알림이 정상적으로 기록되고 있습니다.
        </p>
        <button
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          type="button"
        >
          <ClipboardText className="size-4" weight="bold" />
          리포트 확인
        </button>
      </motion.div>
    </>
  )
}

function ConnectDrawerContent({
  itemVariants,
}: {
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
}) {
  const [lastCheckedLabel, setLastCheckedLabel] = useState('방금 전')

  const refreshConnection = () => {
    setLastCheckedLabel('지금')
  }

  return (
    <>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <PlugsConnected className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">연결 상태</span>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">차량</span>
            <span className="font-semibold text-[var(--nav-guidance)]">연결됨</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">휴대폰</span>
            <span className="font-semibold">동기화됨</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--nav-muted)]">
              <SpeakerHigh className="size-4" weight="bold" />
              오디오
            </span>
            <span className="font-semibold">정상</span>
          </div>
        </div>
      </motion.div>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <WifiHigh className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">최근 확인</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          마지막 확인은 {lastCheckedLabel}입니다. 연결이 흔들리면 다시 확인할 수 있습니다.
        </p>
        <button
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={refreshConnection}
          type="button"
        >
          <CarSimple className="size-4" weight="bold" />
          연결 다시 확인
        </button>
      </motion.div>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">기기 정보</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          Navi 앱과 차량 연결이 유지되는 동안 안내, 음악, 리포트가 동기화됩니다.
        </p>
      </motion.div>
    </>
  )
}

function MusicPopover({
  motionTiming,
  musicSearchKeyword,
  musicPlaying,
  selectedTrack,
  onClose,
  onPickTrack,
  onSearchKeywordChange,
  onStartPlayback,
}: {
  motionTiming: MotionTiming
  musicSearchKeyword: string
  musicPlaying: boolean
  selectedTrack: (typeof MUSIC_LIBRARY)[number]
  onClose: () => void
  onPickTrack: (trackId: (typeof MUSIC_LIBRARY)[number]['id']) => void
  onSearchKeywordChange: (value: string) => void
  onStartPlayback: () => void
}) {
  const filteredTracks = MUSIC_LIBRARY.filter((track) => {
    const keyword = musicSearchKeyword.trim().toLowerCase()

    if (!keyword) {
      return true
    }

    return (
      track.title.toLowerCase().includes(keyword) ||
      track.artist.toLowerCase().includes(keyword) ||
      track.mood.toLowerCase().includes(keyword)
    )
  })

  return (
    <motion.section
      aria-label="음악"
      className="pointer-events-auto absolute bottom-14 right-[4.25rem] z-50 rounded-[1.15rem] bg-white/94 text-[var(--nav-ink)] shadow-[0_12px_30px_rgb(15_23_42/0.12)] backdrop-blur-xl max-sm:bottom-13 max-sm:right-2"
      id="music-popover"
      data-testid="music-popover"
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      role="dialog"
      style={{ maxWidth: 'calc(100% - 5rem)', width: MUSIC_POPOVER_WIDTH }}
      transition={motionTiming}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-primary)]">
            <MusicNotes className="size-4" weight="bold" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold tracking-normal">음악</h2>
            <p className="truncate text-xs text-[var(--nav-muted)]">{musicPlaying ? '재생 중' : '선택 후 재생'}</p>
          </div>
        </div>
        <button
          aria-label="음악 닫기"
          className="grid size-10 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" weight="bold" />
        </button>
      </div>
      <motion.div
        animate="visible"
        className="grid gap-3 px-4 py-4"
        initial="hidden"
        variants={{
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
        }}
      >
        <motion.label className="grid gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <span className="text-sm font-bold">검색</span>
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--nav-border)] bg-white px-3 text-[var(--nav-muted)]">
            <MagnifyingGlass className="size-4 shrink-0" weight="bold" />
            <input
              aria-label="음악 검색"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-subtle)]"
              onChange={(event) => onSearchKeywordChange(event.target.value)}
              placeholder="곡, 분위기, 아티스트"
              value={musicSearchKeyword}
            />
          </div>
        </motion.label>
        <motion.div className="grid gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <span className="text-sm font-bold">최근 선택</span>
          <div className="grid gap-2">
            {filteredTracks.map((track) => {
              const active = track.id === selectedTrack.id

              return (
                <button
                  aria-pressed={active}
                  className={[
                    'flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                    active
                      ? 'border-[var(--nav-primary)] bg-[var(--nav-primary-soft)]'
                      : 'border-[var(--nav-border)] bg-white hover:bg-[var(--nav-panel)]',
                  ].join(' ')}
                  key={track.id}
                  onClick={() => onPickTrack(track.id)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{track.title}</span>
                    <span className="block truncate text-xs text-[var(--nav-muted)]">{track.artist}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--nav-panel)] px-2 py-1 text-[11px] font-semibold text-[var(--nav-muted)]">
                    {track.mood}
                  </span>
                </button>
              )
            })}
          </div>
        </motion.div>
        <motion.div className="flex gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onStartPlayback}
            type="button"
          >
            <Play className="size-4" weight="fill" />
            재생
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--nav-panel)] px-4 text-sm font-semibold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </motion.div>
      </motion.div>
    </motion.section>
  )
}

function MiniPlayer({
  activeRoute,
  motionTiming,
  musicPlaying,
  selectedTrack,
  onClose,
  onTogglePlay,
}: {
  activeRoute: boolean
  motionTiming: MotionTiming
  musicPlaying: boolean
  selectedTrack: (typeof MUSIC_LIBRARY)[number]
  onClose: () => void
  onTogglePlay: () => void
}) {
  if (!musicPlaying) {
    return null
  }

  const bottom = activeRoute ? MUSIC_MINI_PLAYER_GUIDANCE_BOTTOM : MUSIC_MINI_PLAYER_IDLE_BOTTOM
  const isPlaying = musicPlaying

  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 z-40 w-[min(24rem,calc(100%-1rem))] -translate-x-1/2"
      data-testid="music-mini-player"
      style={{ bottom }}
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.99 }}
      transition={motionTiming}
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-white/92 px-3 py-2 shadow-[0_8px_18px_rgb(15_23_42/0.12)] backdrop-blur-md">
        <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-primary)]">
          <MusicNotes className="size-5" weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--nav-ink)]">{selectedTrack.title}</div>
          <div className="truncate text-xs text-[var(--nav-muted)]">{selectedTrack.artist} · 재생 중</div>
        </div>
        <button
          aria-label={isPlaying ? '음악 일시정지' : '음악 재생'}
          className="grid size-10 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onTogglePlay}
          type="button"
        >
          {isPlaying ? <Pause className="size-4" weight="fill" /> : <Play className="size-4" weight="fill" />}
        </button>
        <button
          aria-label="음악 닫기"
          className="grid size-10 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" weight="bold" />
        </button>
      </div>
    </motion.div>
  )
}

function SettingSlider({
  label,
  max,
  min,
  resetLabel,
  step,
  value,
  valueLabel,
  onChange,
  onDecrease,
  onIncrease,
  onReset,
}: {
  label: string
  max: number
  min: number
  resetLabel?: string
  step: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
  onDecrease: () => void
  onIncrease: () => void
  onReset?: () => void
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className="rounded-full bg-[var(--nav-panel)] px-2 py-1 text-xs font-bold text-[var(--nav-muted)]">{valueLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label={`${label} 줄이기`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onDecrease}
          type="button"
        >
          <Minus className="size-4" weight="bold" />
        </button>
        <input
          aria-label={label}
          className="h-2 min-w-0 flex-1 accent-[var(--nav-primary)]"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
        <button
          aria-label={`${label} 키우기`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onIncrease}
          type="button"
        >
          <Plus className="size-4" weight="bold" />
        </button>
        {onReset ? (
          <button
            aria-label={`${label} 초기화`}
            className="h-10 shrink-0 rounded-full bg-[var(--nav-panel)] px-3 text-xs font-bold text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onReset}
            type="button"
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getNextMapCameraSettings(
  currentSettings: MapCameraSettings,
  settings: Partial<MapCameraSettings>,
): MapCameraSettings {
  const mode = settings.mode ?? currentSettings.mode
  const zoom = clamp(settings.zoom ?? currentSettings.zoom, MAP_SETTINGS_ZOOM_MIN, MAP_SETTINGS_ZOOM_MAX)

  if (mode === '2d') {
    return {
      mode,
      zoom,
      pitch: 0,
    }
  }

  return {
    mode,
    zoom,
    pitch: clamp(
      settings.pitch ?? (currentSettings.mode === '3d' ? currentSettings.pitch : MAP_SETTINGS_3D_DEFAULT_PITCH),
      MAP_SETTINGS_PITCH_MIN,
      MAP_SETTINGS_PITCH_MAX,
    ),
  }
}

function isSameMapCameraSettings(currentSettings: MapCameraSettings, nextSettings: MapCameraSettings) {
  return (
    currentSettings.mode === nextSettings.mode &&
    currentSettings.zoom === nextSettings.zoom &&
    currentSettings.pitch === nextSettings.pitch
  )
}

function isRouteKeywordDraftMismatched(keyword: string, place: Place | undefined) {
  const trimmedKeyword = keyword.trim()

  if (!trimmedKeyword || !place) {
    return false
  }

  return trimmedKeyword !== place.name && trimmedKeyword !== place.address
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
  onSelectPlace: (field: SearchFieldId, place: Place) => void
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
              onSelect={(place) => onSelectPlace(field, place)}
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
        className="navi-glass pointer-events-auto relative rounded-[1.35rem] p-3"
        transition={routeSearchLayoutTransition}
      >
        <motion.button
          aria-label="경로 검색 닫기"
          className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/92 text-[var(--nav-muted)] shadow-[0_4px_10px_rgba(15,23,42,0.10)] transition hover:text-[var(--nav-ink)]"
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
                  className="grid grid-cols-[1rem_1fr] gap-x-3 rounded-2xl bg-white/78 p-3 shadow-[0_6px_14px_rgb(15_23_42/0.06)] ring-1 ring-[rgb(148_163_184/0.14)]"
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
                  className="rounded-2xl bg-white/78 p-3 shadow-[0_6px_14px_rgb(15_23_42/0.06)] ring-1 ring-[rgb(148_163_184/0.14)]"
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
  motionTiming,
  searchOpen,
  showFallbackToast,
  onOpenSettings,
  onOpenSearch,
}: {
  motionTiming: MotionTiming
  searchOpen: boolean
  showFallbackToast: boolean
  onOpenSettings: () => void
  onOpenSearch: () => void
}) {
  const navigationBlocked = false

  return (
    <div className="pointer-events-none absolute inset-0 text-[var(--nav-ink)]">
      <AnimatePresence initial={false}>
        {!searchOpen ? (
          <motion.div
            className="absolute bottom-[59px] left-1/2 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 max-sm:bottom-[53px] max-sm:w-[min(22rem,calc(100%-1.5rem))]"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={motionTiming}
          >
            {showFallbackToast ? (
              <motion.div
                className="pointer-events-auto mb-2 flex min-h-11 items-center justify-between gap-3 rounded-full bg-white/86 px-4 py-2 text-sm font-medium text-[var(--nav-muted)] shadow-[0_8px_18px_rgb(15_23_42/0.10)] backdrop-blur max-sm:rounded-2xl max-sm:text-xs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={motionTiming}
              >
                <span className="min-w-0 truncate">세종대학교를 현재 위치로 사용 중입니다</span>
                <motion.button
                  className="shrink-0 rounded-full bg-[var(--nav-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--nav-primary-hover)]"
                  onClick={onOpenSettings}
                  type="button"
                  whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.96 }}
                >
                  설정 열기
                </motion.button>
              </motion.div>
            ) : null}
            <motion.button
              className="pointer-events-auto flex h-15 w-full items-center gap-3.5 rounded-full bg-white/90 px-5 text-left text-base font-semibold text-[var(--nav-ink)] shadow-[0_12px_28px_rgb(15_23_42/0.12)] backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/80 disabled:text-[var(--nav-subtle)] max-sm:h-14 max-sm:px-5"
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

function RouteSelectionSummary({
  activeRouteOptionId,
  destinationLabel,
  error,
  loading,
  motionTiming,
  optionCount,
  originLabel,
  onEditRoute,
  onPreviewRouteOption,
  onSelectRouteOption,
  routeOptions,
}: {
  activeRouteOptionId?: string
  destinationLabel: string
  error: boolean
  loading: boolean
  motionTiming: MotionTiming
  optionCount: number
  originLabel: string
  onEditRoute: () => void
  onPreviewRouteOption: (id: string | undefined) => void
  onSelectRouteOption: (id: string) => void
  routeOptions: NavigationRouteOption[]
}) {
  const statusLabel = error
    ? '경로를 찾지 못했습니다'
    : loading
      ? '경로 찾는 중'
      : `${optionCount}개 경로`
  const activeId = activeRouteOptionId ?? getDefaultRouteOptionId(routeOptions)

  return (
    <motion.div
      className="pointer-events-none absolute bottom-20 left-1/2 z-20 w-[calc(100%-2rem)] -translate-x-1/2 text-[var(--nav-ink)] max-sm:bottom-[4.5rem] max-sm:w-[calc(100%-1.5rem)]"
      data-testid="route-selection-summary"
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.985 }}
      transition={motionTiming}
    >
      {routeOptions.length ? (
        <div
          className="pointer-events-auto mx-auto mb-2 flex w-fit max-w-full gap-2 overflow-x-auto px-0.5 pb-1"
          data-testid="route-option-cards"
        >
          {routeOptions.map((option) => {
            const active = option.id === activeId
            const label = getRouteOptionDisplayLabel(option)

            return (
              <div key={option.id} className="flex w-36 shrink-0 flex-col items-stretch">
                <div className="mb-1 h-9">
                  <AnimatePresence initial={false}>
                    {active ? (
                      <motion.button
                        key="start-guidance"
                        aria-label={`${label} 안내 시작`}
                        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--nav-ink)] px-3 text-xs font-black text-white shadow-[0_8px_18px_rgb(15_23_42/0.18)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] active:scale-[0.98]"
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={motionTiming.duration === 0 ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectRouteOption(option.id)
                        }}
                        type="button"
                      >
                        <Play className="size-3.5" weight="fill" />
                        안내 시작
                      </motion.button>
                    ) : null}
                  </AnimatePresence>
                </div>
                <button
                  aria-label={`${label} 경로 보기`}
                  aria-pressed={active}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                    active
                      ? 'border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white'
                      : 'border-white/80 bg-white/88 text-[var(--nav-ink)]',
                  ].join(' ')}
                  data-testid={`route-option-card-${option.id}`}
                  onClick={() => onPreviewRouteOption(option.id)}
                  type="button"
                >
                  <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: active ? '#ffffff' : option.color }}
                    />
                    <span className="min-w-0 truncate text-xs font-extrabold">{label}</span>
                    {option.isRecommended ? (
                      <span className={[
                        'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black',
                        active ? 'bg-white/20 text-white' : 'bg-[var(--nav-selection)] text-[var(--nav-primary)]',
                      ].join(' ')}
                      >
                        추천
                      </span>
                    ) : null}
                  </div>
                  <div className={['text-base font-black leading-none', active ? 'text-white' : 'text-[var(--nav-ink)]'].join(' ')}>
                    {formatRouteOptionDuration(option.route.summary.durationSeconds)}
                  </div>
                  <div className={['mt-1 truncate text-[11px] font-bold', active ? 'text-white/85' : 'text-[var(--nav-muted)]'].join(' ')}>
                    {formatRouteOptionDistance(option.route.summary.distanceMeters)}
                    <span className="mx-1">·</span>
                    {formatArrivalTime(option.route.summary.durationSeconds)} 도착
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="pointer-events-auto mx-auto flex w-[min(32rem,100%)] items-center gap-3 rounded-2xl bg-white/88 px-4 py-3 shadow-[0_10px_24px_rgb(15_23_42/0.10)] backdrop-blur-md">
        <div className="grid shrink-0 content-center justify-center">
          <span className="size-2 rounded-full bg-[var(--nav-primary)]" />
          <span className="mx-auto h-6 w-px bg-[var(--nav-border)]" />
          <span className="size-2 rounded-full bg-[var(--nav-guidance)]" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-[11px] font-semibold text-[var(--nav-muted)]">출발</span>
            <span className="min-w-0 truncate font-semibold">{originLabel}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-[11px] font-semibold text-[var(--nav-muted)]">도착</span>
            <span className="min-w-0 truncate font-semibold">{destinationLabel}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--nav-panel)] px-2.5 py-1 text-xs font-bold text-[var(--nav-muted)]">
          {statusLabel}
        </span>
        <button
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--nav-primary)] shadow-[0_3px_8px_rgba(15,23,42,0.1)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onEditRoute}
          type="button"
        >
          변경
        </button>
      </div>
    </motion.div>
  )
}

function RouteSearchLoadingModal({
  motionTiming,
  reducedMotion,
}: {
  motionTiming: MotionTiming
  reducedMotion: boolean
}) {
  return (
    <motion.div
      aria-label="경로 탐색 중"
      aria-live="polite"
      className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-[rgb(15_23_42/0.18)] px-5 text-[var(--nav-ink)] backdrop-blur-[2px]"
      data-testid="route-search-loading-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionTiming}
    >
      <motion.div
        className="navi-assistant-aura relative flex w-[min(19rem,calc(100vw-3rem))] flex-col items-center overflow-hidden rounded-3xl px-6 pb-6 pt-5 text-center shadow-[0_22px_56px_rgb(15_23_42/0.20)]"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={motionTiming.duration === 0 ? { duration: 0 } : { duration: 0.2, ease: PRODUCT_EASE }}
        role="status"
      >
        <div className="relative z-[1] grid place-items-center">
          {/* Project-local orb contract: docs/assistant/orb.md */}
          <VoiceOrb
            className="pointer-events-none [&_canvas]:mx-auto [&_canvas]:block"
            colorTheme="ocean"
            energy={0.72}
            reducedMotion={reducedMotion}
            size={148}
            state="thinking"
          />
        </div>
        <div className="relative z-[1] -mt-2 text-base font-black">경로를 계산하고 있어요</div>
        <div className="relative z-[1] mt-1 text-xs font-semibold text-[var(--nav-muted)]">
          교통 흐름과 후보 경로를 비교하는 중
        </div>
      </motion.div>
    </motion.div>
  )
}

function DrivingHud({
  assist,
  guidance,
  motionTiming,
  onEndGuidance,
  simulationRunning,
  onToggleSimulation,
}: {
  assist?: DrivingAssistInfo
  guidance?: ManeuverGuidance
  motionTiming: MotionTiming
  onEndGuidance: () => void
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
        <DrivingAssistOverlay assist={assist} motionTiming={motionTiming} />
      ) : null}

      <motion.div
        className="absolute bottom-17 right-28 flex items-center gap-3 max-sm:bottom-16 max-sm:right-20"
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
        <motion.button
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[var(--nav-ink)] shadow-[0_4px_10px_rgba(15,23,42,0.14)] transition hover:bg-white max-sm:px-3"
          onClick={onEndGuidance}
          type="button"
          whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.97 }}
        >
          <X className="h-4 w-4" weight="bold" />
          <span>길안내 종료</span>
        </motion.button>
      </motion.div>

    </motion.div>
  )
}

function DrivingAssistOverlay({
  assist,
  motionTiming,
}: {
  assist: DrivingAssistInfo
  motionTiming: MotionTiming
}) {
  return (
    <motion.div
      className="pointer-events-none absolute left-4 top-[11rem] z-40 max-sm:left-2 max-sm:top-[9rem]"
      data-testid="driving-assist-signs"
      initial={{ opacity: 0, x: -12, y: -4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.08 }}
    >
      <DrivingAssistSigns assist={assist} />
    </motion.div>
  )
}

function BottomStatusBar({
  arrivalLabel,
  currentLocationLabel,
  currentTimeLabel,
  destinationLabel,
  distanceLabel,
  durationLabel,
  hasRoute,
  motionTiming,
  weatherLabel,
}: {
  arrivalLabel: string
  currentLocationLabel: string
  currentTimeLabel: string
  destinationLabel: string
  distanceLabel: string
  durationLabel: string
  hasRoute: boolean
  motionTiming: MotionTiming
  weatherLabel: string
}) {
  const items = hasRoute
    ? [
        { label: '도착', value: `${arrivalLabel} 예정`, icon: <Clock className="h-5 w-5" weight="bold" /> },
        { label: '남은시간', value: durationLabel, icon: <Timer className="h-5 w-5" weight="bold" /> },
        { label: '목적지', value: destinationLabel, icon: <MapPin className="h-5 w-5" weight="bold" /> },
        { label: '남은거리', value: distanceLabel, icon: <RoadHorizon className="h-5 w-5" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-5 w-5" weight="bold" /> },
      ]
    : [
        { label: '시간', value: currentTimeLabel, icon: <Clock className="h-5 w-5" weight="bold" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-5 w-5" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-5 w-5" weight="bold" /> },
      ]

  return (
    <motion.div
      data-testid="bottom-status-bar"
      className={[
        'absolute bottom-0 left-0 right-0 z-30 grid h-[43px] items-center rounded-tl-xl rounded-tr-none bg-white text-[var(--nav-ink)] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] max-sm:h-[37px]',
        hasRoute ? 'grid-cols-5' : 'grid-cols-3',
      ].join(' ')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      {items.map((item) => (
        <div
          aria-label={`${item.label} ${item.value}`}
          className="flex min-w-0 items-center justify-center gap-2.5 border-r border-[var(--nav-border)] px-4 text-center last:border-r-0 max-sm:gap-1.5 max-sm:px-1.5"
          key={item.label}
        >
          <span className="shrink-0 text-[var(--nav-muted)]">{item.icon}</span>
          <span className="min-w-0 truncate text-base font-bold leading-tight max-sm:text-sm">{item.value}</span>
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
    active: boolean
  }
  facility?: {
    type: RouteManeuver['type']
    label: string
    distanceLabel: string
    signCode?: number
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
  updateKey?: number
}

type GuidanceDistanceDisplayStore = Map<string, GuidanceDistanceDisplayState>

function getManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
  distanceDisplayStore: GuidanceDistanceDisplayStore,
  distanceUpdateKey?: number,
): ManeuverGuidance | undefined {
  const maneuvers = (route.maneuvers ?? []).filter(isActionManeuver)

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

  return {
    current: createManeuverGuidanceItem(
      currentManeuver,
      currentManeuver.distanceFromStartMeters - travelledDistanceMeters,
      distanceDisplayStore,
      distanceUpdateKey,
    ),
    next: nextManeuver
      ? createManeuverGuidanceItem(
        nextManeuver,
        nextManeuver.distanceFromStartMeters - travelledDistanceMeters,
        distanceDisplayStore,
        distanceUpdateKey,
      )
      : undefined,
  }
}

function isActionManeuver(maneuver: RouteManeuver) {
  return !isFacilityManeuver(maneuver)
}

function isFacilityManeuver(maneuver: RouteManeuver) {
  return [
    'underpass',
    'overpass',
    'tunnel',
    'bridge',
    'side-underpass',
    'side-overpass',
    'box-tunnel',
  ].includes(maneuver.type)
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
  updateKey?: number,
): ManeuverGuidanceItem {
  const displayDistanceMeters = getTimedGuidanceDistance(
    distanceDisplayStore,
    maneuver.id,
    distanceMeters,
    updateKey,
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

function getTimedGuidanceDistance(
  store: GuidanceDistanceDisplayStore,
  key: string,
  distanceMeters: number,
  updateKey?: number,
) {
  const actualMeters = Math.max(0, Math.round(distanceMeters))

  if (actualMeters >= 1000 || updateKey === undefined) {
    store.delete(key)
    return actualMeters
  }

  const existing = store.get(key)

  if (
    !existing ||
    existing.updateKey !== updateKey ||
    actualMeters > existing.displayMeters ||
    actualMeters === 0
  ) {
    const nextState = {
      displayMeters: actualMeters,
      updateKey,
    }
    store.set(key, nextState)
    return nextState.displayMeters
  }

  return existing.displayMeters
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
  if (type === 'left') return <img alt="" className={`${className} object-contain`} src={leftManeuverSrc} />
  if (type === 'right') return <img alt="" className={`${className} object-contain`} src={rightManeuverSrc} />
  if (type === 'highway-exit' || type === 'urban-express-exit') return <ArrowBendUpRight className={className} weight="bold" />
  if (type === 'clock-direction') return <ArrowBendUpRight className={className} weight="bold" />
  if (type === 'arrive') return <MapPin className={className} data-testid="arrive-maneuver-map-pin-icon" weight="bold" />
  if (type === 'caution') return <Warning className={className} weight="bold" />
  return <ArrowUp className={className} weight="bold" />
}

function DrivingAssistSigns({ assist }: { assist: DrivingAssistInfo }) {
  const hasEventSign = Boolean(assist.alert || assist.facility)

  return (
    <div className="grid w-30 justify-items-start gap-2 max-sm:w-24">
      {assist.speedLimitKph ? (
        <div className="grid justify-items-start" data-testid="speed-limit-slot">
          <SpeedLimitSign speed={assist.speedLimitKph} />
        </div>
      ) : null}

      {hasEventSign ? (
        <div className="grid w-full gap-2" data-testid="driving-event-signs">
          {assist.alert ? (
            <div
              aria-label={[
                assist.alert.label,
                assist.alert.distanceLabel,
                assist.alert.active ? '' : '남음',
              ].filter(Boolean).join(' ')}
              className="grid justify-items-center"
            >
              {assist.alert.schoolZone ? (
                <WarningImageSign src={schoolZoneSignSrc} />
              ) : (
                <WarningImageSign src={getWarningSignSrc(assist.alert.type)} />
              )}
              <DistancePlaque label={assist.alert.distanceLabel} tone="danger" />
            </div>
          ) : null}
          {assist.facility ? (
            <div
              aria-label={`${assist.facility.label} ${assist.facility.distanceLabel} 남음`}
              className="grid justify-items-center"
            >
              <FacilitySign facility={assist.facility} />
              <DistancePlaque label={assist.facility.distanceLabel} tone="info" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function WarningImageSign({ src }: { src: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.26)]"
      draggable={false}
      src={src}
    />
  )
}

function getWarningSignSrc(type?: SafetyAlert['type']) {
  if (type === 'curve') return curveSignSrc
  if (type === 'falling-rock') return fallingRockSignSrc
  if (type === 'accident') return accidentSignSrc
  return cautionSignSrc
}

function FacilitySign({ facility }: { facility: NonNullable<DrivingAssistInfo['facility']> }) {
  const signSrc = getFacilitySignSrc(facility.signCode)

  return (
    <div className="grid w-full justify-items-center">
      <img
        alt=""
        aria-hidden="true"
        className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.24)]"
        draggable={false}
        src={signSrc}
      />
      <span className="sr-only">{facility.label}</span>
    </div>
  )
}

function getFacilitySignSrc(signCode?: number) {
  if (signCode === 120) return overpassSignSrc
  if (signCode === 121) return tunnelSignSrc
  if (signCode === 122) return bridgeSignSrc
  if (signCode === 123) return sideUnderpassSignSrc
  if (signCode === 124) return sideOverpassSignSrc
  if (signCode === 130) return boxTunnelSignSrc
  return underpassSignSrc
}

function DistancePlaque({ label, tone }: { label: string; tone: 'danger' | 'info' }) {
  return (
    <div className={[
      'mt-[-2px] w-full rounded-b-md px-2 py-1 text-center text-2xl font-black leading-none text-white shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:text-xl',
      tone === 'danger' ? 'bg-[#E84B2F]' : 'bg-[#1267B1]',
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
      className="grid size-24 place-items-center rounded-full border-[12px] border-[#E30613] bg-white text-center font-black leading-none text-[#1C1411] shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:size-20 max-sm:border-[10px]"
    >
      <span className="text-[2.65rem] max-sm:text-[2.15rem]">{speed}</span>
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
  route?: NavigationRoute
  travelledDistanceMeters: number
}): DrivingAssistInfo | undefined {
  const alerts = route?.safetyAlerts ?? []
  const activeAlert = alerts.find((alert) => isActiveSafetyAlert(alert, travelledDistanceMeters))
  const upcomingAlert = alerts.find((alert) => (
    alert.distanceFromStartMeters >= travelledDistanceMeters &&
    alert.distanceFromStartMeters - travelledDistanceMeters <= 600
  ))
  const upcomingFacility = (route?.maneuvers ?? []).find((maneuver) => (
    isFacilityManeuver(maneuver) &&
    maneuver.distanceFromStartMeters >= travelledDistanceMeters &&
    maneuver.distanceFromStartMeters - travelledDistanceMeters <= 600
  ))
  const nearestRoadMatch = position
    ? getNearestRoadMatch(roadMatches, position)
    : roadMatches[0]
  const speedLimitKph = nearestRoadMatch?.speedLimitKph

  const assist: DrivingAssistInfo = {}

  const displayAlert = activeAlert ?? upcomingAlert

  if (displayAlert) {
    const active = displayAlert === activeAlert
    assist.alert = {
      type: displayAlert.type,
      label: displayAlert.label,
      distanceLabel: active ? '구간 내' : formatMeters(displayAlert.distanceFromStartMeters - travelledDistanceMeters),
      schoolZone: isSchoolZoneAlert(displayAlert),
      active,
    }
  }

  if (upcomingFacility) {
    assist.facility = {
      type: upcomingFacility.type,
      label: upcomingFacility.label,
      distanceLabel: formatMeters(upcomingFacility.distanceFromStartMeters - travelledDistanceMeters),
      signCode: upcomingFacility.signCode,
    }
  }

  if (speedLimitKph) {
    assist.speedLimitKph = speedLimitKph
  }

  return assist.alert || assist.facility || assist.speedLimitKph ? assist : undefined
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

function isActiveSafetyAlert(alert: SafetyAlert, travelledDistanceMeters: number) {
  const activeDistanceMeters = getActiveSafetyAlertDistanceMeters(alert)

  return (
    activeDistanceMeters > 0 &&
    travelledDistanceMeters >= alert.distanceFromStartMeters &&
    travelledDistanceMeters <= alert.distanceFromStartMeters + activeDistanceMeters
  )
}

function getActiveSafetyAlertDistanceMeters(alert: SafetyAlert) {
  if (isSchoolZoneAlert(alert)) return 300
  if (alert.type === 'enforcement') return 500
  if (alert.type === 'accident') return 300
  if (alert.type === 'curve') return 120
  if (alert.type === 'falling-rock') return 150
  if (alert.type === 'caution') return 150
  return 0
}

function formatMeters(distanceMeters: number) {
  const rounded = Math.max(0, Math.round(distanceMeters))
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}km` : `${rounded}m`
}

function formatRouteOptionDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))}분`
}

function formatRouteOptionDistance(distanceMeters: number) {
  return `${Math.max(0.1, distanceMeters / 1000).toFixed(1)} km`
}

function getRouteOptionDisplayLabel(option: NavigationRouteOption) {
  return option.isRecommended && option.label === '추천' ? '최적 경로' : option.label
}

function getDefaultRouteOptionId(options: NavigationRouteOption[]) {
  return options.find((option) => option.isRecommended)?.id ?? options[0]?.id
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

function createCurrentRoadMatchCoordinates(coordinate: Coordinate): Coordinate[] {
  return [
    coordinate,
    {
      lat: coordinate.lat,
      lng: coordinate.lng + 0.0002,
    },
  ]
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
    return '정보 없음'
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
