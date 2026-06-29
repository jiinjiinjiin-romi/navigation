import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Crosshair } from '@phosphor-icons/react'
import type { Coordinate, NavigationRoute, NavigationRouteOption, Place, RouteTrafficSegment, TrafficCongestion } from '../types'
import { loadTmapSdk } from '../tmap/loadTmapSdk'
import {
  getRouteBearing,
  getLocalRouteBearingNearCoordinate,
  interpolateBearingContinuously,
  projectCoordinateToRouteSegment,
  projectCoordinateToRoute,
} from '../map/navigationCamera'
import { markRoutePerformance, measureRoutePerformance } from '../performance/routePerformance'

interface TmapPanelProps {
  cameraSettings?: MapCameraSettings
  currentPosition?: Coordinate
  route?: NavigationRoute
  routeOptions?: NavigationRouteOption[]
  origin?: Place
  destination?: Place
  simulationPosition?: Coordinate
  activeRouteOptionId?: string
  onCameraSettingsChange?: (settings: Partial<MapCameraSettings>) => void
  onRouteOptionsOverlayReady?: (ready: boolean) => void
  onRouteOptionPreviewChange?: (id: string | undefined) => void
  onSimulationFrameRendererReady?: (renderFrame: ((position: Coordinate) => void) | undefined) => void
  onRequestLocation?: () => void
}

export interface MapCameraSettings {
  mode: '2d' | '3d'
  zoom: number
  pitch: number
}

const MAP_OVERVIEW_ZOOM = 18.3
const MAP_NAVIGATION_ZOOM = 18.3
const MAP_TOP_DOWN_PITCH = 0
const ROUTE_SELECTION_MIN_ZOOM = 10
const ROUTE_SELECTION_MAX_ZOOM = 16
const ROUTE_SELECTION_ZOOM_OUT_MARGIN = 0.9
const ROUTE_OPTION_HOVER_DISTANCE_PX = 20
const ROUTE_OPTION_HIT_TEST_MIN_DISTANCE_SQUARED = 0.00000004
const ROUTE_OPTION_POLYLINE_CHUNK_SIZE = 8
const CAMERA_FOLLOW_OFFSET_Y = 180
const CAMERA_ANIMATION_MS = 220
const MAP_MODE_TRANSITION_MS = 960
const COMPASS_CAMERA_ANIMATION_MS = 640
const CURRENT_LOCATION_DOUBLE_PRESS_MS = 1200
const ROUTE_LINE_STROKE_WEIGHT = 13
const ROUTE_LINE_BORDER_STROKE_WEIGHT = 18
const ROUTE_DIRECTION_ARROW_SIZE = 18
const ROUTE_DIRECTION_ARROW_END_OFFSET_METERS = 70
const ROUTE_DIRECTION_ARROW_MIN_EDGE_GAP_METERS = 40
const MAX_TRAFFIC_SEGMENT_MATCH_DISTANCE_SQUARED = 0.000001
const ROUTE_LINE_SIGNATURE_COORDINATE_PRECISION = 5
const CURRENT_LOCATION_PLACE_ID = 'current-location'
const NAVIGATION_MARKER_BEARING_PRECISION = 0.05
const NAVIGATION_MARKER_PITCH_PRECISION = 0.5
const NAVIGATION_MARKER_SIZE = 58

function createNavigationArrowMarker(markerBearing = 0, markerPitch = 0) {
  return `
  <div class="nav-current-arrow" style="
    --vehicle-marker-bearing:${formatCssBearing(markerBearing)}deg;
    --vehicle-marker-pitch:${formatCssPitch(markerPitch)}deg;
    width: ${NAVIGATION_MARKER_SIZE}px;
    height: ${NAVIGATION_MARKER_SIZE}px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: #fff;
    box-shadow: 0 5px 12px rgba(15,23,42,0.18);
    transform: perspective(160px) rotateX(var(--vehicle-marker-pitch));
    transform-origin: 50% 50%;
  ">
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style="display:block; color:var(--nav-route); fill:var(--nav-route); transform:rotate(var(--vehicle-marker-bearing)); transform-origin:50% 50%;">
      <path d="M12 2 19 21 12 17 5 21 12 2Z"></path>
    </svg>
  </div>
`
}

function createRouteDirectionArrowMarker(arrowBearing = 0) {
  return `
  <div class="nav-route-direction-arrow" style="
    --route-arrow-bearing:${formatCssBearing(arrowBearing)}deg;
    width:${ROUTE_DIRECTION_ARROW_SIZE}px;
    height:${ROUTE_DIRECTION_ARROW_SIZE}px;
    display:grid;
    place-items:center;
    pointer-events:none;
  ">
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style="display:block; transform:rotate(var(--route-arrow-bearing)); transform-origin:50% 50%; filter:drop-shadow(0 1px 1px rgba(1,96,154,0.34));">
      <path d="M9 1.8 15 16.2 9 12.6 3 16.2 9 1.8Z" fill="#fff"></path>
    </svg>
  </div>
`
}

interface RenderedCamera {
  position: Coordinate
  bearing: number
  markerBearing: number
  pitch: number
}

interface CameraAnimation {
  from: RenderedCamera
  to: RenderedCamera
  durationMs: number
  animatePosition: boolean
  applyMap: boolean
  mode?: 'compass'
  startedAt?: number
}

interface RouteDirectionMarker {
  marker: NonNullable<Window['Tmapv3Marker']>
  bearing: number
}

interface RouteOptionOverlay {
  id: string
  activeLines: RouteOptionRenderedLine[]
  baseLines: RouteOptionRenderedLine[]
  hitTestCoordinates: Coordinate[]
  option: NavigationRouteOption
  segments: RouteTrafficSegment[]
}

interface RouteOptionOverlayLine {
  kind: 'border' | 'route'
}

type TmapPolyline = NonNullable<Window['Tmapv3Polyline']>

interface RouteOptionRenderedLine {
  kind: RouteOptionOverlayLine['kind']
  line: TmapPolyline
  path: unknown[]
}

interface RouteOptionHitTestCache {
  cameraKey: string
  options: Array<{
    id: string
    points: ScreenPoint[]
  }>
}

interface ScreenPoint {
  x: number
  y: number
}

interface RouteDirectionArrowDensity {
  spacingMeters: number
  startOffsetMeters: number
  maxArrows: number
}

export function TmapPanel({
  cameraSettings,
  currentPosition,
  route,
  routeOptions,
  origin,
  destination,
  simulationPosition,
  activeRouteOptionId,
  onCameraSettingsChange,
  onRouteOptionsOverlayReady,
  onRouteOptionPreviewChange,
  onSimulationFrameRendererReady,
  onRequestLocation,
}: TmapPanelProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<Window['Tmapv3Map']>(undefined)
  const routeLineRefs = useRef<TmapPolyline[]>([])
  const routeOptionOverlayRefs = useRef<RouteOptionOverlay[]>([])
  const routeOptionActiveLineRefs = useRef<RouteOptionRenderedLine[]>([])
  const routeOptionHitTestCacheRef = useRef<RouteOptionHitTestCache | undefined>(undefined)
  const routeOptionOverlaySignatureRef = useRef<string | undefined>(undefined)
  const routeOptionActiveIdRef = useRef<string | undefined>(undefined)
  const routeOptionOverlayBuildFrameRef = useRef<number | undefined>(undefined)
  const routeOptionOverlayVisibleRef = useRef(false)
  const routeDirectionMarkerRefs = useRef<RouteDirectionMarker[]>([])
  const routeLineSignatureRef = useRef<string | undefined>(undefined)
  const routeLineStructureSignatureRef = useRef<string | undefined>(undefined)
  const routeDirectionMarkerSignatureRef = useRef<string | undefined>(undefined)
  const currentMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const currentMarkerBearingRef = useRef<number | undefined>(undefined)
  const originMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const destinationMarkerRef = useRef<Window['Tmapv3Marker']>(undefined)
  const renderedBearingRef = useRef(0)
  const renderedPitchRef = useRef(MAP_TOP_DOWN_PITCH)
  const renderedCameraRef = useRef<RenderedCamera>(undefined)
  const cameraAnimationRef = useRef<CameraAnimation>(undefined)
  const cameraFrameRef = useRef<number>(undefined)
  const mapModePitchFrameRef = useRef<number>(undefined)
  const previousCameraModeRef = useRef<MapCameraSettings['mode'] | undefined>(cameraSettings?.mode)
  const navigationZoomRef = useRef(MAP_NAVIGATION_ZOOM)
  const cameraFollowingRef = useRef(true)
  const lastCurrentLocationPressAtRef = useRef<number | undefined>(undefined)
  const currentMarkerPitchRef = useRef<number | undefined>(undefined)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [mapBearing, setMapBearing] = useState(0)
  const [northUpLocked, setNorthUpLocked] = useState(false)
  const [routeDirectionZoom, setRouteDirectionZoom] = useState(MAP_NAVIGATION_ZOOM)
  const hasGuidanceRoute = Boolean(route?.coordinates.length)
  const hasRouteSelectionOptions = Boolean(!route?.coordinates.length && routeOptions?.length)
  const previousRouteSelectionOptionsRef = useRef(hasRouteSelectionOptions)
  const progressPosition = useMemo(() => {
    if (!simulationPosition || !route?.coordinates.length) {
      return simulationPosition
    }

    return projectCoordinateToRoute(route.coordinates, simulationPosition)
  }, [route?.coordinates, simulationPosition])
  const syncCompassBearing = useCallback((bearing: number) => {
    setMapBearing((currentBearing) => {
      const nextBearing = getContinuousBearing(currentBearing, bearing)
      return Math.abs(normalizeSignedBearing(nextBearing - currentBearing)) < NAVIGATION_MARKER_BEARING_PRECISION
        ? currentBearing
        : nextBearing
    })
  }, [onRouteOptionsOverlayReady])

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

  const routeLineSourceSegments = useMemo(() => {
    const coordinates = compactRouteCoordinates(route?.coordinates ?? [])

    if (coordinates.length < 2) {
      return []
    }

    if (route?.trafficSegments?.length) {
      return getRouteAlignedTrafficSegments(coordinates, route.trafficSegments)
    }

    return [{
      coordinates,
      congestion: 0 as const,
    }]
  }, [route?.coordinates, route?.trafficSegments])
  const routeLineSegments = useMemo(() => {
    if (!progressPosition) {
      return routeLineSourceSegments
    }

    return getRemainingRouteLineSegments(routeLineSourceSegments, progressPosition)
  }, [progressPosition, routeLineSourceSegments])
  const routeDirectionCoordinates = useMemo(
    () => compactRouteCoordinates(remainingRouteCoordinates),
    [remainingRouteCoordinates],
  )

  const updateCurrentMarkerTransform = useCallback((markerBearing: number, markerPitch: number) => {
    const normalizedBearing = normalizeSignedBearing(markerBearing)
    const normalizedPitch = normalizeMarkerPitch(markerPitch)
    const bearingUnchanged = (
      currentMarkerBearingRef.current !== undefined &&
      Math.abs(normalizeSignedBearing(normalizedBearing - currentMarkerBearingRef.current)) < NAVIGATION_MARKER_BEARING_PRECISION
    )
    const pitchUnchanged = (
      currentMarkerPitchRef.current !== undefined &&
      Math.abs(normalizedPitch - currentMarkerPitchRef.current) < NAVIGATION_MARKER_PITCH_PRECISION
    )

    if (bearingUnchanged && pitchUnchanged) {
      return
    }

    currentMarkerBearingRef.current = normalizedBearing
    currentMarkerPitchRef.current = normalizedPitch

    const markerElement = mapElementRef.current?.querySelector<HTMLElement>('.nav-current-arrow')
    if (markerElement) {
      markerElement.style.setProperty('--vehicle-marker-bearing', `${formatCssBearing(normalizedBearing)}deg`)
      markerElement.style.setProperty('--vehicle-marker-pitch', `${formatCssPitch(normalizedPitch)}deg`)
      return
    }

    currentMarkerRef.current?.setOptions?.({
      iconHTML: createNavigationArrowMarker(normalizedBearing, normalizedPitch),
    })
  }, [])

  const setCameraFollowing = useCallback((enabled: boolean) => {
    cameraFollowingRef.current = enabled
  }, [])

  const getCurrentMapBearing = useCallback(() => {
    const mapBearing = mapRef.current?.getBearing?.()
    return typeof mapBearing === 'number' ? mapBearing : renderedBearingRef.current
  }, [])

  const getCurrentMapPitch = useCallback(() => {
    const mapPitch = mapRef.current?.getPitch?.()
    return typeof mapPitch === 'number' && Number.isFinite(mapPitch)
      ? mapPitch
      : renderedPitchRef.current
  }, [])

  const getSettingsMapPitch = useCallback(() => (
    cameraSettings?.mode === '3d'
      ? normalizeMarkerPitch(cameraSettings.pitch)
      : MAP_TOP_DOWN_PITCH
  ), [cameraSettings?.mode, cameraSettings?.pitch])

  const getDisplayMapPitch = useCallback(() => (
    cameraSettings?.mode === '2d'
      ? MAP_TOP_DOWN_PITCH
      : getCurrentMapPitch()
  ), [cameraSettings?.mode, getCurrentMapPitch])

  const updateRouteDirectionMarkerBearings = useCallback((mapBearing: number) => {
    const markerElements = mapElementRef.current?.querySelectorAll<HTMLElement>('.nav-route-direction-arrow')

    routeDirectionMarkerRefs.current.forEach((routeDirectionMarker, index) => {
      const markerBearing = getVehicleMarkerBearing(routeDirectionMarker.bearing, mapBearing)
      const markerElement = markerElements?.[index]

      if (markerElement) {
        markerElement.style.setProperty('--route-arrow-bearing', `${formatCssBearing(markerBearing)}deg`)
      }
    })
  }, [])

  const clearRouteOptionOverlays = useCallback(() => {
    if (routeOptionOverlayBuildFrameRef.current !== undefined) {
      window.cancelAnimationFrame(routeOptionOverlayBuildFrameRef.current)
      routeOptionOverlayBuildFrameRef.current = undefined
    }
    onRouteOptionsOverlayReady?.(false)
    routeOptionOverlayRefs.current.forEach((overlay) => {
      overlay.activeLines.forEach(disposeRouteOptionPolyline)
      overlay.baseLines.forEach(disposeRouteOptionPolyline)
    })
    routeOptionActiveLineRefs.current = []
    routeOptionOverlayVisibleRef.current = false
    routeOptionOverlayRefs.current = []
    routeOptionHitTestCacheRef.current = undefined
    routeOptionOverlaySignatureRef.current = undefined
    routeOptionActiveIdRef.current = undefined
  }, [])

  const updateRouteOptionOverlayPreview = useCallback((
    previewOptionId: string | undefined,
    force = false,
    onComplete?: () => void,
  ) => {
    const overlays = routeOptionOverlayRefs.current
    const activeOptionId = previewOptionId ?? getDefaultRouteOptionId(overlays.map((overlay) => overlay.option))
    const activeOverlay = overlays.find((overlay) => overlay.id === activeOptionId)

    if (!force && routeOptionActiveIdRef.current === activeOptionId) {
      onComplete?.()
      return
    }

    const previousActiveOverlay = overlays.find((overlay) => overlay.id === routeOptionActiveIdRef.current)
    if (previousActiveOverlay && previousActiveOverlay.id !== activeOverlay?.id) {
      setRouteOptionActiveLinesVisible(previousActiveOverlay, false)
    }

    if (activeOverlay) {
      setRouteOptionActiveLinesVisible(activeOverlay, true)
      routeOptionActiveLineRefs.current = activeOverlay.activeLines
      routeOptionActiveIdRef.current = activeOverlay.id
    } else {
      routeOptionActiveLineRefs.current = []
      routeOptionActiveIdRef.current = undefined
    }

    onComplete?.()
  }, [])

  const renderNavigationCamera = useCallback((camera: RenderedCamera, applyMap = true) => {
    if (!window.Tmapv3 || !mapRef.current) {
      return
    }

    const markerPosition = new window.Tmapv3.LatLng(camera.position.lat, camera.position.lng)

    if (applyMap) {
      applyMapCamera(
        mapRef.current,
        camera,
        () => resolveCameraCenter(camera.position),
        navigationZoomRef.current,
      )
      renderedBearingRef.current = camera.bearing
      renderedPitchRef.current = camera.pitch
      renderedCameraRef.current = camera
      syncCompassBearing(camera.bearing)
      updateRouteDirectionMarkerBearings(camera.bearing)
    }

    currentMarkerRef.current?.setPosition?.(markerPosition)
    updateCurrentMarkerTransform(camera.markerBearing, camera.pitch)
  }, [resolveCameraCenter, syncCompassBearing, updateCurrentMarkerTransform, updateRouteDirectionMarkerBearings])

  const updateVisibleRouteLineHead = useCallback((position: Coordinate) => {
    if (!window.Tmapv3 || !mapRef.current || !routeLineSourceSegments.length) {
      return
    }

    const nextSegments = getRemainingRouteLineSegments(routeLineSourceSegments, position)
      .filter(isDrawableRouteSegment)

    if (!nextSegments.length) {
      routeLineRefs.current.forEach((line) => line?.setMap?.(null))
      routeLineRefs.current = []
      routeLineSignatureRef.current = undefined
      routeLineStructureSignatureRef.current = undefined
      return
    }

    const nextStructureSignature = getRouteLineStructureSignature(nextSegments)
    const nextSignature = getRouteLineSignature(nextSegments)
    const canClipExistingRouteHead = (
      routeLineStructureSignatureRef.current === nextStructureSignature &&
      routeLineRefs.current.length === nextSegments.length * 2 &&
      routeLineRefs.current.every((line) => typeof line?.setPath === 'function')
    )

    if (canClipExistingRouteHead) {
      const path = toTmapPath(nextSegments[0].coordinates)
      routeLineRefs.current[0]?.setPath?.(path)
      routeLineRefs.current[1]?.setPath?.(path)
      routeLineSignatureRef.current = nextSignature
      return
    }

    const map = mapRef.current
    routeLineRefs.current.forEach((line) => line?.setMap?.(null))
    routeLineRefs.current = nextSegments.flatMap((segment) => (
      createRouteLinePolylines(segment, getNavigationRouteColor(), map)
    ))
    routeLineSignatureRef.current = nextSignature
    routeLineStructureSignatureRef.current = nextStructureSignature
  }, [routeLineSourceSegments])

  const stopCameraAnimation = useCallback(() => {
    if (cameraFrameRef.current !== undefined) {
      window.cancelAnimationFrame(cameraFrameRef.current)
      cameraFrameRef.current = undefined
    }
    cameraAnimationRef.current = undefined
  }, [])

  const stopMapModePitchAnimation = useCallback(() => {
    if (mapModePitchFrameRef.current !== undefined) {
      window.cancelAnimationFrame(mapModePitchFrameRef.current)
      mapModePitchFrameRef.current = undefined
    }
  }, [])

  const syncRenderedPitch = useCallback((pitch: number) => {
    const nextPitch = normalizeMarkerPitch(pitch)

    renderedPitchRef.current = nextPitch
    if (renderedCameraRef.current) {
      renderedCameraRef.current = {
        ...renderedCameraRef.current,
        pitch: nextPitch,
      }
    }
    updateCurrentMarkerTransform(currentMarkerBearingRef.current ?? 0, nextPitch)
  }, [updateCurrentMarkerTransform])

  const applyMapPitch = useCallback((pitch: number) => {
    const nextPitch = normalizeMarkerPitch(pitch)

    mapRef.current?.setPitch?.(nextPitch)
    syncRenderedPitch(nextPitch)
  }, [syncRenderedPitch])

  const animateMapModePitch = useCallback((targetPitch: number) => {
    const map = mapRef.current

    if (!map) {
      return
    }

    const nextPitch = normalizeMarkerPitch(targetPitch)
    const fromPitch = normalizeMarkerPitch(getCurrentMapPitch())
    const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    stopMapModePitchAnimation()

    if (shouldReduceMotion || Math.abs(fromPitch - nextPitch) < NAVIGATION_MARKER_PITCH_PRECISION) {
      applyMapPitch(nextPitch)
      return
    }

    let startedAt: number | undefined
    const step = (timestamp: number) => {
      if (startedAt === undefined) {
        startedAt = timestamp
      }

      const progress = Math.min((timestamp - startedAt) / MAP_MODE_TRANSITION_MS, 1)
      const easedProgress = easeInOutCubic(progress)
      const interpolatedPitch = fromPitch + (nextPitch - fromPitch) * easedProgress

      applyMapPitch(interpolatedPitch)

      if (progress >= 1) {
        mapModePitchFrameRef.current = undefined
        return
      }

      mapModePitchFrameRef.current = window.requestAnimationFrame(step)
    }

    mapModePitchFrameRef.current = window.requestAnimationFrame(step)
  }, [applyMapPitch, getCurrentMapPitch, stopMapModePitchAnimation])

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

      const progress = Math.min((timestamp - animation.startedAt) / animation.durationMs, 1)
      const easedProgress = easeInOutCubic(progress)
      const nextCamera = {
        position: animation.animatePosition
          ? interpolateCoordinate(animation.from.position, animation.to.position, easedProgress)
          : animation.to.position,
        bearing: interpolateBearingContinuously(animation.from.bearing, animation.to.bearing, easedProgress),
        markerBearing: interpolateBearingContinuously(
          animation.from.markerBearing,
          animation.to.markerBearing,
          easedProgress,
        ),
        pitch: animation.from.pitch + (animation.to.pitch - animation.from.pitch) * easedProgress,
      }

      renderNavigationCamera(nextCamera, animation.applyMap)

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
    options: {
      animated?: boolean
      markerBearing?: number
      pitch?: number
      durationMs?: number
      animatePosition?: boolean
      applyMap?: boolean
      mode?: 'compass'
    } = {},
  ) => {
    if (!window.Tmapv3 || !mapRef.current) {
      return
    }

    const shouldApplyMap = options.applyMap ?? true
    const defaultPitch = mapModePitchFrameRef.current !== undefined
      ? getCurrentMapPitch()
      : shouldApplyMap
        ? getSettingsMapPitch()
        : getDisplayMapPitch()
    const nextCamera = {
      position,
      bearing: typeof bearing === 'number' ? bearing : renderedBearingRef.current,
      markerBearing: options.markerBearing ?? 0,
      pitch: options.pitch ?? defaultPitch,
    }
    const shouldReduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

    if (cameraAnimationRef.current?.mode === 'compass' && options.mode !== 'compass' && !shouldReduceMotion) {
      cameraAnimationRef.current.to = nextCamera
      return
    }

    if (!shouldApplyMap) {
      stopCameraAnimation()
      renderNavigationCamera(nextCamera, false)
      return
    }

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
      durationMs: options.durationMs ?? CAMERA_ANIMATION_MS,
      animatePosition: options.animatePosition ?? true,
      applyMap: shouldApplyMap,
      mode: options.mode,
    }
    startCameraAnimation()
  }, [getDisplayMapPitch, getSettingsMapPitch, renderNavigationCamera, startCameraAnimation, stopCameraAnimation])

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
          pitch: MAP_TOP_DOWN_PITCH,
          mapType: 'ROAD',
          naviControl: false,
          rotateEnabled: true,
          pitchEnabled: false,
          zoomEnabled: true,
          zoomControl: false,
          scaleBar: false,
        })
        if (import.meta.env.DEV) {
          window.__naviTmapMap = mapRef.current
        }
        setStatus('ready')
        setRouteDirectionZoom(MAP_OVERVIEW_ZOOM)
      })
      .catch(() => setStatus('error'))

      return () => {
        cancelled = true
        stopCameraAnimation()
        stopMapModePitchAnimation()
        clearRouteOptionOverlays()
        if (import.meta.env.DEV && window.__naviTmapMap === mapRef.current) {
          delete window.__naviTmapMap
        }
      }
  }, [clearRouteOptionOverlays, stopCameraAnimation, stopMapModePitchAnimation])

  useEffect(() => {
    if (!mapRef.current || status !== 'ready') {
      return
    }

    mapRef.current.setInteractive?.({
      dragEnabled: true,
      rotateEnabled: true,
      pitchEnabled: cameraSettings?.mode === '3d',
      zoomEnabled: true,
    })
  }, [cameraSettings?.mode, status])

  useEffect(() => {
    setCameraFollowing(true)
    navigationZoomRef.current = MAP_NAVIGATION_ZOOM
    setRouteDirectionZoom(MAP_NAVIGATION_ZOOM)
  }, [route, setCameraFollowing])

  useEffect(() => {
    const mapElement = mapElementRef.current
    if (!mapElement || !hasGuidanceRoute || !simulationPosition) {
      return
    }

    let dragStart: { x: number; y: number } | undefined

    const handlePointerDown = (event: PointerEvent) => {
      dragStart = {
        x: event.clientX,
        y: event.clientY,
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStart) {
        return
      }

      const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y)
      if (distance < 8) {
        return
      }

      setCameraFollowing(false)
      stopCameraAnimation()
      dragStart = undefined
    }

    const resetDragStart = () => {
      dragStart = undefined
    }

    const syncNavigationZoom = (event: WheelEvent) => {
      const zoomBeforeWheel = mapRef.current?.getZoom?.()
      const zoomDirection = event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0

      if (zoomDirection !== 0) {
        const nextZoom = (
          typeof zoomBeforeWheel === 'number'
            ? zoomBeforeWheel
            : navigationZoomRef.current
        ) + zoomDirection
        navigationZoomRef.current = nextZoom
        setRouteDirectionZoom(nextZoom)
        onCameraSettingsChange?.({ zoom: nextZoom })
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const currentZoom = mapRef.current?.getZoom?.()
          if (
            typeof currentZoom === 'number' &&
            currentZoom !== zoomBeforeWheel
          ) {
            navigationZoomRef.current = currentZoom
            setRouteDirectionZoom(currentZoom)
            onCameraSettingsChange?.({ zoom: currentZoom })
          }
        })
      })
    }

    mapElement.addEventListener('pointerdown', handlePointerDown)
    mapElement.addEventListener('pointermove', handlePointerMove)
    mapElement.addEventListener('pointerup', resetDragStart)
    mapElement.addEventListener('pointercancel', resetDragStart)
    mapElement.addEventListener('pointerleave', resetDragStart)
    mapElement.addEventListener('wheel', syncNavigationZoom, { passive: true })

    return () => {
      mapElement.removeEventListener('pointerdown', handlePointerDown)
      mapElement.removeEventListener('pointermove', handlePointerMove)
      mapElement.removeEventListener('pointerup', resetDragStart)
      mapElement.removeEventListener('pointercancel', resetDragStart)
      mapElement.removeEventListener('pointerleave', resetDragStart)
      mapElement.removeEventListener('wheel', syncNavigationZoom)
    }
  }, [hasGuidanceRoute, onCameraSettingsChange, setCameraFollowing, simulationPosition, stopCameraAnimation])

  useEffect(() => {
    const mapElement = mapElementRef.current
    if (!mapElement || status !== 'ready' || cameraSettings?.mode !== '3d') {
      return
    }

    let frameId: number | undefined

    const syncMarkerPitchFromMap = () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId)
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = undefined
        const currentPitch = getCurrentMapPitch()

        syncRenderedPitch(currentPitch)
        onCameraSettingsChange?.({ pitch: renderedPitchRef.current })
      })
    }

    mapElement.addEventListener('pointermove', syncMarkerPitchFromMap)
    mapElement.addEventListener('pointerup', syncMarkerPitchFromMap)
    mapElement.addEventListener('wheel', syncMarkerPitchFromMap, { passive: true })

    return () => {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId)
      }
      mapElement.removeEventListener('pointermove', syncMarkerPitchFromMap)
      mapElement.removeEventListener('pointerup', syncMarkerPitchFromMap)
      mapElement.removeEventListener('wheel', syncMarkerPitchFromMap)
    }
  }, [cameraSettings?.mode, getCurrentMapPitch, onCameraSettingsChange, status, syncRenderedPitch])

  useEffect(() => {
    if (!mapRef.current || status !== 'ready' || !cameraSettings) {
      return
    }

    const nextZoom = cameraSettings.zoom
    const nextPitch = getSettingsMapPitch()
    const modeChanged = (
      previousCameraModeRef.current !== undefined &&
      previousCameraModeRef.current !== cameraSettings.mode
    )

    previousCameraModeRef.current = cameraSettings.mode
    navigationZoomRef.current = nextZoom
    setRouteDirectionZoom(nextZoom)

    if (modeChanged) {
      animateMapModePitch(nextPitch)
      return
    }

    if (mapModePitchFrameRef.current !== undefined) {
      return
    }

    stopMapModePitchAnimation()
    applyMapCameraSettings(mapRef.current, nextZoom, nextPitch)
    syncRenderedPitch(nextPitch)
  }, [
    animateMapModePitch,
    cameraSettings,
    getCurrentMapPitch,
    getSettingsMapPitch,
    status,
    stopMapModePitchAnimation,
    syncRenderedPitch,
  ])

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
    const shouldFollowCamera = cameraFollowingRef.current
    const markerBearing = shouldFollowCamera
      ? cameraBearing.markerBearing
      : getNavigationMarkerBearing(route?.coordinates, displayPosition, getCurrentMapBearing())
    const markerPitch = shouldFollowCamera ? getSettingsMapPitch() : getDisplayMapPitch()

    if (!currentMarkerRef.current) {
      currentMarkerBearingRef.current = markerBearing
      currentMarkerPitchRef.current = normalizeMarkerPitch(markerPitch)
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        anchor: 'center',
        iconSize: new window.Tmapv3.Size(NAVIGATION_MARKER_SIZE, NAVIGATION_MARKER_SIZE),
        iconHTML: createNavigationArrowMarker(markerBearing, markerPitch),
        map: mapRef.current,
      })
    }

    applyNavigationCamera(
      displayPosition,
      cameraBearing.mapBearing,
      {
        animated: Boolean(route?.coordinates.length || mapModePitchFrameRef.current !== undefined),
        applyMap: !hasRouteSelectionOptions && (!route?.coordinates.length || shouldFollowCamera),
        animatePosition: mapModePitchFrameRef.current === undefined,
        markerBearing,
      },
    )
  }, [applyNavigationCamera, currentPosition, getCurrentMapBearing, getDisplayMapPitch, getSettingsMapPitch, hasRouteSelectionOptions, northUpLocked, route?.coordinates, status])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready') {
      return
    }

    if (route?.coordinates.length || !routeOptions?.length) {
      onRouteOptionsOverlayReady?.(false)
      clearRouteOptionOverlays()
      return
    }

    const overlaySignature = getRouteOptionOverlaySignature(routeOptions)
    if (routeOptionOverlaySignatureRef.current === overlaySignature) {
      return
    }

    clearRouteOptionOverlays()
    onRouteOptionsOverlayReady?.(false)
    const activeOptionId = getActiveRouteOptionId(routeOptions, activeRouteOptionId)
    const renderRouteOptions = [
      ...routeOptions.filter((option) => option.id === activeOptionId),
      ...routeOptions.filter((option) => option.id !== activeOptionId),
    ]
    const map = mapRef.current

    const routeOptionBoundsCoordinates = getRouteOptionBoundsCoordinates(routeOptions, [
      origin?.coordinate,
      destination?.coordinate,
    ])
    const routeSelectionCamera = getRouteSelectionCamera(routeOptionBoundsCoordinates, mapElementRef.current)
    if (routeSelectionCamera) {
      const centerLatLng = new window.Tmapv3.LatLng(
        routeSelectionCamera.center.lat,
        routeSelectionCamera.center.lng,
      )
      const overviewCamera = {
        position: routeSelectionCamera.center,
        bearing: 0,
        markerBearing: 0,
        pitch: MAP_TOP_DOWN_PITCH,
      }

      applyMapCamera(
        map,
        overviewCamera,
        centerLatLng,
        routeSelectionCamera.zoom,
      )
      renderedBearingRef.current = 0
      renderedPitchRef.current = MAP_TOP_DOWN_PITCH
      renderedCameraRef.current = overviewCamera
      syncCompassBearing(0)
    }

    routeOptionOverlaySignatureRef.current = overlaySignature

    let cancelled = false
    markRoutePerformance('route-option-overlay-start')
    const finishRouteOptionOverlayBuild = () => {
      const activeOverlay = routeOptionOverlayRefs.current.find((overlay) => overlay.id === activeOptionId)
      routeOptionActiveIdRef.current = activeOverlay?.id
      routeOptionActiveLineRefs.current = activeOverlay?.activeLines ?? []
      routeOptionHitTestCacheRef.current = createRouteOptionHitTestCache(
        routeOptionOverlayRefs.current,
        map,
      )

      const revealOverlays = () => {
        const renderedLines = getRouteOptionRenderedLines(
          routeOptionOverlayRefs.current,
          routeOptionActiveIdRef.current,
        )

        const revealChunk = (startIndex: number) => {
          if (cancelled || !mapRef.current || mapRef.current !== map) {
            return
          }

          const nextIndex = revealRouteOptionOverlayChunk(renderedLines, map, startIndex)

          if (nextIndex < renderedLines.length) {
            routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
              revealChunk(nextIndex)
            })
            return
          }

          routeOptionOverlayVisibleRef.current = true
          onRouteOptionsOverlayReady?.(true)
          markRoutePerformance('route-option-overlay-end')
          measureRoutePerformance('route-option-overlay-total', 'route-option-overlay-start', 'route-option-overlay-end')
          routeOptionOverlayBuildFrameRef.current = undefined
        }

        revealChunk(0)
      }

      revealOverlays()
    }

    const buildActiveRouteOptionOverlay = (overlayIndex: number, segmentIndex = 0) => {
      if (cancelled || !mapRef.current || mapRef.current !== map) {
        return
      }

      const overlay = routeOptionOverlayRefs.current[overlayIndex]
      if (!overlay) {
        finishRouteOptionOverlayBuild()
        return
      }

      const nextSegmentIndex = appendRouteOptionPolylineChunk(
        overlay.activeLines,
        overlay.option,
        overlay.segments,
        true,
        undefined,
        segmentIndex,
        overlay.id === activeOptionId,
      )

      if (nextSegmentIndex < overlay.segments.length) {
        routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
          buildActiveRouteOptionOverlay(overlayIndex, nextSegmentIndex)
        })
        return
      }

      if (overlayIndex + 1 >= routeOptionOverlayRefs.current.length) {
        finishRouteOptionOverlayBuild()
        return
      }

      routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
        buildActiveRouteOptionOverlay(overlayIndex + 1)
      })
    }

    const buildBaseRouteOptionOverlay = (index: number) => {
      if (cancelled || !mapRef.current || mapRef.current !== map) {
        return
      }

      const option = renderRouteOptions[index]
      if (!option) {
        buildActiveRouteOptionOverlay(0)
        return
      }

      const overlay = createRouteOptionOverlay(option)
      routeOptionOverlayRefs.current = [
        ...routeOptionOverlayRefs.current,
        overlay,
      ]

      if (index + 1 >= renderRouteOptions.length) {
        buildActiveRouteOptionOverlay(0)
        return
      }

      routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
        buildBaseRouteOptionOverlay(index + 1)
      })
    }

    routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
      routeOptionOverlayBuildFrameRef.current = window.requestAnimationFrame(() => {
        buildBaseRouteOptionOverlay(0)
      })
    })

    return () => {
      cancelled = true
      if (routeOptionOverlayBuildFrameRef.current !== undefined) {
        window.cancelAnimationFrame(routeOptionOverlayBuildFrameRef.current)
        routeOptionOverlayBuildFrameRef.current = undefined
      }
    }
  }, [
    clearRouteOptionOverlays,
    activeRouteOptionId,
    destination?.coordinate,
    onRouteOptionPreviewChange,
    onRouteOptionsOverlayReady,
    origin?.coordinate,
    route?.coordinates.length,
    routeOptions,
    status,
    syncCompassBearing,
  ])

  useEffect(() => {
    if (!routeOptions?.length) {
      return
    }

    updateRouteOptionOverlayPreview(getActiveRouteOptionId(routeOptions, activeRouteOptionId))
  }, [activeRouteOptionId, routeOptions, updateRouteOptionOverlayPreview])

  useEffect(() => {
    const mapElement = mapElementRef.current
    if (
      !mapElement ||
      !mapRef.current ||
      !onRouteOptionPreviewChange ||
      route?.coordinates.length ||
      !routeOptions?.length ||
      status !== 'ready'
    ) {
      return
    }

    const updatePreviewFromPointer = (event: MouseEvent) => {
      const nextOptionId = getPointerRouteOptionId(
        routeOptionOverlayRefs.current,
        routeOptionHitTestCacheRef,
        mapRef.current,
        mapElement,
        event,
      )

      if (nextOptionId) {
        onRouteOptionPreviewChange(nextOptionId)
      }
    }

    mapElement.addEventListener('click', updatePreviewFromPointer)

    return () => {
      mapElement.removeEventListener('click', updatePreviewFromPointer)
    }
  }, [onRouteOptionPreviewChange, route?.coordinates.length, routeOptions, status])

  useEffect(() => {
    if (!window.Tmapv3 || !mapRef.current || status !== 'ready') {
      return
    }

    const drawableSegments = routeLineSegments.filter(isDrawableRouteSegment)

    if (!drawableSegments.length) {
      if (!remainingRouteCoordinates.length) {
        routeLineRefs.current.forEach((line) => line?.setMap?.(null))
        routeLineRefs.current = []
        routeDirectionMarkerRefs.current.forEach(({ marker }) => marker.setMap(null))
        routeDirectionMarkerRefs.current = []
        routeLineSignatureRef.current = undefined
        routeLineStructureSignatureRef.current = undefined
        routeDirectionMarkerSignatureRef.current = undefined
      }
      return
    }

    const routeLineSignature = getRouteLineSignature(drawableSegments)
    const routeLineChanged = routeLineSignatureRef.current !== routeLineSignature

    if (routeLineChanged) {
      const routeColor = getNavigationRouteColor()

      const routeLineStructureSignature = getRouteLineStructureSignature(drawableSegments)
      const canUpdateExistingRouteLines = (
        routeLineStructureSignatureRef.current === routeLineStructureSignature &&
        routeLineRefs.current.length === drawableSegments.length * 2 &&
        routeLineRefs.current.every((line) => typeof line?.setPath === 'function')
      )

      if (canUpdateExistingRouteLines) {
        drawableSegments.forEach((segment, index) => {
          const path = toTmapPath(segment.coordinates)
          routeLineRefs.current[index * 2]?.setPath?.(path)
          routeLineRefs.current[index * 2 + 1]?.setPath?.(path)
        })
      } else {
        routeLineRefs.current.forEach((line) => line?.setMap?.(null))
        const nextRouteLines = drawableSegments.flatMap((segment) => (
          createRouteLinePolylines(segment, routeColor, mapRef.current)
        ))

        routeLineRefs.current = nextRouteLines
        routeLineStructureSignatureRef.current = routeLineStructureSignature
      }
      routeLineSignatureRef.current = routeLineSignature
    }
    const routeDirectionMarkerSignature = getRouteDirectionMarkerSignature(routeDirectionCoordinates, routeDirectionZoom)
    if (routeDirectionMarkerSignatureRef.current !== routeDirectionMarkerSignature) {
      routeDirectionMarkerRefs.current.forEach(({ marker }) => marker.setMap(null))
      routeDirectionMarkerRefs.current = createRouteDirectionMarkers(
        routeDirectionCoordinates,
        mapRef.current,
        getCurrentMapBearing(),
        routeDirectionZoom,
      )
      routeDirectionMarkerSignatureRef.current = routeDirectionMarkerSignature
    } else {
      updateRouteDirectionMarkerBearings(getCurrentMapBearing())
    }

    const firstCoordinate = remainingRouteCoordinates[0]
    if (firstCoordinate) {
      const bearing = getRouteBearing(remainingRouteCoordinates)
      const firstCameraCenter = resolveCameraCenter(firstCoordinate)

      if (!progressPosition) {
        const overviewCamera = {
          position: firstCoordinate,
          bearing,
          markerBearing: 0,
          pitch: MAP_TOP_DOWN_PITCH,
        }

        applyMapCamera(mapRef.current, overviewCamera, firstCameraCenter, MAP_OVERVIEW_ZOOM)
        renderedBearingRef.current = bearing
        renderedPitchRef.current = MAP_TOP_DOWN_PITCH
        syncCompassBearing(bearing)
        updateRouteDirectionMarkerBearings(bearing)
        renderedCameraRef.current = overviewCamera
      }
    }
  }, [
    getCurrentMapBearing,
    progressPosition,
    remainingRouteCoordinates,
    routeDirectionCoordinates,
    resolveCameraCenter,
    routeDirectionZoom,
    routeLineSegments,
    status,
    syncCompassBearing,
    updateRouteDirectionMarkerBearings,
  ])

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

    const displayPosition = progressPosition ?? simulationPosition
    const position = new window.Tmapv3.LatLng(displayPosition.lat, displayPosition.lng)
    const cameraBearing = getNavigationCameraBearing(
      route?.coordinates,
      displayPosition,
      northUpLocked,
    )
    const shouldFollowCamera = cameraFollowingRef.current
    const markerBearing = shouldFollowCamera
      ? cameraBearing.markerBearing
      : getNavigationMarkerBearing(route?.coordinates, displayPosition, getCurrentMapBearing())
    const markerPitch = shouldFollowCamera ? getSettingsMapPitch() : getDisplayMapPitch()

    if (!currentMarkerRef.current) {
      currentMarkerBearingRef.current = markerBearing
      currentMarkerPitchRef.current = normalizeMarkerPitch(markerPitch)
      currentMarkerRef.current = new window.Tmapv3.Marker({
        position,
        anchor: 'center',
        iconSize: new window.Tmapv3.Size(NAVIGATION_MARKER_SIZE, NAVIGATION_MARKER_SIZE),
        iconHTML: createNavigationArrowMarker(markerBearing, markerPitch),
        map: mapRef.current,
      })
    }

    applyNavigationCamera(
      displayPosition,
      cameraBearing.mapBearing,
      {
        animated: false,
        applyMap: shouldFollowCamera,
        markerBearing,
      },
    )
  }, [applyNavigationCamera, getCurrentMapBearing, getDisplayMapPitch, getSettingsMapPitch, northUpLocked, progressPosition, route?.coordinates, simulationPosition, status])

  useEffect(() => {
    if (!onSimulationFrameRendererReady || !window.Tmapv3 || !mapRef.current || status !== 'ready') {
      onSimulationFrameRendererReady?.(undefined)
      return
    }

    onSimulationFrameRendererReady((position) => {
      const displayPosition = route?.coordinates.length
        ? projectCoordinateToRoute(route.coordinates, position)
        : position
      const cameraBearing = getNavigationCameraBearing(
        route?.coordinates,
        displayPosition,
        northUpLocked,
      )
      const shouldFollowCamera = cameraFollowingRef.current
      const markerBearing = shouldFollowCamera
        ? cameraBearing.markerBearing
        : getNavigationMarkerBearing(route?.coordinates, displayPosition, getCurrentMapBearing())

      applyNavigationCamera(
        displayPosition,
        cameraBearing.mapBearing,
        {
          animated: false,
          applyMap: shouldFollowCamera,
          markerBearing,
        },
      )
      updateVisibleRouteLineHead(displayPosition)
    })

    return () => onSimulationFrameRendererReady(undefined)
  }, [
    applyNavigationCamera,
    getCurrentMapBearing,
    northUpLocked,
    onSimulationFrameRendererReady,
    route?.coordinates,
    status,
    updateVisibleRouteLineHead,
  ])

  const resetMapOrientation = useCallback((position?: Coordinate) => {
    setNorthUpLocked(true)
    const resetPitch = getSettingsMapPitch()

    const targetPosition = position
      ?? simulationPosition
      ?? currentPosition
      ?? renderedCameraRef.current?.position

    if (targetPosition) {
      const cameraBearing = getNavigationCameraBearing(
        route?.coordinates,
        targetPosition,
        true,
      )

      applyNavigationCamera(targetPosition, cameraBearing.mapBearing, {
        animated: true,
        animatePosition: false,
        durationMs: COMPASS_CAMERA_ANIMATION_MS,
        markerBearing: cameraBearing.markerBearing,
        mode: 'compass',
        pitch: resetPitch,
      })
      onCameraSettingsChange?.({ pitch: resetPitch })
      return
    }

    mapRef.current?.setBearing?.(0)
    mapRef.current?.setPitch?.(resetPitch)
    renderedBearingRef.current = 0
    renderedPitchRef.current = resetPitch
    onCameraSettingsChange?.({ pitch: resetPitch })
    setMapBearing(0)
  }, [applyNavigationCamera, currentPosition, getSettingsMapPitch, onCameraSettingsChange, route?.coordinates, simulationPosition])

  const resumeCameraFollowing = useCallback(() => {
    setCameraFollowing(true)

    const targetPosition = progressPosition
      ?? simulationPosition
      ?? currentPosition

    if (!targetPosition) {
      return
    }

    const cameraBearing = getNavigationCameraBearing(
      route?.coordinates,
      targetPosition,
      northUpLocked,
    )

    stopCameraAnimation()
    applyNavigationCamera(targetPosition, cameraBearing.mapBearing, {
      animated: false,
      markerBearing: cameraBearing.markerBearing,
    })
  }, [
    applyNavigationCamera,
    currentPosition,
    northUpLocked,
    progressPosition,
    route?.coordinates,
    setCameraFollowing,
    simulationPosition,
    stopCameraAnimation,
  ])

  const centerCurrentLocationInRegularMode = useCallback((resetZoom: boolean) => {
    if (!window.Tmapv3 || !mapRef.current || !currentPosition) {
      return
    }

    const pitch = getSettingsMapPitch()
    const bearing = getCurrentMapBearing()
    const markerBearing = currentMarkerBearingRef.current ?? 0
    const camera = {
      position: currentPosition,
      bearing,
      markerBearing,
      pitch,
    }
    const markerPosition = new window.Tmapv3.LatLng(currentPosition.lat, currentPosition.lng)
    const nextZoom = resetZoom
      ? MAP_OVERVIEW_ZOOM
      : mapRef.current.getZoom?.() ?? navigationZoomRef.current

    if (resetZoom) {
      navigationZoomRef.current = MAP_OVERVIEW_ZOOM
      setRouteDirectionZoom(MAP_OVERVIEW_ZOOM)
      onCameraSettingsChange?.({ zoom: MAP_OVERVIEW_ZOOM })
    } else {
      navigationZoomRef.current = nextZoom
    }

    applyMapCamera(
      mapRef.current,
      camera,
      () => resolveCameraCenter(currentPosition),
      nextZoom,
      { preserveZoom: !resetZoom },
    )
    renderedBearingRef.current = bearing
    renderedPitchRef.current = pitch
    renderedCameraRef.current = camera
    syncCompassBearing(bearing)
    updateRouteDirectionMarkerBearings(bearing)
    currentMarkerRef.current?.setPosition?.(markerPosition)
    updateCurrentMarkerTransform(markerBearing, pitch)
  }, [
    currentPosition,
    getCurrentMapBearing,
    getSettingsMapPitch,
    onCameraSettingsChange,
    resolveCameraCenter,
    syncCompassBearing,
    updateCurrentMarkerTransform,
    updateRouteDirectionMarkerBearings,
  ])

  useEffect(() => {
    const hadRouteSelectionOptions = previousRouteSelectionOptionsRef.current
    previousRouteSelectionOptionsRef.current = hasRouteSelectionOptions

    if (
      hadRouteSelectionOptions &&
      !hasRouteSelectionOptions &&
      !route?.coordinates.length &&
      !simulationPosition
    ) {
      centerCurrentLocationInRegularMode(true)
    }
  }, [centerCurrentLocationInRegularMode, hasRouteSelectionOptions, route?.coordinates.length, simulationPosition])

  const handleRequestLocation = () => {
    onRequestLocation?.()

    if (hasGuidanceRoute || simulationPosition) {
      lastCurrentLocationPressAtRef.current = undefined
      resumeCameraFollowing()
      return
    }

    const now = performance.now()
    const previousPressAt = lastCurrentLocationPressAtRef.current
    const shouldResetZoom = previousPressAt !== undefined && now - previousPressAt <= CURRENT_LOCATION_DOUBLE_PRESS_MS
    lastCurrentLocationPressAtRef.current = now
    centerCurrentLocationInRegularMode(shouldResetZoom)
  }

  return (
    <div className="relative z-0 h-full w-full overflow-hidden bg-[var(--nav-frame)]">
      <div ref={mapElementRef} className="h-full w-full" data-testid="tmap-canvas" />
      {status === 'ready' ? (
        <div className="absolute bottom-[4.25rem] left-5 z-10 flex flex-col items-center gap-3 max-sm:bottom-16 max-sm:left-3">
          <MapControlButton label="나침반 원위치" onClick={() => resetMapOrientation()}>
            <span
              className="relative grid size-11 place-items-center"
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
          {/* <div className="overflow-hidden rounded-full bg-[var(--nav-surface-raised)]/95 shadow-[0_8px_24px_rgb(15_23_42/0.14)] backdrop-blur">
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
          </div> */}
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

function easeInOutCubic(progress: number) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2
}

function applyMapCamera(
  map: NonNullable<Window['Tmapv3Map']>,
  camera: RenderedCamera,
  center: unknown | (() => unknown),
  zoom: number,
  options: { preserveZoom?: boolean } = {},
) {
  const nativeCamera = getNativeMapCamera(map)
  const resolveCenter = () => (typeof center === 'function' ? center() : center)

  if (nativeCamera?.jumpTo) {
    const centerArray = getLngLatArray(resolveCenter())
    if (!centerArray) {
      return
    }
    const cameraOptions = options.preserveZoom
      ? {
          center: centerArray,
          bearing: camera.bearing,
          pitch: camera.pitch,
        }
      : {
          zoom,
          center: centerArray,
          bearing: camera.bearing,
          pitch: camera.pitch,
        }

    nativeCamera.jumpTo(
      cameraOptions,
      { animate: false },
      { moveByProgram: true },
    )
    return
  }

  if (!options.preserveZoom) {
    map.setZoom?.(zoom)
  }
  map.setPitch?.(camera.pitch)
  map.setBearing?.(camera.bearing)
  map.setCenter?.(resolveCenter())
}

function applyMapCameraSettings(
  map: Window['Tmapv3Map'] | undefined,
  zoom: number,
  pitch: number,
) {
  if (!map) {
    return
  }

  const nativeCamera = getNativeMapCamera(map)
  const centerArray = getLngLatArray(map.getCenter?.())
    ?? getLngLatArray(nativeCamera?.getCenter?.())
  const mapBearing = map.getBearing?.()
  const nativeBearing = nativeCamera?.getBearing?.()
  const bearing = Number.isFinite(mapBearing)
    ? mapBearing!
    : Number.isFinite(nativeBearing)
      ? nativeBearing!
      : 0

  if (nativeCamera?.jumpTo && centerArray) {
    nativeCamera.jumpTo(
      {
        zoom,
        center: centerArray,
        bearing,
        pitch,
      },
      { animate: false },
      { moveByProgram: true },
    )
    return
  }

  map.setZoom?.(zoom)
  map.setPitch?.(pitch)
}

function getNativeMapCamera(map: NonNullable<Window['Tmapv3Map']>) {
  const vsmMap = map.vsmMap?.()
  return vsmMap?.getCamera?.()
}

function getLngLatArray(latLng: unknown): [number, number] | undefined {
  if (Array.isArray(latLng) && latLng.length >= 2) {
    const lng = Number(latLng[0])
    const lat = Number(latLng[1])

    return Number.isFinite(lat) && Number.isFinite(lng)
      ? [lng, lat]
      : undefined
  }

  if (!latLng || typeof latLng !== 'object') {
    return undefined
  }

  const latLngObject = latLng as {
    toLngLatArray?: () => [number, number]
    lat?: number | (() => number)
    lng?: number | (() => number)
  }

  if (typeof latLngObject.toLngLatArray === 'function') {
    const value = latLngObject.toLngLatArray()
    return [Number(value[0]), Number(value[1])]
  }

  const lat = getLatLngValue(latLngObject.lat)
  const lng = getLatLngValue(latLngObject.lng)

  if (typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng)) {
    return [lng, lat]
  }

  return undefined
}

function getLatLngValue(value: number | (() => number) | undefined) {
  return typeof value === 'function' ? value() : value
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

  const vehicleBearing = getLocalRouteBearingNearCoordinate(routeCoordinates, position)
  const mapBearing = northUpLocked ? 0 : vehicleBearing

  return {
    mapBearing,
    markerBearing: getVehicleMarkerBearing(vehicleBearing, mapBearing),
  }
}

function getNavigationMarkerBearing(
  routeCoordinates: Coordinate[] | undefined,
  position: Coordinate,
  mapBearing: number,
) {
  if (!routeCoordinates?.length) {
    return 0
  }

  const vehicleBearing = getLocalRouteBearingNearCoordinate(routeCoordinates, position)
  return getVehicleMarkerBearing(vehicleBearing, mapBearing)
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

function normalizeMarkerPitch(pitch: number) {
  if (!Number.isFinite(pitch)) {
    return 0
  }

  return Math.max(0, Math.min(70, pitch))
}

function formatCssPitch(pitch: number) {
  const normalizedPitch = normalizeMarkerPitch(pitch)

  if (normalizedPitch < NAVIGATION_MARKER_PITCH_PRECISION) {
    return '0'
  }

  return Number(normalizedPitch.toFixed(1)).toString()
}

function compactRouteCoordinates(coordinates: Coordinate[]) {
  return coordinates.filter((coordinate, index) => (
    index === 0 || getSquaredCoordinateDistance(coordinates[index - 1], coordinate) > 0.000000000001
  ))
}

function getNavigationRouteColor() {
  return window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--nav-route')
    .trim() || '#00A2FE'
}

function createRouteLinePolylines(
  segment: RouteTrafficSegment,
  routeColor: string,
  map: Window['Tmapv3Map'],
) {
  const path = toTmapPath(segment.coordinates)

  return [
    new window.Tmapv3!.Polyline({
      path,
      strokeColor: getRouteLineBorderColor(segment.congestion),
      strokeOpacity: 1,
      strokeWeight: ROUTE_LINE_BORDER_STROKE_WEIGHT,
      map,
    }),
    new window.Tmapv3!.Polyline({
      path,
      strokeColor: getRouteLineColor(segment.congestion, routeColor),
      strokeOpacity: 1,
      strokeWeight: ROUTE_LINE_STROKE_WEIGHT,
      map,
    }),
  ]
}

function createRouteOptionOverlay(
  option: NavigationRouteOption,
  map?: Window['Tmapv3Map'] | null,
): RouteOptionOverlay {
  const segments = getRouteOptionLineSegments(option.route)
  const baseLines = createRouteOptionPolylines(
    option,
    [{
      congestion: 0,
      coordinates: option.route.coordinates,
    }],
    false,
    map,
  )

  return {
    id: option.id,
    activeLines: [],
    baseLines,
    hitTestCoordinates: getRouteOptionHitTestCoordinates(option.route.coordinates),
    option,
    segments,
  }
}

function createRouteOptionPolylines(
  option: NavigationRouteOption,
  segments: RouteTrafficSegment[],
  active: boolean,
  map?: Window['Tmapv3Map'] | null,
  visible = true,
) {
  return segments.flatMap((segment) => {
    return createRouteOptionPolylinePair(option, segment, active, map, visible)
  })
}

function appendRouteOptionPolylineChunk(
  targetLines: RouteOptionRenderedLine[],
  option: NavigationRouteOption,
  segments: RouteTrafficSegment[],
  active: boolean,
  map: Window['Tmapv3Map'] | null | undefined,
  startIndex: number,
  visible = true,
) {
  const endIndex = Math.min(startIndex + ROUTE_OPTION_POLYLINE_CHUNK_SIZE, segments.length)

  for (let index = startIndex; index < endIndex; index += 1) {
    const segment = segments[index]
    if (segment) {
      targetLines.push(...createRouteOptionPolylinePair(option, segment, active, map, visible))
    }
  }

  return endIndex
}

function createRouteOptionPolylinePair(
  option: NavigationRouteOption,
  segment: RouteTrafficSegment,
  active: boolean,
  map?: Window['Tmapv3Map'] | null,
  visible = true,
): RouteOptionRenderedLine[] {
  const lineStyle = getRouteOptionOverlayLineStyle(active)
  const path = toTmapPath(segment.coordinates)
  const renderedPath = visible ? path : getHiddenRouteOptionPath(path)
  const borderLine = new window.Tmapv3!.Polyline({
    path: renderedPath,
    strokeColor: getRouteOptionLineColor('border', option, segment.congestion, active),
    strokeOpacity: lineStyle.borderOpacity,
    strokeWeight: lineStyle.borderWeight,
    zIndex: getRouteOptionOverlayLineZIndex('border', active),
    map,
  })
  const routeLine = new window.Tmapv3!.Polyline({
    path: renderedPath,
    strokeColor: getRouteOptionLineColor('route', option, segment.congestion, active),
    strokeOpacity: lineStyle.strokeOpacity,
    strokeWeight: lineStyle.strokeWeight,
    zIndex: getRouteOptionOverlayLineZIndex('route', active),
    map,
  })

  return [
    {
      kind: 'border',
      line: borderLine,
      path,
    },
    {
      kind: 'route',
      line: routeLine,
      path,
    },
  ]
}

function disposeRouteOptionPolyline(renderedLine: RouteOptionRenderedLine) {
  renderedLine.line.setPath?.(getHiddenRouteOptionPath(renderedLine.path))
  renderedLine.line.setOptions?.({
    strokeOpacity: 0,
    strokeWeight: 0,
  })
}

function setRouteOptionActiveLinesVisible(overlay: RouteOptionOverlay, visible: boolean) {
  overlay.activeLines.forEach((renderedLine) => {
    renderedLine.line.setPath?.(visible ? renderedLine.path : getHiddenRouteOptionPath(renderedLine.path))
    renderedLine.line.setOptions?.({
      zIndex: getRouteOptionOverlayLineZIndex(renderedLine.kind, true),
    })
  })
}

function getRouteOptionRenderedLines(
  overlays: RouteOptionOverlay[],
  activeOptionId: string | undefined,
) {
  const activeOverlay = overlays.find((overlay) => overlay.id === activeOptionId)

  return [
    ...overlays.flatMap((overlay) => overlay.baseLines),
    ...overlays
      .filter((overlay) => overlay.id !== activeOptionId)
      .flatMap((overlay) => overlay.activeLines),
    ...(activeOverlay?.activeLines ?? []),
  ]
}

function revealRouteOptionOverlayChunk(
  renderedLines: RouteOptionRenderedLine[],
  map: Window['Tmapv3Map'],
  startIndex: number,
) {
  const endIndex = Math.min(startIndex + ROUTE_OPTION_POLYLINE_CHUNK_SIZE, renderedLines.length)

  for (let index = startIndex; index < endIndex; index += 1) {
    renderedLines[index]?.line.setMap?.(map)
  }

  return endIndex
}

function getHiddenRouteOptionPath(path: unknown[]) {
  return path.length > 0 ? [path[0], path[0]] : path
}

function getRouteOptionLineSegments(route: NavigationRoute): RouteTrafficSegment[] {
  if (route.routeLineSegments?.length) {
    return route.routeLineSegments
  }

  if (route.trafficSegments?.length) {
    return route.trafficSegments
  }

  return [{
    congestion: 0,
    coordinates: route.coordinates,
  }]
}

function getRouteOptionLineColor(
  kind: RouteOptionOverlayLine['kind'],
  option: NavigationRouteOption,
  congestion: TrafficCongestion,
  active: boolean,
) {
  if (kind === 'border') {
    return '#ffffff'
  }

  if (!active) {
    return '#9AA6B2'
  }

  return getRouteLineColor(congestion, option.color)
}

function getRouteOptionOverlayLineStyle(active: boolean) {
  return {
    borderOpacity: active ? 1 : 0.96,
    borderWeight: 14,
    strokeOpacity: 0.98,
    strokeWeight: 9,
  }
}

function getRouteOptionOverlayLineZIndex(kind: RouteOptionOverlayLine['kind'], active: boolean) {
  const baseZIndex = active ? 250 : 190

  if (kind === 'route') {
    return baseZIndex + 1
  }

  return baseZIndex
}

function getPointerRouteOptionId(
  overlays: RouteOptionOverlay[],
  cacheRef: MutableRefObject<RouteOptionHitTestCache | undefined>,
  map: Window['Tmapv3Map'],
  mapElement: HTMLElement,
  event: MouseEvent,
) {
  if (!map?.realToScreen || !window.Tmapv3) {
    return undefined
  }

  const pointer = getPointerPointInElement(event, mapElement)
  const cache = getRouteOptionHitTestCache(overlays, cacheRef, map)
  const closest = cache.options.reduce<{
    id: string | undefined
    distance: number
  }>((best, option) => {
    const distance = getRouteOptionScreenDistance(option.points, pointer)

    return distance < best.distance
      ? { id: option.id, distance }
      : best
  }, {
    id: undefined,
    distance: Number.POSITIVE_INFINITY,
  })

  return closest.distance <= ROUTE_OPTION_HOVER_DISTANCE_PX ? closest.id : undefined
}

function getRouteOptionHitTestCache(
  overlays: RouteOptionOverlay[],
  cacheRef: MutableRefObject<RouteOptionHitTestCache | undefined>,
  map: NonNullable<Window['Tmapv3Map']>,
) {
  const cameraKey = getRouteOptionHitTestCameraKey(map)

  if (cacheRef.current?.cameraKey === cameraKey) {
    return cacheRef.current
  }

  cacheRef.current = createRouteOptionHitTestCache(overlays, map, cameraKey)
  return cacheRef.current
}

function createRouteOptionHitTestCache(
  overlays: RouteOptionOverlay[],
  map: NonNullable<Window['Tmapv3Map']>,
  cameraKey = getRouteOptionHitTestCameraKey(map),
): RouteOptionHitTestCache {
  return {
    cameraKey,
    options: overlays.map((overlay) => ({
      id: overlay.id,
      points: overlay.hitTestCoordinates
        .map((coordinate) => projectCoordinateToScreenPoint(coordinate, map))
        .filter((point): point is ScreenPoint => Boolean(point)),
    })),
  }
}

function getRouteOptionHitTestCameraKey(map: NonNullable<Window['Tmapv3Map']>) {
  const centerValue = map.getCenter?.()
  const center = centerValue ? getLngLatArray(centerValue) : undefined
  const zoom = map.getZoom?.()
  const bearing = map.getBearing?.()
  const pitch = map.getPitch?.()

  return [
    center ? center[1].toFixed(6) : '',
    center ? center[0].toFixed(6) : '',
    typeof zoom === 'number' ? zoom.toFixed(3) : '',
    typeof bearing === 'number' ? bearing.toFixed(2) : '',
    typeof pitch === 'number' ? pitch.toFixed(2) : '',
  ].join(':')
}

function getRouteOptionHitTestCoordinates(coordinates: Coordinate[]) {
  if (coordinates.length <= 2) {
    return coordinates
  }

  const sampledCoordinates = coordinates.reduce<Coordinate[]>((result, coordinate, index) => {
    if (
      index > 0 &&
      index < coordinates.length - 1 &&
      result.length > 0 &&
      getSquaredCoordinateDistance(result[result.length - 1], coordinate) < ROUTE_OPTION_HIT_TEST_MIN_DISTANCE_SQUARED
    ) {
      return result
    }

    result.push(coordinate)
    return result
  }, [])

  const lastCoordinate = coordinates[coordinates.length - 1]
  if (sampledCoordinates[sampledCoordinates.length - 1] !== lastCoordinate) {
    sampledCoordinates.push(lastCoordinate)
  }

  return sampledCoordinates
}

function getPointerPointInElement(event: MouseEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect()

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function getRouteOptionScreenDistance(
  projectedCoordinates: ScreenPoint[],
  pointer: { x: number; y: number },
) {
  if (projectedCoordinates.length < 2) {
    return Number.POSITIVE_INFINITY
  }

  return projectedCoordinates.slice(1).reduce((distance, point, index) => (
    Math.min(distance, getPointToSegmentDistance(pointer, projectedCoordinates[index], point))
  ), Number.POSITIVE_INFINITY)
}

function projectCoordinateToScreenPoint(coordinate: Coordinate, map: NonNullable<Window['Tmapv3Map']>) {
  if (!map.realToScreen || !window.Tmapv3) {
    return undefined
  }

  const screenPoint = map.realToScreen(new window.Tmapv3.LatLng(coordinate.lat, coordinate.lng))
  return getScreenPoint(screenPoint)
}

function getScreenPoint(point: unknown) {
  if (!point || typeof point !== 'object') {
    return undefined
  }

  const pointObject = point as {
    getX?: () => number
    getY?: () => number
    x?: number
    y?: number
  }
  const x = typeof pointObject.getX === 'function' ? pointObject.getX() : pointObject.x
  const y = typeof pointObject.getY === 'function' ? pointObject.getY() : pointObject.y

  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
    ? { x, y }
    : undefined
}

function getPointToSegmentDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const segmentX = end.x - start.x
  const segmentY = end.y - start.y
  const lengthSquared = segmentX * segmentX + segmentY * segmentY

  if (lengthSquared <= 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const rawProgress = (
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared
  )
  const progress = Math.max(0, Math.min(1, rawProgress))
  const projectedX = start.x + segmentX * progress
  const projectedY = start.y + segmentY * progress

  return Math.hypot(point.x - projectedX, point.y - projectedY)
}

function createRouteDirectionMarkers(
  coordinates: Coordinate[],
  map: Window['Tmapv3Map'],
  mapBearing: number,
  zoom: number,
) {
  if (!window.Tmapv3 || !map) {
    return []
  }

  return getRouteDirectionArrowAnchors(coordinates, zoom).map((anchor) => {
    const markerBearing = getVehicleMarkerBearing(anchor.bearing, mapBearing)
    const marker = new window.Tmapv3!.Marker({
      position: new window.Tmapv3!.LatLng(anchor.coordinate.lat, anchor.coordinate.lng),
      anchor: 'center',
      iconSize: new window.Tmapv3!.Size(ROUTE_DIRECTION_ARROW_SIZE, ROUTE_DIRECTION_ARROW_SIZE),
      iconHTML: createRouteDirectionArrowMarker(markerBearing),
      zIndex: 120,
      map,
    })

    return {
      marker,
      bearing: anchor.bearing,
    }
  })
}

function getRouteDirectionArrowAnchors(coordinates: Coordinate[], zoom: number) {
  return getSegmentDirectionArrowAnchors(coordinates, getRouteDirectionArrowDensity(zoom))
}

function getSegmentDirectionArrowAnchors(
  coordinates: Coordinate[],
  density: RouteDirectionArrowDensity,
) {
  const routeDistance = getRouteDistanceMeters(coordinates)

  if (routeDistance <= ROUTE_DIRECTION_ARROW_MIN_EDGE_GAP_METERS * 2) {
    return []
  }

  const startArrowDistance = Math.min(density.startOffsetMeters, routeDistance * 0.18)
  const endArrowDistance = Math.max(
    startArrowDistance,
    routeDistance - Math.min(ROUTE_DIRECTION_ARROW_END_OFFSET_METERS, routeDistance * 0.12),
  )
  const drawableDistance = endArrowDistance - startArrowDistance
  const spacingBasedCount = Math.floor(drawableDistance / density.spacingMeters) + 1
  const arrowCount = Math.max(1, Math.min(density.maxArrows, spacingBasedCount))

  return Array.from({ length: arrowCount }, (_, index) => {
    const targetDistance = arrowCount === 1
      ? endArrowDistance
      : startArrowDistance + (drawableDistance * index) / (arrowCount - 1)

    return getRouteAnchorAtDistance(coordinates, targetDistance)
  }).filter((anchor): anchor is { coordinate: Coordinate; bearing: number } => Boolean(anchor))
}

function getRouteDirectionArrowDensity(zoom: number): RouteDirectionArrowDensity {
  if (zoom >= 18) {
    return { spacingMeters: 520, startOffsetMeters: 140, maxArrows: 10 }
  }

  if (zoom >= 17) {
    return { spacingMeters: 850, startOffsetMeters: 190, maxArrows: 6 }
  }

  if (zoom >= 16) {
    return { spacingMeters: 1200, startOffsetMeters: 260, maxArrows: 5 }
  }

  if (zoom >= 15) {
    return { spacingMeters: 1700, startOffsetMeters: 340, maxArrows: 4 }
  }

  if (zoom >= 14) {
    return { spacingMeters: 2400, startOffsetMeters: 420, maxArrows: 3 }
  }

  return { spacingMeters: 3200, startOffsetMeters: 500, maxArrows: 2 }
}

function getRouteAnchorAtDistance(coordinates: Coordinate[], targetDistance: number) {
  let walkedDistance = 0

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const segmentDistance = getApproximateDistanceMeters(start, end)

    if (segmentDistance <= 0) {
      continue
    }

    if (walkedDistance + segmentDistance >= targetDistance) {
      const segmentRatio = (targetDistance - walkedDistance) / segmentDistance
      return {
        coordinate: interpolateCoordinate(start, end, segmentRatio),
        bearing: getRouteBearing(coordinates, index),
      }
    }

    walkedDistance += segmentDistance
  }

  return undefined
}

function getRouteDistanceMeters(coordinates: Coordinate[]) {
  return coordinates.reduce((distance, coordinate, index) => {
    const nextCoordinate = coordinates[index + 1]
    return nextCoordinate ? distance + getApproximateDistanceMeters(coordinate, nextCoordinate) : distance
  }, 0)
}

function getRouteLineColor(congestion: TrafficCongestion, fallbackColor: string) {
  if (congestion === 1) return '#16C47F'
  if (congestion === 2) return '#FFD43B'
  if (congestion === 3) return '#FA9B0B'
  if (congestion === 4) return '#F04438'
  return fallbackColor
}

function getRouteLineBorderColor(congestion: TrafficCongestion) {
  if (congestion === 1) return '#087B4B'
  if (congestion === 2) return '#A57900'
  if (congestion === 3) return '#955915'
  if (congestion === 4) return '#991B1B'
  return '#01609A'
}

function getRouteLineSignature(segments: RouteTrafficSegment[]) {
  return segments.map((segment) => (
    `${segment.congestion}:${segment.coordinates.map((coordinate) => (
      `${formatRouteLineSignatureCoordinate(coordinate.lat)},${formatRouteLineSignatureCoordinate(coordinate.lng)}`
    )).join('|')}`
  )).join(';')
}

function getRouteLineStructureSignature(segments: RouteTrafficSegment[]) {
  return segments.map((segment) => segment.congestion).join('|')
}

function getRouteDirectionMarkerSignature(coordinates: Coordinate[], zoom: number) {
  const density = getRouteDirectionArrowDensity(zoom)

  return `${density.spacingMeters}:${density.maxArrows}:` + coordinates.map((coordinate) => (
    `${coordinate.lat.toFixed(4)},${coordinate.lng.toFixed(4)}`
  )).join('|')
}

function getRouteOptionOverlaySignature(options: NavigationRouteOption[]) {
  return options.map((option) => (
    `${option.id}:${option.color}:${option.route.summary.durationSeconds}:${option.route.summary.distanceMeters}:` +
    getCoordinateListLightSignature(option.route.coordinates) +
    ':' +
    (option.route.trafficSegments ?? []).map((segment) => (
      `${segment.congestion}:${getCoordinateListLightSignature(segment.coordinates)}`
    )).join(',')
  )).join(';')
}

function getCoordinateListLightSignature(coordinates: Coordinate[]) {
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  return [
    coordinates.length,
    first ? `${first.lat.toFixed(5)},${first.lng.toFixed(5)}` : '',
    last ? `${last.lat.toFixed(5)},${last.lng.toFixed(5)}` : '',
  ].join('|')
}

function getDefaultRouteOptionId(options: NavigationRouteOption[]) {
  return options.find((option) => option.isRecommended)?.id ?? options[0]?.id
}

function getActiveRouteOptionId(options: NavigationRouteOption[], activeRouteOptionId: string | undefined) {
  return options.some((option) => option.id === activeRouteOptionId)
    ? activeRouteOptionId
    : getDefaultRouteOptionId(options)
}

function getRouteOptionBoundsCoordinates(
  options: NavigationRouteOption[],
  anchors: Array<Coordinate | undefined>,
) {
  return [
    ...anchors.filter((coordinate): coordinate is Coordinate => Boolean(coordinate)),
    ...options.flatMap((option) => option.route.coordinates),
  ]
}

function getRouteSelectionCamera(
  coordinates: Coordinate[],
  mapElement: HTMLElement | null,
) {
  if (!coordinates.length) {
    return undefined
  }

  const bounds = getCoordinateBounds(coordinates)
  const viewport = getRouteSelectionViewport(mapElement)
  const padding = getRouteSelectionSafeAreaPadding(viewport)
  const availableWidth = Math.max(260, viewport.width - padding.left - padding.right)
  const availableHeight = Math.max(220, viewport.height - padding.top - padding.bottom)
  const minMercatorX = bounds.minLng / 360
  const maxMercatorX = bounds.maxLng / 360
  const minMercatorY = getMercatorY(bounds.minLat) / (Math.PI * 2)
  const maxMercatorY = getMercatorY(bounds.maxLat) / (Math.PI * 2)
  const lngFraction = Math.max(maxMercatorX - minMercatorX, 0.000001)
  const latFraction = Math.max(maxMercatorY - minMercatorY, 0.000001)
  const lngZoom = Math.log2(availableWidth / 256 / lngFraction)
  const latZoom = Math.log2(availableHeight / 256 / latFraction)
  const zoom = Math.max(
    ROUTE_SELECTION_MIN_ZOOM,
    Math.min(
      ROUTE_SELECTION_MAX_ZOOM,
      Math.round(Math.min(lngZoom, latZoom) - ROUTE_SELECTION_ZOOM_OUT_MARGIN),
    ),
  )
  const scale = 256 * (2 ** zoom)
  const centerMercatorX = (
    (minMercatorX + maxMercatorX) / 2 +
    (padding.right - padding.left) / (2 * scale)
  )
  const centerMercatorY = (
    (minMercatorY + maxMercatorY) / 2 +
    (padding.top - padding.bottom) / (2 * scale)
  )

  return {
    center: {
      lat: getLatitudeFromMercatorY(centerMercatorY * Math.PI * 2),
      lng: centerMercatorX * 360,
    },
    zoom,
  }
}

function getRouteSelectionViewport(mapElement: HTMLElement | null) {
  const mapRect = mapElement?.getBoundingClientRect()

  return {
    width: mapRect?.width && mapRect.width > 0 ? mapRect.width : 1024,
    height: mapRect?.height && mapRect.height > 0 ? mapRect.height : 640,
  }
}

function getRouteSelectionSafeAreaPadding({ width, height }: { width: number; height: number }) {
  if (width < 720) {
    return {
      left: 24,
      right: 24,
      top: 112,
      bottom: Math.min(136, Math.max(120, height * 0.14)),
    }
  }

  return {
    left: 80,
    right: 56,
    top: 80,
    bottom: 104,
  }
}

function getCoordinateBounds(coordinates: Coordinate[]) {
  return coordinates.reduce((bounds, coordinate) => ({
    minLat: Math.min(bounds.minLat, coordinate.lat),
    maxLat: Math.max(bounds.maxLat, coordinate.lat),
    minLng: Math.min(bounds.minLng, coordinate.lng),
    maxLng: Math.max(bounds.maxLng, coordinate.lng),
  }), {
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
    minLng: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
  })
}

function getMercatorY(lat: number) {
  const constrainedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const sin = Math.sin((constrainedLat * Math.PI) / 180)

  return Math.log((1 + sin) / (1 - sin)) / 2
}

function getLatitudeFromMercatorY(mercatorY: number) {
  return (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI
}

function toTmapPath(coordinates: Coordinate[]) {
  return coordinates.map((coordinate) => (
    new window.Tmapv3!.LatLng(coordinate.lat, coordinate.lng)
  ))
}

function formatRouteLineSignatureCoordinate(value: number) {
  return value.toFixed(ROUTE_LINE_SIGNATURE_COORDINATE_PRECISION)
}

function getRouteAlignedTrafficSegments(
  routeCoordinates: Coordinate[],
  trafficSegments: RouteTrafficSegment[],
): RouteTrafficSegment[] {
  const routeLineSegments: RouteTrafficSegment[] = []
  let activeCongestion: TrafficCongestion | undefined
  let activeCoordinates: Coordinate[] = []

  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    const start = routeCoordinates[index]
    const end = routeCoordinates[index + 1]
    const midpoint = {
      lat: (start.lat + end.lat) / 2,
      lng: (start.lng + end.lng) / 2,
    }
    const congestion = getNearestTrafficCongestion(midpoint, trafficSegments)

    if (activeCongestion === undefined) {
      activeCongestion = congestion
      activeCoordinates = [start, end]
      continue
    }

    if (activeCongestion === congestion) {
      appendRouteLineCoordinate(activeCoordinates, end)
      continue
    }

    pushRouteLineSegment(routeLineSegments, activeCoordinates, activeCongestion)
    activeCongestion = congestion
    activeCoordinates = [start, end]
  }

  if (activeCongestion !== undefined) {
    pushRouteLineSegment(routeLineSegments, activeCoordinates, activeCongestion)
  }

  return routeLineSegments
}

function getRemainingRouteLineSegments(
  routeLineSegments: RouteTrafficSegment[],
  progressPosition: Coordinate,
): RouteTrafficSegment[] {
  const activeSegmentIndex = getNearestRouteLineSegmentIndex(routeLineSegments, progressPosition)

  if (activeSegmentIndex === undefined) {
    return routeLineSegments
  }

  return routeLineSegments.flatMap((segment, index) => {
    if (index < activeSegmentIndex) {
      return []
    }

    if (index > activeSegmentIndex) {
      return [segment]
    }

    const projection = projectCoordinateToRouteSegment(segment.coordinates, progressPosition)
    const remainingCoordinates = compactRouteCoordinates([
      projection.coordinate,
      ...segment.coordinates.slice(projection.segmentIndex + 1),
    ])

    if (remainingCoordinates.length < 2) {
      return []
    }

    return [{
      ...segment,
      coordinates: remainingCoordinates,
    }]
  })
}

function getNearestRouteLineSegmentIndex(
  routeLineSegments: RouteTrafficSegment[],
  coordinate: Coordinate,
) {
  const nearest = routeLineSegments.reduce<{
    index: number
    distance: number
  } | undefined>((closest, segment, index) => {
    if (segment.coordinates.length < 2) {
      return closest
    }

    const projected = projectCoordinateToRouteSegment(segment.coordinates, coordinate)
    const distance = getSquaredCoordinateDistance(projected.coordinate, coordinate)

    if (!closest || distance < closest.distance) {
      return {
        index,
        distance,
      }
    }

    return closest
  }, undefined)

  if (!nearest || nearest.distance > MAX_TRAFFIC_SEGMENT_MATCH_DISTANCE_SQUARED) {
    return undefined
  }

  return nearest.index
}

function getNearestTrafficCongestion(
  coordinate: Coordinate,
  trafficSegments: RouteTrafficSegment[],
): TrafficCongestion {
  const nearest = trafficSegments.reduce<{
    congestion: TrafficCongestion
    distance: number
  } | undefined>((closest, segment) => {
    if (segment.coordinates.length < 2) {
      return closest
    }

    const projected = projectCoordinateToRouteSegment(segment.coordinates, coordinate)
    const distance = getSquaredCoordinateDistance(projected.coordinate, coordinate)

    if (!closest || distance < closest.distance) {
      return {
        congestion: segment.congestion,
        distance,
      }
    }

    return closest
  }, undefined)

  if (!nearest || nearest.distance > MAX_TRAFFIC_SEGMENT_MATCH_DISTANCE_SQUARED) {
    return 0
  }

  return nearest.congestion
}

function pushRouteLineSegment(
  segments: RouteTrafficSegment[],
  coordinates: Coordinate[],
  congestion: TrafficCongestion,
) {
  const compactedCoordinates = compactRouteCoordinates(coordinates)

  if (compactedCoordinates.length >= 2) {
    segments.push({
      coordinates: compactedCoordinates,
      congestion,
    })
  }
}

function appendRouteLineCoordinate(coordinates: Coordinate[], coordinate: Coordinate) {
  const previous = coordinates[coordinates.length - 1]

  if (!previous || getSquaredCoordinateDistance(previous, coordinate) > 0.000000000001) {
    coordinates.push(coordinate)
  }
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

function getApproximateDistanceMeters(from: Coordinate, to: Coordinate) {
  const earthMetersPerDegree = 111_320
  const latitudeScale = Math.cos(((from.lat + to.lat) / 2) * Math.PI / 180)
  const latDeltaMeters = (to.lat - from.lat) * earthMetersPerDegree
  const lngDeltaMeters = (to.lng - from.lng) * earthMetersPerDegree * latitudeScale

  return Math.hypot(latDeltaMeters, lngDeltaMeters)
}

function isSameCamera(from: RenderedCamera, to: RenderedCamera) {
  return (
    Math.abs(from.position.lat - to.position.lat) < 0.0000001 &&
    Math.abs(from.position.lng - to.position.lng) < 0.0000001 &&
    Math.abs(from.bearing - to.bearing) < 0.0001 &&
    Math.abs(normalizeSignedBearing(from.markerBearing - to.markerBearing)) < 0.0001 &&
    Math.abs(from.pitch - to.pitch) < 0.0001
  )
}
