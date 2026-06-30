import { describe, expect, it, vi } from 'vitest'
import { startScenarioSpeech } from './scenarioAudio'

class TestAudio {
  listeners = new Map<string, Array<() => void>>()
  paused = false
  play = vi.fn(() => Promise.resolve())

  constructor(public src: string) {}

  addEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  removeEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? []
    this.listeners.set(event, listeners.filter((item) => item !== listener))
  }

  pause() {
    this.paused = true
  }

  emit(event: string) {
    this.listeners.get(event)?.forEach((listener) => listener())
  }
}

describe('startScenarioSpeech', () => {
  it('starts text animation when audio starts playing', async () => {
    const audio = new TestAudio('/audio/tts/agent/example.mp3')
    const onStart = vi.fn()

    startScenarioSpeech({
      audioSrc: audio.src,
      createAudio: () => audio,
      key: 'scenario-1-agent:hello',
      onStart,
      role: 'agent',
      text: 'hello',
    })

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()

    audio.emit('playing')

    expect(onStart).toHaveBeenCalledWith({
      key: 'scenario-1-agent:hello',
      role: 'agent',
      text: 'hello',
      audioSrc: '/audio/tts/agent/example.mp3',
    })
  })

  it('falls back to text animation when audio cannot play', async () => {
    const audio = new TestAudio('/audio/tts/agent/example.mp3')
    audio.play = vi.fn(() => Promise.reject(new Error('blocked')))
    const onStart = vi.fn()

    startScenarioSpeech({
      audioSrc: audio.src,
      createAudio: () => audio,
      key: 'scenario-1-agent:hello',
      onStart,
      role: 'agent',
      text: 'hello',
    })

    await Promise.resolve()

    expect(onStart).toHaveBeenCalledWith({
      key: 'scenario-1-agent:hello',
      role: 'agent',
      text: 'hello',
      audioSrc: '/audio/tts/agent/example.mp3',
    })
  })

  it('pauses current audio when cleanup runs', () => {
    const audio = new TestAudio('/audio/tts/agent/example.mp3')

    const cleanup = startScenarioSpeech({
      audioSrc: audio.src,
      createAudio: () => audio,
      key: 'scenario-1-agent:hello',
      onStart: vi.fn(),
      role: 'agent',
      text: 'hello',
    })

    cleanup()

    expect(audio.paused).toBe(true)
  })
})
