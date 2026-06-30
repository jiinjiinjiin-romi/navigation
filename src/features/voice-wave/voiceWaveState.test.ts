import { describe, expect, it } from 'vitest'
import { getVoiceWaveBars, normalizeWaveEnergy } from './voiceWaveState'

describe('normalizeWaveEnergy', () => {
  it('clamps voice wave energy to a 0..1 range', () => {
    expect(normalizeWaveEnergy(-1)).toBe(0)
    expect(normalizeWaveEnergy(0.42)).toBe(0.42)
    expect(normalizeWaveEnergy(2)).toBe(1)
    expect(normalizeWaveEnergy(Number.NaN)).toBe(0)
  })
})

describe('getVoiceWaveBars', () => {
  it('keeps the wave calm when inactive', () => {
    expect(getVoiceWaveBars({ active: false, energy: 0.9, barCount: 5 })).toEqual([
      { scale: 0.16, opacity: 0.42, delay: 0 },
      { scale: 0.22, opacity: 0.42, delay: 0.06 },
      { scale: 0.18, opacity: 0.42, delay: 0.12 },
      { scale: 0.24, opacity: 0.42, delay: 0.18 },
      { scale: 0.16, opacity: 0.42, delay: 0.24 },
    ])
  })

  it('raises the wave proportionally when active', () => {
    expect(getVoiceWaveBars({ active: true, energy: 0.5, barCount: 5 })).toEqual([
      { scale: 0.34, opacity: 0.72, delay: 0 },
      { scale: 0.52, opacity: 0.76, delay: 0.06 },
      { scale: 0.67, opacity: 0.8, delay: 0.12 },
      { scale: 0.8, opacity: 0.84, delay: 0.18 },
      { scale: 0.46, opacity: 0.88, delay: 0.24 },
    ])
  })
})
