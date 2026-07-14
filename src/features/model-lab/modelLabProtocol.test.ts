import { describe, expect, it, vi } from 'vitest'

import {
  createFrameMetaMessage,
  createModelLabWebSocketUrl,
  createSessionStartMessage,
  getActiveModelLabClassIds,
  normalizeModelLabDetections,
  sendFrameMessage,
} from './modelLabProtocol'

describe('modelLabProtocol', () => {
  it('builds a v7-fast websocket URL from the browser origin', () => {
    expect(createModelLabWebSocketUrl('http://localhost:8181')).toBe('ws://localhost:8181/api/model/v7-fast/inference/stream')
    expect(createModelLabWebSocketUrl('https://roadie.example')).toBe('wss://roadie.example/api/model/v7-fast/inference/stream')
  })

  it('creates session_start and frame_meta messages for the v7-fast protocol', () => {
    expect(createSessionStartMessage({
      clientStartedAt: 12.5,
      sessionId: 'session-1',
      targetTransmissionFps: 4,
    })).toEqual({
      type: 'session_start',
      sessionId: 'session-1',
      clientStartedAt: 12.5,
      targetTransmissionFps: 4,
      transport: 'websocket',
    })

    expect(createFrameMetaMessage({
      clientSentAt: 20,
      encodingMs: 3,
      frameId: 'frame-1',
      frameTimeSeconds: 1.25,
      sessionId: 'session-1',
    })).toEqual({
      type: 'frame_meta',
      sessionId: 'session-1',
      frameId: 'frame-1',
      clientSentAt: '20',
      contentType: 'image/jpeg',
      width: 224,
      height: 224,
      encodingMs: 3,
      frameTimeSeconds: 1.25,
    })
  })

  it('sends frame metadata before the binary jpeg payload', () => {
    const socket = { send: vi.fn(), readyState: WebSocket.OPEN } as Pick<WebSocket, 'readyState' | 'send'>
    const payload = new Blob(['jpeg'], { type: 'image/jpeg' })

    sendFrameMessage(socket, {
      clientSentAt: 20,
      encodingMs: 3,
      frameId: 'frame-1',
      frameTimeSeconds: 1.25,
      payload,
      sessionId: 'session-1',
    })

    expect(socket.send).toHaveBeenNthCalledWith(1, JSON.stringify({
      type: 'frame_meta',
      sessionId: 'session-1',
      frameId: 'frame-1',
      clientSentAt: '20',
      contentType: 'image/jpeg',
      width: 224,
      height: 224,
      encodingMs: 3,
      frameTimeSeconds: 1.25,
    }))
    expect(socket.send).toHaveBeenNthCalledWith(2, payload)
  })

  it('activates only classes that meet the score threshold', () => {
    expect(getActiveModelLabClassIds([
      { variableName: 'class_0', score: 0 },
      { variableName: 'class_1', score: 0.49 },
      { variableName: 'class_2', score: 0.5 },
      { variableName: 'class_3', score: 0.8 },
    ])).toEqual(new Set(['class_2', 'class_3']))
  })

  it('normalizes model detections to the 5-class ViT labels', () => {
    expect(normalizeModelLabDetections([
      { variableName: 'safe_driving', score: 0.95 },
      { classId: '1', score: 0.12 },
      { displayName: 'phone_usage', score: 0.87 },
      { variableName: 'class_3', score: 0.2 },
      { variableName: 'eating_smoking', score: 0.44 },
    ])).toEqual([
      { classId: '0', displayName: '정상', score: 0.95, variableName: 'class_0' },
      { classId: '1', displayName: '기기조작', score: 0.12, variableName: 'class_1' },
      { classId: '2', displayName: '핸드폰', score: 0.87, variableName: 'class_2' },
      { classId: '3', displayName: '졸음', score: 0.2, variableName: 'class_3' },
      { classId: '4', displayName: '섭취', score: 0.44, variableName: 'class_4' },
    ])
  })
})
