import { Environment, Float } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { OrbCharacter } from './OrbCharacter'
import type { OrbSceneProps } from './types'

export function OrbScene({ state, volume, colorTheme = 'aurora', reducedMotion = false }: OrbSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.1, 5.25], fov: 38 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      aria-label="Interactive 3D orb assistant character"
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.34} />
        <pointLight position={[-2.5, 1.5, 3]} intensity={7.2} color="#67e8f9" />
        <pointLight position={[2.4, 1.1, 2.6]} intensity={6.4} color="#c084fc" />
        <pointLight position={[0.2, -1.8, 1.8]} intensity={3.2} color="#fb7185" />
        <Float
          speed={reducedMotion ? 0.35 : 1.1}
          rotationIntensity={reducedMotion ? 0.05 : 0.22}
          floatIntensity={reducedMotion ? 0.05 : 0.28}
        >
          <OrbCharacter
            state={state}
            volume={volume}
            colorTheme={colorTheme}
            reducedMotion={reducedMotion}
          />
        </Float>
        <Environment preset="night" />
      </Suspense>
    </Canvas>
  )
}
