import axios from 'axios'

interface HttpClient {
  post: typeof axios.post
}

export type VoiceSpeakerRole = 'assistant' | 'user'

export interface VoiceTtsRequest {
  text: string
  speakerRole: VoiceSpeakerRole
  speakerId?: string | null
  profileName?: string | null
  format?: 'mp3' | 'wav'
  volume?: number
  speed?: number
  pitch?: number
}

export type VoiceTtsOptions = Pick<VoiceTtsRequest, 'volume' | 'speed' | 'pitch'>

export async function synthesizeVoice(
  payload: VoiceTtsRequest,
  client: Pick<HttpClient, 'post'> = axios,
  signal?: AbortSignal,
): Promise<Blob> {
  const { data } = await client.post<Blob>('/api/v1/voice/tts', payload, {
    responseType: 'blob',
    ...withSignal(signal),
  })

  return data
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}
