import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('./features/navigation/components/NavigationShell', () => ({
  NavigationShell: () => (
    <div data-testid="navigation-shell" />
  ),
}))

vi.mock('./features/model-lab/components/ModelLabPage', () => ({
  ModelLabPage: () => (
    <div data-testid="model-lab-page" />
  ),
}))

describe('App', () => {
  it('renders the navigation shell', () => {
    window.history.replaceState(null, '', '/')

    render(<App />)

    expect(screen.getByTestId('navigation-shell')).toBeInTheDocument()
  })

  it('renders the model lab page on /model-lab', () => {
    window.history.replaceState(null, '', '/model-lab')

    render(<App />)

    expect(screen.getByTestId('model-lab-page')).toBeInTheDocument()
  })
})
