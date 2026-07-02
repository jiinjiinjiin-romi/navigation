import { describe, expect, it, vi } from 'vitest'

import {
  createFavorite,
  deleteSavedPlace,
  listSavedPlaces,
  updateSavedPlace,
  type SavedPlaceWriteRequest,
  type SavedPlaceListResponse,
} from './savedPlaceApi'

const savedPlacesResponse: SavedPlaceListResponse = {
  fixedPlaces: {
    home: {
      id: 'home-id',
      placeType: 'HOME',
      label: '집',
      provider: 'KAKAO',
      providerPlaceId: 'home-1',
      address: '서울 광진구 능동로 209',
      latitude: 37.5501,
      longitude: 127.0734,
    },
    work: null,
    school: null,
  },
  favorites: [
    {
      id: 'favorite-id',
      placeType: 'FAVORITE',
      label: '성수 카페',
      provider: 'KAKAO',
      providerPlaceId: null,
      address: '서울 성동구 성수동',
      latitude: 37.5442,
      longitude: 127.0557,
    },
  ],
}

describe('savedPlaceApi', () => {
  it('lists saved places for a profile with backend camelCase fields', async () => {
    const get = vi.fn().mockResolvedValue({ data: savedPlacesResponse })

    const result = await listSavedPlaces('profile-1', { get })

    expect(get).toHaveBeenCalledWith('/api/v1/profiles/profile-1/saved-places', {})
    expect(result.fixedPlaces.home?.placeType).toBe('HOME')
    expect(result.favorites[0].label).toBe('성수 카페')
  })

  it('creates a favorite label for a profile', async () => {
    const payload: SavedPlaceWriteRequest = {
      label: '성수 카페',
      provider: 'TMAP',
      providerPlaceId: 'poi-1',
      address: '서울 성동구 성수동',
      latitude: 37.5442,
      longitude: 127.0557,
    }
    const post = vi.fn().mockResolvedValue({ data: savedPlacesResponse.favorites[0] })

    const result = await createFavorite('profile-1', payload, { post })

    expect(post).toHaveBeenCalledWith('/api/v1/profiles/profile-1/favorites', payload)
    expect(result.label).toBe('성수 카페')
  })

  it('deletes a saved place label by id', async () => {
    const del = vi.fn().mockResolvedValue({ data: undefined })

    await deleteSavedPlace('favorite-id', { delete: del })

    expect(del).toHaveBeenCalledWith('/api/v1/saved-places/favorite-id')
  })

  it('updates a saved place label by id', async () => {
    const patch = vi.fn().mockResolvedValue({
      data: {
        ...savedPlacesResponse.favorites[0],
        label: '새 라벨',
      },
    })

    const result = await updateSavedPlace('favorite-id', { label: '새 라벨' }, { patch })

    expect(patch).toHaveBeenCalledWith('/api/v1/saved-places/favorite-id', { label: '새 라벨' })
    expect(result.label).toBe('새 라벨')
  })
})
