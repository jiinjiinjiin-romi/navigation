import type { CSSProperties } from 'react'

/**
 * Visual assistant states supported by the Navi orb.
 * Keep detailed behavior notes in docs/assistant/orb.md.
 */
export type OrbAssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'error'

/**
 * Color palettes tuned for assistant surfaces in the Navi app.
 */
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
  /** Normalized voice energy from 0 to 1. Takes priority over volume. */
  volume?: number
  /** Preferred alias for voice energy when wiring assistant state. */
  energy?: number
  className?: string
  style?: CSSProperties
}
