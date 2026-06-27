import { describe, expect, it, vi } from 'vitest'

import { getCurrentAddress, getRoadMatch, getRoute, searchPlaces } from './tmapApi'

describe('searchPlaces', () => {
  it('calls the backend TMAP POI proxy without exposing an app key', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        searchPoiInfo: {
          pois: {
            poi: [
              {
                id: 'poi-1',
                name: '서울역',
                upperAddrName: '서울',
                middleAddrName: '중구',
                lowerAddrName: '봉래동2가',
                frontLat: '37.5547',
                frontLon: '126.9706',
              },
            ],
          },
        },
      },
    })

    const places = await searchPlaces('서울역', { get })

    expect(get).toHaveBeenCalledWith('/api/tmap/pois', {
      params: { keyword: '서울역' },
    })
    expect(JSON.stringify(get.mock.calls)).not.toContain('appKey')
    expect(places[0]).toEqual({
      id: 'poi-1-37.5547-126.9706-0',
      name: '서울역',
      address: '서울 중구 봉래동2가',
      coordinate: { lat: 37.5547, lng: 126.9706 },
    })
  })

  it('keeps place ids unique when TMAP returns duplicate poi ids', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        searchPoiInfo: {
          pois: {
            poi: [
              {
                id: '182011',
                name: '스타벅스',
                frontLat: '37.1',
                frontLon: '127.1',
              },
              {
                id: '182011',
                name: '스타벅스',
                frontLat: '37.2',
                frontLon: '127.2',
              },
            ],
          },
        },
      },
    })

    const places = await searchPlaces('스타벅스', { get })

    expect(places.map((place) => place.id)).toEqual([
      '182011-37.1-127.1-0',
      '182011-37.2-127.2-1',
    ])
  })
})

describe('getRoute', () => {
  it('calls the backend TMAP route proxy and normalizes route geometry', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        features: [
          {
            geometry: { type: 'Point', coordinates: [126.978, 37.5665] },
            properties: { totalDistance: '12340', totalTime: '1320' },
          },
          {
            geometry: { type: 'Point', coordinates: [127, 37.55] },
            properties: { turnType: 12, description: '좌회전' },
          },
          {
            geometry: { type: 'Point', coordinates: [127.01, 37.54] },
            properties: { turnType: 191, description: '제한속도 안내' },
          },
          {
            geometry: { type: 'Point', coordinates: [127.02, 37.53] },
            properties: { turnType: 120, description: '고가도로 안내' },
          },
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [126.978, 37.5665],
                [127.0276, 37.4979],
              ],
            },
            properties: {},
          },
        ],
      },
    })

    const route = await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(post).toHaveBeenCalledWith('/api/tmap/routes', {
      origin: { lat: 37.5665, lng: 126.978 },
      destination: { lat: 37.4979, lng: 127.0276 },
    })
    expect(JSON.stringify(post.mock.calls)).not.toContain('appKey')
    expect(route).toEqual({
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
      summary: {
        distanceMeters: 12340,
        durationSeconds: 1320,
      },
      maneuvers: [
        expect.objectContaining({
          type: 'left',
          label: '좌회전',
          description: '좌회전',
        }),
        expect.objectContaining({
          type: 'caution',
          label: '주의',
          description: '제한속도 안내',
        }),
        expect.objectContaining({
          type: 'overpass',
          label: '고가도로',
          description: '고가도로 안내',
          facilityType: 'overpass',
          signCode: 120,
        }),
      ],
      safetyAlerts: [
        expect.objectContaining({
          type: 'enforcement',
          label: '단속 주의',
          description: '제한속도 안내',
        }),
      ],
    })
  })

  it('normalizes MultiLineString route geometry from TMAP', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        features: [
          {
            geometry: {
              type: 'MultiLineString',
              coordinates: [
                [
                  [126.978, 37.5665],
                  [127.001, 37.55],
                ],
                [
                  [127.001, 37.55],
                  [127.0276, 37.4979],
                ],
              ],
            },
            properties: { totalDistance: '12340', totalTime: '1320' },
          },
        ],
      },
    })

    const route = await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(route.coordinates).toEqual([
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.55, lng: 127.001 },
      { lat: 37.55, lng: 127.001 },
      { lat: 37.4979, lng: 127.0276 },
    ])
  })

  it('normalizes route traffic congestion segments from TMAP line features', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        features: [
          {
            geometry: { type: 'Point', coordinates: [126.978, 37.5665] },
            properties: { totalDistance: '1000', totalTime: '120' },
          },
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [126.978, 37.5665],
                [127, 37.55],
              ],
            },
            properties: { congestion: 1 },
          },
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [127, 37.55],
                [127.0276, 37.4979],
              ],
              traffic: [4],
            },
            properties: {},
          },
        ],
      },
    })

    const route = await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(route.trafficSegments).toEqual([
      {
        coordinates: [
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.55, lng: 127 },
        ],
        congestion: 1,
      },
      {
        coordinates: [
          { lat: 37.55, lng: 127 },
          { lat: 37.4979, lng: 127.0276 },
        ],
        congestion: 4,
      },
    ])
  })

  it('splits TMAP route traffic tuples into coordinate-range congestion segments', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        features: [
          {
            geometry: { type: 'Point', coordinates: [126.978, 37.5665] },
            properties: { totalDistance: '1000', totalTime: '120' },
          },
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [126.978, 37.5665],
                [126.99, 37.56],
                [127, 37.55],
                [127.01, 37.54],
                [127.0276, 37.4979],
              ],
              traffic: [
                [0, 2, 2, 18],
                [2, 4, 4, 7],
              ],
            },
            properties: {},
          },
        ],
      },
    })

    const route = await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(route.trafficSegments).toEqual([
      {
        coordinates: [
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.56, lng: 126.99 },
          { lat: 37.55, lng: 127 },
        ],
        congestion: 2,
      },
      {
        coordinates: [
          { lat: 37.55, lng: 127 },
          { lat: 37.54, lng: 127.01 },
          { lat: 37.4979, lng: 127.0276 },
        ],
        congestion: 4,
      },
    ])
  })
})

describe('getRoadMatch', () => {
  it('calls the backend road match proxy and normalizes speed limit data', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        resultData: {
          matchedPoints: [
            {
              sourceIndex: 0,
              matchedLocation: {
                latitude: '37.5665',
                longitude: '126.978',
              },
              speed: 50,
              roadCategory: 5,
            },
          ],
        },
      },
    })

    const roadMatch = await getRoadMatch([
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
    ], { post })

    expect(post).toHaveBeenCalledWith('/api/tmap/road-match', {
      coordinates: [
        { lat: 37.5665, lng: 126.978 },
        { lat: 37.4979, lng: 127.0276 },
      ],
    })
    expect(JSON.stringify(post.mock.calls)).not.toContain('appKey')
    expect(roadMatch).toEqual([
      {
        sourceIndex: 0,
        coordinate: { lat: 37.5665, lng: 126.978 },
        speedLimitKph: 50,
        roadCategory: 5,
      },
    ])
  })
})

describe('getCurrentAddress', () => {
  it('calls the backend reverse geocoding proxy and normalizes a full address', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        addressInfo: {
          fullAddress: '서울특별시 중구 세종대로 110',
        },
      },
    })

    const address = await getCurrentAddress({ lat: 37.5665, lng: 126.978 }, { get })

    expect(get).toHaveBeenCalledWith('/api/tmap/reverse-geocode', {
      params: { lat: 37.5665, lng: 126.978 },
    })
    expect(JSON.stringify(get.mock.calls)).not.toContain('appKey')
    expect(address).toBe('서울특별시 중구 세종대로 110')
  })

  it('shows one concrete address when TMAP returns comma-separated address candidates', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        addressInfo: {
          fullAddress: '경기도 의정부시 의정부2동,경기도 의정부시 의정부동 688,경기도 의정부시 신흥로239번길 39-6',
        },
      },
    })

    const address = await getCurrentAddress({ lat: 37.738, lng: 127.045 }, { get })

    expect(address).toBe('경기도 의정부시 신흥로239번길 39-6')
  })
})
