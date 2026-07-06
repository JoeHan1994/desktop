'use client';

import { useMemo, useState } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { AdditiveBlending, Color } from 'three';
import { useVectorData } from './useVectorData';

type Vec3 = [number, number, number];

/** 聚类数量与配色（数据可视化语义色）。 */
const K = 6;
const CLUSTER_HEX = [
  '#60a5fa',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#22d3ee',
];

/** 轻量 k-means：为每个点分配聚类。演示数据下若干次迭代即收敛。 */
function computeClusters(positions: Float32Array, count: number): Int32Array {
  const centroids: Vec3[] = [];
  for (let c = 0; c < K; c++) {
    const idx = Math.floor(((c + 0.5) / K) * count);
    centroids.push([
      positions[idx * 3],
      positions[idx * 3 + 1],
      positions[idx * 3 + 2],
    ]);
  }

  const assign = new Int32Array(count);
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < count; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < K; c++) {
        const dx = positions[i * 3] - centroids[c][0];
        const dy = positions[i * 3 + 1] - centroids[c][1];
        const dz = positions[i * 3 + 2] - centroids[c][2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assign[i] = best;
    }
    const sums = Array.from({ length: K }, () => [0, 0, 0, 0]);
    for (let i = 0; i < count; i++) {
      const c = assign[i];
      sums[c][0] += positions[i * 3];
      sums[c][1] += positions[i * 3 + 1];
      sums[c][2] += positions[i * 3 + 2];
      sums[c][3] += 1;
    }
    for (let c = 0; c < K; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [
          sums[c][0] / sums[c][3],
          sums[c][1] / sums[c][3],
          sums[c][2] / sums[c][3],
        ];
      }
    }
  }
  return assign;
}

/**
 * 点云场景内容：聚类着色的向量粒子 + 可点击选中的查询向量（红星）+ 最近 K 邻连线。
 * 点击任意粒子即将其设为新的查询向量并重算最近邻。
 */
function Scene() {
  const { positions } = useVectorData();
  const count = positions.length / 3;
  const [queryIndex, setQueryIndex] = useState(0);

  // 聚类分配
  const clusters = useMemo(
    () => computeClusters(positions, count),
    [positions, count]
  );

  // 每点颜色缓冲（顶点色）
  const colors = useMemo(() => {
    const arr = new Float32Array(count * 3);
    const palette = CLUSTER_HEX.map((h) => new Color(h));
    for (let i = 0; i < count; i++) {
      const c = palette[clusters[i]] ?? palette[0];
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [clusters, count]);

  // 查询向量与最近邻
  const { queryPos, neighbors } = useMemo(() => {
    if (count === 0) {
      return { queryPos: null as Vec3 | null, neighbors: [] as Vec3[] };
    }
    const qi = Math.min(queryIndex, count - 1);
    const q: Vec3 = [
      positions[qi * 3],
      positions[qi * 3 + 1],
      positions[qi * 3 + 2],
    ];
    const dists: { i: number; d: number }[] = [];
    for (let i = 0; i < count; i++) {
      if (i === qi) continue;
      const x = positions[i * 3] - q[0];
      const y = positions[i * 3 + 1] - q[1];
      const z = positions[i * 3 + 2] - q[2];
      dists.push({ i, d: x * x + y * y + z * z });
    }
    dists.sort((a, b) => a.d - b.d);
    const neighbors: Vec3[] = dists.slice(0, 8).map(({ i }) => [
      positions[i * 3],
      positions[i * 3 + 1],
      positions[i * 3 + 2],
    ]);
    return { queryPos: q, neighbors };
  }, [positions, count, queryIndex]);

  if (count === 0) return null;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.index !== undefined && e.index !== null) setQueryIndex(e.index);
  };

  return (
    <group>
      {/* 聚类着色的向量粒子群（可点击选中） */}
      <points
        key={count}
        onClick={handleClick}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={count}
            array={positions}
            itemSize={3}
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            count={count}
            array={colors}
            itemSize={3}
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          vertexColors
          sizeAttenuation
          transparent
          opacity={0.85}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>

      {/* 查询向量：高亮红星 */}
      {queryPos && (
        <mesh position={queryPos}>
          <sphereGeometry args={[0.22, 20, 20]} />
          <meshBasicMaterial color="#ff4d4f" />
        </mesh>
      )}

      {/* 最近邻连线 + 邻居高亮点 */}
      {queryPos &&
        neighbors.map((n, i) => (
          <group key={i}>
            <Line
              points={[queryPos, n]}
              color="#ffffff"
              lineWidth={1}
              transparent
              opacity={0.35}
            />
            <mesh position={n}>
              <sphereGeometry args={[0.09, 12, 12]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
    </group>
  );
}

/**
 * 交互式 3D 向量点云视图。
 *
 * 嵌入式 R3F 画布：聚类着色的点云，拖拽旋转 / 滚轮缩放 / 缓慢自转；
 * 点击任意向量点即将其选为查询向量，实时重算并连线最近邻。
 */
export function PointCloudView() {
  return (
    <div className="glass glass-control relative h-full w-full overflow-hidden rounded-2xl">
      <Canvas
        camera={{ position: [0, 0, 13], fov: 50 }}
        dpr={[1, 2]}
        raycaster={{ params: { Points: { threshold: 0.16 } } as any }}
      >
        <ambientLight intensity={0.6} />
        <Scene />
        <OrbitControls
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.35}
          minDistance={5}
          maxDistance={22}
        />
      </Canvas>

      {/* 图例与操作提示 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-3 text-[11px] text-white/45">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-[#ff4d4f]" />
            查询向量
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-white" />
            最近邻
          </span>
          <span className="flex items-center gap-1">
            聚类
            {CLUSTER_HEX.map((h) => (
              <span
                key={h}
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: h }}
              />
            ))}
          </span>
        </div>
        <span className="text-white/30">点击粒子设为查询 · 拖拽旋转</span>
      </div>
    </div>
  );
}

export default PointCloudView;
