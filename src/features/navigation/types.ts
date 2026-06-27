export interface Coordinate {
  lat: number
  lng: number
}

export type TrafficCongestion = 0 | 1 | 2 | 3 | 4

export interface Place {
  id: string
  name: string
  address: string
  coordinate: Coordinate
}

export interface RouteSummary {
  distanceMeters: number
  durationSeconds: number
  roadName?: string
  roadType?: string
  speedLimitKph?: number
}

export interface SafetyAlert {
  id: string
  type: 'speed-limit' | 'accident' | 'curve' | 'falling-rock' | 'enforcement' | 'caution'
  label: string
  description: string
  coordinate: Coordinate
  distanceFromStartMeters: number
}

export interface RouteManeuver {
  id: string
  type:
    | 'left'
    | 'right'
    | 'straight'
    | 'arrive'
    | 'caution'
    | 'highway-enter'
    | 'highway-exit'
    | 'urban-express-enter'
    | 'urban-express-exit'
    | 'underpass'
    | 'overpass'
    | 'tunnel'
    | 'bridge'
    | 'side-underpass'
    | 'side-overpass'
    | 'box-tunnel'
    | 'clock-direction'
  label: string
  description: string
  coordinate: Coordinate
  distanceFromStartMeters: number
  directionClock?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
  facilityType?: 'underpass' | 'overpass' | 'tunnel' | 'bridge' | 'box-tunnel'
  roadClass?: 'highway' | 'urban-express'
  accessType?: 'enter' | 'exit'
  signCode?: number
}

export interface RoadMatchPoint {
  sourceIndex: number
  coordinate: Coordinate
  speedLimitKph?: number
  roadCategory?: number
}

export interface RouteTrafficSegment {
  coordinates: Coordinate[]
  congestion: TrafficCongestion
}

export interface NavigationRoute {
  coordinates: Coordinate[]
  summary: RouteSummary
  maneuvers?: RouteManeuver[]
  safetyAlerts?: SafetyAlert[]
  trafficSegments?: RouteTrafficSegment[]
}
