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
  const polylineSetPath = vi.fn()
  const nativeCameraJumpTo = vi.fn()

  beforeEach(() => {
    vi.unstubAllGlobals()
    mockedLoadTmapSdk.mockResolvedValue()
    setCenter.mockReset()
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
    polylineSetPath.mockReset()
    nativeCameraJumpTo.mockReset()

    window.Tmapv3 = {
      Map: vi.fn(function () {
        return {
          getBearing,
          getPitch,
          getZoom,
          setCenter,
          setZoom,
          setBearing,
          setPitch,
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
    render(<TmapPanel currentPosition={{ lat: 37.5665, lng: 126.978 }} />)

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
    setPitch.mockClear()
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

    act(() => {
      animationFrames.shift()?.(0)
    })
    expect(setPitch).toHaveBeenLastCalledWith(0)

    act(() => {
      animationFrames.shift()?.(120)
    })
    const midPitch = setPitch.mock.calls[setPitch.mock.calls.length - 1]?.[0]
    expect(midPitch).toBeGreaterThan(0)
    expect(midPitch).toBeLessThan(45)

    act(() => {
      animationFrames.shift()?.(240)
    })
    expect(setPitch).toHaveBeenLastCalledWith(45)
    expect(markerSetOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        iconHTML: expect.stringContaining('--vehicle-marker-pitch:45deg'),
      }),
    )
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
          zoom: 18.3,
          pitch: 0,
        }),
        { animate: false },
        { moveByProgram: true },
      )
    })
    expect(setBearing).not.toHaveBeenCalled()
    expect(setCenter).not.toHaveBeenCalled()
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
    expect(setCenter).toHaveBeenCalledWith({ lat: 37.5665, lng: 126.978 })
    expect(setZoom).not.toHaveBeenCalled()
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
