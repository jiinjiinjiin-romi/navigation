import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbAssistantState, OrbColorTheme } from './types'

interface OrbCharacterProps {
  state: OrbAssistantState
  volume: number
  colorTheme?: OrbColorTheme
  reducedMotion?: boolean
}

const clampEnergy = (value: number) => THREE.MathUtils.clamp(Number.isFinite(value) ? value : 0, 0, 1)

export const getMouthScaleY = (mouthOpen: number) => 0.38 + THREE.MathUtils.clamp(mouthOpen, 0, 1) * 0.18

export const getIdleFloatOffset = (elapsed: number, reducedMotion: boolean) => (
  reducedMotion ? 0 : Math.sin(elapsed * 1.1) * 0.082
)

export const getListeningLeanZ = (energy: number, reducedMotion: boolean) => (
  reducedMotion ? 0 : 0.045 + clampEnergy(energy) * 0.055
)

export const SPEAKING_HEAD_CADENCE = 4.4

export interface FaceMotion {
  x: number
  y: number
  z: number
  pitch: number
  yaw: number
  roll: number
  scale: number
}

export const getFaceMotion = ({
  state,
  elapsed,
  energy,
  reducedMotion,
}: {
  state: OrbAssistantState
  elapsed: number
  energy: number
  reducedMotion: boolean
}): FaceMotion => {
  if (reducedMotion) {
    return { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, scale: 1 }
  }

  const level = clampEnergy(energy)

  switch (state) {
    case 'idle':
      return {
        x: Math.sin(elapsed * 0.72) * 0.055,
        y: getIdleFloatOffset(elapsed, false),
        z: Math.sin(elapsed * 0.6) * 0.012,
        pitch: Math.sin(elapsed * 1.1) * 0.022,
        yaw: Math.sin(elapsed * 0.7) * 0.04,
        roll: Math.sin(elapsed * 0.9) * 0.032,
        scale: 1 + Math.sin(elapsed * 1.1) * 0.015,
      }
    case 'listening':
      return {
        x: Math.sin(elapsed * 2.2) * 0.035,
        y: Math.sin(elapsed * 3.1) * 0.052,
        z: getListeningLeanZ(level, false),
        pitch: 0.045 + Math.sin(elapsed * 3.1) * (0.04 + level * 0.025),
        yaw: Math.sin(elapsed * 1.6) * 0.025,
        roll: Math.sin(elapsed * 2.2) * 0.035,
        scale: 1 + level * 0.018 + Math.sin(elapsed * 3.1) * 0.012,
      }
    case 'thinking':
      return {
        x: Math.sin(elapsed * 0.75) * 0.07,
        y: Math.sin(elapsed * 1.45) * 0.04,
        z: Math.cos(elapsed * 0.75) * 0.02,
        pitch: Math.sin(elapsed * 1.1) * 0.03,
        yaw: -0.11 + Math.sin(elapsed * 0.75) * 0.04,
        roll: -0.08 + Math.cos(elapsed * 0.75) * 0.03,
        scale: 0.995 + Math.sin(elapsed * 1.45) * 0.012,
    }
    case 'speaking': {
      const cadence = Math.sin(elapsed * SPEAKING_HEAD_CADENCE)
      return {
        x: Math.sin(elapsed * 2.4) * 0.025,
        y: cadence * (0.045 + level * 0.025),
        z: 0.018 + level * 0.045,
        pitch: 0.045 + cadence * (0.045 + level * 0.015),
        yaw: Math.sin(elapsed * 2.4) * 0.028,
        roll: cadence * 0.025,
        scale: 1 + level * 0.018 + Math.abs(cadence) * 0.016,
      }
    }
    case 'success':
      return {
        x: Math.sin(elapsed * 3.5) * 0.025,
        y: 0.07 + Math.max(0, Math.sin(elapsed * 5.1)) * 0.07,
        z: 0.018,
        pitch: -0.045 + Math.sin(elapsed * 5.1) * 0.028,
        yaw: Math.sin(elapsed * 3.5) * 0.035,
        roll: Math.sin(elapsed * 5.1) * 0.025,
        scale: 1.025 + Math.max(0, Math.sin(elapsed * 5.1)) * 0.025,
      }
    case 'error':
      return {
        x: Math.sin(elapsed * 16) * 0.075,
        y: -0.02 + Math.sin(elapsed * 8) * 0.018,
        z: -0.024,
        pitch: 0.04 + Math.sin(elapsed * 16) * 0.025,
        yaw: Math.sin(elapsed * 16) * 0.055,
        roll: Math.sin(elapsed * 16) * 0.085,
        scale: 0.985 - Math.abs(Math.sin(elapsed * 16)) * 0.012,
      }
  }
}

const stateColors: Record<OrbColorTheme, { listening: string; speaking: string }> = {
  aurora: { listening: '#7ed7b4', speaking: '#4f91e5' },
  ocean: { listening: '#62d3c2', speaking: '#38bdf8' },
  violet: { listening: '#a5ead0', speaking: '#a78bfa' },
  daylight: { listening: '#43b998', speaking: '#0f6fff' },
}

/**
 * ROADIE's gill-derived mascot. The scene remains declarative so the parent
 * R3F Canvas owns WebGL lifetime, sizing, and transparency.
 */
export function GillMascotCharacter({
  state,
  volume,
  colorTheme = 'aurora',
  reducedMotion = false,
}: OrbCharacterProps) {
  const rootRef = useRef<THREE.Group>(null)
  const leftEyeRef = useRef<THREE.Mesh>(null)
  const rightEyeRef = useRef<THREE.Mesh>(null)
  const mouthRef = useRef<THREE.Mesh>(null)
  const leftEarRef = useRef<THREE.Group>(null)
  const rightEarRef = useRef<THREE.Group>(null)
  const listeningRingRef = useRef<THREE.Group>(null)
  const speakingRingRef = useRef<THREE.Group>(null)
  const thinkingRef = useRef<THREE.Group>(null)
  const successRef = useRef<THREE.Group>(null)
  const errorRingRef = useRef<THREE.Mesh>(null)
  const nextBlinkRef = useRef(2.4)
  const blinkingRef = useRef(0)
  const smoothedEnergyRef = useRef(0)
  const colors = stateColors[colorTheme]
  const effectMaterials = useMemo(() => ({
    listening: new THREE.MeshBasicMaterial({ color: colors.listening, transparent: true, opacity: 0, depthWrite: false }),
    speaking: new THREE.MeshBasicMaterial({ color: colors.speaking, transparent: true, opacity: 0, depthWrite: false }),
    thinking: new THREE.MeshBasicMaterial({ color: '#8297e8', transparent: true, opacity: 0, depthWrite: false }),
    success: new THREE.MeshBasicMaterial({ color: '#63d3aa', transparent: true, opacity: 0, depthWrite: false }),
    error: new THREE.MeshBasicMaterial({ color: '#ed7b83', transparent: true, opacity: 0, depthWrite: false }),
  }), [colors.listening, colors.speaking])

  useEffect(() => () => Object.values(effectMaterials).forEach((material) => material.dispose()), [effectMaterials])

  useFrame(({ clock }, delta) => {
    const elapsed = clock.getElapsedTime()
    const energy = clampEnergy(volume)
    smoothedEnergyRef.current = THREE.MathUtils.damp(smoothedEnergyRef.current, energy, 10, delta)
    const level = smoothedEnergyRef.current
    const motion = reducedMotion ? 0 : 1

    if (!reducedMotion && elapsed >= nextBlinkRef.current) {
      blinkingRef.current = 0.17
      nextBlinkRef.current = elapsed + 3.2 + Math.random() * 2.4
    }
    blinkingRef.current = Math.max(0, blinkingRef.current - delta)
    const blink = blinkingRef.current > 0 ? Math.sin((blinkingRef.current / 0.17) * Math.PI) : 0

    const expressions = {
      idle: { eyeWidth: 1, eyeHeight: 1, gazeY: 0, smile: 0.65, mouth: 0, scale: 1, yaw: 0, pitch: 0 },
      listening: { eyeWidth: 1 + level * 0.1, eyeHeight: 1.04 + level * 0.1, gazeY: 0.05, smile: 0.35, mouth: level * 0.05, scale: 1 + level * 0.025, yaw: 0, pitch: -0.035 },
      thinking: { eyeWidth: 0.92, eyeHeight: 0.78, gazeY: 0.025, smile: 0.05, mouth: 0, scale: 0.99, yaw: -0.12, pitch: 0.055 },
      speaking: { eyeWidth: 1.02, eyeHeight: 1.04, gazeY: 0.025, smile: 0.38, mouth: 0.18 + level * 0.72, scale: 1 + level * 0.02, yaw: 0.025, pitch: -0.015 },
      success: { eyeWidth: 1.12, eyeHeight: 0.24, gazeY: 0.03, smile: 1, mouth: 0.08, scale: 1.035, yaw: 0, pitch: -0.04 },
      error: { eyeWidth: 0.82, eyeHeight: 0.58, gazeY: -0.02, smile: -0.82, mouth: 0, scale: 0.97, yaw: 0.035, pitch: 0.045 },
    }[state]
    const speakingPulse = state === 'speaking' ? 0.66 + Math.abs(Math.sin(elapsed * 8.4)) * 0.34 : 1
    const eyeHeight = Math.max(0.055, expressions.eyeHeight * (1 - blink * 0.945))
    const eyeTilt = state === 'thinking' ? -0.08 : state === 'success' ? 0.18 : state === 'error' ? 0.12 : 0
    const eyeGazeX = state === 'thinking' ? -0.045 : 0

    if (rootRef.current) {
      const faceMotion = getFaceMotion({ state, elapsed, energy: level, reducedMotion })
      rootRef.current.position.set(faceMotion.x, faceMotion.y, faceMotion.z)
      rootRef.current.rotation.set(-0.015 + expressions.pitch + faceMotion.pitch, expressions.yaw + faceMotion.yaw, faceMotion.roll)
      rootRef.current.scale.setScalar(expressions.scale * faceMotion.scale)
    }
    ;[leftEyeRef.current, rightEyeRef.current].forEach((eye, index) => {
      if (!eye) return
      eye.position.x = (index === 0 ? -0.58 : 0.58) + eyeGazeX
      eye.position.y = 0.08 + expressions.gazeY
      eye.scale.set(0.14 * expressions.eyeWidth, 0.23 * eyeHeight, 0.075)
      eye.rotation.z = index === 0 ? eyeTilt : -eyeTilt
    })
    if (mouthRef.current) {
      const mouthOpen = expressions.mouth * speakingPulse
      mouthRef.current.scale.set(1 + mouthOpen * 0.1, getMouthScaleY(mouthOpen), 1)
      mouthRef.current.position.y = -0.43 - expressions.smile * 0.06
      mouthRef.current.rotation.z = 0
    }
    ;[leftEarRef.current, rightEarRef.current].forEach((ear, index) => {
      if (!ear) return
      const side = index === 0 ? -1 : 1
      const pulse = (Math.sin(elapsed * 5.2 + index * Math.PI * 0.72) + 1) * 0.5
      const react = state === 'listening' ? level * motion : 0
      ear.position.x = side * (1.95 + pulse * 0.025 * react)
      ear.rotation.z = side * (0.025 + pulse * 0.045) * react
      ear.scale.y = 1 + (0.025 + pulse * 0.05) * react
    })

    const setGroupOpacity = (group: THREE.Group | null, material: THREE.MeshBasicMaterial, opacity: number, scale: number) => {
      if (!group) return
      material.opacity = opacity
      group.scale.setScalar(scale)
    }
    const listeningPhase = (elapsed * 0.78) % 1
    setGroupOpacity(listeningRingRef.current, effectMaterials.listening, state === 'listening' ? (1 - listeningPhase) * (0.22 + level * 0.34) : 0, 1 + listeningPhase * (0.12 + level * 0.12))
    const speakingPhase = (elapsed * 1.35) % 1
    setGroupOpacity(speakingRingRef.current, effectMaterials.speaking, state === 'speaking' ? (1 - speakingPhase) * (0.28 + level * 0.3) : 0, 1 + speakingPhase * (0.1 + level * 0.08))
    if (thinkingRef.current) {
      thinkingRef.current.rotation.z = reducedMotion ? 0 : elapsed * 0.72
      effectMaterials.thinking.opacity = state === 'thinking' ? 0.55 : 0
    }
    if (successRef.current) {
      const phase = (elapsed * 0.82) % 1
      successRef.current.scale.setScalar(1 + phase * 0.22)
      effectMaterials.success.opacity = state === 'success' ? (1 - phase) * 0.58 : 0
    }
    if (errorRingRef.current) {
      errorRingRef.current.scale.setScalar(1 + (state === 'error' && !reducedMotion ? Math.sin(elapsed * 11) * 0.018 : 0))
      effectMaterials.error.opacity = state === 'error' ? 0.42 : 0
    }
  })

  return (
    <group ref={rootRef} data-character="gill-mascot">
      <group ref={listeningRingRef} position={[0, 0.05, -0.52]}>
        <mesh material={effectMaterials.listening}><torusGeometry args={[2.25, 0.024, 8, 96]} /></mesh>
        <mesh material={effectMaterials.listening}><torusGeometry args={[2.25, 0.014, 8, 96]} /></mesh>
      </group>
      <group ref={speakingRingRef} position={[0, 0.05, -0.52]}>
        <mesh material={effectMaterials.speaking}><torusGeometry args={[2.26, 0.026, 8, 96]} /></mesh>
        <mesh material={effectMaterials.speaking}><torusGeometry args={[2.26, 0.014, 8, 96]} /></mesh>
      </group>
      <group ref={thinkingRef} position={[0, 0.05, -0.52]}>
        {Array.from({ length: 5 }, (_, index) => {
          const angle = (index / 5) * Math.PI * 2
          return <mesh key={index} material={effectMaterials.thinking} position={[Math.cos(angle) * 2.34, Math.sin(angle) * 1.93, 0]} scale={0.045 + index * 0.006}><sphereGeometry args={[1, 24, 16]} /></mesh>
        })}
      </group>
      <group ref={successRef} position={[0, 0.05, -0.52]}>
        <mesh material={effectMaterials.success}><torusGeometry args={[2.27, 0.03, 8, 96]} /></mesh>
        {Array.from({ length: 8 }, (_, index) => {
          const angle = (index / 8) * Math.PI * 2
          return <mesh key={index} material={effectMaterials.success} position={[Math.cos(angle) * 2.4, Math.sin(angle) * 1.98, 0]} scale={[0.025, 0.075, 0.025]} rotation={[0, 0, angle]}><sphereGeometry args={[1, 24, 16]} /></mesh>
        })}
      </group>
      <mesh ref={errorRingRef} material={effectMaterials.error} position={[0, 0.05, -0.52]}><torusGeometry args={[2.25, 0.03, 8, 96]} /></mesh>

      <mesh position={[0, 0.06, 0]} scale={[2.08, 1.72, 0.78]} castShadow receiveShadow><sphereGeometry args={[1, 48, 36]} /><meshPhysicalMaterial color="#4f91e5" roughness={0.46} clearcoat={0.22} clearcoatRoughness={0.68} /></mesh>
      <mesh position={[0, 1.73, -0.05]} scale={[0.36, 0.16, 0.28]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#4f91e5" roughness={0.46} /></mesh>
      {([-1, 1] as const).map((side, index) => <group key={side} ref={index === 0 ? leftEarRef : rightEarRef} position={[side * 1.95, 0.05, 0]}><mesh position={[side * 0.07, 0, -0.02]} scale={[0.2, 0.56, 0.33]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#3979c9" roughness={0.56} /></mesh><mesh position={[side * 0.19, 0, 0.01]} scale={[0.12, 0.43, 0.29]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#7ed7b4" roughness={0.5} /></mesh></group>)}
      <mesh position={[0, -0.04, 0.63]} scale={[1.62, 1.13, 0.47]}><sphereGeometry args={[1, 48, 36]} /><meshStandardMaterial color="#fff9f0" roughness={0.64} /></mesh>
      <mesh ref={leftEyeRef} position={[-0.58, 0.08, 1.105]} scale={[0.14, 0.23, 0.075]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#272725" roughness={0.34} /></mesh>
      <mesh ref={rightEyeRef} position={[0.58, 0.08, 1.105]} scale={[0.14, 0.23, 0.075]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#272725" roughness={0.34} /></mesh>
      {([-1, 1] as const).map((side) => <mesh key={side} position={[side * 1.08, -0.28, 1.055]} scale={[0.27, 0.13, 0.025]}><sphereGeometry args={[1, 32, 24]} /><meshBasicMaterial color="#efb7aa" transparent opacity={0.13} depthWrite={false} /></mesh>)}
      <mesh ref={mouthRef} position={[0, -0.43, 1.105]} scale={[1, 0.38, 1]}><circleGeometry args={[0.28, 32]} /><meshBasicMaterial color="#272725" /></mesh>
    </group>
  )
}

/** @deprecated Use GillMascotCharacter for the ROADIE mascot scene. */
export const OrbCharacter = GillMascotCharacter
