/// <reference types="vite/client" />

interface Window {
  Tmapv3Map?: {
    getZoom?: () => number
    getBearing?: () => number
    setCenter?: (latLng: unknown) => void
    setZoom?: (zoom: number) => void
    setBearing?: (bearing: number) => void
    setPitch?: (pitch: number) => void
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
  }
  Tmapv3?: {
    Map: new (element: HTMLElement | string, options: Record<string, unknown>) => NonNullable<Window['Tmapv3Map']>
    LatLng: new (lat: number, lng: number) => unknown
    Point: new (x: number, y: number) => unknown
    Marker: new (options: Record<string, unknown>) => NonNullable<Window['Tmapv3Marker']>
    Polyline: new (options: Record<string, unknown>) => NonNullable<Window['Tmapv3Polyline']>
  }
  __naviTmapMap?: Window['Tmapv3Map']
}
