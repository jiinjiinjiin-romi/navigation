export const MODEL_LAB_FRAME_SIZE = 224
export const MODEL_LAB_DEFAULT_CLASS_COUNT = 5
export const MODEL_LAB_DEFAULT_THRESHOLD = 0.5
export const MODEL_LAB_TARGET_FPS = 4

export interface ModelLabSessionStartInput {
  clientStartedAt: number
  sessionId: string
  targetTransmissionFps: number
}

export interface ModelLabFrameMetaInput {
  clientSentAt: number
  encodingMs: number
  frameId: string
  frameTimeSeconds: number
  sessionId: string
}

export interface ModelLabFrameMessageInput extends ModelLabFrameMetaInput {
  payload: Blob
}

export interface ModelLabDetection {
  classId?: string
  displayName?: string
  score: number
  variableName?: string
}

export function createModelLabWebSocketUrl(origin = window.location.origin) {
  const url = new URL(origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/api/model/v7-fast/inference/stream'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createSessionStartMessage(input: ModelLabSessionStartInput) {
  return {
    type: 'session_start',
    sessionId: input.sessionId,
    clientStartedAt: input.clientStartedAt,
    targetTransmissionFps: input.targetTransmissionFps,
    transport: 'websocket',
  }
}

export function createFrameMetaMessage(input: ModelLabFrameMetaInput) {
  return {
    type: 'frame_meta',
    sessionId: input.sessionId,
    frameId: input.frameId,
    clientSentAt: String(input.clientSentAt),
    contentType: 'image/jpeg',
    width: MODEL_LAB_FRAME_SIZE,
    height: MODEL_LAB_FRAME_SIZE,
    encodingMs: input.encodingMs,
    frameTimeSeconds: input.frameTimeSeconds,
  }
}

export function sendFrameMessage(socket: Pick<WebSocket, 'readyState' | 'send'>, input: ModelLabFrameMessageInput) {
  if (socket.readyState !== WebSocket.OPEN) {
    throw new Error('Model lab WebSocket is not open.')
  }

  socket.send(JSON.stringify(createFrameMetaMessage(input)))
  socket.send(input.payload)
}

export function createDefaultModelLabDetections(count = MODEL_LAB_DEFAULT_CLASS_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    classId: `class_${index}`,
    displayName: `class_${index}`,
    score: 0,
    variableName: `class_${index}`,
  }))
}

export function normalizeModelLabDetections(detections: ModelLabDetection[] | undefined) {
  const defaults = createDefaultModelLabDetections()
  const byId = new Map(
    detections?.map((detection, index) => {
      const classId = detection.variableName ?? detection.classId ?? `class_${index}`
      return [classId, {
        classId,
        displayName: detection.displayName ?? classId,
        score: Number.isFinite(detection.score) ? detection.score : 0,
        variableName: classId,
      }]
    }) ?? [],
  )

  return defaults.map((fallback, index) => {
    const byFallback = byId.get(fallback.variableName)
    if (byFallback) {
      return byFallback
    }
    return detections?.[index]
      ? {
          classId: detections[index].classId ?? fallback.classId,
          displayName: detections[index].displayName ?? fallback.displayName,
          score: Number.isFinite(detections[index].score) ? detections[index].score : 0,
          variableName: detections[index].variableName ?? detections[index].classId ?? fallback.variableName,
        }
      : fallback
  })
}

export function getActiveModelLabClassIds(detections: ModelLabDetection[], threshold = MODEL_LAB_DEFAULT_THRESHOLD) {
  return new Set(detections.flatMap((detection) => {
    const classId = detection.variableName ?? detection.classId
    if (!classId) {
      return []
    }

    return detection.score >= threshold ? [classId] : []
  }))
}
