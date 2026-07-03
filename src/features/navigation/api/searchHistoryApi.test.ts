import { describe, expect, it, vi } from 'vitest'

import {
  createSearchHistory,
  listSearchHistories,
  type SearchHistoryCreateRequest,
  type SearchHistoryItem,
} from './searchHistoryApi'

const historyItem: SearchHistoryItem = {
  id: 1,
  query: '서울역',
  provider: 'TMAP',
  providerPlaceId: 'poi-1',
  placeName: '서울역',
  address: '서울 중구 봉래동2가',
  latitude: 37.5547,
  longitude: 126.9706,
  searchedAt: '2026-07-03T00:00:00.000000Z',
}

describe('searchHistoryApi', () => {
  it('lists search histories for a profile', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        items: [historyItem],
        page: 1,
        size: 10,
        total: 1,
        totalPages: 1,
      },
    })

    const result = await listSearchHistories('profile-1', { page: 1, size: 10 }, { get })

    expect(get).toHaveBeenCalledWith('/api/v1/profiles/profile-1/search-histories', {
      params: { page: 1, size: 10 },
    })
    expect(result.items[0].query).toBe('서울역')
  })

  it('creates a search history for a selected place', async () => {
    const payload: SearchHistoryCreateRequest = {
      query: '서울역',
      provider: 'TMAP',
      providerPlaceId: 'poi-1',
      placeName: '서울역',
      address: '서울 중구 봉래동2가',
      latitude: 37.5547,
      longitude: 126.9706,
    }
    const post = vi.fn().mockResolvedValue({ data: historyItem })

    const result = await createSearchHistory('profile-1', payload, { post })

    expect(post).toHaveBeenCalledWith('/api/v1/profiles/profile-1/search-histories', payload)
    expect(result.query).toBe('서울역')
  })
})
