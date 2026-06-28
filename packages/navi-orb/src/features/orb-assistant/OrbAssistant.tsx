import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Circle, Loader2, Mic, Moon, Sparkles, Sun, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { getOrbVisualState, normalizeVoiceLevel } from './orbState'
import type { OrbAssistantState } from './types'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { VoiceOrb } from './VoiceOrb'

const stateContent: Record<OrbAssistantState, { label: string; message: string }> = {
  idle: {
    label: 'Idle',
    message: 'Hi, I am Navi. Tap a state to see how I react.',
  },
  listening: {
    label: 'Listening',
    message: "I'm listening. Your voice energy shapes my glow.",
  },
  thinking: {
    label: 'Thinking',
    message: 'Processing your request with a softer focus.',
  },
  speaking: {
    label: 'Speaking',
    message: 'Speaking with a steady rhythm.',
  },
  success: {
    label: 'Success',
    message: 'Completed. Returning to idle.',
  },
  error: {
    label: 'Error',
    message: 'Something needs attention. Recovering softly.',
  },
}

const stateControls: Array<{ state: OrbAssistantState; icon: typeof Circle }> = [
  { state: 'idle', icon: Circle },
  { state: 'listening', icon: Mic },
  { state: 'thinking', icon: Loader2 },
  { state: 'speaking', icon: Volume2 },
  { state: 'success', icon: CheckCircle2 },
  { state: 'error', icon: AlertTriangle },
]

export function OrbAssistant() {
  const [state, setState] = useState<OrbAssistantState>('idle')
  const [voiceEnergy, setVoiceEnergy] = useState(36)
  const [backgroundMode, setBackgroundMode] = useState<'dark' | 'light'>('dark')
  const prefersReducedMotion = usePrefersReducedMotion()
  const volume = state === 'listening' || state === 'speaking' ? normalizeVoiceLevel(voiceEnergy / 100) : 0
  const visual = getOrbVisualState(state, volume)
  const activeContent = stateContent[state]
  const isLightBackground = backgroundMode === 'light'

  useEffect(() => {
    if (state !== 'success' && state !== 'error') {
      return undefined
    }

    const timeout = window.setTimeout(() => setState('idle'), state === 'success' ? 900 : 850)

    return () => window.clearTimeout(timeout)
  }, [state])

  const stageStyle = useMemo(
    () => ({
      '--orb-glow': visual.glow,
    }) as CSSProperties,
    [visual.glow],
  )

  return (
    <main className="orb-shell min-h-screen overflow-hidden" data-background={backgroundMode} style={stageStyle}>
      <section className="orb-stage mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-5 py-8">
        <div className="orb-header">
          <span className="orb-kicker">
            <Sparkles aria-hidden="true" size={16} />
            AI voice assistant
          </span>
          <h1>Navi Orb</h1>
        </div>

        <div className="orb-experience" aria-live="polite">
          <VoiceOrb
            state={state}
            volume={volume}
            size="min(92vw, 30rem)"
            colorTheme={isLightBackground ? 'daylight' : 'aurora'}
            reducedMotion={prefersReducedMotion}
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={state}
              className="orb-bubble"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <span>{activeContent.label}</span>
              <p>{activeContent.message}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="orb-controls" aria-label="Orb interaction examples">
          <div className="orb-control-grid">
            <button
              type="button"
              className="orb-control-button"
              data-active={isLightBackground}
              onClick={() => setBackgroundMode(isLightBackground ? 'dark' : 'light')}
            >
              {isLightBackground ? <Moon aria-hidden="true" size={17} /> : <Sun aria-hidden="true" size={17} />}
              <span>{isLightBackground ? 'Dark background' : 'White background'}</span>
            </button>

            {stateControls.map(({ state: controlState, icon: Icon }) => {
              const active = state === controlState

              return (
                <button
                  key={controlState}
                  type="button"
                  className="orb-control-button"
                  data-active={active}
                  onClick={() => setState(controlState)}
                >
                  <Icon aria-hidden="true" size={17} />
                  <span>{stateContent[controlState].label}</span>
                </button>
              )
            })}
          </div>

          <label className="orb-slider">
            <span>Voice energy</span>
            <input
              type="range"
              min="0"
              max="100"
              value={voiceEnergy}
              onChange={(event) => setVoiceEnergy(Number(event.target.value))}
            />
            <output>{voiceEnergy}%</output>
          </label>
        </div>
      </section>
    </main>
  )
}
