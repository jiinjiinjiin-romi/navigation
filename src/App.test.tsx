import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./features/navigation/components/NavigationShell', () => ({
  NavigationShell: ({ assistantVariant }: { assistantVariant?: string }) => (
    <div data-testid="navigation-shell" data-assistant-variant={assistantVariant ?? 'none'} />
  ),
}))

describe('App assistant option routes', () => {
  it.each([
    ['/1', 'focus-hud'],
    ['/2', 'action-dock'],
    ['/3', 'timeline-sheet'],
  ])('maps %s to the %s assistant variant', (path, variant) => {
    window.history.replaceState(null, '', path)

    render(<App />)

    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-assistant-variant', variant)
  })

  it('keeps the root route on the original navigation shell', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByTestId('navigation-shell')).toHaveAttribute('data-assistant-variant', 'none')
  })
})
