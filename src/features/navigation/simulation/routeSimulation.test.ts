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

const rightAngleRoute: NavigationRoute = {
  coordinates: [
    { lat: 37, lng: 127 },
    { lat: 37, lng: 127.001 },
    { lat: 37.001, lng: 127.001 },
  ],
  summary: {
    distanceMeters: 220,
    durationSeconds: 40,
  },
}

describe('getSimulatedRoutePosition', () => {
  it('returns the first coordinate at zero progress', () => {
    expect(getSimulatedRoutePosition(route, 0)).toEqual({
      coordinate: { lat: 37, lng: 127 },
      remainingDistanceMeters: 2000,
      remainingDurationSeconds: 100,
      completed: false,
      speedKph: 45,
      drivingState: 'MOVING',
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
      speedKph: 0,
      drivingState: 'STOPPED',
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

  it('holds the coordinate and reports zero speed while stopped at an intersection maneuver', () => {
    const stoppedRoute: NavigationRoute = {
      ...route,
      maneuvers: [
        {
          id: 'left-turn',
          type: 'left',
          label: '좌회전',
          description: '신호 교차로 좌회전',
          coordinate: { lat: 37, lng: 128 },
          distanceFromStartMeters: 1000,
        },
      ],
    }
    const plan = createRouteSimulationPlan(stoppedRoute)
    const stopSegment = plan.timelineSegments.find((segment) => segment.type === 'STOPPED')

    expect(stopSegment).toBeDefined()
    expect(stopSegment!.startDistanceMeters).toBeLessThan(1000)

    const stopStartProgress = stopSegment!.startTimeMs / plan.totalDurationMs
    const stopMiddleProgress = ((stopSegment!.startTimeMs + stopSegment!.endTimeMs) / 2) / plan.totalDurationMs
    const stopStart = getSimulatedRoutePosition(plan, stopStartProgress)
    const stopMiddle = getSimulatedRoutePosition(plan, stopMiddleProgress)

    expect(stopMiddle.coordinate.lng).toBeCloseTo(stopStart.coordinate.lng, 6)
    expect(stopMiddle.remainingDistanceMeters).toBe(stopStart.remainingDistanceMeters)
    expect(stopMiddle.speedKph).toBe(0)
    expect(stopMiddle.drivingState).toBe('STOPPED')
  })

  it('slows down before a stop and accelerates after it', () => {
    const stoppedRoute: NavigationRoute = {
      ...rightAngleRoute,
      maneuvers: [
        {
          id: 'right-angle-corner',
          type: 'right',
          label: '우회전',
          description: '교차로 우회전',
          coordinate: { lat: 37, lng: 127.001 },
          distanceFromStartMeters: 89,
        },
      ],
    }
    const plan = createRouteSimulationPlan(stoppedRoute)
    const slowingSegment = plan.timelineSegments.find((segment) => segment.type === 'SLOWING')
    const acceleratingSegment = plan.timelineSegments.find((segment) => segment.type === 'ACCELERATING')

    expect(slowingSegment).toBeDefined()
    expect(acceleratingSegment).toBeDefined()

    const slowingProgress = ((slowingSegment!.startTimeMs + slowingSegment!.endTimeMs) / 2) / plan.totalDurationMs
    const acceleratingProgress = ((acceleratingSegment!.startTimeMs + acceleratingSegment!.endTimeMs) / 2) / plan.totalDurationMs
    const slowing = getSimulatedRoutePosition(plan, slowingProgress)
    const accelerating = getSimulatedRoutePosition(plan, acceleratingProgress)

    expect(slowing.drivingState).toBe('SLOWING')
    expect(slowing.speedKph).toBeGreaterThan(0)
    expect(slowing.speedKph).toBeLessThan(45)
    expect(accelerating.drivingState).toBe('ACCELERATING')
    expect(accelerating.speedKph).toBeGreaterThan(0)
    expect(accelerating.speedKph).toBeLessThan(45)
  })

  it('sometimes slows through a sharp intersection turn without reaching zero', () => {
    const rollingRoute: NavigationRoute = {
      ...rightAngleRoute,
      maneuvers: [
        {
          id: 'rolling-turn',
          type: 'right',
          label: '우회전',
          description: '교차로 우회전',
          coordinate: { lat: 37, lng: 127.001 },
          distanceFromStartMeters: 89,
        },
      ],
    }
    const plan = createRouteSimulationPlan(rollingRoute)
    const slowingSegment = plan.timelineSegments.find((segment) => segment.type === 'SLOWING')
    const acceleratingSegment = plan.timelineSegments.find((segment) => segment.type === 'ACCELERATING')

    expect(plan.timelineSegments.some((segment) => segment.type === 'STOPPED')).toBe(false)
    expect(slowingSegment).toBeDefined()
    expect(acceleratingSegment).toBeDefined()
    expect(Math.round(slowingSegment!.endSpeedMetersPerSecond * 3.6)).toBeGreaterThan(0)
    expect(Math.round(acceleratingSegment!.startSpeedMetersPerSecond * 3.6)).toBeGreaterThan(0)
  })

  it('keeps acceleration and deceleration distances consistent with displayed speed', () => {
    const stoppedRoute: NavigationRoute = {
      ...rightAngleRoute,
      maneuvers: [
        {
          id: 'right-angle-corner',
          type: 'right',
          label: '우회전',
          description: '사거리 우회전',
          coordinate: { lat: 37, lng: 127.001 },
          distanceFromStartMeters: 89,
        },
      ],
    }
    const plan = createRouteSimulationPlan(stoppedRoute)
    const slowingSegment = plan.timelineSegments.find((segment) => segment.type === 'SLOWING')
    const acceleratingSegment = plan.timelineSegments.find((segment) => segment.type === 'ACCELERATING')

    expect(slowingSegment).toBeDefined()
    expect(acceleratingSegment).toBeDefined()

    const slowingDistance = slowingSegment!.endDistanceMeters - slowingSegment!.startDistanceMeters
    const acceleratingDistance = acceleratingSegment!.endDistanceMeters - acceleratingSegment!.startDistanceMeters

    expect(slowingDistance).toBeLessThan(50)
    expect(acceleratingDistance).toBeLessThanOrEqual(50)

    const accelerationStartProgress = acceleratingSegment!.startTimeMs / plan.totalDurationMs
    const accelerationMiddleProgress = (
      (acceleratingSegment!.startTimeMs + acceleratingSegment!.endTimeMs) / 2
    ) / plan.totalDurationMs
    const accelerationEndProgress = (acceleratingSegment!.endTimeMs - 1) / plan.totalDurationMs

    expect(getSimulatedRoutePosition(plan, accelerationStartProgress).speedKph).toBe(0)
    expect(getSimulatedRoutePosition(plan, accelerationMiddleProgress).speedKph).toBeLessThan(25)
    expect(getSimulatedRoutePosition(plan, accelerationEndProgress).speedKph).toBeLessThanOrEqual(45)
  })

  it('does not fully stop at an ordinary corner without signal or intersection wording', () => {
    const campusCornerRoute: NavigationRoute = {
      ...route,
      maneuvers: [
        {
          id: 'campus-right',
          type: 'right',
          label: '우회전',
          description: '우회전',
          coordinate: { lat: 37, lng: 128 },
          distanceFromStartMeters: 1000,
        },
      ],
    }
    const plan = createRouteSimulationPlan(campusCornerRoute, [
      {
        sourceIndex: 0,
        coordinate: { lat: 37, lng: 127 },
        speedLimitKph: 10,
      },
    ])

    expect(plan.timelineSegments.some((segment) => segment.type === 'STOPPED')).toBe(false)
    expect(getSimulatedRoutePosition(plan, 0.5).speedKph).toBeGreaterThan(0)
  })

  it('does not fully stop at a shallow intersection-labeled bend', () => {
    const shallowBendRoute: NavigationRoute = {
      coordinates: [
        { lat: 37, lng: 127 },
        { lat: 37.00015, lng: 127.001 },
        { lat: 37.0004, lng: 127.002 },
      ],
      summary: {
        distanceMeters: 220,
        durationSeconds: 40,
      },
      maneuvers: [
        {
          id: 'shallow-campus-corner',
          type: 'right',
          label: '우회전',
          description: '교차로 우회전',
          coordinate: { lat: 37.00015, lng: 127.001 },
          distanceFromStartMeters: 90,
        },
      ],
    }
    const plan = createRouteSimulationPlan(shallowBendRoute, [
      {
        sourceIndex: 0,
        coordinate: { lat: 37, lng: 127 },
        speedLimitKph: 10,
      },
    ])

    expect(plan.timelineSegments.some((segment) => segment.type === 'STOPPED')).toBe(false)
    expect(getSimulatedRoutePosition(plan, 0.5).speedKph).toBeGreaterThan(0)
  })

  it('uses road match speed limits with a small realistic variance for moving segments', () => {
    const plan = createRouteSimulationPlan(route, [
      {
        sourceIndex: 0,
        coordinate: { lat: 37, lng: 127 },
        speedLimitKph: 30,
      },
      {
        sourceIndex: 1,
        coordinate: { lat: 37, lng: 128 },
        speedLimitKph: 50,
      },
    ])

    const early = getSimulatedRoutePosition(plan, 0.1)
    const later = getSimulatedRoutePosition(plan, 0.75)

    expect(early.speedKph).toBeGreaterThanOrEqual(25)
    expect(early.speedKph).toBeLessThanOrEqual(35)
    expect(later.speedKph).toBeGreaterThanOrEqual(45)
    expect(later.speedKph).toBeLessThanOrEqual(55)
  })

  it('keeps low speed-limit roads in a 13 to 25 kph driving range', () => {
    const plan = createRouteSimulationPlan(route, [
      {
        sourceIndex: 0,
        coordinate: { lat: 37, lng: 127 },
        speedLimitKph: 10,
      },
      {
        sourceIndex: 3,
        coordinate: { lat: 37, lng: 128 },
        speedLimitKph: 20,
      },
    ])

    const early = getSimulatedRoutePosition(plan, 0.1)
    const later = getSimulatedRoutePosition(plan, 0.75)

    expect(early.speedKph).toBeGreaterThanOrEqual(13)
    expect(early.speedKph).toBeLessThanOrEqual(25)
    expect(later.speedKph).toBeGreaterThanOrEqual(13)
    expect(later.speedKph).toBeLessThanOrEqual(25)
  })
})
