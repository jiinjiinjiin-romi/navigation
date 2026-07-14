import { useCallback, useEffect, useRef, useState } from 'react'

import {
  createDefaultModelLabDetections,
  createModelLabWebSocketUrl,
  createSessionStartMessage,
  getActiveModelLabClassIds,
  MODEL_LAB_TARGET_FPS,
  normalizeModelLabDetections,
  sendFrameMessage,
  type ModelLabDetection,
} from './modelLabProtocol'
import { captureModelLabVideoFrame } from './videoFrameCapture'

type ModelLabState = 'idle' | 'connecting' | 'running' | 'error'

export interface UseModelLabInferenceParams {
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export function useModelLabInference({ videoRef }: UseModelLabInferenceParams) {
  const [activeClassIds, setActiveClassIds] = useState<Set<string>>(new Set())
  const [detections, setDetections] = useState<ModelLabDetection[]>(() => createDefaultModelLabDetections())
  const [droppedFrames, setDroppedFrames] = useState(0)
  const [error, setError] = useState('')
  const [state, setState] = useState<ModelLabState>('idle')
  const frameIndexRef = useRef(0)
  const intervalRef = useRef<number | undefined>(undefined)
  const sessionIdRef = useRef('')
  const socketRef = useRef<WebSocket | null>(null)

  const stop = useCallback(() => {
    if (intervalRef.current !== undefined) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }

    videoRef.current?.pause()

    const socket = socketRef.current
    socketRef.current = null

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'session_end',
        sessionId: sessionIdRef.current,
      }))
      socket.close()
    }

    setState('idle')
  }, [videoRef])

  const sendCurrentFrame = useCallback(async () => {
    const socket = socketRef.current
    const video = videoRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return
    }

    const clientSentAt = performance.now()
    const frameTimeSeconds = Number.isFinite(video.currentTime) ? video.currentTime : 0
    const frameId = `model-lab-frame-${Date.now()}-${frameIndexRef.current++}`
    const frame = await captureModelLabVideoFrame(video)

    sendFrameMessage(socket, {
      clientSentAt,
      encodingMs: frame.encodingMs,
      frameId,
      frameTimeSeconds,
      payload: frame.payload,
      sessionId: sessionIdRef.current,
    })
  }, [videoRef])

  const start = useCallback(() => {
    stop()
    const video = videoRef.current
    video?.pause()
    if (video?.ended) {
      video.currentTime = 0
    }
    setError('')
    setState('connecting')
    frameIndexRef.current = 0
    sessionIdRef.current = `model-lab-${Date.now()}`

    const socket = new WebSocket(createModelLabWebSocketUrl())
    socket.binaryType = 'arraybuffer'
    socketRef.current = socket

    socket.onopen = () => {
      socket.send(JSON.stringify(createSessionStartMessage({
        clientStartedAt: performance.now(),
        sessionId: sessionIdRef.current,
        targetTransmissionFps: MODEL_LAB_TARGET_FPS,
      })))
    }

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return
      }

      const message = JSON.parse(event.data) as {
        detections?: ModelLabDetection[]
        message?: string
        queue?: {
          droppedFrames?: number
        }
        type?: string
      }

      if (message.type === 'session_started') {
        void (async () => {
          const video = videoRef.current
          if (!video) {
            setError('No video is selected for model inference.')
            setState('error')
            return
          }

          try {
            await video.play()
          } catch {
            setError('Video playback failed after model session started.')
            setState('error')
            return
          }

          setState('running')
          void sendCurrentFrame()
          intervalRef.current = window.setInterval(() => {
            void sendCurrentFrame()
          }, 1000 / MODEL_LAB_TARGET_FPS)
        })()
        return
      }

      if (message.type === 'inference_result') {
        const nextDetections = normalizeModelLabDetections(message.detections)
        setDetections(nextDetections)
        setActiveClassIds(getActiveModelLabClassIds(nextDetections))
        setDroppedFrames(message.queue?.droppedFrames ?? 0)
        return
      }

      if (message.type === 'frame_dropped') {
        setDroppedFrames((currentValue) => currentValue + 1)
        return
      }

      if (message.type === 'error') {
        setError(message.message ?? 'Model inference failed.')
        setState('error')
      }
    }

    socket.onerror = () => {
      setError('Model inference connection failed.')
      setState('error')
    }

    socket.onclose = () => {
      if (intervalRef.current !== undefined) {
        window.clearInterval(intervalRef.current)
        intervalRef.current = undefined
      }
      socketRef.current = null
      setState((currentState) => currentState === 'running' || currentState === 'connecting' ? 'idle' : currentState)
    }
  }, [sendCurrentFrame, stop, videoRef])

  useEffect(() => stop, [stop])

  return {
    activeClassIds,
    detections,
    droppedFrames,
    error,
    isAnalyzing: state === 'connecting' || state === 'running',
    start,
    state,
    stop,
  }
}
