import type { CSSProperties } from 'react'

export type OrbAssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error'

export type OrbColorTheme = 'aurora' | 'ocean' | 'violet' | 'daylight'

export interface OrbVisualState {
  pulse: number
  glow: number
  eyeScale: number
  eyeOffset: number
  eyeWidth: number
  eyeHeight: number
  eyeTilt: number
  gazeX: number
  gazeY: number
  faceYaw: number
  facePitch: number
  faceRoll: number
  faceLightClearance: number
  motion: number
  aurora: number
  scale: number
  ringScale: number
  ringOpacity: number
  focus: number
}

export interface OrbSceneProps {
  state: OrbAssistantState
  volume: number
  size?: number | string
  colorTheme?: OrbColorTheme
  reducedMotion?: boolean
}

export interface VoiceOrbProps extends Omit<OrbSceneProps, 'volume'> {
  volume?: number
  energy?: number
  className?: string
  style?: CSSProperties
}
