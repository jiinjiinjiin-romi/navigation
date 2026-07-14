import { act, renderHook, waitFor } from '@testing-library/react'
import type { RefObject } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useModelLabInference } from './useModelLabInference'

vi.mock('./videoFrameCapture', () => ({
  captureModelLabVideoFrame: vi.fn(async () => ({
    encodingMs: 1,
    payload: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })),
}))

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  binaryType: BinaryType = 'blob'
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = FakeWebSocket.CONNECTING
  sent: unknown[] = []

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  receive(payload: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }

  send(payload: unknown) {
    this.sent.push(payload)
  }
}

describe('useModelLabInference', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  it('starts video playback only after the model WebSocket session is ready', async () => {
    const video = {
      currentTime: 0,
      ended: false,
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
      readyState: HTMLMediaElement.HAVE_CURRENT_DATA,
    } as unknown as HTMLVideoElement
    const videoRef = { current: video } as RefObject<HTMLVideoElement>

    const { result } = renderHook(() => useModelLabInference({ videoRef }))

    act(() => {
      result.current.start()
    })

    expect(video.pause).toHaveBeenCalled()
    expect(video.play).not.toHaveBeenCalled()
    expect(result.current.state).toBe('connecting')

    const socket = FakeWebSocket.instances[0]
    act(() => {
      socket.open()
    })

    expect(video.play).not.toHaveBeenCalled()

    await act(async () => {
      socket.receive({ type: 'session_started' })
    })

    await waitFor(() => {
      expect(video.play).toHaveBeenCalledTimes(1)
      expect(result.current.state).toBe('running')
    })
    expect(socket.sent).toHaveLength(3)
  })
})
