import axios from 'axios'

interface HttpClient {
  delete: typeof axios.delete
  get: typeof axios.get
  patch: typeof axios.patch
  post: typeof axios.post
}

export type AgentPersonality = 'FRIENDLY' | 'FORMAL' | 'WARM' | 'WITTY'
export type TtsVoiceId = 'jinho' | 'nes_c_kihyo' | 'nes_c_hyeri' | 'nara' | 'ngyeongjun'
export type WarningSensitivity = 'LOW' | 'MEDIUM' | 'HIGH'
export type ProfileTheme = 'LIGHT' | 'DARK' | 'SYSTEM'
export type BehaviorWarningSensitivityValue = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type ProfileBehaviorType =
  | 'DROWSINESS'
  | 'PHONE_USE'
  | 'FOOD_OR_DRINK'
  | 'GAZE_AWAY'
  | 'SECONDARY_TASK'
  | 'REACHING_BEHIND'
  | 'SMOKING'
export type BehaviorWarningSensitivity = Record<ProfileBehaviorType, BehaviorWarningSensitivityValue>

export const DEFAULT_BEHAVIOR_WARNING_SENSITIVITY: BehaviorWarningSensitivity = {
  DROWSINESS: 9,
  PHONE_USE: 9,
  FOOD_OR_DRINK: 7,
  GAZE_AWAY: 9,
  SECONDARY_TASK: 7,
  REACHING_BEHIND: 7,
  SMOKING: 7,
}

export const TTS_VOICE_OPTIONS: Array<[TtsVoiceId, string]> = [
  ['jinho', '지호'],
  ['nes_c_kihyo', '기효'],
  ['nes_c_hyeri', '혜리'],
  ['nara', '아라'],
  ['ngyeongjun', '경준'],
]

export interface Profile {
  id: string
  displayName: string
  agentCallName: string
  profileImageUrl: string | null
  reportEmail: string | null
  agentPersonality: AgentPersonality
  warningSensitivity: WarningSensitivity
  behaviorWarningSensitivity: BehaviorWarningSensitivity
  ttsVoiceId: string | null
  ttsSpeed: number
  guidanceVolume: number
  theme: ProfileTheme
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ProfileSummary {
  id: string
  displayName: string
  agentCallName: string
  profileImageUrl: string | null
  agentPersonality: AgentPersonality
  warningSensitivity: WarningSensitivity
  behaviorWarningSensitivity: BehaviorWarningSensitivity
  ttsVoiceId: string | null
  lastUsedAt: string | null
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
  behaviorWarningSensitivity: BehaviorWarningSensitivity
  ttsVoiceId: string | null
  ttsSpeed: number
  guidanceVolume: number
}

export type ProfileUpdateRequest = Partial<ProfileCreateRequest>

export interface ProfileSelectResponse {
  selectedProfileId: string
  selectedAt: string
}

export const DEFAULT_PROFILE_CREATE_REQUEST: ProfileCreateRequest = {
  displayName: '새 운전자',
  agentCallName: '로디',
  reportEmail: null,
  agentPersonality: 'FRIENDLY',
  behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  ttsVoiceId: 'nara',
  ttsSpeed: 1,
  guidanceVolume: 70,
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
