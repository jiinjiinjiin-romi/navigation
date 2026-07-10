import { describe, expect, it, vi } from 'vitest'

import { synthesizeVoice } from './voiceApi'

describe('synthesizeVoice', () => {
  it('posts TTS request to backend proxy as a blob request', async () => {
    const audio = new Blob(['audio'], { type: 'audio/mpeg' })
    const post = vi.fn().mockResolvedValue({ data: audio })

    const result = await synthesizeVoice(
      {
        text: '안녕하세요.',
        speakerRole: 'assistant',
        speakerId: 'nes_c_hyeri',
        profileName: '지우',
        speed: 4,
        pitch: 2,
        volume: 0,
      },
      { post },
    )

    expect(post).toHaveBeenCalledWith(
      '/api/v1/voice/tts',
      {
        text: '안녕하세요.',
        speakerRole: 'assistant',
        speakerId: 'nes_c_hyeri',
        profileName: '지우',
        speed: 4,
        pitch: 2,
        volume: 0,
      },
      { responseType: 'blob' },
    )
    expect(result).toBe(audio)
  })
})
