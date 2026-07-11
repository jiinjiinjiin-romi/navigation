import axios from 'axios'

import type { BehaviorWarningSensitivity, ProfileBehaviorType } from './profileApi'

export interface DriveSummaryEvent {
  behaviorType: ProfileBehaviorType
  clickCount: number
  level: number
}

export interface DriveSummaryRequest {
  telemetryEvents: DriveSummaryEvent[]
}

export interface DriveSummaryResponse {
  behaviorWarningSensitivity: BehaviorWarningSensitivity
}

export async function submitDriveSummary(
  profileId: string,
  payload: DriveSummaryRequest,
  client: Pick<typeof axios, 'post'> = axios,
): Promise<DriveSummaryResponse> {
  const { data } = await client.post<DriveSummaryResponse>(
    `/api/v1/profiles/${profileId}/behavior-warning-sensitivity/drive-summary`,
    payload,
  )

  return data
}
