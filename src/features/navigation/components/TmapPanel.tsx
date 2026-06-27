import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair, Minus, Plus } from '@phosphor-icons/react'
import type { Coordinate, NavigationRoute, Place, RouteTrafficSegment, TrafficCongestion } from '../types'
import { loadTmapSdk } from '../tmap/loadTmapSdk'
import {
  getRouteBearing,
  getRouteBearingNearCoordinate,
  interpolateBearingContinuously,
  projectCoordinateToRouteSegment,
  projectCoordinateToRoute,
} from '../map/navigationCamera'

interface TmapPanelProps {
  currentPosition?: Coordinate
  route?: NavigationRoute
  origin?: Place
  destination?: Place
  simulationPosition?: Coordinate
  onRequestLocation?: () => void
}

const MAP_OVERVIEW_ZOOM = 19
const MAP_NAVIGATION_ZOOM = 19
const MAP_NAVIGATION_PITCH = 0
const CAMERA_FOLLOW_OFFSET_Y = 180
const CAMERA_ANIMATION_MS = 220
const ROUTE_LINE_STROKE_WEIGHT = 10
const CURRENT_LOCATION_PLACE_ID = 'current-location'
const NAVIGATION_MARKER_BEARING_PRECISION = 0.05

function createNavigationArrowMarker(markerBearing = 0) {
  return `
  <div class="nav-current-arrow" style="
    --vehicle-marker-bearing:${formatCssBearing(markerBearing)}deg;
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(255,255,255,0.96);
    box-shadow: 0 5px 12px rgba(15,23,42,0.18);
  ">
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style="display:block; color:var(--nav-route); fill:var(--nav-route); transform:rotate(var(--vehicle-marker-bearing)); transform-origin:50% 50%; transition:transform 180ms ease-out;">
      <path d="M12 2 19 21 12 17 5 21 12 2Z"></path>
    </svg>
  </div>
`
}

interface RenderedCamera {
  position: Coordinate
  bearing: number
  markerBearing: number
}

interface CameraAnimation {
  from: RenderedCamera
  to: RenderedCamera
  startedAt?: number
}

export function TmapPanel({
  currentPosition,
  route,
  origin,
  destination,
  simulationPosition,
  onRequestLocation,
}: TmapPanelProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Window['Tmapv3Map']>(undefined)
  const routeLineRefs = useRef<Window['Tmapv3Polyline'][]>([])
  const routeLineSignatureRef = useRef<string | undefined>(undefined)
  const currentMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const currentMarkerBearingRef = useRef<number | undefined>(undefined)
  const originMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const destinationMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const renderedBearingRef = useRef(0)
  const renderedCameraRef = useRef<RenderedCamera>(undefined)
  const cameraAnimationRef = useRef<CameraAnimation>(undefined)
  const cameraFrameRef = useRef<number>(undefined)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapBearing, setMapBearing] = useState(0)
  const [northUpLocked, setNorthUpLocked] = useState(false)
  const progressPosition = simulationPosition
  const syncCompassBearing = useCallback((bearing: number) => {
    setMapBearing((currentBearing) => getContinuousBearing(currentBearing, bearing))
  }, [])

  const resolveCameraCenter = useCallback((position: Coordinate) => {
    const tmap = window.Tmapv3

    if (!mapRef.current || !tmap) {
      return position
    }

    const map = mapRef.current as unknown as {
      realToScreen?: (latLng: unknown) => unknown
      screenToReal?: (point: unknown) => unknown
    }
    const targetLatLng = new tmap.LatLng(position.lat, position.lng)

    if (!map.realToScreen || !map.screenToReal) {
      return targetLatLng
    }

    const screenPoint = map.realToScreen(targetLatLng)
    const getPointX = (point: unknown): number => {
      if (!point || typeof point !== 'object') {
        return 0
      }

      const pointObj = point as { getX?: () => number; x?: number }
      if (typeof pointObj.getX === 'function') {
        return pointObj.getX()
      }
      return pointObj.x ?? 0
    }

    const getPointY = (point: unknown): number => {
      if (!point || typeof point !== 'object') {
        return 0
      }

      const pointObj = point as { getY?: () => number; y?: number }
      if (typeof pointObj.getY === 'function') {
        return pointObj.getY()
      }
      return pointObj.y ?? 0
    }

    const x = getPointX(screenPoint)
    const y = getPointY(screenPoint)
    const offsetPoint = new tmap.Point(x, y - CAMERA_FOLLOW_OFFSET_Y)
    const offsetLatLng = map.screenToReal(offsetPoint)

    if (!offsetLatLng || typeof offsetLatLng !== 'object') {
      return targetLatLng
    }

    return offsetLatLng
  }, [])

  const remainingRouteCoordinates = useMemo(() => {
    if (!route?.coordinates.length) {
      return [] as Coordinate[]
    }

    if (!progressPosition) {
      return route.coordinates
    }

    const { segmentIndex, coordinate } = projectCoordinateToRouteSegment(route.coordinates, progressPosition)

    if (segmentIndex >= route.coordinates.length - 1) {
      return []
    }

    return [coordinate, ...route.coordinates.slice(segmentIndex + 1)]
  }, [progressPosition, route?.coordinates])

  const routeLineSegments = useMemo(() => {
    const baseRouteSegments = remainingRouteCoordinates.length
      ? [{
        coordinates: compactRouteCoordinates(remainingRouteCoordinates),
        congestion: 0 as const,
      }]
      : []
    const trafficRouteSegments = route?.trafficSegments?.length
      ? getRemainingTrafficSegments(route.trafficSegments, progressPosition).filter(isDrawableRouteSegment)
      : []

    return [...baseRouteSegments, ...trafficRouteSegments]
  }, [progressPosition, remainingRouteCoordinates, route?.trafficSegments])

  const updateCurrentMarkerBearing = useCallback((markerBearing: number) => {
    const normalizedBearing = normalizeSignedBearing(markerBearing)

    if (
      currentMarkerBearingRef.current !== undefined &&
      Math.abs(normalizeSignedBearing(normalizedBearing - currentMarkerBearingRef.current)) < NAVIGATION_MARKER_BEARING_PRECISION
    ) {
      return
    }

    currentMarkerBearingRef.current = normalizedBearing

    const markerElement = mapElementRef.current?.querySelector<HTMLElement>('.nav-current-arrow')
    if (markerElement) {
      markerElement.style.setProperty('--vehicle-marker-bearing', `${formatCssBearing(normalizedBearing)}deg`)
      return
    }

    currentMarkerRef.current?.setOptions?.({
      iconHTML: createNavigationArrowMarker(normalizedBearing),
    })
  }, [])

  const renderNavigationCamera = useCallback((camera: RenderedCamera) => {
    if (!window.Tmapv3 || !mapRef.current) {
      return
    }

    mapRef.current.setZoom?.(MAP_NAVIGATION_ZOOM)
    mapRef.current.setPitch?.(MAP_NAVIGATION_PITCH)
    mapRef.current.setBearing?.(camera.bearing)

    const markerPosition = new window.Tmapv3.LatLng(camera.position.lat, camera.position.lng)
    const centeredLatLng = resolveCameraCenter(camera.position)

    currentMarkerRef.current?.setPosition?.(markerPosition)
    updateCurrentMarkerBearing(camera.markerBearing)
    mapRef.current.setCenter?.(centeredLatLng)
    renderedBearingRef.current = camera.bearing
    renderedCameraRef.current = camera
    syncCompassBearing(camera.bearing)
  }, [resolveCameraCenter, syncCompassBearing, updateCurrentMarkerBearing])

  const stopCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current !== undefined) {
      window.cancelAnimationFrame(cameraFrameRef.current)
      cameraFrameRef.current = undefined
    }
    cameraAnimationRef.current = undefined
  }, [])

  const startCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current !== undefined) {
      return
    }

    const step = (timestamp: number) => {
      const animation = cameraAnimationRef.current

      if (!animation) {
        cameraFrameRef.current = undefined
        return
      }

      if (animation.startedAt === undefined) {
        animation.startedAt = timestamp
      }

      const progress = Math.min((timestamp - animation.startedAt) / CAMERA_ANIMATION_MS, 1)
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      const nextCamera = {
        position: interpolateCoordinate(animation.from.position, animation.to.position, easedProgress),
        bearing: interpolateBearingContinuously(animation.from.bearing, animation.to.bearing, easedProgress),
        markerBearing: interpolateBearingContinuously(
          animation.from.markerBearing,
          animation.to.markerBearing,
          easedProgress,
        ),
      }

      renderNavigationCamera(nextCamera)

      if (progress >= 1) {
        cameraAnimationRef.current = undefined
        cameraFrameRef.current = undefined
        return
      }

      cameraFrameRef.current = window.requestAnimationFrame(step)
    }

    cameraFrameRef.current = window.requestAnimationFrame(step)
  }, [renderNavigationCamera])

  const applyNavigationCamera = useCallback((
    position: Coordinate,
    bearing?: number,
    options: { animated?: boolean; markerBearing?: number } = {},
  ) => {
    if (!window.Tmapv3 || !mapRef.current) {
      return
    }

    const nextCamera = {
      position,
      bearing: typeof bearing === 'number' ? bearing : renderedBearingRef.current,
      markerBearing: options.markerBearing ?? 0,
    }
    const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    if (!options.animated || shouldReduceMotion || !renderedCameraRef.current) {
      stopCameraAnimation()
      renderNavigationCamera(nextCamera)
      return
    }

    if (isSameCamera(renderedCameraRef.current, nextCamera)) {
      stopCameraAnimation()
      return
    }

    cameraAnimationRef.current = {
      from: renderedCameraRef.current,
      to: nextCamera,
    }
    startCameraAnimation()
  }, [renderNavigationCamera, startCameraAnimation, stopCameraAnimation])

  useEffect(() => {
    let cancelled = false

    loadTmapSdk()
      .then(() => {
        if (cancelled || !mapElementRef.current || !window.Tmapv3) {
          return
        }

        mapRef.current = new window.Tmapv3.Map(mapElementRef.current, {
          center: new window.Tmapv3.LatLng(37.5665, 126.978),
          width: '100%',
          height: '100%',
          zoom: MAP_OVERVIEW_ZOOM,
          bearing: 0,
          pitch: MAP_NAVIGATION_PITCH,
          mapType: 'ROAD',
          naviControl: false,
          rotateEnabled: true,
          pitchEnabled: true,
          zoomEnabled: true,
          zoomControl: false,
          scaleBar: false,
        })
        if (import.meta.env.DEV) {
          window.__naviTmapMap = mapRef.current
        }
        setStatus('ready')
      })
      .catch(() => setStatus('error'))

    return () => {
      cancelled = true
      stopCameraAnimation()
      if (import.meta.env.DEV && window.__naviTmapMap === mapRef.current) {
        delete window.__naviTmapMap
      }
    }
  }, [stopCameraAnimation])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready' || !currentPosition) {
      return
    }

    const displayPosition = route?.coordinates.length
      ? projectCoordinateToRoute(route.coordinates, currentPosition)
      : currentPosition
    const position = new window.Tmapv3.LatLng(displayPosition.lat, displayPosition.lng)
    const cameraBearing = getNavigationCameraBearing(
      route?.coordinates,
      displayPosition,
      northUpLocked,
    )

    if (!currentMarkerRef.current) {
      currentMarkerBearingRef.current = cameraBearing.markerBearing
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        iconHTML: createNavigationArrowMarker(cameraBearing.markerBearing),
        map: mapRef.current,
      })
    }

    applyNavigationCamera(
      displayPosition,
      cameraBearing.mapBearing,
      {
        animated: Boolean(route?.coordinates.length),
        markerBearing: cameraBearing.markerBearing,
      },
    )
  }, [applyNavigationCamera, currentPosition, northUpLocked, route?.coordinates, status])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready') {
      return
    }

    const drawableSegments = routeLineSegments.filter(isDrawableRouteSegment)

    if (!drawableSegments.length) {
      if (!remainingRouteCoordinates.length) {
        routeLineRefs.current.forEach((line) => line?.setMap?.(null))
        routeLineRefs.current = []
        routeLineSignatureRef.current = undefined
      }
      return
    }

    const routeLineSignature = getRouteLineSignature(drawableSegments)
    if (routeLineSignatureRef.current === routeLineSignature) {
      return
    }

    const routeColor = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-route')
      .trim() || '#2563eb'

    routeLineRefs.current.forEach((line) => line?.setMap?.(null))
    const nextRouteLines = drawableSegments.map((segment) => (
      new window.Tmapv3!.Polyline({
        path: segment.coordinates.map((coordinate) => (
          new window.Tmapv3!.LatLng(coordinate.lat, coordinate.lng)
        )),
        strokeColor: getRouteLineColor(segment.congestion, routeColor),
        strokeOpacity: 1,
        strokeWeight: ROUTE_LINE_STROKE_WEIGHT,
        map: mapRef.current,
      })
    ))

    routeLineRefs.current = nextRouteLines
    routeLineSignatureRef.current = routeLineSignature

    const firstCoordinate = remainingRouteCoordinates[0]
    if (firstCoordinate) {
      const bearing = getRouteBearing(remainingRouteCoordinates)
      const firstCameraCenter = resolveCameraCenter(firstCoordinate)

      if (!progressPosition) {
        mapRef.current.setZoom?.(MAP_OVERVIEW_ZOOM)
        mapRef.current.setCenter?.(firstCameraCenter)
        mapRef.current.setPitch?.(MAP_NAVIGATION_PITCH)
        mapRef.current.setBearing?.(bearing)
        renderedBearingRef.current = bearing
        syncCompassBearing(bearing)
        renderedCameraRef.current = {
          position: firstCoordinate,
          bearing,
          markerBearing: 0,
        }
      }
    }
  }, [progressPosition, remainingRouteCoordinates, resolveCameraCenter, routeLineSegments, status, syncCompassBearing])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready') {
      return
    }

    originMarkerRef.current?.setMap(null)
    destinationMarkerRef.current?.setMap(null)

    if (origin && origin.id !== CURRENT_LOCATION_PLACE_ID) {
      originMarkerRef.current = new window.Tmapv3.Marker({
        position: new window.Tmapv3.LatLng(origin.coordinate.lat, origin.coordinate.lng),
        label: '출발',
        map: mapRef.current,
      })
    }

    if (destination) {
      destinationMarkerRef.current = new window.Tmapv3.Marker({
        position: new window.Tmapv3.LatLng(destination.coordinate.lat, destination.coordinate.lng),
        label: '도착',
        map: mapRef.current,
      })
    }
  }, [destination, origin, status])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready' || !simulationPosition) {
      return
    }

    const position = new window.Tmapv3.LatLng(simulationPosition.lat, simulationPosition.lng)
    const cameraBearing = getNavigationCameraBearing(
      route?.coordinates,
      simulationPosition,
      northUpLocked,
    )

    if (!currentMarkerRef.current) {
      currentMarkerBearingRef.current = cameraBearing.markerBearing
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        iconHTML: createNavigationArrowMarker(cameraBearing.markerBearing),
        map: mapRef.current,
      })
    }

    applyNavigationCamera(
      simulationPosition,
      cameraBearing.mapBearing,
      {
        animated: true,
        markerBearing: cameraBearing.markerBearing,
      },
    )
  }, [applyNavigationCamera, northUpLocked, route?.coordinates, simulationPosition, status])

  const resetNorthUp = useCallback((position?: Coordinate) => {
    setNorthUpLocked(true)

    const targetPosition = position
      ?? simulationPosition
      ?? currentPosition
      ?? renderedCameraRef.current?.position

    if (targetPosition) {
      const vehicleBearing = route?.coordinates.length
        ? getRouteBearingNearCoordinate(route.coordinates, targetPosition)
        : undefined

      applyNavigationCamera(targetPosition, 0, {
        animated: true,
        markerBearing: typeof vehicleBearing === 'number'
          ? getVehicleMarkerBearing(vehicleBearing, 0)
          : 0,
      })
      return
    }

    mapRef.current?.setBearing?.(0)
    renderedBearingRef.current = 0
    setMapBearing(0)
  }, [applyNavigationCamera, currentPosition, route?.coordinates, simulationPosition])

  const handleRequestLocation = () => {
    onRequestLocation?.()
    resetNorthUp()
  }

  const handleZoom = (direction: 'in' | 'out') => {
    const map = mapRef.current

    if (!map) {
      return
    }

    if (direction === 'in' && map.zoomIn) {
      map.zoomIn()
      return
    }

    if (direction === 'out' && map.zoomOut) {
      map.zoomOut()
      return
    }

    const currentZoom = map.getZoom?.()
    if (typeof currentZoom === 'number') {
      map.setZoom?.(currentZoom + (direction === 'in' ? 1 : -1))
    }
  }

  return (
    <div className="relative z-0 h-full w-full overflow-hidden bg-[var(--nav-frame)]">
      <div ref={mapElementRef} className="h-full w-full" />
      {status === 'ready' ? (
        <div className="absolute bottom-20 left-5 z-10 flex flex-col items-center gap-3 max-sm:left-3">
          <MapControlButton label="나침반 원위치" onClick={() => resetNorthUp()}>
            <span
              className="relative grid size-11 place-items-center transition-transform duration-200 ease-out"
              style={{ transform: `rotate(${-mapBearing}deg)` }}
            >
              <CompassTicks />
              <img
                alt=""
                aria-hidden="true"
                className="relative z-20 size-7 -translate-y-1.5 object-contain"
                draggable={false}
                src="/north.png"
              />
            </span>
          </MapControlButton>
          <MapControlButton label="현재 위치" onClick={handleRequestLocation}>
            <Crosshair className="size-6" weight="bold" />
          </MapControlButton>
          <div className="overflow-hidden rounded-full bg-[var(--nav-surface-raised)]/95 shadow-[0_8px_24px_rgb(15_23_42/0.14)] backdrop-blur">
            <button
              type="button"
              aria-label="지도 확대"
              className="grid size-11 place-items-center text-[var(--nav-ink)] transition hover:bg-[var(--nav-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)] active:bg-[var(--nav-panel)]"
              onClick={() => handleZoom('in')}
            >
              <Plus className="size-5" weight="bold" />
            </button>
            <div className="mx-3 h-px bg-[var(--nav-border)]" />
            <button
              type="button"
              aria-label="지도 축소"
              className="grid size-11 place-items-center text-[var(--nav-ink)] transition hover:bg-[var(--nav-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)] active:bg-[var(--nav-panel)]"
              onClick={() => handleZoom('out')}
            >
              <Minus className="size-5" weight="bold" />
            </button>
          </div>
        </div>
      ) : null}
      {status !== 'ready' ? (
        <div className="absolute inset-0 grid place-items-center bg-[var(--nav-frame)] text-sm text-[var(--nav-muted)]">
          {status === 'loading' ? 'TMAP 지도를 불러오는 중' : 'TMAP 지도를 불러오지 못했습니다'}
        </div>
      ) : null}
    </div>
  )
}

function CompassTicks() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-11"
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {[90, 180, 270].map((angle) => (
        <line
          key={angle}
          x1="22"
          y1="5.8"
          x2="22"
          y2="8.2"
          stroke="var(--nav-ink)"
          strokeLinecap="round"
          strokeWidth="1.8"
          transform={`rotate(${angle} 22 22)`}
        />
      ))}
      {[45, 135, 225, 315].map((angle) => (
        <line
          key={angle}
          x1="22"
          y1="6.5"
          x2="22"
          y2="8.1"
          stroke="var(--nav-muted)"
          strokeLinecap="round"
          strokeOpacity="0.46"
          strokeWidth="1.35"
          transform={`rotate(${angle} 22 22)`}
        />
      ))}
    </svg>
  )
}

function MapControlButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-14 place-items-center rounded-full bg-[var(--nav-control)] text-[var(--nav-ink)] shadow-[var(--nav-shadow-control)] transition hover:bg-[var(--nav-surface-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nav-primary)] active:scale-95 max-sm:size-13"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function interpolateCoordinate(from: Coordinate, to: Coordinate, progress: number): Coordinate {
  return {
    lat: from.lat + (to.lat - from.lat) * progress,
    lng: from.lng + (to.lng - from.lng) * progress,
  }
}

function normalizeBearing(bearing: number) {
  return ((bearing % 360) + 360) % 360
}

function getContinuousBearing(previousBearing: number, nextBearing: number) {
  const previous = normalizeBearing(previousBearing)
  const next = normalizeBearing(nextBearing)
  const shortestDelta = ((next - previous + 540) % 360) - 180

  return previousBearing + shortestDelta
}

function getNavigationCameraBearing(
  routeCoordinates: Coordinate[] | undefined,
  position: Coordinate,
  northUpLocked: boolean,
) {
  if (!routeCoordinates?.length) {
    return {
      mapBearing: northUpLocked ? 0 : undefined,
      markerBearing: 0,
    }
  }

  const vehicleBearing = getRouteBearingNearCoordinate(routeCoordinates, position)
  const mapBearing = northUpLocked ? 0 : vehicleBearing

  return {
    mapBearing,
    markerBearing: getVehicleMarkerBearing(vehicleBearing, mapBearing),
  }
}

function getVehicleMarkerBearing(vehicleBearing: number, mapBearing: number) {
  return normalizeSignedBearing(vehicleBearing - mapBearing)
}

function normalizeSignedBearing(bearing: number) {
  return ((((bearing % 360) + 540) % 360) - 180)
}

function formatCssBearing(bearing: number) {
  const normalizedBearing = normalizeSignedBearing(bearing)

  if (Math.abs(normalizedBearing) < NAVIGATION_MARKER_BEARING_PRECISION) {
    return '0'
  }

  return Number(normalizedBearing.toFixed(1)).toString()
}

function compactRouteCoordinates(coordinates: Coordinate[]) {
  return coordinates.filter((coordinate, index) => (
    index === 0 || getSquaredCoordinateDistance(coordinates[index - 1], coordinate) > 0.000000000001
  ))
}

function getRouteLineColor(congestion: TrafficCongestion, fallbackColor: string) {
  if (congestion === 1) return '#16a34a'
  if (congestion === 2) return '#eab308'
  if (congestion === 3) return '#f97316'
  if (congestion === 4) return '#dc2626'
  return fallbackColor
}

function getRouteLineSignature(segments: RouteTrafficSegment[]) {
  return segments.map((segment) => (
    `${segment.congestion}:${segment.coordinates.map((coordinate) => (
      `${coordinate.lat.toFixed(7)},${coordinate.lng.toFixed(7)}`
    )).join('|')}`
  )).join(';')
}

function getRemainingTrafficSegments(
  segments: RouteTrafficSegment[],
  progressPosition?: Coordinate,
): RouteTrafficSegment[] {
  if (!progressPosition) {
    return segments
  }

  const closest = segments.reduce<{
    segment: RouteTrafficSegment
    index: number
    segmentIndex: number
    coordinate: Coordinate
    distance: number
  } | undefined>((nearest, segment, index) => {
    if (segment.coordinates.length < 2) {
      return nearest
    }

    const projected = projectCoordinateToRouteSegment(segment.coordinates, progressPosition)
    const distance = getSquaredCoordinateDistance(projected.coordinate, progressPosition)

    if (!nearest || distance < nearest.distance) {
      return {
        segment,
        index,
        segmentIndex: projected.segmentIndex,
        coordinate: projected.coordinate,
        distance,
      }
    }

    return nearest
  }, undefined)

  if (!closest) {
    return []
  }

  return segments.slice(closest.index).flatMap((segment, relativeIndex) => {
    if (relativeIndex > 0) {
      return [segment]
    }

    const remainingCoordinates = [
      closest.coordinate,
      ...segment.coordinates.slice(closest.segmentIndex + 1),
    ]

    if (remainingCoordinates.length < 2) {
      return []
    }

    return [{
      ...segment,
      coordinates: remainingCoordinates,
    }]
  })
}

function isDrawableRouteSegment(segment: RouteTrafficSegment) {
  return segment.coordinates.some((coordinate, index) => (
    index > 0 && getSquaredCoordinateDistance(segment.coordinates[index - 1], coordinate) > 0.000000000001
  ))
}

function getSquaredCoordinateDistance(from: Coordinate, to: Coordinate) {
  const latDelta = from.lat - to.lat
  const lngDelta = from.lng - to.lng

  return latDelta * latDelta + lngDelta * lngDelta
}

function isSameCamera(from: RenderedCamera, to: RenderedCamera) {
  return (
    Math.abs(from.position.lat - to.position.lat) < 0.0000001 &&
    Math.abs(from.position.lng - to.position.lng) < 0.0000001 &&
    Math.abs(from.bearing - to.bearing) < 0.0001
  )
}
