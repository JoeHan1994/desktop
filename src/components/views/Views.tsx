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
        <span className="glass glass-chip px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/45">
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
  'glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none';

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
          className="glass pointer-events-auto w-[460px] overflow-hidden rounded-2xl shadow-2xl shadow-black/60"
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
              className="glass glass-icon-button glass-control h-7 w-7 rounded-full"
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
                    className={`glass glass-button glass-control flex-1 rounded-xl py-2 text-sm font-medium ${
                      form.provider === p
                        ? 'border-current text-white'
                        : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/70'
                    }`}
                    style={form.provider === p ? { color: PROVIDER_META[p].color, borderColor: PROVIDER_META[p].color + '60' } : {}}
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
                  className="absolute inset-y-0 right-2.5 flex items-center text-white/30 transition-colors hover:text-white/60"
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
              className="glass glass-button glass-control rounded-xl px-4 py-1.5 text-sm"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => { onSave(form); onClose(); }}
              disabled={!canSave}
              className="glass glass-button glass-control rounded-xl px-4 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              style={canSave ? { color: meta.color, borderColor: meta.color + '70' } : undefined}
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
      className="glass app-card app-card-control glass-control flex items-center gap-4 rounded-2xl px-4 py-3.5"
    >
      {/* 左：provider 标识色竖条 */}
      <div className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />

      {/* 中：主要信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{provider.name}</span>
          <span
            className="glass glass-chip shrink-0 px-2 py-0.5 text-[10px] font-medium"
            style={{ color: meta.color }}
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
          className="glass glass-icon-button glass-control h-7 w-7 rounded-full text-white/25"
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
          className="glass glass-icon-button glass-control h-7 w-7 rounded-full text-white/25 hover:!bg-rose-500/15 hover:text-rose-400"
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
          className="glass glass-button glass-control rounded-xl px-3.5 py-1.5 text-sm font-medium"
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
            <div className="glass glass-control flex h-14 w-14 items-center justify-center rounded-2xl">
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
      <div className="glass app-card rounded-xl p-3.5 space-y-2">
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
    <div className="glass app-card rounded-xl p-3.5 space-y-2.5">
      <div className="text-[10px] uppercase tracking-wider text-white/35">Model</div>

      {/* Current model pill / trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass app-card-surface app-card-control glass-control flex w-full items-center justify-between rounded-lg px-3 py-2"
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
            className="glass glass-chip px-1.5 py-0.5 text-[9px] font-semibold"
            style={{ color: currentMeta.color }}
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
                    className={`glass app-card-surface app-card-control glass-control flex w-full items-center justify-between rounded-lg px-3 py-2 ${
                      p.id === current.id
                        ? 'text-white'
                        : 'text-white/60 hover:text-white/80'
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
                        className="glass glass-chip px-1.5 py-0.5 text-[9px] font-semibold"
                        style={{ color: pm.color }}
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
    <div className="glass app-card rounded-xl p-3.5 space-y-3">
      <div className="text-[10px] uppercase tracking-wider text-white/35">Tokens</div>

      {/* 三行横条（Input/Output 对最大値归一，Total 对 ctxLimit） */}
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] text-white/40">{r.label}</span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: r.color }}>{r.tokens.toLocaleString()}</span>
            </div>
            <div className="glass-track h-1.5 w-full overflow-hidden rounded-full">
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
        <div className="glass-track h-1.5 w-full overflow-hidden rounded-full">
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
    if (messages.length === 0) return;
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
              <div className="glass glass-control flex h-14 w-14 items-center justify-center rounded-2xl">
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
                    <div className="glass glass-icon-button glass-control mr-2.5 mt-0.5 h-7 w-7 shrink-0 rounded-full">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white/50" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                        <circle cx="8" cy="6" r="3" /><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`glass glass-control max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-tr-sm text-white'
                        : 'rounded-tl-sm'
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
              className="glass glass-control mt-3 flex items-start gap-2 rounded-xl border-rose-500/20 px-4 py-3"
            >
              <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="8" cy="8" r="6" /><line x1="8" y1="5" x2="8" y2="8.5" /><circle cx="8" cy="11" r="0.5" fill="currentColor" />
              </svg>
              <span className="text-[12px] text-rose-300/80">{error}</span>
              <button type="button" onClick={() => setError(null)} className="ml-auto shrink-0 text-rose-400/50 transition-colors hover:text-rose-400">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
                </svg>
              </button>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 输入栏 */}
        <div className="glass glass-input shrink-0 flex items-center gap-2 rounded-2xl px-3 py-2.5">
          {/* 清除按钮 */}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              title="清除对话"
              className="glass glass-icon-button glass-control h-7 w-7 shrink-0 rounded-xl text-white/25"
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
              className="glass glass-icon-button glass-control h-7 w-7 shrink-0 rounded-xl border-rose-500/40 text-rose-400 hover:!bg-rose-500/20"
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
              className="glass glass-icon-button glass-control h-7 w-7 shrink-0 rounded-xl text-white disabled:cursor-not-allowed disabled:opacity-30"
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

/* ------------------------------------------------------------------ */
/* RAG · 检索增强生成                                                   */
/* ------------------------------------------------------------------ */

type RagMode = 'hybrid' | 'vector' | 'keyword';

interface RagSource {
  id: string;
  title: string;
  origin: string;
  score: number;
  tokens: number;
  freshness: string;
  excerpt: string;
  tags: string[];
}

const RAG_SOURCES: RagSource[] = [
  {
    id: 'SRC-01',
    title: '向量索引字段说明.md',
    origin: 'docs / architecture',
    score: 0.94,
    tokens: 418,
    freshness: '2h ago',
    excerpt: 'embedding_id、chunk_hash 与 source_uri 共同构成可追溯上下文，召回阶段需要保留原始片段边界。',
    tags: ['schema', 'chunk'],
  },
  {
    id: 'SRC-02',
    title: '产品问答样例.jsonl',
    origin: 'datasets / qa',
    score: 0.88,
    tokens: 352,
    freshness: '1d ago',
    excerpt: '回答必须引用命中的资料片段，并在置信度不足时给出需要补充索引的字段。',
    tags: ['answer', 'grounding'],
  },
  {
    id: 'SRC-03',
    title: '召回链路验收清单.md',
    origin: 'ops / checklist',
    score: 0.81,
    tokens: 286,
    freshness: '3d ago',
    excerpt: 'Top-K、rerank 阈值、重复片段折叠和引用覆盖率是页面调试时最常看的四个指标。',
    tags: ['rerank', 'metrics'],
  },
];

const RAG_STEPS = [
  { label: 'Query', value: '语义改写', pct: 100, color: '#60a5fa' },
  { label: 'Retrieve', value: 'Top-K 8', pct: 82, color: '#34d399' },
  { label: 'Rerank', value: '阈值 0.72', pct: 68, color: '#fbbf24' },
  { label: 'Ground', value: '3 sources', pct: 74, color: '#a78bfa' },
];

function RagScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="glass-track h-1.5 w-full overflow-hidden rounded-full">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

function RagSourceCard({ source, active, onSelect }: { source: RagSource; active: boolean; onSelect: () => void }) {
  const color = source.score > 0.9 ? '#34d399' : source.score > 0.84 ? '#60a5fa' : '#fbbf24';

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -1 }}
      className={`glass app-card app-card-control glass-control w-full rounded-2xl p-3.5 text-left transition-colors ${
        active ? 'text-white' : 'text-white/70 hover:text-white/90'
      }`}
      style={active ? { borderColor: 'rgb(var(--accent-rgb) / 0.45)' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="glass glass-chip shrink-0 px-2 py-0.5 text-[10px] font-semibold text-white/45">{source.id}</span>
            <span className="truncate text-sm font-semibold text-white">{source.title}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-white/30">
            <span className="truncate">{source.origin}</span>
            <span>·</span>
            <span>{source.freshness}</span>
            <span>·</span>
            <span className="tabular-nums">{source.tokens} tok</span>
          </div>
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums" style={{ color }}>{Math.round(source.score * 100)}%</span>
      </div>

      <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-white/45">{source.excerpt}</p>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <RagScoreBar value={source.score} color={color} />
        </div>
        <div className="flex shrink-0 gap-1">
          {source.tags.map((tag) => (
            <span key={tag} className="glass glass-chip px-1.5 py-0.5 text-[9px] text-white/35">{tag}</span>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

export function RagView() {
  const [query, setQuery] = useState('如何让 RAG 回答带上可靠引用？');
  const [mode, setMode] = useState<RagMode>('hybrid');
  const [activeSourceId, setActiveSourceId] = useState(RAG_SOURCES[0].id);
  const activeSource = RAG_SOURCES.find((source) => source.id === activeSourceId) ?? RAG_SOURCES[0];
  const modeCopy: Record<RagMode, { label: string; desc: string }> = {
    hybrid: { label: 'Hybrid', desc: '向量 + 关键词' },
    vector: { label: 'Vector', desc: '语义召回优先' },
    keyword: { label: 'Keyword', desc: '精确词匹配' },
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <PageTitle
          stage="系统 · RAG"
          title="RAG Workspace"
          desc="设计检索、重排与引用校验流程"
        />
        <div className="glass glass-control hidden items-center gap-1 rounded-full p-1 md:flex">
          {(Object.keys(modeCopy) as RagMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                mode === item ? 'bg-white/12 text-white' : 'text-white/35 hover:text-white/65'
              }`}
            >
              {modeCopy[item].label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
          <div className="glass glass-input shrink-0 rounded-2xl p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-white/35">Query Composer</span>
              <span className="glass glass-chip px-2 py-0.5 text-[10px] text-white/35">{modeCopy[mode].desc}</span>
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={3}
                className="min-h-[84px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-white placeholder:text-white/25 focus:outline-none"
                placeholder="输入一个需要检索增强的问题"
              />
              <button
                type="button"
                title="预览检索"
                className="glass glass-icon-button glass-control h-9 w-9 shrink-0 rounded-xl text-white"
              >
                <svg viewBox="0 0 14 14" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="4" /><path d="m9.2 9.2 3 3" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
            {RAG_STEPS.map((step) => (
              <div key={step.label} className="glass app-card rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">{step.label}</span>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: step.color }} />
                </div>
                <div className="mt-2 text-sm font-semibold text-white">{step.value}</div>
                <div className="mt-2">
                  <RagScoreBar value={step.pct / 100} color={step.color} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="flex shrink-0 items-center justify-between px-1">
                <span className="text-[10px] uppercase tracking-wider text-white/35">Retrieved Sources</span>
                <span className="text-[10px] text-white/25">Top 3 / mock</span>
              </div>
              <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                {RAG_SOURCES.map((source) => (
                  <RagSourceCard
                    key={source.id}
                    source={source}
                    active={source.id === activeSource.id}
                    onSelect={() => setActiveSourceId(source.id)}
                  />
                ))}
              </div>
            </div>

            <div className="glass app-card flex min-h-0 flex-col overflow-hidden rounded-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-white/35">Grounded Answer Preview</div>
                  <div className="mt-1 truncate text-sm font-semibold text-white">{activeSource.title}</div>
                </div>
                <span className="glass glass-chip shrink-0 px-2 py-0.5 text-[10px] text-emerald-300/80">Cited</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="space-y-3 text-sm leading-relaxed text-white/70">
                  <p>
                    RAG 回答页会先展示命中的上下文，再把引用片段折叠进回答草稿。当前选中的资料片段建议作为主引用，
                    同时保留来源、分数和 token 开销，方便后续接入真实检索链路。
                  </p>
                  <div className="app-card-surface rounded-xl p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-white/35">Selected Context</span>
                      <span className="text-[10px] tabular-nums text-white/30">score {activeSource.score.toFixed(2)}</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-white/55">{activeSource.excerpt}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="app-card-surface rounded-xl p-3">
                      <div className="text-[10px] text-white/35">Coverage</div>
                      <div className="mt-1 text-lg font-bold tabular-nums text-emerald-300">86%</div>
                    </div>
                    <div className="app-card-surface rounded-xl p-3">
                      <div className="text-[10px] text-white/35">Latency</div>
                      <div className="mt-1 text-lg font-bold tabular-nums text-sky-300">128ms</div>
                    </div>
                    <div className="app-card-surface rounded-xl p-3">
                      <div className="text-[10px] text-white/35">Context</div>
                      <div className="mt-1 text-lg font-bold tabular-nums text-violet-300">1.1k</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <GlassCard title="Retrieval Settings" subtitle="frontend draft" className="rounded-2xl">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="app-card-surface rounded-xl p-3">
                  <div className="text-[10px] text-white/35">Top-K</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-white">8</div>
                </div>
                <div className="app-card-surface rounded-xl p-3">
                  <div className="text-[10px] text-white/35">Threshold</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-white">0.72</div>
                </div>
              </div>
              {[
                { label: 'Chunk overlap', value: 18, color: '#60a5fa' },
                { label: 'Rerank weight', value: 72, color: '#a78bfa' },
                { label: 'Citation guard', value: 86, color: '#34d399' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-white/35">{item.label}</span>
                    <span className="tabular-nums text-white/45">{item.value}%</span>
                  </div>
                  <RagScoreBar value={item.value / 100} color={item.color} />
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard title="Prompt Contract" subtitle="answer constraints" className="rounded-2xl">
            <div className="space-y-2 text-[12px] leading-relaxed text-white/50">
              <div className="app-card-surface rounded-xl p-3">必须优先回答已检索上下文能支撑的内容。</div>
              <div className="app-card-surface rounded-xl p-3">每个关键结论至少关联一个 source id。</div>
              <div className="app-card-surface rounded-xl p-3">当召回分数低于阈值时，提示需要补充资料。</div>
            </div>
          </GlassCard>

          <GlassCard title="Index Health" subtitle="local preview" className="rounded-2xl">
            <div className="space-y-3">
              {[
                ['Documents', '1,284'],
                ['Chunks', '18,920'],
                ['Embeddings', '18,907'],
                ['Stale files', '13'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-white/40">{label}</span>
                  <span className="font-semibold tabular-nums text-white/80">{value}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Knowledge Base Manager                                               */
/* ------------------------------------------------------------------ */

type KbParseStatus = 'parsing' | 'completed';
type KbFormat = 'pdf' | 'excel' | 'word';

interface KbChunk {
  id: string;
  index: number;
  title: string;
  text: string;
  chars: number;
  tokens: number;
  metadata: Record<string, string | number>;
}

interface KbFileRecord {
  id: string;
  name: string;
  size: number;
  format: KbFormat;
  status: KbParseStatus;
  autoComplete?: boolean;
  chunks: KbChunk[];
}

const KB_TOKEN_LIMIT = 8192;

function inferKbFormat(fileName: string): KbFormat | null {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'xls' || extension === 'xlsx' || extension === 'csv') return 'excel';
  if (extension === 'doc' || extension === 'docx') return 'word';
  return null;
}

function formatKbFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function createKbChunks(fileName: string, size: number, format: KbFormat): KbChunk[] {
  const chunkCount = Math.min(12, Math.max(3, Math.ceil(size / 520000)));
  return Array.from({ length: chunkCount }, (_, index) => {
    const chars = 820 + index * 134 + (fileName.length % 7) * 29;
    const tokens = Math.round(chars * 1.27 + index * 18);
    const metadata: Record<string, string | number> = {
      页码: format === 'excel' ? `Sheet ${Math.max(1, index % 3 + 1)}` : index + 1,
      格式: format,
      提取时间: '2026-07',
      source: fileName,
    };

    return {
      id: `${fileName}-${index + 1}`,
      index: index + 1,
      title: `Chunk ${String(index + 1).padStart(2, '0')}`,
      text: `${fileName} 的第 ${index + 1} 个数据块。这里保留清洗后的正文、表格行语义和来源边界，用于后续 embedding 与引用追踪。`,
      chars,
      tokens,
      metadata,
    };
  });
}

const KB_INITIAL_FILES: KbFileRecord[] = [
  {
    id: 'kb-file-01',
    name: 'manual.pdf',
    size: 2840000,
    format: 'pdf',
    status: 'completed',
    chunks: createKbChunks('manual.pdf', 2840000, 'pdf'),
  },
  {
    id: 'kb-file-02',
    name: 'sales_forecast.xlsx',
    size: 1260000,
    format: 'excel',
    status: 'completed',
    chunks: createKbChunks('sales_forecast.xlsx', 1260000, 'excel'),
  },
  {
    id: 'kb-file-03',
    name: 'policy_draft.docx',
    size: 940000,
    format: 'word',
    status: 'parsing',
    autoComplete: false,
    chunks: createKbChunks('policy_draft.docx', 940000, 'word'),
  },
];

function KbProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="app-card-surface h-1.5 w-full overflow-hidden rounded-full">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
      />
    </div>
  );
}

function KbVectorHeatmap() {
  const cells = Array.from({ length: 64 }, (_, index) => Math.sin(index * 1.37) * Math.cos(index * 0.41));

  return (
    <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-0.5">
      {cells.map((value, index) => {
        const opacity = 0.22 + Math.abs(value) * 0.68;
        const backgroundColor = value >= 0
          ? `rgb(96 165 250 / ${opacity.toFixed(2)})`
          : `rgb(248 113 113 / ${opacity.toFixed(2)})`;
        return <span key={index} className="h-2 rounded-[2px]" style={{ backgroundColor }} />;
      })}
    </div>
  );
}

function KbChunkCard({ chunk, active, onSelect }: { chunk: KbChunk; active: boolean; onSelect: () => void }) {
  const tokenPct = (chunk.tokens / KB_TOKEN_LIMIT) * 100;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`glass app-card app-card-control glass-control w-full rounded-2xl p-3 text-left ${active ? 'text-white' : 'text-white/65 hover:text-white/85'}`}
      style={active ? { borderColor: 'rgb(var(--accent-rgb) / calc(var(--glass-border-alpha) * 1.8))', backgroundColor: 'rgb(var(--accent-rgb) / calc(var(--glass-alpha) * 0.7))' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="glass glass-chip px-2 py-0.5 text-[10px] text-white/45">#{chunk.index}</span>
            <span className="truncate text-sm font-semibold text-white">{chunk.title}</span>
          </div>
          <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-white/45">{chunk.text}</p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-white/35">{chunk.tokens} tok</span>
      </div>
      <div className="mt-3 space-y-2">
        <KbProgressBar value={tokenPct} color={tokenPct > 100 ? '#f87171' : tokenPct > 72 ? '#fbbf24' : '#34d399'} />
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(chunk.metadata).map(([key, value]) => (
            <span key={key} className="glass-chip app-card-surface px-1.5 py-0.5 text-[9px] text-white/38">
              {key}: {value}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

function KbFileCard({ file, active, onSelect }: { file: KbFileRecord; active: boolean; onSelect: () => void }) {
  const completed = file.status === 'completed';
  const totalTokens = file.chunks.reduce((sum, chunk) => sum + chunk.tokens, 0);
  const progress = completed ? 100 : 46;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!completed}
      className={`glass app-card app-card-control glass-control w-full rounded-2xl p-3 text-left ${
        active ? 'text-white' : completed ? 'text-white/70 hover:text-white/90' : 'cursor-wait text-white/42'
      }`}
      style={active ? { borderColor: 'rgb(var(--accent-rgb) / calc(var(--glass-border-alpha) * 1.9))', backgroundColor: 'rgb(var(--accent-rgb) / calc(var(--glass-alpha) * 0.78))' } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{file.name}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-white/30">{file.format} · {formatKbFileSize(file.size)}</div>
        </div>
        <span className={`glass-chip shrink-0 border px-2 py-0.5 text-[10px] ${completed ? 'glass-status-success text-emerald-300/80' : 'glass-status-warning text-amber-300/80'}`}>
          {completed ? '已完成' : '解析中'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="app-card-surface rounded-xl px-2.5 py-2">
          <div className="text-[9px] uppercase text-white/28">Chunks</div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-white">{file.chunks.length}</div>
        </div>
        <div className="app-card-surface rounded-xl px-2.5 py-2">
          <div className="text-[9px] uppercase text-white/28">Tokens</div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-white">{Math.round(totalTokens / 100) / 10}k</div>
        </div>
      </div>

      <div className="mt-3">
        <KbProgressBar value={progress} color={completed ? '#34d399' : '#fbbf24'} />
      </div>
    </button>
  );
}

export function KnowledgeBaseManagerView() {
  const [files, setFiles] = useState<KbFileRecord[]>(KB_INITIAL_FILES);
  const [selectedFileId, setSelectedFileId] = useState(KB_INITIAL_FILES[0].id);
  const [selectedChunkId, setSelectedChunkId] = useState(KB_INITIAL_FILES[0].chunks[0].id);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const parsingFiles = files.filter((file) => file.status === 'parsing' && file.autoComplete !== false);
    if (parsingFiles.length === 0) return;

    const timers = parsingFiles.map((file) => window.setTimeout(() => {
      setFiles((previousFiles) => previousFiles.map((item) => (
        item.id === file.id ? { ...item, status: 'completed' } : item
      )));
    }, 1400 + file.chunks.length * 180));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [files]);

  const selectedFile = files.find((file) => file.id === selectedFileId) ?? files[0];
  const selectedChunk = selectedFile.chunks.find((chunk) => chunk.id === selectedChunkId) ?? selectedFile.chunks[0];
  const tokenPct = (selectedChunk.tokens / KB_TOKEN_LIMIT) * 100;
  const isTruncated = selectedChunk.tokens > KB_TOKEN_LIMIT;
  const completedChunks = Math.max(0, selectedFile.chunks.length - 4);
  const processingChunks = Math.min(4, selectedFile.chunks.length);
  const waitingChunks = Math.max(0, selectedFile.chunks.length - completedChunks - processingChunks);
  const reqSizeKb = (selectedChunk.tokens * 2.8 / 1024).toFixed(1);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const incomingFiles = Array.from(fileList)
      .map((file, index): KbFileRecord | null => {
        const format = inferKbFormat(file.name);
        if (!format) return null;
        return {
          id: `kb-upload-${Date.now()}-${index}`,
          name: file.name,
          size: file.size,
          format,
          status: 'parsing' as const,
          chunks: createKbChunks(file.name, file.size, format),
        };
      })
      .filter((file): file is KbFileRecord => file !== null);

    if (incomingFiles.length === 0) return;
    setFiles((previousFiles) => [...incomingFiles, ...previousFiles]);
    setSelectedFileId(incomingFiles[0].id);
    setSelectedChunkId(incomingFiles[0].chunks[0].id);
  }

  function selectFile(file: KbFileRecord) {
    if (file.status !== 'completed') return;
    setSelectedFileId(file.id);
    setSelectedChunkId(file.chunks[0].id);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <PageTitle
          stage="系统 · Knowledge"
          title="Knowledge Base Manager"
          desc="上传解析、Chunk 审核与向量化流水线预览"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="glass glass-button glass-control rounded-xl px-3.5 py-1.5 text-sm font-medium"
        >
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 10V2" /><path d="M3.5 5.5 7 2l3.5 3.5" /><path d="M2 10v1.5h10V10" />
          </svg>
          Upload
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.xls,.xlsx,.doc,.docx"
        className="hidden"
        onChange={(event) => addFiles(event.target.files)}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-3">
          <div
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              addFiles(event.dataTransfer.files);
            }}
            className={`glass app-card app-card-control glass-control shrink-0 rounded-2xl p-3 ${dragActive ? 'border-white/35 text-white' : 'text-white/60'}`}
          >
            <div className="flex items-start gap-3">
              <div className="glass-icon-button app-card-surface glass-control flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-white/45" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3h16v-3" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">拖拽文件</div>
                <div className="mt-1 text-[11px] leading-relaxed text-white/35">支持 PDF / Excel / Word，解析完成后进入 Chunk 审核。</div>
              </div>
            </div>
          </div>

          <div className="glass app-card flex min-h-0 flex-col overflow-hidden rounded-2xl p-3">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-white/35">Files</div>
                <div className="mt-1 text-sm font-semibold text-white">上传与解析状态</div>
              </div>
              <span className="glass-chip app-card-surface px-2 py-0.5 text-[10px] text-white/35">{files.length} files</span>
            </div>
            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              {files.map((file) => (
                <KbFileCard
                  key={file.id}
                  file={file}
                  active={file.id === selectedFile.id}
                  onSelect={() => selectFile(file)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-hidden lg:col-span-5">
          <div className="glass app-card shrink-0 rounded-2xl p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-white/35">Chunk Viewer</div>
                <div className="mt-1 truncate text-sm font-semibold text-white">{selectedFile.name}</div>
              </div>
              <div className="glass-chip app-card-surface shrink-0 px-2.5 py-1 text-[11px] text-white/45">
                Rust chunks: <span className="font-semibold text-white">{selectedFile.chunks.length}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="app-card-surface rounded-xl p-2.5">
                <div className="text-[9px] uppercase text-white/30">Chars</div>
                <div className="mt-1 text-base font-bold tabular-nums text-white">{selectedChunk.chars}</div>
              </div>
              <div className="app-card-surface rounded-xl p-2.5">
                <div className="text-[9px] uppercase text-white/30">Tokens</div>
                <div className="mt-1 text-base font-bold tabular-nums text-white">{selectedChunk.tokens}</div>
              </div>
              <div className="app-card-surface rounded-xl p-2.5">
                <div className="text-[9px] uppercase text-white/30">Limit</div>
                <div className="mt-1 text-base font-bold tabular-nums text-emerald-300">{Math.round(tokenPct)}%</div>
              </div>
            </div>

            <div className="app-card-surface mt-3 rounded-xl p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-wider text-white/35">Metadata Audit</span>
                <span className="glass-chip glass-status-success border px-2 py-0.5 text-[10px] text-emerald-300/80">bound</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(selectedChunk.metadata).map(([key, value]) => (
                  <span key={key} className="glass-chip app-card-surface px-2 py-0.5 text-[10px] text-white/50">
                    {key}: {value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
            {selectedFile.chunks.map((chunk) => (
              <KbChunkCard
                key={chunk.id}
                chunk={chunk}
                active={chunk.id === selectedChunk.id}
                onSelect={() => setSelectedChunkId(chunk.id)}
              />
            ))}
          </div>
        </div>

        <div className="glass app-card flex min-h-0 flex-col overflow-hidden rounded-2xl p-3.5 lg:col-span-4">
          <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Vectorization Pipeline</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/35">bge-m3 local preview</div>
            </div>
            <span className="glass-chip app-card-surface px-2 py-0.5 text-[10px] text-white/35">5 stages</span>
          </div>

            <button
              type="button"
              className="glass-button glass-action-success glass-control mb-3 w-full shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold text-emerald-300"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 2.5 11 7 3 11.5z" />
              </svg>
              触发向量化
            </button>

            <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
              <div className="app-card-surface rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">Stage 1 · Tokenization</span>
                  <span className={`text-[10px] ${isTruncated ? 'text-rose-300' : 'text-emerald-300/80'}`}>{isTruncated ? '自动截断' : '安全'}</span>
                </div>
                <div className="mt-2 text-[12px] text-white/55">
                  原始文本：{selectedChunk.chars} 字 -&gt; 预估 Token：{selectedChunk.tokens}
                </div>
                <div className="mt-2">
                  <KbProgressBar value={tokenPct} color={isTruncated ? '#f87171' : tokenPct > 70 ? '#fbbf24' : '#34d399'} />
                </div>
                <div className="mt-1 text-right text-[10px] tabular-nums text-white/30">{selectedChunk.tokens} / {KB_TOKEN_LIMIT}</div>
              </div>

              <div className="app-card-surface rounded-xl p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-white/35">Stage 2 · Batching Queue</div>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="app-card-surface rounded-xl p-2 text-center">
                      <div className="text-[9px] text-white/30">Pipe {index + 1}</div>
                      <div className="glass-pipe-active mt-1 h-8 rounded-lg" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[11px] text-white/45">
                  [ 已完成: {completedChunks} | 正在处理: {processingChunks} | 队列等待: {waitingChunks} ]
                </div>
              </div>

              <div className="app-card-surface rounded-xl p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-white/35">Stage 3 · API Payload & Compute</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['Req Size', `${reqSizeKb}KB`, '#60a5fa'],
                    ['CPU', '64%', '#fbbf24'],
                    ['GPU VRAM', '5.8GB', '#a78bfa'],
                  ].map(([label, value, color]) => (
                    <div key={label} className="app-card-surface rounded-xl p-2">
                      <div className="text-[9px] text-white/30">{label}</div>
                      <div className="mt-1 text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-white/40">POST http://localhost:11434 · Ollama Response: 45ms</div>
              </div>

              <div className="app-card-surface rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">Stage 4 · Vector L2 Norm</span>
                  <span className="glass-chip glass-status-success border px-2 py-0.5 text-[10px] text-emerald-300/80">L2 Normalize Success</span>
                </div>
                <div className="mt-3">
                  <KbVectorHeatmap />
                </div>
                <div className="mt-2 text-[11px] text-white/40">1024-d Vec&lt;f32&gt; -&gt; unit vector, ready for dot product search.</div>
              </div>

              <div className="app-card-surface rounded-xl p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">Stage 5 · Upsert & Indexing</span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-300/80">
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 6.5 4.8 9 10 3" />
                    </svg>
                    Success
                  </span>
                </div>
                <div className="app-card-surface mt-2 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-white/55">
                  Insert ID: doc_chunk_{String(selectedChunk.index).padStart(2, '0')}<br />
                  &quot;source&quot;: &quot;{selectedFile.name}&quot;, &quot;page&quot;: &quot;{selectedChunk.metadata.页码}&quot; 已强绑定入库
                </div>
              </div>
            </div>
        </div>
      </div>
    </div>
  );
}
