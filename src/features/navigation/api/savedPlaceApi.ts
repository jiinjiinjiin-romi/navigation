import axios from 'axios'

interface HttpClient {
  delete: typeof axios.delete
  get: typeof axios.get
  patch: typeof axios.patch
  post: typeof axios.post
}

export type SavedPlaceType = 'HOME' | 'WORK' | 'SCHOOL' | 'FAVORITE'

export interface SavedPlaceSummary {
  id: string
  placeType: SavedPlaceType
  label: string
  provider: string
  providerPlaceId: string | null
  address: string
  latitude: number
  longitude: number
}

export interface FixedPlaces {
  home: SavedPlaceSummary | null
  work: SavedPlaceSummary | null
  school: SavedPlaceSummary | null
}

export interface SavedPlaceListResponse {
  fixedPlaces: FixedPlaces
  favorites: SavedPlaceSummary[]
}

export interface SavedPlace extends SavedPlaceSummary {
  createdAt: string
  updatedAt: string
}

export interface SavedPlaceWriteRequest {
  label: string
  provider: string
  providerPlaceId: string | null
  address: string
  latitude: number
  longitude: number
}

export interface SavedPlaceUpdateRequest {
  label?: string
  address?: string
  latitude?: number
  longitude?: number
}

export async function listSavedPlaces(
  profileId: string,
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<SavedPlaceListResponse> {
  const { data } = await client.get<SavedPlaceListResponse>(
    `/api/v1/profiles/${profileId}/saved-places`,
    {
      ...withSignal(signal),
    },
  )

  return data
}

export async function createFavorite(
  profileId: string,
  payload: SavedPlaceWriteRequest,
  client: Pick<HttpClient, 'post'> = axios,
): Promise<SavedPlace> {
  const { data } = await client.post<SavedPlace>(
    `/api/v1/profiles/${profileId}/favorites`,
    payload,
  )

  return data
}

export async function deleteSavedPlace(
  placeId: string,
  client: Pick<HttpClient, 'delete'> = axios,
): Promise<void> {
  await client.delete(`/api/v1/saved-places/${placeId}`)
}

export async function updateSavedPlace(
  placeId: string,
  payload: SavedPlaceUpdateRequest,
  client: Pick<HttpClient, 'patch'> = axios,
): Promise<SavedPlaceSummary> {
  const { data } = await client.patch<SavedPlaceSummary>(
    `/api/v1/saved-places/${placeId}`,
    payload,
  )

  return data
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}
