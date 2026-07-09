import type { Coordinate, NavigationRoute, RoadMatchPoint, RouteManeuver } from '../types'

export interface SimulatedRoutePosition {
  coordinate: Coordinate
  remainingDistanceMeters: number
  remainingDurationSeconds: number
  completed: boolean
  speedKph: number
  drivingState: SimulatedDrivingState
}

export type SimulatedDrivingState = 'MOVING' | 'SLOWING' | 'STOPPED' | 'ACCELERATING'

export interface RouteSimulationPlan {
  coordinates: Coordinate[]
  cumulativeDistanceMeters: number[]
  pathDistanceMeters: number
  summary: NavigationRoute['summary']
  timelineSegments: RouteSimulationTimelineSegment[]
  totalDurationMs: number
}

interface RouteSimulationTimelineSegment {
  type: SimulatedDrivingState
  startTimeMs: number
  endTimeMs: number
  startDistanceMeters: number
  endDistanceMeters: number
  startSpeedMetersPerSecond: number
  endSpeedMetersPerSecond: number
}

interface RouteSimulationSpeedPoint {
  distanceMeters: number
  speedMetersPerSecond: number
}

const SIMULATION_SPEED_METERS_PER_SECOND = 12.5
const DECELERATION_DURATION_MS = 7_000
const ACCELERATION_DURATION_MS = 8_000
const DEFAULT_STOP_DURATION_MS = 3_200
const RIGHT_TURN_STOP_DURATION_MS = 1_200
const MIN_STOP_SPACING_METERS = 120
const STOP_APPROACH_DISTANCE_METERS = 82
const STOP_BEFORE_MANEUVER_DISTANCE_METERS = 10
const MIN_SEGMENT_DURATION_MS = 1
const MIN_SPEED_LIMIT_KPH = 5
const MAX_SPEED_LIMIT_KPH = 130
const ROLLING_SLOW_MIN_KPH = 8
const ROLLING_SLOW_MAX_KPH = 18
const EXPLICIT_STOP_PATTERN = /신호|횡단보도/
const INTERSECTION_STOP_PATTERN = /교차로|사거리|오거리|삼거리|로터리|회전교차로/
const MIN_STOP_TURN_ANGLE_DEGREES = 65
const TURN_ANGLE_SAMPLE_DISTANCE_METERS = 24

export function createRouteSimulationPlan(
  route: NavigationRoute,
  roadMatches: RoadMatchPoint[] = [],
): RouteSimulationPlan {
  const cumulativeDistanceMeters = [0]
  let pathDistanceMeters = 0

  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    pathDistanceMeters += getDistanceMeters(route.coordinates[index], route.coordinates[index + 1])
    cumulativeDistanceMeters.push(pathDistanceMeters)
  }

  const stopEvents = createSimulationStopEvents(
    route.maneuvers ?? [],
    route.coordinates,
    cumulativeDistanceMeters,
    pathDistanceMeters,
  )
  const speedProfile = createSimulationSpeedProfile(
    route.coordinates,
    cumulativeDistanceMeters,
    roadMatches,
  )
  const timelineSegments = createSimulationTimeline(pathDistanceMeters, stopEvents, speedProfile)

  return {
    coordinates: route.coordinates,
    cumulativeDistanceMeters,
    pathDistanceMeters,
    summary: route.summary,
    timelineSegments,
    totalDurationMs: timelineSegments[timelineSegments.length - 1]?.endTimeMs ?? 0,
  }
}

export function getSimulatedRoutePosition(
  route: NavigationRoute | RouteSimulationPlan,
  progressRatio: number,
): SimulatedRoutePosition {
  const coordinates = route.coordinates
  const clampedRatio = Math.min(Math.max(progressRatio, 0), 1)
  const completed = clampedRatio >= 1

  if (coordinates.length === 0) {
    return {
      coordinate: { lat: 0, lng: 0 },
      remainingDistanceMeters: 0,
      remainingDurationSeconds: 0,
      completed: true,
      speedKph: 0,
      drivingState: 'STOPPED',
    }
  }

  const plan = isRouteSimulationPlan(route) ? route : createRouteSimulationPlan(route)
  const timelineDurationMs = Math.max(MIN_SEGMENT_DURATION_MS, plan.totalDurationMs)
  const elapsedMs = timelineDurationMs * clampedRatio
  const timelineProgress = getTimelineProgress(plan.timelineSegments, elapsedMs)
  const distanceRatio = plan.pathDistanceMeters > 0
    ? timelineProgress.distanceMeters / plan.pathDistanceMeters
    : clampedRatio

  if (coordinates.length === 1 || completed) {
    return {
      coordinate: coordinates[coordinates.length - 1],
      remainingDistanceMeters: Math.round(route.summary.distanceMeters * (1 - distanceRatio)),
      remainingDurationSeconds: Math.round(route.summary.durationSeconds * (1 - clampedRatio)),
      completed,
      speedKph: 0,
      drivingState: completed ? 'STOPPED' : timelineProgress.drivingState,
    }
  }

  const targetDistanceMeters = plan.pathDistanceMeters * distanceRatio
  const { startIndex, endIndex, segmentRatio } = getSegmentProgress(
    plan,
    targetDistanceMeters,
  )
  const start = coordinates[startIndex]
  const end = coordinates[endIndex]

  return {
    coordinate: {
      lat: interpolate(start.lat, end.lat, segmentRatio),
      lng: interpolate(start.lng, end.lng, segmentRatio),
    },
    remainingDistanceMeters: Math.round(route.summary.distanceMeters * (1 - distanceRatio)),
    remainingDurationSeconds: Math.round(route.summary.durationSeconds * (1 - clampedRatio)),
    completed,
    speedKph: Math.round(timelineProgress.speedMetersPerSecond * 3.6),
    drivingState: timelineProgress.drivingState,
  }
}

function createSimulationStopEvents(
  maneuvers: RouteManeuver[],
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  pathDistanceMeters: number,
) {
  const candidates = maneuvers
    .filter((maneuver) => isIntersectionStopManeuver(
      maneuver,
      coordinates,
      cumulativeDistanceMeters,
      pathDistanceMeters,
    ))
    .map((maneuver) => ({
      distanceMeters: clamp(
        maneuver.distanceFromStartMeters - STOP_BEFORE_MANEUVER_DISTANCE_METERS,
        STOP_APPROACH_DISTANCE_METERS,
        Math.max(STOP_APPROACH_DISTANCE_METERS, pathDistanceMeters - 5),
      ),
      fullStop: shouldFullyStopAtManeuver(maneuver),
      stopDurationMs: maneuver.type === 'right'
        ? RIGHT_TURN_STOP_DURATION_MS
        : DEFAULT_STOP_DURATION_MS,
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)

  return candidates.filter((candidate, index, list) => (
    index === 0 ||
    candidate.distanceMeters - list[index - 1].distanceMeters >= MIN_STOP_SPACING_METERS
  ))
}

function createSimulationTimeline(
  pathDistanceMeters: number,
  stopEvents: Array<{ distanceMeters: number; fullStop: boolean; stopDurationMs: number }>,
  speedProfile: RouteSimulationSpeedPoint[],
): RouteSimulationTimelineSegment[] {
  if (pathDistanceMeters <= 0) {
    return []
  }

  const segments: RouteSimulationTimelineSegment[] = []
  let cursorTimeMs = 0
  let cursorDistanceMeters = 0

  const appendSegment = (
    type: SimulatedDrivingState,
    distanceMeters: number,
    durationMs: number,
    startSpeedMetersPerSecond: number,
    endSpeedMetersPerSecond: number,
  ) => {
    const safeDistanceMeters = Math.max(0, distanceMeters)
    const safeDurationMs = Math.max(MIN_SEGMENT_DURATION_MS, durationMs)
    segments.push({
      type,
      startTimeMs: cursorTimeMs,
      endTimeMs: cursorTimeMs + safeDurationMs,
      startDistanceMeters: cursorDistanceMeters,
      endDistanceMeters: cursorDistanceMeters + safeDistanceMeters,
      startSpeedMetersPerSecond,
      endSpeedMetersPerSecond,
    })
    cursorTimeMs += safeDurationMs
    cursorDistanceMeters += safeDistanceMeters
  }

  const appendMovingSegments = (targetDistanceMeters: number) => {
    const safeTargetDistanceMeters = clamp(targetDistanceMeters, cursorDistanceMeters, pathDistanceMeters)
    const boundaryDistances = speedProfile
      .map((point) => point.distanceMeters)
      .filter((distanceMeters) => (
        distanceMeters > cursorDistanceMeters &&
        distanceMeters < safeTargetDistanceMeters
      ))

    ;[...boundaryDistances, safeTargetDistanceMeters].forEach((segmentEndDistanceMeters) => {
      const distanceMeters = Math.max(0, segmentEndDistanceMeters - cursorDistanceMeters)
      if (distanceMeters <= 0) {
        return
      }

      const speedMetersPerSecond = getSpeedAtDistance(speedProfile, cursorDistanceMeters)
      appendSegment(
        'MOVING',
        distanceMeters,
        (distanceMeters / speedMetersPerSecond) * 1000,
        speedMetersPerSecond,
        speedMetersPerSecond,
      )
    })
  }

  stopEvents.forEach((event) => {
    const stopDistanceMeters = clamp(event.distanceMeters, cursorDistanceMeters, pathDistanceMeters)
    const decelerationTargetSpeedMetersPerSecond = getSpeedAtDistance(speedProfile, cursorDistanceMeters)
    const slowedSpeedMetersPerSecond = event.fullStop
      ? 0
      : getRollingSlowSpeedMetersPerSecond(decelerationTargetSpeedMetersPerSecond)
    const decelerationDistanceMeters = Math.min(
      STOP_APPROACH_DISTANCE_METERS,
      getTransitionDistanceMeters(
        DECELERATION_DURATION_MS,
        decelerationTargetSpeedMetersPerSecond - slowedSpeedMetersPerSecond,
      ),
      Math.max(0, stopDistanceMeters - cursorDistanceMeters),
    )
    const cruisingDistanceMeters = Math.max(0, stopDistanceMeters - cursorDistanceMeters - decelerationDistanceMeters)

    if (cruisingDistanceMeters > 0) {
      appendMovingSegments(cursorDistanceMeters + cruisingDistanceMeters)
    }

    if (decelerationDistanceMeters > 0) {
      appendSegment(
        'SLOWING',
        decelerationDistanceMeters,
        DECELERATION_DURATION_MS,
        decelerationTargetSpeedMetersPerSecond,
        slowedSpeedMetersPerSecond,
      )
    }

    if (event.fullStop) {
      appendSegment('STOPPED', 0, event.stopDurationMs, 0, 0)
    }

    const accelerationTargetSpeedMetersPerSecond = getSpeedAtDistance(speedProfile, cursorDistanceMeters)
    const accelerationDistanceMeters = Math.min(
      STOP_APPROACH_DISTANCE_METERS,
      getTransitionDistanceMeters(
        ACCELERATION_DURATION_MS,
        accelerationTargetSpeedMetersPerSecond - slowedSpeedMetersPerSecond,
      ),
      Math.max(0, pathDistanceMeters - cursorDistanceMeters),
    )
    if (accelerationDistanceMeters > 0) {
      appendSegment(
        'ACCELERATING',
        accelerationDistanceMeters,
        ACCELERATION_DURATION_MS,
        slowedSpeedMetersPerSecond,
        accelerationTargetSpeedMetersPerSecond,
      )
    }
  })

  const remainingDistanceMeters = Math.max(0, pathDistanceMeters - cursorDistanceMeters)
  if (remainingDistanceMeters > 0 || segments.length === 0) {
    appendMovingSegments(pathDistanceMeters)
  }

  return segments
}

function getTimelineProgress(segments: RouteSimulationTimelineSegment[], elapsedMs: number) {
  const segment = segments.find((item) => elapsedMs <= item.endTimeMs) ?? segments[segments.length - 1]

  if (!segment) {
    return {
      distanceMeters: 0,
      speedMetersPerSecond: 0,
      drivingState: 'STOPPED' as SimulatedDrivingState,
    }
  }

  const segmentDurationMs = Math.max(MIN_SEGMENT_DURATION_MS, segment.endTimeMs - segment.startTimeMs)
  const segmentRatio = clamp((elapsedMs - segment.startTimeMs) / segmentDurationMs, 0, 1)
  const easedRatio = segment.type === 'SLOWING'
    ? easeOutQuad(segmentRatio)
    : segment.type === 'ACCELERATING'
      ? easeInQuad(segmentRatio)
      : segmentRatio
  const speedRatio = segment.type === 'SLOWING' || segment.type === 'ACCELERATING'
    ? segmentRatio
    : easedRatio

  return {
    distanceMeters: interpolate(segment.startDistanceMeters, segment.endDistanceMeters, easedRatio),
    speedMetersPerSecond: interpolate(
      segment.startSpeedMetersPerSecond,
      segment.endSpeedMetersPerSecond,
      speedRatio,
    ),
    drivingState: segment.type,
  }
}

function isIntersectionStopManeuver(
  maneuver: RouteManeuver,
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  pathDistanceMeters: number,
) {
  if (!['left', 'right', 'straight'].includes(maneuver.type)) {
    return false
  }

  const maneuverText = `${maneuver.label} ${maneuver.description}`
  if (EXPLICIT_STOP_PATTERN.test(maneuverText)) {
    return true
  }

  if (!INTERSECTION_STOP_PATTERN.test(maneuverText)) {
    return false
  }

  return getRouteTurnAngleDegrees(
    coordinates,
    cumulativeDistanceMeters,
    clamp(maneuver.distanceFromStartMeters, 0, pathDistanceMeters),
  ) >= MIN_STOP_TURN_ANGLE_DEGREES
}

function shouldFullyStopAtManeuver(maneuver: RouteManeuver) {
  return getStableHash(`${maneuver.id}:${maneuver.description}`) % 3 === 0
}

function getRollingSlowSpeedMetersPerSecond(targetSpeedMetersPerSecond: number) {
  const slowedKph = clamp(
    targetSpeedMetersPerSecond * 3.6 * 0.45,
    ROLLING_SLOW_MIN_KPH,
    ROLLING_SLOW_MAX_KPH,
  )

  return slowedKph / 3.6
}

function getStableHash(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash * 31) + value.charCodeAt(index)) >>> 0
  }

  return hash
}

function createSimulationSpeedProfile(
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  roadMatches: RoadMatchPoint[],
): RouteSimulationSpeedPoint[] {
  const speedPoints = roadMatches.flatMap((roadMatch, index) => {
    if (!Number.isFinite(roadMatch.speedLimitKph) || !roadMatch.speedLimitKph) {
      return []
    }

    const speedLimitKph = clamp(roadMatch.speedLimitKph, MIN_SPEED_LIMIT_KPH, MAX_SPEED_LIMIT_KPH)
    const speedKph = getSpeedLimitDrivingSpeedKph(speedLimitKph, roadMatch, index)

    return [{
      distanceMeters: projectCoordinateToRouteDistance(
        coordinates,
        cumulativeDistanceMeters,
        roadMatch.coordinate,
      ),
      speedMetersPerSecond: speedKph / 3.6,
    }]
  }).sort((left, right) => left.distanceMeters - right.distanceMeters)

  if (speedPoints.length === 0) {
    return [{
      distanceMeters: 0,
      speedMetersPerSecond: SIMULATION_SPEED_METERS_PER_SECOND,
    }]
  }

  const dedupedSpeedPoints = speedPoints.reduce<RouteSimulationSpeedPoint[]>((points, point) => {
    const previousPoint = points[points.length - 1]

    if (previousPoint && Math.abs(previousPoint.distanceMeters - point.distanceMeters) < 1) {
      points[points.length - 1] = point
      return points
    }

    points.push(point)
    return points
  }, [])

  if (dedupedSpeedPoints[0]?.distanceMeters > 0) {
    dedupedSpeedPoints.unshift({
      distanceMeters: 0,
      speedMetersPerSecond: dedupedSpeedPoints[0].speedMetersPerSecond,
    })
  }

  return dedupedSpeedPoints
}

function getSpeedLimitVarianceKph(roadMatch: RoadMatchPoint, index: number) {
  const variances = [-5, -2, 2, 5]

  return variances[Math.abs(roadMatch.sourceIndex ?? index) % variances.length]
}

function getSpeedLimitDrivingSpeedKph(
  speedLimitKph: number,
  roadMatch: RoadMatchPoint,
  index: number,
) {
  const speedKph = speedLimitKph + getSpeedLimitVarianceKph(roadMatch, index)

  return speedLimitKph <= 20
    ? clamp(speedKph, 13, 25)
    : speedKph
}

function getSpeedAtDistance(speedProfile: RouteSimulationSpeedPoint[], distanceMeters: number) {
  let speedMetersPerSecond = speedProfile[0]?.speedMetersPerSecond ?? SIMULATION_SPEED_METERS_PER_SECOND

  for (const point of speedProfile) {
    if (point.distanceMeters > distanceMeters) {
      break
    }

    speedMetersPerSecond = point.speedMetersPerSecond
  }

  return speedMetersPerSecond
}

function projectCoordinateToRouteDistance(
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  coordinate: Coordinate,
) {
  if (coordinates.length < 2) {
    return 0
  }

  let closestDistanceMeters = 0
  let closestSquaredDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const projected = projectCoordinateToSegment(start, end, coordinate)
    const squaredDistance = getApproximateSquaredDistance(projected, coordinate)

    if (squaredDistance < closestSquaredDistance) {
      closestSquaredDistance = squaredDistance
      closestDistanceMeters = (cumulativeDistanceMeters[index] ?? 0) + getDistanceMeters(start, projected)
    }
  }

  return closestDistanceMeters
}

function getRouteTurnAngleDegrees(
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  distanceMeters: number,
) {
  if (coordinates.length < 3) {
    return 0
  }

  const before = getCoordinateAtRouteDistance(
    coordinates,
    cumulativeDistanceMeters,
    Math.max(0, distanceMeters - TURN_ANGLE_SAMPLE_DISTANCE_METERS),
  )
  const center = getCoordinateAtRouteDistance(coordinates, cumulativeDistanceMeters, distanceMeters)
  const after = getCoordinateAtRouteDistance(
    coordinates,
    cumulativeDistanceMeters,
    Math.min(cumulativeDistanceMeters[cumulativeDistanceMeters.length - 1] ?? distanceMeters, distanceMeters + TURN_ANGLE_SAMPLE_DISTANCE_METERS),
  )
  const incoming = {
    lat: center.lat - before.lat,
    lng: center.lng - before.lng,
  }
  const outgoing = {
    lat: after.lat - center.lat,
    lng: after.lng - center.lng,
  }
  const incomingLength = Math.hypot(incoming.lat, incoming.lng)
  const outgoingLength = Math.hypot(outgoing.lat, outgoing.lng)

  if (incomingLength === 0 || outgoingLength === 0) {
    return 0
  }

  const dot = incoming.lat * outgoing.lat + incoming.lng * outgoing.lng
  const cosine = clamp(dot / (incomingLength * outgoingLength), -1, 1)

  return Math.acos(cosine) * (180 / Math.PI)
}

function getCoordinateAtRouteDistance(
  coordinates: Coordinate[],
  cumulativeDistanceMeters: number[],
  distanceMeters: number,
) {
  const safeDistanceMeters = clamp(
    distanceMeters,
    0,
    cumulativeDistanceMeters[cumulativeDistanceMeters.length - 1] ?? 0,
  )
  const segmentIndex = findSegmentIndex(cumulativeDistanceMeters, safeDistanceMeters)
  const start = coordinates[segmentIndex] ?? coordinates[0]
  const end = coordinates[segmentIndex + 1] ?? coordinates[coordinates.length - 1]
  const startDistanceMeters = cumulativeDistanceMeters[segmentIndex] ?? 0
  const endDistanceMeters = cumulativeDistanceMeters[segmentIndex + 1] ?? startDistanceMeters
  const segmentDistanceMeters = Math.max(0, endDistanceMeters - startDistanceMeters)
  const segmentRatio = segmentDistanceMeters > 0
    ? (safeDistanceMeters - startDistanceMeters) / segmentDistanceMeters
    : 0

  return {
    lat: interpolate(start.lat, end.lat, segmentRatio),
    lng: interpolate(start.lng, end.lng, segmentRatio),
  }
}

function projectCoordinateToSegment(start: Coordinate, end: Coordinate, coordinate: Coordinate) {
  const latDelta = end.lat - start.lat
  const lngDelta = end.lng - start.lng
  const segmentLengthSquared = latDelta * latDelta + lngDelta * lngDelta

  if (segmentLengthSquared === 0) {
    return start
  }

  const ratio = clamp(
    ((coordinate.lat - start.lat) * latDelta + (coordinate.lng - start.lng) * lngDelta) / segmentLengthSquared,
    0,
    1,
  )

  return {
    lat: interpolate(start.lat, end.lat, ratio),
    lng: interpolate(start.lng, end.lng, ratio),
  }
}

function getApproximateSquaredDistance(left: Coordinate, right: Coordinate) {
  const latDelta = left.lat - right.lat
  const lngDelta = left.lng - right.lng

  return latDelta * latDelta + lngDelta * lngDelta
}

function getTransitionDistanceMeters(durationMs: number, speedMetersPerSecond: number) {
  return (speedMetersPerSecond * (durationMs / 1000)) / 2
}

function easeOutQuad(value: number) {
  return 1 - ((1 - value) ** 2)
}

function easeInQuad(value: number) {
  return value ** 2
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function interpolate(start: number, end: number, ratio: number) {
  return start + (end - start) * ratio
}

function getSegmentProgress(plan: RouteSimulationPlan, targetDistanceMeters: number) {
  const coordinates = plan.coordinates
  const segmentIndex = findSegmentIndex(plan.cumulativeDistanceMeters, targetDistanceMeters)
  const travelledDistanceMeters = plan.cumulativeDistanceMeters[segmentIndex] ?? 0
  const nextTravelledDistanceMeters = plan.cumulativeDistanceMeters[segmentIndex + 1] ?? travelledDistanceMeters
  const segmentDistanceMeters = nextTravelledDistanceMeters - travelledDistanceMeters

  if (segmentIndex < coordinates.length - 1) {
    const segmentRatio = segmentDistanceMeters > 0
      ? (targetDistanceMeters - travelledDistanceMeters) / segmentDistanceMeters
      : 0

    return {
      startIndex: segmentIndex,
      endIndex: segmentIndex + 1,
      segmentRatio: Math.min(Math.max(segmentRatio, 0), 1),
    }
  }

  return {
    startIndex: Math.max(0, coordinates.length - 2),
    endIndex: coordinates.length - 1,
    segmentRatio: 1,
  }
}

function findSegmentIndex(cumulativeDistanceMeters: number[], targetDistanceMeters: number) {
  let low = 0
  let high = cumulativeDistanceMeters.length - 2

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const startDistance = cumulativeDistanceMeters[middle]
    const endDistance = cumulativeDistanceMeters[middle + 1]

    if (targetDistanceMeters < startDistance) {
      high = middle - 1
    } else if (targetDistanceMeters > endDistance) {
      low = middle + 1
    } else {
      return middle
    }
  }

  return Math.min(Math.max(low, 0), Math.max(0, cumulativeDistanceMeters.length - 2))
}

function isRouteSimulationPlan(route: NavigationRoute | RouteSimulationPlan): route is RouteSimulationPlan {
  return 'cumulativeDistanceMeters' in route
}

function getDistanceMeters(from: Coordinate, to: Coordinate) {
  const latMeters = (to.lat - from.lat) * 111_320
  const lngMeters = (to.lng - from.lng) * 111_320 * Math.cos(toRadians((from.lat + to.lat) / 2))

  return Math.sqrt(latMeters * latMeters + lngMeters * lngMeters)
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}
