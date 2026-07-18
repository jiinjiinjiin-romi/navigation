import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DashboardApp } from './DashboardApp'
import { getBootstrap } from '../navigation/api/bootstrapApi'
import { listProfiles, selectProfile, updateProfile, type Profile } from '../navigation/api/profileApi'
import { searchPlaces } from '../navigation/api/tmapApi'

vi.mock('../navigation/api/bootstrapApi', () => ({
  getBootstrap: vi.fn(),
}))

vi.mock('../navigation/api/profileApi', () => ({
  listProfiles: vi.fn(),
  selectProfile: vi.fn(),
  TTS_VOICE_OPTIONS: [
    ['jinho', '지호'],
    ['nes_c_kihyo', '기효'],
    ['nes_c_hyeri', '혜리'],
    ['nara', '아라'],
    ['ngyeongjun', '경준'],
  ],
  updateProfile: vi.fn(),
}))

vi.mock('../navigation/api/tmapApi', () => ({
  searchPlaces: vi.fn(),
}))

const dashboardProfiles: Profile[] = [
  {
    id: 'profile-dad',
    displayName: '아빠',
    agentCallName: '로디',
    profileImageUrl: null,
    reportEmail: 'dad@example.com',
    agentPersonality: 'FRIENDLY',
    warningSensitivity: 'MEDIUM',
    behaviorWarningSensitivity: {
      DROWSINESS: 9,
      PHONE_USE: 8,
      FOOD_OR_DRINK: 5,
      GAZE_AWAY: 8,
      SECONDARY_TASK: 7,
      REACHING_BEHIND: 4,
      SMOKING: 3,
    },
    ttsVoiceId: null,
    ttsSpeed: 1.05,
    guidanceVolume: 72,
    theme: 'SYSTEM',
    lastUsedAt: '2026-07-05T00:00:00.000000Z',
    createdAt: '2026-07-01T00:00:00.000000Z',
    updatedAt: '2026-07-05T00:00:00.000000Z',
  },
  {
    id: 'profile-mom',
    displayName: '엄마',
    agentCallName: '로미',
    profileImageUrl: null,
    reportEmail: 'mom@example.com',
    agentPersonality: 'WARM',
    warningSensitivity: 'HIGH',
    behaviorWarningSensitivity: {
      DROWSINESS: 10,
      PHONE_USE: 9,
      FOOD_OR_DRINK: 6,
      GAZE_AWAY: 9,
      SECONDARY_TASK: 8,
      REACHING_BEHIND: 5,
      SMOKING: 3,
    },
    ttsVoiceId: null,
    ttsSpeed: 1.15,
    guidanceVolume: 80,
    theme: 'SYSTEM',
    lastUsedAt: null,
    createdAt: '2026-07-01T00:00:00.000000Z',
    updatedAt: '2026-07-05T00:00:00.000000Z',
  },
]

const mockedGetBootstrap = vi.mocked(getBootstrap)
const mockedListProfiles = vi.mocked(listProfiles)
const mockedSelectProfile = vi.mocked(selectProfile)
const mockedUpdateProfile = vi.mocked(updateProfile)
const mockedSearchPlaces = vi.mocked(searchPlaces)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  localStorage.clear()
  window.history.replaceState({}, '', '/dashboard')
  mockedGetBootstrap.mockResolvedValue({
    account: {
      id: 'account-1',
      displayName: '안정현',
      email: 'driver@example.com',
    },
    profiles: dashboardProfiles,
    selectedProfileId: 'profile-dad',
    profileLimit: 5,
    capabilities: {
      demoMode: true,
      emailAvailable: false,
      geminiAvailable: false,
      vitModelAvailable: true,
    },
  })
  mockedListProfiles.mockResolvedValue({
    profiles: dashboardProfiles,
    count: dashboardProfiles.length,
    limit: 5,
  })
  mockedSelectProfile.mockResolvedValue({
    selectedAt: '2026-07-05T00:00:00.000000Z',
    selectedProfileId: 'profile-mom',
  })
  mockedUpdateProfile.mockResolvedValue({ ...dashboardProfiles[0], ttsVoiceId: 'nes_c_hyeri' })
  mockedSearchPlaces.mockResolvedValue([
    {
      id: 'poi-sejong',
      name: '세종대학교',
      address: '서울 광진구 능동로 209',
      coordinate: { lat: 37.5509, lng: 127.0738 },
    },
  ])
})

function activateTab(name: string) {
  const tab = screen.getByRole('tab', { name })
  fireEvent.pointerDown(tab)
  fireEvent.click(tab)
}

describe('DashboardApp', () => {
  test('guards dashboard pages behind mock login and opens overview after login', () => {
    const { container } = render(<DashboardApp />)

    expect(screen.getByLabelText('이메일')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('이메일'), {
      target: { value: 'driver@example.com' },
    })
    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: { value: 'demo-password' },
    })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    expect(screen.getByRole('heading', { name: '운전 리포트 개요' })).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-app')).toHaveClass('bg-transparent')
    expect(screen.getByText('안전 점수')).toBeInTheDocument()
    expect(container.querySelector('img[src="/roady_logo.webp"]')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'ROADY' })).toHaveAttribute('src', '/text_logo.webp')
    expect(localStorage.getItem('roadie-dashboard-session')).toBe('active')
  })

  test('navigates between the main dashboard sections', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/overview')
    render(<DashboardApp />)

    expect(screen.queryByRole('link', { name: '주행 영상' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '운전 행동' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '주행 기록' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '분석' }))
    expect(await screen.findByRole('heading', { name: '분석' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '보고서' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '주행 영상' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '운전 행동' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '내비게이션 설정' }))
    expect(await screen.findByRole('heading', { name: '내비게이션 설정' })).toBeInTheDocument()
  })

  test('updates driving video event detail when an event marker is selected', () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    activateTab('주행 영상')
    const drowsyEventButtons = screen.getAllByRole('button', { name: /졸음 징후 감지/ })
    fireEvent.click(drowsyEventButtons[drowsyEventButtons.length - 1])

    expect(screen.getByTestId('driver-video-panel')).toHaveClass('driver-video-player-surface')
    expect(screen.queryByLabelText('운전자 영상 파일 선택')).not.toBeInTheDocument()
    expect(screen.queryByText('영상 선택')).not.toBeInTheDocument()
    const detailPanel = screen.getByTestId('dashboard-video-event-detail')
    expect(within(detailPanel).getByText('졸음 징후 감지')).toBeInTheDocument()
    expect(within(detailPanel).getByText('위험도 3')).toBeInTheDocument()
  })

  test('filters behavior analytics by selected behavior type', () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    activateTab('운전 행동')
    fireEvent.click(screen.getByRole('button', { name: '졸음 필터' }))

    expect(screen.getByTestId('dashboard-behavior-focus')).toHaveTextContent('졸음')
    expect(screen.getByText('평균 지속 12초')).toBeInTheDocument()
  })

  test('shows a saved state after changing navigation settings', () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/navigation')
    render(<DashboardApp />)

    expect(screen.queryByRole('link', { name: '프로필' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '장소 추가' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '설정 저장' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '3D 지도 기본값' }))
    expect(screen.getByRole('button', { name: '설정 저장' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }))

    expect(screen.getByText('저장됨')).toBeInTheDocument()

    activateTab('즐겨찾기 장소')
    expect(screen.getByRole('button', { name: '장소 추가' })).toBeInTheDocument()
  })

  test('persists the selected assistant speaker for the dashboard profile', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/navigation')
    render(<DashboardApp />)

    const speakerSelect = await screen.findByRole('combobox', { name: '안내 화자' })
    fireEvent.pointerDown(speakerSelect, {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.mouseDown(speakerSelect, { button: 0 })
    fireEvent.click(await screen.findByRole('option', { name: '혜리' }))
    fireEvent.click(screen.getByRole('button', { name: '설정 저장' }))

    await waitFor(() => {
      expect(mockedUpdateProfile).toHaveBeenCalledWith('profile-dad', { ttsVoiceId: 'nes_c_hyeri' })
    })
  })

  test('searches favorite place addresses with navigation autocomplete', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/navigation')
    render(<DashboardApp />)

    activateTab('즐겨찾기 장소')

    const addressInput = screen.getAllByLabelText('주소')[0]
    fireEvent.focus(addressInput)
    fireEvent.change(addressInput, { target: { value: '세종대' } })

    await waitFor(() => expect(mockedSearchPlaces).toHaveBeenCalledWith('세종대', undefined, expect.any(AbortSignal)))
    fireEvent.click(await screen.findByRole('button', { name: /세종대학교/ }))

    expect(addressInput).toHaveValue('서울 광진구 능동로 209')
  })

  test('loads backend profiles after login and switches dashboard profile', async () => {
    render(<DashboardApp />)

    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    const profileSelect = await screen.findByRole('combobox', { name: '대시보드 프로필' })
    expect(screen.getByText('아빠')).toBeInTheDocument()

    fireEvent.pointerDown(profileSelect, {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.mouseDown(profileSelect, { button: 0 })
    fireEvent.click(await screen.findByRole('option', { name: '엄마' }))

    expect(mockedSelectProfile).toHaveBeenCalledWith('profile-mom')
    expect(await screen.findByText('77점')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: '내비게이션 설정' }))

    expect(await screen.findByDisplayValue('엄마')).toBeInTheDocument()
    expect(screen.getByDisplayValue('mom@example.com')).toBeInTheDocument()
  })

  test('enables notification save only after notification settings change', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/settings/notifications')
    render(<DashboardApp />)

    const saveButton = screen.getByRole('button', { name: '저장' })
    expect(saveButton).toBeDisabled()

    fireEvent.click(screen.getAllByRole('switch')[0])

    await waitFor(() => expect(saveButton).toBeEnabled())
  })

  test('keeps selected trip when switching analysis tabs', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/analysis')
    render(<DashboardApp />)

    activateTab('주행 영상')

    expect(await screen.findByRole('heading', { name: '분석' })).toBeInTheDocument()
    expect(screen.getByTestId('driver-video-panel')).toBeInTheDocument()
  })

  test('recalculates overview metrics when the global period changes', async () => {
    localStorage.setItem('roadie-dashboard-session', 'active')
    window.history.replaceState({}, '', '/dashboard/overview')
    render(<DashboardApp />)

    const periodSelect = screen.getByRole('combobox', { name: '개요 기간' })
    fireEvent.pointerDown(periodSelect, {
      button: 0,
      ctrlKey: false,
      pointerId: 1,
      pointerType: 'mouse',
    })
    fireEvent.mouseDown(periodSelect, { button: 0 })
    fireEvent.keyDown(periodSelect, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('option', { name: '오늘' }))

    expect(screen.getByText('500.4km')).toBeInTheDocument()
    expect(screen.getByText('3회 주행')).toBeInTheDocument()
  })
})
