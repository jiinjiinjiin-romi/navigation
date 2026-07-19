import { describe, expect, it, vi } from 'vitest'

import { getMusicRecommendations } from './musicApi'

describe('musicApi', () => {
  it('loads normalized music recommendations from the backend', async () => {
    const response = {
      tracks: [
        {
          id: '123',
          title: 'Soft Focus',
          artist: 'Evening Route',
          album: 'Bright Pop Drive',
          duration: '3:08',
          durationSeconds: 188,
          coverUrl: 'https://example.com/cover.jpg',
          sourceUrl: 'https://music.apple.com/track/123',
          provider: 'itunes',
        },
        {
          id: 'demo-fallback-drive-neon',
          title: 'Drive Neon',
          artist: 'Roady Session',
          album: 'City Pulse',
          duration: '3:24',
          durationSeconds: 204,
          coverUrl: null,
          sourceUrl: '',
          provider: 'demo-fallback',
        },
      ],
    }
    const get = vi.fn().mockResolvedValue({ data: response })

    const result = await getMusicRecommendations({ mood: 'calm', keyword: 'Soft', limit: 6 }, { get })

    expect(get).toHaveBeenCalledWith('/api/v1/music/recommendations', {
      params: { mood: 'calm', keyword: 'Soft', limit: 6 },
    })
    expect(result).toEqual(response.tracks)
  })
})
