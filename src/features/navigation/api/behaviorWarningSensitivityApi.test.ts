import { describe, expect, it, vi } from 'vitest'

import { submitDriveSummary } from './behaviorWarningSensitivityApi'

describe('submitDriveSummary', () => {
  it('posts the mapped manual-risk summary for a profile', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { behaviorWarningSensitivity: { DROWSINESS: 8 } },
    })
    const payload = {
      telemetryEvents: [{ behaviorType: 'DROWSINESS' as const, clickCount: 2, level: 3 }],
    }

    await submitDriveSummary('profile-1', payload, { post } as never)

    expect(post).toHaveBeenCalledWith(
      '/api/v1/profiles/profile-1/behavior-warning-sensitivity/drive-summary',
      payload,
    )
  })
})
