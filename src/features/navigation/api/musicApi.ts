import axios from 'axios'

interface HttpClient {
  get: typeof axios.get
}

export type MusicMood = 'bright' | 'calm' | 'drive' | 'focus'

export interface MusicRecommendationTrack {
  id: string
  title: string
  artist: string
  album: string
  duration: string
  durationSeconds: number
  coverUrl: string | null
  sourceUrl: string
  provider: 'itunes' | 'demo-fallback'
}

interface MusicRecommendationResponse {
  tracks: MusicRecommendationTrack[]
}

export async function getMusicRecommendations(
  {
    mood,
    keyword = '',
    limit = 10,
  }: {
    mood: MusicMood
    keyword?: string
    limit?: number
  },
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<MusicRecommendationTrack[]> {
  const { data } = await client.get<MusicRecommendationResponse>('/api/v1/music/recommendations', {
    params: { mood, keyword, limit },
    ...withSignal(signal),
  })

  return data.tracks
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}
