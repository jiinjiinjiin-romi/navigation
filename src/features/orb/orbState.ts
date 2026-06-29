import type { OrbAssistantState, OrbVisualState } from './types'

export function normalizeVoiceLevel(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function getOrbVisualState(
  state: OrbAssistantState,
  volume: number,
): OrbVisualState {
  const level = normalizeVoiceLevel(volume)

  if (state === 'listening') {
    return {
      pulse: Number((0.2 + level * 0.9).toFixed(2)),
      glow: Number((0.32 + level * 0.7).toFixed(2)),
      eyeScale: Number((1 + level * 0.1).toFixed(2)),
      eyeOffset: 0.22,
      eyeWidth: 1.08,
      eyeHeight: 1.08,
      eyeTilt: 0,
      gazeX: 0,
      gazeY: 0.02,
      faceYaw: 0,
      facePitch: -0.02,
      faceRoll: 0,
      faceLightClearance: 0,
      motion: Number((0.54 + level * 0.7).toFixed(2)),
      aurora: Number((0.64 + level * 0.4).toFixed(2)),
      scale: Number((1 + level * 0.18).toFixed(2)),
      ringScale: Number((1 + level * 0.4).toFixed(2)),
      ringOpacity: Number((0.16 + level * 0.6).toFixed(2)),
      focus: 0.35,
    }
  }

  if (state === 'speaking') {
    return {
      pulse: Number((0.74 + level * 0.24).toFixed(2)),
      glow: Number((0.78 + level * 0.22).toFixed(2)),
      eyeScale: 1.04,
      eyeOffset: 0.19,
      eyeWidth: 1.02,
      eyeHeight: 1.12,
      eyeTilt: 0.02,
      gazeX: 0.01,
      gazeY: 0.01,
      faceYaw: 0.04,
      facePitch: -0.01,
      faceRoll: 0,
      faceLightClearance: 0,
      motion: 0.95,
      aurora: 0.86,
      scale: Number((1 + level * 0.14).toFixed(2)),
      ringScale: Number((1.08 + level * 0.22).toFixed(2)),
      ringOpacity: Number((0.36 + level * 0.28).toFixed(2)),
      focus: 0.5,
    }
  }

  if (state === 'thinking') {
    return {
      pulse: 0.52,
      glow: 0.62,
      eyeScale: 0.96,
      eyeOffset: 0.14,
      eyeWidth: 0.86,
      eyeHeight: 0.88,
      eyeTilt: -0.08,
      gazeX: -0.04,
      gazeY: -0.05,
      faceYaw: -0.16,
      facePitch: 0.08,
      faceRoll: -0.04,
      faceLightClearance: 1,
      motion: 0.74,
      aurora: 0.78,
      scale: 0.99,
      ringScale: 1.06,
      ringOpacity: 0.26,
      focus: 0.9,
    }
  }

  if (state === 'success') {
    return {
      pulse: 0.9,
      glow: 1,
      eyeScale: 1.08,
      eyeOffset: 0.2,
      eyeWidth: 1.12,
      eyeHeight: 1.12,
      eyeTilt: 0,
      gazeX: 0,
      gazeY: 0.02,
      faceYaw: 0,
      facePitch: -0.03,
      faceRoll: 0,
      faceLightClearance: 0.2,
      motion: 0.72,
      aurora: 1,
      scale: 1.06,
      ringScale: 1.42,
      ringOpacity: 0.7,
      focus: 0.45,
    }
  }

  if (state === 'error') {
    return {
      pulse: 0.38,
      glow: 0.48,
      eyeScale: 0.9,
      eyeOffset: 0.16,
      eyeWidth: 0.78,
      eyeHeight: 0.78,
      eyeTilt: 0.05,
      gazeX: 0,
      gazeY: -0.03,
      faceYaw: 0.06,
      facePitch: 0.04,
      faceRoll: 0.04,
      faceLightClearance: 0.35,
      motion: 0.58,
      aurora: 0.52,
      scale: 0.96,
      ringScale: 0.92,
      ringOpacity: 0.32,
      focus: 0.2,
    }
  }

  return {
    pulse: 0.2,
    glow: 0.32,
    eyeScale: 1,
    eyeOffset: 0.18,
    eyeWidth: 1,
    eyeHeight: 1,
    eyeTilt: 0,
    gazeX: 0,
    gazeY: 0,
    faceYaw: 0,
    facePitch: 0,
    faceRoll: 0,
    faceLightClearance: 0,
    motion: 0.46,
    aurora: 0.62,
    scale: 1,
    ringScale: 1,
    ringOpacity: 0.08,
    focus: 0.42,
  }
}
