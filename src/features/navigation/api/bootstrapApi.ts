import axios from 'axios'

import type { ProfileSummary } from './profileApi'

interface HttpClient {
  get: typeof axios.get
}

export interface BootstrapAccount {
  id: string
  displayName: string
  email: string | null
}

export interface BootstrapCapabilities {
  vitModelAvailable: boolean
  geminiAvailable: boolean
  emailAvailable: boolean
  demoMode: boolean
}

export interface BootstrapResponse {
  account: BootstrapAccount
  profiles: ProfileSummary[]
  selectedProfileId: string | null
  profileLimit: number
  capabilities: BootstrapCapabilities
}

export async function getBootstrap(
  client: Pick<HttpClient, 'get'> = axios,
  signal?: AbortSignal,
): Promise<BootstrapResponse> {
  const { data } = await client.get<BootstrapResponse>('/api/v1/bootstrap', {
    ...withSignal(signal),
  })

  return data
}

function withSignal(signal?: AbortSignal) {
  return signal ? { signal } : {}
}
