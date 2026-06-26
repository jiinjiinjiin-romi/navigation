import type { Coordinate, NavigationRoute } from '../types'

export interface SimulatedRoutePosition {
  coordinate: Coordinate
  remainingDistanceMeters: number
  remainingDurationSeconds: number
  completed: boolean
}

export function getSimulatedRoutePosition(
  route: NavigationRoute,
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

  const pathDistanceMeters = getPathDistanceMeters(coordinates)
  const targetDistanceMeters = pathDistanceMeters * clampedRatio
  const { startIndex, endIndex, segmentRatio } = getSegmentProgress(
    coordinates,
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

function getSegmentProgress(coordinates: Coordinate[], targetDistanceMeters: number) {
  let travelledDistanceMeters = 0

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const segmentDistanceMeters = getDistanceMeters(start, end)
    const nextTravelledDistanceMeters = travelledDistanceMeters + segmentDistanceMeters

    if (targetDistanceMeters <= nextTravelledDistanceMeters || index === coordinates.length - 2) {
      const segmentRatio = segmentDistanceMeters > 0
        ? (targetDistanceMeters - travelledDistanceMeters) / segmentDistanceMeters
        : 0

      return {
        startIndex: index,
        endIndex: index + 1,
        segmentRatio: Math.min(Math.max(segmentRatio, 0), 1),
      }
    }

    travelledDistanceMeters = nextTravelledDistanceMeters
  }

  return {
    startIndex: 0,
    endIndex: Math.min(1, coordinates.length - 1),
    segmentRatio: 0,
  }
}

function getPathDistanceMeters(coordinates: Coordinate[]) {
  return coordinates.reduce((distanceMeters, coordinate, index) => {
    const next = coordinates[index + 1]
    return next ? distanceMeters + getDistanceMeters(coordinate, next) : distanceMeters
  }, 0)
}

function getDistanceMeters(from: Coordinate, to: Coordinate) {
  const latMeters = (to.lat - from.lat) * 111_320
  const lngMeters = (to.lng - from.lng) * 111_320 * Math.cos(toRadians((from.lat + to.lat) / 2))

  return Math.sqrt(latMeters * latMeters + lngMeters * lngMeters)
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}
