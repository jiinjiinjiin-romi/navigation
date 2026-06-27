import axios from 'axios'
import type {
  Coordinate,
  NavigationRoute,
  Place,
  RoadMatchPoint,
  RouteManeuver,
  RouteTrafficSegment,
  SafetyAlert,
  TrafficCongestion,
} from '../types'

interface HttpClient {
  get: typeof axios.get
  post: typeof axios.post
}

interface TmapPoi {
  id?: string
  name?: string
  upperAddrName?: string
  middleAddrName?: string
  lowerAddrName?: string
  detailAddrName?: string
  frontLat?: string
  frontLon?: string
  noorLat?: string
  noorLon?: string
}

interface TmapPoiSearchResponse {
  searchPoiInfo?: {
    pois?: {
      poi?: TmapPoi[]
    }
  }
}

interface TmapFeature {
  geometry?: {
    type?: string
    coordinates?: unknown
    traffic?: unknown
  }
  properties?: {
    index?: number | string
    pointIndex?: number | string
    pointType?: string
    turnType?: number | string
    name?: string
    description?: string
    nextRoadName?: string
    distance?: number | string
    roadType?: number | string
    facilityType?: number | string
    congestion?: number | string
    totalDistance?: number | string
    totalTime?: number | string
  }
}

interface TmapRouteResponse {
  features?: TmapFeature[]
}

interface TmapReverseGeocodeResponse {
  addressInfo?: {
    fullAddress?: string
    roadAddress?: string
    city_do?: string
    gu_gun?: string
    eup_myun?: string
    legalDong?: string
    adminDong?: string
    ri?: string
    bunji?: string
  }
}

interface TmapRoadMatchPoint {
  sourceIndex?: number
  matchedLocation?: {
    latitude?: string | number
    longitude?: string | number
  }
  mathedLocation?: {
    latitude?: string | number
    longitude?: string | number
  }
  speed?: number
  roadCategory?: number
}

interface TmapRoadMatchResponse {
  matchedPoints?: TmapRoadMatchPoint[]
  resultData?: {
    matchedPoints?: TmapRoadMatchPoint[]
  }
}

export async function searchPlaces(
  keyword: string,
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<Place[]> {
  const trimmed = keyword.trim()

  if (!trimmed) {
    return []
  }

  const { data } = await client.get<TmapPoiSearchResponse>('/api/tmap/pois', {
    params: { keyword: trimmed },
    ...withSignal(signal),
  })

  return normalizePlaces(data)
}

export async function getRoute(
  origin: Coordinate,
  destination: Coordinate,
  client: Pick<HttpClient, 'post'> = axios,
  signal?: AbortSignal,
): Promise<NavigationRoute> {
  const payload = {
    origin,
    destination,
  }
  const { data } = signal
    ? await client.post<TmapRouteResponse>('/api/tmap/routes', payload, { signal })
    : await client.post<TmapRouteResponse>('/api/tmap/routes', payload)

  return normalizeRoute(data)
}

export async function getCurrentAddress(
  coordinate: Coordinate,
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<string> {
  const { data } = await client.get<TmapReverseGeocodeResponse>('/api/tmap/reverse-geocode', {
    params: coordinate,
    ...withSignal(signal),
  })

  return normalizeCurrentAddress(data)
}

export async function getRoadMatch(
  coordinates: Coordinate[],
  client: Pick<HttpClient, 'post'> = axios,
  signal?: AbortSignal,
): Promise<RoadMatchPoint[]> {
  if (coordinates.length < 2) {
    return []
  }

  const payload = {
    coordinates: sampleRoadMatchCoordinates(coordinates),
  }
  const { data } = signal
    ? await client.post<TmapRoadMatchResponse>('/api/tmap/road-match', payload, { signal })
    : await client.post<TmapRoadMatchResponse>('/api/tmap/road-match', payload)

  return normalizeRoadMatch(data)
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}

function normalizePlaces(data: TmapPoiSearchResponse): Place[] {
  const pois = data.searchPoiInfo?.pois?.poi ?? []

  return pois.flatMap((poi, index) => {
    const lat = Number(poi.frontLat ?? poi.noorLat)
    const lng = Number(poi.frontLon ?? poi.noorLon)

    if (!poi.name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return []
    }

    return [
      {
        id: `${poi.id ?? poi.name}-${lat}-${lng}-${index}`,
        name: poi.name,
        address: [
          poi.upperAddrName,
          poi.middleAddrName,
          poi.lowerAddrName,
          poi.detailAddrName,
        ].filter(Boolean).join(' '),
        coordinate: { lat, lng },
      },
    ]
  })
}

function normalizeRoute(data: TmapRouteResponse): NavigationRoute {
  const features = data.features ?? []
  const coordinates = features.flatMap((feature) => extractLineCoordinates(feature.geometry))
  const firstProperties = features[0]?.properties
  const trafficSegments = normalizeTrafficSegments(features)

  return {
    coordinates,
    summary: {
      distanceMeters: Number(firstProperties?.totalDistance ?? 0),
      durationSeconds: Number(firstProperties?.totalTime ?? 0),
    },
    maneuvers: normalizeManeuvers(features, coordinates),
    safetyAlerts: normalizeSafetyAlerts(features, coordinates),
    ...(trafficSegments.length ? { trafficSegments } : {}),
  }
}

function extractLineCoordinates(geometry?: TmapFeature['geometry']): Coordinate[] {
  if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) {
    return []
  }

  if (geometry.type === 'LineString') {
    return geometry.coordinates
      .flatMap((coord) => parseCoordinate(coord))
      .filter((coord): coord is Coordinate => coord !== null)
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates
      .flatMap((segment) => {
        if (!Array.isArray(segment)) {
          return []
        }

        return segment.flatMap((coord) => parseCoordinate(coord))
      })
      .filter((coord): coord is Coordinate => coord !== null)
  }

  return []
}

function normalizeTrafficSegments(features: TmapFeature[]): RouteTrafficSegment[] {
  return features.flatMap((feature) => {
    const coordinates = extractLineCoordinates(feature.geometry)
    const congestion = getTrafficCongestion(feature)

    if (coordinates.length < 2 || congestion === undefined) {
      return []
    }

    return [{
      coordinates,
      congestion,
    }]
  })
}

function getTrafficCongestion(feature: TmapFeature): TrafficCongestion | undefined {
  const propertyCongestion = Number(feature.properties?.congestion)

  if (isTrafficCongestion(propertyCongestion)) {
    return propertyCongestion
  }

  if (Array.isArray(feature.geometry?.traffic)) {
    const geometryCongestion = Number(feature.geometry.traffic[0])

    if (isTrafficCongestion(geometryCongestion)) {
      return geometryCongestion
    }
  }

  return undefined
}

function isTrafficCongestion(value: number): value is TrafficCongestion {
  return Number.isInteger(value) && value >= 0 && value <= 4
}

function parseCoordinate(value: unknown): Array<Coordinate | null> {
  if (!Array.isArray(value) || value.length !== 2) {
    return []
  }

  const [lngRaw, latRaw] = value
  const lng = Number(lngRaw)
  const lat = Number(latRaw)

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return []
  }

  return [{ lat, lng }]
}

function normalizeRoadMatch(data: TmapRoadMatchResponse): RoadMatchPoint[] {
  return (data.matchedPoints ?? data.resultData?.matchedPoints ?? []).flatMap((point, index) => {
    const location = point.matchedLocation ?? point.mathedLocation
    const lat = Number(location?.latitude)
    const lng = Number(location?.longitude)

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return []
    }

    return [{
      sourceIndex: point.sourceIndex ?? index,
      coordinate: { lat, lng },
      speedLimitKph: Number.isFinite(point.speed) ? point.speed : undefined,
      roadCategory: Number.isFinite(point.roadCategory) ? point.roadCategory : undefined,
    }]
  })
}

function normalizeSafetyAlerts(
  features: TmapFeature[],
  routeCoordinates: Coordinate[],
): SafetyAlert[] {
  return features.flatMap((feature, index) => {
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
      return []
    }

    const turnType = Number(feature.properties?.turnType)
    const alertType = getSafetyAlertType(turnType)

    if (!alertType) {
      return []
    }

    const [lng, lat] = feature.geometry.coordinates as [number, number]
    const coordinate = { lat, lng }
    const label = getSafetyAlertLabel(alertType)
    const description = [
      feature.properties?.description,
      feature.properties?.name,
      feature.properties?.nextRoadName,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined

    return [{
      id: `${turnType}-${lat}-${lng}-${index}`,
      type: alertType,
      label,
      description: description ?? label,
      coordinate,
      distanceFromStartMeters: getDistanceFromStartMeters(routeCoordinates, coordinate),
    }]
  }).sort((a, b) => a.distanceFromStartMeters - b.distanceFromStartMeters)
}

function normalizeManeuvers(
  features: TmapFeature[],
  routeCoordinates: Coordinate[],
): RouteManeuver[] {
  return features.flatMap((feature, index) => {
    if (feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
      return []
    }

    const turnType = Number(feature.properties?.turnType)
    const maneuverType = getManeuverType(turnType)

    if (!maneuverType) {
      return []
    }

    const [lng, lat] = feature.geometry.coordinates as [number, number]
    const coordinate = { lat, lng }
    const label = getManeuverLabel(maneuverType, turnType)
    const description = [
      feature.properties?.description,
      feature.properties?.name,
      feature.properties?.nextRoadName,
    ].find((value) => typeof value === 'string' && value.trim().length > 0) as string | undefined

    return [{
      id: `${turnType}-${lat}-${lng}-${index}`,
      type: maneuverType,
      label,
      description: description ?? label,
      coordinate,
      distanceFromStartMeters: getDistanceFromStartMeters(routeCoordinates, coordinate),
    }]
  }).sort((a, b) => a.distanceFromStartMeters - b.distanceFromStartMeters)
}

function getManeuverType(turnType: number): RouteManeuver['type'] | undefined {
  if ([12, 16, 17, 44, 52, 75, 76, 102, 105, 112, 115, 118, 137, 138, 139, 140, 141, 182].includes(turnType)) {
    return 'left'
  }

  if ([13, 18, 19, 43, 53, 73, 74, 101, 104, 111, 114, 117, 131, 132, 133, 134, 135, 183].includes(turnType)) {
    return 'right'
  }

  if ([11, 51, 103, 106, 113, 116, 142, 233].includes(turnType)) {
    return 'straight'
  }

  if ([201, 203].includes(turnType)) {
    return 'arrive'
  }

  if ([119, 120, 121, 122, 130, 150, 151, 184, 185, 186, 187, 188, 189, 191, 192, 193, 194].includes(turnType)) {
    return 'caution'
  }

  return undefined
}

function getManeuverLabel(type: RouteManeuver['type'], turnType: number) {
  if (type === 'left') return '좌회전'
  if (type === 'right') return '우회전'
  if (type === 'straight') return '직진'
  if (type === 'arrive') return '도착'
  if (turnType === 119) return '지하차도'
  if (turnType === 120) return '고가도로'
  if (turnType === 121) return '터널'
  if (turnType === 122) return '교량'
  return '주의'
}

function getSafetyAlertType(turnType: number): SafetyAlert['type'] | undefined {
  if (turnType === 191) return 'enforcement'
  if (turnType === 192) return 'accident'
  if (turnType === 193) return 'curve'
  if (turnType === 194) return 'falling-rock'
  return undefined
}

function getSafetyAlertLabel(type: SafetyAlert['type']) {
  if (type === 'enforcement') return '단속 주의'
  if (type === 'accident') return '사고다발'
  if (type === 'curve') return '급커브'
  if (type === 'falling-rock') return '낙석주의'
  if (type === 'speed-limit') return '제한속도'
  return '주의'
}

function getDistanceFromStartMeters(routeCoordinates: Coordinate[], coordinate: Coordinate) {
  if (routeCoordinates.length < 2) {
    return 0
  }

  let travelled = 0
  let closestDistance = Number.POSITIVE_INFINITY
  let closestTravelled = 0

  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const start = routeCoordinates[index]
    const end = routeCoordinates[index + 1]
    const segmentDistance = getDistanceMeters(start, end)
    const projected = projectCoordinateToSegment(start, end, coordinate)
    const projectedDistance = getDistanceMeters(start, projected)
    const distanceToRoute = getDistanceMeters(projected, coordinate)

    if (distanceToRoute < closestDistance) {
      closestDistance = distanceToRoute
      closestTravelled = travelled + projectedDistance
    }

    travelled += segmentDistance
  }

  return closestTravelled
}

function sampleRoadMatchCoordinates(coordinates: Coordinate[]) {
  if (coordinates.length <= 100) {
    return coordinates
  }

  const interval = (coordinates.length - 1) / 99
  return Array.from({ length: 100 }, (_, index) => (
    coordinates[Math.round(index * interval)]
  ))
}

function projectCoordinateToSegment(start: Coordinate, end: Coordinate, coordinate: Coordinate) {
  const latDelta = end.lat - start.lat
  const lngDelta = end.lng - start.lng
  const segmentLengthSquared = latDelta * latDelta + lngDelta * lngDelta

  if (segmentLengthSquared === 0) {
    return start
  }

  const ratio = (
    ((coordinate.lat - start.lat) * latDelta) +
    ((coordinate.lng - start.lng) * lngDelta)
  ) / segmentLengthSquared

  const clampedRatio = Math.min(Math.max(ratio, 0), 1)

  return {
    lat: start.lat + latDelta * clampedRatio,
    lng: start.lng + lngDelta * clampedRatio,
  }
}

function getDistanceMeters(from: Coordinate, to: Coordinate) {
  const latMeters = (to.lat - from.lat) * 111_320
  const lngMeters = (to.lng - from.lng) * 111_320 * Math.cos(toRadians((from.lat + to.lat) / 2))

  return Math.sqrt(latMeters * latMeters + lngMeters * lngMeters)
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function normalizeCurrentAddress(data: TmapReverseGeocodeResponse) {
  const addressInfo = data.addressInfo
  const fullAddress = selectSingleAddress(addressInfo?.roadAddress)
    ?? selectSingleAddress(addressInfo?.fullAddress)

  if (fullAddress) {
    return fullAddress
  }

  return [
    addressInfo?.city_do,
    addressInfo?.gu_gun,
    addressInfo?.eup_myun,
    addressInfo?.legalDong,
    addressInfo?.adminDong,
    addressInfo?.ri,
    addressInfo?.bunji,
  ].filter(Boolean).join(' ') || 'GPS 위치'
}

function selectSingleAddress(address?: string) {
  const candidates = address
    ?.split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean) ?? []

  if (candidates.length === 0) {
    return undefined
  }

  return candidates.reduce((best, candidate) => (
    getAddressSpecificityScore(candidate) >= getAddressSpecificityScore(best)
      ? candidate
      : best
  ))
}

function getAddressSpecificityScore(address: string) {
  let score = address.length

  if (/\d/.test(address)) {
    score += 100
  }

  if (/(로|길)\d*/.test(address)) {
    score += 100
  }

  return score
}
