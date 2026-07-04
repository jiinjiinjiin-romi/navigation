import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_BEHAVIOR_WARNING_SENSITIVITY } from './profileApi'
import { getBootstrap } from './bootstrapApi'

const bootstrapResponse = {
  account: {
    id: 'account-1',
    displayName: '안정현',
    email: 'admin@example.com',
  },
  profiles: [
    {
      id: 'profile-1',
      displayName: '민준',
      agentCallName: '나비',
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
    },
  ],
  selectedProfileId: 'profile-1',
  profileLimit: 5,
  capabilities: {
    vitModelAvailable: true,
    geminiAvailable: false,
    emailAvailable: true,
    demoMode: true,
  },
} as const

describe('bootstrapApi', () => {
  it('loads account and initial navigation state from bootstrap API', async () => {
    const get = vi.fn().mockResolvedValue({ data: bootstrapResponse })

    const result = await getBootstrap({ get })

    expect(get).toHaveBeenCalledWith('/api/v1/bootstrap', {})
    expect(result.account.displayName).toBe('안정현')
    expect(result.profiles[0].id).toBe('profile-1')
    expect(result.selectedProfileId).toBe('profile-1')
    expect(result.profileLimit).toBe(5)
  })
})
