import type { CSSProperties } from 'react'

export type VoiceWaveColorTheme = 'aurora' | 'ocean' | 'violet' | 'daylight'

export interface VoiceWaveBar {
  scale: number
  opacity: number
  delay: number
}

export interface VoiceWaveStateOptions {
  active: boolean
  energy?: number
  barCount?: number
}

export interface VoiceWaveProps extends VoiceWaveStateOptions {
  colorTheme?: VoiceWaveColorTheme
  reducedMotion?: boolean
  className?: string
  style?: CSSProperties
}
