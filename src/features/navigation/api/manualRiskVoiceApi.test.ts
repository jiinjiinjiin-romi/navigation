import { describe, expect, it, vi } from 'vitest'

import { matchManualRiskVoice, transcribeManualRiskVoice } from './manualRiskVoiceApi'

describe('manual risk voice API', () => {
  it('uploads a recording for transcription', async () => {
    const post = vi.fn().mockResolvedValue({ data: { transcript: '창문 열어줘' } })
    const result = await transcribeManualRiskVoice(new Blob(['audio']), { post })

    expect(post).toHaveBeenCalledWith('/api/v1/manual-risk/voice/transcriptions', expect.any(FormData))
    expect(result).toBe('창문 열어줘')
  })

  it('sends the transcript and visible options for matching', async () => {
    const post = vi.fn().mockResolvedValue({ data: { optionId: 'drowsiness-window' } })
    const options = [{ id: 'drowsiness-window', label: '창문 조금만 열어줘.' }]

    await expect(matchManualRiskVoice('창문 열어줘', options, { post })).resolves.toBe('drowsiness-window')
    expect(post).toHaveBeenCalledWith('/api/v1/manual-risk/voice/matches', { transcript: '창문 열어줘', options })
  })

  it('forwards a cancellation signal to the backend request', async () => {
    const post = vi.fn().mockResolvedValue({ data: { transcript: '창문 열어줘' } })
    const controller = new AbortController()

    await transcribeManualRiskVoice(new Blob(['audio']), { post }, controller.signal)

    expect(post).toHaveBeenCalledWith(
      '/api/v1/manual-risk/voice/transcriptions',
      expect.any(FormData),
      { signal: controller.signal },
    )
  })
})
