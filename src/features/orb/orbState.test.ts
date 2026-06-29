import { describe, expect, it } from 'vitest'
import { getOrbVisualState, normalizeVoiceLevel } from './orbState'

describe('normalizeVoiceLevel', () => {
  it('clamps analyser values to a 0..1 range', () => {
    expect(normalizeVoiceLevel(-1)).toBe(0)
    expect(normalizeVoiceLevel(0.35)).toBe(0.35)
    expect(normalizeVoiceLevel(2)).toBe(1)
    expect(normalizeVoiceLevel(Number.NaN)).toBe(0)
  })
})

describe('getOrbVisualState', () => {
  it('makes listening state react to user voice level', () => {
    expect(getOrbVisualState('listening', 0.8)).toMatchObject({
      pulse: 0.92,
      glow: 0.88,
      eyeScale: 1.08,
      eyeOffset: 0.22,
      eyeWidth: 1.08,
      eyeHeight: 1.08,
      gazeX: 0,
      faceYaw: 0,
      faceLightClearance: 0,
      motion: 1.1,
      aurora: 0.96,
      scale: 1.14,
      ringScale: 1.32,
      ringOpacity: 0.64,
    })
  })

  it('keeps idle state calm even when voice level is present', () => {
    expect(getOrbVisualState('idle', 0.8)).toMatchObject({
      pulse: 0.2,
      glow: 0.32,
      eyeScale: 1,
      motion: 0.46,
      aurora: 0.62,
      scale: 1,
      ringOpacity: 0.08,
    })
  })

  it('maps each interaction state to a distinct visual mood', () => {
    expect(getOrbVisualState('thinking', 0)).toMatchObject({
      pulse: 0.52,
      glow: 0.62,
      eyeScale: 0.96,
      eyeOffset: 0.14,
      eyeWidth: 0.86,
      gazeX: -0.04,
      gazeY: -0.05,
      faceYaw: -0.16,
      faceLightClearance: 1,
      focus: 0.9,
    })
    expect(getOrbVisualState('speaking', 0)).toMatchObject({
      pulse: 0.74,
      glow: 0.78,
      eyeScale: 1.04,
      eyeHeight: 1.12,
      faceYaw: 0.04,
      ringOpacity: 0.36,
    })
    expect(getOrbVisualState('success', 0)).toMatchObject({
      pulse: 0.9,
      glow: 1,
      eyeScale: 1.08,
      ringOpacity: 0.7,
    })
    expect(getOrbVisualState('error', 0)).toMatchObject({
      pulse: 0.38,
      glow: 0.48,
      eyeScale: 0.9,
      eyeWidth: 0.78,
      faceRoll: 0.04,
      focus: 0.2,
    })
  })
})
