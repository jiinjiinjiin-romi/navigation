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
  const setZoom = vi.fn()
  const setBearing = vi.fn()
  const setPitch = vi.fn()
  const markerSetPosition = vi.fn()
  const markerSetOptions = vi.fn()
  const polylineSetMap = vi.fn()
  const polylineSetPath = vi.fn()
  const nativeCameraJumpTo = vi.fn()

  beforeEach(() => {
    vi.unstubAllGlobals()
    mockedLoadTmapSdk.mockResolvedValue()
    setCenter.mockReset()
    setZoom.mockReset()
    setBearing.mockReset()
    setPitch.mockReset()
    markerSetPosition.mockReset()
    markerSetOptions.mockReset()
    polylineSetMap.mockReset()
    polylineSetPath.mockReset()
    nativeCameraJumpTo.mockReset()

    window.Tmapv3 = {
      Map: vi.fn(function () {
        return {
          setCenter,
          setZoom,
          setBearing,
          setPitch,
        }
      }),
      LatLng: vi.fn(function (_lat: number, _lng: number) {
        return { lat: _lat, lng: _lng }
      }),
      Size: vi.fn(function (_width: number, _height: number) {
        return { width: _width, height: _height }
      }),
      Marker: vi.fn(function () {
        return {
          setMap: vi.fn(),
          setOptions: markerSetOptions,
          setPosition: markerSetPosition,
        }
      }),
      Polyline: vi.fn(function () {
        return {
          setMap: polylineSetMap,
          setPath: polylineSetPath,
        }
      }),
    } as unknown as NonNullable<Window['Tmapv3']>
  })

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
        zoom: 19,
      }),
    )
  })

  it('zooms in around the current location after permission is granted', async () => {
    render(<TmapPanel currentPosition={{ lat: 37.5665, lng: 126.978 }} />)

    await waitFor(() => {
      expect(setCenter).toHaveBeenCalledWith({ lat: 37.5665, lng: 126.978 })
    })
    expect(setZoom).toHaveBeenCalledWith(19)
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
    expect(setZoom).toHaveBeenCalledWith(19)
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

  it('updates vector map center and bearing atomically when the native camera is available', async () => {
    window.Tmapv3!.Map = vi.fn(function () {
      return {
        setCenter,
        setZoom,
        setBearing,
        setPitch,
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
      expect(nativeCameraJumpTo).toHaveBeenCalledWith(
        expect.objectContaining({
          center: [126, 37],
          bearing: expect.closeTo(89.8, 0),
          zoom: 19,
          pitch: 0,
        }),
        { animate: false },
        { moveByProgram: true },
      )
    })
    expect(setBearing).not.toHaveBeenCalled()
    expect(setCenter).not.toHaveBeenCalled()
  })

  it('shows the compass only while route guidance is active', async () => {
    render(<TmapPanel />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '현재 위치' })).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: '나침반 원위치' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지도 확대' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '지도 축소' })).toBeInTheDocument()
  })

  it('resets the map to north-up when the compass is pressed', async () => {
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
    vi.unstubAllGlobals()
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

  it('toggles the compass back to heading-up mode on the second press', async () => {
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

    fireEvent.click(compassButton)

    await waitFor(() => {
      expect(setBearing).toHaveBeenLastCalledWith(expect.closeTo(89.8, 0))
    })
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-bearing:0deg'),
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
          strokeWeight: 10,
        }),
      )
    })
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
          strokeColor: '#16a34a',
          strokeWeight: 10,
        }),
      )
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [
          { lat: 37, lng: 126.5 },
          { lat: 37, lng: 127 },
        ],
        strokeColor: '#dc2626',
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
          strokeColor: '#2563eb',
        }),
      )
    })
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledWith(
      expect.objectContaining({
        path: [
          { lat: 37, lng: 126 },
          { lat: 37, lng: 126.5 },
        ],
        strokeColor: '#16a34a',
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
          strokeWeight: 10,
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
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
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

    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(2)
    expect(polylineSetMap).not.toHaveBeenCalledWith(null)
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
      expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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
    expect(window.Tmapv3!.Polyline).toHaveBeenCalledTimes(1)
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
          strokeColor: '#16a34a',
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

  it('applies bearing before resolving the offset camera center to avoid lateral shake while turning', async () => {
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
    const lastCenterCallOrder = setCenter.mock.invocationCallOrder[
      setCenter.mock.invocationCallOrder.length - 1
    ]

    expect(lastBearingCallOrder).toBeLessThan(lastCenterCallOrder)
  })
})
