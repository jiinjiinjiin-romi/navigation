import { describe, expect, it } from 'vitest'

import { getSimulationDurationMs } from './simulationTiming'

describe('getSimulationDurationMs', () => {
  it('keeps route simulation close to a steady driving speed instead of a fast preview', () => {
    expect(getSimulationDurationMs(60, 500)).toBe(60_000)
    expect(getSimulationDurationMs(1_200, 12_500)).toBe(1_000_000)
  })
})
