import type { VoiceWaveBar, VoiceWaveStateOptions } from './types'

const ACTIVE_PATTERN = [0.36, 0.6, 0.98, 1.12, 0.6, 0.84, 0.48, 0.72, 0.4]
const CALM_PATTERN = [0.16, 0.22, 0.18, 0.24, 0.16, 0.2, 0.14, 0.22, 0.18]
const BAR_DELAY_SECONDS = 0.06

export function normalizeWaveEnergy(value = 0): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function getVoiceWaveBars({
  active,
  energy = 0,
  barCount = 9,
}: VoiceWaveStateOptions): VoiceWaveBar[] {
  const level = normalizeWaveEnergy(energy)
  const count = Math.max(1, Math.floor(barCount))

  return Array.from({ length: count }, (_, index) => {
    const calmScale = CALM_PATTERN[index % CALM_PATTERN.length]

    if (!active) {
      return {
        scale: calmScale,
        opacity: 0.42,
        delay: Number((index * BAR_DELAY_SECONDS).toFixed(2)),
      }
    }

    return {
      scale: Number((calmScale + ACTIVE_PATTERN[index % ACTIVE_PATTERN.length] * level).toFixed(2)),
      opacity: Number((0.68 + (index % 5) * 0.04 + level * 0.08).toFixed(2)),
      delay: Number((index * BAR_DELAY_SECONDS).toFixed(2)),
    }
  })
}
