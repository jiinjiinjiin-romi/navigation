import { lazy, Suspense, type CSSProperties } from 'react'
import { normalizeVoiceLevel } from './orbState'
import type { VoiceOrbProps } from './types'

const OrbScene = lazy(() => import('./OrbScene').then((module) => ({ default: module.OrbScene })))

export function VoiceOrb({
  state,
  volume = 0,
  energy,
  size = 416,
  colorTheme = 'aurora',
  reducedMotion = false,
  className,
  style,
}: VoiceOrbProps) {
  const normalizedVolume = normalizeVoiceLevel(energy ?? volume)
  const dimension = typeof size === 'number' ? `${size}px` : size

  return (
    <div
      aria-label="AI voice assistant orb"
      className={className ? `voice-orb ${className}` : 'voice-orb'}
      data-color-theme={colorTheme}
      style={
        {
          width: dimension,
          height: dimension,
          ...style,
        } as CSSProperties
      }
    >
      <Suspense
        fallback={(
          <div
            className="orb-canvas-fallback"
            aria-label="Loading orb"
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 48%, rgb(124 58 237 / 0.42), transparent 32%), radial-gradient(circle at 42% 58%, rgb(34 211 238 / 0.26), transparent 28%), transparent',
            }}
          />
        )}
      >
        <OrbScene
          state={state}
          volume={normalizedVolume}
          size={size}
          colorTheme={colorTheme}
          reducedMotion={reducedMotion}
        />
      </Suspense>
    </div>
  )
}
