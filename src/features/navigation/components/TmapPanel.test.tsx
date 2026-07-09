import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TmapPanel } from './TmapPanel'
import { loadTmapSdk } from '../tmap/loadTmapSdk'

vi.mock('../tmap/loadTmapSdk', () => ({
  loadTmapSdk: vi.fn(),
}))

const mockedLoadTmapSdk = vi.mocked(loadTmapSdk)

describe('TmapPanel', () => {
  const setCenter = vi.fn()
  const getCenter = vi.fn()
  const setZoom = vi.fn()
  const getZoom = vi.fn()
  const getBearing = vi.fn()
  const getPitch = vi.fn()
  const zoomIn = vi.fn()
  const zoomOut = vi.fn()
  const setBearing = vi.fn()
  const setPitch = vi.fn()
  const markerSetPosition = vi.fn()
  const markerSetOptions = vi.fn()
  const polylineSetMap = vi.fn()
  const polylineSetMapByOptions = vi.fn()
  const polylineSetPath = vi.fn()
  const polylineSetOptions = vi.fn()
  const defaultRealToScreen = vi.fn()
  const nativeCameraJumpTo = vi.fn()
  const setInteractive = vi.fn()
  let throwOnPolylineSetMapNull = false

  beforeEach(() => {
    vi.unstubAllGlobals()
    mockedLoadTmapSdk.mockResolvedValue()
    setCenter.mockReset()
    getCenter.mockReset()
    getCenter.mockReturnValue({ lat: 37.5665, lng: 126.978 })
    setZoom.mockReset()
    getZoom.mockReset()
    getZoom.mockReturnValue(19)
    getBearing.mockReset()
    getBearing.mockReturnValue(0)
    getPitch.mockReset()
    getPitch.mockReturnValue(0)
    zoomIn.mockReset()
    zoomOut.mockReset()
    setBearing.mockReset()
    setPitch.mockReset()
    markerSetPosition.mockReset()
    markerSetOptions.mockReset()
    polylineSetMap.mockReset()
    polylineSetMapByOptions.mockReset()
    polylineSetPath.mockReset()
    polylineSetOptions.mockReset()
    defaultRealToScreen.mockReset()
    defaultRealToScreen.mockImplementation((latLng: { lat?: number; lng?: number }) => ({
      x: ((latLng.lng ?? 126) - 126) * 1000,
      y: ((latLng.lat ?? 37) - 37) * 1000,
    }))
    nativeCameraJumpTo.mockReset()
    setInteractive.mockReset()
    throwOnPolylineSetMapNull = false

    window.Tmapv3 = {
      Map: vi.fn(function () {
        return {
          getCenter,
          getBearing,
          getPitch,
          getZoom,
          setCenter,
          setZoom,
          setBearing,
          setPitch,
          setInteractive,
          realToScreen: defaultRealToScreen,
          zoomIn,
          zoomOut,
        }
      }),
      LatLng: vi.fn(function (_lat: number, _lng: number) {
        return { lat: _lat, lng: _lng }
      }),
      Size: vi.fn(function (_width: number, _height: number) {
        return { width: _width, height: _height }
      }),
      Point: vi.fn(function (_x: number, _y: number) {
        return { x: _x, y: _y }
      }),
      Marker: vi.fn(function (options: Record<string, unknown>) {
        const markerElement = document.createElement('div')
        if (typeof options.iconHTML === 'string') {
          markerElement.innerHTML = options.iconHTML
          document.body.appendChild(markerElement)
        }

        return {
          setMap: vi.fn((map: unknown | null) => {
            if (map === null) {
              markerElement.remove()
            }
          }),
          setOptions: vi.fn((nextOptions: Record<string, unknown>) => {
            markerSetOptions(nextOptions)
            if (typeof nextOptions.iconHTML === 'string') {
              markerElement.innerHTML = nextOptions.iconHTML
            }
          }),
          setPosition: markerSetPosition,
        }
      }),
      Polyline: vi.fn(function (options: Record<string, unknown>) {
        let mapped = Boolean(options.map)
        return {
          setMap: vi.fn((map: unknown | null) => {
            if (throwOnPolylineSetMapNull && map === null) {
              throw new Error('TMAP Polyline setMap(null) crash')
            }
            if (map && mapped) {
              throw new Error('TMAP Polyline duplicate layer')
            }
            if (map) {
              mapped = true
            }
            polylineSetMap(map)
            polylineSetMapByOptions(options, map)
          }),
          setOptions: polylineSetOptions,
          setPath: vi.fn((path: unknown[]) => {
            if (!mapped) {
              throw new Error('TMAP Polyline setPath before map crash')
            }
            if (Array.isArray(path) && path.length === 0) {
              throw new Error('TMAP Polyline setPath([]) crash')
            }
            polylineSetPath(path)
          }),
        }
      }),
    } as unknown as NonNullable<Window['Tmapv3']>
  })

  const getRouteDirectionMarkerCalls = () => (
    vi.mocked(window.Tmapv3!.Marker).mock.calls.filter((call) => (
      String(call[0]?.iconHTML).includes('nav-route-direction-arrow')
    ))
  )
  it('creates the map at a navigation-focused zoom level', async () => {
    render(<TmapPanel />)

    await waitFor(() => {
      expect(window.Tmapv3!.Map).toHaveBeenCalled()
    })

    expect(window.Tmapv3!.Map).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        pitch: 0,
        rotateEnabled: true,
        zoom: 18.3,
      }),
    )
  })

  it('draws route option candidate lines without map information bubbles', async () => {
    const { rerender } = render(
      <TmapPanel
        routeOptions={[
          {
            id: 'route-recommended',
            label: '추천',
            searchOption: '0',
            color: '#0EA5E9',
            isRecommended: true,
            route: {
              coordinates: [
                { lat: 37.5665, lng: 126.978 },
                { lat: 37.4979, lng: 127.0276 },
              ],
              summary: {
                distanceMeters: 12340,
                durationSeconds: 1320,
              },
            },
          },
          {
            id: 'route-fastest',
            label: '최소시간',
            searchOption: '2',
            color: '#F97316',
            isRecommended: false,
            route: {
              coordinates: [
                { lat: 37.5665, lng: 126.978 },
                { lat: 37.51, lng: 127.01 },
                { lat: 37.4979, lng: 127.0276 },
              ],
              summary: {
                distanceMeters: 12800,
                durationSeconds: 1260,
              },
            },
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(8)
    })
    const routeLineCalls = vi.mocked(window.Tmapv3!.Polyline).mock.calls.map(([options]) => options)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#ffffff')).toHaveLength(4)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#0EA5E9')).toHaveLength(1)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#F97316')).toHaveLength(1)
    expect(routeLineCalls.filter((options) => options.strokeOpacity === 0.98)).toHaveLength(4)
    expect(routeLineCalls.filter((options) => options.strokeOpacity === 0)).toHaveLength(0)
    expect(routeLineCalls.filter((options) => options.strokeWeight === 9 && options.zIndex === 251)).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.strokeWeight === 9 && options.zIndex === 191)).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#9AA6B2')).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.zIndex === 251)).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.zIndex === 191)).toHaveLength(2)
    expect(routeLineCalls.slice(-2).every((options) => options.zIndex === 250 || options.zIndex === 251)).toBe(true)
    expect(routeLineCalls.every((options) => !options.map)).toBe(true)
    expect(polylineSetMap).toHaveBeenCalledTimes(8)
    const markerCalls = vi.mocked(window.Tmapv3!.Marker).mock.calls.map(([options]) => String(options?.iconHTML ?? ''))
    expect(markerCalls.some((iconHTML) => iconHTML.includes('data-route-option-id'))).toBe(false)
    expect(markerCalls.some((iconHTML) => iconHTML.includes('data-route-option-select'))).toBe(false)

    fireEvent.wheel(screen.getByTestId('tmap-canvas'), { deltaY: -100 })
    fireEvent.wheel(screen.getByTestId('tmap-canvas'), { deltaY: 100 })

    expect(setCenter).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lng: expect.any(Number),
      }),
    )
    expect(setCenter.mock.calls[setCenter.mock.calls.length - 1]?.[0].lng).toEqual(
      expect.any(Number),
    )
    expect(setCenter.mock.calls[setCenter.mock.calls.length - 1]?.[0].lat).toEqual(
      expect.any(Number),
    )
    expect(setZoom).toHaveBeenLastCalledWith(expect.any(Number))
    expect(Number.isInteger(setZoom.mock.calls[setZoom.mock.calls.length - 1]?.[0])).toBe(true)
    expect(setZoom.mock.calls[setZoom.mock.calls.length - 1]?.[0]).toBeLessThanOrEqual(13)

    polylineSetOptions.mockClear()
    throwOnPolylineSetMapNull = true
    rerender(<TmapPanel />)
    await waitFor(() => {
      expect(polylineSetOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          strokeOpacity: 0,
        }),
      )
    })
  })

  it('recenters on the current location after route option selection is cancelled', async () => {
    const realToScreen = vi.fn(() => ({ x: 720, y: 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.552, lng: 127.073 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    const { rerender } = render(
      <TmapPanel
        currentPosition={{ lat: 37.5502, lng: 127.073 }}
        routeOptions={[
          {
            id: 'route-recommended',
            label: '추천',
            searchOption: '0',
            color: '#0EA5E9',
            isRecommended: true,
            route: {
              coordinates: [
                { lat: 37.5502, lng: 127.073 },
                { lat: 37.4979, lng: 127.0276 },
              ],
              summary: {
                distanceMeters: 12340,
                durationSeconds: 1320,
              },
            },
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalled()
    })
    expect(setCenter.mock.calls[setCenter.mock.calls.length - 1]?.[0]).not.toEqual({
      lat: 37.5502,
      lng: 127.073,
    })

    setCenter.mockClear()

    rerender(
      <TmapPanel
        currentPosition={{ lat: 37.5502, lng: 127.073 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.552, lng: 127.073 })
    })
    expect(screenToReal).toHaveBeenCalledWith({ x: 720, y: 290 })
  })

  it('keeps the navigation marker only slightly below center on a short map', async () => {
    const realToScreen = vi.fn(() => ({ x: 720, y: 470 }))
    const screenToReal = vi.fn((_point: { x: number; y: number }) => ({ lat: 37.5508, lng: 127.073 }))
    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        bottom: 360,
        height: 360,
        left: 0,
        right: 720,
        top: 0,
        width: 720,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      })
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(<TmapPanel currentPosition={{ lat: 37.5502, lng: 127.073 }} />)

    await waitFor(() => {
      expect(screenToReal).toHaveBeenCalled()
    })

    const offsetPoint = screenToReal.mock.calls[screenToReal.mock.calls.length - 1]?.[0]
    expect(offsetPoint.x).toBe(720)
    expect(offsetPoint.y).toBeCloseTo(405.2)

    getBoundingClientRectSpy.mockRestore()
  })

  it('draws traffic congestion colors only on the active route option candidate', async () => {
    const previewRouteOption = vi.fn()
    const { rerender } = render(
      <TmapPanel
        activeRouteOptionId="route-recommended"
        onRouteOptionPreviewChange={previewRouteOption}
        routeOptions={[
          {
            id: 'route-recommended',
            label: '추천',
            searchOption: '0',
            color: '#0EA5E9',
            isRecommended: true,
            route: {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
                { lat: 37, lng: 127 },
              ],
              summary: {
                distanceMeters: 1000,
                durationSeconds: 120,
              },
              trafficSegments: [
                {
                  coordinates: [
                    { lat: 37, lng: 126 },
                    { lat: 37, lng: 126.5 },
                  ],
                  congestion: 1,
                },
                {
                  coordinates: [
                    { lat: 37, lng: 126.5 },
                    { lat: 37, lng: 127 },
                  ],
                  congestion: 4,
                },
              ],
            },
          },
          {
            id: 'route-fastest',
            label: '빠른길',
            searchOption: '2',
            color: '#F97316',
            isRecommended: false,
            route: {
              coordinates: [
                { lat: 37.1, lng: 126 },
                { lat: 37.1, lng: 126.5 },
                { lat: 37.1, lng: 127 },
              ],
              summary: {
                distanceMeters: 1200,
                durationSeconds: 130,
              },
              trafficSegments: [
                {
                  coordinates: [
                    { lat: 37.1, lng: 126 },
                    { lat: 37.1, lng: 126.5 },
                  ],
                  congestion: 1,
                },
                {
                  coordinates: [
                    { lat: 37.1, lng: 126.5 },
                    { lat: 37.1, lng: 127 },
                  ],
                  congestion: 4,
                },
              ],
            },
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(12)
    })
    const routeLineCalls = vi.mocked(window.Tmapv3!.Polyline).mock.calls.map(([options]) => options)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#16C47F')).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#F04438')).toHaveLength(2)
    expect(routeLineCalls.filter((options) => options.strokeColor === '#9AA6B2')).toHaveLength(2)
    expect(routeLineCalls.slice(-4).every((options) => options.zIndex === 250 || options.zIndex === 251)).toBe(true)
    expect(routeLineCalls.some((options) => 'mouseover' in options || 'onMouseOver' in options)).toBe(false)
    defaultRealToScreen.mockClear()
    fireEvent.click(screen.getByTestId('tmap-canvas'), { clientX: 250, clientY: 100 })
    await waitFor(() => {
      expect(previewRouteOption).toHaveBeenCalledWith('route-fastest')
    })
    expect(defaultRealToScreen).not.toHaveBeenCalled()
    const previewCallCount = previewRouteOption.mock.calls.length
    fireEvent.pointerMove(screen.getByTestId('tmap-canvas'), { clientX: 260, clientY: 100 })
    expect(previewRouteOption).toHaveBeenCalledTimes(previewCallCount)

    polylineSetOptions.mockClear()
    polylineSetMap.mockClear()
    polylineSetMapByOptions.mockClear()
    const polylineConstructorCallCount = vi.mocked(window.Tmapv3!.Polyline).mock.calls.length
    rerender(
      <TmapPanel
        activeRouteOptionId="route-fastest"
        onRouteOptionPreviewChange={previewRouteOption}
        routeOptions={[
          {
            id: 'route-recommended',
            label: '추천',
            searchOption: '0',
            color: '#0EA5E9',
            isRecommended: true,
            route: {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
                { lat: 37, lng: 127 },
              ],
              summary: {
                distanceMeters: 1000,
                durationSeconds: 120,
              },
              trafficSegments: [
                {
                  coordinates: [
                    { lat: 37, lng: 126 },
                    { lat: 37, lng: 126.5 },
                  ],
                  congestion: 1,
                },
                {
                  coordinates: [
                    { lat: 37, lng: 126.5 },
                    { lat: 37, lng: 127 },
                  ],
                  congestion: 4,
                },
              ],
            },
          },
          {
            id: 'route-fastest',
            label: '빠른길',
            searchOption: '2',
            color: '#F97316',
            isRecommended: false,
            route: {
              coordinates: [
                { lat: 37.1, lng: 126 },
                { lat: 37.1, lng: 126.5 },
                { lat: 37.1, lng: 127 },
              ],
              summary: {
                distanceMeters: 1200,
                durationSeconds: 130,
              },
              trafficSegments: [
                {
                  coordinates: [
                    { lat: 37.1, lng: 126 },
                    { lat: 37.1, lng: 126.5 },
                  ],
                  congestion: 1,
                },
                {
                  coordinates: [
                    { lat: 37.1, lng: 126.5 },
                    { lat: 37.1, lng: 127 },
                  ],
                  congestion: 4,
                },
              ],
            },
          },
        ]}
      />,
    )

    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)))
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(polylineConstructorCallCount)
    const nextRouteLineCalls = vi.mocked(window.Tmapv3!.Polyline).mock.calls.map(([options]) => options)
    const activeTopLayerCalls = nextRouteLineCalls.slice(-4)
    expect(activeTopLayerCalls.filter((options) => options.strokeColor === '#16C47F')).toHaveLength(1)
    expect(activeTopLayerCalls.filter((options) => options.strokeColor === '#F04438')).toHaveLength(1)
    expect(activeTopLayerCalls.every((options) => options.zIndex === 250 || options.zIndex === 251)).toBe(true)
    expect(polylineSetPath).toHaveBeenCalledWith([
      expect.objectContaining({
        lat: 37,
        lng: 126,
      }),
      expect.objectContaining({
        lat: 37,
        lng: 126,
      }),
    ])
    expect(polylineSetPath).not.toHaveBeenCalledWith([])
    expect(polylineSetMap).not.toHaveBeenCalled()
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
    await waitFor(() => {
      expect(setZoom).toHaveBeenCalled()
    })
  })

  it('keeps the active route option continuous when traffic data covers only part of the route', async () => {
    render(
      <TmapPanel
        activeRouteOptionId="route-shortest"
        routeOptions={[
          {
            id: 'route-shortest',
            label: '최단거리',
            searchOption: '10',
            color: '#F97316',
            isRecommended: true,
            route: {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.004 },
                { lat: 37, lng: 126.008 },
                { lat: 37, lng: 126.012 },
              ],
              summary: {
                distanceMeters: 9700,
                durationSeconds: 2160,
              },
              routeLineSegments: [
                {
                  coordinates: [
                    { lat: 37, lng: 126 },
                    { lat: 37, lng: 126.004 },
                  ],
                  congestion: 0,
                },
                {
                  coordinates: [
                    { lat: 37, lng: 126.004 },
                    { lat: 37, lng: 126.008 },
                  ],
                  congestion: 4,
                },
                {
                  coordinates: [
                    { lat: 37, lng: 126.008 },
                    { lat: 37, lng: 126.012 },
                  ],
                  congestion: 0,
                },
              ],
            },
          },
        ]}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(8)
    })

    const activeRouteLineCalls = vi.mocked(window.Tmapv3!.Polyline).mock.calls
      .map(([options]) => options)
      .slice(-6)
      .filter((options) => options.zIndex === 251)
    const activeRoutePaths = activeRouteLineCalls.map((options) => (
      options.path as Array<{ lat: number; lng: number }>
    ))

    expect(activeRouteLineCalls).toHaveLength(3)
    expect(activeRouteLineCalls.map((options) => options.strokeColor)).toEqual([
      '#F97316',
      '#F04438',
      '#F97316',
    ])
    expect(activeRoutePaths[0][0]).toEqual({ lat: 37, lng: 126 })
    const lastActiveRoutePath = activeRoutePaths[activeRoutePaths.length - 1]
    expect(lastActiveRoutePath[lastActiveRoutePath.length - 1]).toEqual({ lat: 37, lng: 126.012 })
  })

  it('zooms in around the current location after permission is granted', async () => {
    render(<TmapPanel currentPosition={{ lat: 37.5665, lng: 126.978 }} />)

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.5665, lng: 126.978 })
    })
    expect(setZoom).toHaveBeenCalledWith(18.3)
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'center',
        iconSize: { width: 58, height: 58 },
        iconHTML: expect.stringContaining('nav-current-arrow'),
      }),
    )
    expect(window.Tmapv3!.Marker).not.toHaveBeenCalledWith(
      expect.objectContaining({
        label: '현재 위치',
      }),
    )
  })

  it('tilts the current marker with the map pitch after a manual map gesture', async () => {
    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
        expect.objectContaining({
          iconHTML: expect.stringContaining('--vehicle-marker-pitch:0deg'),
        }),
      )
    })

    markerSetOptions.mockClear()
    getPitch.mockReturnValue(48)
    fireEvent.pointerMove(screen.getByTestId('tmap-canvas'))

    await waitFor(() => {
      expect(markerSetOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          iconHTML: expect.stringContaining('--vehicle-marker-pitch:48deg'),
        }),
      )
    })
  })

  it('applies external camera settings to zoom and pitch', async () => {
    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 17.6, pitch: 35 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(setZoom).toHaveBeenCalledWith(17.6)
    })
    expect(setPitch).toHaveBeenCalledWith(35)
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-pitch:35deg'),
      }),
    )
  })

  it('uses the native camera for external settings to preserve fractional zoom', async () => {
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpTo,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
      />,
    )

    await waitFor(() => {
      expect(nativeCameraJumpTo).toHaveBeenCalledWith(
        expect.objectContaining({
          zoom: 18.3,
          center: [126.978, 37.5665],
          bearing: 0,
          pitch: 45,
        }),
        { animate: false },
        { moveByProgram: true },
      )
    })
    expect(setZoom).not.toHaveBeenCalledWith(18.3)
  })

  it('toggles map pitch gestures by map mode', async () => {
    const { rerender } = render(
      <TmapPanel cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }} />,
    )

    await waitFor(() => {
      expect(setInteractive).toHaveBeenCalledWith(
        expect.objectContaining({
          pitchEnabled: false,
        }),
      )
    })

    rerender(<TmapPanel cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }} />)

    await waitFor(() => {
      expect(setInteractive).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pitchEnabled: true,
        }),
      )
    })
  })

  it('animates pitch when switching between 2d and 3d map modes', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(setPitch).toHaveBeenCalledWith(0)
    })
    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })
    setPitch.mockClear()
    setCenter.mockClear()
    markerSetOptions.mockClear()
    getPitch.mockReturnValue(0)

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(animationFrames.length).toBeGreaterThan(0)
    })
    expect(setPitch).not.toHaveBeenCalledWith(45)

    act(() => {
      animationFrames.shift()?.(0)
    })
    expect(setPitch).toHaveBeenLastCalledWith(0)

    act(() => {
      animationFrames.shift()?.(96)
    })
    const earlyPitch = setPitch.mock.calls[setPitch.mock.calls.length - 1]?.[0]
    expect(earlyPitch).toBeGreaterThan(0)
    expect(earlyPitch).toBeLessThan(3)

    act(() => {
      animationFrames.shift()?.(480)
    })
    const midPitch = setPitch.mock.calls[setPitch.mock.calls.length - 1]?.[0]
    expect(midPitch).toBeGreaterThan(0)
    expect(midPitch).toBeLessThan(45)

    act(() => {
      animationFrames.shift()?.(960)
    })
    expect(setPitch).toHaveBeenLastCalledWith(45)
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-pitch:45deg'),
      }),
    )
  })

  it('keeps the current location on the navigation offset while switching to 3d mode', async () => {
    const animationFrames: FrameRequestCallback[] = []
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.5681, lng: 126.978 }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.5681, lng: 126.978 })
    })
    setCenter.mockClear()
    screenToReal.mockClear()
    getPitch.mockReturnValue(0)

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(animationFrames.length).toBeGreaterThan(0)
    })
    ;[0, 240, 480, 720, 960].forEach((timestamp) => {
      const frame = animationFrames.shift()
      if (!frame) {
        return
      }
      act(() => {
        frame(timestamp)
      })
    })

    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37.5681, lng: 126.978 })
    expect(setPitch).toHaveBeenLastCalledWith(45)
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('keeps the current location on the navigation offset while switching back to 2d mode', async () => {
    const animationFrames: FrameRequestCallback[] = []
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.5681, lng: 126.978 }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.5681, lng: 126.978 })
    })
    setCenter.mockClear()
    setPitch.mockClear()
    screenToReal.mockClear()
    getPitch.mockReturnValue(45)

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(animationFrames.length).toBeGreaterThan(0)
    })
    expect(setPitch).not.toHaveBeenCalledWith(0)

    ;[0, 240, 480, 720, 960, 1200, 1440, 1680].forEach((timestamp) => {
      const frame = animationFrames.shift()
      if (!frame) {
        return
      }
      act(() => {
        frame(timestamp)
      })
    })

    const pitchValues = setPitch.mock.calls.map((call) => call[0])
    expect(pitchValues.some((pitch) => pitch > 0 && pitch < 45)).toBe(true)
    expect(setCenter).toHaveBeenCalledWith({ lat: 37.5681, lng: 126.978 })
    expect(setPitch).toHaveBeenLastCalledWith(0)
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('keeps the selected 3d pitch when navigation camera starts during a mode transition', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(setPitch).toHaveBeenCalledWith(0)
    })
    setPitch.mockClear()
    getPitch.mockReturnValue(0)

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
        route={{
          coordinates: [
            { lat: 37.5665, lng: 126.978 },
            { lat: 37.4979, lng: 127.0276 },
          ],
          summary: {
            distanceMeters: 12340,
            durationSeconds: 1320,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(animationFrames.length).toBeGreaterThanOrEqual(1)
    })

    ;[0, 240, 480, 720, 960].forEach((timestamp) => {
      const frame = animationFrames.shift()
      if (!frame) {
        return
      }
      act(() => {
        frame(timestamp)
      })
    })

    expect(setPitch).toHaveBeenLastCalledWith(45)
  })

  it('keeps the 3d map pitch when compass resets orientation', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '나침반 원위치' })).toBeInTheDocument()
    })
    setPitch.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    expect(setBearing).toHaveBeenLastCalledWith(0)
    expect(setPitch).toHaveBeenLastCalledWith(45)
    vi.unstubAllGlobals()
  })

  it('does not duplicate the current location with a standard origin marker', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
        origin={{
          id: 'current-location',
          name: '현재 위치',
          address: 'GPS 위치',
          coordinate: { lat: 37.5665, lng: 126.978 },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
        expect.objectContaining({
          anchor: 'center',
          iconSize: { width: 58, height: 58 },
          iconHTML: expect.stringContaining('nav-current-arrow'),
        }),
      )
    })
    expect(window.Tmapv3!.Marker).not.toHaveBeenCalledWith(
      expect.objectContaining({
        label: '출발',
      }),
    )
  })

  it('keeps a tight navigation zoom while simulation position moves', async () => {
    render(<TmapPanel simulationPosition={{ lat: 37.55, lng: 127.01 }} />)

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.55, lng: 127.01 })
    })
    expect(setZoom).toHaveBeenCalledWith(18.3)
  })

  it('shows route overview top-down before returning to the configured 3d pitch during guidance', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        route={route}
      />,
    )

    await waitFor(() => {
      expect(setPitch).toHaveBeenLastCalledWith(0)
    })

    setPitch.mockClear()
    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        route={route}
        simulationPosition={{ lat: 37, lng: 126.2 }}
      />,
    )

    await waitFor(() => {
      expect(setPitch).toHaveBeenLastCalledWith(45)
    })
  })

  it('keeps guidance start centered on the current route position before simulation starts', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 37, lng: 126.2 }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })
    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37, lng: 126.2 })
  })

  it('does not let current-location camera recenter route selection while options are still loading', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
        routeSelectionMode
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalled()
    })
    expect(setCenter).not.toHaveBeenCalled()
    expect(setBearing).not.toHaveBeenCalled()
    expect(setPitch).not.toHaveBeenCalled()
  })

  it('switches into route selection top-down without camera animation', async () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
      />,
    )

    await waitFor(() => {
      expect(setPitch).toHaveBeenCalledWith(45)
    })
    animationFrames.length = 0
    setPitch.mockClear()

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        routeSelectionMode
      />,
    )

    expect(animationFrames).toHaveLength(0)
    expect(setPitch).toHaveBeenLastCalledWith(0)
  })

  it('snaps to the 2d guidance offset when route selection ends with a selected route', async () => {
    let targetCameraApplied = false
    const realToScreen = vi.fn(() => (
      targetCameraApplied
        ? { getX: () => 720, getY: () => 470 }
        : { getX: () => 720, getY: () => 180 }
    ))
    const screenToReal = vi.fn((point: { y?: number }) => (
      point.y === 290
        ? { lat: 37.0016, lng: 126.2 }
        : { lat: 36.9, lng: 126.2 }
    ))
    const nativeCameraJumpToForRouteStart = vi.fn(() => {
      targetCameraApplied = true
    })
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpToForRouteStart,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        routeSelectionMode
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalled()
    })
    nativeCameraJumpToForRouteStart.mockClear()
    targetCameraApplied = false
    setCenter.mockClear()
    setBearing.mockClear()
    setPitch.mockClear()

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        route={route}
      />,
    )

    await waitFor(() => {
      expect(nativeCameraJumpToForRouteStart).toHaveBeenCalled()
    })
    expect(nativeCameraJumpToForRouteStart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [126.2, 37.0016],
        bearing: expect.closeTo(89.8, 0),
        pitch: 0,
        zoom: 18.3,
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('recenters the guidance camera when restoring 3d mode after route selection ends', async () => {
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.0016, lng: 126.2 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })
    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37.0016, lng: 126.2 })
    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    expect(setPitch).toHaveBeenLastCalledWith(45)
    expect(screenToReal).toHaveBeenCalledWith({ x: 720, y: 290 })
  })

  it('restores pitch and center immediately when route selection ends into 3d guidance', async () => {
    const animationFrames: FrameRequestCallback[] = []
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.0016, lng: 126.2 }))
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        routeSelectionMode
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalled()
    })
    setCenter.mockClear()
    setPitch.mockClear()
    getPitch.mockReturnValue(0)

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        route={route}
      />,
    )

    expect(animationFrames).toHaveLength(0)
    expect(setCenter).toHaveBeenCalled()
    expect(setPitch).toHaveBeenLastCalledWith(45)
  })

  it('resolves the navigation offset immediately after native 3d camera restoration from route selection', async () => {
    const animationFrames: FrameRequestCallback[] = []
    let targetCameraApplied = false
    const realToScreen = vi.fn(() => (
      targetCameraApplied
        ? { getX: () => 720, getY: () => 470 }
        : { getX: () => 720, getY: () => 180 }
    ))
    const screenToReal = vi.fn((point: { y?: number }) => (
      point.y === 290
        ? { lat: 37.0016, lng: 126.2 }
        : { lat: 36.9, lng: 126.2 }
    ))
    const nativeCameraJumpToForRouteStart = vi.fn(() => {
      targetCameraApplied = true
    })
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpToForRouteStart,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        cameraSettings={{ mode: '2d', zoom: 18.3, pitch: 0 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        routeSelectionMode
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Marker).toHaveBeenCalled()
    })
    targetCameraApplied = false

    rerender(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37, lng: 126.2 }}
        route={route}
      />,
    )

    expect(animationFrames).toHaveLength(0)
    expect(nativeCameraJumpToForRouteStart).not.toHaveBeenCalledWith(
      expect.objectContaining({
        center: [126.2, 36.9],
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(nativeCameraJumpToForRouteStart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [126.2, 37.0016],
        bearing: expect.closeTo(89.8, 0),
        pitch: 45,
        zoom: 18.3,
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('rotates the map camera to the active route bearing', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenCalled()
    })
    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    expect(setPitch).toHaveBeenCalledWith(0)
  })

  it('updates vector map center and bearing with a single native camera jump', async () => {
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.0016, lng: 126 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpTo,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(nativeCameraJumpTo).toHaveBeenCalledTimes(1)
    })
    expect(nativeCameraJumpTo).toHaveBeenCalledWith(
      expect.objectContaining({
        center: [126, 37.0016],
        bearing: expect.closeTo(89.8, 0),
        zoom: 18.3,
        pitch: 0,
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(realToScreen.mock.invocationCallOrder.some((callOrder) => (
      callOrder < nativeCameraJumpTo.mock.invocationCallOrder[0]
    ))).toBe(true)
    expect(screenToReal).toHaveBeenCalledWith({ x: 720, y: 290 })
    expect(setBearing).not.toHaveBeenCalled()
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('keeps native guidance camera offset after applying bearing and pitch', async () => {
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.5016, lng: 126 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpTo,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 38, lng: 126 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37.5, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(nativeCameraJumpTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [126, 37.5016],
          bearing: 0,
          zoom: 18.3,
          pitch: 45,
        }),
        { animate: false },
        { moveByProgram: true },
      )
    })
    const guidanceJumpIndex = nativeCameraJumpTo.mock.calls.findIndex((call) => (
      (call[0] as { center?: number[] }).center?.[0] === 126 &&
      (call[0] as { center?: number[] }).center?.[1] === 37.5016
    ))
    const guidanceJumpCallOrder = nativeCameraJumpTo.mock.invocationCallOrder[guidanceJumpIndex]

    expect(guidanceJumpIndex).toBeGreaterThanOrEqual(0)
    expect(realToScreen.mock.invocationCallOrder.some((callOrder) => (
      callOrder < guidanceJumpCallOrder
    ))).toBe(true)
    expect(screenToReal).toHaveBeenCalledWith({ x: 720, y: 290 })
  })

  it('keeps native 3d simulation frame camera offset after applying bearing and pitch', async () => {
    let renderSimulationFrame: Parameters<NonNullable<React.ComponentProps<typeof TmapPanel>['onSimulationFrameRendererReady']>>[0]
    let targetCameraApplied = false
    const realToScreen = vi.fn(() => (
      targetCameraApplied
        ? { getX: () => 720, getY: () => 470 }
        : { getX: () => 720, getY: () => 180 }
    ))
    const screenToReal = vi.fn((point: { y?: number }) => (
      point.y === 290
        ? { lat: 37.5016, lng: 126 }
        : { lat: 37.4, lng: 126 }
    ))
    const nativeCameraJumpToForSimulationFrame = vi.fn(() => {
      targetCameraApplied = true
    })
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpToForSimulationFrame,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        onSimulationFrameRendererReady={(renderer) => {
          renderSimulationFrame = renderer
        }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 38, lng: 126 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeTypeOf('function')
    })
    targetCameraApplied = false

    act(() => {
      renderSimulationFrame?.({ lat: 37.5, lng: 126 })
    })

    expect(nativeCameraJumpToForSimulationFrame).not.toHaveBeenCalledWith(
      expect.objectContaining({
        center: [126, 37.4],
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(nativeCameraJumpToForSimulationFrame).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [126, 37.5016],
        bearing: 0,
        pitch: 45,
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('shows the compass and current location controls in regular map mode', async () => {
    render(<TmapPanel />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: '나침반 원위치' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지도 확대' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '지도 축소' })).not.toBeInTheDocument()
  })

  it('keeps compass and current location controls left-aligned when showing simulation speed', async () => {
    render(<TmapPanel simulationSpeedKph={29} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })

    const compassButton = screen.getByRole('button', { name: '나침반 원위치' })
    const currentLocationButton = screen.getByRole('button', { name: '현재 위치' })
    const speedNumber = screen.getByTestId('current-speed-number')
    const speedRow = currentLocationButton.parentElement
    const controlStack = speedRow?.parentElement

    expect(speedRow).toContainElement(currentLocationButton)
    expect(speedRow).toContainElement(speedNumber)
    expect(controlStack).toContainElement(compassButton)
    expect(controlStack).toHaveClass('items-start')
    expect(controlStack).not.toHaveClass('items-center')
  })

  it('resets the map to north-up top-down when the compass is pressed', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    expect(setBearing).toHaveBeenLastCalledWith(0)
    expect(setPitch).toHaveBeenLastCalledWith(0)
    vi.unstubAllGlobals()
  })

  it('keeps zoom while centering on current location in regular map mode', async () => {
    const onRequestLocation = vi.fn()
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.5681, lng: 126.978 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
        onRequestLocation={onRequestLocation}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })
    setCenter.mockClear()
    setZoom.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }))

    expect(onRequestLocation).toHaveBeenCalled()
    expect(setCenter).toHaveBeenCalledWith({ lat: 37.5681, lng: 126.978 })
    expect(screenToReal).toHaveBeenCalledWith({ x: 720, y: 290 })
    expect(setZoom).not.toHaveBeenCalled()
  })

  it('centers on the current location after applying the native 3d camera', async () => {
    const onRequestLocation = vi.fn()
    let targetCameraApplied = false
    const realToScreen = vi.fn(() => (
      targetCameraApplied
        ? { getX: () => 720, getY: () => 470 }
        : { getX: () => 720, getY: () => 180 }
    ))
    const screenToReal = vi.fn((point: { y?: number }) => (
      point.y === 290
        ? { lat: 37.5681, lng: 126.978 }
        : { lat: 37.46, lng: 126.978 }
    ))
    const nativeCameraJumpToForCurrentLocation = vi.fn(() => {
      targetCameraApplied = true
    })
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
        vsmMap: () => ({
          getCamera: () => ({
            jumpTo: nativeCameraJumpToForCurrentLocation,
          }),
        }),
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        cameraSettings={{ mode: '3d', zoom: 18.3, pitch: 45 }}
        currentPosition={{ lat: 37.5665, lng: 126.978 }}
        onRequestLocation={onRequestLocation}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })
    nativeCameraJumpToForCurrentLocation.mockClear()
    screenToReal.mockClear()
    targetCameraApplied = false

    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }))

    expect(onRequestLocation).toHaveBeenCalled()
    expect(nativeCameraJumpToForCurrentLocation).not.toHaveBeenCalledWith(
      expect.objectContaining({
        center: [126.978, 37.46],
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(nativeCameraJumpToForCurrentLocation).toHaveBeenLastCalledWith(
      expect.objectContaining({
        center: [126.978, 37.5681],
        pitch: 45,
      }),
      { animate: false },
      { moveByProgram: true },
    )
    expect(screenToReal).toHaveBeenLastCalledWith({ x: 720, y: 290 })
  })

  it('resets zoom on the second current-location press in regular map mode', async () => {
    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1600)

    render(<TmapPanel currentPosition={{ lat: 37.5665, lng: 126.978 }} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })
    setCenter.mockClear()
    setZoom.mockClear()

    const currentLocationButton = screen.getByRole('button', { name: '현재 위치' })
    fireEvent.click(currentLocationButton)
    fireEvent.click(currentLocationButton)

    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37.5665, lng: 126.978 })
    expect(setZoom).toHaveBeenLastCalledWith(18.3)
    nowSpy.mockRestore()
  })

  it('does not draw a north tick behind the compass N mark', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '나침반 원위치' })).toBeInTheDocument()
    })

    const tickTransforms = Array.from(
      screen.getByRole('button', { name: '나침반 원위치' }).querySelectorAll('line'),
      (line) => line.getAttribute('transform'),
    )

    expect(tickTransforms).not.toContain('rotate(0 22 22)')
    expect(tickTransforms).toContain('rotate(90 22 22)')
    expect(tickTransforms).toContain('rotate(180 22 22)')
    expect(tickTransforms).toContain('rotate(270 22 22)')
  })

  it('keeps compass rotation on the shortest path when bearing wraps around north', async () => {
    const firstRoute = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const wrappingRoute = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 38, lng: 125.95 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(<TmapPanel route={firstRoute} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '나침반 원위치' })).toBeInTheDocument()
    })

    rerender(<TmapPanel route={wrappingRoute} />)

    await waitFor(() => {
      const compassNeedle = screen
        .getByRole('button', { name: '나침반 원위치' })
        .querySelector('span')

      expect(compassNeedle?.style.transform).toMatch(/rotate\(2\.\d+deg\)/)
    })
  })

  it('keeps north-up after compass reset while simulation continues', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))
    expect(setBearing).toHaveBeenLastCalledWith(0)

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.5 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(0)
    })
    vi.unstubAllGlobals()
  })

  it('rotates the vehicle marker toward the route bearing after compass north-up reset', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:0deg'),
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(0)
    })
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:90deg'),
      }),
    )
    vi.unstubAllGlobals()
  })

  it('keeps north-up top-down when the compass is pressed repeatedly', async () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true })
    vi.stubGlobal('matchMedia', matchMedia)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    const compassButton = screen.getByRole('button', { name: '나침반 원위치' })
    fireEvent.click(compassButton)

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(0)
    })
    expect(setPitch).toHaveBeenLastCalledWith(0)

    fireEvent.click(compassButton)

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(0)
    })
    expect(setPitch).toHaveBeenLastCalledWith(0)
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:90deg'),
      }),
    )
    vi.unstubAllGlobals()
  })

  it('animates compass mode changes with the map and vehicle marker in the same frame', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    setBearing.mockClear()
    markerSetOptions.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    expect(setBearing).not.toHaveBeenCalledWith(0)
    await waitFor(() => {
      expect(requestAnimationFrameSpy).toHaveBeenCalled()
    })

    const firstFrame = rafCallbacks.shift()
    act(() => {
      firstFrame?.(0)
    })

    const secondFrame = rafCallbacks.shift()
    act(() => {
      secondFrame?.(320)
    })

    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(44.9, 0))
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:45deg'),
      }),
    )

    const thirdFrame = rafCallbacks.shift()
    act(() => {
      thirdFrame?.(640)
    })

    expect(setBearing).toHaveBeenLastCalledWith(0)
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:90deg'),
      }),
    )

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('keeps the compass rotation animation alive when simulation ticks during the turn', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    setBearing.mockClear()
    setCenter.mockClear()
    cancelAnimationFrameSpy.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.1 }}
      />,
    )

    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled()
    expect(setBearing).not.toHaveBeenCalledWith(0)

    const firstFrame = rafCallbacks.shift()
    act(() => {
      firstFrame?.(0)
    })

    const secondFrame = rafCallbacks.shift()
    act(() => {
      secondFrame?.(320)
    })

    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(44.9, 0))
    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37, lng: 126.1 })

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('keeps the compass rotation animation alive when the current-position effect reruns', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    render(
      <TmapPanel
        route={route}
        currentPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })

    setBearing.mockClear()
    cancelAnimationFrameSpy.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '나침반 원위치' }))

    await waitFor(() => {
      expect(requestAnimationFrameSpy).toHaveBeenCalled()
    })
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled()
    expect(setBearing).not.toHaveBeenCalledWith(0)

    const firstFrame = rafCallbacks.shift()
    act(() => {
      firstFrame?.(0)
    })

    const secondFrame = rafCallbacks.shift()
    act(() => {
      secondFrame?.(320)
    })

    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(44.9, 0))

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('draws the route line when guidance starts', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          strokeColor: '#01609A',
          strokeWeight: 18,
        }),
      )
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [
          { lat: 37, lng: 126 },
          { lat: 37, lng: 126.5 },
          { lat: 37, lng: 127 },
        ],
        strokeColor: '#00A2FE',
        strokeWeight: 13,
      }),
    )
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'center',
        iconSize: { width: 18, height: 18 },
        iconHTML: expect.stringContaining('nav-route-direction-arrow'),
      }),
    )
  })

  it('draws sparse white route direction markers above the route line', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    })

    expect(window.Tmapv3!.Polyline).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        strokeColor: '#01609A',
        strokeWeight: 18,
      }),
    )
    expect(window.Tmapv3!.Polyline).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        strokeColor: '#00A2FE',
        strokeWeight: 13,
      }),
    )
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('fill="#fff"'),
        zIndex: 120,
      }),
    )
  })

  it('distributes route direction markers across the full remaining route', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.03 },
            { lat: 37, lng: 126.06 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.012 },
              ],
              congestion: 1,
            },
            {
              coordinates: [
                { lat: 37, lng: 126.048 },
                { lat: 37, lng: 126.06 },
              ],
              congestion: 3,
            },
          ],
          summary: {
            distanceMeters: 5280,
            durationSeconds: 420,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(getRouteDirectionMarkerCalls().length).toBeGreaterThan(2)
    })

    const routeDirectionMarkerLongitudes = getRouteDirectionMarkerCalls()
      .map((call) => (call[0]?.position as { lng?: number } | undefined)?.lng)

    expect(routeDirectionMarkerLongitudes.some((lng) => (
      typeof lng === 'number' && lng > 126.025 && lng < 126.04
    ))).toBe(true)
    expect(routeDirectionMarkerLongitudes.some((lng) => (
      typeof lng === 'number' && lng > 126.055
    ))).toBe(true)
  })

  it('keeps a route direction marker near the end of the visible route', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.01 },
          ],
          summary: {
            distanceMeters: 880,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(getRouteDirectionMarkerCalls().length).toBeGreaterThan(0)
    })

    const routeDirectionMarkerPositions = getRouteDirectionMarkerCalls()
      .map((call) => call[0]?.position)

    expect(routeDirectionMarkerPositions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          lat: expect.closeTo(37, 4),
          lng: expect.closeTo(126.009, 2),
        }),
      ]),
    )
  })

  it('draws traffic-aware route segments with congestion colors', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
              ],
              congestion: 1,
            },
            {
              coordinates: [
                { lat: 37, lng: 126.5 },
                { lat: 37, lng: 127 },
              ],
              congestion: 4,
            },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
          ],
          strokeColor: '#16C47F',
          strokeWeight: 13,
        }),
      )
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [
          { lat: 37, lng: 126.5 },
          { lat: 37, lng: 127 },
        ],
        strokeColor: '#F04438',
      }),
    )
  })

  it('keeps a base remaining route line under partial traffic segments', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
              ],
              congestion: 1,
            },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          strokeColor: '#00A2FE',
        }),
      )
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [
          { lat: 37, lng: 126 },
          { lat: 37, lng: 126.5 },
        ],
        strokeColor: '#16C47F',
      }),
    )
  })

  it('falls back to the remaining route line when traffic segments collapse during simulation', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
              ],
              congestion: 1,
            },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126.5 }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          strokeWeight: 13,
        }),
      )
    })
  })

  it('updates the previous route line path during simulation without removing it', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(<TmapPanel route={route} />)

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    })

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.5 }}
      />,
    )

    await waitFor(() => {
      expect(polylineSetPath).toHaveBeenCalledWith([
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ])
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
  })

  it('keeps the existing route line when simulation starts at the same first coordinate', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(<TmapPanel route={route} />)

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    })

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
  })

  it('does not redraw the route line for every tiny simulation movement', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      trafficSegments: [
        {
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
          ],
          congestion: 1 as const,
        },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    })

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.000001 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    expect(polylineSetPath).not.toHaveBeenCalled()
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
  })

  it('keeps wheel zoom changes while following simulation camera before the SDK reports the new zoom', async () => {
    getZoom.mockReturnValue(17)
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126 })
    })

    fireEvent.wheel(screen.getByTestId('tmap-canvas'), { deltaY: -100 })
    setZoom.mockClear()

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.2 }}
      />,
    )

    await waitFor(() => {
      expect(setZoom).toHaveBeenCalledWith(18)
    })
  })

  it('stops following the camera after map drag while the simulation marker keeps moving', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126 })
    })

    const mapElement = screen.getByTestId('tmap-canvas')

    fireEvent.pointerDown(mapElement, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mapElement, { clientX: 34, clientY: 10 })
    setCenter.mockClear()
    markerSetPosition.mockClear()

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.2 }}
      />,
    )

    await waitFor(() => {
      expect(markerSetPosition).toHaveBeenCalledWith({ lat: 37, lng: 126.2 })
    })
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('resumes camera following when current location is pressed after map drag', async () => {
    const onRequestLocation = vi.fn()
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        onRequestLocation={onRequestLocation}
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126 })
    })

    const mapElement = screen.getByTestId('tmap-canvas')

    fireEvent.pointerDown(mapElement, { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(mapElement, { clientX: 34, clientY: 10 })
    setCenter.mockClear()

    rerender(
      <TmapPanel
        onRequestLocation={onRequestLocation}
        route={route}
        simulationPosition={{ lat: 37, lng: 126.2 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).not.toHaveBeenCalled()
    })

    fireEvent.click(screen.getByRole('button', { name: '현재 위치' }))

    expect(onRequestLocation).toHaveBeenCalled()
    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126.2 })
    })
  })

  it('updates the existing route line path during simulation instead of recreating it', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    })

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37.2, lng: 126.25 }}
      />,
    )

    await waitFor(() => {
      expect(polylineSetPath).toHaveBeenCalledWith([
        { lat: 37, lng: 126.25 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ])
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
  })

  it('moves the marker to the same route-line start on each simulation tick', async () => {
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }
    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(markerSetPosition).toHaveBeenCalledWith({ lat: 37, lng: 126 })
    })
    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'center',
        iconSize: { width: 58, height: 58 },
        iconHTML: expect.stringContaining('nav-current-arrow'),
      }),
    )

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126.25 }}
      />,
    )

    await waitFor(() => {
      expect(polylineSetPath).toHaveBeenCalledWith([
        { lat: 37, lng: 126.25 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ])
    })
    expect(markerSetPosition).toHaveBeenCalledWith({ lat: 37, lng: 126.25 })
  })

  it('keeps the visible route line start matched to the simulated marker position with traffic colors', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
              ],
              congestion: 1,
            },
            {
              coordinates: [
                { lat: 37, lng: 126.5 },
                { lat: 37, lng: 127 },
              ],
              congestion: 4,
            },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126.25 }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.arrayContaining([
            { lat: 37, lng: 126.25 },
          ]),
          strokeColor: '#16C47F',
        }),
      )
    })
  })

  it('keeps the full route visible before simulation even when current GPS is away from the route', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 38, lng: 128 }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
        }),
      )
    })
  })

  it('keeps the full route visible before simulation when the origin is current location', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 38, lng: 128 }}
        origin={{
          id: 'current-location',
          name: '현재 위치',
          address: 'GPS 위치',
          coordinate: { lat: 38, lng: 128 },
        }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
        expect.objectContaining({
          path: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
        }),
      )
    })
  })

  it('uses the instantaneous route bearing while simulation moves so the road direction stays upright', async () => {
    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126.5 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126.5 })
    })

    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.7, 0))
  })

  it('lets the simulation frame renderer own the camera while simulation state updates lag behind', async () => {
    let renderSimulationFrame: ((position: { lat: number; lng: number }) => void) | undefined
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
        { lat: 38, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeDefined()
    })

    setBearing.mockClear()

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.5 })
    })

    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(21.5, 0))
    setBearing.mockClear()

    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37.5, lng: 127 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await act(async () => {})

    expect(setBearing).not.toHaveBeenCalled()
  })

  it('smooths simulation frame bearing changes while keeping position updates immediate', async () => {
    let renderSimulationFrame: ((position: { lat: number; lng: number }) => void) | undefined

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
            { lat: 38, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeDefined()
    })

    setBearing.mockClear()
    setCenter.mockClear()

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.5 })
    })

    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37, lng: 126.5 })
    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(21.5, 0))

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 127 })
    })

    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37, lng: 127 })
    expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(27.2, 0))
  })

  it('snaps the navigation arrow and camera to the route line instead of the raw GPS point', async () => {
    render(
      <TmapPanel
        currentPosition={{ lat: 37.2, lng: 126.4 }}
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126.4 })
    })

    expect(window.Tmapv3!.Marker).toHaveBeenCalledWith(
      expect.objectContaining({
        anchor: 'center',
        iconSize: { width: 58, height: 58 },
        position: { lat: 37, lng: 126.4 },
      }),
    )
  })

  it('applies simulation coordinate ticks immediately without scheduling a second animation', async () => {
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        rafCallbacks.push(callback)
        return rafCallbacks.length
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)

    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 127 },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    const { rerender } = render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37, lng: 126 })
    })

    setCenter.mockClear()
    markerSetPosition.mockClear()
    rerender(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 127 }}
      />,
    )

    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37, lng: 127 })
    expect(markerSetPosition).toHaveBeenLastCalledWith({ lat: 37, lng: 127 })
    expect(rafCallbacks).toHaveLength(0)

    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
  })

  it('clips the visible route line in the same frame as the navigation marker', async () => {
    let renderSimulationFrame: ((position: { lat: number; lng: number }) => void) | undefined

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 127 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeDefined()
      expect(window.Tmapv3!.Polyline).toHaveBeenCalled()
    })

    markerSetPosition.mockClear()
    polylineSetPath.mockClear()

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.5 })
    })

    expect(markerSetPosition).toHaveBeenLastCalledWith({ lat: 37, lng: 126.5 })
    expect(polylineSetPath).toHaveBeenCalledWith([
      { lat: 37, lng: 126.5 },
      { lat: 37, lng: 127 },
    ])
  })

  it('keeps route line polylines stable when the simulation crosses a congestion segment boundary', async () => {
    let renderSimulationFrame: ((position: { lat: number; lng: number }) => void) | undefined
    const route = {
      coordinates: [
        { lat: 37, lng: 126 },
        { lat: 37, lng: 126.5 },
        { lat: 37, lng: 127 },
      ],
      trafficSegments: [
        {
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
          ],
          congestion: 1 as const,
        },
        {
          coordinates: [
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          congestion: 4 as const,
        },
      ],
      summary: {
        distanceMeters: 1000,
        durationSeconds: 120,
      },
    }

    render(
      <TmapPanel
        route={route}
        simulationPosition={{ lat: 37, lng: 126 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeDefined()
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    })

    polylineSetMap.mockClear()
    polylineSetPath.mockClear()

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.75 })
    })

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
    expect(polylineSetPath).toHaveBeenCalledWith([
      { lat: 37, lng: 126.75 },
      { lat: 37, lng: 127 },
    ])
  })

  it('does not update the route line path on every regular simulation frame', async () => {
    let renderSimulationFrame: ((position: { lat: number; lng: number }) => void) | undefined

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 37, lng: 126.5 },
            { lat: 37, lng: 127 },
          ],
          trafficSegments: [
            {
              coordinates: [
                { lat: 37, lng: 126 },
                { lat: 37, lng: 126.5 },
              ],
              congestion: 1 as const,
            },
            {
              coordinates: [
                { lat: 37, lng: 126.5 },
                { lat: 37, lng: 127 },
              ],
              congestion: 4 as const,
            },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37, lng: 126 }}
        onSimulationFrameRendererReady={(renderFrame) => {
          renderSimulationFrame = renderFrame
        }}
      />,
    )

    await waitFor(() => {
      expect(renderSimulationFrame).toBeDefined()
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    })

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.2 })
    })

    polylineSetMap.mockClear()
    polylineSetPath.mockClear()
    polylineSetOptions.mockClear()

    act(() => {
      renderSimulationFrame?.({ lat: 37, lng: 126.25 })
    })

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(4)
    expect(polylineSetMap).not.toHaveBeenCalled()
    expect(polylineSetOptions).not.toHaveBeenCalled()
    expect(polylineSetPath).not.toHaveBeenCalled()
  })

  it('applies bearing before resolving the offset camera center to avoid lateral shake while turning', async () => {
    const realToScreen = vi.fn(() => ({ getX: () => 720, getY: () => 470 }))
    const screenToReal = vi.fn(() => ({ lat: 37.5016, lng: 126 }))
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        getCenter,
        getBearing,
        getPitch,
        getZoom,
        setCenter,
        setZoom,
        setBearing,
        setPitch,
        setInteractive,
        realToScreen,
        screenToReal,
      }
    }) as unknown as NonNullable<Window['Tmapv3']>['Map']

    render(
      <TmapPanel
        route={{
          coordinates: [
            { lat: 37, lng: 126 },
            { lat: 38, lng: 126 },
          ],
          summary: {
            distanceMeters: 1000,
            durationSeconds: 120,
          },
        }}
        simulationPosition={{ lat: 37.5, lng: 126 }}
      />,
    )

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalled()
    })

    const lastBearingCallOrder = setBearing.mock.invocationCallOrder[
      setBearing.mock.invocationCallOrder.length - 1
    ]
    const lastPitchCallOrder = setPitch.mock.invocationCallOrder[
      setPitch.mock.invocationCallOrder.length - 1
    ]
    const lastOffsetProjectionCallOrder = realToScreen.mock.invocationCallOrder[
      realToScreen.mock.invocationCallOrder.length - 1
    ]
    const lastCenterCallOrder = setCenter.mock.invocationCallOrder[
      setCenter.mock.invocationCallOrder.length - 1
    ]

    expect(lastBearingCallOrder).toBeLessThan(lastCenterCallOrder)
    expect(lastBearingCallOrder).toBeLessThan(lastOffsetProjectionCallOrder)
    expect(lastPitchCallOrder).toBeLessThan(lastOffsetProjectionCallOrder)
    expect(lastOffsetProjectionCallOrder).toBeLessThan(lastCenterCallOrder)
    expect(setCenter).toHaveBeenLastCalledWith({ lat: 37.5016, lng: 126 })
  })
})
