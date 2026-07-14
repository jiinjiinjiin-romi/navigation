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
    expect(Math.abs(idleOffset)).toBeLessThanOrEqual(0.06)
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
