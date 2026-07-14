import { Play, Stop, UploadSimple } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { useModelLabInference } from '../useModelLabInference'

export function ModelLabPage() {
  const [fileName, setFileName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inference = useModelLabInference({ videoRef })

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) {
      return
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl)
    }

    setFileName(file.name)
    setVideoUrl(URL.createObjectURL(file))
    inference.stop()
  }

  function handleStartAnalysis() {
    void videoRef.current?.play()
    inference.start()
  }

  function openFilePicker() {
    if (!videoUrl) {
      fileInputRef.current?.click()
    }
  }

  function handleVideoFrameKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (videoUrl || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    fileInputRef.current?.click()
  }

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl)
      }
    }
  }, [videoUrl])

  return (
    <main data-testid="model-lab-page" className="min-h-screen bg-[var(--nav-frame)] px-5 py-6 text-[var(--nav-ink)]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--nav-muted)]">ROADIE Model Lab</p>
          <h1 className="text-2xl font-semibold">비디오 모델 분석</h1>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="모델 클래스 점수">
          {inference.detections.map((detection) => {
            const classId = detection.variableName ?? detection.classId ?? detection.displayName ?? 'class'
            const active = inference.activeClassIds.has(classId)

            return (
              <div
                key={classId}
                data-testid="model-class-indicator"
                className={[
                  'rounded-lg border bg-white px-4 py-3 transition-colors',
                  active
                    ? 'border-[var(--nav-ai-primary)] shadow-[var(--nav-shadow-ai)]'
                    : 'border-[var(--nav-border)]',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{detection.displayName ?? classId}</span>
                  <span
                    className={[
                      'h-2.5 w-2.5 rounded-full',
                      active ? 'bg-[var(--nav-ai-primary)]' : 'bg-[var(--nav-control-muted)]',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums">{detection.score.toFixed(2)}</p>
              </div>
            )
          })}
        </section>

        <section className="flex flex-col overflow-hidden rounded-lg border border-[var(--nav-border)] bg-white">
          <div
            aria-label={!videoUrl ? '동영상 업로드 영역' : undefined}
            className={[
              'flex aspect-video w-full items-center justify-center bg-slate-950',
              !videoUrl
                ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--nav-primary)]'
                : '',
            ].join(' ')}
            data-testid="model-lab-video-frame"
            onClick={openFilePicker}
            onKeyDown={handleVideoFrameKeyDown}
            role={!videoUrl ? 'button' : undefined}
            tabIndex={!videoUrl ? 0 : undefined}
          >
            {videoUrl ? (
              <video ref={videoRef} src={videoUrl} className="h-full w-full object-contain" controls muted playsInline />
            ) : (
              <p className="px-6 text-center text-sm text-slate-300">분석할 동영상 파일을 선택하세요.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--nav-border)] p-4">
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--nav-border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--nav-panel)]">
                <UploadSimple className="size-4" weight="bold" />
                동영상 파일 선택
                <input
                  aria-label="동영상 파일 선택"
                  className="sr-only"
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
              </label>
              <span className="text-sm text-[var(--nav-muted)]">{fileName || '선택된 파일 없음'}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--nav-muted)]">
                {inference.state === 'running' ? `분석 중 · drop ${inference.droppedFrames}` : inference.state}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-[var(--nav-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--nav-disabled)]"
                disabled={!videoUrl || inference.isAnalyzing}
                onClick={handleStartAnalysis}
              >
                <Play className="size-4" weight="fill" />
                분석 시작
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--nav-border)] px-4 py-2 text-sm font-semibold text-[var(--nav-ink)] disabled:cursor-not-allowed disabled:text-[var(--nav-subtle)]"
                disabled={!inference.isAnalyzing}
                onClick={inference.stop}
              >
                <Stop className="size-4" weight="fill" />
                정지
              </button>
            </div>
          </div>

          {inference.error ? (
            <p className="border-t border-[var(--nav-border)] px-4 py-3 text-sm text-[var(--nav-danger)]">{inference.error}</p>
          ) : null}
        </section>
      </div>
    </main>
  )
}
