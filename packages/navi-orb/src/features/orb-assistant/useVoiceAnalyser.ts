import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizeVoiceLevel } from './orbState'

interface VoiceAnalyserState {
  isListening: boolean
  voiceLevel: number
  error: string | null
  start: () => Promise<void>
  stop: () => void
}

export function useVoiceAnalyser(): VoiceAnalyserState {
  const [isListening, setIsListening] = useState(false)
  const [voiceLevel, setVoiceLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    void audioContextRef.current?.close()
    audioContextRef.current = null

    setIsListening(false)
    setVoiceLevel(0)
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone input is not supported in this browser.')
      return
    }

    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      const samples = new Uint8Array(analyser.frequencyBinCount)

      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.82
      source.connect(analyser)

      streamRef.current = stream
      audioContextRef.current = audioContext
      setIsListening(true)

      const tick = () => {
        analyser.getByteFrequencyData(samples)
        let sum = 0

        for (const sample of samples) {
          sum += sample
        }

        setVoiceLevel(normalizeVoiceLevel(sum / samples.length / 150))
        frameRef.current = requestAnimationFrame(tick)
      }

      tick()
    } catch {
      stop()
      setError('Microphone permission was denied.')
    }
  }, [stop])

  useEffect(() => stop, [stop])

  return { isListening, voiceLevel, error, start, stop }
}
