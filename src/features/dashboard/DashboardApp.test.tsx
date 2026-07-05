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
    expect(screen.getByText('안전 점수')).toBeInTheDocument()
    expect(localStorage.getItem('jiin-dashboard-session')).toBe('active')
  })

  test('navigates between the main dashboard sections', async () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/overview')
    render(<DashboardApp />)

    expect(screen.queryByRole('link', { name: '주행 영상' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '운전 행동' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '주행 기록' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '분석' }))
    expect(await screen.findByRole('heading', { name: '분석' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '주행 영상' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '운전 행동' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '네비게이션 설정' }))
    expect(await screen.findByRole('heading', { name: '네비게이션 설정' })).toBeInTheDocument()
  })

  test('updates driving video event detail when an event marker is selected', () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: '주행 영상' }))
    fireEvent.click(screen.getByRole('button', { name: /휴대폰 사용 이벤트 보기/ }))

    expect(screen.getByTestId('driver-video-panel')).toHaveClass('driver-video-player-surface')
    expect(screen.queryByLabelText('운전자 영상 파일 선택')).not.toBeInTheDocument()
    expect(screen.queryByText('영상 선택')).not.toBeInTheDocument()
    const detailPanel = screen.getByTestId('dashboard-video-event-detail')
    expect(within(detailPanel).getByText('휴대폰 사용')).toBeInTheDocument()
    expect(within(detailPanel).getByText('위험도 4')).toBeInTheDocument()
  })

  test('filters behavior analytics by selected behavior type', () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: '운전 행동' }))
    fireEvent.click(screen.getByRole('button', { name: '졸음 필터' }))

    expect(screen.getByTestId('dashboard-behavior-focus')).toHaveTextContent('졸음')
    expect(screen.getByText('평균 지속 42초')).toBeInTheDocument()
  })

  test('shows a saved state after changing navigation settings', () => {
    vi.useFakeTimers()
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/navigation')
    render(<DashboardApp />)

    expect(screen.queryByRole('link', { name: '프로필' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '장소 추가' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '3D 지도 기본값' }))
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }))

    expect(screen.getByText('저장됨')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '즐겨찾기 장소' }))
    expect(screen.getByRole('button', { name: '장소 추가' })).toBeInTheDocument()

    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  test('keeps selected trip when switching analysis tabs', async () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    fireEvent.change(screen.getByLabelText('분석 날짜'), { target: { value: '2026-07-04' } })
    fireEvent.change(screen.getByLabelText('분석 주행 기록'), { target: { value: 'trip-02' } })
    fireEvent.click(screen.getByRole('button', { name: '주행 영상' }))

    expect(await screen.findByRole('heading', { name: '분석' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '주행 영상' })).toBeInTheDocument()
  })

  test('recalculates overview metrics when the global period changes', () => {
    localStorage.setItem('jiin-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/overview')
    render(<DashboardApp />)

    fireEvent.change(screen.getByLabelText('개요 기간'), { target: { value: 'today' } })

    expect(screen.getByText('18.4km')).toBeInTheDocument()
    expect(screen.getByText('1회 주행')).toBeInTheDocument()
  })
})
