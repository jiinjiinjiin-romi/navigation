import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { getOrbVisualState } from './orbState'
import type { OrbAssistantState, OrbColorTheme } from './types'

interface OrbCharacterProps {
  state: OrbAssistantState
  volume: number
  colorTheme?: OrbColorTheme
  reducedMotion?: boolean
}

const colorThemes: Record<OrbColorTheme, { primary: string; secondary: string; accent: string; success: string; error: string }> = {
  aurora: {
    primary: '#67e8f9',
    secondary: '#8b5cf6',
    accent: '#f0abfc',
    success: '#5eead4',
    error: '#fb7185',
  },
  ocean: {
    primary: '#38bdf8',
    secondary: '#22d3ee',
    accent: '#818cf8',
    success: '#2dd4bf',
    error: '#f97316',
  },
  violet: {
    primary: '#a78bfa',
    secondary: '#c084fc',
    accent: '#f0abfc',
    success: '#67e8f9',
    error: '#fb7185',
  },
  daylight: {
    primary: '#0f6fff',
    secondary: '#6d28d9',
    accent: '#db2777',
    success: '#059669',
    error: '#dc2626',
  },
}

const EYE_WIDTH = 0.13
const EYE_HEIGHT = 0.38

function createRoundedEyeShape() {
  const radius = EYE_WIDTH / 2
  const x = -EYE_WIDTH / 2
  const y = -EYE_HEIGHT / 2
  const shape = new THREE.Shape()

  shape.moveTo(x + radius, y)
  shape.lineTo(x + EYE_WIDTH - radius, y)
  shape.quadraticCurveTo(x + EYE_WIDTH, y, x + EYE_WIDTH, y + radius)
  shape.lineTo(x + EYE_WIDTH, y + EYE_HEIGHT - radius)
  shape.quadraticCurveTo(x + EYE_WIDTH, y + EYE_HEIGHT, x + EYE_WIDTH - radius, y + EYE_HEIGHT)
  shape.lineTo(x + radius, y + EYE_HEIGHT)
  shape.quadraticCurveTo(x, y + EYE_HEIGHT, x, y + EYE_HEIGHT - radius)
  shape.lineTo(x, y + radius)
  shape.quadraticCurveTo(x, y, x + radius, y)

  return shape
}

const eyeShape = createRoundedEyeShape()

export function OrbCharacter({
  state,
  volume,
  colorTheme = 'aurora',
  reducedMotion = false,
}: OrbCharacterProps) {
  const rootRef = useRef<THREE.Group>(null)
  const shellMaterialRef = useRef<THREE.MeshPhysicalMaterial>(null)
  const auraCyanRef = useRef<THREE.Mesh>(null)
  const auraVioletRef = useRef<THREE.Mesh>(null)
  const auraRoseRef = useRef<THREE.Mesh>(null)
  const auroraBandRef = useRef<THREE.Mesh>(null)
  const listeningRingRef = useRef<THREE.Mesh>(null)
  const speakingRingRef = useRef<THREE.Mesh>(null)
  const focusRingRef = useRef<THREE.Mesh>(null)
  const successRingRef = useRef<THREE.Mesh>(null)
  const errorRingRef = useRef<THREE.Mesh>(null)
  const faceRef = useRef<THREE.Group>(null)
  const eyeLeftRef = useRef<THREE.Mesh>(null)
  const eyeRightRef = useRef<THREE.Mesh>(null)
  const smoothedVolumeRef = useRef(0)
  const smoothedScaleRef = useRef(1)
  const visualRef = useRef(getOrbVisualState('idle', 0))

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime()
    const targetVolume = THREE.MathUtils.clamp(volume, 0, 1)
    smoothedVolumeRef.current = THREE.MathUtils.lerp(smoothedVolumeRef.current, targetVolume, 0.16)

    const targetVisual = getOrbVisualState(state, smoothedVolumeRef.current)
    visualRef.current = {
      pulse: THREE.MathUtils.lerp(visualRef.current.pulse, targetVisual.pulse, 0.14),
      glow: THREE.MathUtils.lerp(visualRef.current.glow, targetVisual.glow, 0.14),
      eyeScale: THREE.MathUtils.lerp(visualRef.current.eyeScale, targetVisual.eyeScale, 0.18),
      eyeOffset: THREE.MathUtils.lerp(visualRef.current.eyeOffset, targetVisual.eyeOffset, 0.18),
      eyeWidth: THREE.MathUtils.lerp(visualRef.current.eyeWidth, targetVisual.eyeWidth, 0.18),
      eyeHeight: THREE.MathUtils.lerp(visualRef.current.eyeHeight, targetVisual.eyeHeight, 0.18),
      eyeTilt: THREE.MathUtils.lerp(visualRef.current.eyeTilt, targetVisual.eyeTilt, 0.18),
      gazeX: THREE.MathUtils.lerp(visualRef.current.gazeX, targetVisual.gazeX, 0.18),
      gazeY: THREE.MathUtils.lerp(visualRef.current.gazeY, targetVisual.gazeY, 0.18),
      faceYaw: THREE.MathUtils.lerp(visualRef.current.faceYaw, targetVisual.faceYaw, 0.18),
      facePitch: THREE.MathUtils.lerp(visualRef.current.facePitch, targetVisual.facePitch, 0.18),
      faceRoll: THREE.MathUtils.lerp(visualRef.current.faceRoll, targetVisual.faceRoll, 0.18),
      faceLightClearance: THREE.MathUtils.lerp(visualRef.current.faceLightClearance, targetVisual.faceLightClearance, 0.18),
      motion: THREE.MathUtils.lerp(visualRef.current.motion, targetVisual.motion, 0.14),
      aurora: THREE.MathUtils.lerp(visualRef.current.aurora, targetVisual.aurora, 0.14),
      scale: THREE.MathUtils.lerp(visualRef.current.scale, targetVisual.scale, 0.16),
      ringScale: THREE.MathUtils.lerp(visualRef.current.ringScale, targetVisual.ringScale, 0.16),
      ringOpacity: THREE.MathUtils.lerp(visualRef.current.ringOpacity, targetVisual.ringOpacity, 0.16),
      focus: THREE.MathUtils.lerp(visualRef.current.focus, targetVisual.focus, 0.14),
    }

    const visual = visualRef.current
    const motionScale = reducedMotion ? 0.18 : visual.motion
    const palette = colorThemes[colorTheme]
    const idleBreath = state === 'idle' ? 1 + Math.sin(elapsed * ((Math.PI * 2) / 3)) * 0.04 : 1
    const thinkingBreath = state === 'thinking' ? 1 + Math.sin(elapsed * 6.2) * 0.018 : 1
    const speechRhythm = state === 'speaking' ? Math.sin(elapsed * 8.4) * 0.04 * visual.pulse : 0
    const listeningReact = state === 'listening' ? smoothedVolumeRef.current * 0.04 : 0
    const successFlash = state === 'success' ? Math.max(0, Math.sin(elapsed * 8.5)) * 0.035 : 0
    const errorShake = state === 'error' ? Math.sin(elapsed * 18) * 0.08 : 0
    const targetScale = visual.scale * idleBreath * thinkingBreath + speechRhythm + listeningReact + successFlash
    smoothedScaleRef.current = THREE.MathUtils.lerp(smoothedScaleRef.current, targetScale, 0.2)
    const bob = state === 'idle'
      ? Math.sin(elapsed * 1.05) * 0.035
      : Math.sin(elapsed * 1.75) * 0.1 * motionScale
    const sway = state === 'listening'
      ? Math.sin(elapsed * 1.65) * 0.08 * motionScale
      : Math.sin(elapsed * 1.05) * 0.04 * motionScale
    const faceForwardFactor = state === 'listening' || state === 'speaking' ? 0.28 : state === 'thinking' ? 0.52 : 1

    if (rootRef.current) {
      rootRef.current.position.y = bob
      rootRef.current.position.x = sway + errorShake
      rootRef.current.rotation.y = Math.sin(elapsed * 0.58) * 0.34 * motionScale * faceForwardFactor
      rootRef.current.rotation.x = Math.sin(elapsed * 0.44) * 0.09 * motionScale
      rootRef.current.rotation.z = Math.sin(elapsed * 0.62) * 0.08 * motionScale + errorShake * 0.5
      rootRef.current.scale.setScalar(smoothedScaleRef.current)
    }

    if (shellMaterialRef.current) {
      shellMaterialRef.current.opacity = 0.62 + visual.aurora * 0.18
      shellMaterialRef.current.iridescence = 0.82 + visual.aurora * 0.18
      const stateColor = state === 'error' ? palette.error : state === 'success' ? palette.success : palette.primary
      shellMaterialRef.current.color.lerp(new THREE.Color(stateColor), 0.12)
    }

    const auraScale = 1.12 + visual.aurora * 0.3 + Math.sin(elapsed * 2.1) * 0.025 * motionScale

    if (auraCyanRef.current) {
      const material = auraCyanRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.26 + visual.aurora * 0.18
      material.color.lerp(new THREE.Color(state === 'error' ? palette.error : palette.primary), 0.1)
      auraCyanRef.current.rotation.z = elapsed * 0.36 * motionScale
      auraCyanRef.current.scale.set(auraScale * 1.02, auraScale * 0.96, auraScale)
    }

    if (auraVioletRef.current) {
      const material = auraVioletRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.08 + visual.aurora * 0.06
      const violetAuraColor = new THREE.Color(palette.secondary)
      violetAuraColor.lerp(new THREE.Color('#d8ccff'), 0.72)
      material.color.lerp(violetAuraColor, 0.08)
      auraVioletRef.current.rotation.z = -elapsed * 0.28 * motionScale
      auraVioletRef.current.scale.set(auraScale * 0.94, auraScale * 1.08, auraScale)
    }

    if (auraRoseRef.current) {
      const material = auraRoseRef.current.material as THREE.MeshBasicMaterial
      material.opacity = 0.16 + visual.aurora * 0.14
      material.color.lerp(new THREE.Color(state === 'success' ? palette.success : palette.accent), 0.08)
      auraRoseRef.current.rotation.x = Math.sin(elapsed * 0.54) * 0.22 * motionScale
      auraRoseRef.current.scale.set(auraScale * 0.9, auraScale * 1.02, auraScale)
    }

    if (auroraBandRef.current) {
      const material = auroraBandRef.current.material as THREE.MeshBasicMaterial
      material.opacity = state === 'idle' ? 0.035 : 0.06 + visual.ringOpacity * 0.14
      const bandColor = new THREE.Color(state === 'error' ? palette.error : palette.primary)
      bandColor.lerp(new THREE.Color('#d8f3ff'), 0.58)
      material.color.lerp(bandColor, 0.08)
      auroraBandRef.current.rotation.z = elapsed * (state === 'thinking' ? 3.4 : 0.42) * motionScale
      auroraBandRef.current.rotation.y = Math.sin(elapsed * 0.7) * 0.26 * motionScale
    }

    const listeningPhase = (elapsed % 0.82) / 0.82
    if (listeningRingRef.current) {
      const material = listeningRingRef.current.material as THREE.MeshBasicMaterial
      const active = state === 'listening' ? 1 : 0
      const ringScale = (1 + listeningPhase * 0.75) * visual.ringScale
      material.opacity = active * visual.ringOpacity * (1 - listeningPhase) * 0.7
      listeningRingRef.current.scale.setScalar(ringScale)
    }

    const speakingPhase = (elapsed % 0.62) / 0.62
    if (speakingRingRef.current) {
      const material = speakingRingRef.current.material as THREE.MeshBasicMaterial
      const active = state === 'speaking' ? 1 : 0
      material.opacity = active * visual.ringOpacity * (1 - speakingPhase) * 0.5
      speakingRingRef.current.scale.setScalar((1.04 + speakingPhase * 0.34) * visual.ringScale)
    }

    if (focusRingRef.current) {
      const material = focusRingRef.current.material as THREE.MeshBasicMaterial
      material.opacity = state === 'thinking' ? 0.28 : 0
      focusRingRef.current.rotation.z = elapsed * 3.7
      focusRingRef.current.rotation.y = Math.sin(elapsed * 0.8) * 0.18
    }

    if (successRingRef.current) {
      const material = successRingRef.current.material as THREE.MeshBasicMaterial
      const active = state === 'success' ? 1 : 0
      const phase = Math.min(1, (elapsed * 1.25) % 1)
      material.opacity = active * visual.ringOpacity * (1 - phase)
      successRingRef.current.scale.setScalar(1 + phase * 0.7)
    }

    if (errorRingRef.current) {
      const material = errorRingRef.current.material as THREE.MeshBasicMaterial
      const active = state === 'error' ? 1 : 0
      material.opacity = active * visual.ringOpacity * (0.8 + Math.sin(elapsed * 14) * 0.2)
      errorRingRef.current.scale.setScalar(0.94 + Math.sin(elapsed * 12) * 0.04)
    }

    if (faceRef.current) {
      const listeningAttentivePitch = state === 'listening' ? Math.sin(elapsed * 2.4) * 0.012 * motionScale : 0
      faceRef.current.rotation.y = visual.faceYaw
      faceRef.current.rotation.x = visual.facePitch + listeningAttentivePitch
      faceRef.current.rotation.z = visual.faceRoll + (state === 'error' ? Math.sin(elapsed * 18) * 0.025 : 0)
    }

    const eyeBreath = state === 'idle' ? Math.sin(elapsed * 1.2) * 0.015 : 0
    const speakingLift = state === 'speaking' ? Math.sin(elapsed * 8.4) * 0.018 * visual.pulse : 0
    const listeningLift = state === 'listening' ? smoothedVolumeRef.current * 0.018 : 0
    const eyeY = visual.gazeY + eyeBreath + speakingLift + listeningLift

    if (eyeLeftRef.current) {
      eyeLeftRef.current.position.x = -visual.eyeOffset + visual.gazeX
      eyeLeftRef.current.position.y = eyeY
      eyeLeftRef.current.rotation.z = visual.eyeTilt
      eyeLeftRef.current.scale.x = visual.eyeWidth
      eyeLeftRef.current.scale.y = visual.eyeScale * visual.eyeHeight
    }

    if (eyeRightRef.current) {
      eyeRightRef.current.position.x = visual.eyeOffset + visual.gazeX
      eyeRightRef.current.position.y = eyeY + (state === 'thinking' ? -0.01 : 0)
      eyeRightRef.current.rotation.z = -visual.eyeTilt
      eyeRightRef.current.scale.x = visual.eyeWidth
      eyeRightRef.current.scale.y = visual.eyeScale * visual.eyeHeight
    }

  })

  return (
    <group ref={rootRef}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <meshPhysicalMaterial
          ref={shellMaterialRef}
          color="#7dd3fc"
          roughness={0.04}
          metalness={0}
          transmission={0.64}
          thickness={1.15}
          transparent
          opacity={0.78}
          clearcoat={1}
          clearcoatRoughness={0.08}
          iridescence={1}
          iridescenceIOR={1.8}
        />
      </mesh>

      <mesh ref={auraCyanRef} scale={1.34} rotation={[0.12, -0.18, 0.35]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#38bdf8"
          side={THREE.BackSide}
          transparent
          opacity={0.34}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={auraVioletRef} scale={1.28} rotation={[-0.25, 0.18, -0.2]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#d8ccff"
          side={THREE.BackSide}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={auraRoseRef} scale={1.2} rotation={[0.36, 0.24, 0.18]}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial
          color="#f0abfc"
          side={THREE.BackSide}
          transparent
          opacity={0.24}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={auroraBandRef} scale={[1.22, 0.92, 1.04]} rotation={[0.2, 0.1, -0.4]}>
        <torusGeometry args={[0.82, 0.18, 24, 128]} />
        <meshBasicMaterial
          color="#d8f3ff"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={listeningRingRef} rotation={[0, 0, 0]}>
        <torusGeometry args={[1.02, 0.018, 16, 128]} />
        <meshBasicMaterial
          color="#67e8f9"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={speakingRingRef} rotation={[0, 0, 0]}>
        <torusGeometry args={[1.06, 0.012, 12, 128]} />
        <meshBasicMaterial
          color="#a5f3fc"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={focusRingRef} rotation={[0.28, 0.18, 0.2]}>
        <torusGeometry args={[0.92, 0.012, 12, 128]} />
        <meshBasicMaterial
          color="#a78bfa"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={successRingRef}>
        <torusGeometry args={[0.96, 0.02, 16, 128]} />
        <meshBasicMaterial
          color="#5eead4"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <mesh ref={errorRingRef}>
        <torusGeometry args={[0.84, 0.018, 16, 128]} />
        <meshBasicMaterial
          color="#fb7185"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      <group ref={faceRef} position={[0, 0.12, 1.025]}>
        <mesh ref={eyeLeftRef} position={[-0.18, 0, 0]} rotation={[0, 0, 0.04]} renderOrder={10}>
          <shapeGeometry args={[eyeShape]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.96}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={eyeRightRef} position={[0.18, 0, 0]} rotation={[0, 0, -0.04]} renderOrder={10}>
          <shapeGeometry args={[eyeShape]} />
          <meshBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.96}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  )
}
