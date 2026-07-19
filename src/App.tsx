import { ChartLineUp, MapTrifold, SidebarSimple, Sparkle, X } from '@phosphor-icons/react'
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { Tooltip } from 'react-tooltip'
import { DashboardApp } from './features/dashboard/DashboardApp'
import { ModelLabPage } from './features/model-lab/components/ModelLabPage'
import { NavigationShell } from './features/navigation/components/NavigationShell'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'roadie-app-sidebar-collapsed'
const SIDEBAR_GUIDE_SESSION_KEY = 'roadie-app-sidebar-guide-closed'
const SIDEBAR_GUIDE_HIDE_UNTIL_KEY = 'roadie-app-sidebar-guide-hidden-until'
const SIDEBAR_GUIDE_HIDE_DURATION_MS = 24 * 60 * 60 * 1000

type AppSection = 'navigation' | 'dashboard' | 'model-lab'

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const storedPreference = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    return storedPreference === null ? true : storedPreference === 'true'
  })
  const [sidebarGuideVisible, setSidebarGuideVisible] = useState(shouldShowSidebarGuide)

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
    sessionStorage.setItem(SIDEBAR_GUIDE_SESSION_KEY, 'true')
    setSidebarGuideVisible(false)
  }

  const hideSidebarGuideForDay = () => {
    localStorage.setItem(SIDEBAR_GUIDE_HIDE_UNTIL_KEY, String(Date.now() + SIDEBAR_GUIDE_HIDE_DURATION_MS))
    setSidebarGuideVisible(false)
  }

  return (
    <AppShell
      collapsed={sidebarCollapsed}
      onCloseSidebarGuide={closeSidebarGuide}
      onHideSidebarGuideForDay={hideSidebarGuideForDay}
      onNavigate={navigate}
      onToggleSidebar={toggleSidebar}
      pathname={pathname}
      sidebarGuideVisible={sidebarGuideVisible}
    >
      {renderCurrentPage(pathname, !sidebarGuideVisible)}
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
  const guideTooltipX = collapsed ? 95 : 272
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const showTooltip = (id: string) => setActiveTooltipId(id)
  const hideTooltip = (id: string) => {
    setActiveTooltipId((current) => current === id ? null : current)
  }

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
            className="group relative mt-5 grid size-11 place-items-center rounded-xl bg-white text-[#667085] shadow-[0_10px_22px_rgb(45_72_112/0.08)] transition hover:bg-[#f2f7ff] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
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
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-navigation'}
            tooltipPosition={sidebarGuideVisible ? { x: guideTooltipX, y: 210 } : undefined}
            tooltipVisible={sidebarGuideVisible}
            tooltipDescription={(
              <>
                <span className="block whitespace-nowrap">
                  <strong className="font-bold">데모 시나리오</strong>
                  {' 흐름과 '}
                  <strong className="font-bold">실제 내비게이션</strong>
                  을 자유롭게 조작하고,
                </span>
                <span className="mt-0.5 block whitespace-nowrap">
                  <strong className="font-bold">단계별 경고</strong>
                  를 확인합니다.
                </span>
              </>
            )}
            tooltipId="sidebar-tooltip-navigation"
            tooltipTestId="sidebar-tooltip-navigation-content"
          />
          <SidebarLink
            active={activeSection === 'dashboard'}
            collapsed={collapsed}
            href={dashboardPath}
            icon={<ChartLineUp className="size-5" weight="bold" />}
            label="대시보드"
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-dashboard'}
            tooltipPosition={sidebarGuideVisible ? { x: guideTooltipX, y: 300 } : undefined}
            tooltipVisible={sidebarGuideVisible}
            tooltipDescription={(
              <>
                <span className="block whitespace-nowrap">
                  운전자가 본인 <strong className="font-bold">운전 기록</strong>
                  {', '}
                  <strong className="font-bold">주행 데이터</strong>
                  {', '}
                  <strong className="font-bold">위험 행동 분석</strong>
                  을 확인하고,
                </span>
                <span className="mt-0.5 block whitespace-nowrap">
                  <strong className="font-bold">개인화 설정</strong>
                  을 관리합니다.
                </span>
              </>
            )}
            tooltipId="sidebar-tooltip-dashboard"
            tooltipTestId="sidebar-tooltip-dashboard-content"
          />
          <SidebarLink
            active={activeSection === 'model-lab'}
            collapsed={collapsed}
            href="/model-lab"
            icon={<Sparkle className="size-5" weight="bold" />}
            label="모델 확인"
            onNavigate={onNavigate}
            onTooltipHide={hideTooltip}
            onTooltipShow={showTooltip}
            tooltipActive={activeTooltipId === 'sidebar-tooltip-model-lab'}
            tooltipPosition={sidebarGuideVisible ? { x: guideTooltipX, y: 390 } : undefined}
            tooltipVisible={sidebarGuideVisible}
            tooltipDescription={(
              <>
                <span className="block whitespace-nowrap">
                  <strong className="font-bold">운전자 행동 탐지 모델</strong>
                  을 테스트합니다.
                </span>
              </>
            )}
            tooltipId="sidebar-tooltip-model-lab"
            tooltipTestId="sidebar-tooltip-model-lab-content"
          />
        </nav>
      </aside>
      {sidebarGuideVisible ? (
        <div
          aria-label="사이드바 안내"
          className="fixed inset-0 z-40 bg-black/45 text-white backdrop-blur-[1px]"
          data-testid="sidebar-guide-overlay"
        >
          <div className="absolute right-6 top-6 z-[1] flex items-center gap-2">
            <button
              aria-label="사이드바 안내 닫기"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-3.5 text-sm font-semibold text-white ring-1 ring-white/16 transition hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              data-testid="sidebar-guide-close-button"
              onClick={onCloseSidebarGuide}
              type="button"
            >
              <X className="size-4" weight="bold" />
              닫기
            </button>
            <button
              className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#101828] shadow-[0_12px_26px_rgb(0_0_0/0.22)] transition hover:bg-[#f2f7ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              data-testid="sidebar-guide-hide-day-button"
              onClick={onHideSidebarGuideForDay}
              type="button"
            >
              24시간동안 보지 않기
            </button>
          </div>
        </div>
      ) : null}
      <main
        className={[
          'roadie-paper-content roadie-navigation-container h-screen min-h-0 min-w-0 transition-[margin-left] duration-200 ease-out',
          activeSection === 'dashboard'
            ? 'overflow-auto lg:overflow-hidden'
            : activeSection === 'model-lab' ? 'overflow-auto' : 'overflow-hidden',
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
  onNavigate,
  onTooltipHide,
  onTooltipShow,
  tooltipActive = false,
  tooltipDescription,
  tooltipId,
  tooltipPosition,
  tooltipTestId,
  tooltipVisible = false,
}: {
  active: boolean
  collapsed: boolean
  href: string
  icon: ReactNode
  label: string
  onNavigate: (path: string) => void
  onTooltipHide: (id: string) => void
  onTooltipShow: (id: string) => void
  tooltipActive?: boolean
  tooltipDescription: ReactNode
  tooltipId: string
  tooltipPosition?: { x: number; y: number }
  tooltipTestId: string
  tooltipVisible?: boolean
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
        position={tooltipPosition}
        testId={tooltipTestId}
        visible={tooltipVisible}
      >
        {tooltipDescription}
      </SidebarTooltip>
    </a>
  )
}

function SidebarTooltip({
  active = false,
  children,
  id,
  position,
  testId,
  visible = false,
}: {
  active?: boolean
  children: ReactNode
  id: string
  position?: { x: number; y: number }
  testId: string
  visible?: boolean
}) {
  const open = visible || active

  return (
    <Tooltip
      key={visible ? `${id}-guide` : `${id}-hover`}
      id={id}
      className="!z-[70] !w-max !rounded-xl !bg-white/96 !px-4 !py-3 !text-left !text-sm !font-medium !leading-5 !text-[#344054] !opacity-100 !shadow-[0_16px_34px_rgb(45_72_112/0.14)] !ring-1 !ring-[rgb(45_72_112/0.10)] !backdrop-blur-xl !transition-none"
      classNameArrow="!bg-white/96"
      closeEvents={{ blur: true, mouseleave: true }}
      delayHide={0}
      delayShow={0}
      isOpen={open}
      offset={12}
      openEvents={{ focus: true, mouseenter: true }}
      opacity={1}
      place="right"
      position={position}
      positionStrategy={position ? 'fixed' : 'absolute'}
    >
      {open ? (
        <span data-guide-position={position ? `${position.x},${position.y}` : undefined} data-testid={testId}>{children}</span>
      ) : null}
    </Tooltip>
  )
}

function shouldShowSidebarGuide() {
  if (sessionStorage.getItem(SIDEBAR_GUIDE_SESSION_KEY) === 'true') {
    return false
  }

  const hideUntil = Number(localStorage.getItem(SIDEBAR_GUIDE_HIDE_UNTIL_KEY))

  return !Number.isFinite(hideUntil) || hideUntil <= Date.now()
}

function getActiveSection(pathname: string): AppSection {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname === '/model-lab') return 'model-lab'
  return 'navigation'
}

export default App
