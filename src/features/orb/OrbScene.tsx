import { Float } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { GillMascotCharacter } from './OrbCharacter'
import type { OrbSceneProps } from './types'

export function OrbScene({ state, volume, colorTheme = 'aurora', reducedMotion = false }: OrbSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.04, 14.2], fov: 25 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      aria-label="Interactive 3D orb assistant character"
    >
      <Suspense fallback={null}>
        <hemisphereLight args={['#fffdf7', '#9db6d3', 2.25]} />
        <directionalLight position={[-3.5, 5, 6]} intensity={4.2} color="#fff4e8" />
        <directionalLight position={[4, 1.5, 5]} intensity={2.1} color="#cfe3ff" />
        <directionalLight position={[0, 4, -3]} intensity={2.2} color="#ffffff" />
        <Float
          speed={reducedMotion ? 0.35 : 1.1}
          rotationIntensity={reducedMotion ? 0.05 : 0.22}
          floatIntensity={reducedMotion ? 0.05 : 0.28}
        >
          <GillMascotCharacter
            state={state}
            volume={volume}
            colorTheme={colorTheme}
            reducedMotion={reducedMotion}
          />
        </Float>
      </Suspense>
    </Canvas>
  )
}
