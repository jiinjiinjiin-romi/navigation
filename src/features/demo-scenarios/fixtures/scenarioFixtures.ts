import type {
  DemoScenarioDefinition,
  DemoSetupEvent,
} from '../types'
import scenarioDatabase from '../data/scenario-db.json'

export const DEMO_DESTINATION = {
  name: '오씨칼국수 본점',
  query: '오씨칼국수 본점',
  address: '대전 동구 옛신탄진로 13',
}

export const COMMON_DRIVING_SETUP_EVENTS: DemoSetupEvent[] = [
  {
    id: 'setup_driving_screen_opened',
    eventType: 'DRIVING_SCREEN_OPENED',
    title: '주행 화면 진입',
    visibleStatus: '주행 화면 준비',
    description: '선택한 프로필로 주행 화면을 준비합니다.',
    lockedNavigation: true,
    nextEventId: 'setup_route_search_opened',
  },
  {
    id: 'setup_route_search_opened',
    eventType: 'ROUTE_SEARCH_OPENED',
    title: '목적지 검색 열림',
    visibleStatus: '목적지 검색 준비',
    description: '목적지를 검색할게요.',
    lockedNavigation: true,
    nextEventId: 'setup_destination_candidate_shown',
  },
  {
    id: 'setup_destination_candidate_shown',
    eventType: 'DESTINATION_CANDIDATE_SHOWN',
    title: '목적지 검색 결과 표시',
    visibleStatus: '목적지 검색 결과',
    description: `${DEMO_DESTINATION.name} 검색 결과를 찾았어요.`,
    lockedNavigation: true,
    nextEventId: 'setup_destination_selected',
  },
  {
    id: 'setup_destination_selected',
    eventType: 'DESTINATION_SELECTED',
    title: '목적지 선택',
    visibleStatus: '목적지 선택 완료',
    description: `${DEMO_DESTINATION.name}로 안내할게요.`,
    lockedNavigation: true,
    nextEventId: 'setup_recommended_route_selected',
  },
  {
    id: 'setup_recommended_route_selected',
    eventType: 'RECOMMENDED_ROUTE_SELECTED',
    title: '추천 경로 선택',
    visibleStatus: '추천 경로 선택 완료',
    description: '가장 적합한 추천 경로를 선택할게요.',
    lockedNavigation: true,
    nextEventId: 'setup_simulation_started',
  },
  {
    id: 'setup_simulation_started',
    eventType: 'SIMULATION_STARTED',
    title: '안내 시작 및 운전 시작',
    visibleStatus: '운전 시작',
    description: '목적지 안내와 운전을 시작합니다.',
    lockedNavigation: true,
    nextEventId: null,
  },
]

export const DEMO_SCENARIOS = scenarioDatabase.scenarios as DemoScenarioDefinition[]
