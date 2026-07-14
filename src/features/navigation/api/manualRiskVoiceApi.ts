import axios from 'axios'

interface HttpClient {
  post: typeof axios.post
}

export interface ManualRiskVoiceOption {
  id: string
  label: string
}

export async function transcribeManualRiskVoice(
  audio: Blob,
  client: Pick<HttpClient, 'post'> = axios,
  signal?: AbortSignal,
): Promise<string> {
  const formData = new FormData()
  formData.append('audio', audio, 'manual-risk.webm')
  const { data } = signal
    ? await client.post<{ transcript: string }>('/api/v1/manual-risk/voice/transcriptions', formData, { signal })
    : await client.post<{ transcript: string }>('/api/v1/manual-risk/voice/transcriptions', formData)

  return data.transcript.trim()
}

export async function matchManualRiskVoice(
  transcript: string,
  options: ManualRiskVoiceOption[],
  client: Pick<HttpClient, 'post'> = axios,
  signal?: AbortSignal,
): Promise<string | null> {
  const { data } = signal
    ? await client.post<{ optionId: string | null }>('/api/v1/manual-risk/voice/matches', { transcript, options }, { signal })
    : await client.post<{ optionId: string | null }>('/api/v1/manual-risk/voice/matches', { transcript, options })

  return data.optionId
}
