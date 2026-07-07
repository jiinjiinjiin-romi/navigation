import { describe, expect, it, vi } from 'vitest'

import {
  createProfile,
  DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  deleteProfile,
  listProfiles,
  selectProfile,
  updateProfile,
  type ProfileCreateRequest,
} from './profileApi'

const profile = {
  id: 'profile-1',
  displayName: '민준',
  agentCallName: '로디',
  profileImageUrl: null,
  reportEmail: null,
  agentPersonality: 'FRIENDLY',
  warningSensitivity: 'MEDIUM',
  behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  ttsVoiceId: null,
  ttsSpeed: 1,
  guidanceVolume: 70,
  theme: 'SYSTEM',
  lastUsedAt: null,
  createdAt: '2026-07-02T00:00:00.000000Z',
  updatedAt: '2026-07-02T00:00:00.000000Z',
} as const

const createPayload: ProfileCreateRequest = {
  displayName: '새 운전자',
  agentCallName: '로디',
  reportEmail: null,
  agentPersonality: 'FRIENDLY',
  behaviorWarningSensitivity: DEFAULT_BEHAVIOR_WARNING_SENSITIVITY,
  ttsVoiceId: null,
  ttsSpeed: 1,
  guidanceVolume: 70,
}

describe('profileApi', () => {
  it('lists profiles from the backend profile API', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        profiles: [profile],
        count: 1,
        limit: 5,
      },
    })

    const result = await listProfiles({ get })

    expect(get).toHaveBeenCalledWith('/api/v1/profiles', {})
    expect(result.profiles[0]).toEqual(profile)
    expect(result.limit).toBe(5)
  })

  it('creates a profile with camelCase backend fields', async () => {
    const post = vi.fn().mockResolvedValue({ data: profile })

    const result = await createProfile(createPayload, { post })

    expect(post).toHaveBeenCalledWith('/api/v1/profiles', createPayload)
    expect(result).toEqual(profile)
  })

  it('updates a profile with partial settings', async () => {
    const patch = vi.fn().mockResolvedValue({ data: profile })

    await updateProfile('profile-1', { displayName: '수정된 운전자' }, { patch })

    expect(patch).toHaveBeenCalledWith('/api/v1/profiles/profile-1', {
      displayName: '수정된 운전자',
    })
  })

  it('deletes a profile by id', async () => {
    const del = vi.fn().mockResolvedValue({ data: undefined })

    await deleteProfile('profile-1', { delete: del })

    expect(del).toHaveBeenCalledWith('/api/v1/profiles/profile-1')
  })

  it('selects a profile before entering navigation', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        selectedProfileId: 'profile-1',
        selectedAt: '2026-07-02T00:00:00.000000Z',
      },
    })

    const result = await selectProfile('profile-1', { post })

    expect(post).toHaveBeenCalledWith('/api/v1/profiles/profile-1/select')
    expect(result.selectedProfileId).toBe('profile-1')
  })
})
