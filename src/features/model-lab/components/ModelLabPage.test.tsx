import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ModelLabPage } from './ModelLabPage'

describe('ModelLabPage', () => {
  it('shows five idle class indicators and disables analysis until a video is selected', () => {
    render(<ModelLabPage />)

    expect(screen.getAllByTestId('model-class-indicator')).toHaveLength(5)
    expect(screen.getByTestId('model-lab-video-frame')).toHaveClass('aspect-video')
    expect(screen.getByRole('button', { name: /분석 시작/ })).toBeDisabled()
    expect(screen.getByText('정상')).toBeInTheDocument()
    expect(screen.getByText('섭취')).toBeInTheDocument()
  })

  it('opens the video picker from the empty video frame', () => {
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)

    render(<ModelLabPage />)

    const videoFrame = screen.getByTestId('model-lab-video-frame')

    expect(videoFrame).toHaveAttribute('role', 'button')
    fireEvent.click(videoFrame)
    expect(inputClick).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(videoFrame, { key: 'Enter' })
    fireEvent.keyDown(videoFrame, { key: ' ' })
    expect(inputClick).toHaveBeenCalledTimes(3)

    inputClick.mockRestore()
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
    const videoFrame = screen.getByTestId('model-lab-video-frame')
    expect(videoFrame).not.toHaveAttribute('role')
    expect(videoFrame.querySelector('video')).toHaveClass('h-full', 'w-full', 'object-contain')
    expect(screen.getByText('sample.mp4')).toBeInTheDocument()

    createObjectUrl.mockRestore()
  })
})
