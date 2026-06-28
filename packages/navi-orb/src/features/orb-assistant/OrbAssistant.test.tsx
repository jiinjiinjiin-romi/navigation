import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrbAssistant } from './OrbAssistant'

vi.mock('./VoiceOrb', () => ({
  VoiceOrb: ({ state, volume, colorTheme }: { state: string; volume: number; colorTheme: string }) => (
    <div data-testid="voice-orb" data-state={state} data-volume={volume} data-color-theme={colorTheme} />
  ),
}))

describe('OrbAssistant', () => {
  it('renders the orb character surface and example state controls', async () => {
    const { container } = render(<OrbAssistant />)

    expect(screen.getByRole('heading', { name: /navi orb/i })).toBeInTheDocument()
    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-state', 'idle')
    expect(container.querySelector('.orb-canvas-frame')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /listening/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /speaking/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /success/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /muted/i })).not.toBeInTheDocument()
  })

  it('changes interaction state from example buttons', async () => {
    render(<OrbAssistant />)

    fireEvent.click(screen.getByRole('button', { name: /listening/i }))
    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-state', 'listening')
    expect(await screen.findByText(/i'm listening/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /speaking/i }))
    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-state', 'speaking')
    expect(await screen.findByText(/speaking with a steady rhythm/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /success/i }))
    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-state', 'success')
    expect(await screen.findByText(/completed/i)).toBeInTheDocument()
  })

  it('lets example voice energy drive the orb while listening', async () => {
    render(<OrbAssistant />)

    fireEvent.click(screen.getByRole('button', { name: /listening/i }))
    fireEvent.change(screen.getByLabelText(/voice energy/i), {
      target: { value: '72' },
    })

    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-volume', '0.72')
  })

  it('switches the demo page to a white background and daylight orb theme', async () => {
    render(<OrbAssistant />)

    fireEvent.click(screen.getByRole('button', { name: /white background/i }))

    expect(screen.getByRole('main')).toHaveAttribute('data-background', 'light')
    expect(await screen.findByTestId('voice-orb')).toHaveAttribute('data-color-theme', 'daylight')
    expect(screen.getByRole('button', { name: /dark background/i })).toBeInTheDocument()
  })
})
