import { describe, expect, it } from 'vitest'
import * as OrbCharacterModule from './OrbCharacter'

describe('gill mascot mouth scale', () => {
  it('caps a fully open speaking mouth at the gill reference height', () => {
    const getMouthScaleY = (OrbCharacterModule as Record<string, unknown>).getMouthScaleY

    expect(getMouthScaleY).toBeTypeOf('function')
    expect((getMouthScaleY as (mouthOpen: number) => number)(1)).toBeLessThanOrEqual(0.56)
  })
})

describe('gill mascot idle float', () => {
  it('moves subtly during idle motion and stops for reduced motion', () => {
    const getIdleFloatOffset = (OrbCharacterModule as Record<string, unknown>).getIdleFloatOffset

    expect(getIdleFloatOffset).toBeTypeOf('function')

    const idleOffset = (getIdleFloatOffset as (elapsed: number, reducedMotion: boolean) => number)(Math.PI / 2 / 1.1, false)

    expect(idleOffset).not.toBe(0)
    expect(Math.abs(idleOffset)).toBeLessThanOrEqual(0.09)
    expect((getIdleFloatOffset as (elapsed: number, reducedMotion: boolean) => number)(Math.PI / 2 / 1.1, true)).toBe(0)
  })
})

describe('gill mascot listening lean', () => {
  it('leans toward the screen more as listening energy rises, within the visual limit', () => {
    const getListeningLeanZ = (OrbCharacterModule as Record<string, unknown>).getListeningLeanZ

    expect(getListeningLeanZ).toBeTypeOf('function')

    const atRest = (getListeningLeanZ as (energy: number, reducedMotion: boolean) => number)(0, false)
    const energized = (getListeningLeanZ as (energy: number, reducedMotion: boolean) => number)(1, false)

    expect(atRest).toBeGreaterThan(0)
    expect(energized).toBeGreaterThan(atRest)
    expect(energized).toBeLessThanOrEqual(0.1)
    expect((getListeningLeanZ as (energy: number, reducedMotion: boolean) => number)(1, true)).toBe(0)
  })
})

describe('gill mascot face motion', () => {
  it('uses a deliberately calmer cadence for speaking head motion', () => {
    const cadence = (OrbCharacterModule as Record<string, unknown>).SPEAKING_HEAD_CADENCE

    expect(cadence).toBe(4.4)
  })

  it('gives each assistant state a distinct, bounded whole-head transform', () => {
    const getFaceMotion = (OrbCharacterModule as Record<string, unknown>).getFaceMotion

    expect(getFaceMotion).toBeTypeOf('function')

    const motionAt = (state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'success' | 'error') => (
      (getFaceMotion as (input: {
        state: typeof state
        elapsed: number
        energy: number
        reducedMotion: boolean
      }) => { x: number; y: number; z: number; pitch: number; yaw: number; roll: number; scale: number })({
        state,
        elapsed: 0.9,
        energy: 0.8,
        reducedMotion: false,
      })
    )

    const idle = motionAt('idle')
    const listening = motionAt('listening')
    const thinking = motionAt('thinking')
    const speaking = motionAt('speaking')
    const success = motionAt('success')
    const error = motionAt('error')

    expect(Math.abs(idle.y)).toBeGreaterThan(0.06)
    expect(listening.z).toBeGreaterThan(0.08)
    expect(Math.abs(thinking.yaw)).toBeGreaterThan(0.05)
    expect(Math.abs(speaking.y)).toBeGreaterThan(0.04)
    expect(success.y).toBeGreaterThan(0.06)
    expect(Math.abs(error.x)).toBeGreaterThan(0.045)
    expect(new Set([idle, listening, thinking, speaking, success, error].map((motion) => `${motion.x}:${motion.y}:${motion.z}:${motion.pitch}:${motion.yaw}:${motion.roll}:${motion.scale}`)).size).toBe(6)

    for (const motion of [idle, listening, thinking, speaking, success, error]) {
      expect(Math.abs(motion.x)).toBeLessThanOrEqual(0.12)
      expect(Math.abs(motion.y)).toBeLessThanOrEqual(0.14)
      expect(Math.abs(motion.z)).toBeLessThanOrEqual(0.14)
      expect(Math.abs(motion.pitch)).toBeLessThanOrEqual(0.14)
      expect(Math.abs(motion.yaw)).toBeLessThanOrEqual(0.16)
      expect(Math.abs(motion.roll)).toBeLessThanOrEqual(0.14)
      expect(motion.scale).toBeGreaterThanOrEqual(0.96)
      expect(motion.scale).toBeLessThanOrEqual(1.08)
    }
  })

  it('neutralizes every animated whole-head transform for reduced motion', () => {
    const getFaceMotion = (OrbCharacterModule as Record<string, unknown>).getFaceMotion as (input: {
      state: 'idle' | 'listening' | 'thinking' | 'speaking' | 'success' | 'error'
      elapsed: number
      energy: number
      reducedMotion: boolean
    }) => { x: number; y: number; z: number; pitch: number; yaw: number; roll: number; scale: number }

    for (const state of ['idle', 'listening', 'thinking', 'speaking', 'success', 'error'] as const) {
      expect(getFaceMotion({ state, elapsed: 0.9, energy: 0.8, reducedMotion: true })).toEqual({
        x: 0,
        y: 0,
        z: 0,
        pitch: 0,
        yaw: 0,
        roll: 0,
        scale: 1,
      })
    }
  })
})
