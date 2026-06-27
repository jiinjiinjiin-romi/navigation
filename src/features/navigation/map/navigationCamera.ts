import type { Coordinate } from '../types'

const LOCAL_BEARING_SAMPLE_DISTANCE_METERS = 10
const EARTH_METERS_PER_DEGREE = 111_320

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

export function getLocalRouteBearingNearCoordinate(
  coordinates: Coordinate[],
  coordinate: Coordinate,
  sampleDistanceMeters = LOCAL_BEARING_SAMPLE_DISTANCE_METERS,
) {
  if (coordinates.length < 2) {
    return 0
  }

  const projection = projectCoordinateToRouteSegmentWithProgress(coordinates, coordinate)
  const totalDistance = getRouteDistanceMeters(coordinates)
  if (totalDistance <= 0) {
    return getRouteBearing(coordinates, projection.segmentIndex)
  }

  const currentDistance = getRouteDistanceToProjection(coordinates, projection)
  const sampleDistance = Math.max(0, sampleDistanceMeters)
  const from = getCoordinateAtRouteDistance(coordinates, Math.max(0, currentDistance - sampleDistance))
  const to = getCoordinateAtRouteDistance(coordinates, Math.min(totalDistance, currentDistance + sampleDistance))

  if (from.lat === to.lat && from.lng === to.lng) {
    return getRouteBearing(coordinates, projection.segmentIndex)
  }

  return calculateBearing(from, to)
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
  const { segmentRatio: _segmentRatio, ...projection } = projectCoordinateToRouteSegmentWithProgress(coordinates, coordinate)

  return projection
}

function projectCoordinateToRouteSegmentWithProgress(coordinates: Coordinate[], coordinate: Coordinate) {
  if (coordinates.length === 0) {
    return { coordinate, segmentIndex: 0, segmentRatio: 0 }
  }

  if (coordinates.length === 1) {
    return { coordinate: coordinates[0], segmentIndex: 0, segmentRatio: 0 }
  }

  let closestCoordinate = coordinates[0]
  let closestSegmentIndex = 0
  let closestSegmentRatio = 0
  let closestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const { coordinate: projectedCoordinate, ratio } = projectCoordinateToSegment(start, end, coordinate)
    const distance = getApproximateSquaredDistance(projectedCoordinate, coordinate)

    if (distance < closestDistance) {
      closestCoordinate = projectedCoordinate
      closestSegmentIndex = index
      closestSegmentRatio = ratio
      closestDistance = distance
    }
  }

  return {
    coordinate: closestCoordinate,
    segmentIndex: closestSegmentIndex,
    segmentRatio: closestSegmentRatio,
  }
}

function projectCoordinateToSegment(start: Coordinate, end: Coordinate, coordinate: Coordinate) {
  const latDelta = end.lat - start.lat
  const lngDelta = end.lng - start.lng
  const segmentLengthSquared = latDelta * latDelta + lngDelta * lngDelta

  if (segmentLengthSquared === 0) {
    return {
      coordinate: start,
      ratio: 0,
    }
  }

  const ratio = (
    ((coordinate.lat - start.lat) * latDelta) +
    ((coordinate.lng - start.lng) * lngDelta)
  ) / segmentLengthSquared
  const clampedRatio = Math.min(Math.max(ratio, 0), 1)

  return {
    coordinate: {
      lat: start.lat + latDelta * clampedRatio,
      lng: start.lng + lngDelta * clampedRatio,
    },
    ratio: clampedRatio,
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

function getRouteDistanceMeters(coordinates: Coordinate[]) {
  let distance = 0

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    distance += getApproximateDistanceMeters(coordinates[index], coordinates[index + 1])
  }

  return distance
}

function getRouteDistanceToProjection(
  coordinates: Coordinate[],
  projection: ReturnType<typeof projectCoordinateToRouteSegmentWithProgress>,
) {
  let distance = 0

  for (let index = 0; index < projection.segmentIndex; index += 1) {
    distance += getApproximateDistanceMeters(coordinates[index], coordinates[index + 1])
  }

  const segmentStart = coordinates[projection.segmentIndex]
  const segmentEnd = coordinates[projection.segmentIndex + 1]
  if (!segmentStart || !segmentEnd) {
    return distance
  }

  return distance + getApproximateDistanceMeters(segmentStart, segmentEnd) * projection.segmentRatio
}

function getCoordinateAtRouteDistance(coordinates: Coordinate[], targetDistanceMeters: number) {
  if (coordinates.length === 0) {
    return { lat: 0, lng: 0 }
  }

  if (targetDistanceMeters <= 0) {
    return coordinates[0]
  }

  let walkedDistance = 0

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const segmentDistance = getApproximateDistanceMeters(start, end)

    if (segmentDistance === 0) {
      continue
    }

    if (walkedDistance + segmentDistance >= targetDistanceMeters) {
      const ratio = (targetDistanceMeters - walkedDistance) / segmentDistance

      return {
        lat: start.lat + (end.lat - start.lat) * ratio,
        lng: start.lng + (end.lng - start.lng) * ratio,
      }
    }

    walkedDistance += segmentDistance
  }

  return coordinates[coordinates.length - 1]
}

function getApproximateDistanceMeters(from: Coordinate, to: Coordinate) {
  const latitudeScale = Math.cos(toRadians((from.lat + to.lat) / 2))
  const latDeltaMeters = (to.lat - from.lat) * EARTH_METERS_PER_DEGREE
  const lngDeltaMeters = (to.lng - from.lng) * EARTH_METERS_PER_DEGREE * latitudeScale

  return Math.hypot(latDeltaMeters, lngDeltaMeters)
}
