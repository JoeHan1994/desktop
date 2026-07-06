'use client';

import { ControlPanel } from '@/components/ControlPanel';
import { PipelineStepper } from '@/features/pipeline/PipelineStepper';
import {
  AnnSearchWidget,
  ChunkingWidget,
  CleaningWidget,
  DataSourceWidget,
  DatabaseWidget,
  IndexWidget,
  InferenceWidget,
  MetadataWidget,
  ModelWidget,
  QueryEmbedWidget,
  RagWidget,
  RerankWidget,
  ReduceWidget,
  RenderWidget,
  UpsertWidget,
} from '@/features/pipeline/StageWidgets';
import { usePipelineStats } from '@/hooks/usePipelineStats';

/**
 * 向量数据库全流程仪表盘。
 *
 * 顶部为 5 阶段流水线步进器，下方为覆盖各阶段「可视化埋点信息」的液态玻璃控件网格。
 * 通过 `usePipelineStats` 实时订阅 Rust 后端推送的统计数据，各控件优先展示真实数据，
 * 无数据时降级为演示占位值。
 */
export function Dashboard() {
  const stats = usePipelineStats();
  const activeStage = stats?.active_stage ?? 5;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16">
      {/* 流水线概览 */}
      <div className="mx-auto mb-8 max-w-3xl">
        <PipelineStepper active={activeStage} />
      </div>

      {/* 检索控制台 */}
      <div className="mb-8 flex justify-center">
        <ControlPanel stats={stats} />
      </div>

      {/* 埋点指标控件网格 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DataSourceWidget index={0} stats={stats} />
        <CleaningWidget index={1} stats={stats} />
        <ChunkingWidget index={2} stats={stats} />
        <ModelWidget index={3} stats={stats} />
        <InferenceWidget index={4} stats={stats} />
        <MetadataWidget index={5} stats={stats} />
        <DatabaseWidget index={6} stats={stats} />
        <UpsertWidget index={7} stats={stats} />
        <IndexWidget index={8} stats={stats} />
        <QueryEmbedWidget index={9} stats={stats} />
        <AnnSearchWidget index={10} stats={stats} />
        <RerankWidget index={11} stats={stats} />
        <ReduceWidget index={12} stats={stats} />
        <RenderWidget index={13} stats={stats} />
        <RagWidget index={14} stats={stats} />
      </div>
    </div>
  );
}

export default Dashboard;

