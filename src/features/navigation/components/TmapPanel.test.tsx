import { render, waitFor } from '@testing-library/react'
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
  const polylineSetMap = vi.fn()

  beforeEach(() => {
    mockedLoadTmapSdk.mockResolvedValue()
    setCenter.mockReset()
    setZoom.mockReset()
    setBearing.mockReset()
    setPitch.mockReset()
    markerSetPosition.mockReset()
    polylineSetMap.mockReset()

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
      Marker: vi.fn(function () {
        return {
          setMap: vi.fn(),
          setPosition: markerSetPosition,
        }
      }),
      Polyline: vi.fn(function () {
        return {
          setMap: polylineSetMap,
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
          strokeWeight: 8,
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
        position: { lat: 37, lng: 126.4 },
      }),
    )
  })
})
