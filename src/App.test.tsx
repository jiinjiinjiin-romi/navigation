import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./features/navigation/components/NavigationShell', () => ({
  NavigationShell: ({ introVideoEnabled = true }: { introVideoEnabled?: boolean }) => (
    <div data-intro-video-enabled={String(introVideoEnabled)} data-testid="navigation-shell" />
  ),
}))

vi.mock('./features/model-lab/components/ModelLabPage', () => ({
  ModelLabPage: () => (
    <div data-testid="model-lab-page" />
  ),
}))

vi.mock('./features/dashboard/DashboardApp', () => ({
  DashboardApp: () => (
    <div data-testid="dashboard-page" />
  ),
}))

function mockSidebarGuideRects() {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect

  Element.prototype.getBoundingClientRect = function getBoundingClientRectMock() {
    const label = this.getAttribute('aria-label')
    const collapsed = this.getAttribute('data-collapsed') !== 'false'
    const right = collapsed ? 80 : 248

    if (label === '네비게이션') {
      return createDOMRect({ height: 52, right, top: 188, width: 52 })
    }

    if (label === '대시보드') {
      return createDOMRect({ height: 52, right, top: 278, width: 52 })
    }

    if (label === '모델 확인') {
      return createDOMRect({ height: 52, right, top: 368, width: 52 })
    }

    return originalGetBoundingClientRect.call(this)
  }

  return () => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect
  }
}

function createDOMRect({
  height,
  right,
  top,
  width,
}: {
  height: number
  right: number
  top: number
  width: number
}) {
  const left = right - width
  const bottom = top + height

  return {
    bottom,
    height,
    left,
    right,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('renders the navigation page inside the persistent app shell', () => {
    render(<App />)

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
    expect(screen.getByTestId('app-shell')).toHaveClass('h-screen')
    expect(screen.getByTestId('app-shell')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('app-content')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('navigation-shell')).toBeInTheDocument()
    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-intro-video-enabled', 'false')
  })

  it('renders the sidebar as a floating rail instead of a full-height attached column', () => {
    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toHaveClass('fixed')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('roadie-global-sidebar')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('left-4')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('top-4')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('h-[calc(100vh-2rem)]')
    expect(screen.getByTestId('global-sidebar')).not.toHaveClass('h-screen')
    expect(screen.getByTestId('app-content')).toHaveClass('roadie-navigation-container')
    expect(screen.getByTestId('app-content')).toHaveClass('ml-[7.75rem]')
  })

  it('defaults the sidebar to the collapsed state when no preference is saved', () => {
    const restoreRects = mockSidebarGuideRects()

    try {
      render(<App />)

      const activeNavigationLink = screen.getByRole('link', { name: '네비게이션' })
      const activeNavigationIcon = screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')
      const expandButton = screen.getByRole('button', { name: '사이드바 펼치기' })

      expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'true')
      expect(expandButton).toBeInTheDocument()
      expect(expandButton).toHaveClass('self-center')
      expect(activeNavigationLink).toHaveAttribute('data-active', 'true')
      expect(activeNavigationLink).not.toHaveClass('bg-white')
      expect(activeNavigationIcon).toHaveClass('bg-[#fbfcff]')
      expect(activeNavigationIcon).toHaveClass('text-[var(--nav-primary)]')
      expect(activeNavigationIcon).toHaveClass('rounded-[1.35rem]')
      expect(activeNavigationIcon).toHaveClass('shadow-[0_12px_28px_rgb(70_95_255/0.22),0_4px_12px_rgb(70_95_255/0.12),inset_0_0_0_1px_rgb(70_95_255/0.10)]')
      expect(screen.getByTestId('sidebar-guide-overlay')).toHaveClass('bg-black/45')
      expect(screen.getByTestId('sidebar-guide-overlay')).not.toHaveClass('bg-black')
      expect(screen.getByTestId('sidebar-guide-close-button').parentElement).toHaveClass('right-6')
      expect(screen.getByTestId('sidebar-guide-close-button').parentElement).toHaveClass('top-6')
      expect(screen.getByTestId('sidebar-guide-close-button')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-guide-hide-day-button')).toHaveTextContent('24시간동안 보지 않기')
      expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-expand')
      expect(screen.getByRole('link', { name: '네비게이션' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-navigation')
      expect(screen.getByRole('link', { name: '대시보드' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-dashboard')
      expect(screen.getByRole('link', { name: '모델 확인' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-model-lab')
      expect(screen.getByTestId('sidebar-guide-title-navigation')).toHaveTextContent('네비게이션')
      expect(screen.getByTestId('sidebar-guide-title-navigation')).toHaveClass('text-lg')
      expect(screen.getByTestId('sidebar-guide-title-navigation')).toHaveClass('font-extrabold')
      expect(screen.getByTestId('sidebar-guide-title-dashboard')).toHaveTextContent('대시보드')
      expect(screen.getByTestId('sidebar-guide-title-model-lab')).toHaveTextContent('모델 확인')
      expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveTextContent('데모 시나리오 흐름과 실제 내비게이션을 자유롭게 조작하고, 단계별 경고를 확인합니다.')
      expect(screen.getByTestId('sidebar-tooltip-dashboard-content')).toHaveTextContent('운전자가 본인 운전 기록, 주행 데이터, 위험 행동 분석을 확인하고, 개인화 설정을 관리합니다.')
      expect(screen.getByTestId('sidebar-tooltip-model-lab-content')).toHaveTextContent('운전자 행동 탐지 모델을 테스트합니다.')
      expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelectorAll('strong')).toHaveLength(3)
      expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelectorAll('span.block')).toHaveLength(2)
      expect(screen.getByTestId('sidebar-tooltip-dashboard-content').querySelectorAll('span.block')).toHaveLength(2)
      expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelector('strong')).toHaveClass('font-bold')
      expect(screen.getByTestId('sidebar-tooltip-dashboard-content').querySelectorAll('strong')).toHaveLength(4)
      expect(screen.getByRole('tooltip', { name: /데모 시나리오/ })).toHaveClass('bg-white/96')
      expect(screen.getByRole('tooltip', { name: /데모 시나리오/ })).toHaveClass('text-[#344054]')
      expect(screen.getByRole('tooltip', { name: /데모 시나리오/ })).toHaveClass('ring-1')
      expect(screen.getByRole('tooltip', { name: /데모 시나리오/ })).not.toHaveClass('!bg-[#101828]')
      expect(screen.getByTestId('sidebar-guide-connectors')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar-guide-card-navigation')).toHaveClass('w-fit')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).toHaveClass('w-fit')
      expect(screen.getByTestId('sidebar-guide-card-model-lab')).toHaveClass('w-fit')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).not.toHaveClass('w-[min(36rem,calc(100vw-2rem))]')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).not.toHaveClass('w-[min(27rem,calc(100vw-2rem))]')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).not.toHaveClass('w-[min(29rem,calc(100vw-2rem))]')
      expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveClass('whitespace-normal')
      expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveClass('[word-break:keep-all]')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).toHaveAttribute('data-guide-anchor', '90,214')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).toHaveAttribute('data-guide-card-position', '158,160')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).toHaveAttribute('data-guide-anchor', '90,304')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).toHaveAttribute('data-guide-card-position', '202,308')
      expect(screen.getByTestId('sidebar-guide-card-model-lab')).toHaveAttribute('data-guide-anchor', '90,394')
      expect(screen.getByTestId('sidebar-guide-card-model-lab')).toHaveAttribute('data-guide-card-position', '246,456')
      expect(screen.getByTestId('sidebar-guide-connectors').querySelector('[data-guide-connector="navigation"]')).toHaveAttribute('data-guide-connector-path', 'M 90 214 H 122 V 208 H 159')
      expect(screen.getByTestId('sidebar-guide-connectors').querySelector('[data-guide-connector="dashboard"]')).toHaveAttribute('data-guide-connector-path', 'M 90 304 H 122 V 356 H 203')
      expect(screen.getByTestId('sidebar-guide-connectors').querySelector('[data-guide-connector="model-lab"]')).toHaveAttribute('data-guide-connector-path', 'M 90 394 H 122 V 504 H 247')
    } finally {
      restoreRects()
    }
  })

  it('closes only the current sidebar guide overlay and opens the intro gate', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '사이드바 안내 닫기' }))

    expect(screen.queryByTestId('sidebar-guide-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-intro-video-enabled', 'true')
    expect(sessionStorage.getItem('roadie-app-sidebar-guide-closed')).toBeNull()
    expect(screen.getByRole('link', { name: '네비게이션' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-navigation')

    return waitFor(() => {
      expect(screen.queryByTestId('sidebar-tooltip-navigation-content')).not.toBeInTheDocument()
    }).then(() => {
      unmount()
      render(<App />)

      expect(screen.getByTestId('sidebar-guide-overlay')).toBeInTheDocument()
      expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-intro-video-enabled', 'false')
    })
  })

  it('hides the first-visit sidebar guide for 24 hours', () => {
    const beforeClick = Date.now()
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '24시간동안 보지 않기' }))

    const hideUntil = Number(localStorage.getItem('roadie-app-sidebar-guide-hidden-until'))
    expect(hideUntil).toBeGreaterThan(beforeClick)
    expect(hideUntil).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60 * 1000)
    expect(screen.queryByTestId('sidebar-guide-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-intro-video-enabled', 'true')

    unmount()
    render(<App />)

    expect(screen.queryByTestId('sidebar-guide-overlay')).not.toBeInTheDocument()
    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-intro-video-enabled', 'true')
  })

  it('keeps only the latest hovered sidebar tooltip visible', async () => {
    localStorage.setItem('roadie-app-sidebar-guide-hidden-until', String(Date.now() + 24 * 60 * 60 * 1000))
    render(<App />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: '사이드바 펼치기' }))

    expect(await screen.findByTestId('sidebar-tooltip-expand-content')).toHaveTextContent('사이드바 펼치기')
    expect(screen.getByTestId('sidebar-tooltip-expand-content')).not.toHaveTextContent('데모 시나리오')

    fireEvent.mouseEnter(screen.getByRole('link', { name: '네비게이션' }))

    expect(await screen.findByTestId('sidebar-tooltip-navigation-content')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveTextContent('네비게이션')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveTextContent('데모 시나리오 흐름과 실제 내비게이션을 자유롭게 조작하고, 단계별 경고를 확인합니다.')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelector('span:first-child')).toHaveClass('text-[0.95rem]')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelector('span:last-child')).toHaveClass('text-sm')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelector('span:last-child')).toHaveClass('[&_strong]:font-extrabold')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content').querySelector('strong')).toHaveClass('font-bold')
    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).toHaveClass('!px-3')
    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).toHaveClass('!py-2')
    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).toHaveClass('roadie-sidebar-tooltip')
    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).not.toHaveClass('!transition-none')
    expect(document.querySelector('.react-tooltip-arrow')).toBeInTheDocument()

    fireEvent.mouseLeave(screen.getByRole('link', { name: '네비게이션' }))

    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).toHaveClass('react-tooltip__closing')

    fireEvent.mouseEnter(screen.getByRole('link', { name: '대시보드' }))

    expect(await screen.findByTestId('sidebar-tooltip-dashboard-content')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-tooltip-dashboard-content')).toHaveTextContent('대시보드')
    expect(screen.getByTestId('sidebar-tooltip-dashboard-content')).toHaveTextContent('운전자가 본인 운전 기록, 주행 데이터, 위험 행동 분석을 확인하고, 개인화 설정을 관리합니다.')
    expect(screen.getByRole('tooltip', { name: /네비게이션/ })).toHaveClass('react-tooltip__closing')

    fireEvent.transitionEnd(screen.getByRole('tooltip', { name: /네비게이션/ }), { propertyName: 'opacity' })

    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-tooltip-navigation-content')).not.toBeInTheDocument()
    })
  })

  it('renders the dashboard page inside the persistent app shell', () => {
    window.history.replaceState(null, '', '/dashboard/overview')

    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
    expect(screen.getByTestId('app-shell')).toHaveClass('h-screen')
    expect(screen.getByTestId('app-shell')).toHaveClass('overflow-hidden')
    expect(screen.getByTestId('app-content')).toHaveClass('h-screen')
    expect(screen.getByTestId('app-content')).toHaveClass('overflow-auto')
    expect(screen.getByTestId('app-content')).toHaveClass('lg:overflow-hidden')
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
  })

  it('renders the model lab page inside the persistent app shell', () => {
    window.history.replaceState(null, '', '/model-lab')

    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
    expect(screen.getByTestId('app-content')).toHaveClass('overflow-auto')
    expect(screen.getByTestId('app-content')).not.toHaveClass('lg:overflow-hidden')
    expect(screen.getByTestId('model-lab-page')).toBeInTheDocument()
  })

  it('keeps the sidebar mounted while sidebar navigation changes the routed content', () => {
    render(<App />)

    const sidebar = screen.getByTestId('global-sidebar')

    fireEvent.click(screen.getByRole('link', { name: '대시보드' }))

    expect(window.location.pathname).toBe('/dashboard/overview')
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
    expect(screen.getByTestId('global-sidebar')).toBe(sidebar)

    fireEvent.click(screen.getByRole('link', { name: '모델 확인' }))

    expect(window.location.pathname).toBe('/model-lab')
    expect(screen.getByTestId('model-lab-page')).toBeInTheDocument()
    expect(screen.getByTestId('global-sidebar')).toBe(sidebar)
  })

  it('persists the expanded sidebar preference through route changes and remounts', () => {
    const { unmount } = render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '사이드바 펼치기' }))

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('max-xl:w-20')
    expect(screen.getByTestId('app-content')).toHaveClass('ml-[18.25rem]')
    expect(screen.getByTestId('app-content')).toHaveClass('max-xl:ml-[7.75rem]')
    expect(screen.getByRole('img', { name: 'ROADY' })).toHaveAttribute('src', '/text_logo.webp')
    expect(screen.getByRole('link', { name: '네비게이션' })).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByRole('link', { name: '네비게이션' })).toHaveClass('bg-white/88')
    expect(screen.getByRole('link', { name: '네비게이션' })).toHaveClass('shadow-[0_12px_24px_rgb(70_95_255/0.12),inset_0_0_0_1px_rgb(70_95_255/0.10)]')
    expect(screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')).toHaveClass('size-11')
    expect(screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')).toHaveClass('rounded-[1.1rem]')
    expect(screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')).toHaveClass('text-[var(--nav-primary)]')
    expect(screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')).not.toHaveClass('bg-[#fbfcff]')
    expect(screen.getByTestId('sidebar-link-icon-sidebar-tooltip-navigation')).not.toHaveClass('shadow-[0_8px_18px_rgb(70_95_255/0.16),inset_0_0_0_1px_rgb(70_95_255/0.10)]')
    expect(localStorage.getItem('roadie-app-sidebar-collapsed')).toBe('false')

    fireEvent.click(screen.getByRole('link', { name: '모델 확인' }))

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')

    unmount()
    window.history.replaceState(null, '', '/')
    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toHaveAttribute('data-tooltip-id', 'sidebar-tooltip-collapse')
    expect(screen.getByTestId('sidebar-tooltip-navigation-content')).toHaveTextContent('데모 시나리오')
  })

  it('anchors the first-visit guide to expanded sidebar link bounds', () => {
    const restoreRects = mockSidebarGuideRects()

    try {
      localStorage.setItem('roadie-app-sidebar-collapsed', 'false')
      render(<App />)

      expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).toHaveAttribute('data-guide-anchor', '258,214')
      expect(screen.getByTestId('sidebar-guide-card-navigation')).toHaveAttribute('data-guide-card-position', '326,160')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).toHaveAttribute('data-guide-anchor', '258,304')
      expect(screen.getByTestId('sidebar-guide-card-dashboard')).toHaveAttribute('data-guide-card-position', '370,308')
      expect(screen.getByTestId('sidebar-guide-card-model-lab')).toHaveAttribute('data-guide-anchor', '258,394')
      expect(screen.getByTestId('sidebar-guide-card-model-lab')).toHaveAttribute('data-guide-card-position', '414,456')
      expect(screen.getByTestId('sidebar-guide-connectors').querySelector('[data-guide-connector="navigation"]')).toHaveAttribute('data-guide-connector-path', 'M 258 214 H 290 V 208 H 327')
    } finally {
      restoreRects()
    }
  })
})
