import { motion } from 'framer-motion'
import { getVoiceWaveBars, normalizeWaveEnergy } from './voiceWaveState'
import type { VoiceWaveColorTheme, VoiceWaveProps } from './types'

const themeColors: Record<VoiceWaveColorTheme, { start: string; end: string; glow: string }> = {
  aurora: {
    start: '#67e8f9',
    end: '#8b5cf6',
    glow: 'rgba(109, 93, 246, 0.24)',
  },
  ocean: {
    start: '#38bdf8',
    end: '#22d3ee',
    glow: 'rgba(0, 168, 255, 0.22)',
  },
  violet: {
    start: '#a78bfa',
    end: '#d946ef',
    glow: 'rgba(217, 70, 239, 0.2)',
  },
  daylight: {
    start: '#00a8ff',
    end: '#6d5df6',
    glow: 'rgba(109, 93, 246, 0.18)',
  },
}

export function VoiceWave({
  active,
  energy = 0,
  barCount = 9,
  colorTheme = 'aurora',
  reducedMotion = false,
  className,
  style,
}: VoiceWaveProps) {
  const normalizedEnergy = normalizeWaveEnergy(energy)
  const bars = getVoiceWaveBars({ active, energy: normalizedEnergy, barCount })
  const palette = themeColors[colorTheme]

  return (
    <motion.div
      aria-label="AI voice activity"
      className={className ? `voice-wave ${className}` : 'voice-wave'}
      data-active={String(active)}
      data-color-theme={colorTheme}
      initial={false}
      animate={{ opacity: active ? 1 : 0.72 }}
      transition={{ duration: reducedMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: 4,
        height: 20,
        justifyContent: 'center',
        ...style,
      }}
    >
      {bars.map((bar, index) => (
        <motion.span
          aria-hidden="true"
          data-testid="voice-wave-bar"
          key={index}
          initial={false}
          animate={{
            opacity: bar.opacity,
            scaleY: reducedMotion || !active
              ? bar.scale
              : [Math.max(0.18, bar.scale * 0.42), bar.scale, Math.max(0.2, bar.scale * 0.58)],
          }}
          transition={{
            delay: reducedMotion ? 0 : bar.delay,
            duration: reducedMotion ? 0 : active ? 0.62 : 0.18,
            ease: [0.22, 1, 0.36, 1],
            repeat: !reducedMotion && active ? Infinity : 0,
            repeatType: 'mirror',
          }}
          style={{
            background: `linear-gradient(180deg, ${palette.start}, ${palette.end})`,
            borderRadius: 999,
            boxShadow: active ? `0 0 10px ${palette.glow}` : 'none',
            display: 'block',
            height: 18,
            transformOrigin: 'center',
            width: 3,
          }}
        />
      ))}
    </motion.div>
  )
}
