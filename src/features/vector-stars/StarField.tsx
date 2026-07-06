'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, type Points } from 'three';
import { useVectorData } from './useVectorData';

export interface StarFieldProps {
  /** 粒子点大小 */
  size?: number;
  /** 粒子颜色 */
  color?: string;
}

/**
 * 向量粒子星空。
 *
 * 将 Rust 后端实时推送的高维向量降维后的坐标渲染为 GPU 粒子群（Points），
 * 作为液态玻璃背后被折射的场景。
 */
export function StarField({ size = 0.05, color = '#88ccff' }: StarFieldProps) {
  const pointsRef = useRef<Points>(null);
  const { positions } = useVectorData();
  const count = positions.length / 3;

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.05;
    }
  });

  if (count === 0) return null;

  return (
    // key 绑定粒子数：数据量变化时强制重建缓冲几何体
    <points ref={pointsRef} key={count}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}

export default StarField;
