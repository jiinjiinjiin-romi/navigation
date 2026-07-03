import axios from 'axios'

interface HttpClient {
  get: typeof axios.get
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

export interface SearchHistoryListResponse {
  items: SearchHistoryItem[]
  page: number
  size: number
  total: number
  totalPages: number
}

export interface SearchHistoryListParams {
  page?: number
  size?: number
}

export async function listSearchHistories(
  profileId: string,
  params: SearchHistoryListParams = {},
  client: Pick<HttpClient, 'get'> = axios,
): Promise<SearchHistoryListResponse> {
  const { data } = await client.get<SearchHistoryListResponse>(
    `/api/v1/profiles/${profileId}/search-histories`,
    {
      params,
    },
  )

  return data
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
