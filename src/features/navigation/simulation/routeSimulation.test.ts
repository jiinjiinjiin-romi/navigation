import { describe, expect, it } from 'vitest'

import { createRouteSimulationPlan, getSimulatedRoutePosition } from './routeSimulation'
import type { NavigationRoute } from '../types'

const route: NavigationRoute = {
  coordinates: [
    { lat: 37, lng: 127 },
    { lat: 37, lng: 128 },
    { lat: 37, lng: 129 },
  ],
  summary: {
    distanceMeters: 2000,
    durationSeconds: 100,
  },
}

describe('getSimulatedRoutePosition', () => {
  it('returns the first coordinate at zero progress', () => {
    expect(getSimulatedRoutePosition(route, 0)).toEqual({
      coordinate: { lat: 37, lng: 127 },
      remainingDistanceMeters: 2000,
      remainingDurationSeconds: 100,
      completed: false,
    })
  })

  it('interpolates between route coordinates by progress ratio', () => {
    expect(getSimulatedRoutePosition(route, 0.25).coordinate).toEqual({
      lat: 37,
      lng: 127.5,
    })
  })

  it('moves by route distance instead of coordinate index so speed stays even', () => {
    const unevenRoute: NavigationRoute = {
      coordinates: [
        { lat: 37, lng: 127 },
        { lat: 37, lng: 127.1 },
        { lat: 37, lng: 128.1 },
      ],
      summary: {
        distanceMeters: 1100,
        durationSeconds: 110,
      },
    }

    expect(getSimulatedRoutePosition(unevenRoute, 0.5).coordinate.lng).toBeCloseTo(127.55, 2)
  })

  it('clamps at the destination when progress is complete', () => {
    expect(getSimulatedRoutePosition(route, 1.5)).toEqual({
      coordinate: { lat: 37, lng: 129 },
      remainingDistanceMeters: 0,
      remainingDurationSeconds: 0,
      completed: true,
    })
  })

  it('reuses a precomputed route plan for simulation ticks', () => {
    const plan = createRouteSimulationPlan(route)

    expect(getSimulatedRoutePosition(plan, 0.25).coordinate).toEqual({
      lat: 37,
      lng: 127.5,
    })
    expect(getSimulatedRoutePosition(plan, 0.75).coordinate).toEqual({
      lat: 37,
      lng: 128.5,
    })
  })
})
