import { useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Bell,
  CaretRight,
  ChartLineUp,
  Check,
  Clock,
  EnvelopeSimple,
  Eye,
  FileText,
  Gauge,
  GearSix,
  HouseLine,
  List,
  MapPin,
  NavigationArrow,
  ShieldCheck,
  SignOut,
  SlidersHorizontal,
  Sparkle,
  SteeringWheel,
  TrendUp,
  UserCircle,
  VideoCamera,
  Warning,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DriverVideoPanel } from '@/features/navigation/components/NavigationShell'
import { cn } from '@/lib/utils'

const SESSION_KEY = 'jiin-dashboard-session'

type DashboardPath =
  | '/dashboard/login'
  | '/dashboard/overview'
  | '/dashboard/analysis'
  | '/dashboard/settings/navigation'
  | '/dashboard/settings/notifications'

type BehaviorType =
  | 'DROWSINESS'
  | 'PHONE_USE'
  | 'FOOD_OR_DRINK'
  | 'GAZE_AWAY'
  | 'SECONDARY_TASK'
  | 'REACHING_BEHIND'
  | 'SMOKING'

type BehaviorMetric = {
  type: BehaviorType
  label: string
  count: number
  averageDurationSeconds: number
  correctionRate: number
  riskLevel: number
  tone: 'success' | 'warning' | 'danger' | 'info'
}

type Trip = {
  id: string
  destination: string
  origin: string
  date: string
  startedAt: string
  duration: string
  distance: string
  distanceKm: number
  score: number
  events: number
  hasVideo: boolean
  averageSpeedKph: number
  routeSummary: string
}

type VideoEvent = {
  id: string
  tripId: string
  label: string
  time: string
  seconds: number
  type: BehaviorType
  riskLevel: number
  confidence: number
  corrected: boolean
  durationSeconds: number
  speedKph: number
  road: string
}

type PreferenceState = {
  mapMode: '2D' | '3D'
  guidanceVolume: number
  ttsSpeed: number
  warningMode: 'balanced' | 'sensitive'
}

type DateRangePreset = 'today' | 'yesterday' | '7d' | '30d' | 'custom'
type AnalysisTab = 'report' | 'video' | 'behavior'
type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom'
type SortMode = 'latest' | 'score-low' | 'events-high' | 'distance-high'
type CorrectionFilter = 'all' | 'corrected' | 'uncorrected'
type VideoFilter = 'all' | 'uncorrected' | 'risk-high' | BehaviorType
type ToastTone = 'success' | 'info' | 'warning' | 'error'

type DateRangeState = {
  preset: DateRangePreset
  start: string
  end: string
}

type DashboardState = {
  dateRange: DateRangeState
  selectedAnalysisDate: string
  analysisTab: AnalysisTab
  selectedTripId: string
  selectedEventId: string
  selectedBehaviorType: BehaviorType
}

type ProfileSettings = {
  displayName: string
  callName: string
  reportEmail: string
  agentPersonality: 'friendly' | 'formal' | 'warm' | 'concise'
  preferences: PreferenceState
  behaviorSensitivity: Record<BehaviorType, number>
}

type FavoritePlace = {
  id: string
  label: string
  address: string
  role: 'origin' | 'destination'
  pinned: boolean
}

type NotificationSettings = {
  enabled: Record<string, boolean>
  channels: Record<'app' | 'email' | 'push' | 'sms', boolean>
  frequency: 'instant' | 'daily' | 'weekly'
  quietStart: string
  quietEnd: string
  riskThreshold: number
}

type ToastMessage = {
  id: string
  tone: ToastTone
  message: string
}

const dashboardRoutes: Array<{
  path: DashboardPath
  label: string
  icon: typeof ChartLineUp
}> = [
  { path: '/dashboard/overview', label: '개요', icon: ChartLineUp },
  { path: '/dashboard/analysis', label: '분석', icon: FileText },
  { path: '/dashboard/settings/navigation', label: '네비게이션 설정', icon: GearSix },
  { path: '/dashboard/settings/notifications', label: '알림', icon: Bell },
]

const dashboardRouteGroups: Array<{ title: string; routes: typeof dashboardRoutes }> = [
  { title: '대시보드', routes: dashboardRoutes.filter((route) => route.path === '/dashboard/overview' || route.path === '/dashboard/analysis') },
  { title: '설정', routes: dashboardRoutes.filter((route) => route.path.startsWith('/dashboard/settings')) },
]

const behaviorMetrics: BehaviorMetric[] = [
  { type: 'DROWSINESS', label: '졸음', count: 8, averageDurationSeconds: 42, correctionRate: 78, riskLevel: 5, tone: 'warning' },
  { type: 'PHONE_USE', label: '휴대폰 사용', count: 5, averageDurationSeconds: 18, correctionRate: 64, riskLevel: 4, tone: 'danger' },
  { type: 'GAZE_AWAY', label: '시선 이탈', count: 12, averageDurationSeconds: 9, correctionRate: 72, riskLevel: 3, tone: 'warning' },
  { type: 'FOOD_OR_DRINK', label: '음식/음료', count: 2, averageDurationSeconds: 21, correctionRate: 100, riskLevel: 2, tone: 'info' },
  { type: 'SECONDARY_TASK', label: '보조 작업', count: 3, averageDurationSeconds: 16, correctionRate: 67, riskLevel: 3, tone: 'info' },
  { type: 'REACHING_BEHIND', label: '뒷좌석 확인', count: 1, averageDurationSeconds: 7, correctionRate: 100, riskLevel: 2, tone: 'success' },
  { type: 'SMOKING', label: '흡연', count: 0, averageDurationSeconds: 0, correctionRate: 0, riskLevel: 0, tone: 'success' },
]

const trips: Trip[] = [
  { id: 'trip-01', destination: '성수 오피스', origin: '집', date: '2026.07.05 08:32', startedAt: '2026-07-05T08:32:00', duration: '42분', distance: '18.4km', distanceKm: 18.4, score: 91, events: 2, hasVideo: true, averageSpeedKph: 42, routeSummary: '집 -> 성수 오피스 · 도심 간선도로' },
  { id: 'trip-02', destination: '강남역', origin: '회사', date: '2026.07.04 19:10', startedAt: '2026-07-04T19:10:00', duration: '36분', distance: '12.9km', distanceKm: 12.9, score: 84, events: 4, hasVideo: true, averageSpeedKph: 31, routeSummary: '회사 -> 강남역 · 정체 구간 포함' },
  { id: 'trip-03', destination: '분당 정자동', origin: '성수 오피스', date: '2026.07.03 21:44', startedAt: '2026-07-03T21:44:00', duration: '58분', distance: '31.2km', distanceKm: 31.2, score: 76, events: 7, hasVideo: false, averageSpeedKph: 37, routeSummary: '성수 오피스 -> 분당 정자동 · 영상 없음' },
  { id: 'trip-04', destination: '상암 DMC', origin: '집', date: '2026.07.02 09:08', startedAt: '2026-07-02T09:08:00', duration: '47분', distance: '22.1km', distanceKm: 22.1, score: 94, events: 1, hasVideo: true, averageSpeedKph: 45, routeSummary: '집 -> 상암 DMC · 원활' },
]

const videoEvents: VideoEvent[] = [
  { id: 'event-01', tripId: 'trip-01', label: '시선 이탈', time: '00:08:14', seconds: 494, type: 'GAZE_AWAY', riskLevel: 3, confidence: 92, corrected: true, durationSeconds: 9, speedKph: 42, road: '도심 간선도로' },
  { id: 'event-02', tripId: 'trip-01', label: '휴대폰 사용', time: '00:19:42', seconds: 1182, type: 'PHONE_USE', riskLevel: 4, confidence: 88, corrected: false, durationSeconds: 18, speedKph: 38, road: '성수대교 북단' },
  { id: 'event-03', tripId: 'trip-01', label: '졸음', time: '00:31:05', seconds: 1865, type: 'DROWSINESS', riskLevel: 5, confidence: 94, corrected: true, durationSeconds: 42, speedKph: 47, road: '강변북로' },
  { id: 'event-04', tripId: 'trip-02', label: '시선 이탈', time: '00:07:21', seconds: 441, type: 'GAZE_AWAY', riskLevel: 3, confidence: 84, corrected: false, durationSeconds: 12, speedKph: 28, road: '테헤란로' },
  { id: 'event-05', tripId: 'trip-02', label: '보조 작업', time: '00:15:08', seconds: 908, type: 'SECONDARY_TASK', riskLevel: 3, confidence: 81, corrected: true, durationSeconds: 16, speedKph: 12, road: '정체 구간' },
  { id: 'event-06', tripId: 'trip-03', label: '졸음', time: '00:28:44', seconds: 1724, type: 'DROWSINESS', riskLevel: 5, confidence: 91, corrected: false, durationSeconds: 37, speedKph: 52, road: '분당수서로' },
  { id: 'event-07', tripId: 'trip-04', label: '음식/음료', time: '00:11:36', seconds: 696, type: 'FOOD_OR_DRINK', riskLevel: 2, confidence: 78, corrected: true, durationSeconds: 21, speedKph: 44, road: '월드컵북로' },
]

const safetyTrend = [
  { day: '월', score: 82 },
  { day: '화', score: 85 },
  { day: '수', score: 79 },
  { day: '목', score: 88 },
  { day: '금', score: 91 },
  { day: '토', score: 93 },
  { day: '일', score: 89 },
]

const riskColors = {
  success: 'var(--nav-success)',
  warning: 'var(--nav-warning)',
  danger: 'var(--nav-danger)',
  info: 'var(--nav-primary-light)',
}

const MOCK_TODAY = '2026-07-05'

const DEFAULT_DASHBOARD_STATE: DashboardState = {
  dateRange: { preset: '7d', start: '2026-06-29', end: MOCK_TODAY },
  selectedAnalysisDate: MOCK_TODAY,
  analysisTab: 'report',
  selectedTripId: trips[0].id,
  selectedEventId: videoEvents[0].id,
  selectedBehaviorType: 'DROWSINESS',
}

const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  displayName: '안정현',
  callName: '나비야',
  reportEmail: 'driver@example.com',
  agentPersonality: 'friendly',
  preferences: { mapMode: '2D', guidanceVolume: 72, ttsSpeed: 1.05, warningMode: 'balanced' },
  behaviorSensitivity: {
    DROWSINESS: 9,
    PHONE_USE: 8,
    FOOD_OR_DRINK: 5,
    GAZE_AWAY: 8,
    SECONDARY_TASK: 7,
    REACHING_BEHIND: 4,
    SMOKING: 3,
  },
}

const DEFAULT_FAVORITE_PLACES: FavoritePlace[] = [
  { id: 'home', label: '집', address: '서울 광진구 능동로 209', role: 'origin', pinned: true },
  { id: 'work', label: '회사', address: '서울 성동구 성수이로 88', role: 'destination', pinned: true },
  { id: 'frequent', label: '자주 가는 곳', address: '경기 성남시 분당구 정자동', role: 'destination', pinned: false },
]

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: { weekly: true, risk: true, trip: false, video: true, score: true },
  channels: { app: true, email: true, push: true, sms: false },
  frequency: 'weekly',
  quietStart: '22:00',
  quietEnd: '07:00',
  riskThreshold: 4,
}

function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + offset)
  return date.toISOString().slice(0, 10)
}

function getDateRange(preset: DateRangePreset, current = DEFAULT_DASHBOARD_STATE.dateRange): DateRangeState {
  if (preset === 'today') return { preset, start: MOCK_TODAY, end: MOCK_TODAY }
  if (preset === 'yesterday') {
    const yesterday = shiftDate(MOCK_TODAY, -1)
    return { preset, start: yesterday, end: yesterday }
  }
  if (preset === '30d') return { preset, start: shiftDate(MOCK_TODAY, -29), end: MOCK_TODAY }
  if (preset === 'custom') return { ...current, preset }
  return { preset: '7d', start: shiftDate(MOCK_TODAY, -6), end: MOCK_TODAY }
}

function isTripInRange(trip: Trip, range: DateRangeState) {
  const date = trip.startedAt.slice(0, 10)
  return date >= range.start && date <= range.end
}

function getTripDate(trip: Trip) {
  return trip.startedAt.slice(0, 10)
}

function getDateLabel(value: string) {
  return value.split('-').join('.')
}

function sortTrips(items: Trip[], mode: SortMode) {
  return [...items].sort((a, b) => {
    if (mode === 'score-low') return a.score - b.score
    if (mode === 'events-high') return b.events - a.events
    if (mode === 'distance-high') return b.distanceKm - a.distanceKm
    return b.startedAt.localeCompare(a.startedAt)
  })
}

function getEventsForTrips(filteredTrips: Trip[]) {
  const ids = new Set(filteredTrips.map((trip) => trip.id))
  return videoEvents.filter((event) => ids.has(event.tripId))
}

function getTripEvents(tripId: string) {
  return videoEvents.filter((event) => event.tripId === tripId)
}

function getSummary(filteredTrips: Trip[], events: VideoEvent[]) {
  const tripCount = filteredTrips.length
  const totalDistance = filteredTrips.reduce((sum, trip) => sum + trip.distanceKm, 0)
  const averageScore = tripCount ? Math.round(filteredTrips.reduce((sum, trip) => sum + trip.score, 0) / tripCount) : 0
  const corrected = events.filter((event) => event.corrected).length
  const correctionRate = events.length ? Math.round((corrected / events.length) * 100) : 0
  return { averageScore, correctionRate, eventCount: events.length, totalDistance, tripCount }
}

function getBehaviorMetrics(events: VideoEvent[]) {
  return behaviorMetrics.map((metric) => {
    const items = events.filter((event) => event.type === metric.type)
    const corrected = items.filter((event) => event.corrected).length
    return {
      ...metric,
      count: items.length,
      averageDurationSeconds: items.length ? Math.round(items.reduce((sum, event) => sum + event.durationSeconds, 0) / items.length) : 0,
      correctionRate: items.length ? Math.round((corrected / items.length) * 100) : 0,
      riskLevel: items.length ? Math.max(...items.map((event) => event.riskLevel)) : 0,
    }
  })
}

function getHourlyData(events: VideoEvent[]) {
  const buckets = ['06', '09', '12', '15', '18', '21', '24'].map((hour) => ({ hour, count: 0 }))
  events.forEach((event) => {
    const trip = trips.find((item) => item.id === event.tripId)
    const hour = trip?.startedAt.slice(11, 13) ?? '12'
    const bucket = buckets.find((item) => item.hour === hour) ?? buckets[buckets.length - 1]
    bucket.count += 1
  })
  return buckets
}

function getTrendData(filteredTrips: Trip[]) {
  return safetyTrend.map((item, index) => ({
    day: item.day,
    score: filteredTrips[index]?.score ?? item.score,
  }))
}

function getInitialPath(): DashboardPath {
  const path = window.location.pathname
  if (path === '/dashboard/reports' || path === '/dashboard/videos' || path === '/dashboard/behavior' || path === '/dashboard/trips') {
    return '/dashboard/analysis'
  }
  if (dashboardRoutes.some((route) => route.path === path)) {
    return path as DashboardPath
  }
  if (path === '/dashboard/login') {
    return '/dashboard/login'
  }
  return '/dashboard/overview'
}

function formatBehaviorDuration(seconds: number) {
  return seconds > 0 ? `${seconds}초` : '기록 없음'
}

export function DashboardApp() {
  const [path, setPath] = useState<DashboardPath>(getInitialPath)
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem(SESSION_KEY) === 'active')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [dashboardState, setDashboardState] = useState<DashboardState>(DEFAULT_DASHBOARD_STATE)
  const [profileSettings, setProfileSettings] = useState<ProfileSettings>(DEFAULT_PROFILE_SETTINGS)
  const [favoritePlaces, setFavoritePlaces] = useState<FavoritePlace[]>(DEFAULT_FAVORITE_PLACES)
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const reducedMotion = useReducedMotion()

  const navigate = (nextPath: DashboardPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    setMobileNavOpen(false)
  }

  const filteredTrips = useMemo(
    () => trips.filter((trip) => isTripInRange(trip, dashboardState.dateRange)),
    [dashboardState.dateRange],
  )
  const filteredEvents = useMemo(
    () => getEventsForTrips(filteredTrips),
    [filteredTrips],
  )
  const analysisTrips = useMemo(
    () => sortTrips(trips.filter((trip) => getTripDate(trip) === dashboardState.selectedAnalysisDate), 'latest'),
    [dashboardState.selectedAnalysisDate],
  )
  const analysisEvents = useMemo(
    () => getEventsForTrips(analysisTrips),
    [analysisTrips],
  )
  const summary = useMemo(() => getSummary(filteredTrips, filteredEvents), [filteredTrips, filteredEvents])
  const behaviorMetricsForRange = useMemo(() => getBehaviorMetrics(filteredEvents), [filteredEvents])
  const selectedTrip = analysisTrips.find((trip) => trip.id === dashboardState.selectedTripId) ?? analysisTrips[0]
  const selectedTripEvents = selectedTrip ? getTripEvents(selectedTrip.id) : []
  const selectedEvent = selectedTripEvents.find((event) => event.id === dashboardState.selectedEventId) ?? selectedTripEvents[0] ?? analysisEvents[0]

  const notify = (message: string, tone: ToastTone = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setToasts((current) => [...current, { id, tone, message }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2200)
  }

  useEffect(() => {
    const handlePopState = () => setPath(getInitialPath())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!authenticated && path !== '/dashboard/login') {
      window.history.replaceState({}, '', '/dashboard/login')
      setPath('/dashboard/login')
      return
    }

    if (authenticated && path === '/dashboard/login') {
      window.history.replaceState({}, '', '/dashboard/overview')
      setPath('/dashboard/overview')
    }
  }, [authenticated, path])

  useEffect(() => {
    if (analysisTrips.length === 0) return
    const hasSelectedTrip = analysisTrips.some((trip) => trip.id === dashboardState.selectedTripId)
    if (!hasSelectedTrip) {
      const nextTrip = analysisTrips[0]
      const nextEvent = getTripEvents(nextTrip.id)[0]
      setDashboardState((current) => ({
        ...current,
        selectedTripId: nextTrip.id,
        selectedEventId: nextEvent?.id ?? current.selectedEventId,
      }))
    }
  }, [analysisTrips, dashboardState.selectedTripId])

  const handleLogin = () => {
    localStorage.setItem(SESSION_KEY, 'active')
    setAuthenticated(true)
    navigate('/dashboard/overview')
  }

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
    navigate('/dashboard/login')
  }

  if (!authenticated || path === '/dashboard/login') {
    return <MockLoginPage onLogin={handleLogin} reducedMotion={Boolean(reducedMotion)} />
  }

  return (
    <div className="min-h-dvh bg-gray-50 font-sans text-gray-900 lg:h-dvh lg:overflow-hidden">
      <div className="mx-auto flex min-h-dvh w-full max-w-[88rem] gap-5 p-0 lg:h-full lg:min-h-0 lg:p-5">
        <DashboardSidebar
          activePath={path}
          onLogout={handleLogout}
          onNavigate={navigate}
        />
        <div className="flex min-h-dvh min-w-0 flex-1 flex-col lg:min-h-0">
          <button className="fixed left-4 top-4 z-40 grid size-10 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-theme-xs hover:bg-gray-50 lg:hidden" onClick={() => setMobileNavOpen(true)} type="button" aria-label="모바일 메뉴 열기">
            <List className="size-5" weight="bold" />
          </button>
          <main className="min-h-0 flex-1 overflow-x-hidden px-4 pb-24 pt-16 sm:px-6 lg:overflow-y-auto lg:px-0 lg:pb-0 lg:pt-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={path}
                className="min-w-0"
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
              >
                <DashboardPage
                  analysisEvents={analysisEvents}
                  analysisTrips={analysisTrips}
                  behaviorMetrics={behaviorMetricsForRange}
                  dashboardState={dashboardState}
                  favoritePlaces={favoritePlaces}
                  filteredEvents={filteredEvents}
                  filteredTrips={filteredTrips}
                  navigate={navigate}
                  notificationSettings={notificationSettings}
                  notify={notify}
                  path={path}
                  profileSettings={profileSettings}
                  selectedEvent={selectedEvent}
                  selectedTrip={selectedTrip}
                  setDashboardState={setDashboardState}
                  setFavoritePlaces={setFavoritePlaces}
                  setNotificationSettings={setNotificationSettings}
                  setProfileSettings={setProfileSettings}
                  summary={summary}
                />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <DashboardMobileNav activePath={path} onNavigate={navigate} />

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-gray-900/30 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.aside
              className="absolute inset-y-0 left-0 w-[18rem] border-r border-gray-200 bg-white p-4 shadow-theme-md"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 flex items-center justify-between">
                <DashboardBrand />
                <button
                  className="grid size-10 place-items-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50"
                  onClick={() => setMobileNavOpen(false)}
                  type="button"
                  aria-label="모바일 메뉴 닫기"
                >
                  <X className="size-5" weight="bold" />
                </button>
              </div>
              <DashboardNavList activePath={path} onNavigate={navigate} />
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <ToastStack toasts={toasts} />
    </div>
  )
}

function MockLoginPage({ onLogin, reducedMotion }: { onLogin: () => void; reducedMotion: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-gray-50 px-5 py-10 text-gray-900">
      <motion.section
        className="relative grid w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[1.05fr_0.95fr]"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative min-h-[22rem] overflow-hidden bg-gray-900 p-8 text-white lg:p-10">
          <div className="relative z-10 flex h-full flex-col justify-between">
            <DashboardBrand inverted />
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/15">
                <Sparkle className="size-4" weight="fill" />
                주행 데이터와 Navi 설정을 한 곳에서
              </div>
              <h1 className="max-w-md text-4xl font-semibold tracking-normal text-white sm:text-5xl">
                JIIN 대시보드 로그인
              </h1>
              <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-white/70">
                최근 주행, 행동 분석, 리포트, 주행 영상과 네비게이션 설정을 운전자 본인 기준으로 확인합니다.
              </p>
            </div>
          </div>
        </div>
        <form
          className="p-7 sm:p-9 lg:p-10"
          onSubmit={(event) => {
            event.preventDefault()
            onLogin()
          }}
        >
          <div className="mb-8">
            <p className="text-sm font-medium text-brand-500">Mock account</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-gray-900">운전자 계정으로 시작</h2>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">이메일</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
              defaultValue="driver@example.com"
              type="email"
            />
          </label>
          <label className="mt-5 block">
            <span className="text-sm font-medium text-gray-700">비밀번호</span>
            <input
              className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
              defaultValue="demo-password"
              type="password"
            />
          </label>
          <button
            className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
            type="submit"
          >
            대시보드 시작
            <CaretRight className="size-4" weight="bold" />
          </button>
          <p className="mt-5 text-xs font-medium leading-5 text-gray-500">
            백엔드 인증 없이 localStorage 기반 mock 세션으로 동작합니다.
          </p>
        </form>
      </motion.section>
    </main>
  )
}

function DashboardBrand({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        'grid size-11 place-items-center rounded-xl shadow-theme-xs',
        inverted ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-brand-500 text-white',
      )}>
        <SteeringWheel className="size-6" weight="fill" />
      </div>
      <div>
        <div className={cn('text-base font-semibold tracking-normal', inverted ? 'text-white' : 'text-gray-900')}>JIIN</div>
        <div className={cn('text-xs font-medium', inverted ? 'text-white/60' : 'text-gray-500')}>운전자 대시보드</div>
      </div>
    </div>
  )
}

function DashboardSidebar({
  activePath,
  onLogout,
  onNavigate,
}: {
  activePath: DashboardPath
  onLogout: () => void
  onNavigate: (path: DashboardPath) => void
}) {
  return (
    <aside className="sticky top-5 hidden w-[17rem] shrink-0 self-start rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs lg:block">
      <DashboardBrand />
      <div className="mt-6">
        <DashboardNavList activePath={activePath} onNavigate={onNavigate} />
      </div>
      <div className="mt-6 border-t border-gray-200 pt-4">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-500">
            <SteeringWheel className="size-5" weight="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-gray-800">안정현 님</div>
          </div>
          <button
            aria-label="로그아웃"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            onClick={onLogout}
            type="button"
          >
            <SignOut className="size-4" weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  )
}

function DateRangeControl({
  dateRange,
  onCustomDateRangeChange,
  onDateRangeChange,
}: {
  dateRange: DateRangeState
  onCustomDateRangeChange: (key: 'start' | 'end', value: string) => void
  onDateRangeChange: (preset: DateRangePreset) => void
}) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <select
        aria-label="개요 기간"
        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
        onChange={(event) => onDateRangeChange(event.target.value as DateRangePreset)}
        value={dateRange.preset}
      >
        <option value="today">오늘</option>
        <option value="yesterday">어제</option>
        <option value="7d">최근 7일</option>
        <option value="30d">최근 30일</option>
        <option value="custom">사용자 지정</option>
      </select>
      {dateRange.preset === 'custom' ? (
        <div className="mt-2 grid gap-2">
          <input
            aria-label="시작일"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
            onChange={(event) => onCustomDateRangeChange('start', event.target.value)}
            type="date"
            value={dateRange.start}
          />
          <input
            aria-label="종료일"
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
            onChange={(event) => onCustomDateRangeChange('end', event.target.value)}
            type="date"
            value={dateRange.end}
          />
        </div>
      ) : null}
    </div>
  )
}

function DashboardNavList({ activePath, onNavigate }: { activePath: DashboardPath; onNavigate: (path: DashboardPath) => void }) {
  return (
    <nav className="space-y-5" aria-label="대시보드 메뉴">
      {dashboardRouteGroups.map((group) => (
        <div key={group.title}>
          <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{group.title}</div>
          <div className="space-y-1">
            {group.routes.map((route) => {
              const Icon = route.icon
              const active = activePath === route.path
              return (
                <a
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition',
                    active
                      ? 'bg-brand-50 text-brand-500'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-700',
                  )}
                  href={route.path}
                  key={route.path}
                  onClick={(event) => {
                    event.preventDefault()
                    onNavigate(route.path)
                  }}
                >
                  <Icon className="size-5" weight={active ? 'fill' : 'bold'} />
                  {route.label}
                </a>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

function DashboardMobileNav({ activePath, onNavigate }: { activePath: DashboardPath; onNavigate: (path: DashboardPath) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 rounded-2xl border border-gray-200 bg-white p-1 shadow-theme-md lg:hidden" aria-label="모바일 대시보드 메뉴">
      {dashboardRoutes.slice(0, 5).map((route) => {
        const Icon = route.icon
        const active = activePath === route.path
        return (
          <a
            aria-label={`모바일 ${route.label}`}
            className={cn('grid min-h-12 place-items-center rounded-lg text-[11px] font-medium', active ? 'bg-brand-50 text-brand-500' : 'text-gray-500')}
            href={route.path}
            key={route.path}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(route.path)
            }}
          >
            <Icon className="size-5" weight={active ? 'fill' : 'bold'} />
            <span className="sr-only">{route.label}</span>
          </a>
        )
      })}
    </nav>
  )
}

type DashboardPageProps = {
  analysisEvents: VideoEvent[]
  analysisTrips: Trip[]
  behaviorMetrics: BehaviorMetric[]
  dashboardState: DashboardState
  favoritePlaces: FavoritePlace[]
  filteredEvents: VideoEvent[]
  filteredTrips: Trip[]
  navigate: (path: DashboardPath) => void
  notificationSettings: NotificationSettings
  notify: (message: string, tone?: ToastTone) => void
  path: DashboardPath
  profileSettings: ProfileSettings
  selectedEvent?: VideoEvent
  selectedTrip?: Trip
  setDashboardState: Dispatch<SetStateAction<DashboardState>>
  setFavoritePlaces: Dispatch<SetStateAction<FavoritePlace[]>>
  setNotificationSettings: Dispatch<SetStateAction<NotificationSettings>>
  setProfileSettings: Dispatch<SetStateAction<ProfileSettings>>
  summary: ReturnType<typeof getSummary>
}

function DashboardPage(props: DashboardPageProps) {
  if (props.path === '/dashboard/analysis') return <AnalysisPage {...props} />
  if (props.path === '/dashboard/settings/navigation') return <NavigationSettingsPage {...props} />
  if (props.path === '/dashboard/settings/notifications') return <NotificationsPage {...props} />
  return <OverviewPage {...props} />
}

function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-gray-900">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-gray-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

function MetricCard({ icon, label, value, caption, tone = 'info' }: { icon: ReactNode; label: string; value: string; caption: string; tone?: BehaviorMetric['tone'] }) {
  return (
    <motion.section
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-gray-500">{label}</div>
        <div className="grid size-10 place-items-center rounded-lg" style={{ background: `color-mix(in srgb, ${riskColors[tone]} 12%, white)`, color: riskColors[tone] }}>
          {icon}
        </div>
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-normal text-gray-900">{value}</div>
      <div className="mt-1 text-xs font-medium text-gray-500">{caption}</div>
    </motion.section>
  )
}

function OverviewPage({ behaviorMetrics, dashboardState, filteredEvents, filteredTrips, navigate, setDashboardState, summary }: DashboardPageProps) {
  const topBehavior = behaviorMetrics.filter((metric) => metric.count > 0).sort((a, b) => b.count - a.count)[0] ?? behaviorMetrics[0]
  const trend = getTrendData(filteredTrips)
  const pendingEvents = filteredEvents.filter((event) => !event.corrected).slice(0, 4)
  const updateDateRange = (preset: DateRangePreset) => {
    setDashboardState((current) => ({ ...current, dateRange: getDateRange(preset, current.dateRange) }))
  }
  const updateCustomDateRange = (key: 'start' | 'end', value: string) => {
    setDashboardState((current) => ({ ...current, dateRange: { ...current.dateRange, preset: 'custom', [key]: value } }))
  }
  return (
    <section>
      <PageHeader
        title="운전 리포트 개요"
        description="선택한 기간의 주행, 행동, 주행 영상과 교정 상태를 확인합니다."
        action={<DateRangeControl dateRange={dashboardState.dateRange} onCustomDateRangeChange={updateCustomDateRange} onDateRangeChange={updateDateRange} />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ShieldCheck className="size-5" weight="fill" />} label="안전 점수" value={`${summary.averageScore}점`} caption={`${summary.tripCount}회 주행 기준`} tone="success" />
        <MetricCard icon={<NavigationArrow className="size-5" weight="fill" />} label="총 주행 거리" value={`${summary.totalDistance.toFixed(1)}km`} caption={`${summary.tripCount}회 주행`} />
        <MetricCard icon={<Warning className="size-5" weight="fill" />} label="주의 행동" value={`${summary.eventCount}건`} caption={`${topBehavior.label} 최다`} tone="warning" />
        <MetricCard icon={<Check className="size-5" weight="bold" />} label="교정률" value={`${summary.correctionRate}%`} caption="경고 후 교정 완료 비율" tone="success" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="주간 안전 점수" icon={<TrendUp className="size-5" weight="bold" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="scoreGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--nav-primary)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--nav-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--nav-border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis domain={[60, 100]} tickLine={false} axisLine={false} width={32} />
                <Tooltip />
                <Area dataKey="score" stroke="var(--nav-primary)" strokeWidth={3} fill="url(#scoreGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="확인 필요 이벤트" icon={<Eye className="size-5" weight="bold" />}>
          <EventList
            emptyText="확인할 이벤트가 없습니다."
            events={pendingEvents}
            onEventClick={(event) => {
              const trip = trips.find((item) => item.id === event.tripId)
              setDashboardState((current) => ({
                ...current,
                analysisTab: 'video',
                selectedAnalysisDate: trip ? getTripDate(trip) : current.selectedAnalysisDate,
                selectedTripId: event.tripId,
                selectedEventId: event.id,
                selectedBehaviorType: event.type,
              }))
              navigate('/dashboard/analysis')
            }}
          />
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <RecentTrips filteredTrips={filteredTrips} navigate={navigate} setDashboardState={setDashboardState} />
        <BehaviorDistribution behaviorMetrics={behaviorMetrics} navigate={navigate} setDashboardState={setDashboardState} />
      </div>
    </section>
  )
}

function Panel({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs', className)}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <div className="text-brand-500">{icon}</div> : null}
        <h2 className="text-base font-medium tracking-normal text-gray-800">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function RecentTrips({ filteredTrips, navigate, setDashboardState }: { filteredTrips: Trip[]; navigate: (path: DashboardPath) => void; setDashboardState: Dispatch<SetStateAction<DashboardState>> }) {
  return (
    <Panel title="최근 주행" icon={<Clock className="size-5" weight="bold" />}>
      <div className="space-y-2">
        {filteredTrips.slice(0, 3).map((trip) => (
          <button
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-gray-50 p-3 text-left transition hover:bg-gray-100"
            key={trip.id}
            onClick={() => {
              setDashboardState((current) => ({
                ...current,
                analysisTab: 'report',
                selectedAnalysisDate: getTripDate(trip),
                selectedTripId: trip.id,
                selectedEventId: getTripEvents(trip.id)[0]?.id ?? current.selectedEventId,
              }))
              navigate('/dashboard/analysis')
            }}
            type="button"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-800">{trip.destination}</div>
              <div className="mt-1 text-xs font-medium text-gray-500">{trip.date} · {trip.distance} · {trip.duration}</div>
            </div>
            <div className="text-right text-sm font-medium text-brand-500">{trip.score}점</div>
          </button>
        ))}
        {filteredTrips.length === 0 ? <EmptyState text="선택 기간에 주행 기록이 없습니다." /> : null}
      </div>
    </Panel>
  )
}

function BehaviorDistribution({ behaviorMetrics, navigate, setDashboardState }: { behaviorMetrics: BehaviorMetric[]; navigate: (path: DashboardPath) => void; setDashboardState: Dispatch<SetStateAction<DashboardState>> }) {
  return (
    <Panel title="행동 분포" icon={<Gauge className="size-5" weight="bold" />}>
      <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={behaviorMetrics.filter((item) => item.count > 0)} dataKey="count" innerRadius={48} outerRadius={78} paddingAngle={3}>
                {behaviorMetrics.filter((item) => item.count > 0).map((entry) => (
                  <Cell fill={riskColors[entry.tone]} key={entry.type} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {behaviorMetrics.slice(0, 5).map((item) => (
            <button
              className="flex w-full items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-left transition hover:bg-gray-100"
              key={item.type}
              onClick={() => {
                setDashboardState((current) => ({ ...current, analysisTab: 'behavior', selectedBehaviorType: item.type }))
                navigate('/dashboard/analysis')
              }}
              type="button"
            >
              <span className="text-sm font-medium text-gray-500">{item.label}</span>
              <span className="text-sm font-medium text-gray-800">{item.count}건</span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function AnalysisPage(props: DashboardPageProps) {
  const { analysisEvents, analysisTrips, dashboardState, selectedTrip, setDashboardState } = props
  const analysisBehaviorMetrics = useMemo(() => getBehaviorMetrics(analysisEvents), [analysisEvents])
  const analysisSummary = useMemo(() => getSummary(analysisTrips, analysisEvents), [analysisTrips, analysisEvents])
  const analysisProps = {
    ...props,
    behaviorMetrics: analysisBehaviorMetrics,
    filteredEvents: analysisEvents,
    filteredTrips: analysisTrips,
    summary: analysisSummary,
  }
  const tripDates = Array.from(new Set(trips.map((trip) => getTripDate(trip)))).sort((a, b) => b.localeCompare(a))

  const selectDate = (value: string) => {
    const nextTrips = sortTrips(trips.filter((trip) => getTripDate(trip) === value), 'latest')
    const nextTrip = nextTrips[0]
    const nextEvent = nextTrip ? getTripEvents(nextTrip.id)[0] : undefined
    setDashboardState((current) => ({
      ...current,
      selectedAnalysisDate: value,
      selectedTripId: nextTrip?.id ?? current.selectedTripId,
      selectedEventId: nextEvent?.id ?? current.selectedEventId,
    }))
  }

  const selectTrip = (tripId: string) => {
    const nextEvent = getTripEvents(tripId)[0]
    setDashboardState((current) => ({
      ...current,
      selectedTripId: tripId,
      selectedEventId: nextEvent?.id ?? current.selectedEventId,
    }))
  }

  return (
    <section>
      <PageHeader title="분석" description="날짜와 주행 기록을 선택한 뒤 보고서, 영상, 행동을 한 화면에서 전환합니다." />
      <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs">
        <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <label className="block">
            <span className="text-xs font-medium text-gray-500">날짜</span>
            <input
              aria-label="분석 날짜"
              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
              onChange={(event) => selectDate(event.target.value)}
              type="date"
              value={dashboardState.selectedAnalysisDate}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500">주행 기록</span>
            <select
              aria-label="분석 주행 기록"
              className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
              disabled={analysisTrips.length === 0}
              onChange={(event) => selectTrip(event.target.value)}
              value={selectedTrip?.id ?? ''}
            >
              {analysisTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.origin} - {trip.destination} · {trip.startedAt.slice(11, 16)} · {trip.distance}
                </option>
              ))}
            </select>
          </label>
        </div>
        {analysisTrips.length === 0 ? <div className="mt-3"><EmptyState text="선택한 날짜에 주행 기록이 없습니다." /></div> : null}
      </div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200">
        <SettingsTabButton active={dashboardState.analysisTab === 'report'} onClick={() => setDashboardState((current) => ({ ...current, analysisTab: 'report' }))}>보고서</SettingsTabButton>
        <SettingsTabButton active={dashboardState.analysisTab === 'video'} onClick={() => setDashboardState((current) => ({ ...current, analysisTab: 'video' }))}>주행 영상</SettingsTabButton>
        <SettingsTabButton active={dashboardState.analysisTab === 'behavior'} onClick={() => setDashboardState((current) => ({ ...current, analysisTab: 'behavior' }))}>운전 행동</SettingsTabButton>
      </div>
      {analysisTrips.length === 0 ? null : (
        <>
          {dashboardState.analysisTab === 'report' ? <ReportsPage {...analysisProps} embedded /> : null}
          {dashboardState.analysisTab === 'video' ? <VideosPage {...analysisProps} embedded /> : null}
          {dashboardState.analysisTab === 'behavior' ? <BehaviorPage {...analysisProps} embedded /> : null}
        </>
      )}
      <div className="sr-only">
        {tripDates.map((date) => <span key={date}>{getDateLabel(date)}</span>)}
      </div>
    </section>
  )
}

function ReportsPage({ embedded = false, filteredEvents, filteredTrips, navigate, notify, selectedTrip, setDashboardState, summary }: DashboardPageProps & { embedded?: boolean }) {
  const [reportType, setReportType] = useState<ReportType>('weekly')
  const [sortMode, setSortMode] = useState<SortMode>('latest')
  const sessionList = sortTrips(filteredTrips, sortMode)
  const activeTrip = selectedTrip ?? sessionList[0]
  const activeEvents = activeTrip ? getTripEvents(activeTrip.id) : []
  const exportReport = (type: 'PDF' | 'CSV') => notify(`${type} 다운로드가 준비되었습니다.`)
  return (
    <section>
      {!embedded ? (
        <PageHeader
          title="주행 보고서"
          action={<div className="flex flex-wrap gap-2"><DashboardActionButton onClick={() => exportReport('PDF')}>PDF 다운로드</DashboardActionButton><DashboardActionButton variant="secondary" onClick={() => exportReport('CSV')}>CSV 다운로드</DashboardActionButton><DashboardActionButton variant="secondary" onClick={() => notify('리포트 이메일 발송을 예약했습니다.')}>이메일 발송</DashboardActionButton></div>}
        />
      ) : null}
      <Toolbar>
        <SelectControl label="보고서 유형" value={reportType} onChange={(value) => setReportType(value as ReportType)} options={[['daily', '일간'], ['weekly', '주간'], ['monthly', '월간'], ['custom', '사용자 지정']]} />
        <SelectControl label="세션 정렬" value={sortMode} onChange={(value) => setSortMode(value as SortMode)} options={[['latest', '최신순'], ['score-low', '점수 낮은 순'], ['events-high', '이벤트 많은 순'], ['distance-high', '거리 긴 순']]} />
        {embedded ? (
          <>
            <DashboardActionButton onClick={() => exportReport('PDF')}>PDF 다운로드</DashboardActionButton>
            <DashboardActionButton variant="secondary" onClick={() => exportReport('CSV')}>CSV 다운로드</DashboardActionButton>
            <DashboardActionButton variant="secondary" onClick={() => notify('리포트 이메일 발송을 예약했습니다.')}>이메일 발송</DashboardActionButton>
          </>
        ) : null}
      </Toolbar>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ShieldCheck className="size-5" weight="fill" />} label="평균 안전 점수" value={`${summary.averageScore}점`} caption={`${reportType === 'custom' ? '사용자 지정' : '선택'} 기간`} tone="success" />
        <MetricCard icon={<Warning className="size-5" weight="fill" />} label="행동 이벤트" value={`${summary.eventCount}건`} caption={`${filteredEvents.filter((event) => event.riskLevel >= 4).length}건 고위험`} tone="warning" />
        <MetricCard icon={<Check className="size-5" weight="bold" />} label="교정 완료" value={`${summary.correctionRate}%`} caption="경고 후 교정 완료" tone="success" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Panel title="안전 점수 추이" icon={<ChartLineUp className="size-5" weight="bold" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={getTrendData(filteredTrips)}>
                <CartesianGrid stroke="var(--nav-border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis domain={[60, 100]} tickLine={false} axisLine={false} width={32} />
                <Tooltip />
                <Line dataKey="score" stroke="var(--nav-primary)" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="세션 리포트" icon={<FileText className="size-5" weight="bold" />}>
          <div className="space-y-2">
            {sessionList.map((trip) => (
              <button
                className={cn('w-full rounded-lg p-3 text-left transition', activeTrip?.id === trip.id ? 'bg-brand-50 ring-1 ring-brand-100' : 'bg-gray-50 hover:bg-gray-100')}
                key={trip.id}
                onClick={() => setDashboardState((current) => ({ ...current, selectedTripId: trip.id, selectedEventId: getTripEvents(trip.id)[0]?.id ?? current.selectedEventId }))}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-gray-800">{trip.destination}</div>
                  <div className="text-sm font-medium text-brand-500">{trip.score}점</div>
                </div>
                <div className="mt-1 text-xs font-medium text-gray-500">{trip.date} · 이벤트 {trip.events}건</div>
              </button>
            ))}
            {sessionList.length === 0 ? <EmptyState text="보고서로 만들 주행 세션이 없습니다." /> : null}
          </div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="선택 세션 상세" icon={<FileText className="size-5" weight="bold" />}>
          {activeTrip ? <TripDetail trip={activeTrip} /> : <EmptyState text="선택된 세션이 없습니다." />}
        </Panel>
        <Panel title="이벤트 타임라인" icon={<Clock className="size-5" weight="bold" />}>
          <EventList
            events={activeEvents}
            onEventClick={(event) => {
              setDashboardState((current) => ({ ...current, analysisTab: 'video', selectedTripId: event.tripId, selectedEventId: event.id, selectedBehaviorType: event.type }))
              navigate('/dashboard/analysis')
            }}
          />
        </Panel>
      </div>
    </section>
  )
}

function VideosPage({ dashboardState, embedded = false, filteredTrips, selectedEvent, selectedTrip, setDashboardState }: DashboardPageProps & { embedded?: boolean }) {
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('all')
  const [currentTime, setCurrentTime] = useState(selectedEvent?.seconds ?? 0)
  const videoTrips = filteredTrips.filter((trip) => trip.hasVideo)
  const activeTrip = embedded ? selectedTrip : selectedTrip?.hasVideo ? selectedTrip : videoTrips[0]
  const tripEvents = activeTrip ? getTripEvents(activeTrip.id) : []
  const videoFilterOptions: Array<[VideoFilter, string]> = [
    ['all', '전체'],
    ['uncorrected', '미교정'],
    ['risk-high', '고위험'],
    ...behaviorMetrics.map((metric) => [metric.type, metric.label] as [VideoFilter, string]),
  ]
  const visibleEvents = tripEvents.filter((event) => {
    if (videoFilter === 'uncorrected') return !event.corrected
    if (videoFilter === 'risk-high') return event.riskLevel >= 4
    if (videoFilter === 'all') return true
    return event.type === videoFilter
  })

  useEffect(() => {
    if (selectedEvent) setCurrentTime(selectedEvent.seconds)
  }, [selectedEvent])

  return (
    <section>
      {!embedded ? <PageHeader title="주행 영상" /> : null}
      <Toolbar>
        {!embedded ? (
          <SelectControl
            label="주행 선택"
            value={activeTrip?.id ?? ''}
            onChange={(value) => {
              const nextEvent = getTripEvents(value)[0]
              setDashboardState((current) => ({ ...current, selectedTripId: value, selectedEventId: nextEvent?.id ?? current.selectedEventId }))
            }}
            options={videoTrips.map((trip) => [trip.id, `${trip.origin} -> ${trip.destination}`])}
          />
        ) : null}
        <div aria-label="이벤트 필터" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="group">
          {videoFilterOptions.map(([value, label]) => (
            <button
              className={cn(
                'h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition',
                videoFilter === value ? 'bg-brand-500 text-white shadow-theme-xs' : 'bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50'
              )}
              key={value}
              onClick={() => setVideoFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </Toolbar>
      {!activeTrip?.hasVideo ? <Panel title="영상 없음" icon={<VideoCamera className="size-5" weight="bold" />}><EmptyState text="선택한 주행에는 영상이 없습니다." /></Panel> : (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_24rem]">
        <Panel title="주행 영상" icon={<VideoCamera className="size-5" weight="bold" />}>
          <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
            <DriverVideoPanel
              allowVideoSelection={false}
              emptyDescription="선택한 주행의 이벤트 타임라인을 확인합니다."
              emptyTitle="주행 영상"
              error={false}
              fileName={`${activeTrip.origin} → ${activeTrip.destination}`}
              motionTiming={{ duration: 0.16 }}
              onError={() => undefined}
            />
            <div className="pointer-events-none absolute bottom-5 left-5 right-5">
              <div className="mb-3 flex items-center justify-between text-xs font-medium text-white/74">
                <span>{formatSeconds(currentTime)}</span>
                <span>42:18</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/16">
                <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${Math.min(100, (currentTime / 2538) * 100)}%` }} />
                {tripEvents.map((event) => (
                  <button
                    aria-label={`${event.label} 이벤트 보기`}
                    className={cn('pointer-events-auto absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-white transition', dashboardState.selectedEventId === event.id ? 'scale-125 bg-red-500' : 'bg-orange-500')}
                    key={event.id}
                    onClick={() => {
                      setCurrentTime(event.seconds)
                      setDashboardState((current) => ({ ...current, selectedEventId: event.id, selectedBehaviorType: event.type }))
                    }}
                    style={{ left: `${Math.min(96, Math.max(4, (event.seconds / 2538) * 100))}%` }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {visibleEvents.map((event) => (
              <button
                className={cn('rounded-lg p-3 text-left transition', dashboardState.selectedEventId === event.id ? 'bg-brand-50 text-brand-500' : 'bg-gray-50 text-gray-500 hover:bg-gray-100')}
                key={event.id}
                onClick={() => {
                  setCurrentTime(event.seconds)
                  setDashboardState((current) => ({ ...current, selectedEventId: event.id, selectedBehaviorType: event.type }))
                }}
                type="button"
              >
                <div className="text-xs font-semibold">{event.time}</div>
                <div className="mt-1 text-sm font-semibold">{event.label}</div>
              </button>
            ))}
            {visibleEvents.length === 0 ? <EmptyState text="필터에 맞는 이벤트가 없습니다." /> : null}
          </div>
        </Panel>
        <Panel title="선택 이벤트" icon={<Eye className="size-5" weight="bold" />}>
          {selectedEvent ? <div data-testid="dashboard-video-event-detail" className="rounded-lg bg-gray-50 p-4">
            <div className="text-2xl font-semibold text-gray-900">{selectedEvent.label}</div>
            <div className="mt-2 text-sm font-medium text-gray-500">{`${selectedEvent.time} · 위험도 ${selectedEvent.riskLevel}`}</div>
            <div className="mt-3 inline-flex rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600">{`위험도 ${selectedEvent.riskLevel}`}</div>
            <div className="mt-4 grid gap-2">
              <StatusRow label="신뢰도" value={`${selectedEvent.confidence}%`} />
              <StatusRow label="교정 여부" value={selectedEvent.corrected ? '교정됨' : '미교정'} />
              <StatusRow label="속도" value={`${selectedEvent.speedKph}km/h`} />
              <StatusRow label="도로" value={selectedEvent.road} />
            </div>
          </div> : <EmptyState text="선택된 이벤트가 없습니다." />}
        </Panel>
      </div>
      )}
    </section>
  )
}

function BehaviorPage({ behaviorMetrics, dashboardState, embedded = false, filteredEvents, navigate, setDashboardState }: DashboardPageProps & { embedded?: boolean }) {
  const [riskFilter, setRiskFilter] = useState('all')
  const [correctionFilter, setCorrectionFilter] = useState<CorrectionFilter>('all')
  const [hourFilter, setHourFilter] = useState('all')
  const selected = behaviorMetrics.find((metric) => metric.type === dashboardState.selectedBehaviorType) ?? behaviorMetrics[0]
  const selectedEvents = filteredEvents.filter((event) => {
    const trip = trips.find((item) => item.id === event.tripId)
    const hour = trip?.startedAt.slice(11, 13) ?? ''
    if (event.type !== selected.type) return false
    if (riskFilter === 'high' && event.riskLevel < 4) return false
    if (riskFilter === 'low' && event.riskLevel >= 4) return false
    if (correctionFilter === 'corrected' && !event.corrected) return false
    if (correctionFilter === 'uncorrected' && event.corrected) return false
    if (hourFilter !== 'all' && hour !== hourFilter) return false
    return true
  })
  return (
    <section>
      {!embedded ? <PageHeader title="운전 행동 분석" /> : null}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {behaviorMetrics.map((metric) => (
          <button
            className={cn('min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition', dashboardState.selectedBehaviorType === metric.type ? 'bg-brand-500 text-white shadow-theme-xs' : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50')}
            key={metric.type}
            onClick={() => setDashboardState((current) => ({ ...current, selectedBehaviorType: metric.type }))}
            type="button"
          >
            {metric.label} 필터
          </button>
        ))}
      </div>
      <Toolbar>
        <SelectControl label="위험도" value={riskFilter} onChange={setRiskFilter} options={[['all', '전체'], ['high', '고위험'], ['low', '일반']]} />
        <SelectControl label="교정 여부" value={correctionFilter} onChange={(value) => setCorrectionFilter(value as CorrectionFilter)} options={[['all', '전체'], ['corrected', '교정됨'], ['uncorrected', '미교정']]} />
        <SelectControl label="시간대" value={hourFilter} onChange={setHourFilter} options={[['all', '전체'], ['08', '08시'], ['09', '09시'], ['19', '19시'], ['21', '21시']]} />
      </Toolbar>
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="선택 행동" icon={<Warning className="size-5" weight="fill" />}>
          <div data-testid="dashboard-behavior-focus" className="rounded-lg bg-gray-50 p-5">
            <div className="text-sm font-medium text-brand-500">{selected.label}</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{selected.count}건</div>
            <div className="mt-2 text-sm font-medium text-gray-500">평균 지속 {formatBehaviorDuration(selected.averageDurationSeconds)}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <StatusTile label="위험도" value={`${selected.riskLevel}`} />
              <StatusTile label="교정률" value={`${selected.correctionRate}%`} />
            </div>
          </div>
        </Panel>
        <Panel title="시간대별 발생" icon={<Clock className="size-5" weight="bold" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={getHourlyData(selectedEvents.length ? selectedEvents : filteredEvents.filter((event) => event.type === selected.type))}>
                <CartesianGrid stroke="var(--nav-border)" vertical={false} />
                <XAxis dataKey="hour" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={32} />
                <Tooltip />
                <Bar dataKey="count" radius={[10, 10, 0, 0]} fill={riskColors[selected.tone]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {behaviorMetrics.slice(0, 6).map((metric) => (
          <MetricCard key={metric.type} icon={<Warning className="size-5" weight="fill" />} label={metric.label} value={`${metric.count}건`} caption={`교정률 ${metric.correctionRate}%`} tone={metric.tone} />
        ))}
      </div>
      <div className="mt-4">
        <Panel title="행동 이벤트" icon={<Warning className="size-5" weight="bold" />}>
          <EventList
            events={selectedEvents}
            onEventClick={(event) => {
              setDashboardState((current) => ({ ...current, analysisTab: 'video', selectedTripId: event.tripId, selectedEventId: event.id }))
              navigate('/dashboard/analysis')
            }}
          />
        </Panel>
      </div>
    </section>
  )
}

function NavigationSettingsPage({ favoritePlaces, notify, profileSettings, setFavoritePlaces, setProfileSettings }: DashboardPageProps) {
  const [draft, setDraft] = useState(profileSettings)
  const [placesDraft, setPlacesDraft] = useState(favoritePlaces)
  const [activeTab, setActiveTab] = useState<'settings' | 'favorites'>('settings')
  const [saved, setSaved] = useState(false)

  const save = () => {
    setProfileSettings(draft)
    setFavoritePlaces(placesDraft)
    setSaved(true)
    notify('네비게이션 설정을 저장했습니다.')
    window.setTimeout(() => setSaved(false), 1600)
  }

  const cancel = () => {
    setDraft(profileSettings)
    setPlacesDraft(favoritePlaces)
    notify('변경 내용을 취소했습니다.', 'info')
  }

  const reset = () => {
    setDraft(DEFAULT_PROFILE_SETTINGS)
    setPlacesDraft(DEFAULT_FAVORITE_PLACES)
    notify('기본값으로 되돌렸습니다.', 'warning')
  }

  const updatePlace = (id: string, patch: Partial<FavoritePlace>) => {
    setPlacesDraft((current) => current.map((place) => (place.id === id ? { ...place, ...patch } : place)))
  }

  const addPlace = () => {
    setPlacesDraft((current) => [
      ...current,
      { id: `place-${Date.now()}`, label: '새 장소', address: '주소를 입력하세요', role: 'destination', pinned: false },
    ])
  }

  return (
    <section>
      <PageHeader
        title="네비게이션 설정"
        action={<div className="flex flex-wrap gap-2"><DashboardActionButton variant="secondary" onClick={cancel}>취소</DashboardActionButton><DashboardActionButton variant="secondary" onClick={reset}>초기화</DashboardActionButton><DashboardActionButton onClick={save}>설정 저장</DashboardActionButton>{saved ? <span className="inline-flex h-10 items-center rounded-lg bg-green-50 px-3 text-sm font-medium text-green-600">저장됨</span> : null}</div>}
      />
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200">
        <SettingsTabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>기본 설정</SettingsTabButton>
        <SettingsTabButton active={activeTab === 'favorites'} onClick={() => setActiveTab('favorites')}>즐겨찾기 장소</SettingsTabButton>
      </div>
      {activeTab === 'settings' ? (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="프로필과 안내" icon={<UserCircle className="size-5" weight="bold" />}>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="프로필 이름" value={draft.displayName} onChange={(value) => setDraft((current) => ({ ...current, displayName: value }))} />
              <TextField label="Navi 호출명" value={draft.callName} onChange={(value) => setDraft((current) => ({ ...current, callName: value }))} />
              <TextField label="리포트 이메일" value={draft.reportEmail} onChange={(value) => setDraft((current) => ({ ...current, reportEmail: value }))} />
              <SelectControl label="Agent 성격" value={draft.agentPersonality} onChange={(value) => setDraft((current) => ({ ...current, agentPersonality: value as ProfileSettings['agentPersonality'] }))} options={[['friendly', '친근함'], ['formal', '정중함'], ['warm', '부드러움'], ['concise', '간결함']]} />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <RangeControl label="안내 음량" min={0} max={100} value={draft.preferences.guidanceVolume} suffix="%" onChange={(value) => setDraft((current) => ({ ...current, preferences: { ...current.preferences, guidanceVolume: value } }))} />
              <RangeControl label="TTS 속도" min={0.75} max={1.5} step={0.05} value={draft.preferences.ttsSpeed} suffix="x" onChange={(value) => setDraft((current) => ({ ...current, preferences: { ...current.preferences, ttsSpeed: value } }))} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <SettingButton active={draft.preferences.mapMode === '2D'} label="2D 지도 기본값" onClick={() => setDraft((current) => ({ ...current, preferences: { ...current.preferences, mapMode: '2D' } }))} />
              <SettingButton active={draft.preferences.mapMode === '3D'} label="3D 지도 기본값" onClick={() => setDraft((current) => ({ ...current, preferences: { ...current.preferences, mapMode: '3D' } }))} />
              <SettingButton active={draft.preferences.warningMode === 'sensitive'} label="민감한 경고 모드" onClick={() => setDraft((current) => ({ ...current, preferences: { ...current.preferences, warningMode: current.preferences.warningMode === 'sensitive' ? 'balanced' : 'sensitive' } }))} />
            </div>
          </Panel>
          <Panel title="행동별 민감도" icon={<SlidersHorizontal className="size-5" weight="bold" />}>
            <div className="grid gap-3 md:grid-cols-2">
              {behaviorMetrics.map((metric) => (
                <RangeControl
                  key={metric.type}
                  label={metric.label}
                  min={0}
                  max={10}
                  value={draft.behaviorSensitivity[metric.type]}
                  onChange={(value) => setDraft((current) => ({ ...current, behaviorSensitivity: { ...current.behaviorSensitivity, [metric.type]: value } }))}
                />
              ))}
            </div>
          </Panel>
        </div>
      ) : (
        <Panel title="즐겨찾기 장소" icon={<HouseLine className="size-5" weight="bold" />}>
          <div className="mb-3 flex justify-end">
            <DashboardActionButton variant="secondary" onClick={addPlace}>장소 추가</DashboardActionButton>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {placesDraft.map((place) => (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" key={place.id}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-800"><MapPin className="size-4 text-brand-500" weight="fill" />{place.role === 'origin' ? '출발지' : '목적지'}</div>
                  <div className="flex gap-2">
                    <button className={cn('rounded-lg px-2 py-1 text-xs font-medium', place.pinned ? 'bg-brand-50 text-brand-500' : 'bg-white text-gray-500')} onClick={() => updatePlace(place.id, { pinned: !place.pinned })} type="button">고정</button>
                    <button className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-red-500" onClick={() => setPlacesDraft((current) => current.filter((item) => item.id !== place.id))} type="button">삭제</button>
                  </div>
                </div>
                <TextField label="라벨" value={place.label} onChange={(value) => updatePlace(place.id, { label: value })} />
                <div className="mt-3">
                  <TextField label="주소" value={place.address} onChange={(value) => updatePlace(place.id, { address: value })} />
                </div>
                <div className="mt-3">
                  <SelectControl label="유형" value={place.role} onChange={(value) => updatePlace(place.id, { role: value as FavoritePlace['role'] })} options={[['origin', '출발지'], ['destination', '목적지']]} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </section>
  )
}

function NotificationsPage({ notificationSettings, notify, setNotificationSettings }: DashboardPageProps) {
  const [draft, setDraft] = useState(notificationSettings)

  const save = () => {
    setNotificationSettings(draft)
    notify('알림 설정을 저장했습니다.')
  }

  const cancel = () => {
    setDraft(notificationSettings)
    notify('알림 변경을 취소했습니다.', 'info')
  }

  const disableAll = () => {
    const confirmed = window.confirm('모든 알림을 끄시겠어요?')
    if (!confirmed) return
    setDraft((current) => ({
      ...current,
      enabled: Object.fromEntries(Object.keys(current.enabled).map((key) => [key, false])) as NotificationSettings['enabled'],
      channels: { app: false, email: false, push: false, sms: false },
    }))
    notify('모든 알림이 꺼졌습니다.', 'warning')
  }

  return (
    <section>
      <PageHeader title="알림 설정" action={<div className="flex flex-wrap gap-2"><DashboardActionButton variant="secondary" onClick={cancel}>취소</DashboardActionButton><DashboardActionButton variant="secondary" onClick={() => notify('테스트 알림을 발송했습니다.', 'info')}>테스트 알림</DashboardActionButton><DashboardActionButton variant="secondary" onClick={disableAll}>모두 끄기</DashboardActionButton><DashboardActionButton onClick={save}>저장</DashboardActionButton></div>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Panel title="알림 종류" icon={<Bell className="size-5" weight="bold" />}>
          {[
            ['weekly', '주간 리포트'],
            ['risk', '고위험 행동'],
            ['trip', '주행 완료'],
            ['video', '영상 준비'],
            ['score', '안전 점수 하락'],
          ].map(([id, title]) => (
            <ToggleRow
              key={id}
              enabled={draft.enabled[id]}
              title={title}
              onClick={() => setDraft((current) => ({ ...current, enabled: { ...current.enabled, [id]: !current.enabled[id] } }))}
            />
          ))}
        </Panel>
        <Panel title="수신 방식" icon={<EnvelopeSimple className="size-5" weight="bold" />}>
          <div className="grid gap-2">
            {[
              ['app', '앱'],
              ['email', '이메일'],
              ['push', '푸시'],
              ['sms', 'SMS'],
            ].map(([id, title]) => (
              <ToggleRow
                key={id}
                enabled={draft.channels[id as keyof NotificationSettings['channels']]}
                title={title}
                onClick={() => setDraft((current) => ({ ...current, channels: { ...current.channels, [id]: !current.channels[id as keyof NotificationSettings['channels']] } }))}
              />
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <SelectControl label="발송 빈도" value={draft.frequency} onChange={(value) => setDraft((current) => ({ ...current, frequency: value as NotificationSettings['frequency'] }))} options={[['instant', '즉시'], ['daily', '매일'], ['weekly', '매주']]} />
            <RangeControl label="위험도 threshold" min={1} max={5} value={draft.riskThreshold} onChange={(value) => setDraft((current) => ({ ...current, riskThreshold: value }))} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="조용한 시간 시작" value={draft.quietStart} onChange={(value) => setDraft((current) => ({ ...current, quietStart: value }))} type="time" />
              <TextField label="조용한 시간 종료" value={draft.quietEnd} onChange={(value) => setDraft((current) => ({ ...current, quietEnd: value }))} type="time" />
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const rest = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${rest}`
}

function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-xs">{children}</div>
}

function SelectControl({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500 shadow-theme-xs">
      {label}
      <select className="min-w-28 bg-transparent text-sm font-medium text-gray-800 outline-none" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  )
}

function TextField({ label, onChange, type = 'text', value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <input
        className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-800 outline-none transition focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  )
}

function RangeControl({ label, max, min, onChange, step = 1, suffix = '', value }: { label: string; max: number; min: number; onChange: (value: number) => void; step?: number; suffix?: string; value: number }) {
  return (
    <label className="rounded-lg bg-gray-50 p-3">
      <span className="flex items-center justify-between gap-3 text-sm font-medium text-gray-700">
        {label}
        <span className="text-brand-500">{value}{suffix}</span>
      </span>
      <input
        className="mt-3 w-full accent-[var(--nav-primary)]"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-5 text-center text-sm font-medium text-gray-500">{text}</div>
}

function TripDetail({ trip }: { trip: Trip }) {
  return (
    <div className="rounded-lg bg-gray-50 p-4">
      <div className="text-xl font-semibold text-gray-900">{trip.origin} - {trip.destination}</div>
      <div className="mt-1 text-sm font-medium text-gray-500">{trip.date}</div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatusTile label="거리" value={trip.distance} />
        <StatusTile label="시간" value={trip.duration} />
        <StatusTile label="점수" value={`${trip.score}점`} />
        <StatusTile label="평균 속도" value={`${trip.averageSpeedKph}km/h`} />
      </div>
      <div className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-gray-600">{trip.routeSummary}</div>
    </div>
  )
}

function EventList({ emptyText = '이벤트가 없습니다.', events, onEventClick }: { emptyText?: string; events: VideoEvent[]; onEventClick: (event: VideoEvent) => void }) {
  if (events.length === 0) return <EmptyState text={emptyText} />
  return (
    <div className="space-y-2">
      {events.map((event) => (
        <button
          className="flex w-full items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 text-left transition hover:bg-gray-100"
          key={event.id}
          onClick={() => onEventClick(event)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-gray-800">{event.label}</span>
            <span className="mt-1 block text-xs font-medium text-gray-500">{event.time} · 위험도 {event.riskLevel} · {event.corrected ? '교정됨' : '미교정'}</span>
          </span>
          <CaretRight className="size-4 shrink-0 text-gray-400" weight="bold" />
        </button>
      ))}
    </div>
  )
}

function ToggleRow({ enabled, onClick, title }: { enabled: boolean; onClick: () => void; title: string }) {
  return (
    <button className="mb-3 flex w-full items-center justify-between gap-4 rounded-lg bg-gray-50 p-4 text-left transition hover:bg-gray-100 last:mb-0" onClick={onClick} type="button">
      <span className="block text-sm font-medium text-gray-800">{title}</span>
      <span className={cn('relative h-7 w-12 rounded-full transition', enabled ? 'bg-brand-500' : 'bg-gray-300')}>
        <span className={cn('absolute top-1 size-5 rounded-full bg-white transition', enabled ? 'left-6' : 'left-1')} />
      </span>
    </button>
  )
}

function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="fixed right-4 top-4 z-[70] space-y-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'rounded-lg border px-4 py-3 text-sm font-medium shadow-theme-md',
              toast.tone === 'error' && 'border-red-200 bg-red-50 text-red-700',
              toast.tone === 'warning' && 'border-orange-200 bg-orange-50 text-orange-700',
              toast.tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-700',
              toast.tone === 'success' && 'border-green-200 bg-green-50 text-green-700',
            )}
            exit={{ opacity: 0, y: -8 }}
            initial={{ opacity: 0, y: -8 }}
            key={toast.id}
          >
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function DashboardActionButton({ children, disabled, onClick, variant = 'primary' }: { children: ReactNode; disabled?: boolean; onClick: () => void; variant?: 'primary' | 'secondary' }) {
  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium shadow-theme-xs transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
      <span className="font-medium text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">{value}</span>
    </div>
  )
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-theme-xs">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function SettingButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn('flex min-h-12 w-full items-center justify-between rounded-lg px-4 text-left text-sm font-medium transition', active ? 'bg-brand-50 text-brand-500 ring-1 ring-brand-100' : 'bg-gray-50 text-gray-600 hover:bg-gray-100')}
      onClick={onClick}
      type="button"
    >
      {label}
      {active ? <Check className="size-4" weight="bold" /> : null}
    </button>
  )
}

function SettingsTabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={cn(
        '-mb-px min-h-10 border-b-2 px-1 text-sm font-medium transition',
        active ? 'border-brand-500 text-brand-500' : 'border-transparent text-gray-500 hover:text-gray-800',
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
