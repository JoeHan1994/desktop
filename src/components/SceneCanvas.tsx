'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { StarField } from '@/features/vector-stars/StarField';

/**
 * 全局 3D 场景画布。
 *
 * 作为固定的全屏背景常驻（挂载于根布局），承载向量星空。
 * 液态玻璃质感现由前端 2D 毛玻璃控件承担，3D 场景专注于星空粒子背景。
 */
export function SceneCanvas() {
  return (
    <div className="fixed inset-0 -z-0">
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#03040a']} />
        <fog attach="fog" args={['#03040a', 10, 20]} />

        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1.4} />
        <pointLight position={[-6, -3, -4]} intensity={30} color="#38bdf8" />

        {/* 背景向量星空 */}
        <StarField />

        {/* 缓慢自转，增强空间纵深感 */}
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.35}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={(2 * Math.PI) / 3}
        />
      </Canvas>
    </div>
  );
}

export default SceneCanvas;
