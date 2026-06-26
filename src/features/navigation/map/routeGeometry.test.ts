import { describe, expect, it } from 'vitest'

import { createRoundedRoutePath } from './routeGeometry'
import type { Coordinate } from '../types'

describe('createRoundedRoutePath', () => {
  it('rounds every eligible corner instead of preserving raw right-angle vertices', () => {
    const route: Coordinate[] = [
      { lat: 37, lng: 127 },
      { lat: 37, lng: 127.001 },
      { lat: 37.001, lng: 127.001 },
      { lat: 37.001, lng: 127.002 },
      { lat: 37.002, lng: 127.002 },
    ]

    const rounded = createRoundedRoutePath(route, {
      cornerRadiusMeters: 26,
      segmentsPerCorner: 6,
    })

    expect(rounded[0]).toEqual(route[0])
    expect(rounded[rounded.length - 1]).toEqual(route[route.length - 1])
    expect(rounded.length).toBeGreaterThan(route.length)

    for (const corner of route.slice(1, -1)) {
      expect(hasCoordinateNear(rounded, corner)).toBe(false)
    }
  })

  it('keeps generated corner points inside the adjacent segment envelope', () => {
    const route: Coordinate[] = [
      { lat: 37, lng: 127 },
      { lat: 37, lng: 127.001 },
      { lat: 37.001, lng: 127.001 },
    ]

    const rounded = createRoundedRoutePath(route, {
      cornerRadiusMeters: 28,
      segmentsPerCorner: 8,
    })

    expect(rounded.every((coordinate) => (
      coordinate.lat >= 37 &&
      coordinate.lat <= 37.001 &&
      coordinate.lng >= 127 &&
      coordinate.lng <= 127.001
    ))).toBe(true)
  })

  it('does not create artificial bends on near-straight route segments', () => {
    const route: Coordinate[] = [
      { lat: 37, lng: 127 },
      { lat: 37.00001, lng: 127.001 },
      { lat: 37.00002, lng: 127.002 },
    ]

    expect(createRoundedRoutePath(route)).toEqual(route)
  })
})

function hasCoordinateNear(coordinates: Coordinate[], target: Coordinate) {
  return coordinates.some((coordinate) => (
    Math.abs(coordinate.lat - target.lat) < 1e-10 &&
    Math.abs(coordinate.lng - target.lng) < 1e-10
  ))
}
