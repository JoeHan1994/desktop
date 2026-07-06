'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshTransmissionMaterial } from '@react-three/drei';
import type { Mesh } from 'three';

export interface GlassPanelProps {
  /** 流体扭曲强度 */
  distortion?: number;
  /** 折射率 (Index of Refraction) */
  ior?: number;
  /** 表面粗糙度（毛玻璃感） */
  roughness?: number;
}

/**
 * 3D 液态玻璃面板。
 *
 * 顶点着色器（glass.vertex.glsl）负责流体波动形变，
 * 片元着色器（glass.fragment.glsl）与 `MeshTransmissionMaterial`
 * 协同负责折射与毛玻璃模糊。
 */
export function GlassPanel({
  distortion = 0.4,
  ior = 1.2,
  roughness = 0.15,
}: GlassPanelProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      // TODO: 将 time 增量传入自定义着色器 uniform，驱动流体波动
      meshRef.current.rotation.z += delta * 0.02;
    }
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[3, 2, 64, 64]} />
      <MeshTransmissionMaterial
        transmission={1.0}
        roughness={roughness}
        thickness={1.5}
        ior={ior}
        distortion={distortion}
        distortionScale={0.3}
        temporalDistortion={0.2}
        anisotropicBlur={0.5}
      />
    </mesh>
  );
}

export default GlassPanel;
