import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ModelLabPage } from './ModelLabPage'

describe('ModelLabPage', () => {
  it('shows five idle class indicators and disables analysis until a video is selected', () => {
    render(<ModelLabPage />)

    expect(screen.getAllByTestId('model-class-indicator')).toHaveLength(5)
    expect(screen.getByRole('button', { name: /분석 시작/ })).toBeDisabled()
    expect(screen.getByText('class_0')).toBeInTheDocument()
    expect(screen.getByText('class_4')).toBeInTheDocument()
  })

  it('enables analysis after selecting a video file', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:model-lab-video')

    render(<ModelLabPage />)

    fireEvent.change(screen.getByLabelText('동영상 파일 선택'), {
      target: {
        files: [new File(['video'], 'sample.mp4', { type: 'video/mp4' })],
      },
    })

    expect(screen.getByRole('button', { name: /분석 시작/ })).toBeEnabled()
    expect(screen.getByText('sample.mp4')).toBeInTheDocument()

    createObjectUrl.mockRestore()
  })
})
