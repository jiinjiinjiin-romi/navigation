import { MODEL_LAB_FRAME_SIZE } from './modelLabProtocol'

export async function captureModelLabVideoFrame(video: HTMLVideoElement) {
  const started = performance.now()
  const canvas = document.createElement('canvas')
  canvas.width = MODEL_LAB_FRAME_SIZE
  canvas.height = MODEL_LAB_FRAME_SIZE
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is not available.')
  }

  context.drawImage(video, 0, 0, MODEL_LAB_FRAME_SIZE, MODEL_LAB_FRAME_SIZE)
  const payload = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode video frame.'))
        return
      }
      resolve(blob)
    }, 'image/jpeg', 0.82)
  })

  return {
    encodingMs: performance.now() - started,
    payload,
  }
}
