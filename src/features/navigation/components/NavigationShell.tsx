import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Avatar from 'boring-avatars'
import Plyr from 'plyr'
import {
  ArrowBendUpRight,
  ArrowCounterClockwise,
  ArrowUp,
  Article,
  Buildings,
  CaretLeft,
  CaretRight,
  Check,
  CircleNotch,
  CloudSun,
  Clock,
  CarSimple,
  ClipboardText,
  DotsThree,
  FileVideo,
  GearSix,
  HouseLine,
  MagnifyingGlass,
  MapPin,
  Minus,
  MusicNotes,
  PencilSimple,
  Play,
  Pause,
  Plus,
  Phone,
  PlugsConnected,
  RoadHorizon,
  SpeakerHigh,
  Stop,
  Timer,
  Trash,
  UploadSimple,
  UserCircle,
  WifiHigh,
  Warning,
  X,
} from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { VoiceOrb } from '@/features/orb'
import type { OrbAssistantState, OrbColorTheme } from '@/features/orb'
import {
  createRoadieAssistantScenarios,
  type AiaiScenarioId,
  type RoadieAssistantRecommendation,
  type RoadieAssistantScenario,
  type RoadieAssistantStep,
} from '@/features/assistant-scenarios'
import {
  DEMO_DESTINATION,
  advanceDemoScenario,
  createInitialDemoScenarioState,
  getDemoScenarios,
  respondToDemoScenario,
  type DemoScenarioControllerState,
  type DemoScenarioId,
} from '@/features/demo-scenarios'
import { VoiceWave } from '@/features/voice-wave'
import { type CSSProperties, type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createProfile,
  DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  DEFAULT_PROFILE_CREATE_REQUEST,
  deleteProfile,
  selectProfile,
  updateProfile,
  type AgentPersonality,
  type BehaviorWarningSensitivityValue,
  type Profile,
  type ProfileBehaviorType,
  type ProfileCreateRequest,
} from '../api/profileApi'
import { getBootstrap } from '../api/bootstrapApi'
import {
  createFavorite,
  deleteSavedPlace,
  listSavedPlaces,
  updateSavedPlace,
  type SavedPlaceSummary,
  type SavedPlaceType,
  type SavedPlaceWriteRequest,
} from '../api/savedPlaceApi'
import {
  createSearchHistory,
  listSearchHistories,
  type SearchHistoryCreateRequest,
  type SearchHistoryItem,
} from '../api/searchHistoryApi'
import { getCurrentAddress, getRoadMatch, getRouteOptions, searchPlaces } from '../api/tmapApi'
import { synthesizeVoice } from '../api/voiceApi'
import { getMusicRecommendations, type MusicMood, type MusicRecommendationTrack } from '../api/musicApi'
import { createRoundedRoutePath } from '../map/routeGeometry'
import { markRoutePerformance, measureRoutePerformance } from '../performance/routePerformance'
import { createRouteSimulationPlan, getSimulatedRoutePosition } from '../simulation/routeSimulation'
import { getSimulationDurationMs } from '../simulation/simulationTiming'
import type { Coordinate, NavigationRoute, NavigationRouteOption, Place, RoadMatchPoint, RouteManeuver, SafetyAlert } from '../types'
import accidentSignSrc from '../assets/road-signs/141.png'
import bridgeSignSrc from '../assets/road-signs/122.png'
import boxTunnelSignSrc from '../assets/road-signs/130.png'
import cautionSignSrc from '../assets/road-signs/140.png'
import curveSignSrc from '../assets/road-signs/113.png'
import fallingRockSignSrc from '../assets/road-signs/130.png'
import leftManeuverSrc from '../assets/maneuvers/left.png'
import overpassSignSrc from '../assets/road-signs/120.png'
import rightManeuverSrc from '../assets/maneuvers/right.png'
import schoolZoneSignSrc from '../assets/road-signs/133.png'
import sideOverpassSignSrc from '../assets/road-signs/124.png'
import sideUnderpassSignSrc from '../assets/road-signs/123.png'
import tunnelSignSrc from '../assets/road-signs/121.png'
import underpassSignSrc from '../assets/road-signs/119.png'
import { TmapPanel, type MapCameraSettings } from './TmapPanel'

type SearchFieldId = 'origin' | 'destination'
type LocationStatus = 'checking' | 'granted' | 'denied' | 'unsupported'
type SidePanelId = 'labels' | 'settings' | 'report' | 'connect'
type ProfileSetupView = 'list' | 'create' | 'edit' | 'calibration'
type ProfileSettingsPageId = 'basic' | 'guidance' | 'behavior'
type NavigationEntryMode = 'free-navigation' | 'demo-scenario'
export type DriverVideoSource = {
  name: string
  type: string
  url: string
}
export type MotionTiming = {
  duration: number
  ease?: [number, number, number, number]
}
type CalibrationTiming = {
  progressIntervalMs?: number
  progressStep?: number
  stepCompleteDelayMs?: number
}
type SavedPlaceQuickItem = Place & {
  placeType: SavedPlaceType
  targetField: SearchFieldId
}
type RouteSearchSavedPlace = Place & {
  targetField?: SearchFieldId
}
type CalibrationStep = {
  title: string
  description: string
}
type ReportBehaviorType = ProfileBehaviorType
type MockReportSession = {
  sessionId: string
  startedAt: string
  endedAt: string | null
  destinationName: string | null
  durationSeconds: number
  distanceMeters: number
  averageSpeedKph: number | null
  safetyScore: number | null
  behaviorEventCount: number
  interventionCount: number
  correctedBehaviorCount: number
  behaviorCorrectionRate: number
}
type MockTimelineEvent = {
  eventId: string
  startedAt: string
  endedAt: string | null
  durationMs: number | null
  behaviorType: string
  status: string
  riskLevel: number
  drivingState: string
  speedKph: number | null
  averageConfidence: number
  maximumConfidence: number
  resolutionReason: string | null
  interventionText: string
  corrected: boolean
}
type MockLocationSample = Coordinate & {
  accuracyMeters: number | null
  drivingState: string
  recordedAt: string
  source: 'GPS' | 'SIMULATION'
  speedKph: number | null
}
type MockReportData = {
  summary: {
    period: { start: string; end: string }
    overview: {
      totalSessions: number
      totalDrivingSeconds: number
      totalDistanceMeters: number
      averageSafetyScore: number | null
      behaviorEventCount: number
      interventionCount: number
      correctedBehaviorCount: number
      behaviorCorrectionRate: number
      averageResponseLatencyMs: number | null
    }
    behaviorCounts: Record<string, number>
    riskLevelCounts: Record<string, number>
    dailySafetyScores: Array<{ date: string; score: number }>
    comparison: {
      previousPeriodStart: string
      previousPeriodEnd: string
      previousAverageSafetyScore: number | null
      scoreChange: number | null
      phoneUseChangePercent: number | null
    }
  }
  behaviorReport: {
    totalEventCount: number
    statistics: Array<{
      behaviorType: string
      eventCount: number
      totalDurationMs: number
      averageDurationMs: number | null
      averageConfidence: number | null
      maximumRiskLevel: number | null
      correctedCount: number
      correctionRate: number
    }>
    riskLevelCounts: Record<string, number>
    hourlyCounts: Array<{ hour: number; count: number }>
  }
  reportSessions: {
    items: MockReportSession[]
    page: number
    size: number
    total: number
    totalPages: number
  }
  sessionDetails: Record<string, {
    id: string
    status: string
    endReason: string | null
    startedAt: string
    endedAt: string | null
    startLocation: Coordinate
    endLocation: Coordinate | null
    destinationName: string | null
    distanceMeters: number
    durationSeconds: number
    averageSpeedKph: number | null
    safetyScore: number | null
    summary: {
      behaviorEventCount: number
      interventionCount: number
      correctedBehaviorCount: number
      behaviorCorrectionRate: number
      averageResponseLatencyMs: number | null
    }
  }>
  timelines: Record<string, MockTimelineEvent[]>
  locations: Record<string, MockLocationSample[]>
}

const CURRENT_LOCATION_PLACE_ID = 'current-location'
const PRODUCT_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const WEATHER_STALE_TIME_MS = 10 * 60 * 1000
const SEARCH_DEBOUNCE_MS = 250
const REPORT_BEHAVIOR_TYPES: ReportBehaviorType[] = [
  'DROWSINESS',
  'PHONE_USE',
  'FOOD_OR_DRINK',
  'GAZE_AWAY',
  'SECONDARY_TASK',
  'REACHING_BEHIND',
  'SMOKING',
]
const REPORT_PERIOD_PRESETS = [
  { id: 'today', label: '오늘' },
  { id: 'last7', label: '최근 7일' },
  { id: 'last30', label: '최근 30일' },
  { id: 'month', label: '이번 달' },
] as const
const PROFILE_SETTINGS_PAGES: Array<{ id: ProfileSettingsPageId; label: string }> = [
  { id: 'basic', label: '기본 정보' },
  { id: 'guidance', label: '안내 설정' },
  { id: 'behavior', label: '행동 민감도' },
]
const CALIBRATION_STEPS: CalibrationStep[] = [
  {
    title: '정면을 바라봐 주세요',
    description: '얼굴 인식을 시작합니다. 원이 채워질 때까지 잠시만 기다려 주세요.',
  },
  {
    title: '얼굴을 왼쪽으로 돌려주세요',
    description: '왼쪽 얼굴 각도와 시선 기준을 확인하고 있어요.',
  },
  {
    title: '얼굴을 오른쪽으로 돌려주세요',
    description: '오른쪽 얼굴 각도와 시선 기준을 확인하고 있어요.',
  },
  {
    title: '평소 운전 자세를 유지해주세요',
    description: '운전 중 자세와 시선 패턴을 맞추고 있어요.',
  },
  {
    title: '완료되었습니다',
    description: '이제부터 신체정보에 맞게 더 높은 정확도로 운전을 보조해드릴게요.',
  },
]
const CALIBRATION_PROGRESS_INTERVAL_RANGE_MS = [180, 520] as const
const CALIBRATION_PROGRESS_STEP_RANGE = [1, 4] as const
const CALIBRATION_STEP_COMPLETE_DELAY_MS = 420

function getRandomIntegerInRange([min, max]: readonly [number, number]) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const REPORT_CHART_COLORS = {
  primary: '#1746a2',
  primarySoft: '#e8eeff',
  guidance: '#16a34a',
  warning: '#f97316',
  danger: '#e11d48',
  ai: '#6d5df6',
  panel: '#f9fafc',
  border: '#e4e7ec',
  muted: '#475467',
  ink: '#101828',
}
const MOCK_REPORT_DATA: MockReportData = {
  summary: {
    period: { start: '2026-06-30', end: '2026-07-06' },
    overview: {
      totalSessions: 3,
      totalDrivingSeconds: 24_840,
      totalDistanceMeters: 500_400,
      averageSafetyScore: 82,
      behaviorEventCount: 9,
      interventionCount: 9,
      correctedBehaviorCount: 7,
      behaviorCorrectionRate: 77.8,
      averageResponseLatencyMs: 1_800,
    },
    behaviorCounts: {
      DROWSINESS: 2,
      PHONE_USE: 2,
      GAZE_AWAY: 3,
      SECONDARY_TASK: 2,
    },
    riskLevelCounts: {
      '0': 1,
      '1': 2,
      '2': 4,
      '3': 3,
    },
    dailySafetyScores: [
      { date: '2026-06-30', score: 84 },
      { date: '2026-07-01', score: 85 },
      { date: '2026-07-02', score: 86 },
      { date: '2026-07-03', score: 84 },
      { date: '2026-07-04', score: 86 },
      { date: '2026-07-05', score: 87 },
      { date: '2026-07-06', score: 82 },
    ],
    comparison: {
      previousPeriodStart: '2026-06-23',
      previousPeriodEnd: '2026-06-29',
      previousAverageSafetyScore: 82,
      scoreChange: 4,
      phoneUseChangePercent: -18,
    },
  },
  behaviorReport: {
    totalEventCount: 9,
    statistics: [
      {
        behaviorType: 'DROWSINESS',
        eventCount: 2,
        totalDurationMs: 24_000,
        averageDurationMs: 12_000,
        averageConfidence: 0.89,
        maximumRiskLevel: 3,
        correctedCount: 2,
        correctionRate: 100,
      },
      {
        behaviorType: 'PHONE_USE',
        eventCount: 2,
        totalDurationMs: 29_000,
        averageDurationMs: 14_500,
        averageConfidence: 0.89,
        maximumRiskLevel: 3,
        correctedCount: 1,
        correctionRate: 50,
      },
      {
        behaviorType: 'FOOD_OR_DRINK',
        eventCount: 0,
        totalDurationMs: 0,
        averageDurationMs: null,
        averageConfidence: null,
        maximumRiskLevel: null,
        correctedCount: 0,
        correctionRate: 0,
      },
      {
        behaviorType: 'GAZE_AWAY',
        eventCount: 3,
        totalDurationMs: 16_000,
        averageDurationMs: 5_333,
        averageConfidence: 0.81,
        maximumRiskLevel: 1,
        correctedCount: 3,
        correctionRate: 100,
      },
      {
        behaviorType: 'SECONDARY_TASK',
        eventCount: 2,
        totalDurationMs: 28_000,
        averageDurationMs: 14_000,
        averageConfidence: 0.87,
        maximumRiskLevel: 3,
        correctedCount: 1,
        correctionRate: 50,
      },
      {
        behaviorType: 'REACHING_BEHIND',
        eventCount: 0,
        totalDurationMs: 0,
        averageDurationMs: null,
        averageConfidence: null,
        maximumRiskLevel: null,
        correctedCount: 0,
        correctionRate: 0,
      },
      {
        behaviorType: 'SMOKING',
        eventCount: 0,
        totalDurationMs: 0,
        averageDurationMs: null,
        averageConfidence: null,
        maximumRiskLevel: null,
        correctedCount: 0,
        correctionRate: 0,
      },
    ],
    riskLevelCounts: {
      '0': 1,
      '1': 2,
      '2': 4,
      '3': 3,
    },
    hourlyCounts: [
      { hour: 8, count: 1 },
      { hour: 12, count: 0 },
      { hour: 15, count: 0 },
      { hour: 17, count: 1 },
      { hour: 19, count: 1 },
    ],
  },
  reportSessions: {
    items: [
      {
        sessionId: 'session-1',
        startedAt: '2026-07-06T08:12:00.000000Z',
        endedAt: '2026-07-06T10:30:00.000000Z',
        destinationName: '오씨칼국수 본점',
        durationSeconds: 8_280,
        distanceMeters: 166_800,
        averageSpeedKph: 72,
        safetyScore: 82,
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 3,
        behaviorCorrectionRate: 100,
      },
      {
        sessionId: 'session-2',
        startedAt: '2026-07-06T17:42:00.000000Z',
        endedAt: '2026-07-06T20:00:00.000000Z',
        destinationName: '오씨칼국수 본점',
        durationSeconds: 8_280,
        distanceMeters: 166_800,
        averageSpeedKph: 72,
        safetyScore: 78,
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 2,
        behaviorCorrectionRate: 66.7,
      },
      {
        sessionId: 'session-3',
        startedAt: '2026-07-06T19:10:00.000000Z',
        endedAt: '2026-07-06T21:28:00.000000Z',
        destinationName: '오씨칼국수 본점',
        durationSeconds: 8_280,
        distanceMeters: 166_800,
        averageSpeedKph: 72,
        safetyScore: 85,
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 1,
        behaviorCorrectionRate: 33.3,
      },
    ],
    page: 1,
    size: 20,
    total: 3,
    totalPages: 1,
  },
  sessionDetails: {
    'session-1': {
      id: 'session-1',
      status: 'COMPLETED',
      endReason: 'USER_REQUEST',
      startedAt: '2026-07-06T08:12:00.000000Z',
      endedAt: '2026-07-06T10:30:00.000000Z',
      startLocation: { lat: 37.5502, lng: 127.073 },
      endLocation: { lat: 36.3378, lng: 127.4309 },
      destinationName: '오씨칼국수 본점',
      distanceMeters: 166_800,
      durationSeconds: 8_280,
      averageSpeedKph: 72,
      safetyScore: 82,
      summary: {
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 3,
        behaviorCorrectionRate: 100,
        averageResponseLatencyMs: 1_200,
      },
    },
    'session-2': {
      id: 'session-2',
      status: 'COMPLETED',
      endReason: 'USER_REQUEST',
      startedAt: '2026-07-06T17:42:00.000000Z',
      endedAt: '2026-07-06T20:00:00.000000Z',
      startLocation: { lat: 37.5502, lng: 127.073 },
      endLocation: { lat: 36.3378, lng: 127.4309 },
      destinationName: '오씨칼국수 본점',
      distanceMeters: 166_800,
      durationSeconds: 8_280,
      averageSpeedKph: 72,
      safetyScore: 78,
      summary: {
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 2,
        behaviorCorrectionRate: 66.7,
        averageResponseLatencyMs: 2_400,
      },
    },
    'session-3': {
      id: 'session-3',
      status: 'COMPLETED',
      endReason: 'USER_REQUEST',
      startedAt: '2026-07-06T19:10:00.000000Z',
      endedAt: '2026-07-06T21:28:00.000000Z',
      startLocation: { lat: 37.5502, lng: 127.073 },
      endLocation: { lat: 36.3378, lng: 127.4309 },
      destinationName: '오씨칼국수 본점',
      distanceMeters: 166_800,
      durationSeconds: 8_280,
      averageSpeedKph: 72,
      safetyScore: 85,
      summary: {
        behaviorEventCount: 3,
        interventionCount: 3,
        correctedBehaviorCount: 1,
        behaviorCorrectionRate: 33.3,
        averageResponseLatencyMs: 900,
      },
    },
  },
  timelines: {
    'session-1': [
      {
        eventId: 'event-1',
        startedAt: '2026-07-06T08:12:12.000000Z',
        endedAt: '2026-07-06T08:12:22.000000Z',
        durationMs: 10_000,
        behaviorType: 'DROWSINESS',
        status: 'RESOLVED',
        riskLevel: 2,
        drivingState: 'MOVING',
        speedKph: 34,
        averageConfidence: 0.87,
        maximumConfidence: 0.91,
        resolutionReason: 'BEHAVIOR_CORRECTED',
        interventionText: '창문 열기 제안 후 정상 주행 복귀',
        corrected: true,
      },
      {
        eventId: 'event-2',
        startedAt: '2026-07-06T08:12:31.000000Z',
        endedAt: '2026-07-06T08:12:45.000000Z',
        durationMs: 14_000,
        behaviorType: 'DROWSINESS',
        status: 'RESOLVED',
        riskLevel: 3,
        drivingState: 'MOVING',
        speedKph: 32,
        averageConfidence: 0.91,
        maximumConfidence: 0.94,
        resolutionReason: 'BEHAVIOR_CORRECTED',
        interventionText: '휴식 경로 안내 후 위험 상황 완화',
        corrected: true,
      },
    ],
    'session-2': [
      {
        eventId: 'event-3',
        startedAt: '2026-07-06T17:42:10.000000Z',
        endedAt: '2026-07-06T17:42:22.000000Z',
        durationMs: 12_000,
        behaviorType: 'PHONE_USE',
        status: 'RESOLVED',
        riskLevel: 2,
        drivingState: 'MOVING',
        speedKph: 33,
        averageConfidence: 0.86,
        maximumConfidence: 0.9,
        resolutionReason: 'BEHAVIOR_REPEATED',
        interventionText: '휴대폰 주의 안내 후 반복 여부 추적',
        corrected: false,
      },
      {
        eventId: 'event-4',
        startedAt: '2026-07-06T17:42:25.000000Z',
        endedAt: '2026-07-06T17:42:42.000000Z',
        durationMs: 17_000,
        behaviorType: 'PHONE_USE',
        status: 'RESOLVED',
        riskLevel: 3,
        drivingState: 'MOVING',
        speedKph: 31,
        averageConfidence: 0.92,
        maximumConfidence: 0.95,
        resolutionReason: 'BEHAVIOR_CORRECTED',
        interventionText: '메시지 대행 승인 후 전방주시 복귀',
        corrected: true,
      },
    ],
    'session-3': [
      {
        eventId: 'event-5',
        startedAt: '2026-07-06T19:10:09.000000Z',
        endedAt: '2026-07-06T19:10:19.000000Z',
        durationMs: 10_000,
        behaviorType: 'SECONDARY_TASK',
        status: 'RESOLVED',
        riskLevel: 2,
        drivingState: 'MOVING',
        speedKph: 34,
        averageConfidence: 0.84,
        maximumConfidence: 0.88,
        resolutionReason: 'BEHAVIOR_REPEATED',
        interventionText: '오디오 조작 주의 안내 후 반복 여부 추적',
        corrected: false,
      },
      {
        eventId: 'event-6',
        startedAt: '2026-07-06T19:10:24.000000Z',
        endedAt: '2026-07-06T19:10:42.000000Z',
        durationMs: 18_000,
        behaviorType: 'SECONDARY_TASK',
        status: 'RESOLVED',
        riskLevel: 3,
        drivingState: 'MOVING',
        speedKph: 32,
        averageConfidence: 0.89,
        maximumConfidence: 0.92,
        resolutionReason: 'BEHAVIOR_CORRECTED',
        interventionText: '음악 재생 대행 후 화면 조작 중단',
        corrected: true,
      },
    ],
  },
  locations: {
    'session-1': [
      { lat: 37.5502, lng: 127.073, speedKph: 34, drivingState: 'MOVING', accuracyMeters: 6, source: 'SIMULATION', recordedAt: '2026-07-06T08:12:00.000000Z' },
      { lat: 37.5481, lng: 127.054, speedKph: 32, drivingState: 'MOVING', accuracyMeters: 8, source: 'SIMULATION', recordedAt: '2026-07-06T08:23:00.000000Z' },
      { lat: 36.3378, lng: 127.4309, speedKph: 0, drivingState: 'STOPPED', accuracyMeters: 5, source: 'SIMULATION', recordedAt: '2026-07-06T08:34:00.000000Z' },
    ],
    'session-2': [
      { lat: 37.5502, lng: 127.073, speedKph: 33, drivingState: 'MOVING', accuracyMeters: 7, source: 'SIMULATION', recordedAt: '2026-07-06T17:42:00.000000Z' },
      { lat: 37.5481, lng: 127.054, speedKph: 31, drivingState: 'MOVING', accuracyMeters: 9, source: 'SIMULATION', recordedAt: '2026-07-06T17:53:00.000000Z' },
      { lat: 36.3378, lng: 127.4309, speedKph: 0, drivingState: 'STOPPED', accuracyMeters: 10, source: 'SIMULATION', recordedAt: '2026-07-06T18:04:00.000000Z' },
    ],
    'session-3': [
      { lat: 37.5502, lng: 127.073, speedKph: 34, drivingState: 'MOVING', accuracyMeters: 6, source: 'SIMULATION', recordedAt: '2026-07-06T19:10:00.000000Z' },
      { lat: 37.5481, lng: 127.054, speedKph: 32, drivingState: 'MOVING', accuracyMeters: 7, source: 'SIMULATION', recordedAt: '2026-07-06T19:21:00.000000Z' },
      { lat: 36.3378, lng: 127.4309, speedKph: 0, drivingState: 'STOPPED', accuracyMeters: 5, source: 'SIMULATION', recordedAt: '2026-07-06T19:32:00.000000Z' },
    ],
  },
}
const ADDRESS_COORDINATE_PRECISION = 5
const WEATHER_COORDINATE_PRECISION = 3
const ROUTE_SEARCH_SUMMARY_FIELDS_HEIGHT = 140
const ROUTE_SEARCH_EDITOR_FIELDS_HEIGHT = 380
const SIDE_PANEL_WIDTH = 320
const SIDE_PANEL_TRANSITION_DURATION_SECONDS = 0.34
const SIDE_PANEL_TRANSITION_EASE: [number, number, number, number] = [0.34, 0, 0.2, 1]
const MUSIC_POPOVER_WIDTH = 380
const MUSIC_MINI_PLAYER_IDLE_BOTTOM = 136
const MUSIC_MINI_PLAYER_GUIDANCE_BOTTOM = 72
const DEFAULT_MAP_CAMERA_SETTINGS: MapCameraSettings = {
  mode: '2d',
  zoom: 18.3,
  pitch: 0,
}
const MAP_SETTINGS_ZOOM_MIN = 16
const MAP_SETTINGS_ZOOM_MAX = 19
const MAP_SETTINGS_ZOOM_STEP = 0.1
const MAP_SETTINGS_3D_DEFAULT_PITCH = 45
const MAP_SETTINGS_PITCH_MIN = 0
const MAP_SETTINGS_PITCH_MAX = 60
const MAP_SETTINGS_PITCH_STEP = 1
const SIMULATION_UI_UPDATE_INTERVAL_MS = 200
const GUIDANCE_DISTANCE_UPDATE_INTERVAL_MS = 500
const NAVI_ORB_THEME: OrbColorTheme = 'daylight'
const NAVI_ORB_CONTROL_SIZE = 132
const ROADIE_ASSISTANT_PANEL_ORB_SIZE = 132
const ROADIE_ASSISTANT_PANEL_WIDTH = 'min(21.75rem, calc(100vw - 2rem))'
const ROADIE_ASSISTANT_RECOMMENDATION_PANEL_WIDTH = 'min(23.5rem, calc(100vw - 2rem))'
const ROADIE_ASSISTANT_CONTENT_REVEAL_DELAY_SECONDS = 0.52
const ROADIE_ASSISTANT_TEXT_STAGGER_SECONDS = 0.018
const ROADIE_ASSISTANT_USER_WORD_STAGGER_SECONDS = 0.08
const DRIVING_ASSIST_DEBUG_QUERY_PARAM = 'debugSigns'
const DRIVING_ASSIST_DEBUG_SEQUENCE_INTERVAL_MS = 1400
const DEFAULT_CURRENT_LOCATION_PLACE: Place = {
  id: CURRENT_LOCATION_PLACE_ID,
  name: '세종대학교',
  address: '서울 광진구 능동로 209',
  coordinate: { lat: 37.5502, lng: 127.073 },
}
const NAVIGATION_PROFILE_AVATAR_COLORS = ['#1746A2', '#6D5DF6', '#00A8FF', '#E8EEFF', '#101828']
type UiMusicTrack = MusicRecommendationTrack & {
  coverTone: string
}

const FALLBACK_MUSIC_LIBRARY: UiMusicTrack[] = [
  {
    id: 'drive-neon',
    title: 'Drive Neon',
    artist: 'ROADIE Session',
    album: 'City Pulse',
    duration: '3:24',
    durationSeconds: 204,
    coverUrl: null,
    sourceUrl: '',
    provider: 'itunes',
    coverTone: 'from-[#1746a2] via-[#00a8ff] to-[#6d5df6]',
  },
  {
    id: 'soft-focus',
    title: 'Soft Focus',
    artist: 'Evening Route',
    album: 'Bright Pop Drive',
    duration: '3:08',
    durationSeconds: 188,
    coverUrl: null,
    sourceUrl: '',
    provider: 'itunes',
    coverTone: 'from-[#16a34a] via-[#22c55e] to-[#bae6fd]',
  },
  {
    id: 'night-line',
    title: 'Night Line',
    artist: 'Low Tide',
    album: 'Midnight Lane',
    duration: '4:02',
    durationSeconds: 242,
    coverUrl: null,
    sourceUrl: '',
    provider: 'itunes',
    coverTone: 'from-[#101828] via-[#475467] to-[#6d5df6]',
  },
]
type RoadieAssistantScenarioId = AiaiScenarioId
const ROADIE_ASSISTANT_SCENARIOS: RoadieAssistantScenario[] = createRoadieAssistantScenarios()
const DEMO_SCENARIO_DEFINITIONS = getDemoScenarios()
const DEMO_DESTINATION_PLACE: Place = {
  id: 'demo-destination-ossi-kalguksu',
  name: DEMO_DESTINATION.name,
  address: DEMO_DESTINATION.address,
  coordinate: { lat: 36.3378, lng: 127.4309 },
}
const DRIVER_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/3gp',
  'video/ogg',
  'video/avi',
  'video/mpeg',
  'video/object',
])

function getDriverVideoMimeType(file: File) {
  if (DRIVER_VIDEO_MIME_TYPES.has(file.type)) {
    return file.type
  }

  const extension = file.name.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'webm':
      return 'video/webm'
    case '3gp':
    case '3gpp':
      return 'video/3gp'
    case 'ogv':
    case 'ogg':
      return 'video/ogg'
    case 'avi':
      return 'video/avi'
    case 'mpeg':
    case 'mpg':
      return 'video/mpeg'
    default:
      return 'video/mp4'
  }
}

export function getAssistantSpeechCharacterDelaySeconds(index: number) {
  return index * ROADIE_ASSISTANT_TEXT_STAGGER_SECONDS
}

export function getAssistantVisibleOrbState(
  assistantStep: Pick<RoadieAssistantStep, 'orbState'>,
): OrbAssistantState {
  return assistantStep.orbState
}

export function getRoadieAssistantPanelWidth({
  expanded,
  hasRecommendations,
}: {
  expanded: boolean
  hasRecommendations: boolean
}) {
  if (expanded && hasRecommendations) {
    return ROADIE_ASSISTANT_RECOMMENDATION_PANEL_WIDTH
  }

  return ROADIE_ASSISTANT_PANEL_WIDTH
}

export function isAssistantVoiceWaveVisible(
  assistantStep: Pick<RoadieAssistantStep, 'orbState' | 'statusLabel'>,
) {
  return getAssistantVisibleOrbState(assistantStep) === 'speaking' && !assistantStep.statusLabel
}

const DEBUG_DRIVING_ASSIST_SEQUENCE = ([
  {
    alert: {
      type: 'caution',
      label: '어린이보호구역',
      distanceLabel: '40m',
      schoolZone: true,
      active: false,
    },
  },
  { speedLimitKph: 30 },
  {
    alert: {
      type: 'enforcement',
      label: '단속구간',
      distanceLabel: '80m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'curve',
      label: '급커브',
      distanceLabel: '120m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'falling-rock',
      label: '낙석주의',
      distanceLabel: '180m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'accident',
      label: '사고주의',
      distanceLabel: '240m',
      schoolZone: false,
      active: false,
    },
  },
  {
    alert: {
      type: 'caution',
      label: '주의',
      distanceLabel: '300m',
      schoolZone: false,
      active: false,
    },
  },
  {
    facility: {
      type: 'underpass',
      label: '지하차도',
      distanceLabel: '120m',
      signCode: 119,
    },
  },
  {
    facility: {
      type: 'overpass',
      label: '고가도로',
      distanceLabel: '100m',
      signCode: 120,
    },
  },
  {
    facility: {
      type: 'tunnel',
      label: '터널',
      distanceLabel: '80m',
      signCode: 121,
    },
  },
  {
    facility: {
      type: 'bridge',
      label: '교량',
      distanceLabel: '70m',
      signCode: 122,
    },
  },
  {
    facility: {
      type: 'side-underpass',
      label: '지하차도 옆차로',
      distanceLabel: '60m',
      signCode: 123,
    },
  },
  {
    facility: {
      type: 'side-overpass',
      label: '고가도로 옆차로',
      distanceLabel: '50m',
      signCode: 124,
    },
  },
  {
    facility: {
      type: 'box-tunnel',
      label: '토끼굴',
      distanceLabel: '40m',
      signCode: 130,
    },
  },
] satisfies DrivingAssistInfo[]).map((assist) => ({ speedLimitKph: 30, ...assist }))

export function NavigationShell({
  calibrationTiming,
  initialProfileSetupComplete = false,
  initialSelectedProfileId,
}: {
  calibrationTiming?: CalibrationTiming
  initialProfileSetupComplete?: boolean
  initialSelectedProfileId?: string
} = {}) {
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const calibrationProgressIntervalMs = calibrationTiming?.progressIntervalMs
  const calibrationProgressStep = calibrationTiming?.progressStep
  const calibrationStepCompleteDelayMs = calibrationTiming?.stepCompleteDelayMs ?? CALIBRATION_STEP_COMPLETE_DELAY_MS
  const [profileSetupComplete, setProfileSetupComplete] = useState(initialProfileSetupComplete)
  const [navigationEntryMode, setNavigationEntryMode] = useState<NavigationEntryMode | null>(
    initialProfileSetupComplete ? 'free-navigation' : null,
  )
  const [demoScenarioState, setDemoScenarioState] = useState<DemoScenarioControllerState | null>(null)
  const [demoSimulationStartPending, setDemoSimulationStartPending] = useState(false)
  const [demoCompleted, setDemoCompleted] = useState(false)
  const demoEndedEventAppliedRef = useRef<string | null>(null)
  const demoMusicEventAppliedRef = useRef<string | null>(null)
  const [profileSetupView, setProfileSetupView] = useState<ProfileSetupView>('list')
  const [selectedProfileId, setSelectedProfileId] = useState<string | undefined>(initialSelectedProfileId)
  const [editingProfileId, setEditingProfileId] = useState<string>()
  const [profileForm, setProfileForm] = useState<ProfileCreateRequest>(DEFAULT_PROFILE_CREATE_REQUEST)
  const [calibratingProfileId, setCalibratingProfileId] = useState<string>()
  const [calibratingProfileName, setCalibratingProfileName] = useState('새 운전자')
  const [calibrationStepIndex, setCalibrationStepIndex] = useState(0)
  const [calibrationProgress, setCalibrationProgress] = useState(0)
  const [now, setNow] = useState(() => new Date())
  const [originKeyword, setOriginKeyword] = useState(DEFAULT_CURRENT_LOCATION_PLACE.name)
  const [destinationKeyword, setDestinationKeyword] = useState('')
  const [origin, setOrigin] = useState<Place | undefined>(DEFAULT_CURRENT_LOCATION_PLACE)
  const [destination, setDestination] = useState<Place>()
  const [currentPosition, setCurrentPosition] = useState<Coordinate>(DEFAULT_CURRENT_LOCATION_PLACE.coordinate)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('checking')
  const [activeField, setActiveField] = useState<SearchFieldId | null>(null)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [routeSearchOpen, setRouteSearchOpen] = useState(false)
  const [routeOptionsSearchReady, setRouteOptionsSearchReady] = useState(false)
  const [routeOptionsOverlayReady, setRouteOptionsOverlayReady] = useState(false)
  const [selectedRouteOptionId, setSelectedRouteOptionId] = useState<string>()
  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelId | null>(null)
  const [reportFullscreenOpen, setReportFullscreenOpen] = useState(false)
  const [musicModalOpen, setMusicModalOpen] = useState(false)
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [musicTrackId, setMusicTrackId] = useState(FALLBACK_MUSIC_LIBRARY[0].id)
  const [musicProgressSeconds, setMusicProgressSeconds] = useState(0)
  const [musicSearchKeyword, setMusicSearchKeyword] = useState('')
  const [assistantScenarioId, setAssistantScenarioId] = useState<RoadieAssistantScenarioId>('drowsiness-rest-area')
  const [assistantStepIndex, setAssistantStepIndex] = useState(0)
  const [driverVideo, setDriverVideo] = useState<DriverVideoSource | null>(null)
  const [driverVideoError, setDriverVideoError] = useState(false)
  const [showLocationFallbackToast, setShowLocationFallbackToast] = useState(false)
  const [mapCameraSettings, setMapCameraSettings] = useState<MapCameraSettings>(DEFAULT_MAP_CAMERA_SETTINGS)
  const updateMapCameraSettings = useCallback((settings: Partial<MapCameraSettings>) => {
    setMapCameraSettings((currentSettings) => {
      const nextSettings = getNextMapCameraSettings(currentSettings, settings)

      return isSameMapCameraSettings(currentSettings, nextSettings)
        ? currentSettings
        : nextSettings
    })
  }, [])
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simulationPosition, setSimulationPosition] = useState<Coordinate>()
  const [simulationRemainingDistance, setSimulationRemainingDistance] = useState(0)
  const [simulationRemainingDuration, setSimulationRemainingDuration] = useState(0)
  const [guidanceDistanceUpdateKey, setGuidanceDistanceUpdateKey] = useState(0)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const simulationStartedAtRef = useRef<number | undefined>(undefined)
  const simulationLastUiUpdateAtRef = useRef<number | undefined>(undefined)
  const simulationSkipInitialFrameWorkRef = useRef(false)
  const simulationSkipInitialUiUpdateRef = useRef(false)
  const simulationFrameRendererRef = useRef<((position: Coordinate, options?: { skipCamera?: boolean; skipRouteLineHead?: boolean }) => void) | undefined>(undefined)
  const guidanceDistanceDisplayRef = useRef<GuidanceDistanceDisplayStore>(new Map())
  const routeSelectionCameraSettingsRef = useRef<MapCameraSettings | undefined>(undefined)
  const routeSearchEditorTimerRef = useRef<number | undefined>(undefined)
  const debouncedOriginKeyword = useDebouncedValue(originKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const debouncedDestinationKeyword = useDebouncedValue(destinationKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const debouncedMusicSearchKeyword = useDebouncedValue(musicSearchKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const assistantMusicRecommendationVisible = useMemo(() => {
    const scenario = ROADIE_ASSISTANT_SCENARIOS.find((item) => item.id === assistantScenarioId) ?? ROADIE_ASSISTANT_SCENARIOS[0]
    const step = scenario.steps[Math.min(assistantStepIndex, scenario.steps.length - 1)]

    return Boolean(step.recommendations?.some((recommendation) => recommendation.type === 'music'))
  }, [assistantScenarioId, assistantStepIndex])
  const musicMood = useMemo<MusicMood>(() => {
    const eventId = demoScenarioState?.scenarioEvent?.id

    if (eventId?.startsWith('drowsy_music') || assistantScenarioId === 'fatigue-music') {
      return 'bright'
    }

    if (eventId?.startsWith('device_music') || eventId === 'device_first_detection' || eventId === 'device_repeated_detection') {
      return 'calm'
    }

    return 'drive'
  }, [demoScenarioState?.scenarioEvent?.id])
  const addressQueryCoordinate = useMemo(
    () => currentPosition ? roundCoordinate(currentPosition, ADDRESS_COORDINATE_PRECISION) : undefined,
    [currentPosition],
  )
  const weatherQueryCoordinate = useMemo(
    () => currentPosition ? roundCoordinate(currentPosition, WEATHER_COORDINATE_PRECISION) : undefined,
    [currentPosition],
  )
  const currentRoadMatchCoordinates = useMemo(
    () => currentPosition ? createCurrentRoadMatchCoordinates(currentPosition) : undefined,
    [currentPosition],
  )

  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap'],
    queryFn: ({ signal }) => getBootstrap(undefined, signal),
  })
  const musicRecommendationsQuery = useQuery({
    queryKey: ['music-recommendations', musicMood, debouncedMusicSearchKeyword],
    queryFn: ({ signal }) => getMusicRecommendations(
      { mood: musicMood, keyword: debouncedMusicSearchKeyword, limit: 10 },
      undefined,
      signal,
    ),
    enabled: profileSetupComplete && (
      musicModalOpen
      || musicPlaying
      || assistantMusicRecommendationVisible
      || demoScenarioState?.scenario?.scenarioId === 'device_operation'
    ),
    placeholderData: keepPreviousData,
  })
  const musicTracks = useMemo<UiMusicTrack[]>(() => (
    musicRecommendationsQuery.data?.length
      ? musicRecommendationsQuery.data.map((track, index) => ({
        ...track,
        coverTone: FALLBACK_MUSIC_LIBRARY[index % FALLBACK_MUSIC_LIBRARY.length].coverTone,
      }))
      : FALLBACK_MUSIC_LIBRARY
  ), [musicRecommendationsQuery.data])
  const musicRecommendationsLoading = musicRecommendationsQuery.isFetching && !musicRecommendationsQuery.data?.length
  const selectedMusicTrack = useMemo(
    () => musicTracks.find((track) => track.id === musicTrackId) ?? musicTracks[0] ?? FALLBACK_MUSIC_LIBRARY[0],
    [musicTrackId, musicTracks],
  )
  const selectedMusicTrackId = selectedMusicTrack.id
  const selectedMusicDurationSeconds = selectedMusicTrack.durationSeconds
  const savedPlacesQuery = useQuery({
    queryKey: ['saved-places', selectedProfileId],
    queryFn: ({ signal }) => listSavedPlaces(selectedProfileId!, undefined, signal),
    enabled: profileSetupComplete && Boolean(selectedProfileId),
  })
  const createFavoriteMutation = useMutation({
    mutationFn: ({ field, profileId, place }: { field: SearchFieldId; profileId: string; place: Place }) => (
      createFavorite(profileId, createSavedPlacePayload(field, place))
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-places', selectedProfileId] })
    },
  })
  const deleteSavedPlaceMutation = useMutation({
    mutationFn: (placeId: string) => deleteSavedPlace(placeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-places', selectedProfileId] })
    },
  })
  const updateSavedPlaceMutation = useMutation({
    mutationFn: ({ label, placeId }: { label: string; placeId: string }) => (
      updateSavedPlace(placeId, { label })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['saved-places', selectedProfileId] })
    },
  })
  const createSearchHistoryMutation = useMutation({
    mutationFn: ({ payload, profileId }: { payload: SearchHistoryCreateRequest; profileId: string }) => (
      createSearchHistory(profileId, payload)
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['search-histories', selectedProfileId] })
    },
  })
  const createProfileMutation = useMutation({
    mutationFn: (payload: ProfileCreateRequest) => createProfile(payload),
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.id)
      setCalibratingProfileId(profile.id)
      setCalibratingProfileName(profile.displayName || '새 운전자')
      setCalibrationStepIndex(0)
      setCalibrationProgress(0)
      setProfileSetupView('calibration')
      setEditingProfileId(undefined)
      setProfileForm(DEFAULT_PROFILE_CREATE_REQUEST)
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
  })
  const updateProfileMutation = useMutation({
    mutationFn: ({ profileId, payload }: { profileId: string; payload: ProfileCreateRequest }) => updateProfile(profileId, payload),
    onSuccess: async (profile) => {
      setSelectedProfileId(profile.id)
      setProfileSetupView('list')
      setEditingProfileId(undefined)
      setProfileForm(DEFAULT_PROFILE_CREATE_REQUEST)
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
    },
  })
  const deleteProfileMutation = useMutation({
    mutationFn: (profileId: string) => deleteProfile(profileId),
    onSuccess: async (_, profileId) => {
      await queryClient.invalidateQueries({ queryKey: ['bootstrap'] })
      if (selectedProfileId === profileId) {
        setSelectedProfileId(undefined)
      }
      setCalibratingProfileId(undefined)
      setCalibratingProfileName('새 운전자')
      setCalibrationStepIndex(0)
      setCalibrationProgress(0)
      setProfileSetupComplete(false)
      setNavigationEntryMode(null)
      setDemoScenarioState(null)
      setDemoSimulationStartPending(false)
      setDemoCompleted(false)
      setActiveSidePanel(null)
      setReportFullscreenOpen(false)
      setProfileSetupView('list')
      setEditingProfileId(undefined)
      setProfileForm(DEFAULT_PROFILE_CREATE_REQUEST)
    },
  })
  const selectProfileMutation = useMutation({
    mutationFn: (profileId: string) => selectProfile(profileId),
    onSuccess: () => {
      setProfileSetupComplete(true)
    },
  })
  const selectProfileAfterCalibration = selectProfileMutation.mutate
  const completeCalibration = useCallback(() => {
    if (!calibratingProfileId) {
      return
    }

    selectProfileAfterCalibration(calibratingProfileId, {
      onSuccess: () => {
        setNavigationEntryMode(null)
        setProfileSetupView('list')
        setCalibratingProfileId(undefined)
        setCalibrationStepIndex(0)
        setCalibrationProgress(0)
      },
    })
  }, [calibratingProfileId, selectProfileAfterCalibration])

  useEffect(() => {
    if (profileSetupView !== 'calibration' || calibrationProgress >= 100 || selectProfileMutation.isPending) {
      return undefined
    }

    const nextDelayMs = calibrationProgressIntervalMs ?? getRandomIntegerInRange(CALIBRATION_PROGRESS_INTERVAL_RANGE_MS)
    const timeoutId = window.setTimeout(() => {
      const progressStep = calibrationProgressStep ?? getRandomIntegerInRange(CALIBRATION_PROGRESS_STEP_RANGE)

      setCalibrationProgress((currentProgress) => Math.min(100, currentProgress + progressStep))
    }, nextDelayMs)

    return () => window.clearTimeout(timeoutId)
  }, [
    calibrationProgress,
    calibrationProgressIntervalMs,
    calibrationProgressStep,
    calibrationStepIndex,
    profileSetupView,
    selectProfileMutation.isPending,
  ])

  useEffect(() => {
    if (profileSetupView !== 'calibration' || calibrationProgress < 100 || selectProfileMutation.isPending) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      if (calibrationStepIndex < CALIBRATION_STEPS.length - 1) {
        setCalibrationStepIndex((currentStepIndex) => currentStepIndex + 1)
        setCalibrationProgress(0)
        return
      }

      completeCalibration()
    }, calibrationStepCompleteDelayMs)

    return () => window.clearTimeout(timeoutId)
  }, [
    calibrationProgress,
    calibrationStepIndex,
    calibrationStepCompleteDelayMs,
    completeCalibration,
    profileSetupView,
    selectProfileMutation.isPending,
  ])

  const originSearch = useQuery({
    queryKey: ['places', debouncedOriginKeyword],
    queryFn: ({ signal }) => searchPlaces(debouncedOriginKeyword, undefined, signal),
    enabled: profileSetupComplete && activeField === 'origin' && debouncedOriginKeyword.length >= 2 && debouncedOriginKeyword !== origin?.name,
    placeholderData: keepPreviousData,
  })

  const destinationSearch = useQuery({
    queryKey: ['places', debouncedDestinationKeyword],
    queryFn: ({ signal }) => searchPlaces(debouncedDestinationKeyword, undefined, signal),
    enabled: profileSetupComplete && activeField === 'destination' && debouncedDestinationKeyword.length >= 2 && debouncedDestinationKeyword !== destination?.name,
    placeholderData: keepPreviousData,
  })
  const activeRouteSearchKeyword = activeField === 'origin'
    ? originKeyword.trim()
    : activeField === 'destination'
      ? destinationKeyword.trim()
      : ''
  const searchHistoriesQuery = useQuery({
    queryKey: ['search-histories', selectedProfileId, 1, 10],
    queryFn: () => listSearchHistories(selectedProfileId!, { page: 1, size: 10 }),
    enabled: profileSetupComplete && Boolean(selectedProfileId && activeField && activeRouteSearchKeyword.length === 0),
  })

  useEffect(() => {
    if (!selectedProfileId && bootstrapQuery.data?.selectedProfileId) {
      setSelectedProfileId(bootstrapQuery.data.selectedProfileId)
    }
  }, [bootstrapQuery.data?.selectedProfileId, selectedProfileId])

  const routeOptionsQuery = useQuery({
    queryKey: [
      'route-options',
      origin?.id,
      origin?.coordinate.lat,
      origin?.coordinate.lng,
      destination?.id,
      destination?.coordinate.lat,
      destination?.coordinate.lng,
    ],
    queryFn: async ({ signal }) => {
      markRoutePerformance('route-options-query-start')
      const options = await getRouteOptions(origin!.coordinate, destination!.coordinate, undefined, signal)
      markRoutePerformance('route-options-query-end')
      measureRoutePerformance('route-options-query-total', 'route-options-query-start', 'route-options-query-end')
      return options
    },
    enabled: profileSetupComplete && Boolean(origin && destination && routeOptionsSearchReady) && !selectedRouteOptionId,
  })

  const weatherQuery = useQuery({
    queryKey: ['weather', weatherQueryCoordinate?.lat, weatherQueryCoordinate?.lng],
    queryFn: () => getCurrentWeatherLabel(weatherQueryCoordinate!),
    enabled: profileSetupComplete && Boolean(weatherQueryCoordinate),
    staleTime: WEATHER_STALE_TIME_MS,
    retry: false,
  })
  const currentAddressQuery = useQuery({
    queryKey: ['current-address', addressQueryCoordinate?.lat, addressQueryCoordinate?.lng],
    queryFn: ({ signal }) => getCurrentAddress(addressQueryCoordinate!, undefined, signal),
    enabled: profileSetupComplete && Boolean(addressQueryCoordinate),
    staleTime: WEATHER_STALE_TIME_MS,
    retry: false,
  })

  const selectedRouteOption = useMemo(() => (
    routeOptionsQuery.data?.find((option) => option.id === selectedRouteOptionId)
  ), [routeOptionsQuery.data, selectedRouteOptionId])
  const activeRoute = useMemo(() => {
    const route = selectedRouteOption?.route

    if (!route) {
      return undefined
    }

    return {
      ...route,
      coordinates: createRoundedRoutePath(route.coordinates),
    }
  }, [selectedRouteOption?.route])
  const activeRouteSimulationPlan = useMemo(
    () => activeRoute ? createRouteSimulationPlan(activeRoute) : undefined,
    [activeRoute],
  )
  const demoSetupActive = navigationEntryMode === 'demo-scenario' && demoScenarioState?.phase === 'setup'
  const routeSelectionMode = Boolean(origin && destination && !selectedRouteOptionId)
  const routeSelectionModeRef = useRef(routeSelectionMode)
  const hasRouteSearchDraftMismatch = routeSelectionMode && routeSearchOpen && (
    isRouteKeywordDraftMismatched(originKeyword, origin) ||
    isRouteKeywordDraftMismatched(destinationKeyword, destination)
  )
  const routeOptions = routeSelectionMode && !hasRouteSearchDraftMismatch
    ? routeOptionsQuery.data ?? []
    : undefined
  const routeOptionsReady = Boolean(routeOptions?.length && routeOptionsOverlayReady)
  const visibleRouteOptions = routeOptionsReady ? routeOptions : []
  const routeOptionsLoading = routeSelectionMode &&
    !hasRouteSearchDraftMismatch &&
    !routeOptionsReady &&
    (
      !routeOptionsSearchReady ||
      routeOptionsQuery.isFetching ||
      Boolean(routeOptions?.length)
    )
  const [previewRouteOptionId, setPreviewRouteOptionId] = useState<string | undefined>(undefined)
  const activeRouteOptionId = useMemo(() => (
    routeOptions?.some((option) => option.id === previewRouteOptionId)
      ? previewRouteOptionId
      : getDefaultRouteOptionId(routeOptions ?? [])
  ), [previewRouteOptionId, routeOptions])
  const roadMatchQuery = useQuery({
    queryKey: ['road-match', selectedRouteOptionId, activeRoute?.coordinates.length],
    queryFn: ({ signal }) => getRoadMatch(activeRoute!.coordinates, undefined, signal),
    enabled: profileSetupComplete && Boolean(activeRoute?.coordinates.length),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const currentRoadMatchQuery = useQuery({
    queryKey: [
      'current-road-match',
      currentRoadMatchCoordinates?.[0].lat,
      currentRoadMatchCoordinates?.[0].lng,
    ],
    queryFn: ({ signal }) => getRoadMatch(currentRoadMatchCoordinates!, undefined, signal),
    enabled: profileSetupComplete && Boolean(currentRoadMatchCoordinates) && !activeRoute,
    staleTime: 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    guidanceDistanceDisplayRef.current.clear()
  }, [activeRoute])
  useEffect(() => {
    if (!routeOptions?.some((option) => option.id === previewRouteOptionId)) {
      setPreviewRouteOptionId(undefined)
    }
  }, [previewRouteOptionId, routeOptions])
  useEffect(() => {
    routeSelectionModeRef.current = routeSelectionMode
  }, [routeSelectionMode])
  useEffect(() => {
    if (simulationRunning) {
      setReportFullscreenOpen(false)
    }
  }, [simulationRunning])
  useEffect(() => {
    if (!routeSelectionMode || hasRouteSearchDraftMismatch) {
      setRouteOptionsSearchReady(false)
      return
    }

    setRouteOptionsSearchReady(false)
    markRoutePerformance('route-options-schedule')
    const timerId = window.setTimeout(() => {
      markRoutePerformance('route-options-query-enabled')
      measureRoutePerformance('route-options-schedule-delay', 'route-options-schedule', 'route-options-query-enabled')
      setRouteOptionsSearchReady(true)
    }, 0)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    destination?.coordinate.lat,
    destination?.coordinate.lng,
    destination?.id,
    hasRouteSearchDraftMismatch,
    origin?.coordinate.lat,
    origin?.coordinate.lng,
    origin?.id,
    routeSelectionMode,
  ])
  const remainingDurationSeconds = simulationRunning
    ? simulationRemainingDuration
    : activeRoute?.summary.durationSeconds ?? 0
  const remainingDistanceMeters = simulationRunning
    ? simulationRemainingDistance
    : activeRoute?.summary.distanceMeters ?? 0
  const routeMinutes = Math.max(1, Math.round(remainingDurationSeconds / 60))
  const arrivalLabel = activeRoute ? formatArrivalTime(remainingDurationSeconds) : ''
  const drivingDistance = activeRoute
    ? `${Math.max(0.1, remainingDistanceMeters / 1000).toFixed(1)} km`
    : ''
  const currentTimeLabel = formatClockTime(now)
  const currentLocationLabel = currentAddressQuery.data
    ?? (locationStatus === 'granted' ? 'GPS 위치' : DEFAULT_CURRENT_LOCATION_PLACE.name)
  const currentOriginLabel = locationStatus === 'granted'
    ? currentLocationLabel
    : DEFAULT_CURRENT_LOCATION_PLACE.name
  const destinationStatusLabel = destination?.address || destination?.name || '목적지'
  const weatherLabel = weatherQuery.data ?? (weatherQuery.isError ? '정보 없음' : '확인 중')
  const travelledDistanceMeters = activeRoute
    ? Math.max(0, activeRoute.summary.distanceMeters - remainingDistanceMeters)
    : 0
  const drivingAssist = activeRoute
    ? getDrivingAssistInfo({
        position: simulationPosition ?? currentPosition,
        roadMatches: roadMatchQuery.data ?? [],
        route: activeRoute,
        travelledDistanceMeters,
      })
    : getDrivingAssistInfo({
        position: currentPosition,
        roadMatches: currentRoadMatchQuery.data ?? [],
        travelledDistanceMeters: 0,
      })
  const debugDrivingAssist = useDrivingAssistDebugSequence(Boolean(activeRoute))
  const maneuverGuidance = activeRoute
    ? getManeuverGuidance(
      activeRoute,
      travelledDistanceMeters,
      guidanceDistanceDisplayRef.current,
      simulationRunning ? guidanceDistanceUpdateKey : undefined,
    )
    : undefined
  const activePlaces = activeField === 'origin'
    ? originSearch.data ?? []
    : activeField === 'destination'
      ? destinationSearch.data ?? []
      : []
  const searchHistoryPlaces = useMemo(
    () => createSearchHistoryPlaces(searchHistoriesQuery.data?.items ?? []),
    [searchHistoriesQuery.data?.items],
  )
  const showSearchHistories = Boolean(activeField && activeRouteSearchKeyword.length === 0 && searchHistoryPlaces.length > 0)
  const activeSelectablePlaces = showSearchHistories ? searchHistoryPlaces : activePlaces
  const activeLabel = activeField === 'origin' ? '출발지 검색 결과' : '도착지 검색 결과'
  const profiles = bootstrapQuery.data?.profiles ?? []
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId)
  const savedPlaceQuickItems = useMemo(
    () => createSavedPlaceQuickItems(savedPlacesQuery.data),
    [savedPlacesQuery.data],
  )
  const routeSearchSavedPlaces: RouteSearchSavedPlace[] = savedPlaceQuickItems
  const showSuggestions = Boolean(activeField && activePlaces.length > 0)
  const assistantScenario = useMemo(
    () => ROADIE_ASSISTANT_SCENARIOS.find((scenario) => scenario.id === assistantScenarioId) ?? ROADIE_ASSISTANT_SCENARIOS[0],
    [assistantScenarioId],
  )
  const assistantStep = assistantScenario.steps[
    Math.min(assistantStepIndex, assistantScenario.steps.length - 1)
  ]
  const selectedProfileName = selectedProfile?.displayName ?? null
  const demoActive = navigationEntryMode === 'demo-scenario' && Boolean(demoScenarioState)
  const demoNavigationLocked = demoActive
  const demoAssistantStep = demoScenarioState ? createDemoAssistantStep(demoScenarioState, selectedProfileName) : undefined
  const visibleAssistantStep = demoAssistantStep ?? assistantStep
  const motionTiming = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: PRODUCT_EASE }
  const navigationViewportClassName = [
    'relative col-start-1 row-start-2 h-full min-h-0 overflow-hidden rounded-[1.1rem] border border-white/70 bg-[var(--nav-frame)] shadow-[0_18px_46px_rgb(15_23_42/0.24)] ring-1 ring-[rgb(148_163_184/0.18)]',
  ].join(' ')

  useEffect(() => () => {
    if (driverVideo?.url) {
      URL.revokeObjectURL(driverVideo.url)
    }
  }, [driverVideo?.url])

  const selectDriverVideo = useCallback((file: File) => {
    setDriverVideo({
      name: file.name,
      type: getDriverVideoMimeType(file),
      url: URL.createObjectURL(file),
    })
    setDriverVideoError(false)
  }, [])

  const requestCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }

    setLocationStatus('checking')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coordinate = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        const currentPlace: Place = {
          id: CURRENT_LOCATION_PLACE_ID,
          name: 'GPS 위치',
          address: 'GPS 위치',
          coordinate,
        }

        setCurrentPosition(coordinate)
        setOrigin((selectedOrigin) => (
          !selectedOrigin || selectedOrigin.id === CURRENT_LOCATION_PLACE_ID
            ? currentPlace
            : selectedOrigin
        ))
        setOriginKeyword((keyword) => (
          !keyword || keyword === DEFAULT_CURRENT_LOCATION_PLACE.name
            ? currentPlace.name
            : keyword
        ))
        setLocationStatus('granted')
      },
      () => {
        setCurrentPosition(DEFAULT_CURRENT_LOCATION_PLACE.coordinate)
        setOrigin((selectedOrigin) => (
          !selectedOrigin || selectedOrigin.id === CURRENT_LOCATION_PLACE_ID
            ? DEFAULT_CURRENT_LOCATION_PLACE
            : selectedOrigin
        ))
        setOriginKeyword((keyword) => keyword || DEFAULT_CURRENT_LOCATION_PLACE.name)
        setLocationStatus('denied')
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      },
    )
  }, [])

  const selectAssistantScenario = useCallback((scenarioId: RoadieAssistantScenarioId) => {
    setAssistantScenarioId(scenarioId)
    setAssistantStepIndex(0)
  }, [])

  const moveAssistantScenarioStep = useCallback((direction: -1 | 1) => {
    setAssistantStepIndex((currentIndex) => clamp(
      currentIndex + direction,
      0,
      assistantScenario.steps.length - 1,
    ))
  }, [assistantScenario.steps.length])

  const resetAssistantScenario = useCallback(() => {
    setAssistantStepIndex(0)
  }, [])

  useEffect(() => {
    if (!profileSetupComplete) {
      return
    }

    if (locationStatus === 'granted') {
      setShowLocationFallbackToast(false)
      return
    }

    setShowLocationFallbackToast(true)
    const timer = window.setTimeout(() => {
      setShowLocationFallbackToast(false)
    }, 5_000)

    return () => window.clearTimeout(timer)
  }, [locationStatus, profileSetupComplete])

  const openSidePanel = useCallback((panel: SidePanelId) => {
    setMusicModalOpen(false)
    setActiveSidePanel((current) => (current === panel ? null : panel))
  }, [])

  const toggleMusicModal = useCallback(() => {
    setActiveSidePanel(null)
    setMusicModalOpen((open) => !open)
  }, [])

  const clearPendingRouteSearchEditor = useCallback(() => {
    if (routeSearchEditorTimerRef.current !== undefined) {
      window.clearTimeout(routeSearchEditorTimerRef.current)
      routeSearchEditorTimerRef.current = undefined
    }
  }, [])

  const openRouteSearchEditor = useCallback((field: SearchFieldId) => {
    clearPendingRouteSearchEditor()
    setRouteSearchOpen(true)
    setActiveField(null)
    setHighlightedIndex(0)
    routeSearchEditorTimerRef.current = window.setTimeout(() => {
      routeSearchEditorTimerRef.current = undefined
      setActiveField(field)
    }, 40)
  }, [clearPendingRouteSearchEditor])

  useEffect(() => () => {
    clearPendingRouteSearchEditor()
  }, [clearPendingRouteSearchEditor])

  useEffect(() => {
    if (!profileSetupComplete) {
      return
    }

    requestCurrentLocation()
  }, [profileSetupComplete, requestCurrentLocation])

  useEffect(() => {
    if (locationStatus !== 'granted' || origin?.id !== CURRENT_LOCATION_PLACE_ID || !currentPosition) {
      return
    }

    const nextLabel = currentOriginLabel

    if (origin.name === nextLabel && origin.address === nextLabel) {
      return
    }

    setOrigin({
      ...origin,
      name: nextLabel,
      address: nextLabel,
      coordinate: currentPosition,
    })
    setOriginKeyword((keyword) => (
      keyword === origin.name || keyword === '현재 위치' || keyword === 'GPS 위치'
        ? nextLabel
        : keyword
    ))
  }, [currentOriginLabel, currentPosition, locationStatus, origin])

  const fillOriginWithCurrentLocation = useCallback(() => {
    if (!currentPosition) {
      requestCurrentLocation()
      return
    }

    const currentPlace: Place = {
      id: CURRENT_LOCATION_PLACE_ID,
      name: currentOriginLabel,
      address: currentLocationLabel,
      coordinate: currentPosition,
    }

    setOrigin(currentPlace)
    setOriginKeyword(currentPlace.name)
    setActiveField(null)
    setHighlightedIndex(0)
    setRouteSearchOpen(true)
  }, [currentLocationLabel, currentOriginLabel, currentPosition, requestCurrentLocation])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 30_000)

    return () => window.clearInterval(timer)
  }, [])

  const restoreRouteSelectionCameraSettings = useCallback(() => {
    const previousSettings = routeSelectionCameraSettingsRef.current
    if (!previousSettings) {
      return
    }

    routeSelectionCameraSettingsRef.current = undefined
    setMapCameraSettings(previousSettings)
  }, [])

  useEffect(() => {
    if (!routeSelectionMode) {
      restoreRouteSelectionCameraSettings()
      return
    }

    setActiveSidePanel(null)
    setMusicModalOpen(false)
    setRouteSearchOpen(false)
    setActiveField(null)
    setHighlightedIndex(0)
    setMapCameraSettings((currentSettings) => {
      if (!routeSelectionCameraSettingsRef.current) {
        routeSelectionCameraSettingsRef.current = currentSettings
      }

      const nextSettings = {
        ...currentSettings,
        mode: '2d' as const,
        pitch: 0,
      }

      return isSameMapCameraSettings(currentSettings, nextSettings)
        ? currentSettings
        : nextSettings
    })
  }, [restoreRouteSelectionCameraSettings, routeSelectionMode])

  const selectRouteOption = useCallback((optionId: string) => {
    setSelectedRouteOptionId(optionId)
    guidanceDistanceDisplayRef.current.clear()
    restoreRouteSelectionCameraSettings()
  }, [restoreRouteSelectionCameraSettings])

  useEffect(() => {
    if (
      routeSelectionMode &&
      !hasRouteSearchDraftMismatch &&
      !routeOptionsQuery.isFetching &&
      !demoSetupActive &&
      routeOptionsReady &&
      routeOptions?.length === 1
    ) {
      selectRouteOption(routeOptions[0].id)
    }
  }, [
    hasRouteSearchDraftMismatch,
    routeOptions,
    routeOptionsReady,
    routeOptionsQuery.isFetching,
    routeSelectionMode,
    selectRouteOption,
    demoSetupActive,
  ])

  const selectPlace = (field: SearchFieldId, place: Place, options: { recordHistory?: boolean } = {}) => {
    stopSimulation()
    setSelectedRouteOptionId(undefined)
    setSimulationPosition(undefined)
    setSimulationRemainingDistance(0)
    setSimulationRemainingDuration(0)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()

    const searchQuery = field === 'origin' ? originKeyword.trim() : destinationKeyword.trim()

    if (options.recordHistory !== false && selectedProfileId) {
      createSearchHistoryMutation.mutate({
        profileId: selectedProfileId,
        payload: createSearchHistoryPayload(searchQuery || place.name, place),
      })
    }

    if (field === 'origin') {
      setOrigin(place)
      setOriginKeyword(place.name)
    } else {
      setDestination(place)
      setDestinationKeyword(place.name)
      setRouteSearchOpen(false)
    }

    setActiveField(null)
    setHighlightedIndex(0)
  }

  const selectSavedPlace = (field: SearchFieldId, place: Place) => {
    selectPlace(field, place, { recordHistory: false })
    setActiveField(null)
  }

  const handleSearchKeyDown = (field: SearchFieldId, event: KeyboardEvent<HTMLInputElement>) => {
    const places = field === activeField ? activeSelectablePlaces : []

    if (event.key === 'Escape') {
      setActiveField(null)
      setHighlightedIndex(0)
      return
    }

    if (places.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveField(field)
      setHighlightedIndex((index) => Math.min(index + 1, places.length - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveField(field)
      setHighlightedIndex((index) => Math.max(index - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      selectPlace(field, places[highlightedIndex] ?? places[0], {
        recordHistory: !showSearchHistories,
      })
    }
  }

  const startSimulation = () => {
    const route = activeRoute
    if (!route?.coordinates.length) {
      return
    }

    setSimulationRemainingDistance(route.summary.distanceMeters)
    setSimulationRemainingDuration(route.summary.durationSeconds)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()
    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    simulationSkipInitialFrameWorkRef.current = true
    simulationSkipInitialUiUpdateRef.current = true
    setSimulationRunning(true)
  }

  const stopSimulation = useCallback(() => {
    if (animationFrameRef.current !== undefined) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = undefined
    }

    simulationStartedAtRef.current = undefined
    simulationLastUiUpdateAtRef.current = undefined
    simulationSkipInitialFrameWorkRef.current = false
    simulationSkipInitialUiUpdateRef.current = false
    setSimulationRunning(false)
  }, [])

  const endGuidance = useCallback(() => {
    stopSimulation()
    setSimulationPosition(undefined)
    setSimulationRemainingDistance(0)
    setSimulationRemainingDuration(0)
    setGuidanceDistanceUpdateKey(0)
    guidanceDistanceDisplayRef.current.clear()
    setSelectedRouteOptionId(undefined)
    setDestination(undefined)
    setDestinationKeyword('')
    setActiveField(null)
    setHighlightedIndex(0)
    setRouteSearchOpen(false)
  }, [stopSimulation])

  const applyDemoSetupSideEffects = useCallback((state: DemoScenarioControllerState) => {
    const setupEvent = state.setupEvent

    if (!setupEvent) {
      return
    }

    switch (setupEvent.eventType) {
      case 'DRIVING_SCREEN_OPENED':
        setActiveSidePanel(null)
        setMusicModalOpen(false)
        break
      case 'ROUTE_SEARCH_OPENED':
        openRouteSearchEditor('destination')
        break
      case 'DESTINATION_TYPING':
        stopSimulation()
        setSelectedRouteOptionId(undefined)
        setSimulationPosition(undefined)
        setDestination(undefined)
        setDestinationKeyword(DEMO_DESTINATION.query)
        setRouteSearchOpen(true)
        setActiveField('destination')
        setHighlightedIndex(0)
        break
      case 'DESTINATION_CANDIDATE_SHOWN':
        stopSimulation()
        setSelectedRouteOptionId(undefined)
        setSimulationPosition(undefined)
        setDestination(undefined)
        setDestinationKeyword(DEMO_DESTINATION.query)
        setRouteSearchOpen(true)
        setActiveField('destination')
        setHighlightedIndex(0)
        break
      case 'DESTINATION_SELECTED':
        selectPlace('destination', DEMO_DESTINATION_PLACE, { recordHistory: false })
        break
      case 'ROUTE_CANDIDATES_LOADED':
        setRouteOptionsSearchReady(true)
        break
      case 'RECOMMENDED_ROUTE_SELECTED':
        if (!destination || destination.id !== DEMO_DESTINATION_PLACE.id) {
          selectPlace('destination', DEMO_DESTINATION_PLACE, { recordHistory: false })
        }
        setRouteOptionsSearchReady(true)
        break
      case 'GUIDANCE_STARTED':
        setRouteSearchOpen(false)
        setActiveField(null)
        break
      case 'SIMULATION_STARTED':
        setRouteSearchOpen(false)
        setActiveField(null)
        if (activeRouteOptionId) {
          selectRouteOption(activeRouteOptionId)
          setDemoSimulationStartPending(true)
        }
        break
      default:
        break
    }
  }, [
    activeRouteOptionId,
    destination,
    openRouteSearchEditor,
    selectPlace,
    selectRouteOption,
    startSimulation,
    stopSimulation,
  ])

  const completeDemoDrive = useCallback(() => {
    stopSimulation()
    const destinationCoordinate = destination?.coordinate ?? DEMO_DESTINATION_PLACE.coordinate
    setCurrentPosition(destinationCoordinate)
    setSimulationPosition(destinationCoordinate)
    setSimulationRemainingDistance(0)
    setSimulationRemainingDuration(0)
    setGuidanceDistanceUpdateKey((key) => key + 1)
    guidanceDistanceDisplayRef.current.clear()
    setSelectedRouteOptionId(undefined)
    setDestination(undefined)
    setDestinationKeyword('')
    setActiveField(null)
    setHighlightedIndex(0)
    setRouteSearchOpen(false)
    setMusicPlaying(false)
    setMusicModalOpen(false)
  }, [destination?.coordinate, stopSimulation])

  useEffect(() => {
    if (!demoSimulationStartPending || !activeRoute) {
      return
    }

    setDemoSimulationStartPending(false)
    startSimulation()
  }, [activeRoute, demoSimulationStartPending, startSimulation])

  useEffect(() => {
    const event = demoScenarioState?.scenarioEvent

    if (event?.eventType !== 'SESSION_ENDED') {
      demoEndedEventAppliedRef.current = null
      return
    }

    if (demoEndedEventAppliedRef.current === event.id) {
      return
    }

    demoEndedEventAppliedRef.current = event.id
    completeDemoDrive()
  }, [completeDemoDrive, demoScenarioState?.scenarioEvent])

  useEffect(() => {
    const event = demoScenarioState?.scenarioEvent
    const shouldStartMusic = event?.id === 'drowsy_music_started' || event?.id === 'device_music_started'

    if (!shouldStartMusic) {
      demoMusicEventAppliedRef.current = null
      return
    }

    if (demoMusicEventAppliedRef.current === event.id) {
      return
    }

    demoMusicEventAppliedRef.current = event.id
    setMusicTrackId('soft-focus')
    setMusicProgressSeconds(0)
    setMusicPlaying(true)
    setMusicModalOpen(false)
  }, [demoScenarioState?.scenarioEvent])

  useEffect(() => {
    const eventId = demoScenarioState?.scenarioEvent?.id

    if (eventId === 'device_music_panel_opened') {
      setMusicSearchKeyword('')
      setMusicTrackId('drive-neon')
      setMusicProgressSeconds(0)
      setMusicPlaying(false)
      setMusicModalOpen(true)
      return
    }

    if (eventId === 'device_first_detection') {
      setMusicSearchKeyword('Soft')
      setMusicTrackId('drive-neon')
      setMusicProgressSeconds(0)
      setMusicPlaying(false)
      setMusicModalOpen(true)
      return
    }

    if (eventId === 'device_repeated_detection') {
      setMusicSearchKeyword('Soft')
      setMusicTrackId('soft-focus')
      setMusicProgressSeconds(0)
      setMusicPlaying(false)
      setMusicModalOpen(true)
      return
    }

    if (eventId === 'device_music_approved') {
      setMusicSearchKeyword('Soft')
      setMusicTrackId('soft-focus')
      setMusicProgressSeconds(0)
      setMusicPlaying(false)
      setMusicModalOpen(true)
      return
    }

    if (eventId === 'device_music_preview') {
      setMusicSearchKeyword('Soft')
      setMusicTrackId('soft-focus')
      setMusicProgressSeconds(0)
      setMusicPlaying(false)
      setMusicModalOpen(true)
      return
    }

    if (eventId === 'device_music_selected') {
      setMusicSearchKeyword('Soft')
      setMusicTrackId('soft-focus')
      setMusicProgressSeconds(0)
      setMusicPlaying(true)
      setMusicModalOpen(true)
      return
    }

    if (eventId !== 'device_music_started') {
      return
    }

    setMusicSearchKeyword('')
  }, [demoScenarioState?.scenarioEvent?.id])

  useEffect(() => {
    setMusicProgressSeconds(0)
  }, [selectedMusicTrackId])

  useEffect(() => {
    if (!musicPlaying || musicModalOpen) {
      return undefined
    }

    const timer = window.setInterval(() => {
      setMusicProgressSeconds((currentSeconds) => {
        const durationSeconds = Math.max(1, selectedMusicDurationSeconds)
        const nextSeconds = currentSeconds + 1

        if (nextSeconds < durationSeconds) {
          return nextSeconds
        }

        setMusicTrackId((currentTrackId) => getNextMusicTrackId(musicTracks, currentTrackId))
        return 0
      })
    }, 1_000)

    return () => window.clearInterval(timer)
  }, [musicModalOpen, musicPlaying, musicTracks, selectedMusicDurationSeconds])

  const advanceActiveDemoScenario = useCallback(() => {
    setDemoScenarioState((currentState) => {
      if (!currentState) {
        return currentState
      }

      const nextState = advanceDemoScenarioForPresenter(currentState)
      applyDemoSetupSideEffects(nextState)
      if (shouldOpenDemoReport(nextState)) {
        setNavigationEntryMode('free-navigation')
        setActiveSidePanel('report')
        setReportFullscreenOpen(false)
        setDemoCompleted(true)
        return null
      }
      return nextState
    })
  }, [applyDemoSetupSideEffects])

  const respondActiveDemoScenario = useCallback((responseValue: string) => {
    setDemoScenarioState((currentState) => (
      currentState ? respondToDemoScenario(currentState, responseValue) : currentState
    ))
  }, [])

  const resetActiveDemoScenario = useCallback(() => {
    if (!demoScenarioState) {
      return
    }

    endGuidance()
    setDemoScenarioState(createInitialDemoScenarioState(demoScenarioState.scenario.scenarioId))
    setDemoCompleted(false)
  }, [demoScenarioState, endGuidance])

  const exitActiveDemoScenario = useCallback(() => {
    endGuidance()
    setDemoScenarioState(null)
    setNavigationEntryMode(null)
    setDemoCompleted(false)
  }, [endGuidance])

  useEffect(() => {
    const route = activeRoute
    const simulationPlan = activeRouteSimulationPlan

    if (!simulationRunning || !route || !simulationPlan) {
      return
    }

    const simulationDurationMs = getSimulationDurationMs(
      route.summary.durationSeconds,
      route.summary.distanceMeters,
    )

    const tick = (timestamp: number) => {
      const skipInitialUiUpdate = simulationSkipInitialUiUpdateRef.current
      if (skipInitialUiUpdate) {
        simulationFrameRendererRef.current?.(simulationPlan.coordinates[0] ?? route.coordinates[0], {
          skipCamera: true,
          skipRouteLineHead: true,
        })
        simulationStartedAtRef.current = timestamp
        simulationSkipInitialUiUpdateRef.current = false
        simulationSkipInitialFrameWorkRef.current = false
        simulationLastUiUpdateAtRef.current = timestamp
        animationFrameRef.current = window.requestAnimationFrame(tick)
        return
      }

      if (simulationStartedAtRef.current === undefined) {
        simulationStartedAtRef.current = timestamp
      }
      const elapsed = timestamp - simulationStartedAtRef.current
      const progress = getSimulatedRoutePosition(simulationPlan, elapsed / simulationDurationMs)
      const skipInitialFrameWork = simulationSkipInitialFrameWorkRef.current
      simulationFrameRendererRef.current?.(progress.coordinate, {
        skipCamera: skipInitialFrameWork,
        skipRouteLineHead: skipInitialFrameWork,
      })
      const shouldUpdateUiState = !skipInitialUiUpdate && (
        progress.completed ||
        simulationLastUiUpdateAtRef.current === undefined ||
        timestamp - simulationLastUiUpdateAtRef.current >= SIMULATION_UI_UPDATE_INTERVAL_MS
      )

      if (shouldUpdateUiState) {
        setSimulationPosition(progress.coordinate)
        setSimulationRemainingDistance(progress.remainingDistanceMeters)
        setSimulationRemainingDuration(progress.remainingDurationSeconds)
        setGuidanceDistanceUpdateKey(Math.floor(elapsed / GUIDANCE_DISTANCE_UPDATE_INTERVAL_MS))
        simulationLastUiUpdateAtRef.current = timestamp
        simulationSkipInitialFrameWorkRef.current = false
      }

      if (progress.completed) {
        setSimulationRunning(false)
        animationFrameRef.current = undefined
        simulationLastUiUpdateAtRef.current = undefined
        simulationSkipInitialFrameWorkRef.current = false
        simulationSkipInitialUiUpdateRef.current = false
        return
      }

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)

    return () => {
      if (animationFrameRef.current !== undefined) {
        window.cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [activeRoute, activeRouteSimulationPlan, simulationRunning])

  return (
    <main
      data-testid="navigation-stage"
      className="relative grid h-screen min-h-0 grid-cols-[minmax(0,1fr)_24rem] grid-rows-[minmax(17rem,38vh)_minmax(0,1fr)] gap-3 bg-[#06080c] p-3"
    >
      {/* Top cockpit surface: this area is reserved for the driver's in-cabin video. */}
      <DriverVideoPanel
        error={driverVideoError}
        fileName={driverVideo?.name}
        motionTiming={motionTiming}
        source={driverVideo ?? undefined}
        onError={() => setDriverVideoError(true)}
        onSelectVideo={selectDriverVideo}
      />
      <section
        data-testid="navigation-viewport"
        className={navigationViewportClassName}
      >
        <div
          data-testid="navigation-content-region"
          className={[
            'relative h-full min-w-0 overflow-hidden',
            'w-full',
          ].join(' ')}
        >
          {profileSetupComplete && navigationEntryMode ? (
            <>
            <TmapPanel
              cameraSettings={mapCameraSettings}
              currentPosition={currentPosition}
              route={activeRoute}
              routeOptions={routeOptions}
              routeSelectionMode={routeSelectionMode}
              origin={origin}
              destination={destination}
              simulationPosition={simulationPosition}
              activeRouteOptionId={activeRouteOptionId}
              onCameraSettingsChange={updateMapCameraSettings}
              onRouteOptionsOverlayReady={setRouteOptionsOverlayReady}
              onRouteOptionPreviewChange={setPreviewRouteOptionId}
              onSimulationFrameRendererReady={(renderFrame) => {
                simulationFrameRendererRef.current = renderFrame
              }}
              onRequestLocation={requestCurrentLocation}
            />
            <RoadieOrbControl
              assistantStep={visibleAssistantStep}
              hidden={Boolean(activeSidePanel || (musicModalOpen && demoScenarioState?.scenario?.scenarioId !== 'device_operation'))}
              motionTiming={motionTiming}
              musicRecommendationLoading={musicRecommendationsLoading}
              musicRecommendationTrack={selectedMusicTrack}
              onClose={resetAssistantScenario}
              onWakeCall={() => {
                selectAssistantScenario('route-search-voice')
                setAssistantStepIndex(1)
              }}
              onRecommendationAction={(recommendation) => {
                if (recommendation.type === 'music') {
                  setMusicTrackId(selectedMusicTrack.id)
                  setMusicProgressSeconds(0)
                  setMusicPlaying(true)
                  setMusicModalOpen(false)
                }
              }}
              profileName={selectedProfileName}
              reducedMotion={Boolean(shouldReduceMotion)}
            />
            {!activeRoute ? (
              <>
                {!routeSelectionMode ? (
                  <IdleMapControls
                    motionTiming={motionTiming}
                    searchOpen={routeSearchOpen}
                    showFallbackToast={showLocationFallbackToast}
                    onOpenSearch={() => openRouteSearchEditor('destination')}
                    onOpenSettings={() => openSidePanel('settings')}
                  />
                ) : (
                  <RouteSelectionSummary
                    destinationLabel={destination?.name || destinationKeyword || '목적지'}
                    error={routeOptionsQuery.isError}
                    loading={routeOptionsLoading}
                    motionTiming={motionTiming}
                    optionCount={routeOptions?.length ?? 0}
                    originLabel={origin?.name || originKeyword || currentOriginLabel}
                    activeRouteOptionId={activeRouteOptionId}
                    routeOptions={visibleRouteOptions ?? []}
                    onEditRoute={() => {
                      openRouteSearchEditor('destination')
                    }}
                    onPreviewRouteOption={setPreviewRouteOptionId}
                    onSelectRouteOption={selectRouteOption}
                  />
                )}
                <AnimatePresence initial={false}>
                  {routeSelectionMode && routeOptionsLoading ? (
                    <RouteSearchLoadingModal
                      motionTiming={motionTiming}
                      reducedMotion={Boolean(shouldReduceMotion)}
                    />
                  ) : null}
                </AnimatePresence>
                <AnimatePresence initial={false}>
                  {routeSearchOpen ? (
                    <RouteSearchSheet
                      activeField={activeField}
                      activeIndex={highlightedIndex}
                      activeLabel={activeLabel}
                      destinationKeyword={destinationKeyword}
                      motionTiming={motionTiming}
                      originKeyword={originKeyword}
                      places={activePlaces}
                      savedPlaces={routeSearchSavedPlaces}
                      searchHistoryPlaces={searchHistoryPlaces}
                      showSearchHistories={showSearchHistories}
                      showSuggestions={showSuggestions}
                      onChangeOrigin={(value) => {
                        setOriginKeyword(value)
                        if (!routeSelectionModeRef.current) {
                          setOrigin(undefined)
                        }
                        setActiveField('origin')
                        setHighlightedIndex(0)
                      }}
                      onChangeDestination={(value) => {
                        setDestinationKeyword(value)
                        if (!routeSelectionModeRef.current) {
                          setDestination(undefined)
                        }
                        setActiveField('destination')
                        setHighlightedIndex(0)
                      }}
                      onClose={() => {
                        clearPendingRouteSearchEditor()
                        if (routeSelectionMode) {
                          setDestination(undefined)
                          setDestinationKeyword('')
                          setSelectedRouteOptionId(undefined)
                          guidanceDistanceDisplayRef.current.clear()
                        }
                        setRouteSearchOpen(false)
                        setActiveField(null)
                      }}
                      onBackToSummary={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField(null)
                        setHighlightedIndex(0)
                      }}
                      onFocusOrigin={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField('origin')
                      }}
                      onFocusDestination={() => {
                        clearPendingRouteSearchEditor()
                        setActiveField('destination')
                      }}
                      onKeyDown={(field, event) => handleSearchKeyDown(field, event)}
                      onSelectPlace={selectPlace}
                      onSelectSearchHistory={selectSavedPlace}
                      onSelectSavedPlace={selectSavedPlace}
                      onFillOriginWithCurrentLocation={fillOriginWithCurrentLocation}
                    />
                  ) : null}
                </AnimatePresence>
                {debugDrivingAssist ?? drivingAssist ? (
                  <DrivingAssistOverlay
                    assist={(debugDrivingAssist ?? drivingAssist)!}
                    motionTiming={motionTiming}
                  />
                ) : null}
              </>
            ) : (
              <DrivingHud
                assist={debugDrivingAssist ?? drivingAssist}
                guidance={maneuverGuidance}
                hideActions={demoActive || demoCompleted}
                motionTiming={motionTiming}
                simulationRunning={simulationRunning}
                onToggleSimulation={simulationRunning ? stopSimulation : startSimulation}
                onEndGuidance={endGuidance}
              />
            )}
            {demoNavigationLocked ? (
              <div
                aria-label="데모 시나리오 중 내비게이션 조작 잠금"
                className="pointer-events-auto absolute inset-0 z-[55] cursor-not-allowed bg-transparent"
                data-testid="demo-navigation-lock"
              />
            ) : null}

            <BottomStatusBar
              arrivalLabel={arrivalLabel}
              currentLocationLabel={currentLocationLabel}
              currentTimeLabel={currentTimeLabel}
              destinationLabel={destinationStatusLabel}
              distanceLabel={drivingDistance}
              durationLabel={`${routeMinutes}분`}
              hasRoute={Boolean(activeRoute)}
              motionTiming={motionTiming}
              weatherLabel={weatherLabel}
            />
            <MiniPlayer
              activeRoute={Boolean(activeRoute)}
              motionTiming={motionTiming}
              musicPlaying={musicPlaying && !musicModalOpen}
              progressSeconds={musicProgressSeconds}
              selectedTrack={selectedMusicTrack}
              onClose={() => setMusicPlaying(false)}
              onTogglePlay={() => setMusicPlaying((playing) => !playing)}
            />

            <motion.div
              data-testid="navigation-overlays"
              className="pointer-events-none absolute inset-0 z-30"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={motionTiming}
            >
              <AppIconDock
                activeSidePanel={activeSidePanel}
                className={[
                  'absolute bottom-[43px] right-0 z-40 max-sm:bottom-[37px]',
                ].join(' ')}
                motionTiming={motionTiming}
                onOpenLabels={() => openSidePanel('labels')}
                onOpenSettings={() => openSidePanel('settings')}
                onOpenReport={() => openSidePanel('report')}
                onOpenConnect={() => openSidePanel('connect')}
                onToggleMusic={toggleMusicModal}
                settingsDisabled={routeSelectionMode}
                musicModalOpen={musicModalOpen}
              />

              <AnimatePresence initial={false} mode="wait">
                {musicModalOpen ? (
                  <MusicPopover
                    motionTiming={motionTiming}
                    musicSearchKeyword={musicSearchKeyword}
                    musicPlaying={musicPlaying}
                    selectedTrack={selectedMusicTrack}
                    tracks={musicTracks}
                    loading={musicRecommendationsLoading}
                    error={musicRecommendationsQuery.isError}
                    onClose={() => setMusicModalOpen(false)}
                    onPickTrack={(trackId) => setMusicTrackId(trackId)}
                    onSearchKeywordChange={setMusicSearchKeyword}
                    onStartPlayback={() => {
                      setMusicProgressSeconds(0)
                      setMusicPlaying(true)
                      setMusicModalOpen(false)
                    }}
                  />
                ) : null}
              </AnimatePresence>
            </motion.div>
            </>
          ) : null}
          {profileSetupComplete && !navigationEntryMode ? (
            <DemoScenarioSelection
              motionTiming={motionTiming}
              profileName={selectedProfile?.displayName ?? '운전자'}
              onStartFreeNavigation={() => {
                setNavigationEntryMode('free-navigation')
                setDemoScenarioState(null)
                setDemoCompleted(false)
              }}
              onStartScenario={(scenarioId) => {
                setNavigationEntryMode('demo-scenario')
                setDemoScenarioState(createInitialDemoScenarioState(scenarioId))
                setDemoCompleted(false)
              }}
            />
          ) : null}
        </div>

        {profileSetupComplete ? (
          <AnimatePresence initial={false} mode="wait">
            {activeSidePanel ? (
              <SideDrawerPanel
                cameraSettings={mapCameraSettings}
                currentLocationLabel={currentLocationLabel}
                locationStatus={locationStatus}
                motionTiming={motionTiming}
                panel={activeSidePanel}
                selectedProfile={selectedProfile}
                savedPlaces={savedPlaceQuickItems}
                savedPlacesError={savedPlacesQuery.isError}
                savedPlacesLoading={savedPlacesQuery.isFetching}
                deletingLabelId={deleteSavedPlaceMutation.isPending ? deleteSavedPlaceMutation.variables : undefined}
                updatingLabelId={updateSavedPlaceMutation.isPending ? updateSavedPlaceMutation.variables?.placeId : undefined}
                fullReportAvailable={!simulationRunning}
                onChangeCameraSettings={updateMapCameraSettings}
                onClose={() => setActiveSidePanel(null)}
                onOpenFullReport={() => {
                  if (simulationRunning) {
                    return
                  }
                  setActiveSidePanel(null)
                  setReportFullscreenOpen(true)
                }}
                onRequestCurrentLocation={requestCurrentLocation}
                onAddPlaceLabel={(field, place) => {
                  if (selectedProfileId) {
                    createFavoriteMutation.mutate({ field, profileId: selectedProfileId, place })
                  }
                }}
                onDeletePlaceLabel={(placeId) => deleteSavedPlaceMutation.mutate(placeId)}
                onUpdatePlaceLabel={(placeId, label) => updateSavedPlaceMutation.mutate({ placeId, label })}
              />
            ) : null}
          </AnimatePresence>
        ) : null}
        {profileSetupComplete ? (
          <AnimatePresence initial={false}>
            {reportFullscreenOpen ? (
              <ReportFullscreenOverlay
                motionTiming={motionTiming}
                report={MOCK_REPORT_DATA}
                onClose={() => setReportFullscreenOpen(false)}
              />
            ) : null}
          </AnimatePresence>
        ) : null}
        <AnimatePresence initial={false}>
          {!profileSetupComplete ? (
            <NavigationProfileSetup
              createError={createProfileMutation.isError}
              creating={createProfileMutation.isPending}
              calibrationError={selectProfileMutation.isError}
              calibrationProgress={calibrationProgress}
              calibrationStepIndex={calibrationStepIndex}
              calibratingProfileName={calibratingProfileName}
              deleteError={deleteProfileMutation.isError}
              deletingProfileId={deleteProfileMutation.variables}
              editing={updateProfileMutation.isPending}
              form={profileForm}
              limit={bootstrapQuery.data?.profileLimit ?? 5}
              loading={bootstrapQuery.isLoading}
              motionTiming={motionTiming}
              profileError={bootstrapQuery.isError}
              profileSetupView={profileSetupView}
              profiles={profiles}
              selectError={selectProfileMutation.isError}
              selecting={selectProfileMutation.isPending}
              selectedProfile={selectedProfile}
              updateError={updateProfileMutation.isError}
              onBackToList={() => {
                setProfileSetupView('list')
                setEditingProfileId(undefined)
                setProfileForm(DEFAULT_PROFILE_CREATE_REQUEST)
              }}
              onChangeForm={setProfileForm}
              onCreateProfile={() => createProfileMutation.mutate(normalizeProfileForm(profileForm))}
              onDeleteProfile={(profileId) => deleteProfileMutation.mutate(profileId)}
              onOpenCreate={() => {
                setEditingProfileId(undefined)
                setProfileForm(DEFAULT_PROFILE_CREATE_REQUEST)
                setProfileSetupView('create')
              }}
              onOpenEdit={(profile) => {
                setEditingProfileId(profile.id)
                setProfileForm(createProfileFormFromProfile(profile))
                setProfileSetupView('edit')
              }}
              onSelectProfile={(profileId) => setSelectedProfileId(profileId)}
              onStart={() => {
                if (selectedProfileId) {
                  selectProfileMutation.mutate(selectedProfileId)
                }
              }}
              onUpdateProfile={() => {
                if (editingProfileId) {
                  updateProfileMutation.mutate({
                    profileId: editingProfileId,
                    payload: normalizeProfileForm(profileForm),
                  })
                }
              }}
            />
          ) : null}
        </AnimatePresence>
      </section>
      {demoScenarioState ? (
        <DemoScenarioPresenterPanel
          motionTiming={motionTiming}
          routeReady={Boolean(activeRoute)}
          routeOptionsReady={routeOptionsReady}
          profileName={selectedProfileName}
          state={demoScenarioState}
          onExit={exitActiveDemoScenario}
          onNext={advanceActiveDemoScenario}
          onReset={resetActiveDemoScenario}
          onRespond={respondActiveDemoScenario}
        />
      ) : demoCompleted ? (
        <DemoScenarioCompletedPanel
          motionTiming={motionTiming}
          onBackToScenarios={() => {
            setActiveSidePanel(null)
            setNavigationEntryMode(null)
            setDemoCompleted(false)
          }}
        />
      ) : navigationEntryMode === 'free-navigation' ? (
        <RoadieAssistantDebugPanel
          motionTiming={motionTiming}
          scenario={assistantScenario}
          scenarioId={assistantScenarioId}
          stepIndex={assistantStepIndex}
          onNext={() => moveAssistantScenarioStep(1)}
          onPrevious={() => moveAssistantScenarioStep(-1)}
          onReset={resetAssistantScenario}
          onSelectScenario={selectAssistantScenario}
        />
      ) : (
        <div className="col-start-2 row-start-2 self-start rounded-[1.1rem] border border-white/70 bg-white p-4 text-[var(--nav-ink)] shadow-[0_18px_46px_rgb(0_0_0/0.24)]">
          <p className="text-sm font-bold">데모 준비</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--nav-muted)]">
            프로필을 선택하면 대표 위험행동을 확인할 수 있어요.
          </p>
        </div>
      )}
    </main>
  )
}

function NavigationProfileSetup({
  createError,
  creating,
  calibrationError,
  calibrationProgress,
  calibrationStepIndex,
  calibratingProfileName,
  deleteError,
  deletingProfileId,
  editing,
  form,
  limit,
  loading,
  motionTiming,
  profileError,
  profileSetupView,
  profiles,
  selectError,
  selecting,
  selectedProfile,
  updateError,
  onBackToList,
  onChangeForm,
  onCreateProfile,
  onDeleteProfile,
  onOpenCreate,
  onOpenEdit,
  onSelectProfile,
  onStart,
  onUpdateProfile,
}: {
  createError: boolean
  creating: boolean
  calibrationError: boolean
  calibrationProgress: number
  calibrationStepIndex: number
  calibratingProfileName: string
  deleteError: boolean
  deletingProfileId?: string
  editing: boolean
  form: ProfileCreateRequest
  limit: number
  loading: boolean
  motionTiming: MotionTiming
  profileError: boolean
  profileSetupView: ProfileSetupView
  profiles: Profile[]
  selectError: boolean
  selecting: boolean
  selectedProfile?: Profile
  updateError: boolean
  onBackToList: () => void
  onChangeForm: (form: ProfileCreateRequest) => void
  onCreateProfile: () => void
  onDeleteProfile: (profileId: string) => void
  onOpenCreate: () => void
  onOpenEdit: (profile: Profile) => void
  onSelectProfile: (profileId: string) => void
  onStart: () => void
  onUpdateProfile: () => void
}) {
  const canCreate = profiles.length < limit
  const startLabel = selectedProfile ? `${selectedProfile.displayName}(으)로 시작` : '로디 시작'
  const formMode = profileSetupView === 'edit' ? 'edit' : 'create'

  return (
    <motion.section
      aria-label="프로필 설정"
      aria-modal="true"
      className="absolute inset-0 z-[90] flex min-h-0 flex-col items-center justify-center overflow-hidden bg-[var(--nav-frame)] px-6 py-8 text-[var(--nav-ink)]"
      data-testid="navigation-profile-setup"
      exit={{ opacity: 0, scale: 1.015 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTiming}
      role="dialog"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgb(232_238_255/0.92)_0%,rgb(246_248_251)_34%,rgb(255_255_255)_100%)]"
      />
      <div
        className={[
          'relative z-[1] flex w-full max-w-4xl flex-col items-center',
          profileSetupView !== 'list' ? 'h-full min-h-0' : 'justify-center',
        ].join(' ')}
      >
        {profileSetupView === 'calibration' ? (
          <ProfileCalibrationFlow
            error={calibrationError}
            motionTiming={motionTiming}
            profileName={calibratingProfileName}
            progress={calibrationProgress}
            stepIndex={calibrationStepIndex}
          />
        ) : profileSetupView !== 'list' ? (
          <ProfileSettingsForm
            deleteError={deleteError}
            deleting={Boolean(selectedProfile && deletingProfileId === selectedProfile.id)}
            saveError={formMode === 'edit' ? updateError : createError}
            saving={formMode === 'edit' ? editing : creating}
            form={form}
            motionTiming={motionTiming}
            mode={formMode}
            onBackToList={onBackToList}
            onChangeForm={onChangeForm}
            onDeleteProfile={selectedProfile ? () => onDeleteProfile(selectedProfile.id) : undefined}
            onSaveProfile={formMode === 'edit' ? onUpdateProfile : onCreateProfile}
          />
        ) : (
          <>
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...motionTiming,
                delay: motionTiming.duration === 0 ? 0 : 0.06,
              }}
            >
              <h1 className="text-4xl font-bold tracking-normal text-[var(--nav-ink)] max-sm:text-3xl">
                오늘은 누가 운전할까요?
              </h1>
            </motion.div>
            <div className="mt-10 w-full overflow-x-auto overflow-y-hidden pb-3" data-testid="profile-scroll-row">
              <div className="flex w-max min-w-full flex-nowrap gap-3">
                {loading ? (
                  <div
                    aria-label="프로필 로딩 중"
                    className="flex flex-nowrap gap-3"
                    role="status"
                  >
                    {Array.from({ length: 3 }).map((_, index) => (
                      <span
                        className="block h-[13.5rem] w-[11.75rem] shrink-0 animate-pulse rounded-lg bg-white/8"
                        key={index}
                      />
                    ))}
                  </div>
                ) : profileError ? (
                  <div
                    aria-label="프로필 로딩 실패"
                    className="grid h-[15rem] min-w-full place-items-center rounded-lg bg-white/8 text-[#ffb4a8]"
                    role="status"
                  >
                    <Warning className="size-8" weight="fill" />
                  </div>
                ) : profiles.map((profile, index) => {
                  const selected = profile.id === selectedProfile?.id

                  return (
                    <motion.div
                      className={[
                        'group relative flex w-[11.75rem] shrink-0 flex-col items-center rounded-lg p-4 text-center transition',
                        selected ? 'bg-white text-[var(--nav-ink)] shadow-[var(--nav-shadow-panel)]' : 'bg-white/72 text-[var(--nav-ink)] hover:bg-white',
                      ].join(' ')}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={profile.id}
                      transition={{
                        ...motionTiming,
                        delay: motionTiming.duration === 0 ? 0 : 0.1 + index * 0.04,
                      }}
                    >
                      <button
                        aria-label={`${profile.displayName} 프로필 선택`}
                        aria-pressed={selected}
                        className="flex w-full min-w-0 flex-col items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                        onClick={() => onSelectProfile(profile.id)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className={[
                            'grid aspect-square w-full place-items-center overflow-hidden rounded-lg transition',
                            selected
                              ? 'ring-4 ring-[var(--nav-primary)]'
                              : 'opacity-[0.86] group-hover:opacity-100',
                          ].join(' ')}
                        >
                          {profile.profileImageUrl ? (
                            <img
                              alt=""
                              className="h-full w-full object-cover"
                              src={profile.profileImageUrl}
                            />
                          ) : (
                            <Avatar
                              colors={NAVIGATION_PROFILE_AVATAR_COLORS}
                              name={profile.displayName}
                              size={176}
                              square
                              variant="beam"
                            />
                          )}
                        </span>
                        <span className="mt-3 max-w-full truncate text-lg font-bold tracking-normal">
                          {profile.displayName}
                        </span>
                      </button>
                    </motion.div>
                  )
                })}

                {!loading && !profileError ? (
                  <motion.button
                    aria-label="프로필 추가"
                    className="grid h-[13.5rem] w-[11.75rem] shrink-0 place-items-center rounded-lg border border-dashed border-[var(--nav-border)] bg-white/56 p-4 text-[var(--nav-primary)] transition hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={!canCreate}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={onOpenCreate}
                    transition={{
                      ...motionTiming,
                      delay: motionTiming.duration === 0 ? 0 : 0.16,
                    }}
                    type="button"
                  >
                    <span className="grid size-16 place-items-center rounded-full bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]">
                      <Plus className="size-7" weight="bold" />
                    </span>
                  </motion.button>
                ) : null}
              </div>
            </div>

            {deleteError ? (
              <p className="mt-5 text-sm font-bold text-[#ffb4a8]">프로필 삭제에 실패했습니다.</p>
            ) : null}
            {selectError ? (
              <p className="mt-5 text-sm font-bold text-[#ffb4a8]">프로필 선택에 실패했습니다.</p>
            ) : null}

            <motion.div
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...motionTiming,
                delay: motionTiming.duration === 0 ? 0 : 0.24,
              }}
            >
              <button
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--nav-primary)] px-8 text-base font-bold text-white shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!selectedProfile || selecting}
                onClick={onStart}
                type="button"
              >
                {startLabel}
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[var(--nav-primary)] shadow-[0_6px_16px_rgb(15_23_42/0.08)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!selectedProfile}
                onClick={() => {
                  if (selectedProfile) {
                    onOpenEdit(selectedProfile)
                  }
                }}
                type="button"
              >
                <PencilSimple className="size-4" weight="bold" />
                프로필 수정
              </button>
            </motion.div>
          </>
        )}
      </div>
    </motion.section>
  )
}

function ProfileCalibrationFlow({
  error,
  motionTiming,
  profileName,
  progress,
  stepIndex,
}: {
  error: boolean
  motionTiming: MotionTiming
  profileName: string
  progress: number
  stepIndex: number
}) {
  const activeStep = CALIBRATION_STEPS[stepIndex] ?? CALIBRATION_STEPS[0]
  const completed = stepIndex === CALIBRATION_STEPS.length - 1 && progress >= 100
  const progressOffset = 339.292 - (339.292 * progress) / 100

  return (
    <motion.div
      aria-label="운전자 Calibration"
      className="flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-[1.1rem] bg-white text-center shadow-[var(--nav-shadow-panel)] ring-1 ring-[rgb(16_24_40/0.06)]"
      data-testid="profile-calibration-flow"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 py-8 max-sm:px-5">
        <p className="text-sm font-bold text-[var(--nav-primary)]">{profileName} 프로필</p>
        <h2 className="mt-2 text-2xl font-black tracking-normal text-[var(--nav-ink)]">
          로디가 개인화 맞춤 설정을 준비하고 있어요
        </h2>
        <p className="mt-3 max-w-[34rem] text-sm font-semibold leading-6 text-[var(--nav-muted)]">
          평소 자세와 시선 패턴을 확인해 {profileName}님에게 맞는 보조 방식을 적용합니다.
        </p>

        <div className="mt-8 grid w-full max-w-[36rem] place-items-center rounded-3xl bg-[var(--nav-panel)] px-6 py-8">
          <div className="relative grid size-40 place-items-center">
            <svg aria-hidden="true" className="absolute inset-0 size-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                fill="none"
                r="54"
                stroke="rgb(228 231 236)"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                fill="none"
                r="54"
                stroke="var(--nav-primary)"
                strokeDasharray="339.292"
                strokeDashoffset={progressOffset}
                strokeLinecap="round"
                strokeWidth="8"
              />
            </svg>
            <div className="grid size-28 place-items-center rounded-full bg-white shadow-[0_12px_28px_rgb(15_23_42/0.10)]">
              {completed ? (
                <Check className="size-10 text-[var(--nav-primary)]" weight="bold" />
              ) : (
                <span className="text-3xl font-black text-[var(--nav-ink)]">{progress}%</span>
              )}
            </div>
          </div>

          <h3 className="mt-6 text-xl font-black text-[var(--nav-ink)]">{activeStep.title}</h3>
          <p className="mt-2 max-w-[28rem] text-sm font-semibold leading-6 text-[var(--nav-muted)]">
            {activeStep.description}
          </p>
        </div>

        <ol className="mt-6 grid w-full max-w-[36rem] grid-cols-5 gap-2 max-sm:grid-cols-1">
          {CALIBRATION_STEPS.map((step, index) => {
            const stepComplete = index < stepIndex || (index === stepIndex && progress >= 100)
            const active = index === stepIndex

            return (
              <li
                className={[
                  'flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-bold transition',
                  stepComplete
                    ? 'bg-[var(--nav-primary)] text-white'
                    : active
                      ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]'
                      : 'bg-white text-[var(--nav-muted)] ring-1 ring-[var(--nav-border)]',
                ].join(' ')}
                key={step.title}
              >
                {stepComplete ? <Check className="mr-1.5 size-3.5" weight="bold" /> : null}
                {index + 1}
              </li>
            )
          })}
        </ol>

        {error ? (
          <p className="mt-5 text-sm font-bold text-[var(--nav-danger)]">프로필 적용에 실패했습니다.</p>
        ) : null}
      </div>
    </motion.div>
  )
}

function ProfileSettingsForm({
  deleteError,
  deleting,
  form,
  mode,
  motionTiming,
  saveError,
  saving,
  onBackToList,
  onChangeForm,
  onDeleteProfile,
  onSaveProfile,
}: {
  deleteError: boolean
  deleting: boolean
  form: ProfileCreateRequest
  mode: 'create' | 'edit'
  motionTiming: MotionTiming
  saveError: boolean
  saving: boolean
  onBackToList: () => void
  onChangeForm: (form: ProfileCreateRequest) => void
  onDeleteProfile?: () => void
  onSaveProfile: () => void
}) {
  const [activePageId, setActivePageId] = useState<ProfileSettingsPageId>('basic')
  const activePageIndex = PROFILE_SETTINGS_PAGES.findIndex((page) => page.id === activePageId)
  const activePage = PROFILE_SETTINGS_PAGES[activePageIndex] ?? PROFILE_SETTINGS_PAGES[0]
  const previousPage = activePageIndex > 0 ? PROFILE_SETTINGS_PAGES[activePageIndex - 1] : undefined
  const nextPage = activePageIndex < PROFILE_SETTINGS_PAGES.length - 1 ? PROFILE_SETTINGS_PAGES[activePageIndex + 1] : undefined
  const updateForm = <Key extends keyof ProfileCreateRequest>(
    key: Key,
    value: ProfileCreateRequest[Key],
  ) => {
    onChangeForm({ ...form, [key]: value })
  }

  return (
    <motion.form
      className="flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-[1.1rem] bg-white text-left shadow-[var(--nav-shadow-panel)] ring-1 ring-[rgb(16_24_40/0.06)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={(event) => {
        event.preventDefault()
        onSaveProfile()
      }}
      transition={motionTiming}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-8 py-7 max-sm:px-5">
        <div className="flex shrink-0 items-center gap-5 pb-2 max-sm:flex-col max-sm:items-start">
          <span
            aria-hidden="true"
            className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[var(--nav-panel)] ring-1 ring-[var(--nav-border)]"
          >
            <Avatar
              colors={NAVIGATION_PROFILE_AVATAR_COLORS}
              name={form.displayName || form.agentCallName || '새 운전자'}
              size={80}
              square
              variant="beam"
            />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold tracking-normal text-[var(--nav-ink)]">프로필 설정</h2>
            <div className="mt-3 flex min-w-0 flex-wrap gap-2">
              <span className="rounded-full bg-[var(--nav-primary-soft)] px-3 py-1 text-sm font-bold text-[var(--nav-primary)]">
                {form.displayName || '새 운전자'}
              </span>
              <span className="rounded-full bg-[var(--nav-panel)] px-3 py-1 text-sm font-semibold text-[var(--nav-muted)]">
                {form.agentCallName || '로디'}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 grid shrink-0 grid-cols-3 gap-2 rounded-2xl bg-[var(--nav-panel)] p-1">
          {PROFILE_SETTINGS_PAGES.map((page) => {
            const selected = page.id === activePage.id

            return (
              <button
                key={page.id}
                aria-current={selected ? 'step' : undefined}
                className={[
                  'min-h-10 rounded-xl px-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                  selected
                    ? 'bg-white text-[var(--nav-primary)] shadow-[var(--nav-shadow-control)]'
                    : 'text-[var(--nav-muted)] hover:bg-white hover:text-[var(--nav-ink)]',
                ].join(' ')}
                type="button"
                onClick={() => setActivePageId(page.id)}
              >
                {page.label}
              </button>
            )
          })}
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-hidden">
          {activePage.id === 'basic' ? (
            <div className="grid h-full content-start grid-cols-2 gap-5 max-sm:grid-cols-1">
              <ProfileTextField
                label="프로필 이름"
                value={form.displayName}
                onChange={(value) => updateForm('displayName', value)}
              />
              <ProfileTextField
                label="호출 이름"
                value={form.agentCallName}
                onChange={(value) => updateForm('agentCallName', value)}
              />
              <ProfileTextField
                className="col-span-full max-sm:col-span-1"
                label="리포트 이메일"
                type="email"
                value={form.reportEmail ?? ''}
                onChange={(value) => updateForm('reportEmail', value)}
              />
            </div>
          ) : null}
          {activePage.id === 'guidance' ? (
            <div className="grid h-full content-start grid-cols-2 gap-5 max-sm:grid-cols-1">
              <ProfileSelectField<AgentPersonality>
                label="Agent 성격"
                options={[
                  ['FRIENDLY', '친근함'],
                  ['FORMAL', '정중함'],
                  ['WARM', '따뜻함'],
                  ['WITTY', '위트'],
                ]}
                value={form.agentPersonality}
                onChange={(value) => updateForm('agentPersonality', value)}
              />
              <ProfileNumberField
                label="TTS 속도"
                max={2}
                min={0.5}
                step={0.1}
                value={form.ttsSpeed}
                onChange={(value) => updateForm('ttsSpeed', value)}
              />
              <ProfileNumberField
                label="안내 음량"
                max={100}
                min={0}
                step={1}
                value={form.guidanceVolume}
                onChange={(value) => updateForm('guidanceVolume', value)}
              />
            </div>
          ) : null}
          {activePage.id === 'behavior' ? (
            <ProfileBehaviorSensitivityField
              value={form.behaviorWarningSensitivity}
              onChange={(value) => updateForm('behaviorWarningSensitivity', value)}
            />
          ) : null}
        </div>

        {saveError ? (
          <p className="mt-5 text-sm font-bold text-[var(--nav-danger)]">프로필 저장에 실패했습니다.</p>
        ) : null}
        {deleteError ? (
          <p className="mt-3 text-sm font-bold text-[var(--nav-danger)]">프로필 삭제에 실패했습니다.</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--nav-border)] bg-[var(--nav-surface-raised)] px-8 py-3.5 max-sm:px-5">
        {mode === 'edit' && onDeleteProfile ? (
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-[var(--nav-danger)] ring-1 ring-[rgb(225_29_72/0.14)] transition hover:bg-[rgb(255_241_242)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-danger)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={deleting}
            onClick={onDeleteProfile}
            type="button"
          >
            <Trash className="size-4" weight="bold" />
            프로필 삭제
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap justify-end gap-3">
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--nav-panel)] px-5 text-sm font-bold text-[var(--nav-muted)] transition hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onBackToList}
          type="button"
        >
          목록으로 돌아가기
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-[var(--nav-muted)] ring-1 ring-[var(--nav-border)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!previousPage}
          onClick={() => previousPage && setActivePageId(previousPage.id)}
          type="button"
        >
          이전
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-[var(--nav-primary)] ring-1 ring-[rgb(23_70_162/0.18)] transition hover:bg-[var(--nav-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!nextPage}
          onClick={() => nextPage && setActivePageId(nextPage.id)}
          type="button"
        >
          다음
        </button>
        <button
          className="inline-flex min-h-10 items-center justify-center rounded-full bg-[var(--nav-primary)] px-6 text-sm font-bold text-white shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={saving || !form.displayName.trim() || !form.agentCallName.trim()}
          type="submit"
        >
          프로필 저장
        </button>
        </div>
      </div>
    </motion.form>
  )
}

function ProfileTextField({
  className,
  label,
  type = 'text',
  value,
  onChange,
}: {
  className?: string
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className={['flex min-w-0 flex-col gap-2', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-bold text-[var(--nav-muted)]">{label}</span>
      <input
        className="min-h-14 rounded-xl border border-[var(--nav-border)] bg-white px-4 text-base font-bold text-[var(--nav-ink)] outline-none transition placeholder:text-[var(--nav-subtle)] focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ProfileNumberField({
  label,
  max,
  min,
  step,
  value,
  onChange,
}: {
  label: string
  max: number
  min: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-bold text-[var(--nav-muted)]">{label}</span>
      <input
        className="min-h-14 rounded-xl border border-[var(--nav-border)] bg-white px-4 text-base font-bold text-[var(--nav-ink)] outline-none transition focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function ProfileSelectField<Value extends string>({
  className,
  disabled = false,
  label,
  options,
  value,
  onChange,
}: {
  className?: string
  disabled?: boolean
  label: string
  options: Array<[Value, string]>
  value: Value
  onChange: (value: Value) => void
}) {
  return (
    <label className={['flex min-w-0 flex-col gap-2', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-bold text-[var(--nav-muted)]">{label}</span>
      <select
        className="min-h-14 rounded-xl border border-[var(--nav-border)] bg-white px-4 text-base font-bold text-[var(--nav-ink)] outline-none transition focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)] disabled:cursor-not-allowed disabled:bg-[var(--nav-panel)] disabled:text-[var(--nav-muted)]"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value as Value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

function ProfileBehaviorSensitivityField({
  className,
  value,
  onChange,
}: {
  className?: string
  value: ProfileCreateRequest['behaviorWarningSensitivity']
  onChange: (value: ProfileCreateRequest['behaviorWarningSensitivity']) => void
}) {
  const lowSensitivityLabels = REPORT_BEHAVIOR_TYPES
    .filter((behaviorType) => (value[behaviorType] ?? DEFAULT_BEHAVIOR_WARNING_SENSITIVITY[behaviorType]) <= 4)
    .map(getBehaviorLabel)
  const warningMessage =
    lowSensitivityLabels.length === 1
      ? `'${lowSensitivityLabels[0]}' 감지 민감도를 4 이하로 설정하면 안전운전에 큰 위험이 될 수 있어요.`
      : lowSensitivityLabels.length > 1
        ? `${lowSensitivityLabels.join(', ')} 감지 민감도가 낮게 설정되어 있어요. 주요 위험행동은 별도의 주의가 필요합니다.`
        : null

  const setSensitivity = (behaviorType: ProfileBehaviorType, nextValue: number) => {
    onChange({
      ...value,
      [behaviorType]: clampBehaviorWarningSensitivity(nextValue),
    })
  }

  return (
    <section className={['min-w-0', className].filter(Boolean).join(' ')} aria-labelledby="profile-behavior-sensitivity-title">
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h3 id="profile-behavior-sensitivity-title" className="text-sm font-bold text-[var(--nav-muted)]">
          행동별 경고 민감도
        </h3>
        <span className="text-xs font-semibold text-[var(--nav-subtle)]">3-10</span>
      </div>
      {warningMessage ? (
        <div className="mb-3 flex min-w-0 items-start gap-2 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-sm font-semibold text-[#9a3412]">
          <Warning className="mt-0.5 shrink-0" size={18} weight="fill" />
          <span className="min-w-0 leading-relaxed">{warningMessage}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-[var(--nav-border)] bg-[var(--nav-panel)] p-3 max-sm:grid-cols-1">
        {REPORT_BEHAVIOR_TYPES.map((behaviorType) => {
          const label = getBehaviorLabel(behaviorType)
          const selectedValue = value[behaviorType] ?? DEFAULT_BEHAVIOR_WARNING_SENSITIVITY[behaviorType]

          return (
            <div
              key={behaviorType}
              className="grid min-w-0 grid-cols-[minmax(5.6rem,1fr)_auto] items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-[rgb(16_24_40/0.05)]"
            >
              <span className="min-w-0 truncate text-sm font-bold text-[var(--nav-ink)]" title={label}>{label}</span>
              <div className="grid grid-cols-[2rem_2.25rem_2rem] items-center overflow-hidden rounded-full bg-[var(--nav-surface-raised)] p-1 ring-1 ring-[var(--nav-border)]">
                <button
                  aria-label={`${label} 민감도 낮추기`}
                  className="grid min-h-8 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] disabled:opacity-35"
                  disabled={selectedValue <= 3}
                  type="button"
                  onClick={() => setSensitivity(behaviorType, selectedValue - 1)}
                >
                  <Minus size={14} weight="bold" />
                </button>
                <output
                  aria-label={`${label} 민감도 값`}
                  className={[
                    'grid min-h-8 place-items-center rounded-full text-sm font-bold',
                    selectedValue <= 4 ? 'bg-[#fff7ed] text-[#c2410c]' : 'bg-white text-[var(--nav-primary)]',
                  ].join(' ')}
                >
                  {selectedValue}
                </output>
                <button
                  aria-label={`${label} 민감도 높이기`}
                  className="grid min-h-8 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] disabled:opacity-35"
                  disabled={selectedValue >= 10}
                  type="button"
                  onClick={() => setSensitivity(behaviorType, selectedValue + 1)}
                >
                  <Plus size={14} weight="bold" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function clampBehaviorWarningSensitivity(value: number): BehaviorWarningSensitivityValue {
  return Math.min(10, Math.max(3, Math.round(value))) as BehaviorWarningSensitivityValue
}

function normalizeProfileForm(form: ProfileCreateRequest): ProfileCreateRequest {
  return {
    ...form,
    agentCallName: form.agentCallName.trim(),
    behaviorWarningSensitivity: normalizeBehaviorWarningSensitivity(form.behaviorWarningSensitivity),
    displayName: form.displayName.trim(),
    guidanceVolume: Number(form.guidanceVolume),
    reportEmail: normalizeOptionalProfileText(form.reportEmail),
    ttsSpeed: Number(form.ttsSpeed),
    ttsVoiceId: normalizeOptionalProfileText(form.ttsVoiceId),
  }
}

function createProfileFormFromProfile(profile: Profile): ProfileCreateRequest {
  return {
    displayName: profile.displayName,
    agentCallName: profile.agentCallName,
    reportEmail: profile.reportEmail,
    agentPersonality: profile.agentPersonality,
    behaviorWarningSensitivity: normalizeBehaviorWarningSensitivity(profile.behaviorWarningSensitivity),
    ttsVoiceId: profile.ttsVoiceId,
    ttsSpeed: profile.ttsSpeed,
    guidanceVolume: profile.guidanceVolume,
  }
}

function normalizeBehaviorWarningSensitivity(
  value: Partial<ProfileCreateRequest['behaviorWarningSensitivity']> | Record<string, unknown> | undefined,
): ProfileCreateRequest['behaviorWarningSensitivity'] {
  return REPORT_BEHAVIOR_TYPES.reduce<ProfileCreateRequest['behaviorWarningSensitivity']>(
    (result, behaviorType) => ({
      ...result,
      [behaviorType]: normalizeBehaviorWarningSensitivityValue(
        value?.[behaviorType] ?? DEFAULT_BEHAVIOR_WARNING_SENSITIVITY[behaviorType],
      ),
    }),
    { ...DEFAULT_BEHAVIOR_WARNING_SENSITIVITY },
  )
}

function normalizeBehaviorWarningSensitivityValue(value: unknown): BehaviorWarningSensitivityValue {
  if (value === 'LOW') {
    return 4
  }
  if (value === 'MEDIUM') {
    return 7
  }
  if (value === 'HIGH') {
    return 9
  }
  return typeof value === 'number'
    ? clampBehaviorWarningSensitivity(value)
    : 7
}

function createSavedPlaceQuickItems(data: Awaited<ReturnType<typeof listSavedPlaces>> | undefined): SavedPlaceQuickItem[] {
  if (!data) {
    return []
  }

  return [
    data.fixedPlaces.home,
    data.fixedPlaces.work,
    data.fixedPlaces.school,
    ...data.favorites,
  ].flatMap((place) => (
    place ? [savedPlaceToQuickItem(place)] : []
  ))
}

function savedPlaceToQuickItem(savedPlace: SavedPlaceSummary): SavedPlaceQuickItem {
  return {
    id: savedPlace.id,
    name: savedPlace.label,
    address: savedPlace.address,
    coordinate: {
      lat: savedPlace.latitude,
      lng: savedPlace.longitude,
    },
    placeType: savedPlace.placeType,
    targetField: getSavedPlaceTargetField(savedPlace),
  }
}

function getSavedPlaceTargetField(savedPlace: SavedPlaceSummary): SearchFieldId {
  if (savedPlace.providerPlaceId?.startsWith('origin:')) {
    return 'origin'
  }

  if (savedPlace.providerPlaceId?.startsWith('destination:')) {
    return 'destination'
  }

  return savedPlace.placeType === 'HOME' ? 'origin' : 'destination'
}

function createSavedPlacePayload(field: SearchFieldId, place: Place): SavedPlaceWriteRequest {
  return {
    label: place.name,
    provider: 'TMAP',
    providerPlaceId: `${field}:${place.id}`,
    address: place.address,
    latitude: place.coordinate.lat,
    longitude: place.coordinate.lng,
  }
}

function createSearchHistoryPayload(query: string, place: Place): SearchHistoryCreateRequest {
  return {
    query,
    provider: 'TMAP',
    providerPlaceId: place.id,
    placeName: place.name,
    address: place.address,
    latitude: place.coordinate.lat,
    longitude: place.coordinate.lng,
  }
}

function createSearchHistoryPlaces(items: SearchHistoryItem[]): Place[] {
  return items.flatMap((item) => {
    if (item.latitude === null || item.longitude === null) {
      return []
    }

    return [{
      id: `search-history-${item.id}`,
      name: item.placeName || item.query,
      address: item.address || item.query,
      coordinate: {
        lat: item.latitude,
        lng: item.longitude,
      },
    }]
  })
}

function normalizeOptionalProfileText(value: string | null) {
  const normalized = value?.trim() ?? ''

  return normalized ? normalized : null
}

export function DriverVideoPanel({
  allowVideoSelection = true,
  emptyDescription = '로컬 영상 파일은 브라우저에서만 재생됩니다.',
  emptyTitle = '운전자 영상을 선택하세요',
  error,
  fileName,
  motionTiming,
  source,
  onError,
  onSelectVideo,
}: {
  allowVideoSelection?: boolean
  emptyDescription?: string
  emptyTitle?: string
  error: boolean
  fileName?: string
  motionTiming: MotionTiming
  source?: DriverVideoSource
  onError: () => void
  onSelectVideo?: (file: File) => void
}) {
  // Driver monitoring video playback surface for the top cockpit layout.
  const videoInputId = 'driver-video-file-input'
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!source || !videoRef.current) {
      return undefined
    }

    const player = new Plyr(videoRef.current, {
      controls: [
        'play-large',
        'play',
        'progress',
        'current-time',
        'duration',
        'mute',
        'volume',
        'settings',
        'pip',
        'fullscreen',
      ],
      settings: ['speed'],
      speed: {
        selected: 1,
        options: [0.5, 0.75, 1, 1.25, 1.5, 2],
      },
    })

    return () => {
      player.destroy()
    }
  }, [source])

  const openVideoFilePicker = useCallback(() => {
    if (allowVideoSelection && onSelectVideo) {
      videoInputRef.current?.click()
    }
  }, [allowVideoSelection, onSelectVideo])

  return (
    <motion.section
      aria-label="운전자 영상"
      className="driver-video-player-surface relative col-start-1 row-start-1 flex h-full min-h-0 items-center justify-center overflow-hidden rounded-[1.1rem] border border-white/10 bg-black text-white shadow-[0_18px_46px_rgb(0_0_0/0.28)]"
      data-testid="driver-video-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => {
        if (!source) {
          openVideoFilePicker()
        }
      }}
      transition={motionTiming}
    >
      {source ? (
        <video
          key={source.url}
          ref={videoRef}
          className="h-full w-full bg-black object-contain [--plyr-color-main:#2563eb] [--plyr-control-radius:0.55rem] [--plyr-video-background:#000]"
          controls
          data-testid="driver-video-player"
          onClick={(event) => event.stopPropagation()}
          onError={onError}
          playsInline
          title={fileName ?? '운전자 영상'}
        >
          <source src={source.url} type={source.type} />
        </video>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-white/10 text-white">
            <FileVideo className="size-7" weight="duotone" />
          </div>
          <div>
            <p className="text-base font-bold">{emptyTitle}</p>
            <p className="mt-1 text-sm font-medium text-white/62">
              {emptyDescription}
            </p>
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 flex max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-black/58 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
        <span className="min-w-0 truncate">{fileName ?? '선택된 영상 없음'}</span>
        {error ? <span className="shrink-0 text-[#fda4af]">재생 오류</span> : null}
      </div>

      {allowVideoSelection && onSelectVideo ? (
        <input
          accept="video/*"
          aria-label="운전자 영상 파일 선택"
          className="sr-only"
          id={videoInputId}
          ref={videoInputRef}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            if (file) {
              onSelectVideo(file)
              event.currentTarget.value = ''
            }
          }}
          type="file"
        />
      ) : null}
      {!source && allowVideoSelection && onSelectVideo ? (
        <label
          className="absolute right-4 top-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#101828] shadow-[0_8px_18px_rgb(0_0_0/0.18)] transition hover:bg-[#eef2ff] focus-within:ring-2 focus-within:ring-white/70"
          htmlFor={videoInputId}
          onClick={(event) => event.stopPropagation()}
        >
          <UploadSimple className="size-4" weight="bold" />
          <span>영상 선택</span>
          <span className="sr-only">운전자 영상 파일 선택</span>
        </label>
      ) : null}
    </motion.section>
  )
}

function RoadieOrbControl({
  assistantStep,
  hidden,
  musicRecommendationLoading,
  musicRecommendationTrack,
  motionTiming,
  onClose,
  onRecommendationAction,
  onWakeCall,
  profileName,
  reducedMotion,
}: {
  assistantStep: RoadieAssistantStep
  hidden: boolean
  musicRecommendationLoading: boolean
  musicRecommendationTrack: UiMusicTrack
  motionTiming: MotionTiming
  onClose: () => void
  onRecommendationAction: (recommendation: RoadieAssistantRecommendation) => void
  onWakeCall: () => void
  profileName: string | null
  reducedMotion: boolean
}) {
  const expanded = assistantStep.mode !== 'idle'
  const visibleOrbState = getAssistantVisibleOrbState(assistantStep)
  const showVoiceWave = isAssistantVoiceWaveVisible(assistantStep)
  const contentRevealDelay = assistantStep.text || assistantStep.userText
    ? 0
    : ROADIE_ASSISTANT_CONTENT_REVEAL_DELAY_SECONDS
  const speechText = assistantStep.text ?? assistantStep.userText ?? ''
  const speakerRole = assistantStep.text ? 'assistant' : assistantStep.userText ? 'user' : null
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (
      hidden
      || !expanded
      || !speechText
      || !speakerRole
      || typeof Audio === 'undefined'
      || typeof URL.createObjectURL !== 'function'
    ) {
      return undefined
    }

    const controller = new AbortController()
    let disposed = false

    const revokeAudioUrl = () => {
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current)
        audioUrlRef.current = null
      }
    }

    audioRef.current?.pause()
    audioRef.current = null

    void synthesizeVoice(
      {
        text: speechText,
        speakerRole,
        profileName,
      },
      undefined,
      controller.signal,
    )
      .then((audioBlob) => {
        if (disposed) {
          return
        }

        revokeAudioUrl()
        const audioUrl = URL.createObjectURL(audioBlob)
        audioUrlRef.current = audioUrl

        const audio = new Audio(audioUrl)
        audioRef.current = audio
        void audio.play().catch(() => undefined)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      controller.abort()
      audioRef.current?.pause()
      audioRef.current = null
      revokeAudioUrl()
    }
  }, [expanded, hidden, profileName, speakerRole, speechText])

  if (hidden) {
    return null
  }

  return (
    <div
      aria-label="로디 AI 에이전트"
      className="pointer-events-none absolute bottom-[calc(43px+0.75rem)] right-6 top-6 z-40 flex min-h-0 items-start justify-end text-center text-[var(--nav-ink)] max-sm:bottom-[calc(37px+0.75rem)] max-sm:right-3 max-sm:top-3"
    >
      <motion.div
        className="pointer-events-none relative flex max-h-full min-h-0 flex-col self-start overflow-hidden"
        data-testid={expanded ? 'roadie-assistant-panel' : undefined}
        initial={false}
        animate={{
          borderRadius: expanded ? 20 : 999,
          height: expanded
            ? assistantStep.recommendations?.length ? 'auto' : 328
            : 132,
          opacity: 1,
          width: getRoadieAssistantPanelWidth({
            expanded,
            hasRecommendations: Boolean(assistantStep.recommendations?.length),
          }),
        }}
        transition={{
          borderRadius: {
            delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
            duration: motionTiming.duration === 0 ? 0 : 0.34,
            ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
          },
          height: {
            delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
            duration: motionTiming.duration === 0 ? 0 : 0.34,
            ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
          },
          opacity: motionTiming,
          width: {
            delay: expanded && motionTiming.duration !== 0 ? 0.1 : 0,
            duration: motionTiming.duration === 0 ? 0 : 0.34,
            ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
          },
        }}
      >
        <motion.div
          aria-hidden="true"
          className="roadie-assistant-aura absolute inset-0 rounded-[inherit]"
          data-testid="roadie-assistant-aura"
          initial={false}
          animate={{
            opacity: expanded ? 1 : 0,
            boxShadow: expanded
              ? '0 18px 46px rgba(16, 24, 40, 0.16), 0 18px 54px rgba(109, 93, 246, 0.18)'
              : '0 18px 46px rgba(16, 24, 40, 0)',
          }}
          transition={{
            delay: expanded && motionTiming.duration !== 0 ? 0.12 : 0,
            duration: motionTiming.duration === 0 ? 0 : 0.2,
            ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
          }}
        />
        {expanded ? (
          <motion.button
            aria-label="로디 AI 에이전트 닫기"
            className="pointer-events-auto absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-ai-primary)]"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              ...motionTiming,
              delay: motionTiming.duration === 0 ? 0 : 0.26,
              duration: motionTiming.duration === 0 ? 0 : 0.16,
            }}
            onClick={onClose}
            type="button"
          >
            <X className="size-4" weight="bold" />
          </motion.button>
        ) : (
          <button
            aria-label="로디 호출"
            className="pointer-events-auto absolute right-0 top-0 z-10 size-[8.25rem] rounded-full bg-transparent outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--nav-ai-secondary)]"
            data-testid="roadie-orb-control"
            onClick={onWakeCall}
            type="button"
          >
            <span className="sr-only">로디 음성 어시스턴트 호출</span>
          </button>
        )}
        <motion.div
          className="relative flex h-full min-h-0 flex-col"
        >
          <motion.div
            className="absolute grid place-items-center overflow-visible"
            data-testid="roadie-assistant-orb-slot"
            animate={{
              left: expanded ? '50%' : '100%',
              top: expanded ? 28 : 0,
              x: expanded ? '-50%' : '-100%',
            }}
            style={{
              height: ROADIE_ASSISTANT_PANEL_ORB_SIZE,
              width: ROADIE_ASSISTANT_PANEL_ORB_SIZE,
            }}
            transition={{
              ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
              duration: motionTiming.duration === 0 ? 0 : 0.34,
            }}
          >
            {/* Project-local orb contract: docs/assistant/orb.md */}
            <VoiceOrb
              className="pointer-events-none [&_canvas]:mx-auto [&_canvas]:block"
              colorTheme={NAVI_ORB_THEME}
              energy={assistantStep.energy}
              reducedMotion={reducedMotion}
              size={NAVI_ORB_CONTROL_SIZE}
              state={visibleOrbState}
            />
          </motion.div>
          {expanded ? (
            <div
              className="relative z-[1] flex min-h-0 flex-1 flex-col items-center overflow-hidden px-5 pb-5 pt-[12rem]"
              data-testid="roadie-assistant-content"
            >
              <motion.div
                className="flex min-h-25 w-full shrink-0 flex-col items-center"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  ...motionTiming,
                  delay: motionTiming.duration === 0 ? 0 : contentRevealDelay,
                  duration: motionTiming.duration === 0 ? 0 : 0.18,
                }}
              >
                <div className="flex h-5 items-center justify-center">
                  {assistantStep.statusLabel ? (
                    <div className="text-sm font-bold text-[var(--nav-ai-primary)]">{assistantStep.statusLabel}</div>
                  ) : showVoiceWave ? (
                    <VoiceWave
                      active
                      className="pointer-events-none"
                      colorTheme={NAVI_ORB_THEME}
                      energy={assistantStep.energy}
                      reducedMotion={reducedMotion}
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex min-h-[4.5rem] w-full items-center justify-center">
                  {assistantStep.userText ? (
                    <AssistantUserText
                      animateWords={assistantStep.mode === 'user-listening'}
                      motionTiming={motionTiming}
                      reducedMotion={reducedMotion}
                      text={assistantStep.userText}
                    />
                  ) : null}
                  {assistantStep.text ? (
                    <AssistantSpeechText
                      motionTiming={motionTiming}
                      reducedMotion={reducedMotion}
                      text={assistantStep.text}
                    />
                  ) : null}
                </div>
              </motion.div>
              <AnimatePresence initial={false}>
                {assistantStep.recommendations?.length ? (
                  <AssistantRecommendationList
                    motionTiming={motionTiming}
                    musicRecommendationLoading={musicRecommendationLoading}
                    musicRecommendationTrack={musicRecommendationTrack}
                    onRecommendationAction={onRecommendationAction}
                    recommendations={assistantStep.recommendations}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </div>
  )
}

function AssistantSpeechText({
  motionTiming,
  reducedMotion,
  text,
}: {
  motionTiming: MotionTiming
  reducedMotion: boolean
  text: string
}) {
  if (reducedMotion || motionTiming.duration === 0) {
    return (
      <p className="max-w-[17rem] text-pretty text-xl font-bold leading-8 tracking-normal">
        {text}
      </p>
    )
  }

  return (
    <p
      aria-label={text}
      className="max-w-[17rem] text-pretty text-xl font-bold leading-8 tracking-normal"
      data-testid="roadie-assistant-speech-text"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {Array.from(text).map((character, index) => (
          <motion.span
            className="inline-block whitespace-pre-wrap"
            initial={{ opacity: 0, y: 7, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            key={`${character}-${index}`}
            transition={{
              delay: getAssistantSpeechCharacterDelaySeconds(index),
              duration: 0.18,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {character}
          </motion.span>
        ))}
      </span>
    </p>
  )
}

function AssistantUserText({
  animateWords,
  motionTiming,
  reducedMotion,
  text,
}: {
  animateWords: boolean
  motionTiming: MotionTiming
  reducedMotion: boolean
  text: string
}) {
  if (!animateWords || reducedMotion || motionTiming.duration === 0) {
    return (
      <p
        aria-label={text}
        className="max-w-[16rem] text-pretty text-xl font-bold leading-8 tracking-normal"
        data-testid="roadie-assistant-user-text"
      >
        {text}
      </p>
    )
  }

  const words = text.split(/(\s+)/)

  return (
    <p
      aria-label={text}
      className="max-w-[16rem] text-pretty text-xl font-bold leading-8 tracking-normal"
      data-testid="roadie-assistant-user-text"
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => {
          const visibleWordIndex = words.slice(0, index).filter((part) => part.trim()).length
          const isSpace = !word.trim()

          return (
            <span
              className={[
                'inline-block whitespace-pre-wrap',
                isSpace ? '' : 'roadie-assistant-user-word',
              ].join(' ')}
              key={`${word}-${index}`}
              style={{
                '--roadie-assistant-user-word-delay': `${visibleWordIndex * ROADIE_ASSISTANT_USER_WORD_STAGGER_SECONDS}s`,
              } as CSSProperties}
            >
              {word}
            </span>
          )
        })}
      </span>
    </p>
  )
}

function AssistantRecommendationList({
  musicRecommendationLoading,
  musicRecommendationTrack,
  motionTiming,
  onRecommendationAction,
  recommendations,
}: {
  musicRecommendationLoading: boolean
  musicRecommendationTrack: UiMusicTrack
  motionTiming: MotionTiming
  onRecommendationAction: (recommendation: RoadieAssistantRecommendation) => void
  recommendations: RoadieAssistantRecommendation[]
}) {
  const completedRecommendation = recommendations.length === 1 && recommendations[0]?.action === '확인'
  const selectedRouteRecommendation = recommendations.length === 1
    && recommendations[0]?.type === 'place'
    && recommendations[0].title.includes('경로 변경')
  const messagePreviewRecommendation = recommendations.length === 1
    && recommendations[0]?.type === 'action'
    && recommendations[0].title.includes('보낼 메시지')
  const scrollsWithinPanel = !(completedRecommendation || selectedRouteRecommendation || messagePreviewRecommendation)
  const recommendationCount = recommendations.reduce((count, item) => {
    if (item.type !== 'place') {
      return count + 1
    }

    if (item.title.includes('경로 변경')) {
      return count + 1
    }

    return count + getRouteRecommendationDisplay(item).options.length
  }, 0)

  return (
    <motion.div
      className={[
        'pointer-events-auto mt-2 flex min-h-0 w-full flex-col overflow-hidden rounded-2xl',
        scrollsWithinPanel ? 'shrink' : 'shrink-0',
        messagePreviewRecommendation ? 'bg-transparent' : 'bg-[var(--nav-panel)]',
      ].join(' ')}
      data-testid="roadie-assistant-recommendations"
      exit={{ opacity: 0, height: 0, y: 8 }}
      initial={{ opacity: 0, height: 0, y: 8 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      transition={{
        ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1],
        duration: motionTiming.duration === 0 ? 0 : 0.28,
      }}
    >
      {completedRecommendation || selectedRouteRecommendation || messagePreviewRecommendation ? null : (
        <div className="flex items-center justify-between px-4 py-3 text-left">
          <h3 className="text-sm font-bold tracking-normal">추천</h3>
          <span className="text-xs font-semibold text-[var(--nav-muted)]">{recommendationCount}개</span>
        </div>
      )}
      <div
        className={[
          'min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain',
          completedRecommendation || selectedRouteRecommendation ? 'px-3 py-3' : messagePreviewRecommendation ? 'px-0 py-0' : 'shrink px-3 pb-3',
        ].join(' ')}
        data-testid="roadie-assistant-recommendations-scroll"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="grid gap-2">
          {recommendations.map((item, index) => (
            <motion.div
              className={[
                completedRecommendation
                  ? 'text-left'
                  : item.type === 'place' || item.type === 'music'
                    ? 'rounded-xl bg-white p-2 text-left'
                    : 'flex items-center gap-3 rounded-xl bg-white p-3 text-left',
              ].join(' ')}
              key={`${item.type}-${item.title}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...motionTiming,
                delay: motionTiming.duration === 0 ? 0 : index * 0.035,
                duration: motionTiming.duration === 0 ? 0 : 0.18,
              }}
            >
              {item.type === 'place' ? (
                selectedRouteRecommendation ? (
                  <AssistantSelectedRouteCard
                    recommendation={item}
                  />
                ) : (
                  <AssistantRouteRecommendationCard
                    recommendation={item}
                    onAction={() => onRecommendationAction(item)}
                  />
                )
              ) : item.type === 'music' ? (
                <AssistantMusicRecommendationCard loading={musicRecommendationLoading} track={musicRecommendationTrack} />
              ) : item.title.includes('보낼 메시지') ? (
                <AssistantMessagePreviewCard recommendation={item} />
              ) : completedRecommendation ? (
                <AssistantCompletionCard recommendation={item} />
              ) : (
                <>
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]">
                    <ArrowBendUpRight className="size-5" weight="bold" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{item.title}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-primary)]">{item.meta}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-4 text-[var(--nav-muted)]">{item.detail}</div>
                  </div>
                  <button
                    className="shrink-0 rounded-full bg-[var(--nav-primary)] px-3 py-2 text-xs font-bold text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
                    onClick={() => onRecommendationAction(item)}
                    type="button"
                  >
                    {item.action}
                  </button>
                </>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function AssistantMusicRecommendationCard({
  loading,
  track,
}: {
  loading: boolean
  track: UiMusicTrack
}) {
  if (loading) {
    return <MusicRecommendationLoadingCard />
  }

  return (
    <div
      className="grid min-h-[4.75rem] grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-[var(--nav-border)] bg-white px-3 py-2 text-left shadow-[0_10px_24px_rgb(15_23_42/0.06)]"
      data-testid="roadie-assistant-music-recommendation-card"
    >
      <MusicCover track={track} className="size-13 rounded-xl" iconClassName="size-5" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-[var(--nav-ink)]">{track.title}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--nav-muted)]">{track.artist}</span>
        <span className="mt-1 block truncate text-[11px] font-medium text-[var(--nav-subtle)]">{track.album}</span>
      </span>
      <span className="grid justify-items-end">
        <span className="text-xs font-bold text-[var(--nav-ink)]">{track.duration}</span>
      </span>
    </div>
  )
}

function MusicRecommendationLoadingCard() {
  return (
    <div
      aria-label="추천 음악을 불러오는 중"
      className="flex min-h-[4.75rem] items-center gap-3 rounded-2xl border border-[var(--nav-border)] bg-white px-3 py-2 text-left shadow-[0_10px_24px_rgb(15_23_42/0.06)]"
      data-testid="music-recommendation-loading"
      role="status"
    >
      <span className="grid size-13 shrink-0 place-items-center rounded-xl bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]">
        <CircleNotch className="size-5 animate-spin" weight="bold" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-[var(--nav-ink)]">추천 음악을 찾는 중</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--nav-muted)]">실제 음악 정보를 불러오고 있습니다.</span>
      </span>
    </div>
  )
}

function AssistantMessagePreviewCard({
  recommendation,
}: {
  recommendation: Extract<RoadieAssistantRecommendation, { type: 'action' }>
}) {
  return (
    <div
      className="rounded-2xl bg-white px-4 py-3 text-left shadow-[0_10px_24px_rgb(15_23_42/0.06)]"
      data-testid="roadie-assistant-message-preview-card"
    >
      <p className="text-sm font-semibold leading-5 text-[var(--nav-ink)]">
        {recommendation.detail}
      </p>
    </div>
  )
}

function AssistantSelectedRouteCard({
  recommendation,
}: {
  recommendation: Extract<RoadieAssistantRecommendation, { type: 'place' }>
}) {
  const route = getSelectedRouteDisplay(recommendation)

  return (
    <div
      aria-label={`${route.destinationLabel} ${route.primaryAction}`}
      className="relative grid min-h-[3.625rem] grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-2xl border border-[var(--nav-primary)] bg-white px-3 py-2 text-left shadow-[0_12px_28px_rgb(23_70_162/0.14)]"
      data-testid="roadie-assistant-selected-route-card"
      role="status"
    >
      <span
        aria-hidden="true"
        className="absolute right-3 top-3 size-2 rounded-full bg-[var(--nav-primary)] shadow-[0_0_0_4px_rgb(23_70_162/0.10)]"
      />
      <span className="min-w-0">
        <span className="flex items-baseline gap-0.5 text-[var(--nav-ink)]">
          <span className="text-2xl font-semibold leading-none">{route.durationValue}</span>
          <span className="text-sm font-bold leading-none">{route.durationUnit}</span>
        </span>
        <span className="mt-1 block truncate text-xs font-semibold text-[var(--nav-muted)]">{route.distanceLabel}</span>
      </span>
      <span className="min-w-0 pr-1">
        <span className="block truncate text-[0.9375rem] font-bold leading-5 text-[var(--nav-primary)]">{route.destinationLabel}</span>
        <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--nav-muted)]">{route.distanceLabel} · {route.tollLabel}</span>
      </span>
      <span className="absolute bottom-2 right-3 text-xs font-bold text-[var(--nav-primary)]">
        {route.primaryAction}
      </span>
    </div>
  )
}

function AssistantCompletionCard({
  recommendation,
}: {
  recommendation: Extract<RoadieAssistantRecommendation, { type: 'action' }>
}) {
  const message = recommendation.title.includes('경로')
    || recommendation.meta.includes('경로')
    || recommendation.detail.includes('경로')
    ? '안내 경로가 적용되었습니다.'
    : recommendation.detail

  return (
    <div
      className="flex items-center gap-2 px-1 py-0.5 text-left"
      data-testid="roadie-assistant-completion-card"
      role="status"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]">
        <Check className="size-4" weight="bold" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold leading-5 text-[var(--nav-ink)]">{message}</span>
      </span>
    </div>
  )
}

function AssistantRouteRecommendationCard({
  recommendation,
  onAction,
}: {
  recommendation: Extract<RoadieAssistantRecommendation, { type: 'place' }>
  onAction: () => void
}) {
  const route = getRouteRecommendationDisplay(recommendation)

  return (
    <div className="grid gap-1.5" data-testid="roadie-assistant-route-recommendation">
      {route.options.map((option) => (
        <button
          aria-label={`${option.destinationLabel} ${route.primaryAction}`}
          className={[
            'relative grid min-h-[3.625rem] grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
            option.active
              ? 'border-[var(--nav-primary)] bg-white shadow-[0_12px_28px_rgb(23_70_162/0.14)]'
              : 'border-[var(--nav-border)] bg-white/90 hover:border-[var(--nav-primary-soft)] hover:bg-white',
          ].join(' ')}
          key={option.label}
          onClick={onAction}
          type="button"
        >
          {option.active ? (
            <span
              aria-hidden="true"
              className="absolute right-3 top-3 size-2 rounded-full bg-[var(--nav-primary)] shadow-[0_0_0_4px_rgb(23_70_162/0.10)]"
            />
          ) : null}
          <span className="min-w-0">
            <span className="flex items-baseline gap-0.5 text-[var(--nav-ink)]">
              <span className="text-2xl font-semibold leading-none">{option.durationValue}</span>
              <span className="text-sm font-bold leading-none">{option.durationUnit}</span>
            </span>
            <span className="mt-1 block truncate text-xs font-semibold text-[var(--nav-muted)]">{option.distanceLabel}</span>
          </span>
          <span className="min-w-0 pr-3">
            <span className={['block truncate text-[0.9375rem] font-bold leading-5', option.active ? 'text-[var(--nav-primary)]' : 'text-[var(--nav-ink)]'].join(' ')}>
              {option.destinationLabel}
            </span>
            <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--nav-muted)]">{option.tollLabel}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function getRouteRecommendationDisplay(recommendation: Extract<RoadieAssistantRecommendation, { type: 'place' }>) {
  if (recommendation.detail.includes('휴게소') || recommendation.detail.includes('졸음쉼터') || recommendation.detail.includes('경로 인근')) {
    return {
      primaryAction: '경유지 추가',
      options: [
        { label: '추천 경로', destinationLabel: '신탄진 졸음쉼터(부산방향)', durationValue: '18', durationUnit: '분', distanceLabel: '21.4km', tollLabel: '통행료 0원', active: true },
        { label: '휴게소 경유', destinationLabel: '죽암휴게소(부산방향)', durationValue: '27', durationUnit: '분', distanceLabel: '34.8km', tollLabel: '통행료 0원', active: false },
        { label: '장거리 휴식', destinationLabel: '망향휴게소(부산방향)', durationValue: '42', durationUnit: '분', distanceLabel: '63.1km', tollLabel: '통행료 0원', active: false },
      ],
    }
  }

  if (recommendation.title.includes('경로')) {
    return {
      primaryAction: '안내 시작',
      options: [
        { label: '추천 경로', destinationLabel: getRouteDestinationLabel(recommendation), durationValue: '4', durationUnit: '분', distanceLabel: '2.4km', tollLabel: '통행료 0원', active: true },
        { label: '최단 거리 경로', destinationLabel: getRouteDestinationLabel(recommendation), durationValue: '6', durationUnit: '분', distanceLabel: '2.1km', tollLabel: '통행료 0원', active: false },
        { label: '안전 우선 경로', destinationLabel: getRouteDestinationLabel(recommendation), durationValue: '8', durationUnit: '분', distanceLabel: '3.6km', tollLabel: '통행료 0원', active: false },
      ],
    }
  }

  return {
    primaryAction: '안내 시작',
    options: [
      { label: '추천 경로', destinationLabel: '신탄진 졸음쉼터(부산방향)', durationValue: '18', durationUnit: '분', distanceLabel: '21.4km', tollLabel: '통행료 0원', active: true },
      { label: '휴게소 경유', destinationLabel: '죽암휴게소(부산방향)', durationValue: '27', durationUnit: '분', distanceLabel: '34.8km', tollLabel: '통행료 0원', active: false },
      { label: '장거리 휴식', destinationLabel: '망향휴게소(부산방향)', durationValue: '42', durationUnit: '분', distanceLabel: '63.1km', tollLabel: '통행료 0원', active: false },
    ],
  }
}

function getSelectedRouteDisplay(_recommendation: Extract<RoadieAssistantRecommendation, { type: 'place' }>) {
  return {
    destinationLabel: '신탄진 졸음쉼터(부산방향)',
    durationValue: '18',
    durationUnit: '분',
    distanceLabel: '21.4km',
    tollLabel: '통행료 0원',
    primaryAction: '안내 중',
  }
}

function getRouteDestinationLabel(recommendation: Extract<RoadieAssistantRecommendation, { type: 'place' }>) {
  const source = `${recommendation.title} ${recommendation.detail}`

  if (source.includes('졸음쉼터')) {
    return '신탄진 졸음쉼터(부산방향)'
  }

  if (source.includes('휴게소')) {
    return '죽암휴게소(부산방향)'
  }

  const destinationMatch = source.match(/([^\s.]+?)(?:로|으로) 안내/)
  const destination = destinationMatch?.[1]?.trim()

  return destination || recommendation.meta
}

export function createDemoAssistantStep(
  state: DemoScenarioControllerState,
  profileName: string | null,
): RoadieAssistantStep {
  const setupEvent = state.setupEvent
  const scenarioEvent = state.scenarioEvent
  const recommendations = scenarioEvent ? getDemoScenarioRecommendations(scenarioEvent) : undefined

  if (setupEvent) {
    return {
      id: setupEvent.id,
      label: setupEvent.title,
      mode: 'idle',
      orbState: 'idle',
      energy: 0,
    }
  }

  if (scenarioEvent?.userSpeech) {
    return {
      id: scenarioEvent.id,
      label: scenarioEvent.uiState.visibleStatus,
      mode: 'user-listening',
      orbState: 'listening',
      energy: 0.72,
      statusLabel: '듣는 중...',
      userText: scenarioEvent.userSpeech,
    }
  }

  if (scenarioEvent?.roadieMessage) {
    return {
      id: scenarioEvent.id,
      label: scenarioEvent.uiState.visibleStatus,
      mode: 'assistant-speaking',
      orbState: scenarioEvent.eventType === 'ACTION_COMPLETED'
        ? 'success'
        : 'speaking',
      energy: scenarioEvent.uiState.riskLevel === 'HIGH' ? 0.86 : 0.64,
      text: personalizeDemoRoadieMessage(scenarioEvent.roadieMessage, profileName),
      recommendations,
    }
  }

  return {
    id: scenarioEvent?.id ?? 'demo-idle',
    label: scenarioEvent?.uiState.visibleStatus ?? state.scenario.title,
    mode: 'idle',
    orbState: 'idle',
    energy: 0,
  }
}

export function advanceDemoScenarioForPresenter(
  state: DemoScenarioControllerState,
): DemoScenarioControllerState {
  let nextState = advanceDemoScenario(state)
  let guard = 0

  while (shouldSkipDemoPresenterState(nextState) && guard < 20) {
    nextState = advanceDemoScenario(nextState)
    guard += 1
  }

  return nextState
}

export function shouldCompleteDemoScenario(state: DemoScenarioControllerState) {
  return state.phase === 'ended' || state.scenarioEvent?.eventType === 'REPORT_READY'
}

export function shouldEndDemoDrive(state: DemoScenarioControllerState) {
  return state.phase === 'ended' || state.scenarioEvent?.eventType === 'SESSION_ENDED'
}

export function shouldOpenDemoReport(state: DemoScenarioControllerState) {
  return state.phase === 'ended' || state.scenarioEvent?.eventType === 'REPORT_READY'
}

function shouldSkipDemoPresenterState(state: DemoScenarioControllerState) {
  const event = state.scenarioEvent

  return Boolean(
    event &&
      !event.requiresResponse &&
      !event.userSpeech &&
      !event.roadieMessage &&
      ['정상 주행', '상태 확인 중'].includes(event.uiState.visibleStatus),
  )
}

function getDemoScenarioRecommendations(
  event: NonNullable<DemoScenarioControllerState['scenarioEvent']>,
): RoadieAssistantRecommendation[] | undefined {
  if (event.id === 'drowsy_rest_area_offer') {
    return [
      {
        type: 'place',
        title: '신탄진 졸음쉼터 안내',
        meta: '경부고속도로 부산방향',
        detail: '경로에서 가까운 신탄진 졸음쉼터를 찾았어요.',
        action: '안내 시작',
      },
    ]
  }

  if (event.id === 'drowsy_rest_area_guidance_started') {
    return [
      {
        type: 'place',
        title: '경로 변경 완료',
        meta: '신탄진 졸음쉼터(부산방향)',
        detail: '신탄진 졸음쉼터로 경로를 바꿨어요.',
        action: '확인',
      },
    ]
  }

  if (event.id === 'drowsy_window_started') {
    return [
      {
        type: 'action',
        title: '창문 살짝 열기',
        meta: '환기 보조',
        detail: '창문을 살짝 열어 차 안 공기를 환기합니다.',
        action: '확인',
      },
    ]
  }

  if (event.id === 'drowsy_music_started' || event.id === 'device_music_preview' || event.id === 'device_music_started') {
    return [
      {
        type: 'music',
        title: '조용한 플레이리스트',
        meta: '음악 추천',
        detail: '운전에 방해되지 않는 음악을 골랐어요.',
        action: '재생',
      },
    ]
  }

  if (event.id === 'phone_message_preview') {
    return [
      {
        type: 'action',
        title: '지우에게 보낼 메시지',
        meta: '문자 초안',
        detail: '운전 중이라 조금 뒤에 연락할게.',
        action: '보내기',
      },
    ]
  }

  if (event.id === 'phone_message_sent') {
    return [
      {
        type: 'action',
        title: '메시지 전송 완료',
        meta: '문자 전송',
        detail: '지우에게 메시지를 보냈습니다.',
        action: '확인',
      },
    ]
  }

  return undefined
}

export function personalizeDemoRoadieMessage(message: string, profileName: string | null): string {
  const callName = profileName?.trim() || '운전자'

  return message.split('{{profileName}}').join(callName)
}

function DemoScenarioSelection({
  motionTiming,
  profileName,
  onStartFreeNavigation,
  onStartScenario,
}: {
  motionTiming: MotionTiming
  profileName: string
  onStartFreeNavigation: () => void
  onStartScenario: (scenarioId: DemoScenarioId) => void
}) {
  return (
    <motion.div
      className="absolute inset-0 z-40 flex h-full flex-col bg-[var(--nav-frame)] px-7 py-6 text-[var(--nav-ink)]"
      data-testid="demo-scenario-selection"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="relative flex justify-center">
        <div className="max-w-[38rem] text-center">
          <h2 className="text-2xl font-black leading-tight">대표 위험행동 데모 선택</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--nav-muted)]">
            {profileName} 프로필 · Calibration 적용됨
          </p>
        </div>
        <button
          className="absolute right-0 top-0 h-11 rounded-xl bg-white px-4 text-sm font-bold text-[var(--nav-ink)] shadow-[0_10px_24px_rgb(15_23_42/0.10)] transition hover:bg-[var(--nav-selection)]"
          onClick={onStartFreeNavigation}
          type="button"
        >
          네비게이션 이용하기
        </button>
      </div>

      <div className="mx-auto mt-7 grid w-full max-w-[76rem] grid-cols-3 gap-3">
        {DEMO_SCENARIO_DEFINITIONS.map((scenario, index) => (
          <button
            key={scenario.scenarioId}
            className="group relative flex min-h-[14rem] overflow-hidden rounded-2xl border border-white/80 bg-white px-5 py-5 text-center shadow-[0_14px_32px_rgb(15_23_42/0.10)] transition hover:-translate-y-0.5 hover:border-[var(--nav-primary)] hover:shadow-[0_20px_44px_rgb(15_23_42/0.14)]"
            data-testid={`demo-scenario-card-${scenario.scenarioId}`}
            onClick={() => onStartScenario(scenario.scenarioId)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-[var(--nav-primary)] opacity-80"
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-4 text-5xl font-black leading-none text-[var(--nav-selection)] transition group-hover:text-[rgb(23_70_162/0.16)]"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="relative flex min-h-0 flex-1 flex-col items-center pt-12">
              <span className="text-lg font-black leading-6">{scenario.title}</span>
              <span className="mt-3 block max-w-[20rem] text-sm font-semibold leading-6 text-[var(--nav-muted)]">
                {scenario.description}
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-bold text-[var(--nav-primary)]">
                시작
                <CaretRight className="size-4 transition group-hover:translate-x-0.5" weight="bold" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function DemoScenarioPresenterPanel({
  motionTiming,
  profileName,
  routeOptionsReady,
  routeReady,
  state,
  onExit,
  onNext,
  onReset,
  onRespond,
}: {
  motionTiming: MotionTiming
  profileName: string | null
  routeOptionsReady: boolean
  routeReady: boolean
  state: DemoScenarioControllerState
  onExit: () => void
  onNext: () => void
  onReset: () => void
  onRespond: (responseValue: string) => void
}) {
  const currentSetupEvent = state.setupEvent
  const currentScenarioEvent = state.scenarioEvent
  const currentTitle = currentSetupEvent?.title ?? currentScenarioEvent?.uiState.visibleStatus ?? state.scenario.title
  const currentDescription = currentSetupEvent?.description
    ?? (currentScenarioEvent?.roadieMessage
      ? personalizeDemoRoadieMessage(currentScenarioEvent.roadieMessage, profileName)
      : undefined)
  const currentRiskLevel = currentScenarioEvent?.uiState.riskLevel ?? 'LOW'
  const showCurrentStepSummary = shouldShowDemoPresenterStepSummary(state)
  const nextDisabled = isDemoPresenterNextDisabled(state, routeOptionsReady, routeReady)
  const waitingText = getDemoPresenterWaitingText(state, routeOptionsReady, routeReady)

  return (
    <motion.section
      aria-label="데모 시나리오 진행 패널"
      className="col-start-2 row-start-2 self-start rounded-[1.1rem] border border-white/70 bg-white p-4 text-[var(--nav-ink)] shadow-[0_18px_46px_rgb(0_0_0/0.24)]"
      data-testid="demo-scenario-presenter-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="flex flex-col gap-4">
        <div className="border-b border-[var(--nav-border)] pb-3">
          <p className="text-sm font-bold">{state.scenario.title}</p>
          <p className="mt-1 text-xs font-semibold text-[var(--nav-muted)]">
            Presenter 진행 패널 · {getDemoScenarioProgressLabel(state)}
          </p>
        </div>

        {showCurrentStepSummary ? (
          <div className="rounded-xl bg-[var(--nav-panel)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[var(--nav-muted)]">현재 단계</div>
              <span className={getDemoRiskBadgeClassName(currentRiskLevel)}>
                {formatDemoRiskLevel(currentRiskLevel)}
              </span>
            </div>
            <div className="mt-2 text-base font-bold leading-6">{currentTitle}</div>
            {currentDescription ? (
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--nav-muted)]">
                {currentDescription}
              </p>
            ) : null}
            {waitingText ? (
              <p className="mt-2 text-xs font-bold text-[var(--nav-primary)]">{waitingText}</p>
            ) : null}
          </div>
        ) : null}

        {currentScenarioEvent?.requiresResponse ? (
          <div className="grid gap-2">
            {currentScenarioEvent.responseOptions.map((option) => (
              <button
                key={option.value}
                className="flex min-h-11 items-center justify-center rounded-xl bg-[var(--nav-primary)] px-3 text-sm font-bold text-white transition hover:bg-[var(--nav-primary-hover)]"
                onClick={() => onRespond(option.value)}
                type="button"
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <button
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--nav-primary)] px-3 text-sm font-bold text-white transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={nextDisabled}
            onClick={onNext}
            type="button"
          >
            <span>다음</span>
            <CaretRight className="size-4" weight="bold" />
          </button>
        )}

        <button
          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--nav-panel)] px-3 text-sm font-bold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)]"
          onClick={onReset}
          type="button"
        >
          <ArrowCounterClockwise className="size-4" weight="bold" />
          처음부터
        </button>
        <button
          className="flex h-11 items-center justify-center rounded-xl border border-[var(--nav-border)] bg-white px-3 text-sm font-bold text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
          onClick={onExit}
          type="button"
        >
          데모 선택으로
        </button>
      </div>
    </motion.section>
  )
}

function getDemoScenarioProgressLabel(state: DemoScenarioControllerState) {
  if (state.setupEvent) {
    return '주행 준비'
  }

  if (!state.scenarioEvent) {
    return '완료'
  }

  const index = state.scenario.events.findIndex((event) => event.id === state.scenarioEvent?.id)

  return `${Math.max(1, index + 1)} / ${state.scenario.events.length}`
}

function shouldShowDemoPresenterStepSummary(state: DemoScenarioControllerState) {
  if (state.setupEvent) {
    return true
  }

  const scenarioEvent = state.scenarioEvent
  if (!scenarioEvent) {
    return true
  }

  return !['정상 주행', '상태 확인 중'].includes(scenarioEvent.uiState.visibleStatus)
}

function isDemoPresenterNextDisabled(
  state: DemoScenarioControllerState,
  routeOptionsReady: boolean,
  routeReady: boolean,
) {
  if (state.phase === 'ended' || state.scenarioEvent?.requiresResponse) {
    return true
  }

  switch (state.setupEvent?.eventType) {
    case 'ROUTE_CANDIDATES_LOADED':
      return !routeOptionsReady
    case 'RECOMMENDED_ROUTE_SELECTED':
      return !routeOptionsReady
    case 'GUIDANCE_STARTED':
      return !routeReady
    default:
      return false
  }
}

function getDemoPresenterWaitingText(
  state: DemoScenarioControllerState,
  routeOptionsReady: boolean,
  routeReady: boolean,
) {
  if (state.setupEvent?.eventType === 'ROUTE_CANDIDATES_LOADED' && !routeOptionsReady) {
    return '경로 후보를 불러오는 중입니다.'
  }

  if (
    state.setupEvent?.eventType === 'GUIDANCE_STARTED' &&
    !routeReady
  ) {
    return '추천 경로 선택이 완료될 때까지 기다려주세요.'
  }

  return null
}

function formatDemoRiskLevel(riskLevel: 'LOW' | 'MEDIUM' | 'HIGH') {
  switch (riskLevel) {
    case 'HIGH':
      return '위험도 높음'
    case 'MEDIUM':
      return '위험도 중간'
    case 'LOW':
    default:
      return '위험도 낮음'
  }
}

function getDemoRiskBadgeClassName(riskLevel: 'LOW' | 'MEDIUM' | 'HIGH') {
  const baseClassName = 'rounded-full px-2 py-1 text-[0.68rem] font-black'

  switch (riskLevel) {
    case 'HIGH':
      return `${baseClassName} bg-red-100 text-red-700`
    case 'MEDIUM':
      return `${baseClassName} bg-amber-100 text-amber-700`
    case 'LOW':
    default:
      return `${baseClassName} bg-emerald-100 text-emerald-700`
  }
}

function RoadieAssistantDebugPanel({
  motionTiming,
  scenario,
  scenarioId,
  stepIndex,
  onNext,
  onPrevious,
  onReset,
  onSelectScenario,
}: {
  motionTiming: MotionTiming
  scenario: RoadieAssistantScenario
  scenarioId: RoadieAssistantScenarioId
  stepIndex: number
  onNext: () => void
  onPrevious: () => void
  onReset: () => void
  onSelectScenario: (scenarioId: RoadieAssistantScenarioId) => void
}) {
  const currentStep = scenario.steps[stepIndex]
  const progress = `${stepIndex + 1} / ${scenario.steps.length}`

  return (
    <motion.section
      aria-label="로디 AI 시나리오 디버그"
      className="col-start-2 row-start-2 self-start rounded-[1.1rem] border border-white/70 bg-white p-4 text-[var(--nav-ink)] shadow-[0_18px_46px_rgb(0_0_0/0.24)]"
      data-testid="roadie-assistant-debug-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="flex flex-col gap-4">
        <div className="border-b border-[var(--nav-border)] pb-3">
          <p className="text-sm font-bold">시나리오 디버깅</p>
          <p className="mt-1 text-xs font-semibold text-[var(--nav-muted)]">
            운전자 이상행동 안내 흐름을 단계별로 점검합니다.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <label
            className="text-xs font-bold text-[var(--nav-muted)]"
            htmlFor="roadie-assistant-scenario-select"
          >
            시나리오
          </label>
          <select
            aria-label="AI 시나리오 선택"
            className="h-11 min-w-0 rounded-xl bg-[var(--nav-panel)] px-3 text-sm font-bold text-[var(--nav-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-focus-ring)]"
            id="roadie-assistant-scenario-select"
            onChange={(event) => onSelectScenario(event.target.value as RoadieAssistantScenarioId)}
            value={scenarioId}
          >
            {ROADIE_ASSISTANT_SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-[var(--nav-panel)] p-3">
          <div className="text-xs font-bold text-[var(--nav-muted)]">현재 단계</div>
          <div className="mt-1 truncate text-base font-bold">{currentStep.label}</div>
          <div className="mt-1 text-sm font-semibold text-[var(--nav-muted)]">{progress}</div>
          {currentStep.text ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--nav-ink)]">
              {currentStep.text}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            aria-label="이전 AI 시나리오 단계"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-panel)] text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={stepIndex === 0}
            onClick={onPrevious}
            type="button"
          >
            <CaretLeft className="size-4" weight="bold" />
          </button>
          <button
            aria-label="다음 AI 시나리오 단계"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-primary)] text-white transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={stepIndex === scenario.steps.length - 1}
            onClick={onNext}
            type="button"
          >
            <CaretRight className="size-4" weight="bold" />
          </button>
          <button
            aria-label="AI 시나리오 초기화"
            className="grid h-11 place-items-center rounded-xl bg-[var(--nav-panel)] text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)]"
            onClick={onReset}
            type="button"
          >
            <ArrowCounterClockwise className="size-4" weight="bold" />
          </button>
        </div>
      </div>
    </motion.section>
  )
}

function DemoScenarioCompletedPanel({
  motionTiming,
  onBackToScenarios,
}: {
  motionTiming: MotionTiming
  onBackToScenarios: () => void
}) {
  return (
    <motion.section
      aria-label="데모 완료 패널"
      className="col-start-2 row-start-2 self-start rounded-[1.1rem] border border-white/70 bg-white p-4 text-[var(--nav-ink)] shadow-[0_18px_46px_rgb(0_0_0/0.24)]"
      data-testid="demo-scenario-completed-panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      <div className="flex flex-col gap-4">
        <div className="border-b border-[var(--nav-border)] pb-3">
          <p className="text-sm font-bold">운전 리포트 확인</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--nav-muted)]">
            오른쪽 리포트 패널에서 오늘 주행 결과를 확인합니다.
          </p>
        </div>

        <button
          className="flex h-11 items-center justify-center rounded-xl border border-[var(--nav-border)] bg-white px-3 text-sm font-bold text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
          onClick={onBackToScenarios}
          type="button"
        >
          데모 선택으로
        </button>
      </div>
    </motion.section>
  )
}

function AppIconDock({
  activeSidePanel,
  className,
  motionTiming,
  musicModalOpen,
  settingsDisabled,
  onOpenLabels,
  onOpenSettings,
  onOpenReport,
  onOpenConnect,
  onToggleMusic,
}: {
  activeSidePanel: SidePanelId | null
  className?: string
  motionTiming: MotionTiming
  musicModalOpen: boolean
  settingsDisabled: boolean
  onOpenLabels: () => void
  onOpenSettings: () => void
  onOpenReport: () => void
  onOpenConnect: () => void
  onToggleMusic: () => void
}) {
  const railButtonClassName = (active: boolean, disabled = false) => [
    'grid size-11 place-items-center rounded-xl text-[var(--nav-ink)] transition',
    active
      ? 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)] shadow-[inset_0_0_0_1px_rgb(23_70_162/0.10)]'
      : 'hover:bg-[var(--nav-panel)] hover:text-[var(--nav-primary)]',
    disabled ? 'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--nav-ink)]' : '',
  ].join(' ')

  return (
    <motion.div
      aria-label="오른쪽 도구 모음"
      className={['pointer-events-none flex flex-none items-start', className].filter(Boolean).join(' ')}
      initial={{ opacity: 0, x: 0, y: -6 }}
      animate={{ opacity: 1, x: activeSidePanel ? -SIDE_PANEL_WIDTH : 0, y: 0 }}
      transition={{
        opacity: motionTiming,
        x: {
          ease: motionTiming.duration === 0 ? undefined : SIDE_PANEL_TRANSITION_EASE,
          duration: motionTiming.duration === 0 ? 0 : SIDE_PANEL_TRANSITION_DURATION_SECONDS,
        },
        y: motionTiming,
      }}
    >
      <div
        data-testid="right-rail-dock"
        className="pointer-events-auto inline-flex flex-col gap-1 rounded-bl-none rounded-r-none rounded-tl-[1.15rem] border-t border-white/70 bg-white p-1.5"
      >
        <button
          aria-controls="settings-drawer"
          aria-expanded={activeSidePanel === 'settings'}
          aria-label="설정"
          className={railButtonClassName(activeSidePanel === 'settings')}
          disabled={settingsDisabled}
          onClick={onOpenSettings}
          type="button"
        >
          <GearSix className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="labels-drawer"
          aria-expanded={activeSidePanel === 'labels'}
          aria-label="라벨 설정"
          className={railButtonClassName(activeSidePanel === 'labels')}
          onClick={onOpenLabels}
          type="button"
        >
          <RoadHorizon className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="report-drawer"
          aria-expanded={activeSidePanel === 'report'}
          aria-label="보고서"
          className={railButtonClassName(activeSidePanel === 'report')}
          onClick={onOpenReport}
          type="button"
        >
          <ClipboardText className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="connect-drawer"
          aria-expanded={activeSidePanel === 'connect'}
          aria-label="연동 상태"
          className={railButtonClassName(activeSidePanel === 'connect')}
          onClick={onOpenConnect}
          type="button"
        >
          <PlugsConnected className="size-5" weight="bold" />
        </button>
        <button
          aria-controls="music-popover"
          aria-expanded={musicModalOpen}
          aria-label="음악"
          className={railButtonClassName(musicModalOpen)}
          onClick={onToggleMusic}
          type="button"
        >
          <MusicNotes className="size-5" weight="bold" />
        </button>
      </div>
    </motion.div>
  )
}

function SideDrawerPanel({
  cameraSettings,
  currentLocationLabel,
  locationStatus,
  motionTiming,
  panel,
  selectedProfile,
  savedPlaces,
  savedPlacesError,
  savedPlacesLoading,
  deletingLabelId,
  updatingLabelId,
  fullReportAvailable,
  onChangeCameraSettings,
  onClose,
  onOpenFullReport,
  onRequestCurrentLocation,
  onAddPlaceLabel,
  onDeletePlaceLabel,
  onUpdatePlaceLabel,
}: {
  cameraSettings: MapCameraSettings
  currentLocationLabel: string
  locationStatus: LocationStatus
  motionTiming: MotionTiming
  panel: SidePanelId
  selectedProfile?: Profile
  savedPlaces: SavedPlaceQuickItem[]
  savedPlacesError: boolean
  savedPlacesLoading: boolean
  deletingLabelId: string | undefined
  updatingLabelId: string | undefined
  fullReportAvailable: boolean
  onChangeCameraSettings: (settings: Partial<MapCameraSettings>) => void
  onClose: () => void
  onOpenFullReport: () => void
  onRequestCurrentLocation: () => void
  onAddPlaceLabel: (field: SearchFieldId, place: Place) => void
  onDeletePlaceLabel: (placeId: string) => void
  onUpdatePlaceLabel: (placeId: string, label: string) => void
}) {
  const itemTransition = {
    ...motionTiming,
    duration: motionTiming.duration === 0 ? 0 : 0.18,
  }
  const itemVariants = {
    hidden: {
      opacity: 0,
      y: motionTiming.duration === 0 ? 0 : 8,
      scale: motionTiming.duration === 0 ? 1 : 0.985,
      transition: itemTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: itemTransition,
    },
  }
  const drawerTransition = {
    ease: motionTiming.duration === 0 ? undefined : SIDE_PANEL_TRANSITION_EASE,
    duration: motionTiming.duration === 0 ? 0 : SIDE_PANEL_TRANSITION_DURATION_SECONDS,
  }
  const drawerOffset = motionTiming.duration === 0 ? 0 : SIDE_PANEL_WIDTH
  const drawerMeta = {
    labels: {
      label: '라벨 설정',
      icon: RoadHorizon,
    },
    settings: {
      label: '설정',
      icon: GearSix,
    },
    report: {
      label: '보고서',
      icon: Article,
    },
    connect: {
      label: '연동 상태',
      icon: PlugsConnected,
    },
  }[panel]
  const content = panel === 'labels' ? (
      <LabelsDrawerContent
        deletingLabelId={deletingLabelId}
        itemVariants={itemVariants}
        savedPlaces={savedPlaces}
        savedPlacesError={savedPlacesError}
        savedPlacesLoading={savedPlacesLoading}
        updatingLabelId={updatingLabelId}
        onAddPlaceLabel={onAddPlaceLabel}
        onDeletePlaceLabel={onDeletePlaceLabel}
        onUpdatePlaceLabel={onUpdatePlaceLabel}
      />
  ) : panel === 'settings' ? (
    <SettingsDrawerContent
      cameraSettings={cameraSettings}
      currentLocationLabel={currentLocationLabel}
      itemVariants={itemVariants}
      locationStatus={locationStatus}
      selectedProfile={selectedProfile}
      onChangeCameraSettings={onChangeCameraSettings}
      onRequestCurrentLocation={onRequestCurrentLocation}
    />
  ) : panel === 'report' ? (
    <ReportDrawerContent
      fullReportAvailable={fullReportAvailable}
      itemVariants={itemVariants}
      report={MOCK_REPORT_DATA}
      onOpenFullReport={onOpenFullReport}
    />
  ) : (
    <ConnectDrawerContent itemVariants={itemVariants} />
  )

  return (
    <motion.aside
      aria-label={drawerMeta.label}
      className="pointer-events-auto absolute bottom-[43px] right-0 top-0 z-20 w-[320px] overflow-hidden bg-white text-[var(--nav-ink)] shadow-[0_14px_36px_rgb(15_23_42/0.12)] max-sm:bottom-[37px] max-sm:w-[min(20rem,calc(100vw-4rem))]"
      id={`${panel}-drawer`}
      data-testid={`${panel}-drawer`}
      exit={{ opacity: 1, x: drawerOffset }}
      initial={{ opacity: 1, x: drawerOffset }}
      animate={{ opacity: 1, x: 0 }}
      transition={drawerTransition}
      role="dialog"
    >
      <div className="flex h-full max-h-full w-full min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3 pb-1 px-4 pt-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-primary)]">
              <drawerMeta.icon className="size-4" weight="bold" />
            </span>
            <h2 className="truncate text-[15px] font-bold tracking-normal">{drawerMeta.label}</h2>
          </div>
          <button
            aria-label={`${drawerMeta.label} 닫기`}
            className="grid size-10 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" weight="bold" />
          </button>
        </div>
        <motion.div
          animate="visible"
          className="grid gap-3 overflow-x-hidden overflow-y-auto px-4 py-4"
          data-testid="side-drawer-content"
          initial="hidden"
          variants={{
            hidden: {
              transition: {
                staggerChildren: motionTiming.duration === 0 ? 0 : 0.035,
                staggerDirection: -1,
              },
            },
            visible: {
              transition: {
                delayChildren: motionTiming.duration === 0 ? 0 : 0.04,
                staggerChildren: motionTiming.duration === 0 ? 0 : 0.045,
              },
            },
          }}
        >
          {content}
        </motion.div>
      </div>
    </motion.aside>
  )
}

function LabelsDrawerContent({
  deletingLabelId,
  itemVariants,
  savedPlaces,
  savedPlacesError,
  savedPlacesLoading,
  updatingLabelId,
  onAddPlaceLabel,
  onDeletePlaceLabel,
  onUpdatePlaceLabel,
}: {
  deletingLabelId: string | undefined
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
  savedPlaces: SavedPlaceQuickItem[]
  savedPlacesError: boolean
  savedPlacesLoading: boolean
  updatingLabelId: string | undefined
  onAddPlaceLabel: (field: SearchFieldId, place: Place) => void
  onDeletePlaceLabel: (placeId: string) => void
  onUpdatePlaceLabel: (placeId: string, label: string) => void
}) {
  const [editingField, setEditingField] = useState<SearchFieldId | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<string>()
  const [editingLabelName, setEditingLabelName] = useState('')
  const [labelSearchKeyword, setLabelSearchKeyword] = useState('')
  const [selectedLabelPlace, setSelectedLabelPlace] = useState<Place>()
  const [labelName, setLabelName] = useState('')
  const debouncedLabelSearchKeyword = useDebouncedValue(labelSearchKeyword.trim(), SEARCH_DEBOUNCE_MS)
  const labelSearchQuery = useQuery({
    queryKey: ['label-place-search', editingField, debouncedLabelSearchKeyword],
    queryFn: ({ signal }) => searchPlaces(debouncedLabelSearchKeyword, undefined, signal),
    enabled: Boolean(editingField) && debouncedLabelSearchKeyword.length >= 2 && !selectedLabelPlace,
    placeholderData: keepPreviousData,
  })
  const originLabels = savedPlaces.filter((place) => place.targetField === 'origin')
  const destinationLabels = savedPlaces.filter((place) => place.targetField === 'destination')
  const resetLabelEditor = () => {
    setEditingField(null)
    setLabelSearchKeyword('')
    setSelectedLabelPlace(undefined)
    setLabelName('')
  }
  const openLabelEditor = (field: SearchFieldId) => {
    setEditingLabelId(undefined)
    setEditingLabelName('')
    setEditingField(field)
    setLabelSearchKeyword('')
    setSelectedLabelPlace(undefined)
    setLabelName('')
  }
  const startEditLabel = (place: SavedPlaceQuickItem) => {
    setEditingField(null)
    setEditingLabelId(place.id)
    setEditingLabelName(place.name)
  }
  const cancelEditLabel = () => {
    setEditingLabelId(undefined)
    setEditingLabelName('')
  }
  const saveEditLabel = (placeId: string) => {
    const nextLabel = editingLabelName.trim()
    if (!nextLabel) {
      return
    }

    onUpdatePlaceLabel(placeId, nextLabel)
    cancelEditLabel()
  }

  if (editingField) {
    const title = editingField === 'origin' ? '출발지 라벨 추가' : '목적지 라벨 추가'

    return (
      <LabelEditorContent
        field={editingField}
        labelName={labelName}
        loading={labelSearchQuery.isFetching}
        places={labelSearchQuery.data ?? []}
        searchKeyword={labelSearchKeyword}
        selectedPlace={selectedLabelPlace}
        title={title}
        onBack={resetLabelEditor}
        onChangeLabelName={setLabelName}
        onChangeSearchKeyword={(value) => {
          setLabelSearchKeyword(value)
          setSelectedLabelPlace(undefined)
          setLabelName('')
        }}
        onSave={() => {
          if (selectedLabelPlace) {
            onAddPlaceLabel(editingField, {
              ...selectedLabelPlace,
              name: labelName.trim() || selectedLabelPlace.name,
            })
            resetLabelEditor()
          }
        }}
        onSelectPlace={(place) => {
          setSelectedLabelPlace(place)
          setLabelSearchKeyword(place.name)
          setLabelName(place.name)
        }}
      />
    )
  }

  return (
    <>
      <LabelGroupSection
        addLabel="출발지 라벨 추가"
        emptyLabel="출발지 라벨이 없습니다."
        field="origin"
        itemVariants={itemVariants}
        loading={savedPlacesLoading}
        places={originLabels}
        savedPlacesError={savedPlacesError}
        deletingLabelId={deletingLabelId}
        editingLabelId={editingLabelId}
        editingLabelName={editingLabelName}
        updatingLabelId={updatingLabelId}
        onCancelEditLabel={cancelEditLabel}
        onChangeEditingLabelName={setEditingLabelName}
        onOpenLabelEditor={openLabelEditor}
        onDeletePlaceLabel={onDeletePlaceLabel}
        onSaveEditLabel={saveEditLabel}
        onStartEditLabel={startEditLabel}
      />
      <LabelGroupSection
        addLabel="목적지 라벨 추가"
        emptyLabel="목적지 라벨이 없습니다."
        field="destination"
        itemVariants={itemVariants}
        loading={savedPlacesLoading}
        places={destinationLabels}
        savedPlacesError={savedPlacesError}
        deletingLabelId={deletingLabelId}
        editingLabelId={editingLabelId}
        editingLabelName={editingLabelName}
        updatingLabelId={updatingLabelId}
        onCancelEditLabel={cancelEditLabel}
        onChangeEditingLabelName={setEditingLabelName}
        onOpenLabelEditor={openLabelEditor}
        onDeletePlaceLabel={onDeletePlaceLabel}
        onSaveEditLabel={saveEditLabel}
        onStartEditLabel={startEditLabel}
      />
    </>
  )
}

function LabelEditorContent({
  field,
  labelName,
  loading,
  places,
  searchKeyword,
  selectedPlace,
  title,
  onBack,
  onChangeLabelName,
  onChangeSearchKeyword,
  onSave,
  onSelectPlace,
}: {
  field: SearchFieldId
  labelName: string
  loading: boolean
  places: Place[]
  searchKeyword: string
  selectedPlace: Place | undefined
  title: string
  onBack: () => void
  onChangeLabelName: (value: string) => void
  onChangeSearchKeyword: (value: string) => void
  onSave: () => void
  onSelectPlace: (place: Place) => void
}) {
  const fieldLabel = field === 'origin' ? '출발지' : '목적지'

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-3"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18 }}
    >
      <div className="flex items-center gap-2">
        <button
          aria-label="라벨 목록으로 돌아가기"
          className="grid size-9 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
          onClick={onBack}
          type="button"
        >
          <CaretLeft className="size-5" weight="bold" />
        </button>
        <h3 className="min-w-0 truncate text-sm font-bold text-[var(--nav-ink)]">{title}</h3>
      </div>

      <label className="grid gap-2">
        <span className="text-xs font-bold text-[var(--nav-muted)]">주소 검색</span>
        <span className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--nav-panel)] px-3">
          <MagnifyingGlass className="size-4 shrink-0 text-[var(--nav-muted)]" weight="bold" />
          <input
            aria-label={`${fieldLabel} 라벨 주소 검색`}
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-muted)]"
            onChange={(event) => onChangeSearchKeyword(event.target.value)}
            placeholder="주소 또는 장소 검색"
            role="combobox"
            type="text"
            value={searchKeyword}
          />
        </span>
      </label>

      {!selectedPlace ? (
        <div className="grid min-h-[9rem] gap-2">
          {loading ? (
            <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-3 text-sm font-semibold text-[var(--nav-muted)]">
              검색 중
            </div>
          ) : places.length ? (
            places.map((place) => (
              <button
                aria-label={`${place.name} 주소 선택`}
                className="rounded-xl bg-[var(--nav-panel)] px-3 py-3 text-left transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
                key={place.id}
                onClick={() => onSelectPlace(place)}
                type="button"
              >
                <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{place.name}</div>
                <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-muted)]">{place.address}</div>
              </button>
            ))
          ) : (
            <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-3 text-sm font-semibold text-[var(--nav-muted)]">
              검색어를 입력하세요.
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-3">
            <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{selectedPlace.name}</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-muted)]">{selectedPlace.address}</div>
          </div>
          <label className="grid gap-2">
            <span className="text-xs font-bold text-[var(--nav-muted)]">라벨 이름</span>
            <input
              aria-label={`${fieldLabel} 라벨 이름`}
              className="min-h-11 rounded-xl bg-[var(--nav-panel)] px-3 text-sm font-bold text-[var(--nav-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-focus-ring)]"
              onChange={(event) => onChangeLabelName(event.target.value)}
              value={labelName}
            />
          </label>
          <button
            aria-label={`${fieldLabel} 라벨 저장`}
            className="min-h-11 rounded-xl bg-[var(--nav-primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!labelName.trim()}
            onClick={onSave}
            type="button"
          >
            저장
          </button>
        </div>
      )}
    </motion.section>
  )
}

function LabelGroupSection({
  addLabel,
  deletingLabelId,
  editingLabelId,
  editingLabelName,
  emptyLabel,
  field,
  itemVariants,
  loading,
  places,
  savedPlacesError,
  updatingLabelId,
  onCancelEditLabel,
  onChangeEditingLabelName,
  onOpenLabelEditor,
  onDeletePlaceLabel,
  onSaveEditLabel,
  onStartEditLabel,
}: {
  addLabel: string
  deletingLabelId: string | undefined
  editingLabelId: string | undefined
  editingLabelName: string
  emptyLabel: string
  field: SearchFieldId
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
  loading: boolean
  places: SavedPlaceQuickItem[]
  savedPlacesError: boolean
  updatingLabelId: string | undefined
  onCancelEditLabel: () => void
  onChangeEditingLabelName: (value: string) => void
  onOpenLabelEditor: (field: SearchFieldId) => void
  onDeletePlaceLabel: (placeId: string) => void
  onSaveEditLabel: (placeId: string) => void
  onStartEditLabel: (place: SavedPlaceQuickItem) => void
}) {
  const title = field === 'origin' ? '출발지 라벨' : '목적지 라벨'

  return (
    <motion.section
      className="grid gap-2"
      variants={itemVariants}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[var(--nav-ink)]">{title}</h3>
        {loading ? (
          <span className="text-xs font-bold text-[var(--nav-muted)]">불러오는 중</span>
        ) : null}
      </div>
      <AddLabelButton
        label={addLabel}
        field={field}
        onOpenLabelEditor={onOpenLabelEditor}
      />
      {loading && !places.length ? (
        <div className="grid gap-2" aria-label={`${title} 로딩`}>
          {[0, 1].map((index) => (
            <div
              className="h-[4.25rem] rounded-xl bg-[var(--nav-panel)]"
              key={index}
            />
          ))}
        </div>
      ) : savedPlacesError ? (
        <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-3 text-sm font-semibold text-[var(--nav-muted)]">
          저장 장소를 불러오지 못했습니다.
        </div>
      ) : places.length ? (
        <div className="grid gap-2">
          {places.map((place) => (
            <SavedPlaceLabelItem
              deleting={deletingLabelId === place.id}
              editing={editingLabelId === place.id}
              editLabelValue={editingLabelName}
              field={field}
              key={place.id}
              place={place}
              updating={updatingLabelId === place.id}
              onCancelEditLabel={onCancelEditLabel}
              onChangeEditingLabelName={onChangeEditingLabelName}
              onDeletePlaceLabel={onDeletePlaceLabel}
              onSaveEditLabel={onSaveEditLabel}
              onStartEditLabel={onStartEditLabel}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-3 text-sm font-semibold text-[var(--nav-muted)]">
          {emptyLabel}
        </div>
      )}
    </motion.section>
  )
}

function AddLabelButton({
  field,
  label,
  onOpenLabelEditor,
}: {
  field: SearchFieldId
  label: string
  onOpenLabelEditor: (field: SearchFieldId) => void
}) {
  return (
    <button
      aria-label={label}
      className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl bg-white px-3 text-left text-sm font-semibold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-[var(--nav-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
      onClick={() => onOpenLabelEditor(field)}
      type="button"
    >
      <Plus className="size-4 shrink-0 text-[var(--nav-primary)]" weight="bold" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

function SavedPlaceLabelItem({
  deleting,
  editing,
  editLabelValue,
  field,
  place,
  updating,
  onCancelEditLabel,
  onChangeEditingLabelName,
  onDeletePlaceLabel,
  onSaveEditLabel,
  onStartEditLabel,
}: {
  deleting: boolean
  editing: boolean
  editLabelValue: string
  field: SearchFieldId
  place: SavedPlaceQuickItem
  updating: boolean
  onCancelEditLabel: () => void
  onChangeEditingLabelName: (value: string) => void
  onDeletePlaceLabel: (placeId: string) => void
  onSaveEditLabel: (placeId: string) => void
  onStartEditLabel: (place: SavedPlaceQuickItem) => void
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const Icon = getSavedPlaceIcon(place.placeType)
  const menuLabel = `${place.name} ${field === 'origin' ? '출발지' : '목적지'} 라벨 메뉴`
  const editLabel = `${place.name} ${field === 'origin' ? '출발지' : '목적지'} 라벨 수정`
  const deleteLabel = `${place.name} ${field === 'origin' ? '출발지' : '목적지'} 라벨 삭제`

  return (
    <div className="relative rounded-xl bg-[var(--nav-panel)] p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[var(--nav-primary)] shadow-[0_3px_10px_rgb(15_23_42/0.06)]">
          <Icon className="size-4" weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex min-w-0 items-center gap-1.5">
              <input
                aria-label={`${place.name} 라벨 이름 수정`}
                className="min-h-8 min-w-0 flex-1 rounded-lg bg-white px-2 text-sm font-bold text-[var(--nav-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--nav-focus-ring)]"
                onChange={(event) => onChangeEditingLabelName(event.target.value)}
                value={editLabelValue}
              />
              <button
                aria-label={`${place.name} 라벨 수정 저장`}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-primary)] text-white transition hover:bg-[var(--nav-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!editLabelValue.trim() || updating}
                onClick={() => onSaveEditLabel(place.id)}
                type="button"
              >
                <Check className="size-4" weight="bold" />
              </button>
              <button
                aria-label={`${place.name} 라벨 수정 취소`}
                className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)]"
                onClick={onCancelEditLabel}
                type="button"
              >
                <X className="size-4" weight="bold" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <OverflowMarqueeText
                className="flex-1 text-sm font-bold text-[var(--nav-ink)]"
                text={place.name}
              />
            </div>
          )}
          <OverflowMarqueeText
            className="mt-0.5 text-xs font-semibold text-[var(--nav-muted)]"
            text={place.address}
          />
        </div>
        {!editing ? (
          <div className="relative shrink-0">
            <button
              aria-expanded={actionMenuOpen}
              aria-label={menuLabel}
              className="grid size-8 place-items-center rounded-full bg-white text-[var(--nav-muted)] transition hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
              disabled={deleting || updating}
              onClick={() => setActionMenuOpen((open) => !open)}
              type="button"
            >
              <DotsThree className="size-5" weight="bold" />
            </button>
            {actionMenuOpen ? (
              <div
                className="absolute right-0 top-10 z-20 w-max overflow-hidden rounded-xl bg-white text-sm font-bold text-[var(--nav-ink)] shadow-[var(--nav-shadow-panel)] ring-1 ring-[rgb(16_24_40/0.08)]"
                role="menu"
              >
                <button
                  aria-label={editLabel}
                  className="flex min-h-10 w-full items-center gap-2 whitespace-nowrap px-3 text-left transition hover:bg-[var(--nav-panel)] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--nav-primary)]"
                  onClick={() => {
                    setActionMenuOpen(false)
                    onStartEditLabel(place)
                  }}
                  role="menuitem"
                  type="button"
                >
                  <PencilSimple className="size-4" weight="bold" />
                  수정
                </button>
                <button
                  aria-label={deleteLabel}
                  className="flex min-h-10 w-full items-center gap-2 whitespace-nowrap px-3 text-left text-[var(--nav-danger)] transition hover:bg-[var(--nav-panel)] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--nav-primary)]"
                  onClick={() => {
                    setActionMenuOpen(false)
                    onDeletePlaceLabel(place.id)
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Trash className="size-4" weight="bold" />
                  삭제
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function OverflowMarqueeText({
  className,
  text,
}: {
  className: string
  text: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const [marqueeOffset, setMarqueeOffset] = useState(0)

  useEffect(() => {
    const updateOverflow = () => {
      const container = containerRef.current
      const textElement = textRef.current

      if (!container || !textElement) {
        return
      }

      const overflowAmount = textElement.scrollWidth - container.clientWidth
      setOverflowing(overflowAmount > 1)
      setMarqueeOffset(Math.min(0, -overflowAmount))
    }

    updateOverflow()
    window.addEventListener('resize', updateOverflow)

    return () => {
      window.removeEventListener('resize', updateOverflow)
    }
  }, [text])

  return (
    <div
      className={['roadie-overflow-marquee min-w-0 overflow-hidden whitespace-nowrap', className].join(' ')}
      ref={containerRef}
      title={text}
    >
      <span
        className={overflowing ? 'roadie-overflow-marquee__track' : 'block truncate'}
        ref={textRef}
        style={overflowing ? ({ '--marquee-offset': `${marqueeOffset}px` } as CSSProperties) : undefined}
      >
        {text}
      </span>
    </div>
  )
}

function getSavedPlaceIcon(placeType: SavedPlaceType) {
  if (placeType === 'HOME') {
    return HouseLine
  }

  if (placeType === 'WORK' || placeType === 'SCHOOL') {
    return Buildings
  }

  return MapPin
}

function SettingsDrawerContent({
  cameraSettings,
  currentLocationLabel,
  itemVariants,
  locationStatus,
  selectedProfile,
  onChangeCameraSettings,
  onRequestCurrentLocation,
}: {
  cameraSettings: MapCameraSettings
  currentLocationLabel: string
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
  locationStatus: LocationStatus
  selectedProfile?: Profile
  onChangeCameraSettings: (settings: Partial<MapCameraSettings>) => void
  onRequestCurrentLocation: () => void
}) {
  const mapModeControlTransition = {
    ease: itemVariants.visible.transition.duration === 0 ? undefined : [0.34, 0, 0.2, 1] as [number, number, number, number],
    duration: itemVariants.visible.transition.duration === 0 ? 0 : 0.72,
  }
  const mapModeItemVariants = {
    hidden: {
      opacity: 0,
      y: itemVariants.hidden.y,
      scale: itemVariants.hidden.scale,
      transition: mapModeControlTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: mapModeControlTransition,
    },
  }
  const updateZoom = (zoom: number) => {
    onChangeCameraSettings({
      zoom: clamp(zoom, MAP_SETTINGS_ZOOM_MIN, MAP_SETTINGS_ZOOM_MAX),
    })
  }
  const updatePitch = (pitch: number) => {
    onChangeCameraSettings({
      pitch: clamp(pitch, MAP_SETTINGS_PITCH_MIN, MAP_SETTINGS_PITCH_MAX),
    })
  }
  const updateMode = (mode: MapCameraSettings['mode']) => {
    onChangeCameraSettings({ mode })
  }
  const profileDisplayName = selectedProfile?.displayName?.trim() || '운전자'

  return (
    <>
      <motion.div variants={itemVariants}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-bold">지도</span>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-full bg-[var(--nav-panel)] p-1" role="group" aria-label="지도 모드">
          {(['2d', '3d'] as const).map((mode) => {
            const selected = cameraSettings.mode === mode
            const label = mode === '2d' ? '2D 지도' : '3D 지도'

            return (
              <button
                aria-pressed={selected}
                className={[
                  'h-10 rounded-full text-sm font-bold transition duration-[600ms] ease-[cubic-bezier(0.34,0,0.2,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                  selected
                    ? 'bg-white text-[var(--nav-primary)]'
                    : 'text-[var(--nav-muted)] hover:bg-white/70 hover:text-[var(--nav-ink)]',
                ].join(' ')}
                key={mode}
                onClick={() => updateMode(mode)}
                type="button"
              >
                {label}
              </button>
            )
          })}
        </div>
      </motion.div>
      <motion.div variants={itemVariants}>
        <SettingSlider
          label="확대"
          max={MAP_SETTINGS_ZOOM_MAX}
          min={MAP_SETTINGS_ZOOM_MIN}
          step={MAP_SETTINGS_ZOOM_STEP}
          value={cameraSettings.zoom}
          valueLabel={cameraSettings.zoom.toFixed(1)}
          onDecrease={() => updateZoom(cameraSettings.zoom - MAP_SETTINGS_ZOOM_STEP)}
          onIncrease={() => updateZoom(cameraSettings.zoom + MAP_SETTINGS_ZOOM_STEP)}
          onChange={updateZoom}
        />
      </motion.div>
      {cameraSettings.mode === '3d' ? (
        <motion.div variants={mapModeItemVariants}>
          <SettingSlider
            label="기울기"
            max={MAP_SETTINGS_PITCH_MAX}
            min={MAP_SETTINGS_PITCH_MIN}
            resetLabel="0°"
            step={MAP_SETTINGS_PITCH_STEP}
            value={cameraSettings.pitch}
            valueLabel={`${Math.round(cameraSettings.pitch)}°`}
            onDecrease={() => updatePitch(cameraSettings.pitch - MAP_SETTINGS_PITCH_STEP)}
            onIncrease={() => updatePitch(cameraSettings.pitch + MAP_SETTINGS_PITCH_STEP)}
            onReset={() => updatePitch(0)}
            onChange={updatePitch}
          />
        </motion.div>
      ) : null}
      <motion.div
        className="flex items-center justify-between gap-3 pt-1"
        variants={itemVariants}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <UserCircle className="size-7 shrink-0 text-[var(--nav-muted)]" weight="fill" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{profileDisplayName}</div>
            <div className="mt-0.5 truncate text-xs font-semibold text-[var(--nav-muted)]">로그인됨</div>
          </div>
        </div>
      </motion.div>
      <motion.div
        className="rounded-2xl bg-[var(--nav-panel)] p-3"
        variants={itemVariants}
      >
        <div className="flex items-center gap-2">
          <MapPin className="size-4 text-[var(--nav-primary)]" weight="fill" />
          <span className="text-sm font-bold">현재 위치</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          {locationStatus === 'granted'
            ? `${currentLocationLabel} 기준으로 탐색 중`
            : '세종대학교를 현재 위치로 사용 중입니다'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onRequestCurrentLocation}
            type="button"
          >
            <Clock className="size-4" weight="bold" />
            현재 위치 다시 받기
          </button>
          <span className="inline-flex min-h-10 items-center rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-muted)]">
            {locationStatus === 'granted' ? 'GPS 추적 중' : '권한 재시도 가능'}
          </span>
        </div>
      </motion.div>
    </>
  )
}

function ReportDrawerContent({
  fullReportAvailable,
  itemVariants,
  report,
  onOpenFullReport,
}: {
  fullReportAvailable: boolean
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
  report: MockReportData
  onOpenFullReport: () => void
}) {
  const overview = report.summary.overview
  const behaviorStats = report.behaviorReport.statistics
  const topBehavior = behaviorStats[0]
  const latestSession = report.reportSessions.items[0]
  const drawerBehaviorChartData = behaviorStats.map((behavior) => ({
    behaviorType: behavior.behaviorType,
    label: getBehaviorLabel(behavior.behaviorType),
    count: behavior.eventCount,
    fill: getBehaviorChartColor(behavior.behaviorType),
  }))

  return (
    <>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-4" variants={itemVariants}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold">
              <Article className="size-4 text-[var(--nav-primary)]" weight="bold" />
              <span>이번 주 운행 리포트</span>
            </div>
            <p className="mt-1 text-xs font-semibold text-[var(--nav-muted)]">{formatReportPeriod(report.summary.period)}</p>
          </div>
          <span className="rounded-full bg-[var(--nav-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--nav-primary)]">
            {formatScoreChange(report.summary.comparison.scoreChange)}
          </span>
        </div>
        <div className="mt-4 flex items-end gap-3">
          <div className="text-5xl font-bold leading-none tracking-normal text-[var(--nav-ink)]">{Math.round(overview.averageSafetyScore ?? 0)}</div>
          <div className="pb-1">
            <div className="text-sm font-bold text-[var(--nav-guidance)]">안정적</div>
            <div className="text-xs font-semibold text-[var(--nav-muted)]">평균 안전 점수</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ReportMiniMetric label="운행" value={formatReportDuration(overview.totalDrivingSeconds)} />
          <ReportMiniMetric label="거리" value={formatReportDistance(overview.totalDistanceMeters)} />
          <ReportMiniMetric label="이벤트" value={`${overview.behaviorEventCount}건`} tone="warning" />
          <ReportMiniMetric label="교정률" value={formatReportPercent(overview.behaviorCorrectionRate)} tone="success" />
        </div>
      </motion.div>

      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-4" variants={itemVariants}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Warning className="size-4 text-[var(--nav-warning)]" weight="fill" />
            <span className="text-sm font-bold">이상행동 요약</span>
          </div>
          <span className="text-xs font-bold text-[var(--nav-muted)]">{topBehavior ? getBehaviorLabel(topBehavior.behaviorType) : '기록 없음'}</span>
        </div>
        <div className="mt-3 h-34" data-chart-library="recharts" data-testid="report-drawer-behavior-chart">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={drawerBehaviorChartData} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 2 }}>
              <XAxis axisLine={false} tick={false} tickLine={false} type="number" />
              <YAxis
                axisLine={false}
                dataKey="label"
                tick={{ fill: REPORT_CHART_COLORS.ink, fontSize: 11, fontWeight: 700 }}
                tickLine={false}
                type="category"
                width={62}
              />
              <Tooltip content={<ReportChartTooltip valueSuffix="건" />} cursor={{ fill: '#ffffff' }} />
              <Bar dataKey="count" name="이벤트" radius={[0, 8, 8, 0]}>
                <LabelList dataKey="count" formatter={formatReportChartCountLabel} position="right" />
                {drawerBehaviorChartData.map((entry) => (
                  <Cell fill={entry.fill} key={entry.behaviorType} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-4" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <ClipboardText className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">최근 운행</span>
        </div>
        {latestSession ? (
          <div className="mt-3 rounded-xl bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-bold">{latestSession.destinationName ?? '목적지 없음'}</span>
              <span className="rounded-full bg-[var(--nav-primary-soft)] px-2 py-1 text-xs font-bold text-[var(--nav-primary)]">
                {latestSession.safetyScore ?? '-'}점
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[var(--nav-muted)]">
              <span>{formatReportDateTime(latestSession.startedAt)}</span>
              <span>{formatReportDuration(latestSession.durationSeconds)}</span>
              <span>{formatReportDistance(latestSession.distanceMeters)}</span>
            </div>
          </div>
        ) : null}
        <button
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--nav-primary)] px-3 text-[13px] font-bold text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] disabled:cursor-not-allowed disabled:bg-[var(--nav-disabled)] disabled:text-white"
          disabled={!fullReportAvailable}
          onClick={onOpenFullReport}
          type="button"
        >
          <ClipboardText className="size-4" weight="bold" />
          {fullReportAvailable ? '전체 보고서 보기' : '운행 종료 후 확인'}
        </button>
      </motion.div>
    </>
  )
}

function ReportMiniMetric({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'default' | 'success' | 'warning'
  value: string
}) {
  const valueClassName = tone === 'success'
    ? 'text-[var(--nav-guidance)]'
    : tone === 'warning'
      ? 'text-[var(--nav-warning)]'
      : 'text-[var(--nav-ink)]'

  return (
    <div className="rounded-xl bg-white px-3 py-2.5">
      <div className="text-[11px] font-bold text-[var(--nav-muted)]">{label}</div>
      <div className={['mt-1 truncate text-sm font-bold', valueClassName].join(' ')}>{value}</div>
    </div>
  )
}

function ReportDashboardStatCard({
  caption,
  delta,
  icon,
  label,
  tone = 'default',
  value,
}: {
  caption?: string
  delta?: string
  icon: ReactNode
  label: string
  tone?: 'default' | 'success' | 'warning'
  value: string
}) {
  const toneClassName = tone === 'success'
    ? 'text-[var(--nav-guidance)]'
    : tone === 'warning'
      ? 'text-[var(--nav-warning)]'
      : 'text-[var(--nav-primary)]'

  return (
    <section className="min-w-0 rounded-[1.15rem] bg-white p-4 shadow-[0_10px_24px_rgb(15_23_42/0.07)] ring-1 ring-[var(--nav-border)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-[var(--nav-ink)]">{label}</div>
          <div className="mt-3 max-w-full whitespace-nowrap text-2xl font-bold leading-none tracking-normal">{value}</div>
        </div>
        <span className={['grid size-9 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)]', toneClassName].join(' ')}>
          {icon}
        </span>
      </div>
      <div className="mt-3 flex min-h-5 items-center gap-2 text-xs font-bold">
        {delta ? <ReportMetricBadge value={delta} tone="success" /> : null}
        {caption ? <span className="min-w-0 truncate text-[var(--nav-muted)]">{caption}</span> : null}
      </div>
    </section>
  )
}

function ReportMetricBadge({
  tone = 'default',
  value,
}: {
  tone?: 'default' | 'success' | 'warning'
  value: string
}) {
  const className = tone === 'success'
    ? 'bg-[rgb(220_252_231)] text-[var(--nav-guidance-strong)]'
    : tone === 'warning'
      ? 'bg-[rgb(255_237_213)] text-[var(--nav-warning)]'
      : 'bg-[var(--nav-primary-soft)] text-[var(--nav-primary)]'

  return (
    <span className={['inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-bold', className].join(' ')}>
      {value}
    </span>
  )
}

function ReportSmallDelta({
  label,
  tone = 'default',
  value,
}: {
  label: string
  tone?: 'default' | 'success'
  value: string
}) {
  return (
    <div className="rounded-xl bg-[var(--nav-panel)] px-3 py-2">
      <div className="text-[11px] font-bold text-[var(--nav-muted)]">{label}</div>
      <div className={['mt-1 truncate text-sm font-bold', tone === 'success' ? 'text-[var(--nav-guidance)]' : 'text-[var(--nav-ink)]'].join(' ')}>
        {value}
      </div>
    </div>
  )
}

function ReportFullscreenOverlay({
  motionTiming,
  report,
  onClose,
}: {
  motionTiming: MotionTiming
  report: MockReportData
  onClose: () => void
}) {
  const sessions = report.reportSessions.items
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0]?.sessionId ?? '')
  const [selectedPresetId, setSelectedPresetId] = useState('last7')
  const [reportPeriod, setReportPeriod] = useState(report.summary.period)
  const [selectedBehaviorTypes, setSelectedBehaviorTypes] = useState<ReportBehaviorType[]>([])
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? sessions[0]
  const selectedSessionDetail = selectedSession ? report.sessionDetails[selectedSession.sessionId] : undefined
  const selectedTimeline = selectedSession ? report.timelines[selectedSession.sessionId] ?? [] : []
  const selectedLocations = selectedSession ? report.locations[selectedSession.sessionId] ?? [] : []
  const overview = report.summary.overview
  const behaviorStats = selectedBehaviorTypes.length > 0
    ? report.behaviorReport.statistics.filter((behavior) => selectedBehaviorTypes.includes(behavior.behaviorType as ReportBehaviorType))
    : report.behaviorReport.statistics
  const behaviorEventCount = behaviorStats.reduce((total, behavior) => total + behavior.eventCount, 0)
  const dailyScores = report.summary.dailySafetyScores
  const hourlyCounts = report.behaviorReport.hourlyCounts
  const dailyScoreChartData = dailyScores.map((item) => ({
    date: formatReportDate(item.date),
    score: item.score,
  }))
  const behaviorChartData = behaviorStats.map((behavior) => ({
    behaviorType: behavior.behaviorType,
    label: getBehaviorLabel(behavior.behaviorType),
    count: behavior.eventCount,
    correctedCount: behavior.correctedCount,
    fill: getBehaviorChartColor(behavior.behaviorType),
  }))
  const hourlyChartData = hourlyCounts.map((item) => ({
    hour: `${item.hour}시`,
    count: item.count,
  }))
  const correctedRate = overview.behaviorCorrectionRate ?? 0
  const correctionChartData = [
    { name: '교정', count: correctedRate, fill: REPORT_CHART_COLORS.primary },
    { name: '미교정', count: Math.max(0, 100 - correctedRate), fill: REPORT_CHART_COLORS.primarySoft },
  ]
  const topBehavior = behaviorStats[0]
  const selectedPeriodLabel = selectedPresetId === 'custom'
    ? formatReportPeriod(reportPeriod)
    : REPORT_PERIOD_PRESETS.find((preset) => preset.id === selectedPresetId)?.label ?? '선택 기간'
  const selectedBehaviorSummaryLabel = selectedBehaviorTypes.length === 0
    ? '전체 행동'
    : selectedBehaviorTypes.length === 1
      ? getBehaviorLabel(selectedBehaviorTypes[0])
      : `${selectedBehaviorTypes.length}개 행동`

  const selectPeriodPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    setReportPeriod(getReportPresetPeriod(presetId, report.summary.period.end))
  }

  const updateReportPeriod = (field: keyof MockReportData['summary']['period'], value: string) => {
    setSelectedPresetId('custom')
    setReportPeriod((current) => ({ ...current, [field]: value }))
  }

  const toggleBehaviorType = (behaviorType: ReportBehaviorType) => {
    setSelectedBehaviorTypes((current) => (
      current.includes(behaviorType)
        ? current.filter((item) => item !== behaviorType)
        : [...current, behaviorType]
    ))
  }

  return (
    <motion.div
      aria-label="전체 운행 보고서"
      aria-modal="true"
      className="absolute inset-0 z-[80] flex min-h-0 flex-col bg-[var(--nav-frame)] text-[var(--nav-ink)]"
      data-testid="report-fullscreen"
      initial={{ opacity: 0, scale: 1.01 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.006 }}
      transition={motionTiming}
      role="dialog"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-normal">운행 리포트</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--nav-muted)]">
              {selectedPeriodLabel} · {selectedBehaviorSummaryLabel} · {report.reportSessions.total}회 운행
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[var(--nav-ink)] shadow-[0_8px_18px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)] transition hover:bg-[var(--nav-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
              type="button"
            >
              <UploadSimple className="size-4" weight="bold" />
              보고서 내보내기
            </button>
            <button
              aria-label="전체 운행 보고서 닫기"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[var(--nav-muted)] shadow-[0_8px_18px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
              onClick={onClose}
              type="button"
            >
              <X className="size-5" weight="bold" />
            </button>
          </div>
        </header>

        <div className="mx-6 rounded-[1.15rem] bg-white px-4 py-3 shadow-[0_10px_24px_rgb(15_23_42/0.06)] ring-1 ring-[var(--nav-border)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {REPORT_PERIOD_PRESETS.map((preset) => (
                <ReportFilterButton
                  active={selectedPresetId === preset.id}
                  key={preset.id}
                  onClick={() => selectPeriodPreset(preset.id)}
                >
                  {preset.label}
                </ReportFilterButton>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="report-period-start">조회 시작일</label>
              <input
                aria-label="조회 시작일"
                className="h-10 rounded-full border border-[var(--nav-border)] bg-white px-3 text-sm font-bold text-[var(--nav-ink)] outline-none focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
                id="report-period-start"
                max={reportPeriod.end}
                onChange={(event) => updateReportPeriod('start', event.target.value)}
                type="date"
                value={reportPeriod.start}
              />
              <label className="sr-only" htmlFor="report-period-end">조회 종료일</label>
              <input
                aria-label="조회 종료일"
                className="h-10 rounded-full border border-[var(--nav-border)] bg-white px-3 text-sm font-bold text-[var(--nav-ink)] outline-none focus:border-[var(--nav-primary)] focus:shadow-[0_0_0_3px_var(--nav-focus-ring)]"
                id="report-period-end"
                min={reportPeriod.start}
                onChange={(event) => updateReportPeriod('end', event.target.value)}
                type="date"
                value={reportPeriod.end}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {REPORT_BEHAVIOR_TYPES.map((behaviorType) => (
              <ReportFilterButton
                active={selectedBehaviorTypes.includes(behaviorType)}
                key={behaviorType}
                onClick={() => toggleBehaviorType(behaviorType)}
              >
                {getBehaviorLabel(behaviorType)}
              </ReportFilterButton>
            ))}
            {selectedBehaviorTypes.length > 0 ? (
              <button
                className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-bold text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
                onClick={() => setSelectedBehaviorTypes([])}
                type="button"
              >
                전체 보기
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
          <div className="grid h-full min-h-0 gap-4 overflow-y-auto pr-1 xl:grid-cols-[1.08fr_0.92fr]">
            <div className="grid content-start gap-4">
              <div className="grid gap-3 md:grid-cols-4">
                <ReportDashboardStatCard icon={<Article className="size-4" weight="bold" />} label="평균 안전 점수" value={`${formatNullableReportMetric(overview.averageSafetyScore)}점`} delta={formatScoreChange(report.summary.comparison.scoreChange)} />
                <ReportDashboardStatCard icon={<CarSimple className="size-4" weight="bold" />} label="총 운행 거리" value={formatReportDistance(overview.totalDistanceMeters)} caption={formatReportDuration(overview.totalDrivingSeconds)} />
                <ReportDashboardStatCard icon={<Warning className="size-4" weight="fill" />} label="이상행동" value={`${behaviorEventCount}건`} caption={topBehavior ? `${getBehaviorLabel(topBehavior.behaviorType)} 최다` : '기록 없음'} tone="warning" />
                <ReportDashboardStatCard icon={<Check className="size-4" weight="bold" />} label="교정률" value={formatReportPercent(overview.behaviorCorrectionRate)} caption={`${overview.correctedBehaviorCount}/${overview.behaviorEventCount}건 교정`} tone="success" />
              </div>

              <section className="rounded-[1.15rem] bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold tracking-normal">안전 점수 추이</h3>
                    <div className="mt-3 flex items-end gap-3">
                      <span className="text-5xl font-bold leading-none tracking-normal">{formatNullableReportMetric(overview.averageSafetyScore)}</span>
                      <ReportMetricBadge value={formatScoreChange(report.summary.comparison.scoreChange)} tone="success" />
                    </div>
                  </div>
                  <div className="grid min-w-[11rem] gap-2 text-sm font-bold">
                    <ReportSummaryPill label="운행" value={`${overview.totalSessions}회`} />
                    <ReportSummaryPill label="평균 응답" value={formatReportLatency(overview.averageResponseLatencyMs)} />
                  </div>
                </div>
                <div
                  className="mt-5 h-58"
                  data-chart-library="recharts"
                  data-testid="daily-safety-chart"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <LineChart data={dailyScoreChartData} margin={{ top: 14, right: 10, bottom: 0, left: -18 }}>
                      <CartesianGrid stroke={REPORT_CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        axisLine={false}
                        dataKey="date"
                        tick={{ fill: REPORT_CHART_COLORS.muted, fontSize: 12, fontWeight: 700 }}
                        tickLine={false}
                      />
                      <YAxis
                        axisLine={false}
                        domain={[60, 100]}
                        tick={{ fill: REPORT_CHART_COLORS.muted, fontSize: 11, fontWeight: 700 }}
                        tickLine={false}
                        width={34}
                      />
                      <Tooltip content={<ReportChartTooltip valueSuffix="점" />} cursor={{ stroke: REPORT_CHART_COLORS.primarySoft, strokeWidth: 2 }} />
                      <Line
                        activeDot={{ r: 5, stroke: REPORT_CHART_COLORS.primary, strokeWidth: 2 }}
                        dataKey="score"
                        dot={{ r: 3, stroke: REPORT_CHART_COLORS.primary, strokeWidth: 2 }}
                        name="안전 점수"
                        stroke={REPORT_CHART_COLORS.primary}
                        strokeWidth={3}
                        type="monotone"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>

              <div
                className="grid h-[26rem] min-h-0 gap-4 lg:grid-cols-[0.82fr_1.18fr]"
                data-testid="report-sessions-layout"
              >
                <section
                  className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
                  data-testid="report-session-list-panel"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold">최근 운행 세션</h3>
                    <span className="text-xs font-bold text-[var(--nav-muted)]">{report.reportSessions.total}회</span>
                  </div>
                  {sessions.length > 0 ? (
                    <div
                      className="mt-4 grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1"
                      data-testid="report-session-list-scroll"
                    >
                      {sessions.map((session) => (
                        <button
                          aria-pressed={selectedSession?.sessionId === session.sessionId}
                          className={[
                            'rounded-xl p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                            selectedSession?.sessionId === session.sessionId
                              ? 'bg-[var(--nav-primary-soft)]'
                              : 'bg-[var(--nav-panel)] hover:bg-[var(--nav-selection)]',
                          ].join(' ')}
                          key={session.sessionId}
                          onClick={() => setSelectedSessionId(session.sessionId)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold">{session.destinationName ?? '목적지 없음'}</div>
                              <div className="mt-1 text-xs font-semibold text-[var(--nav-muted)]">
                                {formatReportDateTime(session.startedAt)} · {formatReportDuration(session.durationSeconds)}
                              </div>
                            </div>
                            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[var(--nav-primary)]">
                              {formatNullableReportMetric(session.safetyScore)}점
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <ReportEmptyState title="운행 기록 없음" description="선택한 기간에 완료된 운행이 없습니다." />
                  )}
                </section>

                <section
                  className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)]"
                  data-testid="report-session-detail-panel"
                >
                  {selectedSession ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold">세션 상세</h3>
                          <p className="mt-1 text-sm font-semibold text-[var(--nav-muted)]">
                            {selectedSession.destinationName ?? '목적지 없음'} · {formatReportDateTime(selectedSession.startedAt)}
                          </p>
                        </div>
                        <span className="rounded-full bg-[var(--nav-primary-soft)] px-3 py-1 text-xs font-bold text-[var(--nav-primary)]">
                          {formatNullableReportMetric(selectedSession.safetyScore)}점
                        </span>
                      </div>

                      <div
                        className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"
                        data-testid="report-session-detail-scroll"
                      >
                        <div className="grid gap-3 md:grid-cols-3">
                          <ReportLargeMetric icon={<Timer className="size-4" weight="bold" />} label="운행 시간" value={formatReportDuration(selectedSession.durationSeconds)} />
                          <ReportLargeMetric icon={<CarSimple className="size-4" weight="bold" />} label="운행 거리" value={formatReportDistance(selectedSession.distanceMeters)} />
                          <ReportLargeMetric icon={<Warning className="size-4" weight="fill" />} label="이벤트" value={`${selectedSession.behaviorEventCount}건`} tone="warning" />
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="text-sm font-bold">경로 요약</h4>
                            <div className="mt-3 grid gap-2 text-sm font-semibold text-[var(--nav-muted)]">
                              <span>위치 기록 {selectedLocations.length}개</span>
                              <span>평균 속도 {formatNullableReportMetric(selectedSession.averageSpeedKph, 'km/h')}</span>
                              <span>종료 상태 {selectedSessionDetail?.status ?? '-'}</span>
                              <span>종료 사유 {selectedSessionDetail?.endReason ?? '-'}</span>
                            </div>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold">교정 요약</h4>
                            <div className="mt-3 grid gap-2 text-sm font-semibold text-[var(--nav-muted)]">
                              <span>개입 {selectedSession.interventionCount}건</span>
                              <span>교정 {selectedSession.correctedBehaviorCount}건</span>
                              <span>교정률 {formatReportPercent(selectedSession.behaviorCorrectionRate)}</span>
                            </div>
                          </div>
                        </div>

                        <h4 className="mt-6 text-sm font-bold">로디 개입 타임라인</h4>
                        <div className="mt-4 grid gap-3">
                          {selectedTimeline.length > 0 ? selectedTimeline.map((event) => (
                            <div className="grid grid-cols-[3.5rem_1fr] gap-3" key={event.eventId}>
                              <span className="pt-0.5 text-xs font-bold text-[var(--nav-muted)]">{formatReportTime(event.startedAt)}</span>
                              <div className="rounded-xl bg-[var(--nav-ai-soft)] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-[var(--nav-ai-primary)]">{getBehaviorLabel(event.behaviorType)}</span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--nav-muted)]">
                                    위험도 {event.riskLevel}
                                  </span>
                                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--nav-muted)]">
                                    {formatReportMilliseconds(event.durationMs)}
                                  </span>
                                  {event.corrected ? (
                                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--nav-guidance)]">교정됨</span>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs font-semibold leading-5 text-[var(--nav-muted)]">
                                  {event.interventionText} · {event.drivingState} · {formatNullableReportMetric(event.speedKph, 'km/h')}
                                </p>
                              </div>
                            </div>
                          )) : (
                            <ReportEmptyState title="개입 기록 없음" description="이 운행에는 로디 개입 타임라인이 없습니다." />
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <ReportEmptyState title="선택된 운행 없음" description="상세를 볼 운행 기록을 선택해주세요." />
                  )}
                </section>
              </div>
            </div>

            <div className="grid content-start gap-4">
              <section className="rounded-[1.15rem] bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold tracking-normal">교정 성공률</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--nav-muted)]">로디 개입 후 정상 주행 복귀</p>
                  </div>
                  <ReportMetricBadge value={formatReportPercent(overview.behaviorCorrectionRate)} tone="success" />
                </div>
                <div
                  className="relative mt-4 h-54"
                  data-chart-library="recharts"
                  data-testid="correction-rate-chart"
                >
                  <ResponsiveContainer height="100%" width="100%">
                    <PieChart>
                      <Tooltip content={<ReportChartTooltip valueSuffix="%" />} />
                      <Pie
                        cx="50%"
                        cy="56%"
                        data={correctionChartData}
                        dataKey="count"
                        endAngle={-180}
                        innerRadius={70}
                        nameKey="name"
                        outerRadius={94}
                        paddingAngle={2}
                        startAngle={180}
                      >
                        {correctionChartData.map((entry) => (
                          <Cell fill={entry.fill} key={entry.name} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-x-0 top-[46%] text-center">
                    <div className="text-4xl font-bold leading-none tracking-normal">{formatReportPercent(overview.behaviorCorrectionRate)}</div>
                    <div className="mt-1 text-xs font-bold text-[var(--nav-muted)]">Correction Rate</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ReportSmallDelta label="개입" value={`${overview.interventionCount}건`} />
                  <ReportSmallDelta label="교정" value={`${overview.correctedBehaviorCount}건`} tone="success" />
                  <ReportSmallDelta label="응답" value={formatReportLatency(overview.averageResponseLatencyMs)} />
                </div>
              </section>

              <section className="rounded-[1.15rem] bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-bold">행동 유형별 분석</h3>
                  <span className="text-xs font-bold text-[var(--nav-muted)]">{behaviorEventCount}건</span>
                </div>
                {behaviorStats.length > 0 ? (
                  <div
                    className="mt-4 h-48"
                    data-chart-library="recharts"
                    data-testid="behavior-type-chart"
                  >
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart
                        data={behaviorChartData}
                        layout="vertical"
                        margin={{ top: 4, right: 28, bottom: 4, left: 12 }}
                      >
                        <CartesianGrid horizontal={false} stroke={REPORT_CHART_COLORS.border} strokeDasharray="3 3" />
                        <XAxis axisLine={false} tick={false} tickLine={false} type="number" />
                        <YAxis
                          axisLine={false}
                          dataKey="label"
                          tick={{ fill: REPORT_CHART_COLORS.ink, fontSize: 12, fontWeight: 700 }}
                          tickLine={false}
                          type="category"
                          width={74}
                        />
                        <Tooltip content={<ReportChartTooltip valueSuffix="건" />} cursor={{ fill: REPORT_CHART_COLORS.panel }} />
                        <Bar dataKey="count" name="이벤트" radius={[0, 8, 8, 0]}>
                          <LabelList dataKey="count" formatter={formatReportChartCountLabel} position="right" />
                          {behaviorChartData.map((entry) => (
                            <Cell fill={entry.fill} key={entry.behaviorType} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <ReportEmptyState title="이상행동 기록 없음" description="선택한 기간에는 보고할 이상행동이 없습니다." />
                )}
              </section>

              <section className="rounded-[1.15rem] bg-white p-5 shadow-[0_10px_24px_rgb(15_23_42/0.08)] ring-1 ring-[var(--nav-border)]">
                <h3 className="text-base font-bold">시간대별 이벤트</h3>
                <div
                  className="mt-4"
                  data-chart-library="recharts"
                  data-testid="hourly-event-grid"
                >
                  <div className="h-38">
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart data={hourlyChartData} margin={{ top: 10, right: 6, bottom: 0, left: -22 }}>
                        <CartesianGrid stroke={REPORT_CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          axisLine={false}
                          dataKey="hour"
                          tick={{ fill: REPORT_CHART_COLORS.muted, fontSize: 12, fontWeight: 700 }}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          axisLine={false}
                          tick={{ fill: REPORT_CHART_COLORS.muted, fontSize: 11, fontWeight: 700 }}
                          tickLine={false}
                          width={32}
                        />
                        <Tooltip content={<ReportChartTooltip valueSuffix="건" />} cursor={{ fill: REPORT_CHART_COLORS.panel }} />
                        <Bar dataKey="count" fill={REPORT_CHART_COLORS.warning} name="이벤트" radius={[8, 8, 0, 0]}>
                          <LabelList dataKey="count" formatter={formatReportChartCountLabel} position="top" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {hourlyChartData.map((item) => (
                      <div className="flex items-center justify-between rounded-xl bg-[var(--nav-panel)] px-3 py-2 text-xs font-bold" key={item.hour}>
                        <span className="text-[var(--nav-muted)]">{item.hour}</span>
                        <span className="text-[var(--nav-ink)]">{item.count}건</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function ReportFilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        'inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
        active
          ? 'bg-[var(--nav-primary)] text-white'
          : 'bg-[var(--nav-panel)] text-[var(--nav-muted)] hover:bg-[var(--nav-selection)] hover:text-[var(--nav-ink)]',
      ].join(' ')}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ReportEmptyState({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <div className="rounded-xl bg-[var(--nav-panel)] px-4 py-6 text-center">
      <div className="text-sm font-bold text-[var(--nav-ink)]">{title}</div>
      <p className="mt-1 text-xs font-semibold leading-5 text-[var(--nav-muted)]">{description}</p>
    </div>
  )
}

function ReportSummaryPill({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[var(--nav-panel)] px-3 py-2 text-sm">
      <span className="font-bold text-[var(--nav-muted)]">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  )
}

function ReportLargeMetric({
  icon,
  label,
  tone = 'default',
  value,
}: {
  icon: ReactNode
  label: string
  tone?: 'default' | 'warning'
  value: string
}) {
  return (
    <div className="rounded-xl bg-[var(--nav-panel)] p-3">
      <div className={['flex items-center gap-2 text-xs font-bold', tone === 'warning' ? 'text-[var(--nav-warning)]' : 'text-[var(--nav-primary)]'].join(' ')}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold tracking-normal">{value}</div>
    </div>
  )
}

const REPORT_BEHAVIOR_META: Record<string, { label: string; color: string }> = {
  DROWSINESS: { label: '졸음', color: REPORT_CHART_COLORS.warning },
  PHONE_USE: { label: '휴대폰 사용', color: REPORT_CHART_COLORS.danger },
  FOOD_OR_DRINK: { label: '음식/음료 섭취', color: REPORT_CHART_COLORS.guidance },
  GAZE_AWAY: { label: '시선 이탈', color: REPORT_CHART_COLORS.ai },
  SECONDARY_TASK: { label: '부주의 행동', color: REPORT_CHART_COLORS.primary },
  REACHING_BEHIND: { label: '뒤쪽 확인/손 뻗기', color: REPORT_CHART_COLORS.warning },
  SMOKING: { label: '흡연', color: REPORT_CHART_COLORS.danger },
}

function getBehaviorLabel(behaviorType: string) {
  return REPORT_BEHAVIOR_META[behaviorType]?.label ?? behaviorType
}

function getBehaviorChartColor(behaviorType: string) {
  return REPORT_BEHAVIOR_META[behaviorType]?.color ?? REPORT_CHART_COLORS.primary
}

function formatReportChartCountLabel(value: unknown) {
  return `${value ?? 0}건`
}

function ReportChartTooltip({
  active,
  label,
  payload,
  valueSuffix = '',
}: {
  active?: boolean
  label?: string | number
  payload?: Array<{ name?: string | number; value?: string | number; payload?: { label?: string; name?: string } }>
  valueSuffix?: string
}) {
  if (!active || !payload?.length) {
    return null
  }

  const firstPayload = payload[0]
  const title = firstPayload.payload?.label ?? firstPayload.payload?.name ?? label

  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[var(--nav-ink)] shadow-[0_8px_18px_rgb(15_23_42/0.14)] ring-1 ring-[var(--nav-border)]">
      {title ? <div>{title}</div> : null}
      {payload.map((item) => (
        <div className="mt-1 text-[var(--nav-muted)]" key={`${item.name ?? 'value'}-${item.value}`}>
          {item.name}: {item.value}{valueSuffix}
        </div>
      ))}
    </div>
  )
}

function formatReportPeriod(period: { start: string; end: string }) {
  return `${formatReportDate(period.start)} - ${formatReportDate(period.end)}`
}

function getReportPresetPeriod(presetId: string, baseDate: string) {
  switch (presetId) {
    case 'today':
      return { start: baseDate, end: baseDate }
    case 'last30':
      return { start: shiftReportDate(baseDate, -29), end: baseDate }
    case 'month':
      return { start: `${baseDate.slice(0, 8)}01`, end: baseDate }
    case 'last7':
    default:
      return { start: shiftReportDate(baseDate, -6), end: baseDate }
  }
}

function shiftReportDate(value: string, dayOffset: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

function formatReportDate(value: string) {
  const datePart = value.split('T')[0]
  const [, month, day] = datePart.split('-')

  if (!month || !day) {
    return value
  }

  return `${Number(month)}.${Number(day)}`
}

function formatReportDateTime(value: string) {
  const [datePart, timePart = ''] = value.split('T')
  const [, month, day] = datePart.split('-')
  const [hour = '', minute = ''] = timePart.split(':')

  if (!month || !day || !hour || !minute) {
    return value
  }

  return `${Number(month)}.${Number(day)} ${hour}:${minute}`
}

function formatReportTime(value: string) {
  const timePart = value.split('T')[1] ?? ''
  const [hour = '', minute = ''] = timePart.split(':')

  return hour && minute ? `${hour}:${minute}` : value
}

function formatReportDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
}

function formatReportDistance(meters: number) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`
  }

  return `${(meters / 1000).toFixed(1)} km`
}

function formatReportPercent(value: number | null) {
  if (value === null) {
    return '-'
  }

  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

function formatScoreChange(value: number | null) {
  if (value === null) {
    return '비교 없음'
  }

  if (value === 0) {
    return '변화 없음'
  }

  return value > 0 ? `+${value}점` : `${value}점`
}

function formatReportLatency(value: number | null) {
  if (value === null) {
    return '-'
  }

  return value >= 1000 ? `${(value / 1000).toFixed(1)}초` : `${value}ms`
}

function formatReportMilliseconds(value: number | null) {
  if (value === null) {
    return '-'
  }

  return value >= 1000 ? `${Math.round(value / 1000)}초` : `${value}ms`
}

function formatNullableReportMetric(value: number | null, suffix = '') {
  if (value === null) {
    return '-'
  }

  const formattedValue = Number.isInteger(value) ? `${value}` : value.toFixed(1)

  return suffix ? `${formattedValue} ${suffix}` : formattedValue
}

function ConnectDrawerContent({
  itemVariants,
}: {
  itemVariants: {
    hidden: { opacity: number; y: number; scale: number; transition: MotionTiming }
    visible: { opacity: number; y: number; scale: number; transition: MotionTiming }
  }
}) {
  const [lastCheckedLabel, setLastCheckedLabel] = useState('방금 전')

  const refreshConnection = () => {
    setLastCheckedLabel('지금')
  }

  return (
    <>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <PlugsConnected className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">연결 상태</span>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">차량</span>
            <span className="font-semibold text-[var(--nav-guidance)]">연결됨</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[var(--nav-muted)]">휴대폰</span>
            <span className="font-semibold">동기화됨</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-[var(--nav-muted)]">
              <SpeakerHigh className="size-4" weight="bold" />
              오디오
            </span>
            <span className="font-semibold">정상</span>
          </div>
        </div>
      </motion.div>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <WifiHigh className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">최근 확인</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          마지막 확인은 {lastCheckedLabel}입니다. 연결이 흔들리면 다시 확인할 수 있습니다.
        </p>
        <button
          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={refreshConnection}
          type="button"
        >
          <CarSimple className="size-4" weight="bold" />
          연결 다시 확인
        </button>
      </motion.div>
      <motion.div className="rounded-2xl bg-[var(--nav-panel)] p-3" variants={itemVariants}>
        <div className="flex items-center gap-2">
          <Phone className="size-4 text-[var(--nav-primary)]" weight="bold" />
          <span className="text-sm font-bold">기기 정보</span>
        </div>
        <p className="mt-2 text-sm leading-5 text-[var(--nav-muted)]">
          로디 앱과 차량 연결이 유지되는 동안 안내, 음악, 리포트가 동기화됩니다.
        </p>
      </motion.div>
    </>
  )
}

function MusicPopover({
  motionTiming,
  musicSearchKeyword,
  musicPlaying,
  selectedTrack,
  tracks,
  loading,
  error,
  onClose,
  onPickTrack,
  onSearchKeywordChange,
  onStartPlayback,
}: {
  motionTiming: MotionTiming
  musicSearchKeyword: string
  musicPlaying: boolean
  selectedTrack: UiMusicTrack
  tracks: UiMusicTrack[]
  loading: boolean
  error: boolean
  onClose: () => void
  onPickTrack: (trackId: string) => void
  onSearchKeywordChange: (value: string) => void
  onStartPlayback: () => void
}) {
  const filteredTracks = tracks.filter((track) => {
    const keyword = musicSearchKeyword.trim().toLowerCase()

    if (!keyword) {
      return true
    }

    return (
      track.title.toLowerCase().includes(keyword) ||
      track.artist.toLowerCase().includes(keyword) ||
      track.album.toLowerCase().includes(keyword)
    )
  })

  return (
    <motion.section
      aria-label="음악"
      className="pointer-events-auto absolute bottom-14 right-[4.25rem] z-50 rounded-[1.15rem] bg-white/94 text-[var(--nav-ink)] shadow-[0_12px_30px_rgb(15_23_42/0.12)] backdrop-blur-xl max-sm:bottom-13 max-sm:right-2"
      id="music-popover"
      data-testid="music-popover"
      exit={{ opacity: 0, y: -8, scale: 0.985 }}
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      role="dialog"
      style={{ maxWidth: 'calc(100% - 5rem)', width: MUSIC_POPOVER_WIDTH }}
      transition={motionTiming}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-primary)]">
            <MusicNotes className="size-4" weight="bold" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold tracking-normal">음악</h2>
            <p className="truncate text-xs text-[var(--nav-muted)]">{musicPlaying ? '재생 중' : '선택 후 재생'}</p>
          </div>
        </div>
        <button
          aria-label="음악 닫기"
          className="grid size-10 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" weight="bold" />
        </button>
      </div>
      <motion.div
        animate="visible"
        className="grid gap-3 px-4 py-4"
        initial="hidden"
        variants={{
          hidden: {
            transition: {
              staggerChildren: motionTiming.duration === 0 ? 0 : 0.035,
              staggerDirection: -1,
            },
          },
          visible: {
            transition: {
              delayChildren: motionTiming.duration === 0 ? 0 : 0.04,
              staggerChildren: motionTiming.duration === 0 ? 0 : 0.045,
            },
          },
        }}
      >
        <motion.label className="grid gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <span className="text-sm font-bold">검색</span>
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--nav-border)] bg-white px-3 text-[var(--nav-muted)]">
            <MagnifyingGlass className="size-4 shrink-0" weight="bold" />
            <input
              aria-label="음악 검색"
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-subtle)]"
              onChange={(event) => onSearchKeywordChange(event.target.value)}
              placeholder="곡, 분위기, 아티스트"
              value={musicSearchKeyword}
            />
          </div>
        </motion.label>
        <motion.div className="grid gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">추천 트랙</span>
            <span className="text-xs font-semibold text-[var(--nav-muted)]">
              {loading ? '불러오는 중' : `${filteredTracks.length}곡`}
            </span>
          </div>
          <div className="grid max-h-[18rem] gap-1 overflow-auto pr-1">
            {loading ? (
              <MusicRecommendationLoadingCard />
            ) : filteredTracks.length ? filteredTracks.map((track) => {
              const active = track.id === selectedTrack.id

              return (
                <button
                  aria-pressed={active}
                  className={[
                    'grid min-h-[4.75rem] grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                    active
                      ? 'border-[var(--nav-primary)] bg-[var(--nav-primary-soft)] shadow-[0_10px_24px_rgb(23_70_162/0.10)]'
                      : 'border-[var(--nav-border)] bg-white hover:bg-[var(--nav-panel)]',
                  ].join(' ')}
                  key={track.id}
                  onClick={() => onPickTrack(track.id)}
                  type="button"
                >
                  <MusicCover track={track} className="size-13 rounded-xl" iconClassName="size-5" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-[var(--nav-ink)]">{track.title}</span>
                    <span className="mt-0.5 block truncate text-xs font-semibold text-[var(--nav-muted)]">{track.artist}</span>
                    <span className="mt-1 block truncate text-[11px] font-medium text-[var(--nav-subtle)]">{track.album}</span>
                  </span>
                  <span className="grid justify-items-end">
                    <span className="text-xs font-bold text-[var(--nav-ink)]">{track.duration}</span>
                  </span>
                </button>
              )
            }) : (
              <div className="rounded-2xl border border-dashed border-[var(--nav-border)] px-3 py-6 text-center text-sm font-semibold text-[var(--nav-muted)]">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
          {error ? (
            <p className="text-xs font-semibold text-[var(--nav-muted)]">추천을 불러오지 못해 기본 목록을 표시합니다.</p>
          ) : null}
        </motion.div>
        <motion.div className="flex gap-2" variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
          <button
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onStartPlayback}
            type="button"
          >
            <Play className="size-4" weight="fill" />
            재생
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--nav-panel)] px-4 text-sm font-semibold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </motion.div>
      </motion.div>
    </motion.section>
  )
}

function MiniPlayer({
  activeRoute,
  motionTiming,
  musicPlaying,
  progressSeconds,
  selectedTrack,
  onClose,
  onTogglePlay,
}: {
  activeRoute: boolean
  motionTiming: MotionTiming
  musicPlaying: boolean
  progressSeconds: number
  selectedTrack: UiMusicTrack
  onClose: () => void
  onTogglePlay: () => void
}) {
  if (!musicPlaying) {
    return null
  }

  const bottom = activeRoute ? MUSIC_MINI_PLAYER_GUIDANCE_BOTTOM : MUSIC_MINI_PLAYER_IDLE_BOTTOM
  const isPlaying = musicPlaying
  const boundedProgressSeconds = Math.min(progressSeconds, selectedTrack.durationSeconds)
  const progressPercent = selectedTrack.durationSeconds > 0
    ? Math.min(100, Math.max(0, (boundedProgressSeconds / selectedTrack.durationSeconds) * 100))
    : 0

  return (
    <motion.div
      className="pointer-events-none absolute left-1/2 z-40 w-[min(31rem,calc(100%-1rem))] -translate-x-1/2"
      data-testid="music-mini-player"
      style={{ bottom }}
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.99 }}
      transition={motionTiming}
    >
      <div className="pointer-events-auto grid min-h-[2.75rem] grid-cols-[2.125rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-full border border-[rgb(16_24_40/0.07)] bg-white/94 px-2 py-1 shadow-[0_10px_24px_rgb(15_23_42/0.12)] backdrop-blur-md">
        <MusicCover track={selectedTrack} className="size-[2.125rem] rounded-full" iconClassName="size-4" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--nav-ink)]">{selectedTrack.title}</div>
            <div className="shrink-0 text-[11px] font-semibold text-[var(--nav-muted)]">{formatMusicDuration(boundedProgressSeconds)} / {selectedTrack.duration}</div>
          </div>
          <div className="mt-0.5 min-w-0 truncate text-xs font-medium text-[var(--nav-muted)]">{selectedTrack.artist}</div>
          <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--nav-border)]">
            <div className="h-full rounded-full bg-[var(--nav-primary)]" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label={isPlaying ? '음악 일시정지' : '음악 재생'}
            className="grid size-8 place-items-center rounded-full bg-[var(--nav-primary)] text-white transition hover:bg-[var(--nav-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onTogglePlay}
            type="button"
          >
            {isPlaying ? <Pause className="size-4" weight="fill" /> : <Play className="size-4" weight="fill" />}
          </button>
          <button
            aria-label="음악 닫기"
            className="grid size-8 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" weight="bold" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function MusicCover({
  track,
  className,
  iconClassName,
}: {
  track: UiMusicTrack
  className: string
  iconClassName: string
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        'relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br text-white shadow-[inset_0_-18px_30px_rgb(0_0_0/0.18)]',
        track.coverTone,
        className,
      ].join(' ')}
    >
      {track.coverUrl ? (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable={false}
          src={track.coverUrl}
        />
      ) : null}
      <span className="absolute inset-0 bg-black/10" />
      <MusicNotes className={['relative z-10', iconClassName].join(' ')} weight="bold" />
      <span className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-white/40" />
    </span>
  )
}

function SettingSlider({
  label,
  max,
  min,
  resetLabel,
  step,
  value,
  valueLabel,
  onChange,
  onDecrease,
  onIncrease,
  onReset,
}: {
  label: string
  max: number
  min: number
  resetLabel?: string
  step: number
  value: number
  valueLabel: string
  onChange: (value: number) => void
  onDecrease: () => void
  onIncrease: () => void
  onReset?: () => void
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{label}</span>
        <span className="rounded-full bg-[var(--nav-panel)] px-2 py-1 text-xs font-bold text-[var(--nav-muted)]">{valueLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          aria-label={`${label} 줄이기`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onDecrease}
          type="button"
        >
          <Minus className="size-4" weight="bold" />
        </button>
        <input
          aria-label={label}
          className="h-2 min-w-0 flex-1 accent-[var(--nav-primary)]"
          max={max}
          min={min}
          onChange={(event) => onChange(Number(event.target.value))}
          step={step}
          type="range"
          value={value}
        />
        <button
          aria-label={`${label} 키우기`}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--nav-panel)] text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onIncrease}
          type="button"
        >
          <Plus className="size-4" weight="bold" />
        </button>
        {onReset ? (
          <button
            aria-label={`${label} 초기화`}
            className="h-10 shrink-0 rounded-full bg-[var(--nav-panel)] px-3 text-xs font-bold text-[var(--nav-muted)] transition hover:bg-white hover:text-[var(--nav-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
            onClick={onReset}
            type="button"
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getNextMapCameraSettings(
  currentSettings: MapCameraSettings,
  settings: Partial<MapCameraSettings>,
): MapCameraSettings {
  const mode = settings.mode ?? currentSettings.mode
  const zoom = clamp(settings.zoom ?? currentSettings.zoom, MAP_SETTINGS_ZOOM_MIN, MAP_SETTINGS_ZOOM_MAX)

  if (mode === '2d') {
    return {
      mode,
      zoom,
      pitch: 0,
    }
  }

  return {
    mode,
    zoom,
    pitch: clamp(
      settings.pitch ?? (currentSettings.mode === '3d' ? currentSettings.pitch : MAP_SETTINGS_3D_DEFAULT_PITCH),
      MAP_SETTINGS_PITCH_MIN,
      MAP_SETTINGS_PITCH_MAX,
    ),
  }
}

function isSameMapCameraSettings(currentSettings: MapCameraSettings, nextSettings: MapCameraSettings) {
  return (
    currentSettings.mode === nextSettings.mode &&
    currentSettings.zoom === nextSettings.zoom &&
    currentSettings.pitch === nextSettings.pitch
  )
}

function isRouteKeywordDraftMismatched(keyword: string, place: Place | undefined) {
  const trimmedKeyword = keyword.trim()

  if (!trimmedKeyword || !place) {
    return false
  }

  return trimmedKeyword !== place.name && trimmedKeyword !== place.address
}

function getSavedPlacesForRouteField(
  savedPlaces: RouteSearchSavedPlace[],
  field: SearchFieldId,
): Place[] {
  return savedPlaces.filter((place) => !place.targetField || place.targetField === field)
}

function RouteSearchSheet({
  activeField,
  activeIndex,
  activeLabel,
  destinationKeyword,
  motionTiming,
  originKeyword,
  places,
  savedPlaces,
  searchHistoryPlaces,
  showSearchHistories,
  showSuggestions,
  onChangeOrigin,
  onChangeDestination,
  onClose,
  onBackToSummary,
  onFocusOrigin,
  onFocusDestination,
  onKeyDown,
  onSelectPlace,
  onSelectSearchHistory,
  onSelectSavedPlace,
  onFillOriginWithCurrentLocation,
}: {
  activeField: SearchFieldId | null
  activeIndex: number
  activeLabel: string
  destinationKeyword: string
  motionTiming: MotionTiming
  originKeyword: string
  places: Place[]
  savedPlaces: RouteSearchSavedPlace[]
  searchHistoryPlaces: Place[]
  showSearchHistories: boolean
  showSuggestions: boolean
  onChangeOrigin: (value: string) => void
  onChangeDestination: (value: string) => void
  onClose: () => void
  onBackToSummary: () => void
  onFocusOrigin: () => void
  onFocusDestination: () => void
  onKeyDown: (field: SearchFieldId, event: KeyboardEvent<HTMLInputElement>) => void
  onSelectPlace: (field: SearchFieldId, place: Place) => void
  onSelectSearchHistory: (field: SearchFieldId, place: Place) => void
  onSelectSavedPlace: (field: SearchFieldId, place: Place) => void
  onFillOriginWithCurrentLocation: () => void
}) {
  const activeListId = activeField ? `place-results-${activeField}` : 'place-results'
  const isEditingField = activeField !== null
  const activeFieldTitle = activeField === 'origin' ? '출발 위치' : '목적지'
  const routeSearchFieldsHeight = isEditingField
    ? ROUTE_SEARCH_EDITOR_FIELDS_HEIGHT
    : ROUTE_SEARCH_SUMMARY_FIELDS_HEIGHT
  const routeSearchLayoutTransition = {
    ease: motionTiming.duration === 0 ? undefined : [0.34, 0, 0.2, 1] as [number, number, number, number],
    duration: motionTiming.duration === 0 ? 0 : 0.36,
  }
  const routeSearchItemTransition = {
    ...motionTiming,
    duration: motionTiming.duration === 0 ? 0 : 0.18,
  }
  const routeSearchGroupVariants = {
    hidden: {
      transition: {
        staggerChildren: motionTiming.duration === 0 ? 0 : 0.035,
        staggerDirection: -1,
      },
    },
    visible: {
      transition: {
        delayChildren: motionTiming.duration === 0 ? 0 : 0.04,
        staggerChildren: motionTiming.duration === 0 ? 0 : 0.045,
      },
    },
  }
  const routeSearchElementVariants = {
    hidden: {
      opacity: 0,
      y: motionTiming.duration === 0 ? 0 : 8,
      scale: motionTiming.duration === 0 ? 1 : 0.985,
      transition: routeSearchItemTransition,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: routeSearchItemTransition,
    },
  }
  const renderSuggestions = (field: SearchFieldId) => {
    const showForField = showSuggestions && activeField === field
    const showHistoryForField = !showForField && showSearchHistories && activeField === field

    return (
      <div
        className="mt-3 min-h-[10.5rem] overflow-hidden rounded-xl"
        data-testid={showForField || showHistoryForField ? 'route-search-results' : 'route-search-results-empty'}
      >
        <AnimatePresence initial={false} mode="wait">
          {showForField ? (
            <PlaceResults
              activeIndex={activeIndex}
              key={`${field}-results`}
              label={activeLabel}
              listId={activeListId}
              motionTiming={motionTiming}
              places={places}
              onSelect={(place) => onSelectPlace(field, place)}
            />
          ) : showHistoryForField ? (
            <PlaceResults
              activeIndex={activeIndex}
              key={`${field}-history-results`}
              label="최근 검색 기록"
              listId={activeListId}
              motionTiming={motionTiming}
              places={searchHistoryPlaces}
              onSelect={(place) => onSelectSearchHistory(field, place)}
            />
          ) : (
            <motion.div
              aria-hidden="true"
              className="h-[10.5rem]"
              key={`${field}-empty`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={routeSearchItemTransition}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <motion.div
      className="pointer-events-none absolute bottom-18 left-1/2 z-20 w-[min(34rem,calc(100%-1.5rem))] -translate-x-1/2 text-[var(--nav-ink)] max-sm:bottom-15 max-sm:w-[calc(100%-1rem)]"
      initial={{ opacity: 0, y: 22, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.985 }}
      transition={routeSearchLayoutTransition}
    >
      <motion.div
        className="roadie-glass pointer-events-auto relative rounded-[1.35rem] p-3"
        transition={routeSearchLayoutTransition}
      >
        <motion.button
          aria-label="경로 검색 닫기"
          className="absolute -right-2 -top-2 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/92 text-[var(--nav-muted)] shadow-[0_4px_10px_rgba(15,23,42,0.10)] transition hover:text-[var(--nav-ink)]"
          onClick={onClose}
          whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.94 }}
          type="button"
        >
          <X className="h-4.5 w-4.5" weight="bold" />
        </motion.button>

        <motion.div
          animate={{ height: routeSearchFieldsHeight }}
          className="grid overflow-hidden"
          data-testid="route-search-fields"
          initial={false}
          transition={routeSearchLayoutTransition}
        >
            <AnimatePresence initial={false} mode="wait">
              {!isEditingField ? (
                <motion.div
                  animate="visible"
                  className="grid grid-cols-[1rem_1fr] gap-x-3 rounded-2xl bg-white/78 p-3 shadow-[0_6px_14px_rgb(15_23_42/0.06)] ring-1 ring-[rgb(148_163_184/0.14)]"
                  exit="hidden"
                  initial="hidden"
                  key="route-fields-summary"
                  variants={routeSearchGroupVariants}
                >
                  <motion.div
                    className="grid content-start justify-center pt-4.5"
                    variants={routeSearchElementVariants}
                  >
                    <span className="size-2 rounded-full bg-[var(--nav-primary)]" />
                    <span className="mx-auto h-[3.8rem] w-px bg-[var(--nav-border)]" />
                    <span className="size-2 rounded-full bg-[var(--nav-guidance)]" />
                  </motion.div>
                  <motion.div
                    className="grid gap-3"
                    variants={routeSearchGroupVariants}
                  >
                    <motion.div variants={routeSearchElementVariants}>
                      <SearchField
                        active={false}
                        activeOptionId={undefined}
                        expanded={false}
                        controlsId={undefined}
                        icon={<MapPin className="h-5 w-5" weight="bold" />}
                        label="출발 위치"
                        labelHidden
                        value={originKeyword}
                        onChange={onChangeOrigin}
                        onFocus={onFocusOrigin}
                        onKeyDown={(event) => onKeyDown('origin', event)}
                        placeholder="출발 위치"
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      <SearchField
                        active={false}
                        activeOptionId={undefined}
                        expanded={false}
                        controlsId={undefined}
                        icon={<MagnifyingGlass className="h-5 w-5" weight="bold" />}
                        label="목적지"
                        labelHidden
                        value={destinationKeyword}
                        onChange={onChangeDestination}
                        onFocus={onFocusDestination}
                        onKeyDown={(event) => onKeyDown('destination', event)}
                        placeholder="목적지"
                      />
                    </motion.div>
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  animate="visible"
                  className="min-w-0 rounded-2xl bg-white/78 p-3 shadow-[0_6px_14px_rgb(15_23_42/0.06)] ring-1 ring-[rgb(148_163_184/0.14)]"
                  exit="hidden"
                  initial="hidden"
                  key={`route-field-editor-${activeField}`}
                  variants={routeSearchGroupVariants}
                >
                <motion.div
                  className="mb-3 flex items-center gap-2"
                  variants={routeSearchElementVariants}
                >
                  <motion.button
                    aria-label="경로 입력으로 돌아가기"
                    className="grid h-9 w-9 place-items-center rounded-full text-[var(--nav-muted)] transition hover:bg-[var(--nav-panel)] hover:text-[var(--nav-ink)]"
                    onClick={onBackToSummary}
                    type="button"
                    whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.94 }}
                  >
                    <CaretLeft className="h-5 w-5" weight="bold" />
                  </motion.button>
                  <span className="text-[15px] font-bold text-[var(--nav-ink)]">{activeFieldTitle}</span>
                </motion.div>

                {activeField === 'origin' ? (
                  <>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SearchField
                        active
                        activeOptionId={showSuggestions || showSearchHistories ? `${activeListId}-option-${activeIndex}` : undefined}
                        autoFocus
                        expanded={showSuggestions || showSearchHistories}
                        controlsId={activeListId}
                        icon={<MapPin className="h-5 w-5" weight="bold" />}
                        label="출발 위치"
                        labelHidden
                        value={originKeyword}
                        onChange={onChangeOrigin}
                        onFocus={onFocusOrigin}
                        onKeyDown={(event) => onKeyDown('origin', event)}
                        placeholder="출발지 검색"
                      />
                    </motion.div>
                    <motion.div
                      className="min-w-0"
                      variants={routeSearchElementVariants}
                    >
                      <SavedPlaceButtons
                        field="origin"
                        places={getSavedPlacesForRouteField(savedPlaces, 'origin')}
                        onFillCurrentLocation={onFillOriginWithCurrentLocation}
                        onSelect={onSelectSavedPlace}
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      {renderSuggestions('origin')}
                    </motion.div>
                  </>
                ) : (
                  <>
                    <motion.div
                      variants={routeSearchElementVariants}
                    >
                      <SearchField
                        active
                        activeOptionId={showSuggestions || showSearchHistories ? `${activeListId}-option-${activeIndex}` : undefined}
                        autoFocus
                        expanded={showSuggestions || showSearchHistories}
                        controlsId={activeListId}
                        icon={<MagnifyingGlass className="h-5 w-5" weight="bold" />}
                        label="목적지"
                        labelHidden
                        value={destinationKeyword}
                        onChange={onChangeDestination}
                        onFocus={onFocusDestination}
                        onKeyDown={(event) => onKeyDown('destination', event)}
                        placeholder="목적지 검색"
                      />
                    </motion.div>
                    <motion.div
                      className="min-w-0"
                      variants={routeSearchElementVariants}
                    >
                      <SavedPlaceButtons
                        field="destination"
                        places={getSavedPlacesForRouteField(savedPlaces, 'destination')}
                        onSelect={onSelectSavedPlace}
                      />
                    </motion.div>
                    <motion.div variants={routeSearchElementVariants}>
                      {renderSuggestions('destination')}
                    </motion.div>
                  </>
                )}
                </motion.div>
              )}
            </AnimatePresence>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function IdleMapControls({
  motionTiming,
  searchOpen,
  showFallbackToast,
  onOpenSettings,
  onOpenSearch,
}: {
  motionTiming: MotionTiming
  searchOpen: boolean
  showFallbackToast: boolean
  onOpenSettings: () => void
  onOpenSearch: () => void
}) {
  const navigationBlocked = false

  return (
    <div className="pointer-events-none absolute inset-0 text-[var(--nav-ink)]">
      <AnimatePresence initial={false}>
        {!searchOpen ? (
          <motion.div
            className="absolute bottom-[59px] left-1/2 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 max-sm:bottom-[53px] max-sm:w-[min(22rem,calc(100%-1.5rem))]"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={motionTiming}
          >
            {showFallbackToast ? (
              <motion.div
                className="pointer-events-auto mb-2 flex min-h-11 items-center justify-between gap-3 rounded-full bg-white/86 px-4 py-2 text-sm font-medium text-[var(--nav-muted)] shadow-[0_8px_18px_rgb(15_23_42/0.10)] backdrop-blur max-sm:rounded-2xl max-sm:text-xs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={motionTiming}
              >
                <span className="min-w-0 truncate">세종대학교를 현재 위치로 사용 중입니다</span>
                <motion.button
                  className="shrink-0 rounded-full bg-[var(--nav-primary)] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--nav-primary-hover)]"
                  onClick={onOpenSettings}
                  type="button"
                  whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.96 }}
                >
                  설정 열기
                </motion.button>
              </motion.div>
            ) : null}
            <motion.button
              className="pointer-events-auto flex h-15 w-full items-center gap-3.5 rounded-full bg-white/90 px-5 text-left text-base font-semibold text-[var(--nav-ink)] shadow-[0_12px_28px_rgb(15_23_42/0.12)] backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:bg-white/80 disabled:text-[var(--nav-subtle)] max-sm:h-14 max-sm:px-5"
              disabled={navigationBlocked}
              onClick={onOpenSearch}
              type="button"
              whileHover={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 1.01 }}
              whileTap={navigationBlocked || motionTiming.duration === 0 ? undefined : { scale: 0.985 }}
            >
              <MagnifyingGlass className="h-5 w-5 text-[var(--nav-primary)]" weight="bold" />
              <span className="min-w-0 flex-1">어디로 갈까요?</span>
            </motion.button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function RouteSelectionSummary({
  activeRouteOptionId,
  destinationLabel,
  error,
  loading,
  motionTiming,
  optionCount,
  originLabel,
  onEditRoute,
  onPreviewRouteOption,
  onSelectRouteOption,
  routeOptions,
}: {
  activeRouteOptionId?: string
  destinationLabel: string
  error: boolean
  loading: boolean
  motionTiming: MotionTiming
  optionCount: number
  originLabel: string
  onEditRoute: () => void
  onPreviewRouteOption: (id: string | undefined) => void
  onSelectRouteOption: (id: string) => void
  routeOptions: NavigationRouteOption[]
}) {
  const statusLabel = error
    ? '경로를 찾지 못했습니다'
    : loading
      ? '경로 찾는 중'
      : `${optionCount}개 경로`
  const activeId = activeRouteOptionId ?? getDefaultRouteOptionId(routeOptions)

  return (
    <motion.div
      className="pointer-events-none absolute bottom-20 left-1/2 z-20 w-[calc(100%-2rem)] -translate-x-1/2 text-[var(--nav-ink)] max-sm:bottom-[4.5rem] max-sm:w-[calc(100%-1.5rem)]"
      data-testid="route-selection-summary"
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.985 }}
      transition={motionTiming}
    >
      {routeOptions.length ? (
        <div
          className="pointer-events-auto mx-auto mb-2 flex w-fit max-w-full gap-2 overflow-x-auto px-0.5 pb-1"
          data-testid="route-option-cards"
        >
          {routeOptions.map((option) => {
            const active = option.id === activeId
            const label = getRouteOptionDisplayLabel(option)

            return (
              <div key={option.id} className="flex w-36 shrink-0 flex-col items-stretch">
                <div className="mb-1 h-9">
                  <AnimatePresence initial={false}>
                    {active ? (
                      <motion.button
                        key="start-guidance"
                        aria-label={`${label} 안내 시작`}
                        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--nav-ink)] px-3 text-xs font-bold text-white shadow-[0_8px_18px_rgb(15_23_42/0.18)] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] active:scale-[0.98]"
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={motionTiming.duration === 0 ? { duration: 0 } : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSelectRouteOption(option.id)
                        }}
                        type="button"
                      >
                        <Play className="size-3.5" weight="fill" />
                        안내 시작
                      </motion.button>
                    ) : null}
                  </AnimatePresence>
                </div>
                <button
                  aria-label={`${label} 경로 보기`}
                  aria-pressed={active}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]',
                    active
                      ? 'border-[var(--nav-primary)] bg-[var(--nav-primary)] text-white'
                      : 'border-white/80 bg-white/88 text-[var(--nav-ink)]',
                  ].join(' ')}
                  data-testid={`route-option-card-${option.id}`}
                  onClick={() => onPreviewRouteOption(option.id)}
                  type="button"
                >
                  <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: active ? '#ffffff' : option.color }}
                    />
                    <span className="min-w-0 truncate text-xs font-extrabold">{label}</span>
                    {option.isRecommended ? (
                      <span className={[
                        'ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                        active ? 'bg-white/20 text-white' : 'bg-[var(--nav-selection)] text-[var(--nav-primary)]',
                      ].join(' ')}
                      >
                        추천
                      </span>
                    ) : null}
                  </div>
                  <div className={['text-base font-bold leading-none', active ? 'text-white' : 'text-[var(--nav-ink)]'].join(' ')}>
                    {formatRouteOptionDuration(option.route.summary.durationSeconds)}
                  </div>
                  <div className={['mt-1 truncate text-[11px] font-bold', active ? 'text-white/85' : 'text-[var(--nav-muted)]'].join(' ')}>
                    {formatRouteOptionDistance(option.route.summary.distanceMeters)}
                    <span className="mx-1">·</span>
                    {formatArrivalTime(option.route.summary.durationSeconds)} 도착
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="pointer-events-auto mx-auto flex w-[min(32rem,100%)] items-center gap-3 rounded-2xl bg-white/88 px-4 py-3 shadow-[0_10px_24px_rgb(15_23_42/0.10)] backdrop-blur-md">
        <div className="grid shrink-0 content-center justify-center">
          <span className="size-2 rounded-full bg-[var(--nav-primary)]" />
          <span className="mx-auto h-6 w-px bg-[var(--nav-border)]" />
          <span className="size-2 rounded-full bg-[var(--nav-guidance)]" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-[11px] font-semibold text-[var(--nav-muted)]">출발</span>
            <span className="min-w-0 truncate font-semibold">{originLabel}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-[11px] font-semibold text-[var(--nav-muted)]">도착</span>
            <span className="min-w-0 truncate font-semibold">{destinationLabel}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--nav-panel)] px-2.5 py-1 text-xs font-bold text-[var(--nav-muted)]">
          {statusLabel}
        </span>
        <button
          className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--nav-primary)] shadow-[0_3px_8px_rgba(15,23,42,0.1)] transition hover:bg-[var(--nav-selection)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)]"
          onClick={onEditRoute}
          type="button"
        >
          변경
        </button>
      </div>
    </motion.div>
  )
}

function RouteSearchLoadingModal({
  motionTiming,
  reducedMotion,
}: {
  motionTiming: MotionTiming
  reducedMotion: boolean
}) {
  return (
    <motion.div
      aria-label="경로 탐색 중"
      aria-live="polite"
      className="pointer-events-auto absolute inset-0 z-50 grid place-items-center bg-[rgb(15_23_42/0.18)] px-5 text-[var(--nav-ink)] backdrop-blur-[2px]"
      data-testid="route-search-loading-modal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={motionTiming}
    >
      <motion.div
        className="roadie-assistant-aura relative flex w-[min(19rem,calc(100vw-3rem))] flex-col items-center overflow-hidden rounded-3xl px-6 pb-6 pt-5 text-center shadow-[0_22px_56px_rgb(15_23_42/0.20)]"
        initial={{ opacity: 0, y: 10, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.985 }}
        transition={motionTiming.duration === 0 ? { duration: 0 } : { duration: 0.2, ease: PRODUCT_EASE }}
        role="status"
      >
        <div className="relative z-[1] grid place-items-center">
          {/* Project-local orb contract: docs/assistant/orb.md */}
          <VoiceOrb
            className="pointer-events-none [&_canvas]:mx-auto [&_canvas]:block"
            colorTheme="ocean"
            energy={0.72}
            reducedMotion={reducedMotion}
            size={148}
            state="thinking"
          />
        </div>
        <div className="relative z-[1] -mt-2 text-base font-bold">경로를 계산하고 있어요</div>
        <div className="relative z-[1] mt-1 text-xs font-semibold text-[var(--nav-muted)]">
          교통 흐름과 후보 경로를 비교하는 중
        </div>
      </motion.div>
    </motion.div>
  )
}

function DrivingHud({
  assist,
  guidance,
  hideActions = false,
  motionTiming,
  onEndGuidance,
  simulationRunning,
  onToggleSimulation,
}: {
  assist?: DrivingAssistInfo
  guidance?: ManeuverGuidance
  hideActions?: boolean
  motionTiming: MotionTiming
  onEndGuidance: () => void
  simulationRunning: boolean
  onToggleSimulation: () => void
}) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-40 text-[var(--nav-ink)]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={motionTiming}
    >
      <motion.div
        className="absolute left-0 top-0 w-fit max-w-[min(22rem,calc(100%-7rem))] overflow-hidden rounded-br-xl bg-[var(--nav-guidance)] text-white shadow-[0_5px_12px_rgba(13,97,65,0.18)] max-sm:max-w-[calc(100%-5rem)]"
        data-testid="primary-maneuver-card"
        initial={{ opacity: 0, x: -24, y: -8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={motionTiming}
      >
        <div className="flex h-[7rem] max-w-full items-center gap-3.5 py-3 pl-5 pr-8 max-sm:h-[5.75rem] max-sm:gap-3 max-sm:pl-3 max-sm:pr-5">
          <ManeuverIcon className="h-20 w-20 stroke-[3.5] max-sm:h-16 max-sm:w-16" type={guidance?.current.type ?? 'straight'} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold leading-none max-sm:text-4xl">{guidance?.current.distanceValue ?? '0'}</span>
              <span className="text-2xl font-bold max-sm:text-xl">{guidance?.current.distanceUnit ?? 'm'}</span>
            </div>
            <div className="mt-1 truncate text-2xl font-semibold max-sm:text-xl">{guidance?.current.label ?? '경로 안내'}</div>
          </div>
        </div>
      </motion.div>

      {guidance?.next ? (
        <motion.div
          className="absolute left-0 top-[7rem] flex h-14 w-fit max-w-[calc(100%-10rem)] items-center gap-3 rounded-br-xl bg-[var(--nav-guidance-strong)] py-0 pl-5 pr-7 text-white shadow-[0_4px_10px_rgba(13,97,65,0.16)] max-sm:top-[5.75rem] max-sm:h-12 max-sm:max-w-[calc(100%-7rem)] max-sm:pl-3 max-sm:pr-5"
          data-testid="next-maneuver-card"
          initial={{ opacity: 0, x: -18, y: -4 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.04 }}
        >
          <ManeuverIcon className="h-7 w-7 stroke-[3] max-sm:h-6 max-sm:w-6" type={guidance.next.type} />
          <span className="whitespace-nowrap text-2xl font-bold max-sm:text-xl">{guidance.next.distanceLabel}</span>
        </motion.div>
      ) : null}

      {assist ? (
        <DrivingAssistOverlay assist={assist} motionTiming={motionTiming} />
      ) : null}

      {hideActions ? null : (
        <motion.div
          className="absolute bottom-17 right-28 flex items-center gap-3 max-sm:bottom-16 max-sm:right-20"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTiming}
        >
          <motion.button
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-[var(--nav-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--nav-primary-hover)] max-sm:px-3"
            onClick={onToggleSimulation}
            type="button"
            whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.97 }}
          >
            {simulationRunning ? (
              <Stop className="h-4 w-4" weight="fill" />
            ) : (
              <Play className="h-4 w-4" weight="fill" />
            )}
            <span>{simulationRunning ? '시뮬레이션 중지' : '시뮬레이션 시작'}</span>
          </motion.button>
          <motion.button
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-white/95 px-4 text-sm font-semibold text-[var(--nav-ink)] shadow-[0_4px_10px_rgba(15,23,42,0.14)] transition hover:bg-white max-sm:px-3"
            onClick={onEndGuidance}
            type="button"
            whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.97 }}
          >
            <X className="h-4 w-4" weight="bold" />
            <span>길안내 종료</span>
          </motion.button>
        </motion.div>
      )}

    </motion.div>
  )
}

function DrivingAssistOverlay({
  assist,
  motionTiming,
}: {
  assist: DrivingAssistInfo
  motionTiming: MotionTiming
}) {
  return (
    <motion.div
      className="pointer-events-none absolute left-4 top-[11rem] z-40 max-sm:left-2 max-sm:top-[9rem]"
      data-testid="driving-assist-signs"
      initial={{ opacity: 0, x: -12, y: -4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...motionTiming, delay: motionTiming.duration === 0 ? 0 : 0.08 }}
    >
      <DrivingAssistSigns assist={assist} />
    </motion.div>
  )
}

function BottomStatusBar({
  arrivalLabel,
  currentLocationLabel,
  currentTimeLabel,
  destinationLabel,
  distanceLabel,
  durationLabel,
  hasRoute,
  motionTiming,
  weatherLabel,
}: {
  arrivalLabel: string
  currentLocationLabel: string
  currentTimeLabel: string
  destinationLabel: string
  distanceLabel: string
  durationLabel: string
  hasRoute: boolean
  motionTiming: MotionTiming
  weatherLabel: string
}) {
  const items = hasRoute
    ? [
        { label: '도착', value: `${arrivalLabel} 예정`, icon: <Clock className="h-5 w-5" weight="bold" /> },
        { label: '남은시간', value: durationLabel, icon: <Timer className="h-5 w-5" weight="bold" /> },
        { label: '목적지', value: destinationLabel, icon: <MapPin className="h-5 w-5" weight="bold" /> },
        { label: '남은거리', value: distanceLabel, icon: <RoadHorizon className="h-5 w-5" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-5 w-5" weight="bold" /> },
      ]
    : [
        { label: '시간', value: currentTimeLabel, icon: <Clock className="h-5 w-5" weight="bold" /> },
        { label: '현재 위치', value: currentLocationLabel, icon: <MapPin className="h-5 w-5" weight="bold" /> },
        { label: '날씨', value: weatherLabel, icon: <CloudSun className="h-5 w-5" weight="bold" /> },
      ]

  return (
    <motion.div
      data-testid="bottom-status-bar"
      className={[
        'absolute bottom-0 left-0 right-0 z-30 grid h-[43px] items-center rounded-tl-xl rounded-tr-none bg-white text-[var(--nav-ink)] shadow-[0_-8px_24px_rgba(15,23,42,0.10)] max-sm:h-[37px]',
        hasRoute ? 'grid-cols-5' : 'grid-cols-3',
      ].join(' ')}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTiming}
    >
      {items.map((item) => (
        <div
          aria-label={`${item.label} ${item.value}`}
          className="flex min-w-0 items-center justify-center gap-2.5 border-r border-[var(--nav-border)] px-4 text-center last:border-r-0 max-sm:gap-1.5 max-sm:px-1.5"
          key={item.label}
        >
          <span className="shrink-0 text-[var(--nav-muted)]">{item.icon}</span>
          <span className="min-w-0 truncate text-base font-bold leading-tight max-sm:text-sm">{item.value}</span>
        </div>
      ))}
    </motion.div>
  )
}

interface DrivingAssistInfo {
  alert?: {
    type?: SafetyAlert['type']
    label: string
    distanceLabel: string
    schoolZone: boolean
    active: boolean
  }
  facility?: {
    type: RouteManeuver['type']
    label: string
    distanceLabel: string
    signCode?: number
  }
  speedLimitKph?: number
}

interface ManeuverGuidanceItem {
  type: RouteManeuver['type']
  label: string
  distanceLabel: string
  distanceValue: string
  distanceUnit: string
}

interface ManeuverGuidance {
  current: ManeuverGuidanceItem
  next?: ManeuverGuidanceItem
}

interface GuidanceDistanceDisplayState {
  displayMeters: number
  updateKey?: number
}

type GuidanceDistanceDisplayStore = Map<string, GuidanceDistanceDisplayState>

function getManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
  distanceDisplayStore: GuidanceDistanceDisplayStore,
  distanceUpdateKey?: number,
): ManeuverGuidance | undefined {
  const maneuvers = (route.maneuvers ?? []).filter(isActionManeuver)

  if (maneuvers.length === 0) {
    return createFallbackManeuverGuidance(route, travelledDistanceMeters)
  }

  const currentIndex = maneuvers.findIndex((maneuver) => (
    maneuver.distanceFromStartMeters >= travelledDistanceMeters - 5
  ))
  const currentManeuver = currentIndex >= 0 ? maneuvers[currentIndex] : undefined
  const nextManeuver = currentIndex >= 0 ? maneuvers[currentIndex + 1] : undefined

  if (!currentManeuver) {
    return createFallbackManeuverGuidance(route, travelledDistanceMeters)
  }

  return {
    current: createManeuverGuidanceItem(
      currentManeuver,
      currentManeuver.distanceFromStartMeters - travelledDistanceMeters,
      distanceDisplayStore,
      distanceUpdateKey,
    ),
    next: nextManeuver
      ? createManeuverGuidanceItem(
        nextManeuver,
        nextManeuver.distanceFromStartMeters - travelledDistanceMeters,
        distanceDisplayStore,
        distanceUpdateKey,
      )
      : undefined,
  }
}

function isActionManeuver(maneuver: RouteManeuver) {
  return !isFacilityManeuver(maneuver)
}

function isFacilityManeuver(maneuver: RouteManeuver) {
  return [
    'underpass',
    'overpass',
    'tunnel',
    'bridge',
    'side-underpass',
    'side-overpass',
    'box-tunnel',
  ].includes(maneuver.type)
}

function createFallbackManeuverGuidance(
  route: NavigationRoute,
  travelledDistanceMeters: number,
): ManeuverGuidance {
  const remainingDistanceMeters = Math.max(0, route.summary.distanceMeters - travelledDistanceMeters)
  const distance = formatGuidanceDistance(remainingDistanceMeters)
  const isArriving = remainingDistanceMeters <= 30

  return {
    current: {
      type: isArriving ? 'arrive' : 'straight',
      label: isArriving ? '목적지' : '경로 따라 주행',
      distanceLabel: `${distance.value}${distance.unit}`,
      distanceValue: distance.value,
      distanceUnit: distance.unit,
    },
  }
}

function createManeuverGuidanceItem(
  maneuver: RouteManeuver,
  distanceMeters: number,
  distanceDisplayStore: GuidanceDistanceDisplayStore,
  updateKey?: number,
): ManeuverGuidanceItem {
  const displayDistanceMeters = getTimedGuidanceDistance(
    distanceDisplayStore,
    maneuver.id,
    distanceMeters,
    updateKey,
  )
  const distance = formatGuidanceDistance(displayDistanceMeters)

  return {
    type: maneuver.type,
    label: maneuver.label,
    distanceLabel: `${distance.value}${distance.unit}`,
    distanceValue: distance.value,
    distanceUnit: distance.unit,
  }
}

function getTimedGuidanceDistance(
  store: GuidanceDistanceDisplayStore,
  key: string,
  distanceMeters: number,
  updateKey?: number,
) {
  const actualMeters = Math.max(0, Math.round(distanceMeters))

  if (actualMeters >= 1000 || updateKey === undefined) {
    store.delete(key)
    return actualMeters
  }

  const existing = store.get(key)

  if (
    !existing ||
    existing.updateKey !== updateKey ||
    actualMeters > existing.displayMeters ||
    actualMeters === 0
  ) {
    const nextState = {
      displayMeters: actualMeters,
      updateKey,
    }
    store.set(key, nextState)
    return nextState.displayMeters
  }

  return existing.displayMeters
}

function formatGuidanceDistance(distanceMeters: number) {
  const rounded = Math.max(0, Math.round(distanceMeters))

  if (rounded >= 1000) {
    return {
      value: (rounded / 1000).toFixed(1),
      unit: 'km',
    }
  }

  return {
    value: String(rounded),
    unit: 'm',
  }
}

function ManeuverIcon({
  className,
  type,
}: {
  className: string
  type: RouteManeuver['type']
}) {
  if (type === 'left') return <img alt="" className={`${className} object-contain`} src={leftManeuverSrc} />
  if (type === 'right') return <img alt="" className={`${className} object-contain`} src={rightManeuverSrc} />
  if (type === 'highway-exit' || type === 'urban-express-exit') return <ArrowBendUpRight className={className} weight="bold" />
  if (type === 'clock-direction') return <ArrowBendUpRight className={className} weight="bold" />
  if (type === 'arrive') return <MapPin className={className} data-testid="arrive-maneuver-map-pin-icon" weight="bold" />
  if (type === 'caution') return <Warning className={className} weight="bold" />
  return <ArrowUp className={className} weight="bold" />
}

function DrivingAssistSigns({ assist }: { assist: DrivingAssistInfo }) {
  const hasEventSign = Boolean(assist.alert || assist.facility)

  return (
    <div className="grid w-30 justify-items-start gap-2 max-sm:w-24">
      {assist.speedLimitKph ? (
        <div className="grid justify-items-start" data-testid="speed-limit-slot">
          <SpeedLimitSign speed={assist.speedLimitKph} />
        </div>
      ) : null}

      {hasEventSign ? (
        <div className="grid w-full gap-2" data-testid="driving-event-signs">
          {assist.alert ? (
            <div
              aria-label={[
                assist.alert.label,
                assist.alert.distanceLabel,
                assist.alert.active ? '' : '남음',
              ].filter(Boolean).join(' ')}
              className="grid justify-items-center"
            >
              {assist.alert.schoolZone ? (
                <WarningImageSign src={schoolZoneSignSrc} />
              ) : (
                <WarningImageSign src={getWarningSignSrc(assist.alert.type)} />
              )}
              <DistancePlaque label={assist.alert.distanceLabel} tone="danger" />
            </div>
          ) : null}
          {assist.facility ? (
            <div
              aria-label={`${assist.facility.label} ${assist.facility.distanceLabel} 남음`}
              className="grid justify-items-center"
            >
              <FacilitySign facility={assist.facility} />
              <DistancePlaque label={assist.facility.distanceLabel} tone="info" />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function WarningImageSign({ src }: { src: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.26)]"
      draggable={false}
      src={src}
    />
  )
}

function getWarningSignSrc(type?: SafetyAlert['type']) {
  if (type === 'curve') return curveSignSrc
  if (type === 'falling-rock') return fallingRockSignSrc
  if (type === 'accident') return accidentSignSrc
  return cautionSignSrc
}

function FacilitySign({ facility }: { facility: NonNullable<DrivingAssistInfo['facility']> }) {
  const signSrc = getFacilitySignSrc(facility.signCode)

  return (
    <div className="grid w-full justify-items-center">
      <img
        alt=""
        aria-hidden="true"
        className="h-auto w-full drop-shadow-[0_4px_8px_rgba(15,23,42,0.24)]"
        draggable={false}
        src={signSrc}
      />
      <span className="sr-only">{facility.label}</span>
    </div>
  )
}

function getFacilitySignSrc(signCode?: number) {
  if (signCode === 120) return overpassSignSrc
  if (signCode === 121) return tunnelSignSrc
  if (signCode === 122) return bridgeSignSrc
  if (signCode === 123) return sideUnderpassSignSrc
  if (signCode === 124) return sideOverpassSignSrc
  if (signCode === 130) return boxTunnelSignSrc
  return underpassSignSrc
}

function DistancePlaque({ label, tone }: { label: string; tone: 'danger' | 'info' }) {
  return (
    <div className={[
      'mt-[-2px] w-full rounded-b-md px-2 py-1 text-center text-2xl font-bold leading-none text-white shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:text-xl',
      tone === 'danger' ? 'bg-[#E84B2F]' : 'bg-[#1267B1]',
    ].join(' ')}
    >
      {label}
    </div>
  )
}

function SpeedLimitSign({ speed }: { speed: number }) {
  return (
    <div
      aria-label={`제한속도 ${speed}km/h`}
      className="grid size-24 place-items-center rounded-full border-[12px] border-[#E30613] bg-white text-center font-bold leading-none text-[#1C1411] shadow-[0_4px_8px_rgba(15,23,42,0.22)] max-sm:size-20 max-sm:border-[10px]"
    >
      <span className="text-[2.65rem] max-sm:text-[2.15rem]">{speed}</span>
    </div>
  )
}

function getDrivingAssistInfo({
  position,
  roadMatches,
  route,
  travelledDistanceMeters,
}: {
  position?: Coordinate
  roadMatches: RoadMatchPoint[]
  route?: NavigationRoute
  travelledDistanceMeters: number
}): DrivingAssistInfo | undefined {
  const alerts = route?.safetyAlerts ?? []
  const activeAlert = alerts.find((alert) => isActiveSafetyAlert(alert, travelledDistanceMeters))
  const upcomingAlert = alerts.find((alert) => (
    alert.distanceFromStartMeters >= travelledDistanceMeters &&
    alert.distanceFromStartMeters - travelledDistanceMeters <= 600
  ))
  const upcomingFacility = (route?.maneuvers ?? []).find((maneuver) => (
    isFacilityManeuver(maneuver) &&
    maneuver.distanceFromStartMeters >= travelledDistanceMeters &&
    maneuver.distanceFromStartMeters - travelledDistanceMeters <= 600
  ))
  const nearestRoadMatch = position
    ? getNearestRoadMatch(roadMatches, position)
    : roadMatches[0]
  const speedLimitKph = nearestRoadMatch?.speedLimitKph

  const assist: DrivingAssistInfo = {}

  const displayAlert = activeAlert ?? upcomingAlert

  if (displayAlert) {
    const active = displayAlert === activeAlert
    assist.alert = {
      type: displayAlert.type,
      label: displayAlert.label,
      distanceLabel: active ? '구간 내' : formatMeters(displayAlert.distanceFromStartMeters - travelledDistanceMeters),
      schoolZone: isSchoolZoneAlert(displayAlert),
      active,
    }
  }

  if (upcomingFacility) {
    assist.facility = {
      type: upcomingFacility.type,
      label: upcomingFacility.label,
      distanceLabel: formatMeters(upcomingFacility.distanceFromStartMeters - travelledDistanceMeters),
      signCode: upcomingFacility.signCode,
    }
  }

  if (speedLimitKph) {
    assist.speedLimitKph = speedLimitKph
  }

  return assist.alert || assist.facility || assist.speedLimitKph ? assist : undefined
}

function getNearestRoadMatch(roadMatches: RoadMatchPoint[], position: Coordinate) {
  return roadMatches.reduce<RoadMatchPoint | undefined>((nearest, roadMatch) => {
    if (!nearest) {
      return roadMatch
    }

    return getApproximateSquaredDistance(roadMatch.coordinate, position) <
      getApproximateSquaredDistance(nearest.coordinate, position)
      ? roadMatch
      : nearest
  }, undefined)
}

function isSchoolZoneAlert(alert: SafetyAlert) {
  return /어린이|보호구역|school/i.test(`${alert.label} ${alert.description}`)
}

function isActiveSafetyAlert(alert: SafetyAlert, travelledDistanceMeters: number) {
  const activeDistanceMeters = getActiveSafetyAlertDistanceMeters(alert)

  return (
    activeDistanceMeters > 0 &&
    travelledDistanceMeters >= alert.distanceFromStartMeters &&
    travelledDistanceMeters <= alert.distanceFromStartMeters + activeDistanceMeters
  )
}

function getActiveSafetyAlertDistanceMeters(alert: SafetyAlert) {
  if (isSchoolZoneAlert(alert)) return 300
  if (alert.type === 'enforcement') return 500
  if (alert.type === 'accident') return 300
  if (alert.type === 'curve') return 120
  if (alert.type === 'falling-rock') return 150
  if (alert.type === 'caution') return 150
  return 0
}

function formatMeters(distanceMeters: number) {
  const rounded = Math.max(0, Math.round(distanceMeters))
  return rounded >= 1000 ? `${(rounded / 1000).toFixed(1)}km` : `${rounded}m`
}

function formatRouteOptionDuration(durationSeconds: number) {
  return `${Math.max(1, Math.round(durationSeconds / 60))}분`
}

function formatMusicDuration(durationSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(durationSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function getNextMusicTrackId(tracks: UiMusicTrack[], currentTrackId: string) {
  if (!tracks.length) {
    return currentTrackId
  }

  const currentIndex = tracks.findIndex((track) => track.id === currentTrackId)
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % tracks.length : 0

  return tracks[nextIndex]?.id ?? currentTrackId
}

function formatRouteOptionDistance(distanceMeters: number) {
  return `${Math.max(0.1, distanceMeters / 1000).toFixed(1)} km`
}

function getRouteOptionDisplayLabel(option: NavigationRouteOption) {
  return option.isRecommended && option.label === '추천' ? '최적 경로' : option.label
}

function getDefaultRouteOptionId(options: NavigationRouteOption[]) {
  return options.find((option) => option.isRecommended)?.id ?? options[0]?.id
}

function getApproximateSquaredDistance(from: Coordinate, to: Coordinate) {
  const latDelta = from.lat - to.lat
  const lngDelta = from.lng - to.lng

  return latDelta * latDelta + lngDelta * lngDelta
}

function formatArrivalTime(durationSeconds: number) {
  const arrival = new Date(Date.now() + durationSeconds * 1000)
  const hours = arrival.getHours()
  const period = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 || 12
  const minutes = arrival.getMinutes().toString().padStart(2, '0')

  return `${period} ${hour12.toString().padStart(2, '0')}:${minutes}`
}

function formatClockTime(date: Date) {
  const hours = date.getHours()
  const period = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 || 12
  const minutes = date.getMinutes().toString().padStart(2, '0')

  return `${period} ${hour12.toString().padStart(2, '0')}:${minutes}`
}

function useDrivingAssistDebugSequence(hasRoute: boolean) {
  const debugEnabled = hasRoute && isDrivingAssistDebugSequenceEnabled()
  const [debugIndex, setDebugIndex] = useState(0)

  useEffect(() => {
    if (!debugEnabled) {
      setDebugIndex(0)
      return
    }

    const timer = window.setInterval(() => {
      setDebugIndex((index) => (index + 1) % DEBUG_DRIVING_ASSIST_SEQUENCE.length)
    }, DRIVING_ASSIST_DEBUG_SEQUENCE_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [debugEnabled])

  if (!debugEnabled) {
    return undefined
  }

  return DEBUG_DRIVING_ASSIST_SEQUENCE[debugIndex]
}

function isDrivingAssistDebugSequenceEnabled() {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).get(DRIVING_ASSIST_DEBUG_QUERY_PARAM) === '1'
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debouncedValue
}

function roundCoordinate(coordinate: Coordinate, precision: number): Coordinate {
  return {
    lat: roundNumber(coordinate.lat, precision),
    lng: roundNumber(coordinate.lng, precision),
  }
}

function createCurrentRoadMatchCoordinates(coordinate: Coordinate): Coordinate[] {
  return [
    coordinate,
    {
      lat: coordinate.lat,
      lng: coordinate.lng + 0.0002,
    },
  ]
}

function roundNumber(value: number, precision: number) {
  const factor = 10 ** precision

  return Math.round(value * factor) / factor
}

async function getCurrentWeatherLabel(position: Coordinate) {
  const params = new URLSearchParams({
    latitude: String(position.lat),
    longitude: String(position.lng),
    current: 'temperature_2m,weather_code',
    timezone: 'Asia/Seoul',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)

  if (!response.ok) {
    throw new Error('날씨 정보를 불러오지 못했습니다.')
  }

  const data = await response.json() as {
    current?: {
      temperature_2m?: number
      weather_code?: number
    }
  }
  const temperature = data.current?.temperature_2m
  const weatherCode = data.current?.weather_code

  if (typeof temperature !== 'number') {
    return '정보 없음'
  }

  return `${getWeatherConditionLabel(weatherCode)} ${Math.round(temperature)}°`
}

function getWeatherConditionLabel(code?: number) {
  if (code === 0) return '맑음'
  if (code === 1 || code === 2) return '대체로 맑음'
  if (code === 3) return '흐림'
  if (typeof code === 'number' && code >= 45 && code <= 48) return '안개'
  if (typeof code === 'number' && code >= 51 && code <= 67) return '비'
  if (typeof code === 'number' && code >= 71 && code <= 77) return '눈'
  if (typeof code === 'number' && code >= 80 && code <= 82) return '소나기'
  if (typeof code === 'number' && code >= 95) return '뇌우'

  return '날씨'
}

function PlaceResults({
  activeIndex,
  label,
  listId,
  motionTiming,
  places,
  onSelect,
}: {
  activeIndex: number
  label: string
  listId: string
  motionTiming: MotionTiming
  places: Place[]
  onSelect: (place: Place) => void
}) {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    const activeOption = optionRefs.current[activeIndex]

    if (typeof activeOption?.scrollIntoView !== 'function') {
      return
    }

    activeOption.scrollIntoView({
      block: 'nearest',
    })
  }, [activeIndex])

  return (
    <motion.div
      id={listId}
      role="listbox"
      aria-label={label}
      className="max-h-[10.5rem] overflow-hidden"
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.99 }}
      transition={motionTiming}
    >
      <div className="max-h-[10.5rem] overflow-y-auto p-1.5">
        {places.map((place, index) => (
          <motion.button
            key={place.id}
            ref={(element) => {
              optionRefs.current[index] = element
            }}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            type="button"
            className={[
              'grid min-h-12 w-full gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
              index === activeIndex ? 'bg-[var(--nav-selection)] text-[var(--nav-ink)]' : 'text-[var(--nav-ink)] hover:bg-[var(--nav-selection)]',
            ].join(' ')}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              ...motionTiming,
              delay: motionTiming.duration === 0 ? 0 : Math.min(index, 5) * 0.025,
            }}
            whileTap={motionTiming.duration === 0 ? undefined : { scale: 0.99 }}
            onClick={() => onSelect(place)}
          >
            <span className="block font-medium text-[var(--nav-ink)]">{place.name}</span>
            <span className="block truncate text-xs text-[var(--nav-muted)]">{place.address || '주소 정보 없음'}</span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

function SearchField({
  active,
  activeOptionId,
  autoFocus = false,
  controlsId,
  expanded,
  icon,
  label,
  labelHidden = false,
  value,
  onChange,
  onFocus,
  onKeyDown,
  placeholder,
}: {
  active: boolean
  activeOptionId?: string
  autoFocus?: boolean
  controlsId?: string
  expanded: boolean
  icon: React.ReactNode
  label: string
  labelHidden?: boolean
  value: string
  onChange: (value: string) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  placeholder: string
}) {
  return (
    <label className="block text-sm">
      <span className={[
        'mb-2 block font-semibold text-[var(--nav-muted)]',
        labelHidden ? 'sr-only' : '',
      ].join(' ')}
      >
        {label}
      </span>
      <span
        className={[
          'flex h-13 items-center gap-2.5 rounded-xl border px-3.5 py-1.5 text-[var(--nav-muted)] transition',
          active ? 'border-[var(--nav-primary)] bg-white shadow-[0_0_0_3px_var(--nav-focus-ring)]' : 'border-transparent bg-white',
        ].join(' ')}
      >
        {icon}
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-controls={controlsId}
          aria-expanded={expanded}
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-[var(--nav-ink)] outline-none placeholder:text-[var(--nav-muted)]"
          placeholder={placeholder}
        />
      </span>
    </label>
  )
}

function SavedPlaceButtons({
  field,
  places,
  onFillCurrentLocation,
  onSelect,
}: {
  field: SearchFieldId
  places: Place[]
  onFillCurrentLocation?: () => void
  onSelect: (field: SearchFieldId, place: Place) => void
}) {
  const fieldLabel = field === 'origin' ? '출발지' : '도착지'

  return (
    <div
      className="mt-2 flex w-full max-w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overflow-y-hidden pb-1"
      aria-label={`${fieldLabel} 빠른 설정`}
    >
      {onFillCurrentLocation ? (
        <button
          aria-label={`${fieldLabel}를 현재 위치로 설정`}
          className="inline-flex min-h-10 w-fit shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[var(--nav-panel)] px-3 text-[13px] font-semibold text-[var(--nav-primary)] transition hover:bg-[var(--nav-selection)]"
          onClick={onFillCurrentLocation}
          type="button"
        >
          <MapPin className="h-4 w-4" weight="bold" />
          <span>현재 위치</span>
        </button>
      ) : null}
      {places.map((place) => (
        <button
          aria-label={`${fieldLabel}를 ${formatSavedPlaceDirection(place.name)} 설정`}
          className="inline-flex min-h-10 w-fit shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[var(--nav-panel)] px-3 text-[13px] font-semibold text-[var(--nav-ink)] transition hover:bg-[var(--nav-selection)]"
          key={`${field}-${place.id}`}
          onClick={() => onSelect(field, place)}
          type="button"
        >
          {place.id === 'saved-home' ? (
            <HouseLine className="h-4 w-4 text-[var(--nav-primary)]" weight="bold" />
          ) : (
            <Buildings className="h-4 w-4 text-[var(--nav-primary)]" weight="bold" />
          )}
          <span>{place.name}</span>
        </button>
      ))}
    </div>
  )
}

function formatSavedPlaceDirection(name: string) {
  return name === '회사' ? '회사로' : `${name}으로`
}
