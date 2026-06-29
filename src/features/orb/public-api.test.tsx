import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceOrb } from './index'

vi.mock('./OrbScene', () => ({
  OrbScene: ({ volume }: { volume: number }) => createElement('div', {
    'data-testid': 'orb-scene',
    'data-volume': volume,
  }),
}))

describe('orb assistant public API', () => {
  it('exports a reusable VoiceOrb component with an energy prop', async () => {
    render(<VoiceOrb state="speaking" energy={0.72} size={180} colorTheme="daylight" />)

    expect(await screen.findByTestId('orb-scene')).toHaveAttribute('data-volume', '0.72')
    expect(screen.getByLabelText('AI voice assistant orb')).toHaveStyle({
      width: '180px',
      height: '180px',
    })
    expect(screen.getByLabelText('AI voice assistant orb')).toHaveAttribute('data-color-theme', 'daylight')
  })
})
