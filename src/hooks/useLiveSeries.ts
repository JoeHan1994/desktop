'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 生成一个围绕基准值轻微随机游走的“实时”数值序列。
 *
 * 用于让吞吐量、FPS、检索延迟等指标控件呈现活跃的跳动感（占位演示），
 * 后端接入真实数据后可直接替换数据源。
 *
 * @param base    基准值
 * @param jitter  抖动幅度（±）
 * @param length  折线历史长度
 * @param interval 刷新间隔（毫秒）
 */
export function useLiveSeries(
  base: number,
  jitter: number,
  length = 24,
  interval = 1200
): { value: number; series: number[] } {
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length }, () => base)
  );
  const baseRef = useRef(base);
  baseRef.current = base;

  useEffect(() => {
    const id = setInterval(() => {
      setSeries((prev) => {
        const next = baseRef.current + (Math.random() * 2 - 1) * jitter;
        return [...prev.slice(1), Math.max(0, next)];
      });
    }, interval);
    return () => clearInterval(id);
  }, [jitter, interval]);

  return { value: series[series.length - 1], series };
}
