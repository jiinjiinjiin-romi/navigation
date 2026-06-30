import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VoiceWave } from './index'

describe('voice wave public API', () => {
  it('exports a reusable VoiceWave component for calm and speaking states', () => {
    render(<VoiceWave active energy={0.72} colorTheme="daylight" reducedMotion />)

    const wave = screen.getByLabelText('AI voice activity')
    expect(wave).toHaveAttribute('data-active', 'true')
    expect(wave).toHaveAttribute('data-color-theme', 'daylight')
    expect(screen.getAllByTestId('voice-wave-bar')).toHaveLength(9)
  })
})
