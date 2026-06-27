import type { Coordinate } from '../types'

export function calculateBearing(from: Coordinate, to: Coordinate) {
  const lat1 = toRadians(from.lat)
  const lat2 = toRadians(to.lat)
  const lngDelta = toRadians(to.lng - from.lng)
  const y = Math.sin(lngDelta) * Math.cos(lat2)
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lngDelta)

  return normalizeBearing((Math.atan2(y, x) * 180) / Math.PI)
}

export function getRouteBearing(coordinates: Coordinate[], index = 0) {
  if (coordinates.length < 2) {
    return 0
  }

  const segmentIndex = Math.min(Math.max(index, 0), coordinates.length - 2)
  return calculateBearing(coordinates[segmentIndex], coordinates[segmentIndex + 1])
}

export function getRouteBearingNearCoordinate(coordinates: Coordinate[], coordinate: Coordinate) {
  if (coordinates.length < 2) {
    return 0
  }

  const { segmentIndex } = projectCoordinateToRouteSegment(coordinates, coordinate)
  return getRouteBearing(coordinates, segmentIndex)
}

export function interpolateBearing(from: number, to: number, progress: number) {
  return normalizeBearing(interpolateBearingContinuously(from, to, progress))
}

export function interpolateBearingContinuously(from: number, to: number, progress: number) {
  const t = Math.min(Math.max(progress, 0), 1)
  const delta = ((((to - from) % 360) + 540) % 360) - 180

  return from + delta * t
}

function normalizeBearing(value: number) {
  return ((value % 360) + 360) % 360
}

export function projectCoordinateToRoute(coordinates: Coordinate[], coordinate: Coordinate) {
  return projectCoordinateToRouteSegment(coordinates, coordinate).coordinate
}

export function projectCoordinateToRouteSegment(coordinates: Coordinate[], coordinate: Coordinate) {
  if (coordinates.length === 0) {
    return { coordinate, segmentIndex: 0 }
  }

  if (coordinates.length === 1) {
    return { coordinate: coordinates[0], segmentIndex: 0 }
  }

  let closestCoordinate = coordinates[0]
  let closestSegmentIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const projectedCoordinate = projectCoordinateToSegment(start, end, coordinate)
    const distance = getApproximateSquaredDistance(projectedCoordinate, coordinate)

    if (distance < closestDistance) {
      closestCoordinate = projectedCoordinate
      closestSegmentIndex = index
      closestDistance = distance
    }
  }

  return {
    coordinate: closestCoordinate,
    segmentIndex: closestSegmentIndex,
  }
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

function toRadians(value: number) {
  return (value * Math.PI) / 180
}

function getApproximateSquaredDistance(from: Coordinate, to: Coordinate) {
  const latDelta = from.lat - to.lat
  const lngDelta = from.lng - to.lng

  return latDelta * latDelta + lngDelta * lngDelta
}
