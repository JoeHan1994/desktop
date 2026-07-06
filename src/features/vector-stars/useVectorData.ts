'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  subscribeVectorStream,
  type VectorPoint,
} from '@/services/tauriBridge';

export interface UseVectorDataResult {
  /** 扁平化的粒子坐标数组 [x0, y0, z0, x1, y1, z1, ...] */
  positions: Float32Array;
  /** 原始向量点位 */
  points: VectorPoint[];
}

/**
 * 生成演示星空点位。
 *
 * 在浏览器 / 非 Tauri 环境（尚无 Rust 实时向量流）下作为占位数据，
 * 让 3D 星空立即可见。点位分布在一个球壳内，略压扁成星系盘状。
 */
function generateDemoPoints(count = 2600): VectorPoint[] {
  const pts: VectorPoint[] = [];
  for (let i = 0; i < count; i++) {
    const r = 3.5 + Math.random() * 5.5;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    const z = r * Math.cos(phi);
    pts.push({ id: `demo-${i}`, position: [x, y, z] });
  }
  return pts;
}

/**
 * 实时接收 Rust 后端向量数据的自定义 Hook。
 *
 * 订阅 Tauri 事件流，将向量点位转换为 Three.js 可直接消费的
 * 扁平化 `Float32Array` 坐标缓冲。无实时流时回退到演示星空数据。
 */
export function useVectorData(): UseVectorDataResult {
  const [points, setPoints] = useState<VectorPoint[]>([]);

  // 仅客户端生成演示数据，避免 SSR/水合不一致（Math.random）。
  useEffect(() => {
    setPoints((prev) => (prev.length > 0 ? prev : generateDemoPoints()));
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    subscribeVectorStream((incoming) => {
      // 只有后端真正推送数据时才覆盖演示星空
      if (incoming.length > 0) setPoints(incoming);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        // 网页版或非 Tauri 环境下降级：无实时流
        console.warn('[useVectorData] 无法订阅向量流:', err);
      });

    return () => {
      unlisten?.();
    };
  }, []);

  const positions = useMemo(
    () => new Float32Array(points.flatMap((p) => p.position)),
    [points]
  );

  return { positions, points };
}
