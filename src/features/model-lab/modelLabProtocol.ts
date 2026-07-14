export const MODEL_LAB_FRAME_SIZE = 224
export const MODEL_LAB_DEFAULT_CLASS_COUNT = 5
export const MODEL_LAB_DEFAULT_THRESHOLD = 0.5
export const MODEL_LAB_TARGET_FPS = 4
export const MODEL_LAB_CLASSES = [
  {
    classId: '0',
    displayName: '정상',
    aliases: ['0', 'class_0', 'safe_driving'],
  },
  {
    classId: '1',
    displayName: '기기조작',
    aliases: ['1', 'class_1', 'device_operation'],
  },
  {
    classId: '2',
    displayName: '핸드폰',
    aliases: ['2', 'class_2', 'phone_usage'],
  },
  {
    classId: '3',
    displayName: '졸음',
    aliases: ['3', 'class_3', 'fatigue'],
  },
  {
    classId: '4',
    displayName: '섭취',
    aliases: ['4', 'class_4', 'eating_smoking'],
  },
] as const

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
  return MODEL_LAB_CLASSES.slice(0, count).map((metadata, index) => ({
    classId: metadata.classId,
    displayName: metadata.displayName,
    score: 0,
    variableName: `class_${index}`,
  }))
}

export function normalizeModelLabDetections(detections: ModelLabDetection[] | undefined) {
  const defaults = createDefaultModelLabDetections()
  const byId = new Map(
    detections?.map((detection, index) => {
      const metadata = resolveModelLabClassMetadata(detection, index)
      return [metadata.variableName, {
        classId: metadata.classId,
        displayName: metadata.displayName,
        score: Number.isFinite(detection.score) ? detection.score : 0,
        variableName: metadata.variableName,
      }]
    }) ?? [],
  )

  return defaults.map((fallback, index) => {
    const byFallback = byId.get(fallback.variableName)
    if (byFallback) {
      return byFallback
    }
    return detections?.[index]
      ? normalizeModelLabDetection(detections[index], index)
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

function normalizeModelLabDetection(detection: ModelLabDetection, index: number) {
  const metadata = resolveModelLabClassMetadata(detection, index)

  return {
    classId: metadata.classId,
    displayName: metadata.displayName,
    score: Number.isFinite(detection.score) ? detection.score : 0,
    variableName: metadata.variableName,
  }
}

function resolveModelLabClassMetadata(detection: ModelLabDetection, index: number) {
  const identifiers = [detection.variableName, detection.classId, detection.displayName]
    .filter((identifier): identifier is string => Boolean(identifier))
  const matchedIndex = MODEL_LAB_CLASSES.findIndex((metadata) => (
    identifiers.some((identifier) => (metadata.aliases as readonly string[]).includes(identifier))
  ))
  const classIndex = matchedIndex >= 0 ? matchedIndex : index
  const metadata = MODEL_LAB_CLASSES[classIndex] ?? MODEL_LAB_CLASSES[0]

  return {
    classId: metadata.classId,
    displayName: metadata.displayName,
    variableName: `class_${classIndex}`,
  }
}
