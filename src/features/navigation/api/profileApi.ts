import axios from 'axios'

interface HttpClient {
  delete: typeof axios.delete
  get: typeof axios.get
  patch: typeof axios.patch
  post: typeof axios.post
}

export type AgentPersonality = 'FRIENDLY' | 'FORMAL' | 'WARM' | 'WITTY'
export type WarningSensitivity = 'LOW' | 'MEDIUM' | 'HIGH'
export type ProfileTheme = 'LIGHT' | 'DARK' | 'SYSTEM'

export interface Profile {
  id: string
  displayName: string
  agentCallName: string
  profileImageUrl: string | null
  reportEmail: string | null
  agentPersonality: AgentPersonality
  warningSensitivity: WarningSensitivity
  ttsVoiceId: string | null
  ttsSpeed: number
  guidanceVolume: number
  theme: ProfileTheme
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileListResponse {
  profiles: Profile[]
  count: number
  limit: number
}

export interface ProfileCreateRequest {
  displayName: string
  agentCallName: string
  reportEmail: string | null
  agentPersonality: AgentPersonality
  warningSensitivity: WarningSensitivity
  ttsVoiceId: string | null
  ttsSpeed: number
  guidanceVolume: number
  theme: ProfileTheme
}

export type ProfileUpdateRequest = Partial<ProfileCreateRequest>

export interface ProfileSelectResponse {
  selectedProfileId: string
  selectedAt: string
}

export const DEFAULT_PROFILE_CREATE_REQUEST: ProfileCreateRequest = {
  displayName: '새 운전자',
  agentCallName: '나비',
  reportEmail: null,
  agentPersonality: 'FRIENDLY',
  warningSensitivity: 'MEDIUM',
  ttsVoiceId: null,
  ttsSpeed: 1,
  guidanceVolume: 70,
  theme: 'LIGHT',
}

export async function listProfiles(
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<ProfileListResponse> {
  const { data } = await client.get<ProfileListResponse>('/api/v1/profiles', {
    ...withSignal(signal),
  })

  return data
}

export async function createProfile(
  payload: ProfileCreateRequest,
  client: Pick<HttpClient, 'post'> = axios,
): Promise<Profile> {
  const { data } = await client.post<Profile>('/api/v1/profiles', payload)

  return data
}

export async function updateProfile(
  profileId: string,
  payload: ProfileUpdateRequest,
  client: Pick<HttpClient, 'patch'> = axios,
): Promise<Profile> {
  const { data } = await client.patch<Profile>(`/api/v1/profiles/${profileId}`, payload)

  return data
}

export async function deleteProfile(
  profileId: string,
  client: Pick<HttpClient, 'delete'> = axios,
): Promise<void> {
  await client.delete(`/api/v1/profiles/${profileId}`)
}

export async function selectProfile(
  profileId: string,
  client: Pick<HttpClient, 'post'> = axios,
): Promise<ProfileSelectResponse> {
  const { data } = await client.post<ProfileSelectResponse>(`/api/v1/profiles/${profileId}/select`)

  return data
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}
