export interface Coordinate {
  lat: number
  lng: number
}

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
  type: 'left' | 'right' | 'straight' | 'arrive' | 'caution'
  label: string
  description: string
  coordinate: Coordinate
  distanceFromStartMeters: number
}

export interface RoadMatchPoint {
  sourceIndex: number
  coordinate: Coordinate
  speedLimitKph?: number
  roadCategory?: number
}

export interface NavigationRoute {
  coordinates: Coordinate[]
  summary: RouteSummary
  maneuvers?: RouteManeuver[]
  safetyAlerts?: SafetyAlert[]
}
