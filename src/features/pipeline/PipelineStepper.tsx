'use client';

import { motion } from 'framer-motion';

export interface PipelineStage {
  id: number;
  name: string;
  en: string;
}

export const PIPELINE_STAGES: PipelineStage[] = [
  { id: 1, name: '数据准备', en: 'Ingestion' },
  { id: 2, name: '向量化', en: 'Embedding' },
  { id: 3, name: '存储索引', en: 'Storage' },
  { id: 4, name: '检索优化', en: 'Retrieval' },
  { id: 5, name: '可视化', en: 'Visualize' },
];

/**
 * 5 阶段流水线步进器。
 *
 * 横向展示「数据准备 → 向量化 → 存储索引 → 检索优化 → 可视化」全流程，
 * 高亮当前活跃阶段，作为仪表盘的顶部导航概览。
 */
export function PipelineStepper({ active = 5 }: { active?: number }) {
  return (
    <div className="flex w-full items-center justify-between gap-1 px-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = stage.id < active;
        const current = stage.id === active;
        return (
          <div key={stage.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: 'spring', stiffness: 200 }}
                className={`glass glass-control flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold
                  ${
                    current
                      ? 'border-white/30 text-white shadow-lg shadow-black/30'
                      : done
                        ? 'border-white/20 text-white/80'
                        : 'border-white/12 text-white/40'
                  }`}
              >
                {stage.id}
              </motion.div>
              <div className="text-center">
                <div
                  className={`text-xs font-medium ${current ? 'text-white' : 'text-white/60'}`}
                >
                  {stage.name}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/30">
                  {stage.en}
                </div>
              </div>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div className="mx-1 mb-6 h-px flex-1 bg-gradient-to-r from-white/20 to-white/5" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PipelineStepper;
