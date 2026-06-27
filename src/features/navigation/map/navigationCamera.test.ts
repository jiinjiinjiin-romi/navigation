import { describe, expect, it } from 'vitest'

import {
  calculateBearing,
  getLocalRouteBearingNearCoordinate,
  getRouteBearingNearCoordinate,
  interpolateBearing,
  interpolateBearingContinuously,
  projectCoordinateToRoute,
} from './navigationCamera'

describe('navigationCamera', () => {
  it('calculates cardinal route bearings from coordinates', () => {
    expect(calculateBearing({ lat: 37, lng: 126 }, { lat: 38, lng: 126 })).toBeCloseTo(0)
    expect(calculateBearing({ lat: 37, lng: 126 }, { lat: 37, lng: 127 })).toBeCloseTo(89.7, 1)
  })

  it('interpolates across the shortest bearing direction', () => {
    expect(interpolateBearing(350, 10, 0.5)).toBeCloseTo(0)
  })

  it('keeps bearing interpolation continuous across the zero-degree boundary', () => {
    expect(interpolateBearingContinuously(350, 10, 0.5)).toBeCloseTo(360)
  })

  it('uses the nearest route segment for the active camera bearing', () => {
    const route = [
      { lat: 37, lng: 126 },
      { lat: 37, lng: 127 },
      { lat: 38, lng: 127 },
    ]

    expect(getRouteBearingNearCoordinate(route, { lat: 37.1, lng: 127 })).toBeCloseTo(0)
  })

  it('uses a short local route tangent near corners instead of snapping to one segment', () => {
    const route = [
      { lat: 37, lng: 126 },
      { lat: 37, lng: 126.001 },
      { lat: 37.001, lng: 126.001 },
    ]

    const cornerBearing = getLocalRouteBearingNearCoordinate(route, { lat: 37, lng: 126.001 }, 14)
    const straightBearing = getLocalRouteBearingNearCoordinate(route, { lat: 37, lng: 126.0002 }, 8)

    expect(cornerBearing).toBeGreaterThan(0)
    expect(cornerBearing).toBeLessThan(90)
    expect(straightBearing).toBeCloseTo(89.7, 0)
  })

  it('projects an off-road position onto the nearest route segment', () => {
    const route = [
      { lat: 37, lng: 126 },
      { lat: 37, lng: 127 },
    ]

    expect(projectCoordinateToRoute(route, { lat: 37.2, lng: 126.4 })).toEqual({
      lat: 37,
      lng: 126.4,
    })
  })
})
