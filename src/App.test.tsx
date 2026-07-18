import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./features/navigation/components/NavigationShell', () => ({
  NavigationShell: () => (
    <div data-testid="navigation-shell" />
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

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  it('renders the navigation page inside the persistent app shell', () => {
    render(<App />)

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('navigation-shell')).toBeInTheDocument()
  })

  it('renders the sidebar as a floating rail instead of a full-height attached column', () => {
    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toHaveClass('fixed')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('roadie-global-sidebar')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('left-4')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('top-4')
    expect(screen.getByTestId('global-sidebar')).toHaveClass('h-[calc(100vh-2rem)]')
    expect(screen.getByTestId('global-sidebar')).not.toHaveClass('h-screen')
    expect(screen.getByTestId('app-content')).toHaveClass('ml-[7.75rem]')
  })

  it('defaults the sidebar to the collapsed state when no preference is saved', () => {
    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument()
  })

  it('renders the dashboard page inside the persistent app shell', () => {
    window.history.replaceState(null, '', '/dashboard/overview')

    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
    expect(screen.getByTestId('dashboard-page')).toBeInTheDocument()
  })

  it('renders the model lab page inside the persistent app shell', () => {
    window.history.replaceState(null, '', '/model-lab')

    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('app-shell')).toHaveClass('roadie-paper-app-shell')
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
    expect(screen.getByTestId('app-content')).toHaveClass('ml-[19.25rem]')
    expect(screen.getByRole('img', { name: 'ROADY' })).toHaveAttribute('src', '/text_logo.webp')
    expect(localStorage.getItem('roadie-app-sidebar-collapsed')).toBe('false')

    fireEvent.click(screen.getByRole('link', { name: '모델 확인' }))

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')

    unmount()
    window.history.replaceState(null, '', '/')
    render(<App />)

    expect(screen.getByTestId('global-sidebar')).toHaveAttribute('data-collapsed', 'false')
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument()
  })
})
