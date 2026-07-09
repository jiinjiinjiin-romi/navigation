import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { OrbScene } from './OrbScene'

const environmentMock = vi.hoisted(() => vi.fn(() => <div data-testid="remote-environment" />))

vi.mock('@react-three/drei', () => ({
  Environment: environmentMock,
  Float: ({ children }: { children: ReactNode }) => <div data-testid="float-wrapper">{children}</div>,
}))

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: ReactNode }) => <div data-testid="orb-canvas">{children}</div>,
}))

vi.mock('./OrbCharacter', () => ({
  OrbCharacter: () => <div data-testid="orb-character" />,
}))

describe('OrbScene', () => {
  it('renders without a remote environment preset request', () => {
    render(<OrbScene state="idle" volume={0} />)

    expect(screen.getByTestId('orb-character')).toBeInTheDocument()
    expect(screen.queryByTestId('remote-environment')).not.toBeInTheDocument()
    expect(environmentMock).not.toHaveBeenCalled()
  })
})
