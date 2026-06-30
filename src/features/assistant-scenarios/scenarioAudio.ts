import type { ScenarioSpeech } from './types'

type ScenarioAudioLike = {
  addEventListener: (event: string, listener: () => void, options?: { once?: boolean }) => void
  removeEventListener: (event: string, listener: () => void) => void
  pause: () => void
  play: () => Promise<void>
}

interface StartScenarioSpeechOptions extends ScenarioSpeech {
  createAudio?: (src: string) => ScenarioAudioLike
  onStart: (speech: ScenarioSpeech) => void
}

export function startScenarioSpeech({
  audioSrc,
  createAudio,
  key,
  onStart,
  role,
  text,
}: StartScenarioSpeechOptions): () => void {
  const speech = { key, role, text, audioSrc }
  let didStart = false
  let disposed = false

  const startText = () => {
    if (didStart || disposed) {
      return
    }

    didStart = true
    onStart(speech)
  }

  if (!audioSrc || typeof window === 'undefined') {
    startText()
    return () => {
      disposed = true
    }
  }

  const audioFactory = createAudio ?? ((src: string) => new Audio(src))
  const audio = audioFactory(audioSrc)
  const onPlaying = () => startText()
  const onError = () => startText()

  audio.addEventListener('playing', onPlaying, { once: true })
  audio.addEventListener('error', onError, { once: true })
  const playResult = audio.play()
  if (playResult && typeof playResult.catch === 'function') {
    playResult.catch(onError)
  } else {
    onError()
  }

  return () => {
    disposed = true
    audio.removeEventListener('playing', onPlaying)
    audio.removeEventListener('error', onError)
    audio.pause()
  }
}
