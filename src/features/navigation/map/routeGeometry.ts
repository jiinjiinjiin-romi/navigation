import type { Coordinate } from '../types'

interface RoundedRouteOptions {
  cornerRadiusMeters?: number
  segmentsPerCorner?: number
  minTurnAngleDegrees?: number
}

interface MeterPoint {
  x: number
  y: number
}

const EARTH_METERS_PER_DEGREE = 111_320
const DEFAULT_CORNER_RADIUS_METERS = 24
const DEFAULT_SEGMENTS_PER_CORNER = 18
const DEFAULT_MIN_TURN_ANGLE_DEGREES = 14
const MAX_SEGMENT_TRIM_RATIO = 0.42
const MIN_TRIM_DISTANCE_METERS = 2
const DUPLICATE_POINT_EPSILON_METERS = 0.05

export function createRoundedRoutePath(
  coordinates: Coordinate[],
  options: RoundedRouteOptions = {},
) {
  const source = removeDuplicateCoordinates(coordinates)

  if (source.length <= 2) {
    return source
  }

  const origin = source[0]
  const meters = source.map((coordinate) => toMeterPoint(coordinate, origin))
  const rounded: MeterPoint[] = [meters[0]]
  const cornerRadiusMeters = options.cornerRadiusMeters ?? DEFAULT_CORNER_RADIUS_METERS
  const segmentsPerCorner = Math.max(1, options.segmentsPerCorner ?? DEFAULT_SEGMENTS_PER_CORNER)
  const minTurnAngleRadians = toRadians(options.minTurnAngleDegrees ?? DEFAULT_MIN_TURN_ANGLE_DEGREES)

  for (let index = 1; index < meters.length - 1; index += 1) {
    const previous = meters[index - 1]
    const current = meters[index]
    const next = meters[index + 1]
    const incoming = subtract(previous, current)
    const outgoing = subtract(next, current)
    const incomingLength = length(incoming)
    const outgoingLength = length(outgoing)

    if (incomingLength === 0 || outgoingLength === 0) {
      appendPoint(rounded, current)
      continue
    }

    const incomingUnit = scale(incoming, 1 / incomingLength)
    const outgoingUnit = scale(outgoing, 1 / outgoingLength)
    const interiorAngle = Math.acos(clamp(dot(incomingUnit, outgoingUnit), -1, 1))
    const turnAngle = Math.abs(Math.PI - interiorAngle)

    if (turnAngle < minTurnAngleRadians) {
      appendPoint(rounded, current)
      continue
    }

    const idealTrimDistance = cornerRadiusMeters / Math.max(Math.tan(interiorAngle / 2), 0.001)
    const trimDistance = Math.min(
      idealTrimDistance,
      incomingLength * MAX_SEGMENT_TRIM_RATIO,
      outgoingLength * MAX_SEGMENT_TRIM_RATIO,
    )

    if (trimDistance < MIN_TRIM_DISTANCE_METERS) {
      appendPoint(rounded, current)
      continue
    }

    const curveStart = add(current, scale(incomingUnit, trimDistance))
    const curveEnd = add(current, scale(outgoingUnit, trimDistance))

    appendPoint(rounded, curveStart)
    for (let segment = 1; segment <= segmentsPerCorner; segment += 1) {
      appendPoint(rounded, quadraticBezier(curveStart, current, curveEnd, segment / segmentsPerCorner))
    }
  }

  appendPoint(rounded, meters[meters.length - 1])

  return rounded.map((point, index) => {
    if (index === 0) {
      return source[0]
    }

    if (index === rounded.length - 1) {
      return source[source.length - 1]
    }

    return toCoordinate(point, origin)
  })
}

function removeDuplicateCoordinates(coordinates: Coordinate[]) {
  return coordinates.filter((coordinate, index, array) => (
    index === 0 ||
    coordinate.lat !== array[index - 1].lat ||
    coordinate.lng !== array[index - 1].lng
  ))
}

function toMeterPoint(coordinate: Coordinate, origin: Coordinate): MeterPoint {
  const latitudeScale = Math.cos(toRadians(origin.lat))

  return {
    x: (coordinate.lng - origin.lng) * EARTH_METERS_PER_DEGREE * latitudeScale,
    y: (coordinate.lat - origin.lat) * EARTH_METERS_PER_DEGREE,
  }
}

function toCoordinate(point: MeterPoint, origin: Coordinate): Coordinate {
  const latitudeScale = Math.cos(toRadians(origin.lat))

  return {
    lat: origin.lat + point.y / EARTH_METERS_PER_DEGREE,
    lng: origin.lng + point.x / (EARTH_METERS_PER_DEGREE * latitudeScale),
  }
}

function quadraticBezier(start: MeterPoint, control: MeterPoint, end: MeterPoint, ratio: number) {
  const inverse = 1 - ratio

  return {
    x: inverse * inverse * start.x + 2 * inverse * ratio * control.x + ratio * ratio * end.x,
    y: inverse * inverse * start.y + 2 * inverse * ratio * control.y + ratio * ratio * end.y,
  }
}

function appendPoint(points: MeterPoint[], point: MeterPoint) {
  const previous = points[points.length - 1]
  if (!previous || distance(previous, point) > DUPLICATE_POINT_EPSILON_METERS) {
    points.push(point)
  }
}

function add(left: MeterPoint, right: MeterPoint) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  }
}

function subtract(left: MeterPoint, right: MeterPoint) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  }
}

function scale(point: MeterPoint, multiplier: number) {
  return {
    x: point.x * multiplier,
    y: point.y * multiplier,
  }
}

function dot(left: MeterPoint, right: MeterPoint) {
  return left.x * right.x + left.y * right.y
}

function length(point: MeterPoint) {
  return Math.sqrt(dot(point, point))
}

function distance(left: MeterPoint, right: MeterPoint) {
  return length(subtract(left, right))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toRadians(value: number) {
  return (value * Math.PI) / 180
}
