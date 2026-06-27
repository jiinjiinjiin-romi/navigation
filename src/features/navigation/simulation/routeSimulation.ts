import type { Coordinate, NavigationRoute } from '../types'

export interface SimulatedRoutePosition {
  coordinate: Coordinate
  remainingDistanceMeters: number
  remainingDurationSeconds: number
  completed: boolean
}

export interface RouteSimulationPlan {
  coordinates: Coordinate[]
  cumulativeDistanceMeters: number[]
  pathDistanceMeters: number
  summary: NavigationRoute['summary']
}

export function createRouteSimulationPlan(route: NavigationRoute): RouteSimulationPlan {
  const cumulativeDistanceMeters = [0]
  let pathDistanceMeters = 0

  for (let index = 0; index < route.coordinates.length - 1; index += 1) {
    pathDistanceMeters += getDistanceMeters(route.coordinates[index], route.coordinates[index + 1])
    cumulativeDistanceMeters.push(pathDistanceMeters)
  }

  return {
    coordinates: route.coordinates,
    cumulativeDistanceMeters,
    pathDistanceMeters,
    summary: route.summary,
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
    }
  }

  if (coordinates.length === 1 || completed) {
    return {
      coordinate: coordinates[coordinates.length - 1],
      remainingDistanceMeters: Math.round(route.summary.distanceMeters * (1 - clampedRatio)),
      remainingDurationSeconds: Math.round(route.summary.durationSeconds * (1 - clampedRatio)),
      completed,
    }
  }

  const plan = isRouteSimulationPlan(route) ? route : createRouteSimulationPlan(route)
  const targetDistanceMeters = plan.pathDistanceMeters * clampedRatio
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
    remainingDistanceMeters: Math.round(route.summary.distanceMeters * (1 - clampedRatio)),
    remainingDurationSeconds: Math.round(route.summary.durationSeconds * (1 - clampedRatio)),
    completed,
  }
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
