import axios from 'axios'

interface HttpClient {
  post: typeof axios.post
}

export interface SearchHistoryItem {
  id: number
  query: string
  provider: string
  providerPlaceId: string | null
  placeName: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  searchedAt: string
}

export interface SearchHistoryCreateRequest {
  query: string
  provider: string
  providerPlaceId: string | null
  placeName: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
}

export async function createSearchHistory(
  profileId: string,
  payload: SearchHistoryCreateRequest,
  client: Pick<HttpClient, 'post'> = axios,
): Promise<SearchHistoryItem> {
  const { data } = await client.post<SearchHistoryItem>(
    `/api/v1/profiles/${profileId}/search-histories`,
    payload,
  )

  return data
}
