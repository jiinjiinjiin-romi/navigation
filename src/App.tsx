import { ChartLineUp, MapTrifold, SidebarSimple, Sparkle, X } from '@phosphor-icons/react'
import {
  type MouseEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Tooltip } from 'react-tooltip'
import { DashboardApp } from './features/dashboard/DashboardApp'
import { ModelLabPage } from './features/model-lab/components/ModelLabPage'
import { NavigationShell } from './features/navigation/components/NavigationShell'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'roadie-app-sidebar-collapsed'
const SIDEBAR_GUIDE_HIDE_UNTIL_KEY = 'roadie-app-sidebar-guide-hidden-until'
const SIDEBAR_GUIDE_HIDE_DURATION_MS = 24 * 60 * 60 * 1000
const SIDEBAR_GUIDE_CONNECTOR_GAP = 10
const SIDEBAR_GUIDE_CARD_OFFSET_X = 78
const SIDEBAR_GUIDE_CARD_TOP_OFFSET = 54
const SIDEBAR_GUIDE_CARD_STEP = 148
const SIDEBAR_GUIDE_CARD_STAGGER_X = 44
const SIDEBAR_GUIDE_CONNECTOR_SPINE_OFFSET_X = 32

type AppSection = 'navigation' | 'dashboard' | 'model-lab'
type SidebarGuideLayout = Partial<Record<AppSection, {
  anchorX: number
  anchorY: number
  cardX: number
  cardY: number
}>>
type SidebarGuideItem = {
  section: AppSection
  testId: string
  title: string
  content: ReactNode
}

const SIDEBAR_GUIDE_ITEMS: SidebarGuideItem[] = [
  {
    section: 'navigation',
    testId: 'sidebar-tooltip-navigation-content',
    title: '네비게이션',
    content: (
      <>
        <span className="block">
          <strong className="font-bold">데모 시나리오</strong>
          {' 흐름과 '}
          <strong className="font-bold">실제 내비게이션</strong>
          을{' '}
        </span>
        <span className="mt-0.5 block">
          자유롭게 조작하고,{' '}
          <strong className="font-bold">단계별 경고</strong>
          를 확인합니다.
        </span>
      </>
    ),
  },
  {
    section: 'dashboard',
    testId: 'sidebar-tooltip-dashboard-content',
    title: '대시보드',
    content: (
      <>
        <span className="block">
          운전자가 본인 <strong className="font-bold">운전 기록</strong>
          {', '}
          <strong className="font-bold">주행 데이터</strong>
          {', '}
        </span>
        <span className="mt-0.5 block">
          <strong className="font-bold">위험 행동 분석</strong>
          을 확인하고,{' '}
          <strong className="font-bold">개인화 설정</strong>
          을 관리합니다.
        </span>
      </>
    ),
  },
  {
    section: 'model-lab',
    testId: 'sidebar-tooltip-model-lab-content',
    title: '모델 확인',
    content: (
      <span className="block">
        <strong className="font-bold">운전자 행동 탐지 모델</strong>
        을 테스트합니다.
      </span>
    ),
  },
]

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const storedPreference = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    return storedPreference === null ? true : storedPreference === 'true'
  })
  const [entryState, setEntryState] = useState(() => {
    const sidebarGuideVisible = shouldShowSidebarGuide()

    return {
      introGateOpen: !sidebarGuideVisible,
      sidebarGuideVisible,
    }
  })

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handleNavigation)

    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function pushState(...args) {
      originalPushState.apply(window.history, args)
      handleNavigation()
    }
    window.history.replaceState = function replaceState(...args) {
      originalReplaceState.apply(window.history, args)
      handleNavigation()
    }

    return () => {
      window.removeEventListener('popstate', handleNavigation)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [])

  const navigate = (nextPath: string) => {
    if (window.location.pathname === nextPath) {
      return
    }

    window.history.pushState({}, '', nextPath)
  }

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next))
      return next
    })
  }

  const closeSidebarGuide = () => {
    setEntryState({
      introGateOpen: true,
      sidebarGuideVisible: false,
    })
  }

  const hideSidebarGuideForDay = () => {
    localStorage.setItem(SIDEBAR_GUIDE_HIDE_UNTIL_KEY, String(Date.now() + SIDEBAR_GUIDE_HIDE_DURATION_MS))
    setEntryState({
      introGateOpen: true,
      sidebarGuideVisible: false,
    })
  }

  return (
    <AppShell
      collapsed={sidebarCollapsed}
      onCloseSidebarGuide={closeSidebarGuide}
      onHideSidebarGuideForDay={hideSidebarGuideForDay}
      onNavigate={navigate}
      onToggleSidebar={toggleSidebar}
      pathname={pathname}
      sidebarGuideVisible={entryState.sidebarGuideVisible}
    >
      {renderCurrentPage(pathname, entryState.introGateOpen)}
    </AppShell>
  )
}

function renderCurrentPage(pathname: string, introVideoEnabled: boolean) {
  if (pathname.startsWith('/dashboard')) return <DashboardApp />
  if (pathname === '/model-lab') return <ModelLabPage />

  return <NavigationShell introVideoEnabled={introVideoEnabled} />
}

function AppShell({
  children,
  collapsed,
  onCloseSidebarGuide,
  onHideSidebarGuideForDay,
  onNavigate,
  onToggleSidebar,
  pathname,
  sidebarGuideVisible,
}: {
  children: ReactNode
  collapsed: boolean
  onCloseSidebarGuide: () => void
  onHideSidebarGuideForDay: () => void
  onNavigate: (path: string) => void
  onToggleSidebar: () => void
  pathname: string
  sidebarGuideVisible: boolean
}) {
  const activeSection = getActiveSection(pathname)
  const dashboardPath = pathname.startsWith('/dashboard') ? pathname : '/dashboard/overview'
  const sidebarRef = useRef<HTMLElement>(null)
  const navigationLinkRef = useRef<HTMLAnchorElement>(null)
  const dashboardLinkRef = useRef<HTMLAnchorElement>(null)
  const modelLabLinkRef = useRef<HTMLAnchorElement>(null)
  const [guideLayout, setGuideLayout] = useState<SidebarGuideLayout>({})
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const showTooltip = (id: string) => {
    if (sidebarGuideVisible) return

    setActiveTooltipId(id)
  }
  const hideTooltip = (id: string) => {
    setActiveTooltipId((current) => current === id ? null : current)
  }
  const measureGuideLayout = useCallback(() => {
    const targets: Partial<Record<AppSection, HTMLAnchorElement | null>> = {
      navigation: navigationLinkRef.current,
      dashboard: dashboardLinkRef.current,
      'model-lab': modelLabLinkRef.current,
    }
    const nextLayout: SidebarGuideLayout = {}
    let firstAnchorY: number | null = null
    let cardX = 0

    for (const element of Object.values(targets)) {
      if (!element) continue

      const rect = element.getBoundingClientRect()
      const anchorY = Math.round(rect.top + rect.height / 2)
      firstAnchorY ??= anchorY
      cardX = Math.max(cardX, Math.round(rect.right + SIDEBAR_GUIDE_CARD_OFFSET_X))
    }

    if (firstAnchorY === null || cardX === 0) {
      setGuideLayout((current) => areGuideLayoutsEqual(current, nextLayout) ? current : nextLayout)
      return
    }

    const maxBaseCardY = window.innerHeight - (SIDEBAR_GUIDE_CARD_STEP * 2) - 116
    const baseCardY = clamp(firstAnchorY - SIDEBAR_GUIDE_CARD_TOP_OFFSET, 88, Math.max(88, maxBaseCardY))
    const sections: AppSection[] = ['navigation', 'dashboard', 'model-lab']

    sections.forEach((section, index) => {
      const element = targets[section]
      if (!element) return

      const rect = element.getBoundingClientRect()
      nextLayout[section] = {
        anchorX: Math.round(rect.right + SIDEBAR_GUIDE_CONNECTOR_GAP),
        anchorY: Math.round(rect.top + rect.height / 2),
        cardX: Math.round(cardX + SIDEBAR_GUIDE_CARD_STAGGER_X * index),
        cardY: Math.round(baseCardY + SIDEBAR_GUIDE_CARD_STEP * index),
      }
    })

    setGuideLayout((current) => areGuideLayoutsEqual(current, nextLayout) ? current : nextLayout)
  }, [])

  useLayoutEffect(() => {
    if (!sidebarGuideVisible) return

    measureGuideLayout()

    const frame = window.requestAnimationFrame(measureGuideLayout)
    const transitionTimeout = window.setTimeout(measureGuideLayout, 240)
    const observedElements = [
      sidebarRef.current,
      navigationLinkRef.current,
      dashboardLinkRef.current,
      modelLabLinkRef.current,
    ].filter((element): element is HTMLElement => Boolean(element))
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureGuideLayout)

    observedElements.forEach((element) => resizeObserver?.observe(element))
    window.addEventListener('orientationchange', measureGuideLayout)
    window.addEventListener('resize', measureGuideLayout)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(transitionTimeout)
      resizeObserver?.disconnect()
      window.removeEventListener('orientationchange', measureGuideLayout)
      window.removeEventListener('resize', measureGuideLayout)
    }
  }, [collapsed, measureGuideLayout, sidebarGuideVisible])

  useEffect(() => {
    if (!sidebarGuideVisible) return

    setActiveTooltipId(null)
  }, [sidebarGuideVisible])

  return (
    <div
      className="roadie-paper-app-shell relative h-screen min-h-0 overflow-hidden text-[var(--nav-ink)]"
      data-testid="app-shell"
    >
      <aside
        aria-label="주요 페이지"
        className={[
          'roadie-paper-sidebar roadie-global-sidebar fixed left-4 top-4 z-50 flex h-[calc(100vh-2rem)] min-h-0 flex-col rounded-[1.35rem] px-4 py-5 transition-[width] duration-200 ease-out',
          collapsed ? 'w-20' : 'w-[15.5rem] max-xl:w-20',
        ].join(' ')}
        data-collapsed={String(collapsed)}
        data-testid="global-sidebar"
        ref={sidebarRef}
      >
        <div
          className={[
            'flex min-h-13 items-center px-0.5',
            collapsed ? 'justify-center' : 'justify-between gap-3',
          ].join(' ')}
        >
          <div className={['flex min-w-0 items-center gap-3', collapsed ? 'justify-center' : ''].join(' ')}>
            <img
              alt=""
              className="size-11 shrink-0 object-contain"
              draggable={false}
              src="/roady_logo.webp"
            />
            {collapsed ? null : (
              <img
                alt="ROADY"
                className="h-10 w-auto min-w-0 max-w-[10rem] object-contain max-xl:hidden"
                draggable={false}
                src="/text_logo.webp"
              />
            )}
          </div>
          {collapsed ? null : (
            <button
              aria-label="사이드바 접기"
              className="group relative grid size-9 shrink-0 place-items-center rounded-lg text-[#716b5f] transition hover:bg-[#ebe7dc] hover:text-[#191713] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] max-xl:hidden"
              data-tooltip-id="sidebar-tooltip-collapse"
              onBlur={() => hideTooltip('sidebar-tooltip-collapse')}
              onClick={onToggleSidebar}
              onFocus={() => showTooltip('sidebar-tooltip-collapse')}
              onMouseEnter={() => showTooltip('sidebar-tooltip-collapse')}
              onMouseLeave={() => hideTooltip('sidebar-tooltip-collapse')}
              type="button"
            >
              <SidebarSimple className="size-5" weight="bold" />
              <SidebarTooltip
                active={activeTooltipId === 'sidebar-tooltip-collapse'}
                id="sidebar-tooltip-collapse"
                testId="sidebar-tooltip-collapse-content"
              >
                사이드바 접기
              </SidebarTooltip>
            </button>
          )}
        </div>
        {collapsed ? (
          <button
            aria-label="사이드바 펼치기"
            className="group relative mt-5 grid size-11 self-center place-items-center rounded-xl bg-white text-[#667085] shadow-[0_10px_22px_rgb(45_72_112/0.08)] transition hover:bg-[#f2f7ff] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            data-tooltip-id="sidebar-tooltip-expand"
            onBlur={() => hideTooltip('sidebar-tooltip-expand')}
            onClick={onToggleSidebar}
            onFocus={() => showTooltip('sidebar-tooltip-expand')}
            onMouseEnter={() => showTooltip('sidebar-tooltip-expand')}
            onMouseLeave={() => hideTooltip('sidebar-tooltip-expand')}
            type="button"
          >
            <SidebarSimple className="size-5 rotate-180" weight="bold" />
            <SidebarTooltip
              active={activeTooltipId === 'sidebar-tooltip-expand'}
              id="sidebar-tooltip-expand"
              testId="sidebar-tooltip-expand-content"
            >
              사이드바 펼치기
            </SidebarTooltip>
          </button>
        ) : null}
        <nav className="mt-7 grid gap-2.5" aria-label="페이지 이동">
          <SidebarLink
            active={activeSection === 'navigation'}
            collapsed={collapsed}
            href="/"
            icon={<MapTrifold className="size-5" weight="bold" />}
            label="네비게이션"
            linkRef={navigationLinkRef}
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-navigation'}
            tooltipDescription={SIDEBAR_GUIDE_ITEMS[0].content}
            tooltipId="sidebar-tooltip-navigation"
            tooltipTestId="sidebar-tooltip-navigation-content"
          />
          <SidebarLink
            active={activeSection === 'dashboard'}
            collapsed={collapsed}
            href={dashboardPath}
            icon={<ChartLineUp className="size-5" weight="bold" />}
            label="대시보드"
            linkRef={dashboardLinkRef}
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-dashboard'}
            tooltipDescription={SIDEBAR_GUIDE_ITEMS[1].content}
            tooltipId="sidebar-tooltip-dashboard"
            tooltipTestId="sidebar-tooltip-dashboard-content"
          />
          <SidebarLink
            active={activeSection === 'model-lab'}
            collapsed={collapsed}
            href="/model-lab"
            icon={<Sparkle className="size-5" weight="bold" />}
            label="모델 확인"
            linkRef={modelLabLinkRef}
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-model-lab'}
            tooltipDescription={SIDEBAR_GUIDE_ITEMS[2].content}
            tooltipId="sidebar-tooltip-model-lab"
            tooltipTestId="sidebar-tooltip-model-lab-content"
          />
        </nav>
      </aside>
      {sidebarGuideVisible ? (
        <SidebarGuideOverlay
          guideLayout={guideLayout}
          onClose={onCloseSidebarGuide}
          onHideForDay={onHideSidebarGuideForDay}
        />
      ) : null}
      <main
        className={[
          'roadie-paper-content roadie-navigation-container h-screen min-h-0 min-w-0 transition-[margin-left] duration-200 ease-out',
          activeSection === 'dashboard'
            ? 'overflow-auto lg:overflow-hidden'
            : activeSection === 'model-lab' ? 'overflow-auto' : 'overflow-x-auto overflow-y-auto',
          collapsed ? 'ml-[7.75rem]' : 'ml-[18.25rem] max-xl:ml-[7.75rem]',
        ].join(' ')}
        data-testid="app-content"
      >
        {children}
      </main>
    </div>
  )
}

function SidebarLink({
  active,
  collapsed,
  href,
  icon,
  label,
  linkRef,
  onNavigate,
  onTooltipHide,
  onTooltipShow,
  tooltipActive = false,
  tooltipDescription,
  tooltipId,
  tooltipTestId,
}: {
  active: boolean
  collapsed: boolean
  href: string
  icon: ReactNode
  label: string
  linkRef?: Ref<HTMLAnchorElement>
  onNavigate: (path: string) => void
  onTooltipHide: (id: string) => void
  onTooltipShow: (id: string) => void
  tooltipActive?: boolean
  tooltipDescription: ReactNode
  tooltipId: string
  tooltipTestId: string
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onNavigate(href)
  }

  return (
    <a
      aria-current={active ? 'page' : undefined}
      aria-label={label}
      className={[
        'group relative flex min-h-13 items-center rounded-2xl py-0 text-base font-extrabold tracking-normal transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
        collapsed ? 'justify-center px-0' : 'gap-3 px-1.5 pr-4 max-xl:justify-center max-xl:px-0',
        active && collapsed
          ? 'text-[var(--nav-primary)]'
          : active
            ? 'bg-white/88 text-[#111827] shadow-[0_12px_24px_rgb(70_95_255/0.12),inset_0_0_0_1px_rgb(70_95_255/0.10)]'
            : 'text-[#475467] hover:bg-white/58 hover:text-[#111827]',
      ].join(' ')}
      data-active={String(active)}
      data-collapsed={String(collapsed)}
      href={href}
      data-tooltip-id={tooltipId}
      onBlur={() => onTooltipHide(tooltipId)}
      onClick={handleClick}
      onFocus={() => onTooltipShow(tooltipId)}
      onMouseEnter={() => onTooltipShow(tooltipId)}
      onMouseLeave={() => onTooltipHide(tooltipId)}
      ref={linkRef}
    >
      <span
        aria-hidden="true"
        className={[
          'grid shrink-0 place-items-center transition-[background,box-shadow,color,transform] duration-200 ease-out',
          collapsed ? 'size-13 rounded-[1.35rem]' : 'size-11 rounded-[1.1rem] max-xl:size-13 max-xl:rounded-[1.35rem]',
          active && collapsed
            ? 'bg-[#fbfcff] text-[var(--nav-primary)] shadow-[0_12px_28px_rgb(70_95_255/0.22),0_4px_12px_rgb(70_95_255/0.12),inset_0_0_0_1px_rgb(70_95_255/0.10)]'
            : active
              ? 'text-[var(--nav-primary)]'
              : 'text-inherit group-hover:bg-white/72 group-hover:text-[var(--nav-primary)] group-hover:shadow-[0_8px_18px_rgb(45_72_112/0.08)]',
        ].join(' ')}
        data-testid={`sidebar-link-icon-${tooltipId}`}
      >
        {icon}
      </span>
      {collapsed ? null : <span className="min-w-0 whitespace-normal leading-5 text-[#475467] transition group-hover:text-[#111827] group-data-[active=true]:text-[#111827] max-xl:hidden">{label}</span>}
      <SidebarTooltip
        active={tooltipActive}
        id={tooltipId}
        testId={tooltipTestId}
      >
        <span className="block text-[0.95rem] font-extrabold leading-5 text-[#111827]">{label}</span>
        <span className="mt-1 block max-w-80 whitespace-normal text-sm font-medium leading-5 text-[#475467] [word-break:keep-all] [&_strong]:font-extrabold [&_strong]:text-[#111827]">
          {tooltipDescription}
        </span>
      </SidebarTooltip>
    </a>
  )
}

function SidebarGuideOverlay({
  guideLayout,
  onClose,
  onHideForDay,
}: {
  guideLayout: SidebarGuideLayout
  onClose: () => void
  onHideForDay: () => void
}) {
  return (
    <div
      aria-label="사이드바 안내"
      className="fixed inset-0 z-40 bg-black/45 text-white backdrop-blur-[1px]"
      data-testid="sidebar-guide-overlay"
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[1] size-full"
        data-testid="sidebar-guide-connectors"
      >
        {SIDEBAR_GUIDE_ITEMS.map(({ section }) => {
          const layout = guideLayout[section]
          if (!layout) return null
          const targetX = layout.cardX + 1
          const targetY = layout.cardY + 48
          const spineX = layout.anchorX + SIDEBAR_GUIDE_CONNECTOR_SPINE_OFFSET_X
          const connectorPath = `M ${layout.anchorX} ${layout.anchorY} H ${spineX} V ${targetY} H ${targetX}`

          return (
            <path
              d={connectorPath}
              data-guide-connector-path={connectorPath}
              data-guide-connector={section}
              fill="none"
              key={section}
              stroke="rgba(255,255,255,0.72)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          )
        })}
      </svg>
      <div className="absolute right-6 top-6 z-[3] flex items-center gap-2">
        <button
          aria-label="사이드바 안내 닫기"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-3.5 text-sm font-semibold text-white ring-1 ring-white/16 transition hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          data-testid="sidebar-guide-close-button"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" weight="bold" />
          닫기
        </button>
        <button
          className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#101828] shadow-[0_12px_26px_rgb(0_0_0/0.22)] transition hover:bg-[#f2f7ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          data-testid="sidebar-guide-hide-day-button"
          onClick={onHideForDay}
          type="button"
        >
          24시간동안 보지 않기
        </button>
      </div>
      {SIDEBAR_GUIDE_ITEMS.map(({ content, section, testId, title }) => {
        const layout = guideLayout[section]
        if (!layout) return null

        return (
          <section
            className="absolute z-[2] w-fit min-w-[15rem] max-w-[min(34rem,calc(100vw-2rem))] rounded-xl bg-white/96 px-5 py-4 text-left text-sm font-medium leading-6 text-[#344054] opacity-100 shadow-[0_16px_34px_rgb(45_72_112/0.14)] ring-1 ring-[rgb(45_72_112/0.10)] backdrop-blur-xl"
            data-guide-anchor={`${layout.anchorX},${layout.anchorY}`}
            data-guide-card-position={`${layout.cardX},${layout.cardY}`}
            data-testid={`sidebar-guide-card-${section}`}
            key={section}
            role="tooltip"
            style={{ left: layout.cardX, top: layout.cardY }}
          >
            <span className="block text-lg font-extrabold leading-6 text-[#111827]" data-testid={`sidebar-guide-title-${section}`}>
              {title}
            </span>
            <span className="mt-2 block whitespace-normal text-pretty [word-break:keep-all]" data-testid={testId}>{content}</span>
          </section>
        )
      })}
    </div>
  )
}

function SidebarTooltip({
  active = false,
  children,
  id,
  testId,
}: {
  active?: boolean
  children: ReactNode
  id: string
  testId: string
}) {
  return (
    <Tooltip
      arrowColor="rgb(255 255 255 / 0.96)"
      arrowSize={10}
      id={id}
      className="roadie-sidebar-tooltip !z-[70] !w-max !rounded-lg !bg-white/96 !px-3 !py-2 !text-left !text-sm !font-medium !leading-5 !text-[#344054] !shadow-[0_12px_26px_rgb(45_72_112/0.14)] !ring-1 !ring-[rgb(45_72_112/0.10)] !backdrop-blur-xl"
      closeEvents={{ blur: true, mouseleave: true }}
      delayHide={110}
      delayShow={0}
      isOpen={active}
      offset={12}
      openEvents={{ focus: true, mouseenter: true }}
      opacity={1}
      place="right"
    >
      <span data-testid={testId}>{children}</span>
    </Tooltip>
  )
}

function areGuideLayoutsEqual(current: SidebarGuideLayout, next: SidebarGuideLayout) {
  const sections: AppSection[] = ['navigation', 'dashboard', 'model-lab']

  return sections.every((section) => {
    const currentLayout = current[section]
    const nextLayout = next[section]

    return currentLayout?.anchorX === nextLayout?.anchorX
      && currentLayout?.anchorY === nextLayout?.anchorY
      && currentLayout?.cardX === nextLayout?.cardX
      && currentLayout?.cardY === nextLayout?.cardY
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function shouldShowSidebarGuide() {
  const hideUntil = Number(localStorage.getItem(SIDEBAR_GUIDE_HIDE_UNTIL_KEY))

  return !Number.isFinite(hideUntil) || hideUntil <= Date.now()
}

function getActiveSection(pathname: string): AppSection {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname === '/model-lab') return 'model-lab'
  return 'navigation'
}

export default App
