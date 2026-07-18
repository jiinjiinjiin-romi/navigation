import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ModelLabPage } from './ModelLabPage'

describe('ModelLabPage', () => {
  it('shows five fixed class videos and disables analysis until a class video is selected', () => {
    render(<ModelLabPage />)

    expect(screen.getAllByTestId('model-class-indicator')).toHaveLength(5)
    expect(screen.getAllByTestId('model-lab-class-video-button')).toHaveLength(5)
    expect(screen.getByRole('heading', { name: '운전자 행동 탐지 모델 테스트' })).toBeInTheDocument()
    expect(screen.getByTestId('model-lab-page')).toHaveClass('bg-transparent')
    expect(screen.getByTestId('model-lab-video-frame')).toHaveClass('aspect-video')
    expect(screen.getByRole('button', { name: /분석 시작/ })).toBeDisabled()
    expect(screen.getByText('정상')).toBeInTheDocument()
    expect(screen.getByText('섭취')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정상 영상 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '기기조작 영상 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '핸드폰 영상 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '졸음 영상 선택' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '섭취 영상 선택' })).toBeInTheDocument()
    expect(screen.getAllByText('이 영상 선택')).toHaveLength(5)
    expect(screen.queryByText(/S2AC/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('동영상 파일 선택')).not.toBeInTheDocument()
  })

  it('shows the selected fixed class video in the lower player', () => {
    render(<ModelLabPage />)

    fireEvent.click(screen.getByRole('button', { name: '핸드폰 영상 선택' }))

    expect(screen.getByRole('button', { name: /분석 시작/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: '핸드폰 영상 선택' })).toHaveTextContent('선택됨')
    const videoFrame = screen.getByTestId('model-lab-video-frame')
    expect(videoFrame).not.toHaveAttribute('role')
    const video = videoFrame.querySelector('video')
    expect(video).toHaveClass('h-full', 'w-full', 'object-contain')
    expect(video).toHaveAttribute('src', '/videos/model-lab-phone-usage.mp4?v=llast-20260715')
    expect(screen.getByText('선택한 클래스: 핸드폰')).toBeInTheDocument()
    expect(screen.queryByText(/S2AC/)).not.toBeInTheDocument()
  })
})
