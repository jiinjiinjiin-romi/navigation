import { ChartLineUp, MapTrifold, SidebarSimple, Sparkle } from '@phosphor-icons/react'
import { type MouseEvent, type ReactNode, useEffect, useState } from 'react'
import { DashboardApp } from './features/dashboard/DashboardApp'
import { ModelLabPage } from './features/model-lab/components/ModelLabPage'
import { NavigationShell } from './features/navigation/components/NavigationShell'

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'roadie-app-sidebar-collapsed'

type AppSection = 'navigation' | 'dashboard' | 'model-lab'

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const storedPreference = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY)
    return storedPreference === null ? true : storedPreference === 'true'
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

  return (
    <AppShell
      collapsed={sidebarCollapsed}
      onNavigate={navigate}
      onToggleSidebar={toggleSidebar}
      pathname={pathname}
    >
      {renderCurrentPage(pathname)}
    </AppShell>
  )
}

function renderCurrentPage(pathname: string) {
  if (pathname.startsWith('/dashboard')) return <DashboardApp />
  if (pathname === '/model-lab') return <ModelLabPage />

  return <NavigationShell />
}

function AppShell({
  children,
  collapsed,
  onNavigate,
  onToggleSidebar,
  pathname,
}: {
  children: ReactNode
  collapsed: boolean
  onNavigate: (path: string) => void
  onToggleSidebar: () => void
  pathname: string
}) {
  const activeSection = getActiveSection(pathname)
  const dashboardPath = pathname.startsWith('/dashboard') ? pathname : '/dashboard/overview'

  return (
    <div
      className="roadie-paper-app-shell relative min-h-screen text-[var(--nav-ink)]"
      data-testid="app-shell"
    >
      <aside
        aria-label="주요 페이지"
        className={[
          'roadie-paper-sidebar roadie-global-sidebar fixed left-4 top-4 z-50 flex h-[calc(100vh-2rem)] min-h-0 flex-col rounded-[1.35rem] px-4 py-5 transition-[width] duration-200 ease-out',
          collapsed ? 'w-20' : 'w-[16.5rem] max-md:w-20',
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
                className="h-10 w-auto min-w-0 max-w-[10rem] object-contain max-md:hidden"
                draggable={false}
                src="/text_logo.webp"
              />
            )}
          </div>
          {collapsed ? null : (
            <button
              aria-label="사이드바 접기"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-[#716b5f] transition hover:bg-[#ebe7dc] hover:text-[#191713] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] max-md:hidden"
              onClick={onToggleSidebar}
              type="button"
            >
              <SidebarSimple className="size-5" weight="bold" />
            </button>
          )}
        </div>
        {collapsed ? (
          <button
            aria-label="사이드바 펼치기"
            className="mt-5 grid size-11 place-items-center rounded-xl bg-white text-[#667085] shadow-[0_10px_22px_rgb(45_72_112/0.08)] transition hover:bg-[#f2f7ff] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onToggleSidebar}
            type="button"
          >
            <SidebarSimple className="size-5 rotate-180" weight="bold" />
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
          />
          <SidebarLink
            active={activeSection === 'dashboard'}
            collapsed={collapsed}
            href={dashboardPath}
            icon={<ChartLineUp className="size-5" weight="bold" />}
            label="대시보드"
            onNavigate={onNavigate}
          />
          <SidebarLink
            active={activeSection === 'model-lab'}
            collapsed={collapsed}
            href="/model-lab"
            icon={<Sparkle className="size-5" weight="bold" />}
            label="모델 확인"
            onNavigate={onNavigate}
          />
        </nav>
      </aside>
      <main
        className={[
          'roadie-paper-content min-h-screen min-w-0 overflow-auto transition-[margin-left] duration-200 ease-out',
          collapsed ? 'ml-[7.75rem]' : 'ml-[19.25rem] max-md:ml-[7.75rem]',
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
}: {
  active: boolean
  collapsed: boolean
  href: string
  icon: ReactNode
  label: string
  onNavigate: (path: string) => void
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
        'group relative flex min-h-13 items-center rounded-2xl py-2 text-base font-extrabold tracking-normal transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
        collapsed ? 'justify-center px-0' : 'gap-3.5 px-3.5 max-md:justify-center max-md:px-0',
        active
          ? 'bg-white text-[#111827] shadow-[0_12px_24px_rgb(45_72_112/0.10)]'
          : 'text-[#475467] hover:bg-white/76 hover:text-[#111827]',
      ].join(' ')}
      href={href}
      onClick={handleClick}
    >
      <span aria-hidden="true" className={['shrink-0 transition', active ? 'text-[var(--nav-primary)]' : 'text-inherit group-hover:text-[var(--nav-primary)]'].join(' ')}>
        {icon}
      </span>
      {collapsed ? null : <span className="min-w-0 whitespace-normal leading-5 max-md:hidden">{label}</span>}
    </a>
  )
}

function getActiveSection(pathname: string): AppSection {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname === '/model-lab') return 'model-lab'
  return 'navigation'
}

export default App
