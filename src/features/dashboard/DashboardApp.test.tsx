import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DashboardApp } from './DashboardApp'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/dashboard')
})

describe('DashboardApp', () => {
  test('guards dashboard pages behind mock login and opens overview after login', () => {
    render(<DashboardApp />)

    expect(screen.getByRole('heading', { name: 'JIIN 대시보드 로그인' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'driver@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'demo-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: '대시보드 시작' }))

    expect(screen.getByRole('heading', { name: '운전 리포트 개요' })).toBeInTheDocument()
    expect(screen.getByText('이번 주 안전 점수')).toBeInTheDocument()
    expect(localStorage.getItem('jiin-dashboard-session')).toBe('active')
  })

  test('navigates between the main dashboard sections', async () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/overview')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('link', { name: '주행 영상' }))
    expect(await screen.findByRole('heading', { name: '주행 영상 리뷰' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '운전 행동' }))
    expect(await screen.findByRole('heading', { name: '운전 행동 분석' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '네비게이션 설정' }))
    expect(await screen.findByRole('heading', { name: '네비게이션 설정' })).toBeInTheDocument()
  })

  test('updates driving video event detail when an event marker is selected', () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/videos')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: /휴대폰 사용 이벤트 보기/ }))

    const detailPanel = screen.getByTestId('dashboard-video-event-detail')
    expect(within(detailPanel).getByText('휴대폰 사용')).toBeInTheDocument()
    expect(within(detailPanel).getByText('위험도 4')).toBeInTheDocument()
  })

  test('filters behavior analytics by selected behavior type', () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/behavior')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: '졸음 필터' }))

    expect(screen.getByTestId('dashboard-behavior-focus')).toHaveTextContent('졸음')
    expect(screen.getByText('평균 지속 42초')).toBeInTheDocument()
  })

  test('shows a saved state after changing navigation settings', () => {
    vi.useFakeTimers()
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/navigation')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: '3D 지도 기본값' }))
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }))

    expect(screen.getByText('저장됨')).toBeInTheDocument()

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })
})
