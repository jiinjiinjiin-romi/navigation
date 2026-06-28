import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./features/navigation/components/NavigationShell', () => ({
  NavigationShell: () => (
    <div data-testid="navigation-shell" />
  ),
}))

describe('App', () => {
  it('renders the navigation shell', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByTestId('navigation-shell')).toBeInTheDocument()
  })
})
