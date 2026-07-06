'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import {
  useModelProviders,
  type ModelProvider,
  type ProviderType,
} from '@/features/models/ModelProvidersContext';
import { streamChat, type LLMMessage, type TokenStats } from '@/services/llmClient';

/* ------------------------------------------------------------------ */
/* 共用：紧凑横向标题栏                                                 */
/* ------------------------------------------------------------------ */

function PageTitle({
  stage,
  title,
  desc,
}: {
  stage?: string;
  title: string;
  desc?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      {stage && (
        <span className="rounded-full bg-white/[0.07] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/45">
          {stage}
        </span>
      )}
      <h1 className="text-sm font-semibold tracking-tight text-white">{title}</h1>
      {desc && (
        <span className="hidden text-[11px] text-white/30 xl:block">— {desc}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 共用表单控件                                                         */
/* ------------------------------------------------------------------ */

const fieldCls =
  'w-full rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/35 focus:outline-none transition-colors';

function FormRow({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-xs text-white/60">
        {label}
        {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Model Provider 数据结构（类型由 ModelProvidersContext 提供）          */
/* ------------------------------------------------------------------ */


const PROVIDER_META: Record<
  ProviderType,
  { label: string; color: string; defaultUrl: string; keyPlaceholder: string; modelPlaceholder: string }
> = {
  ollama: {
    label: 'Ollama',
    color: '#34d399',
    defaultUrl: 'http://localhost:11434',
    keyPlaceholder: '（本地模式无需填写）',
    modelPlaceholder: 'llama3、qwen2、mistral…',
  },
  openai: {
    label: 'OpenAI',
    color: '#60a5fa',
    defaultUrl: 'https://api.openai.com/v1',
    keyPlaceholder: 'sk-…',
    modelPlaceholder: 'gpt-4o、gpt-3.5-turbo…',
  },
};

const EMPTY_FORM: Omit<ModelProvider, 'id'> = {
  name: '',
  provider: 'ollama',
  apiBaseUrl: PROVIDER_META.ollama.defaultUrl,
  model: '',
  apiKey: '',
};

/* ------------------------------------------------------------------ */
/* 配置弹框                                                             */
/* ------------------------------------------------------------------ */

function ProviderModal({
  onClose,
  onSave,
  initialData,
}: {
  onClose: () => void;
  onSave: (p: Omit<ModelProvider, 'id'>) => void;
  initialData?: Omit<ModelProvider, 'id'>;
}) {
  const [form, setForm] = useState<Omit<ModelProvider, 'id'>>(initialData ?? EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const meta = PROVIDER_META[form.provider];
  const isEditing = !!initialData;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function handleProvider(p: ProviderType) {
    setForm((prev) => ({
      ...prev,
      provider: p,
      apiBaseUrl: prev.apiBaseUrl === PROVIDER_META[prev.provider].defaultUrl
        ? PROVIDER_META[p].defaultUrl
        : prev.apiBaseUrl,
    }));
  }

  const canSave = form.name.trim() !== '' && form.model.trim() !== '';

  return (
    <>
      {/* 遮罩 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 弹框 */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      >
        <div
          className="pointer-events-auto w-[460px] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#111118]/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 顶部高光 */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          {/* 标题栏 */}
          <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-white">{isEditing ? '编辑 Model Provider' : '添加 Model Provider'}</h2>
              <p className="mt-0.5 text-[11px] text-white/35">{isEditing ? '修改模型接入配置' : '配置模型接入信息'}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-colors hover:bg-white/12 hover:text-white"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
              </svg>
            </button>
          </div>

          {/* 表单 */}
          <div className="space-y-4 px-6 py-5">

            {/* Name */}
            <FormRow label="名称" required>
              <input
                className={fieldCls}
                placeholder="给这个配置起个名字"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </FormRow>

            {/* Provider */}
            <FormRow label="Provider" required>
              <div className="flex gap-2">
                {(Object.keys(PROVIDER_META) as ProviderType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProvider(p)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-all ${
                      form.provider === p
                        ? 'border-current text-white'
                        : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
                    }`}
                    style={form.provider === p ? { color: PROVIDER_META[p].color, borderColor: PROVIDER_META[p].color + '60', background: PROVIDER_META[p].color + '14' } : {}}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: form.provider === p ? PROVIDER_META[p].color : 'currentColor' }}
                    />
                    {PROVIDER_META[p].label}
                  </button>
                ))}
              </div>
            </FormRow>

            {/* API Base URL */}
            <FormRow label="API Base URL">
              <input
                className={fieldCls}
                placeholder={meta.defaultUrl}
                value={form.apiBaseUrl}
                onChange={(e) => set('apiBaseUrl', e.target.value)}
              />
            </FormRow>

            {/* Model */}
            <FormRow label="Model" required>
              <input
                className={fieldCls}
                placeholder={meta.modelPlaceholder}
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
              />
            </FormRow>

            {/* API Key */}
            <FormRow label="API Key">
              <div className="relative">
                <input
                  className={fieldCls + ' pr-10'}
                  type={showKey ? 'text' : 'password'}
                  placeholder={meta.keyPlaceholder}
                  value={form.apiKey}
                  onChange={(e) => set('apiKey', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute inset-y-0 right-2.5 flex items-center text-white/30 hover:text-white/60 transition-colors"
                  tabIndex={-1}
                >
                  {showKey ? (
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" /><circle cx="8" cy="8" r="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
                      <path d="M2 2l12 12M6.5 6.6A2 2 0 0 0 9.4 9.4M5 4.3C3.3 5.4 2 7 2 8s2.5 5 6 5c1.3 0 2.5-.4 3.5-1M9 3.2C8.7 3.1 8.3 3 8 3c-3.5 0-6 4-6 4" />
                    </svg>
                  )}
                </button>
              </div>
            </FormRow>
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.08] px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/12 px-4 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => { onSave(form); onClose(); }}
              disabled={!canSave}
              className="rounded-xl px-4 py-1.5 text-sm font-medium text-neutral-900 transition-all disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: canSave ? meta.color : '#6b7280' }}
            >
              保存
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 列表行                                                               */
/* ------------------------------------------------------------------ */

function ProviderRow({
  provider,
  index,
  onEdit,
  onDelete,
}: {
  provider: ModelProvider;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = PROVIDER_META[provider.provider];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 200 }}
      className="flex items-center gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5 backdrop-blur transition-colors hover:bg-white/[0.06]"
    >
      {/* 左：provider 标识色竖条 */}
      <div className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />

      {/* 中：主要信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{provider.name}</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: meta.color + '22', color: meta.color }}
          >
            {meta.label}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3">
          <span className="truncate text-[11px] text-white/45">{provider.model}</span>
          <span className="shrink-0 text-white/20">·</span>
          <span className="truncate text-[11px] text-white/30">{provider.apiBaseUrl}</span>
        </div>
      </div>

      {/* 右：操作按钮组 */}
      <div className="flex shrink-0 items-center gap-1">
        {/* 编辑 */}
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/25 transition-colors hover:bg-white/10 hover:text-white/70"
          title="编辑"
        >
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.5 2.5 L11.5 4.5 L5 11 L2.5 11.5 L3 9 Z" />
            <line x1="8" y1="4" x2="10" y2="6" />
          </svg>
        </button>
        {/* 删除 */}
        <button
          type="button"
          onClick={onDelete}
          className="flex h-7 w-7 items-center justify-center rounded-full text-white/25 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
          title="删除"
        >
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" />
          </svg>
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings 视图                                                        */
/* ------------------------------------------------------------------ */

export function SettingsView() {
  const { providers, saveProvider, removeProvider } = useModelProviders();
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  function openNew() { setEditingProvider(null); setModalOpen(true); }
  function openEdit(p: ModelProvider) { setEditingProvider(p); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditingProvider(null); }

  function handleSave(data: Omit<ModelProvider, 'id'>) {
    if (editingProvider) {
      saveProvider({ ...data, id: editingProvider.id });
    } else {
      saveProvider({ ...data, id: Math.random().toString(36).slice(2) });
    }
  }

  function deleteProvider(id: string) {
    removeProvider(id);
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden">

      {/* 标题 + New 按钮 */}
      <div className="flex shrink-0 items-center justify-between">
        <PageTitle
          stage="系统 · Settings"
          title="Model Providers"
          desc="管理本地与云端模型接入配置"
        />
        <motion.button
          type="button"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => openNew()}
          className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-1.5 text-sm font-medium text-white/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
          </svg>
          New
        </motion.button>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {providers.length === 0 ? (
          /* 空状态 */
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
                <circle cx="12" cy="10" r="2" />
                <path d="M12 8V6M12 14v-2M10 10H8M16 10h-2" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-white/50">暂无 Model Provider</p>
              <p className="mt-1 text-[11px] text-white/25">点击右上角 New 按钮添加第一个配置</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pb-2 pr-1">
            <AnimatePresence initial={false}>
              {providers.map((p, i) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  index={i}
                  onEdit={() => openEdit(p)}
                  onDelete={() => deleteProvider(p.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 配置弹框 */}
      <AnimatePresence>
        {modalOpen && (
          <ProviderModal
            onClose={closeModal}
            onSave={handleSave}
            initialData={editingProvider ?? undefined}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 聊天 · Assistant                                                     */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  tokens: number;
  tokensPerSec?: number;      // assistant: 生成速度
  prefillPerSec?: number;     // user: 预填充速度
}

/** 粗估 token 数（中英文混合 ~3 字符/token） */
function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 3));
}

/** 模拟预填充速度（本地模型输入处理 200-500 tok/s） */
function simulatePrefill(tokens: number) {
  return parseFloat((200 + (tokens % 300)).toFixed(1));
}


/* ── Model Selector（从 ModelProvidersContext 读取配置的 provider）── */
function ModelSelector({
  selected,
  onChange,
}: {
  selected: ModelProvider | null;
  onChange: (m: ModelProvider) => void;
}) {
  const { providers } = useModelProviders();
  const [open, setOpen] = useState(false);
  const meta = PROVIDER_META;

  // 当 providers 变化时，若当前 selected 已不存在则自动选第一个
  const effectiveSelected = selected && providers.find((p) => p.id === selected.id)
    ? selected
    : providers[0] ?? null;

  if (providers.length === 0) {
    return (
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3.5 space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-white/35">Model</div>
        <div className="flex flex-col items-center gap-2 py-3 text-center">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <circle cx="12" cy="10" r="2" />
            <path d="M12 8V6M12 14v-2M10 10H8M16 10h-2" />
          </svg>
          <p className="text-[11px] text-white/35">暂无可用模型</p>
          <p className="text-[10px] text-white/20">请先在「设置」页面添加 Model Provider</p>
        </div>
      </div>
    );
  }

  const current = effectiveSelected!;
  const currentMeta = meta[current.provider];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3.5 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/35">Model</div>

      {/* Current model pill / trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-white/[0.09] bg-white/[0.06] px-3 py-2 transition-colors hover:bg-white/[0.09]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: currentMeta.color }}
          />
          <span className="truncate text-sm font-medium text-white/90">{current.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ backgroundColor: `${currentMeta.color}22`, color: currentMeta.color }}
          >
            {currentMeta.label}
          </span>
          <svg
            viewBox="0 0 10 10"
            className="h-3 w-3 text-white/30 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'none' }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2 4 L5 7 L8 4" />
          </svg>
        </div>
      </button>

      {/* Dropdown list */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-0.5">
              {providers.map((p) => {
                const pm = meta[p.provider];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p); setOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                      p.id === current.id
                        ? 'bg-white/[0.1] text-white'
                        : 'text-white/60 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: pm.color }}
                      />
                      <span className="truncate text-[13px]">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[9px] text-white/30 tabular-nums truncate max-w-[70px]">{p.model}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{ backgroundColor: `${pm.color}22`, color: pm.color }}
                      >
                        {pm.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Model name hint */}
      <div className="flex items-center justify-between text-[10px] text-white/30">
        <span>Model</span>
        <span className="tabular-nums truncate max-w-[120px]" style={{ color: currentMeta.color }}>{current.model || '—'}</span>
      </div>
    </div>
  );
}

/** Token 可视化面板：输入 / 输出 / 总计 / 速度 */
function TokenViz({
  messages,
  ctxLimit,
  latestStats,
}: {
  messages: ChatMessage[];
  ctxLimit: number;
  latestStats?: TokenStats;
}) {
  // 优先使用 API 返回的真实词元数；未可用时回退到字符估算
  const inputTokens  = latestStats?.promptTokens
    ?? messages.filter((m) => m.role === 'user').reduce((s, m) => s + m.tokens, 0);
  const outputTokens = latestStats?.completionTokens
    ?? messages.filter((m) => m.role === 'assistant').reduce((s, m) => s + m.tokens, 0);
  const totalTokens  = inputTokens + outputTokens;
  const ctxPct       = Math.min(100, Math.round((totalTokens / ctxLimit) * 100));

  // 每种节对自身最大値归一，避免一方过小看不见
  const maxTok = Math.max(inputTokens, outputTokens, 1);

  // tok/s：优先使用 API 实测値
  const avgInputTps = latestStats?.inputTps
    ? latestStats.inputTps.toFixed(0)
    : (() => {
        const msgs = messages.filter((m) => m.role === 'user' && m.prefillPerSec);
        return msgs.length
          ? (msgs.reduce((s, m) => s + (m.prefillPerSec ?? 0), 0) / msgs.length).toFixed(0)
          : '—';
      })();
  const avgOutputTps = latestStats?.outputTps
    ? latestStats.outputTps.toFixed(1)
    : (() => {
        const msgs = messages.filter((m) => m.role === 'assistant' && m.tokensPerSec);
        return msgs.length
          ? (msgs.reduce((s, m) => s + (m.tokensPerSec ?? 0), 0) / msgs.length).toFixed(1)
          : '—';
      })();

  const rows = [
    { label: 'Input',  tokens: inputTokens,  color: '#60a5fa', pct: (inputTokens  / maxTok) * 100 },
    { label: 'Output', tokens: outputTokens, color: '#a78bfa', pct: (outputTokens / maxTok) * 100 },
    { label: 'Total',  tokens: totalTokens,  color: '#e2e8f0', pct: Math.min(100, (totalTokens / ctxLimit) * 100 * (ctxLimit / Math.max(totalTokens, 1))) },
  ];

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] p-3.5 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-white/35">Tokens</div>

      {/* 三行横条（Input/Output 对最大値归一，Total 对 ctxLimit） */}
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] text-white/40">{r.label}</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: r.color }}>{r.tokens.toLocaleString()}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: r.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(r.pct, r.tokens > 0 ? 4 : 0)}%` }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 分割线 */}
      <div className="h-px bg-white/[0.06]" />

      {/* 速度双列 */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-[10px] text-white/35">Input tok/s</div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-[#60a5fa]">{avgInputTps}</div>
          <div className="text-[9px] text-white/25">prefill</div>
        </div>
        <div>
          <div className="text-[10px] text-white/35">Output tok/s</div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-[#a78bfa]">{avgOutputTps}</div>
          <div className="text-[9px] text-white/25">generation</div>
        </div>
      </div>

      {/* 分割线 */}
      <div className="h-px bg-white/[0.06]" />

      {/* 上下文用量 */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] text-white/35">Context window</span>
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: ctxPct > 80 ? '#f87171' : ctxPct > 60 ? '#fbbf24' : '#34d399' }}>
            {totalTokens.toLocaleString()} / {ctxLimit.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: ctxPct > 80 ? '#f87171' : ctxPct > 60 ? '#fbbf24' : '#34d399' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(ctxPct, totalTokens > 0 ? 2 : 0)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}

export function AssistantView() {
  const { providers } = useModelProviders();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState('');
  const [model, setModel]       = useState<ModelProvider | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [latestStats, setLatestStats] = useState<TokenStats | undefined>(undefined);
  const abortRef  = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 当 providers 列表变化时，确保选中项有效
  useEffect(() => {
    if (!model || !providers.find((p) => p.id === model.id)) {
      setModel(providers[0] ?? null);
    }
  }, [providers]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新消息到达时自动滚到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const effectiveModel = model ?? providers[0] ?? null;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !effectiveModel || isGenerating) return;

    setError(null);

    const userMsg: ChatMessage = {
      id: Math.random().toString(36).slice(2),
      role: 'user',
      content: text,
      ts: Date.now(),
      tokens: estimateTokens(text),
      prefillPerSec: simulatePrefill(estimateTokens(text)),
    };
    const assistantId = Math.random().toString(36).slice(2);
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      ts: Date.now(),
      tokens: 0,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsGenerating(true);

    const abort = new AbortController();
    abortRef.current = abort;

    // 把当前 messages + 新 userMsg 转成 LLMMessage[]
    const history: LLMMessage[] = [...messages, userMsg].map((m) => ({
      role: m.role as LLMMessage['role'],
      content: m.content,
    }));

    let accumulated = '';
    const startTs = Date.now();

    try {
      for await (const chunk of streamChat(effectiveModel, history, abort.signal)) {
        if (chunk.content) {
          accumulated += chunk.content;
          const tokenCount = estimateTokens(accumulated);
          const elapsed    = (Date.now() - startTs) / 1000;
          const tps        = elapsed > 0.1 ? tokenCount / elapsed : 0;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: accumulated, tokens: tokenCount, tokensPerSec: parseFloat(tps.toFixed(1)) }
                : m,
            ),
          );
        }
        // 最终 chunk: 更新真实统计
        if (chunk.done) {
          if (chunk.stats) {
            setLatestStats(chunk.stats);
            // 用真实 token 数更新 assistant 消息
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      tokens: chunk.stats!.completionTokens,
                      tokensPerSec: parseFloat(chunk.stats!.outputTps.toFixed(1)),
                    }
                  : m,
              ),
            );
          }
          break;
        }
      }
    } catch (err) {
      const e = err as Error;
      if (e.name !== 'AbortError') {
        setError(e.message);
        // 若 assistant 气泡是空的则移除，避免留下空白占位
        setMessages((prev) =>
          prev.filter((m) => !(m.id === assistantId && m.content === '')),
        );
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [input, effectiveModel, isGenerating, messages]);

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleClear() {
    if (isGenerating) abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setLatestStats(undefined);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const canSend = !!input.trim() && !!effectiveModel && !isGenerating;

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden">

      {/* ── 左 70%：对话区 ── */}
      <div className="flex min-h-0 flex-[7] flex-col gap-3">

        {/* 消息列表 */}
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">

          {/* 空状态 */}
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white/20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white/40">向 AI 助手提问以开始对话</p>
                {!effectiveModel && (
                  <p className="mt-1 text-[11px] text-rose-400/70">请先在「设置」页面添加 Model Provider</p>
                )}
              </div>
            </div>
          )}

          {/* 气泡列表 */}
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 22 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="mr-2.5 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06]">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white/50" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <circle cx="8" cy="6" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm bg-white/[0.12] text-white'
                        : 'rounded-tl-sm border border-white/[0.08] bg-white/[0.04]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      // 用户消息保持纯文本
                      msg.content || <span className="text-white/30 italic">（已取消）</span>
                    ) : (
                      // assistant 消息使用 Markdown 渲染
                      msg.content
                        ? <MarkdownContent content={msg.content} />
                        : isGenerating
                          ? null
                          : <span className="text-white/30 italic">（已取消）</span>
                    )}
                    {/* 流式光标 */}
                    {msg.role === 'assistant' && isGenerating && msg.id === messages[messages.length - 1]?.id && (
                      <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-white/50 align-middle" />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* 错误提示 */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3"
            >
              <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6" /><line x1="8" y1="5" x2="8" y2="8.5" /><circle cx="8" cy="11" r="0.5" fill="currentColor" />
              </svg>
              <span className="text-[12px] text-rose-300/80">{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 text-rose-400/50 hover:text-rose-400 transition-colors">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 输入栏 */}
        <div className="shrink-0 flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.04] px-3 py-2.5 backdrop-blur focus-within:border-white/25 transition-colors">
          {/* 清除按钮 */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="清除对话"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-white/25 transition-all hover:bg-white/[0.08] hover:text-white/60"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" />
              </svg>
            </button>
          )}

          <input
            className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
            placeholder={effectiveModel ? `向 ${effectiveModel.name} 提问…` : '请先配置 Model Provider…'}
            value={input}
            disabled={isGenerating}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
          />

          {/* 停止 / 发送 按钮 */}
          {isGenerating ? (
            <button
              type="button"
              onClick={handleStop}
              title="停止生成"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-rose-500/40 bg-rose-500/[0.12] text-rose-400 transition-all hover:bg-rose-500/20"
            >
              <svg viewBox="0 0 10 10" className="h-3 w-3" fill="currentColor">
                <rect x="2" y="2" width="6" height="6" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/90 text-neutral-900 transition-all hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="12" x2="7" y2="2" /><path d="M3 6 L7 2 L11 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── 右 30%：模型选择 + Token 可视化 ── */}
      <div className="flex min-h-0 flex-[3] flex-col gap-3 overflow-y-auto">
        <ModelSelector selected={model} onChange={setModel} />
        <TokenViz messages={messages} ctxLimit={32768} latestStats={latestStats} />
      </div>

    </div>
  );
}
