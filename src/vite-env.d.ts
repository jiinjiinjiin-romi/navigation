/// <reference types="vite/client" />

interface Window {
  Tmapv3Map?: {
    getCenter?: () => unknown
    getZoom?: () => number
    getBearing?: () => number
    getPitch?: () => number
    setCenter?: (latLng: unknown) => void
    setZoom?: (zoom: number) => void
    setBearing?: (bearing: number) => void
    setPitch?: (pitch: number) => void
    realToScreen?: (latLng: unknown) => unknown
    screenToReal?: (point: unknown) => unknown
    setInteractive?: (options: Record<string, unknown>) => void
    vsmMap?: () => {
      getCamera?: () => {
        getCenter?: () => unknown
        getBearing?: () => number
        getPitch?: () => number
        getZoom?: () => number
        jumpTo?: (
          options: Record<string, unknown>,
          animationOptions?: Record<string, unknown>,
          eventOptions?: Record<string, unknown>,
        ) => void
      }
    }
    zoomIn?: () => void
    zoomOut?: () => void
  }
  Tmapv3Marker?: {
    setMap: (map: unknown | null) => void
    setOptions?: (options: Record<string, unknown>) => void
    setPosition?: (latLng: unknown) => void
  }
  Tmapv3Polyline?: {
    setMap: (map: unknown | null) => void
    setPath?: (path: unknown[]) => void
    setOptions?: (options: Record<string, unknown>) => void
  }
  Tmapv3?: {
    Map: new (element: HTMLElement | string, options: Record<string, unknown>) => NonNullable<Window['Tmapv3Map']>
    LatLng: new (lat: number, lng: number) => unknown
    Point: new (x: number, y: number) => unknown
    Size: new (width: number, height: number) => unknown
    Marker: new (options: Record<string, unknown>) => NonNullable<Window['Tmapv3Marker']>
    Polyline: new (options: Record<string, unknown>) => NonNullable<Window['Tmapv3Polyline']>
  }
  __naviTmapMap?: Window['Tmapv3Map']
  __lastRenderedSimulationFrame?: {
    lat: number
    lng: number
  }
}
