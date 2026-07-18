import { Play, Stop, Video } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

import { versionVideoAssetUrl } from '@/features/videoAssets'

import { useModelLabInference } from '../useModelLabInference'

const MODEL_LAB_CLASS_VIDEOS = [
  {
    label: '정상',
    url: versionVideoAssetUrl('/videos/model-lab-safe-driving.mp4'),
    variableName: 'class_0',
  },
  {
    label: '기기조작',
    url: versionVideoAssetUrl('/videos/model-lab-device-operation.mp4'),
    variableName: 'class_1',
  },
  {
    label: '핸드폰',
    url: versionVideoAssetUrl('/videos/model-lab-phone-usage.mp4'),
    variableName: 'class_2',
  },
  {
    label: '졸음',
    url: versionVideoAssetUrl('/videos/model-lab-drowsy.mp4'),
    variableName: 'class_3',
  },
  {
    label: '섭취',
    url: versionVideoAssetUrl('/videos/model-lab-eating.mp4'),
    variableName: 'class_4',
  },
] as const

type ModelLabClassVideo = (typeof MODEL_LAB_CLASS_VIDEOS)[number]

function getModelLabClassVideo(variableName: string) {
  return MODEL_LAB_CLASS_VIDEOS.find((video) => video.variableName === variableName)
}

export function ModelLabPage() {
  const [selectedVideo, setSelectedVideo] = useState<ModelLabClassVideo | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inference = useModelLabInference({ videoRef })

  function selectClassVideo(video: ModelLabClassVideo) {
    setSelectedVideo(video)
    inference.stop()
  }

  function handleStartAnalysis() {
    if (!selectedVideo) {
      return
    }

    videoRef.current?.pause()
    inference.start()
  }

  return (
    <main data-testid="model-lab-page" className="min-h-screen bg-transparent px-5 py-6 text-[var(--nav-ink)]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-medium text-[var(--nav-muted)]">ROADY Model Lab</p>
          <h1 className="text-2xl font-semibold">운전자 행동 탐지 모델 테스트</h1>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="모델 클래스 점수">
          {inference.detections.map((detection) => {
            const classId = detection.variableName ?? detection.classId ?? detection.displayName ?? 'class'
            const active = inference.activeClassIds.has(classId)
            const classVideo = getModelLabClassVideo(classId)
            const selected = selectedVideo?.variableName === classId

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
                {classVideo ? (
                  <button
                    type="button"
                    aria-label={`${classVideo.label} 영상 선택`}
                    aria-pressed={selected}
                    className={[
                      'mt-3 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left transition',
                      selected
                        ? 'border-[var(--nav-primary)] bg-[var(--nav-panel)] text-[var(--nav-primary)] shadow-[0_4px_10px_rgb(23_70_162/0.10)]'
                        : 'border-[var(--nav-border)] bg-white text-[var(--nav-ink)] hover:border-[var(--nav-primary)] hover:bg-[var(--nav-panel)]',
                    ].join(' ')}
                    data-testid="model-lab-class-video-button"
                    onClick={() => selectClassVideo(classVideo)}
                  >
                    <Video className="size-4 shrink-0" weight="bold" />
                    <span className="min-w-0 flex-1 text-xs font-bold">{selected ? '선택됨' : '이 영상 선택'}</span>
                  </button>
                ) : null}
              </div>
            )
          })}
        </section>

        <section className="flex flex-col overflow-hidden rounded-lg border border-[var(--nav-border)] bg-white">
          <div
            className="flex aspect-video w-full items-center justify-center bg-slate-950"
            data-testid="model-lab-video-frame"
          >
            {selectedVideo ? (
              <video
                key={selectedVideo.url}
                ref={videoRef}
                src={selectedVideo.url}
                className="h-full w-full object-contain"
                controls
                muted
                playsInline
              />
            ) : (
              <p className="px-6 text-center text-sm text-slate-300">분석할 클래스 영상을 선택하세요.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--nav-border)] p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-sm text-[var(--nav-muted)]">
                {selectedVideo ? `선택한 클래스: ${selectedVideo.label}` : '선택한 클래스 없음'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--nav-muted)]">
                {inference.state === 'running' ? `분석 중 · drop ${inference.droppedFrames}` : inference.state}
              </span>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md bg-[var(--nav-primary)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--nav-disabled)]"
                disabled={!selectedVideo || inference.isAnalyzing}
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
