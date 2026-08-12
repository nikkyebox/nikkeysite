import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface HeroScrollProgressRef {
  current: number;
}

interface FieldProps {
  progressRef: React.MutableRefObject<number>;
  accent?: string;
}

const PARTICLE_COUNT = 900;

/**
 * Campo de partículas procedural (sem assets .gltf) que deriva lentamente e
 * reage ao progresso do scroll horizontal do hero. Lê `progressRef.current`
 * a cada frame em vez de escutar scroll/state — evita um segundo "damping"
 * competindo com o Lenis/ScrollTrigger que já controla a seção (ver comentário
 * em CinematicHeroShelf sobre "two dampings fighting").
 */
const ParticleField: React.FC<FieldProps> = ({ progressRef, accent = '#a78bfa' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const pointsRef = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(PARTICLE_COUNT * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 9;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6;
    }
    return arr;
  }, []);

  useFrame((state) => {
    const progress = progressRef.current;
    const t = state.clock.getElapsedTime();
    if (groupRef.current) {
      // Deriva lenta contínua + leve resposta ao avanço da prateleira.
      groupRef.current.rotation.y = t * 0.02 + progress * 0.6;
      groupRef.current.position.x = -progress * 2.5;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.z = Math.sin(t * 0.05) * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          color={accent}
          size={0.035}
          sizeAttenuation
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </points>
    </group>
  );
};

interface HeroParticleFieldProps {
  progressRef: React.MutableRefObject<number>;
  className?: string;
  accent?: string;
}

/**
 * Camada 3D de fundo do hero cinematográfico. Só é montada em desktop com
 * motion habilitado (o caller decide via `simplified`) — GPU cara demais
 * para mobile/reduced-motion, que já cai no fallback vertical estático.
 */
const HeroParticleField: React.FC<HeroParticleFieldProps> = ({ progressRef, className, accent }) => (
  <div className={className} aria-hidden>
    <Canvas
      camera={{ position: [0, 0, 6], fov: 50 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
    >
      <ParticleField progressRef={progressRef} accent={accent} />
    </Canvas>
  </div>
);

export default HeroParticleField;
