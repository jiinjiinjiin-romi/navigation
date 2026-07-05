import { useEffect, useState, type ReactNode } from 'react'
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
  CalendarBlank,
  CarProfile,
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
  PlayCircle,
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
import { cn } from '@/lib/utils'

const SESSION_KEY = 'jiin-dashboard-session'

type DashboardPath =
  | '/dashboard/login'
  | '/dashboard/overview'
  | '/dashboard/reports'
  | '/dashboard/videos'
  | '/dashboard/behavior'
  | '/dashboard/trips'
  | '/dashboard/settings/navigation'
  | '/dashboard/settings/profile'
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
  date: string
  duration: string
  distance: string
  score: number
  events: number
  hasVideo: boolean
}

type VideoEvent = {
  id: string
  label: string
  time: string
  type: BehaviorType
  riskLevel: number
  confidence: number
  corrected: boolean
}

type PreferenceState = {
  mapMode: '2D' | '3D'
  guidanceVolume: number
  ttsSpeed: number
  warningMode: 'balanced' | 'sensitive'
}

const dashboardRoutes: Array<{
  path: DashboardPath
  label: string
  icon: typeof ChartLineUp
}> = [
  { path: '/dashboard/overview', label: '개요', icon: ChartLineUp },
  { path: '/dashboard/reports', label: '보고서', icon: FileText },
  { path: '/dashboard/videos', label: '주행 영상', icon: VideoCamera },
  { path: '/dashboard/behavior', label: '운전 행동', icon: Warning },
  { path: '/dashboard/trips', label: '주행 기록', icon: NavigationArrow },
  { path: '/dashboard/settings/navigation', label: '네비게이션 설정', icon: GearSix },
  { path: '/dashboard/settings/profile', label: '프로필', icon: UserCircle },
  { path: '/dashboard/settings/notifications', label: '알림', icon: Bell },
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
  { id: 'trip-01', destination: '성수 오피스', date: '2026.07.05 08:32', duration: '42분', distance: '18.4km', score: 91, events: 2, hasVideo: true },
  { id: 'trip-02', destination: '강남역', date: '2026.07.04 19:10', duration: '36분', distance: '12.9km', score: 84, events: 4, hasVideo: true },
  { id: 'trip-03', destination: '분당 정자동', date: '2026.07.03 21:44', duration: '58분', distance: '31.2km', score: 76, events: 7, hasVideo: false },
  { id: 'trip-04', destination: '상암 DMC', date: '2026.07.02 09:08', duration: '47분', distance: '22.1km', score: 94, events: 1, hasVideo: true },
]

const videoEvents: VideoEvent[] = [
  { id: 'event-01', label: '시선 이탈', time: '00:08:14', type: 'GAZE_AWAY', riskLevel: 3, confidence: 92, corrected: true },
  { id: 'event-02', label: '휴대폰 사용', time: '00:19:42', type: 'PHONE_USE', riskLevel: 4, confidence: 88, corrected: false },
  { id: 'event-03', label: '졸음', time: '00:31:05', type: 'DROWSINESS', riskLevel: 5, confidence: 94, corrected: true },
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

const hourlyBehavior = [
  { hour: '06', count: 1 },
  { hour: '09', count: 4 },
  { hour: '12', count: 2 },
  { hour: '15', count: 3 },
  { hour: '18', count: 7 },
  { hour: '21', count: 5 },
  { hour: '24', count: 2 },
]

const riskColors = {
  success: 'var(--nav-success)',
  warning: 'var(--nav-warning)',
  danger: 'var(--nav-danger)',
  info: 'var(--nav-primary-light)',
}

function getInitialPath(): DashboardPath {
  const path = window.location.pathname
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
  const reducedMotion = useReducedMotion()

  const navigate = (nextPath: DashboardPath) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
    setMobileNavOpen(false)
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
    <div className="min-h-screen bg-[var(--nav-frame)] font-sans text-[var(--nav-ink)]">
      <div className="flex min-h-screen">
        <DashboardSidebar activePath={path} onNavigate={navigate} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <DashboardTopbar onLogout={handleLogout} onOpenMobileNav={() => setMobileNavOpen(true)} />
          <main className="min-h-0 flex-1 overflow-x-hidden px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={path}
                initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <DashboardPage path={path} navigate={navigate} />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <DashboardMobileNav activePath={path} onNavigate={navigate} />

      <AnimatePresence>
        {mobileNavOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-[rgb(16_24_40/0.32)] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.aside
              className="absolute inset-y-0 left-0 w-[18rem] bg-white p-4 shadow-[var(--nav-shadow-panel)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4 flex items-center justify-between">
                <DashboardBrand />
                <button
                  className="grid size-10 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)]"
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
    </div>
  )
}

function MockLoginPage({ onLogin, reducedMotion }: { onLogin: () => void; reducedMotion: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center overflow-hidden bg-[var(--nav-frame)] px-5 py-10 text-[var(--nav-ink)]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_18%,rgb(109_93_246/0.18),transparent_30%),radial-gradient(circle_at_78%_22%,rgb(0_168_255/0.14),transparent_28%),linear-gradient(180deg,#f6f8fb,#eef3fb)]" />
      <motion.section
        className="relative grid w-full max-w-5xl overflow-hidden rounded-[1.5rem] bg-white shadow-[0_24px_70px_rgb(15_23_42/0.18)] ring-1 ring-white/70 lg:grid-cols-[1.05fr_0.95fr]"
        initial={reducedMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative min-h-[22rem] overflow-hidden bg-[var(--nav-ink)] p-8 text-white lg:p-10">
          <div className="navi-assistant-aura absolute inset-6 rounded-[1.25rem]" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <DashboardBrand inverted />
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-2 text-sm font-bold text-white ring-1 ring-white/18">
                <Sparkle className="size-4" weight="fill" />
                주행 데이터와 Navi 설정을 한 곳에서
              </div>
              <h1 className="max-w-md text-4xl font-black tracking-normal text-white sm:text-5xl">
                JIIN 대시보드 로그인
              </h1>
              <p className="mt-4 max-w-sm text-sm font-semibold leading-6 text-white/72">
                최근 주행, 행동 분석, 리포트, 영상 리뷰와 네비게이션 설정을 운전자 본인 기준으로 확인합니다.
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
            <p className="text-sm font-bold text-[var(--nav-primary)]">Mock account</p>
            <h2 className="mt-2 text-2xl font-black tracking-normal text-[var(--nav-ink)]">운전자 계정으로 시작</h2>
          </div>
          <label className="block">
            <span className="text-sm font-bold text-[var(--nav-muted)]">이메일</span>
            <input
              className="mt-2 h-12 w-full rounded-xl border border-[var(--nav-border)] bg-white px-4 text-base font-bold outline-none transition focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
              defaultValue="driver@example.com"
              type="email"
            />
          </label>
          <label className="mt-5 block">
            <span className="text-sm font-bold text-[var(--nav-muted)]">비밀번호</span>
            <input
              className="mt-2 h-12 w-full rounded-xl border border-[var(--nav-border)] bg-white px-4 text-base font-bold outline-none transition focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
              defaultValue="demo-password"
              type="password"
            />
          </label>
          <button
            className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--nav-primary)] px-5 text-sm font-black text-white shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--nav-primary)]"
            type="submit"
          >
            대시보드 시작
            <CaretRight className="size-4" weight="bold" />
          </button>
          <p className="mt-5 text-xs font-semibold leading-5 text-[var(--nav-muted)]">
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
        'grid size-11 place-items-center rounded-2xl shadow-[0_12px_32px_rgb(23_70_162/0.18)]',
        inverted ? 'bg-white/16 text-white ring-1 ring-white/20' : 'bg-[var(--nav-primary)] text-white',
      )}>
        <SteeringWheel className="size-6" weight="fill" />
      </div>
      <div>
        <div className={cn('text-base font-black tracking-normal', inverted ? 'text-white' : 'text-[var(--nav-ink)]')}>JIIN</div>
        <div className={cn('text-xs font-bold', inverted ? 'text-white/64' : 'text-[var(--nav-muted)]')}>Driver Dashboard</div>
      </div>
    </div>
  )
}

function DashboardSidebar({ activePath, onNavigate }: { activePath: DashboardPath; onNavigate: (path: DashboardPath) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 border-r border-[var(--nav-border)] bg-white/88 p-4 backdrop-blur-xl lg:block">
      <DashboardBrand />
      <div className="mt-8">
        <DashboardNavList activePath={activePath} onNavigate={onNavigate} />
      </div>
      <div className="absolute bottom-4 left-4 right-4 rounded-2xl bg-[var(--nav-panel)] p-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-white text-[var(--nav-primary)]">
            <ShieldCheck className="size-5" weight="fill" />
          </div>
          <div>
            <div className="text-sm font-black">안전 점수 89</div>
            <div className="text-xs font-bold text-[var(--nav-muted)]">지난주보다 +6점</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function DashboardNavList({ activePath, onNavigate }: { activePath: DashboardPath; onNavigate: (path: DashboardPath) => void }) {
  return (
    <nav className="space-y-1" aria-label="대시보드 메뉴">
      {dashboardRoutes.map((route) => {
        const Icon = route.icon
        const active = activePath === route.path
        return (
          <a
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-black transition',
              active
                ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]'
                : 'text-[var(--nav-muted)] hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]',
            )}
            href={route.path}
            key={route.path}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(route.path)
            }}
          >
            {active ? <motion.span className="absolute inset-y-2 left-0 w-1 rounded-full bg-[var(--nav-primary)]" layoutId="dashboard-active-rail" /> : null}
            <Icon className="size-5" weight={active ? 'fill' : 'bold'} />
            {route.label}
          </a>
        )
      })}
    </nav>
  )
}

function DashboardTopbar({ onLogout, onOpenMobileNav }: { onLogout: () => void; onOpenMobileNav: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--nav-border)] bg-[rgb(246_248_251/0.84)] px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <button className="grid size-10 place-items-center rounded-full bg-white text-[var(--nav-ink)] shadow-[0_6px_18px_rgb(15_23_42/0.08)] lg:hidden" onClick={onOpenMobileNav} type="button" aria-label="모바일 메뉴 열기">
          <List className="size-5" weight="bold" />
        </button>
        <div className="min-w-0">
          <div className="text-sm font-black text-[var(--nav-ink)]">안정현 님</div>
          <div className="truncate text-xs font-bold text-[var(--nav-muted)]">2026.06.29 - 2026.07.05 · 개인 운전자 리포트</div>
        </div>
        <div className="ml-auto hidden min-w-0 items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[var(--nav-muted)] shadow-[0_6px_18px_rgb(15_23_42/0.06)] sm:flex">
          <CalendarBlank className="size-4 text-[var(--nav-primary)]" weight="bold" />
          이번 주
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-black text-[var(--nav-muted)] shadow-[0_6px_18px_rgb(15_23_42/0.06)] transition hover:text-[var(--nav-danger)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onLogout}
          type="button"
        >
          <SignOut className="size-4" weight="bold" />
          <span className="hidden sm:inline">로그아웃</span>
        </button>
      </div>
    </header>
  )
}

function DashboardMobileNav({ activePath, onNavigate }: { activePath: DashboardPath; onNavigate: (path: DashboardPath) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[1.25rem] bg-white/94 p-1 shadow-[0_16px_44px_rgb(15_23_42/0.18)] ring-1 ring-[var(--nav-border)] backdrop-blur-xl lg:hidden" aria-label="모바일 대시보드 메뉴">
      {dashboardRoutes.slice(0, 5).map((route) => {
        const Icon = route.icon
        const active = activePath === route.path
        return (
          <a
            aria-label={`모바일 ${route.label}`}
            className={cn('grid min-h-12 place-items-center rounded-2xl text-[11px] font-black', active ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]' : 'text-[var(--nav-muted)]')}
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

function DashboardPage({ path, navigate }: { path: DashboardPath; navigate: (path: DashboardPath) => void }) {
  if (path === '/dashboard/reports') return <ReportsPage navigate={navigate} />
  if (path === '/dashboard/videos') return <VideosPage />
  if (path === '/dashboard/behavior') return <BehaviorPage />
  if (path === '/dashboard/trips') return <TripsPage navigate={navigate} />
  if (path === '/dashboard/settings/navigation') return <NavigationSettingsPage />
  if (path === '/dashboard/settings/profile') return <ProfileSettingsPage />
  if (path === '/dashboard/settings/notifications') return <NotificationsPage />
  return <OverviewPage navigate={navigate} />
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-black text-[var(--nav-primary)]">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-black tracking-normal text-[var(--nav-ink)]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-[var(--nav-muted)]">{description}</p>
      </div>
      {action}
    </div>
  )
}

function MetricCard({ icon, label, value, caption, tone = 'info' }: { icon: ReactNode; label: string; value: string; caption: string; tone?: BehaviorMetric['tone'] }) {
  return (
    <motion.section
      className="rounded-[1.1rem] bg-white p-4 shadow-[0_10px_30px_rgb(15_23_42/0.06)] ring-1 ring-[var(--nav-border)]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-black text-[var(--nav-muted)]">{label}</div>
        <div className="grid size-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${riskColors[tone]} 12%, white)`, color: riskColors[tone] }}>
          {icon}
        </div>
      </div>
      <div className="mt-4 text-3xl font-black tracking-normal text-[var(--nav-ink)]">{value}</div>
      <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">{caption}</div>
    </motion.section>
  )
}

function OverviewPage({ navigate }: { navigate: (path: DashboardPath) => void }) {
  const topBehavior = behaviorMetrics[0]
  return (
    <section>
      <PageHeader
        eyebrow="Driver Overview"
        title="운전 리포트 개요"
        description="최근 주행 데이터, 행동 패턴, 영상 리뷰와 Navi 설정 상태를 한 화면에서 확인합니다."
        action={<DashboardActionButton onClick={() => navigate('/dashboard/reports')}>전체 보고서 보기</DashboardActionButton>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ShieldCheck className="size-5" weight="fill" />} label="이번 주 안전 점수" value="89점" caption="지난주보다 6점 상승" tone="success" />
        <MetricCard icon={<NavigationArrow className="size-5" weight="fill" />} label="총 주행 거리" value="84.6km" caption="4회 주행 · 3시간 3분" />
        <MetricCard icon={<Warning className="size-5" weight="fill" />} label="주의 행동" value="31건" caption={`${topBehavior.label} 최다`} tone="warning" />
        <MetricCard icon={<Check className="size-5" weight="bold" />} label="교정률" value="74%" caption="알림 후 행동 개선 비율" tone="success" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <InsightPanel />
        <Panel title="주간 안전 점수" icon={<TrendUp className="size-5" weight="bold" />}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={safetyTrend}>
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
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <RecentTrips navigate={navigate} />
        <BehaviorDistribution />
      </div>
    </section>
  )
}

function InsightPanel() {
  return (
    <section className="navi-assistant-aura relative overflow-hidden rounded-[1.25rem] p-5 shadow-[var(--nav-shadow-ai)]">
      <div className="relative z-10">
        <div className="flex items-center gap-2 text-sm font-black text-[var(--nav-ai-primary)]">
          <Sparkle className="size-5" weight="fill" />
          Navi Insight
        </div>
        <h2 className="mt-4 max-w-xl text-2xl font-black tracking-normal text-[var(--nav-ink)]">
          저녁 시간대 시선 이탈이 늘었습니다.
        </h2>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[var(--nav-muted)]">
          18시 이후 주행에서 시선 이탈 이벤트가 전체의 46%를 차지합니다. 퇴근길에는 음성 안내 볼륨을 높이고 목적지 조작을 출발 전에 마치는 설정을 추천합니다.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/80 px-3 py-2 text-xs font-black text-[var(--nav-primary)] ring-1 ring-white">안내 볼륨 +10</span>
          <span className="rounded-full bg-white/80 px-3 py-2 text-xs font-black text-[var(--nav-warning)] ring-1 ring-white">시선 이탈 민감도 8</span>
        </div>
      </div>
    </section>
  )
}

function Panel({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[1.1rem] bg-white p-4 shadow-[0_10px_30px_rgb(15_23_42/0.06)] ring-1 ring-[var(--nav-border)]', className)}>
      <div className="mb-4 flex items-center gap-2">
        {icon ? <div className="text-[var(--nav-primary)]">{icon}</div> : null}
        <h2 className="text-base font-black tracking-normal text-[var(--nav-ink)]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function RecentTrips({ navigate }: { navigate: (path: DashboardPath) => void }) {
  return (
    <Panel title="최근 주행" icon={<Clock className="size-5" weight="bold" />}>
      <div className="space-y-2">
        {trips.slice(0, 3).map((trip) => (
          <button
            className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-[var(--nav-panel)] p-3 text-left transition hover:bg-[var(--nav-selection)]"
            key={trip.id}
            onClick={() => navigate('/dashboard/trips')}
            type="button"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-black text-[var(--nav-ink)]">{trip.destination}</div>
              <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">{trip.date} · {trip.distance} · {trip.duration}</div>
            </div>
            <div className="text-right text-sm font-black text-[var(--nav-primary)]">{trip.score}점</div>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function BehaviorDistribution() {
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
            <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--nav-panel)] px-3 py-2" key={item.type}>
              <span className="text-sm font-bold text-[var(--nav-muted)]">{item.label}</span>
              <span className="text-sm font-black text-[var(--nav-ink)]">{item.count}건</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function ReportsPage({ navigate }: { navigate: (path: DashboardPath) => void }) {
  return (
    <section>
      <PageHeader
        eyebrow="Reports"
        title="주행 보고서"
        description="기간별 안전 점수, 위험 행동, 교정률과 세션별 상세 리포트를 확인합니다."
        action={<DashboardActionButton onClick={() => navigate('/dashboard/videos')}>영상 리뷰로 이동</DashboardActionButton>}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<ShieldCheck className="size-5" weight="fill" />} label="평균 안전 점수" value="89점" caption="선택 기간 7일" tone="success" />
        <MetricCard icon={<Warning className="size-5" weight="fill" />} label="행동 이벤트" value="31건" caption="시선 이탈 12건" tone="warning" />
        <MetricCard icon={<Check className="size-5" weight="bold" />} label="교정 완료" value="23건" caption="평균 반응 3.2초" tone="success" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Panel title="안전 점수 추이" icon={<ChartLineUp className="size-5" weight="bold" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={safetyTrend}>
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
            {trips.map((trip) => (
              <div className="rounded-2xl bg-[var(--nav-panel)] p-3" key={trip.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-black">{trip.destination}</div>
                  <div className="text-sm font-black text-[var(--nav-primary)]">{trip.score}점</div>
                </div>
                <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">{trip.date} · 이벤트 {trip.events}건</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  )
}

function VideosPage() {
  const [selectedEventId, setSelectedEventId] = useState(videoEvents[0].id)
  const selectedEvent = videoEvents.find((event) => event.id === selectedEventId) ?? videoEvents[0]
  return (
    <section>
      <PageHeader eyebrow="Drive Videos" title="주행 영상 리뷰" description="주행 영상 위에 행동 이벤트 타임라인을 겹쳐 위험 순간과 교정 여부를 빠르게 확인합니다." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_24rem]">
        <Panel title="성수 오피스 주행 영상" icon={<VideoCamera className="size-5" weight="bold" />}>
          <div className="relative aspect-video overflow-hidden rounded-[1rem] bg-[var(--nav-ink)] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgb(59_130_246/0.26),transparent_32%),linear-gradient(145deg,#0f172a,#111827_52%,#020617)]" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid size-20 place-items-center rounded-full bg-white/12 text-white ring-1 ring-white/20">
                <PlayCircle className="size-12" weight="fill" />
              </div>
            </div>
            <div className="absolute bottom-5 left-5 right-5">
              <div className="mb-3 flex items-center justify-between text-xs font-bold text-white/74">
                <span>00:19:42</span>
                <span>42:18</span>
              </div>
              <div className="relative h-2 rounded-full bg-white/16">
                <div className="absolute inset-y-0 left-0 w-[46%] rounded-full bg-white" />
                {videoEvents.map((event) => (
                  <button
                    aria-label={`${event.label} 이벤트 보기`}
                    className={cn('absolute top-1/2 size-5 -translate-y-1/2 rounded-full border-2 border-white transition', selectedEventId === event.id ? 'scale-125 bg-[var(--nav-danger)]' : 'bg-[var(--nav-warning)]')}
                    key={event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    style={{ left: event.id === 'event-01' ? '18%' : event.id === 'event-02' ? '46%' : '74%' }}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {videoEvents.map((event) => (
              <button
                className={cn('rounded-2xl p-3 text-left transition', selectedEventId === event.id ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]' : 'bg-[var(--nav-panel)] text-[var(--nav-muted)] hover:bg-[var(--nav-selection)]')}
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
                type="button"
              >
                <div className="text-xs font-black">{event.time}</div>
                <div className="mt-1 text-sm font-black">{event.label}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="선택 이벤트" icon={<Eye className="size-5" weight="bold" />}>
          <div data-testid="dashboard-video-event-detail" className="rounded-[1rem] bg-[var(--nav-panel)] p-4">
            <div className="text-2xl font-black text-[var(--nav-ink)]">{selectedEvent.label}</div>
            <div className="mt-2 text-sm font-bold text-[var(--nav-muted)]">{`${selectedEvent.time} · 위험도 ${selectedEvent.riskLevel}`}</div>
            <div className="mt-3 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-black text-[var(--nav-danger)]">{`위험도 ${selectedEvent.riskLevel}`}</div>
            <div className="mt-4 grid gap-2">
              <StatusRow label="신뢰도" value={`${selectedEvent.confidence}%`} />
              <StatusRow label="교정 여부" value={selectedEvent.corrected ? '교정됨' : '미교정'} />
              <StatusRow label="속도" value="42km/h" />
              <StatusRow label="도로" value="도심 간선도로" />
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function BehaviorPage() {
  const [selectedType, setSelectedType] = useState<BehaviorType>('DROWSINESS')
  const selected = behaviorMetrics.find((metric) => metric.type === selectedType) ?? behaviorMetrics[0]
  return (
    <section>
      <PageHeader eyebrow="Behavior" title="운전 행동 분석" description="반복되는 위험 행동을 유형별로 분해하고, 시간대와 교정률 기준으로 개선 포인트를 보여줍니다." />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {behaviorMetrics.map((metric) => (
          <button
            className={cn('min-h-10 shrink-0 rounded-full px-4 text-sm font-black transition', selectedType === metric.type ? 'bg-[var(--nav-primary)] text-white shadow-[var(--nav-shadow-control)]' : 'bg-white text-[var(--nav-muted)] ring-1 ring-[var(--nav-border)] hover:bg-[var(--nav-panel)]')}
            key={metric.type}
            onClick={() => setSelectedType(metric.type)}
            type="button"
          >
            {metric.label} 필터
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="선택 행동" icon={<Warning className="size-5" weight="fill" />}>
          <div data-testid="dashboard-behavior-focus" className="rounded-[1rem] bg-[var(--nav-panel)] p-5">
            <div className="text-sm font-black text-[var(--nav-primary)]">{selected.label}</div>
            <div className="mt-2 text-3xl font-black">{selected.count}건</div>
            <div className="mt-2 text-sm font-bold text-[var(--nav-muted)]">평균 지속 {formatBehaviorDuration(selected.averageDurationSeconds)}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <StatusTile label="위험도" value={`${selected.riskLevel}`} />
              <StatusTile label="교정률" value={`${selected.correctionRate}%`} />
            </div>
          </div>
        </Panel>
        <Panel title="시간대별 발생" icon={<Clock className="size-5" weight="bold" />}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyBehavior}>
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
    </section>
  )
}

function TripsPage({ navigate }: { navigate: (path: DashboardPath) => void }) {
  const [selectedTripId, setSelectedTripId] = useState(trips[0].id)
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0]
  return (
    <section>
      <PageHeader eyebrow="Trips" title="주행 기록" description="각 주행의 목적지, 점수, 이벤트 수와 영상 유무를 비교합니다." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="주행 목록" icon={<NavigationArrow className="size-5" weight="bold" />}>
          <div className="overflow-hidden rounded-2xl ring-1 ring-[var(--nav-border)]">
            {trips.map((trip) => (
              <button
                className={cn('grid w-full grid-cols-[minmax(0,1fr)_5rem] gap-3 border-b border-[var(--nav-border)] p-4 text-left last:border-b-0', selectedTripId === trip.id ? 'bg-[var(--nav-primary-soft)]' : 'bg-white hover:bg-[var(--nav-panel)]')}
                key={trip.id}
                onClick={() => setSelectedTripId(trip.id)}
                type="button"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black">{trip.destination}</div>
                  <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">{trip.date} · {trip.distance} · {trip.duration}</div>
                </div>
                <div className="text-right text-sm font-black text-[var(--nav-primary)]">{trip.score}점</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="주행 상세" icon={<FileText className="size-5" weight="bold" />}>
          <div className="rounded-[1rem] bg-[var(--nav-panel)] p-4">
            <div className="text-xl font-black">{selectedTrip.destination}</div>
            <div className="mt-1 text-sm font-bold text-[var(--nav-muted)]">{selectedTrip.date}</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <StatusTile label="거리" value={selectedTrip.distance} />
              <StatusTile label="시간" value={selectedTrip.duration} />
              <StatusTile label="점수" value={`${selectedTrip.score}점`} />
              <StatusTile label="이벤트" value={`${selectedTrip.events}건`} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <DashboardActionButton onClick={() => navigate('/dashboard/reports')}>보고서 보기</DashboardActionButton>
              <DashboardActionButton disabled={!selectedTrip.hasVideo} onClick={() => navigate('/dashboard/videos')}>영상 보기</DashboardActionButton>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

function NavigationSettingsPage() {
  const [preferences, setPreferences] = useState<PreferenceState>({ mapMode: '2D', guidanceVolume: 72, ttsSpeed: 1.05, warningMode: 'balanced' })
  const [saved, setSaved] = useState(false)

  const save = () => {
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1600)
  }

  return (
    <section>
      <PageHeader eyebrow="Settings" title="네비게이션 설정" description="주행 중 사용하는 안내 방식, 지도 모드, 경고 민감도와 즐겨찾기 장소를 관리합니다." />
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Panel title="안내 기본값" icon={<SlidersHorizontal className="size-5" weight="bold" />}>
          <div className="space-y-3">
            <SettingButton active={preferences.mapMode === '2D'} label="2D 지도 기본값" onClick={() => setPreferences((current) => ({ ...current, mapMode: '2D' }))} />
            <SettingButton active={preferences.mapMode === '3D'} label="3D 지도 기본값" onClick={() => setPreferences((current) => ({ ...current, mapMode: '3D' }))} />
            <SettingButton active={preferences.warningMode === 'sensitive'} label="민감한 경고 모드" onClick={() => setPreferences((current) => ({ ...current, warningMode: current.warningMode === 'sensitive' ? 'balanced' : 'sensitive' }))} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <RangePreview label="안내 음량" value={`${preferences.guidanceVolume}%`} />
            <RangePreview label="TTS 속도" value={`${preferences.ttsSpeed.toFixed(2)}x`} />
          </div>
          <button
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--nav-primary)] px-5 text-sm font-black text-white shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-primary-hover)]"
            onClick={save}
            type="button"
          >
            <Check className="size-4" weight="bold" />
            설정 저장
          </button>
          {saved ? <motion.span className="ml-3 inline-flex rounded-full bg-[rgb(22_163_74/0.12)] px-3 py-2 text-sm font-black text-[var(--nav-success)]">저장됨</motion.span> : null}
        </Panel>
        <Panel title="즐겨찾기 장소" icon={<HouseLine className="size-5" weight="bold" />}>
          {[
            ['집', '서울 광진구 능동로 209'],
            ['회사', '서울 성동구 성수이로 88'],
            ['자주 가는 곳', '경기 성남시 분당구 정자동'],
          ].map(([label, address]) => (
            <div className="mb-3 rounded-2xl bg-[var(--nav-panel)] p-4 last:mb-0" key={label}>
              <div className="flex items-center gap-2 text-sm font-black"><MapPin className="size-4 text-[var(--nav-primary)]" weight="fill" />{label}</div>
              <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">{address}</div>
            </div>
          ))}
        </Panel>
      </div>
    </section>
  )
}

function ProfileSettingsPage() {
  return (
    <section>
      <PageHeader eyebrow="Profile" title="프로필 설정" description="운전자 정보, Navi 호출명, 리포트 이메일과 행동별 경고 민감도를 관리합니다." />
      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="운전자 정보" icon={<UserCircle className="size-5" weight="bold" />}>
          <div className="grid gap-3">
            <ProfileField icon={<UserCircle className="size-5" weight="bold" />} label="운전자" value="안정현" />
            <ProfileField icon={<Sparkle className="size-5" weight="fill" />} label="Navi 호출명" value="나비야" />
            <ProfileField icon={<EnvelopeSimple className="size-5" weight="bold" />} label="리포트 이메일" value="driver@example.com" />
            <ProfileField icon={<CarProfile className="size-5" weight="bold" />} label="연결 차량" value="JIIN Demo EV" />
          </div>
        </Panel>
        <Panel title="행동별 경고 민감도" icon={<SlidersHorizontal className="size-5" weight="bold" />}>
          <div className="grid gap-3 md:grid-cols-2">
            {behaviorMetrics.map((metric, index) => (
              <div className="rounded-2xl bg-[var(--nav-panel)] p-3" key={metric.type}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black">{metric.label}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[var(--nav-primary)]">{Math.max(3, 9 - index)}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white">
                  <div className="h-full rounded-full bg-[var(--nav-primary)]" style={{ width: `${Math.max(32, 92 - index * 8)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </section>
  )
}

function NotificationsPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    weekly: true,
    risk: true,
    trip: false,
    video: true,
    score: true,
  })
  return (
    <section>
      <PageHeader eyebrow="Notifications" title="알림 설정" description="보고서, 위험 행동, 주행 완료와 영상 생성 알림을 조정합니다." />
      <Panel title="알림 채널" icon={<Bell className="size-5" weight="bold" />}>
        {[
          ['weekly', '주간 리포트 이메일', '매주 월요일 지난 주 운전 리포트를 받습니다.'],
          ['risk', '고위험 행동 요약', '위험도 4 이상 이벤트가 누적되면 알려줍니다.'],
          ['trip', '주행 완료 요약', '주행이 끝난 뒤 핵심 지표를 받습니다.'],
          ['video', '영상 준비 알림', '주행 영상 리뷰가 가능해지면 알려줍니다.'],
          ['score', '안전 점수 하락 경고', '안전 점수가 급격히 낮아질 때 알려줍니다.'],
        ].map(([id, title, description]) => (
          <button
            className="mb-3 flex w-full items-center justify-between gap-4 rounded-2xl bg-[var(--nav-panel)] p-4 text-left last:mb-0"
            key={id}
            onClick={() => setEnabled((current) => ({ ...current, [id]: !current[id] }))}
            type="button"
          >
            <span>
              <span className="block text-sm font-black">{title}</span>
              <span className="mt-1 block text-xs font-bold text-[var(--nav-muted)]">{description}</span>
            </span>
            <span className={cn('relative h-7 w-12 rounded-full transition', enabled[id] ? 'bg-[var(--nav-primary)]' : 'bg-[var(--nav-control-muted)]')}>
              <span className={cn('absolute top-1 size-5 rounded-full bg-white transition', enabled[id] ? 'left-6' : 'left-1')} />
            </span>
          </button>
        ))}
      </Panel>
    </section>
  )
}

function DashboardActionButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--nav-primary)] px-4 text-sm font-black text-white shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
      <span className="font-bold text-[var(--nav-muted)]">{label}</span>
      <span className="font-black text-[var(--nav-ink)]">{value}</span>
    </div>
  )
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="text-xs font-bold text-[var(--nav-muted)]">{label}</div>
      <div className="mt-1 text-lg font-black text-[var(--nav-ink)]">{value}</div>
    </div>
  )
}

function SettingButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={cn('flex min-h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-sm font-black transition', active ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)] ring-1 ring-[rgb(23_70_162/0.18)]' : 'bg-[var(--nav-panel)] text-[var(--nav-muted)] hover:bg-[var(--nav-selection)]')}
      onClick={onClick}
      type="button"
    >
      {label}
      {active ? <Check className="size-4" weight="bold" /> : null}
    </button>
  )
}

function RangePreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--nav-panel)] p-4">
      <div className="text-xs font-bold text-[var(--nav-muted)]">{label}</div>
      <div className="mt-1 text-xl font-black">{value}</div>
    </div>
  )
}

function ProfileField({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[var(--nav-panel)] p-4">
      <div className="grid size-10 place-items-center rounded-full bg-white text-[var(--nav-primary)]">{icon}</div>
      <div>
        <div className="text-xs font-bold text-[var(--nav-muted)]">{label}</div>
        <div className="text-sm font-black text-[var(--nav-ink)]">{value}</div>
      </div>
    </div>
  )
}
