'use client';

import { useCallback, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { startPipeline } from '@/services/tauriBridge';

interface DroppedFile {
  name: string;
  size: number;
  type: string;
  /** Tauri webview 注入的文件系统绝对路径（浏览器环境为空） */
  path?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 多源数据拖拽上传区（阶段 1.1）。
 *
 * 支持拖拽或点击选择本地文件，展示已选文件列表。
 * 在 Tauri 环境中，点击「开始处理」会将文件路径通过
 * `start_pipeline` Tauri 命令传给 Rust 后端执行完整流水线。
 */
export function FileDropzone({ className = '' }: { className?: string }) {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    const arr: DroppedFile[] = Array.from(list).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.name.split('.').pop()?.toUpperCase() ?? 'FILE',
      // Tauri webview 为 File 对象注入了非标准的 `path` 属性
      path: (f as File & { path?: string }).path,
    }));
    setFiles((prev) => [...prev, ...arr]);
    setDone(false);
  }, []);

  async function handleStartPipeline() {
    const paths = files.map((f) => f.path).filter((p): p is string => Boolean(p));
    if (paths.length === 0) return;
    setProcessing(true);
    try {
      await startPipeline(paths);
      setDone(true);
    } catch (err) {
      console.warn('[FileDropzone] start_pipeline 失败:', err);
    } finally {
      setProcessing(false);
    }
  }

  const hasRealPaths = files.some((f) => f.path);

  return (
    <GlassCard title="多源数据导入" subtitle="1.1 · Drag & Drop" index={0} className={className}>
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) =>
          (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()
        }
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors
          ${
            dragOver
              ? 'border-white/50 bg-white/10'
              : 'border-white/15 bg-black/20 hover:border-white/25'
          }`}
      >
        <svg
          className="h-9 w-9 text-white/50"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M17 8l-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
        <div className="text-sm text-white/70">
          拖拽文件到此处，或
          <span className="font-medium text-white">点击选择</span>
        </div>
        <div className="text-[11px] text-white/40">
          支持 PDF · Word · Markdown · Wiki · TXT
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-[11px] text-white/40">
            <span>已选 {files.length} 个文件</span>
            <button
              type="button"
              onClick={() => { setFiles([]); setDone(false); }}
              className="transition-colors hover:text-white/70"
            >
              清空
            </button>
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
              >
                <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
                  {f.type}
                </span>
                <span className="flex-1 truncate text-sm text-white/80">
                  {f.name}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-white/40">
                  {formatSize(f.size)}
                </span>
              </div>
            ))}
          </div>

          {/* 仅在 Tauri 环境（文件有 path 属性）时显示处理按钮 */}
          {hasRealPaths && (
            <button
              type="button"
              onClick={handleStartPipeline}
              disabled={processing}
              className={`mt-3 w-full rounded-2xl border px-4 py-2 text-sm font-semibold transition-colors
                ${done
                  ? 'border-emerald-400/30 bg-emerald-400/15 text-emerald-300'
                  : 'border-white/20 bg-white/10 text-white hover:bg-white/15 disabled:opacity-50'
                }`}
            >
              {processing ? '流水线运行中…' : done ? '✓ 处理完成' : '开始处理'}
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}

export default FileDropzone;

