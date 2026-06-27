import { describe, expect, it, vi } from 'vitest'

import { getCurrentAddress, getRoadMatch, getRoute, getRouteOptions, searchPlaces } from './tmapApi'

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
            geometry: { type: 'Point', coordinates: [127.015, 37.535] },
            properties: { turnType: 150, description: '주의 안내' },
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
      searchOption: '0',
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
        expect.objectContaining({
          type: 'caution',
          label: '주의',
          description: '주의 안내',
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

  it('merges adjacent traffic tuple ranges with the same congestion', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        features: [
          {
            geometry: {
              type: 'LineString',
              coordinates: [
                [126.978, 37.5665],
                [126.99, 37.56],
                [127, 37.55],
                [127.01, 37.54],
              ],
              traffic: [
                [0, 1, 4, 8],
                [1, 3, 4, 7],
              ],
            },
            properties: { totalDistance: '1000', totalTime: '120' },
          },
        ],
      },
    })

    const route = await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.54, lng: 127.01 },
      { post },
    )

    expect(route.trafficSegments).toEqual([
      {
        coordinates: [
          { lat: 37.5665, lng: 126.978 },
          { lat: 37.56, lng: 126.99 },
          { lat: 37.55, lng: 127 },
          { lat: 37.54, lng: 127.01 },
        ],
        congestion: 4,
      },
    ])
  })

  it('posts a custom route search option to the backend proxy', async () => {
    const post = vi.fn().mockResolvedValue({
      data: routeResponse([
        [126.978, 37.5665],
        [127.0276, 37.4979],
      ], 12340, 1320),
    })

    await getRoute(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
      undefined,
      '10',
    )

    expect(post).toHaveBeenCalledWith('/api/tmap/routes', {
      origin: { lat: 37.5665, lng: 126.978 },
      destination: { lat: 37.4979, lng: 127.0276 },
      searchOption: '10',
    })
  })
})

describe('getRouteOptions', () => {
  it('requests all route option presets and returns successful unique options', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127, 37.55]], 1000, 100) })
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127.01, 37.54]], 900, 90) })
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127.02, 37.53]], 800, 120) })
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127.03, 37.52]], 1200, 110) })

    const options = await getRouteOptions(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(post).toHaveBeenCalledTimes(4)
    expect(post.mock.calls.map((call) => call[1].searchOption)).toEqual(['0', '2', '10', '4'])
    expect(options.map((option) => option.searchOption)).toEqual(['0', '2', '4', '10'])
    expect(options[0]).toMatchObject({
      id: 'route-option-0',
      label: '추천',
      color: '#0EA5E9',
      isRecommended: true,
    })
  })

  it('drops failed individual route options and duplicate route summaries', async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127, 37.55]], 1000, 100) })
      .mockRejectedValueOnce(new Error('route option unavailable'))
      .mockResolvedValueOnce({ data: routeResponse([[126.9780001, 37.5665001], [127.0000001, 37.5500001]], 1004, 102) })
      .mockResolvedValueOnce({ data: routeResponse([[126.978, 37.5665], [127.03, 37.52]], 1200, 110) })

    const options = await getRouteOptions(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )

    expect(options.map((option) => option.searchOption)).toEqual(['0', '4'])
  })

  it('throws when every route option request fails', async () => {
    const post = vi.fn().mockRejectedValue(new Error('network down'))

    await expect(getRouteOptions(
      { lat: 37.5665, lng: 126.978 },
      { lat: 37.4979, lng: 127.0276 },
      { post },
    )).rejects.toThrow('Failed to load route options')
  })
})

function routeResponse(
  coordinates: [number, number][],
  totalDistance: number,
  totalTime: number,
) {
  return {
    features: [
      {
        geometry: { type: 'Point', coordinates: coordinates[0] },
        properties: { totalDistance: String(totalDistance), totalTime: String(totalTime) },
      },
      {
        geometry: { type: 'LineString', coordinates },
        properties: {},
      },
    ],
  }
}

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
