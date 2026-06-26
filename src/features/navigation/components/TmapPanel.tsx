import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { Coordinate, NavigationRoute, Place } from '../types'
import { loadTmapSdk } from '../tmap/loadTmapSdk'
import {
  getLookaheadRouteBearing,
  getRouteBearing,
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
}

const MAP_OVERVIEW_ZOOM = 19
const MAP_NAVIGATION_ZOOM = 19
const MAP_NAVIGATION_PITCH = 0
const BEARING_SMOOTHING_RATIO = 0.16
const BEARING_LOOKAHEAD_METERS = 42
const CAMERA_FOLLOW_OFFSET_Y = 180
const CURRENT_LOCATION_PLACE_ID = 'current-location'
const NAVIGATION_ARROW_MARKER = `
  <div class="nav-current-arrow" style="
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: rgba(255,255,255,0.96);
    box-shadow: 0 5px 12px rgba(15,23,42,0.18);
  ">
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style="display:block; color:var(--nav-route); fill:var(--nav-route);">
      <path d="M12 2 19 21 12 17 5 21 12 2Z"></path>
    </svg>
  </div>
`

export function TmapPanel({
  currentPosition,
  route,
  origin,
  destination,
  simulationPosition,
}: TmapPanelProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Window['Tmapv3Map']>(undefined)
  const routeLineRef = useRef<Window['Tmapv3Polyline']>(undefined)
  const currentMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const originMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const destinationMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const renderedBearingRef = useRef(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const progressPosition = simulationPosition ?? (
    origin?.id === CURRENT_LOCATION_PLACE_ID ? currentPosition : undefined
  )

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

  const applyNavigationCamera = useCallback((
    position: Coordinate,
    bearing?: number,
    options: { smoothBearing?: boolean } = {},
  ) => {
    if (!window.Tmapv3 || !mapRef.current) {
      return
    }

    const centeredLatLng = resolveCameraCenter(position)
    const nextBearing = typeof bearing === 'number'
      ? options.smoothBearing
        ? interpolateBearingContinuously(renderedBearingRef.current, bearing, BEARING_SMOOTHING_RATIO)
        : bearing
      : renderedBearingRef.current

    mapRef.current.setZoom?.(MAP_NAVIGATION_ZOOM)
    mapRef.current.setCenter?.(centeredLatLng)
    mapRef.current.setPitch?.(MAP_NAVIGATION_PITCH)
    mapRef.current.setBearing?.(nextBearing)
    renderedBearingRef.current = nextBearing
  }, [resolveCameraCenter])

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
      if (import.meta.env.DEV && window.__naviTmapMap === mapRef.current) {
        delete window.__naviTmapMap
      }
    }
  }, [])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready' || !currentPosition) {
      return
    }

    const displayPosition = route?.coordinates.length
      ? projectCoordinateToRoute(route.coordinates, currentPosition)
      : currentPosition
    const position = new window.Tmapv3.LatLng(displayPosition.lat, displayPosition.lng)

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        iconHTML: NAVIGATION_ARROW_MARKER,
        map: mapRef.current,
      })
    } else {
      currentMarkerRef.current.setPosition?.(position)
    }

    applyNavigationCamera(
      displayPosition,
      route?.coordinates.length
        ? getLookaheadRouteBearing(route.coordinates, displayPosition, BEARING_LOOKAHEAD_METERS)
        : undefined,
      { smoothBearing: Boolean(route?.coordinates.length) },
    )
  }, [applyNavigationCamera, currentPosition, route?.coordinates, status])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready') {
      return
    }

    routeLineRef.current?.setMap(null)

    if (!remainingRouteCoordinates.length) {
      return
    }

    const routeColor = window
      .getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-route')
      .trim() || '#2563eb'

    routeLineRef.current = new window.Tmapv3.Polyline({
      path: remainingRouteCoordinates.map((coordinate) => (
        new window.Tmapv3!.LatLng(coordinate.lat, coordinate.lng)
      )),
      strokeColor: routeColor,
      strokeWeight: 8,
      map: mapRef.current,
    })

    const firstCoordinate = remainingRouteCoordinates[0]
    if (firstCoordinate) {
      const bearing = getRouteBearing(remainingRouteCoordinates)
      const firstCameraCenter = resolveCameraCenter(firstCoordinate)

      mapRef.current.setZoom?.(MAP_OVERVIEW_ZOOM)
      mapRef.current.setCenter?.(firstCameraCenter)
      mapRef.current.setPitch?.(MAP_NAVIGATION_PITCH)
      mapRef.current.setBearing?.(bearing)
      renderedBearingRef.current = bearing
    }
  }, [remainingRouteCoordinates, resolveCameraCenter, status])

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

    if (!currentMarkerRef.current) {
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        iconHTML: NAVIGATION_ARROW_MARKER,
        map: mapRef.current,
      })
    } else {
      currentMarkerRef.current.setPosition?.(position)
    }

    applyNavigationCamera(
      simulationPosition,
      route?.coordinates.length
        ? getLookaheadRouteBearing(route.coordinates, simulationPosition, BEARING_LOOKAHEAD_METERS)
        : undefined,
      { smoothBearing: true },
    )
  }, [applyNavigationCamera, route?.coordinates, simulationPosition, status])

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
    <div className="relative h-full w-full overflow-hidden bg-[var(--nav-frame)]">
      <div ref={mapElementRef} className="h-full w-full" />
      {status === 'ready' ? (
        <div className="absolute bottom-20 left-5 z-10 overflow-hidden rounded-full bg-[var(--nav-surface-raised)]/95 shadow-[0_8px_24px_rgb(15_23_42/0.14)] backdrop-blur max-sm:left-3">
          <button
            type="button"
            aria-label="지도 확대"
            className="grid size-11 place-items-center text-[var(--nav-ink)] transition hover:bg-[var(--nav-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)] active:bg-[var(--nav-panel)]"
            onClick={() => handleZoom('in')}
          >
            <Plus className="size-5" strokeWidth={2.5} />
          </button>
          <div className="mx-3 h-px bg-[var(--nav-border)]" />
          <button
            type="button"
            aria-label="지도 축소"
            className="grid size-11 place-items-center text-[var(--nav-ink)] transition hover:bg-[var(--nav-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)] active:bg-[var(--nav-panel)]"
            onClick={() => handleZoom('out')}
          >
            <Minus className="size-5" strokeWidth={2.5} />
          </button>
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
