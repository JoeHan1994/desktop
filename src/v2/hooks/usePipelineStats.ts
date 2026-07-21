'use client';

import { useEffect, useState } from 'react';
import {
  getPipelineStats,
  subscribePipelineStats,
  type PipelineStats,
} from '@/v2/services/tauriBridge';

/**
 * 实时订阅 Rust 后端的流水线统计数据。
 *
 * - 挂载时通过 `get_pipeline_stats` 拉取初始快照
 * - 同时监听 `pipeline-stats` 事件获得实时更新
 * - 非 Tauri 环境（浏览器/SSR）中静默降级，返回 `null`
 */
export function usePipelineStats(): PipelineStats | null {
  const [stats, setStats] = useState<PipelineStats | null>(null);

  useEffect(() => {
    // 初始拉取
    getPipelineStats()
      .then(setStats)
      .catch(() => {
        /* 非 Tauri 环境，忽略 */
      });

    // 实时订阅
    let unlisten: (() => void) | undefined;
    subscribePipelineStats((incoming) => setStats(incoming))
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* 非 Tauri 环境，忽略 */
      });

    return () => {
      unlisten?.();
    };
  }, []);

  return stats;
}
