'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/components/ui/GlassCard';

// ── 类型 ───────────────────────────────────────────────────────────────────

interface FileEntry {
  name: string;
  /** SFTP 路径，Windows OpenSSH 格式：/C:/Users/... */
  path: string;
  is_dir: boolean;
  size: number | null;
}

interface TreeNode extends FileEntry {
  /** null = 目录但尚未加载子项；[] = 已加载且为空 */
  children: TreeNode[] | null;
  expanded: boolean;
}

type ConnStatus = 'idle' | 'connecting' | 'connected' | 'error';

// ── 工具函数 ───────────────────────────────────────────────────────────────

function buildNodes(entries: FileEntry[]): TreeNode[] {
  return entries.map((e) => ({
    ...e,
    children: e.is_dir ? null : [],
    expanded: false,
  }));
}

/** 将 SFTP 路径（/C:/...）转换为可读的 Windows 路径（C:\...）。 */
function sftpToDisplay(path: string): string {
  // /C:/ → C:\
  return path.replace(/^\/([A-Za-z]):\//, '$1:\\').replace(/\//g, '\\');
}

/** 从 SFTP 磁盘路径（/C:/）提取盘符显示名（C:）。 */
function diskLabel(sftpDisk: string): string {
  const m = sftpDisk.match(/^\/([A-Za-z]):\//);
  return m ? `${m[1].toUpperCase()}:` : sftpDisk;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 深度更新树中匹配 targetPath 的节点。 */
function updateNode(
  nodes: TreeNode[],
  targetPath: string,
  updater: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return updater(n);
    if (n.children && n.children.length > 0) {
      return { ...n, children: updateNode(n.children, targetPath, updater) };
    }
    return n;
  });
}

// ── 错误 / 警告行分类与高亮显示 ─────────────────────────────────

/** 匹配错误级别的日志行模式（英文 + 中文 + 堆栈跟踪） */
const RE_ERROR = /\b(error|errors|exception|exceptions|fatal|critical|traceback|panic|crash|crashed|failed|failure)\b|\b(Error|Exception|Fatal)\b|\[\ *ERROR\b|\[\ *FATAL\b|错误|异常|失败|崩溃/i;

const RE_WARN  = /\b(warn(?:ing)?|caution|deprecated|deprecation)\b|\[\ *WARN\b|警告|注意/i;

/** Java/Python/.NET 堆栈跟踪行 */
const RE_STACK = /^\s+at\s+|^\s+caused\s+by\s*:|^\s+\.{3}\s+\d+\s+more\b|^\s+File\s+".+",\s+line\s+\d+/i;

type LineLevel = 'error' | 'warn' | 'normal';

function classifyLine(line: string): LineLevel {
  if (RE_ERROR.test(line) || RE_STACK.test(line)) return 'error';
  if (RE_WARN.test(line))  return 'warn';
  return 'normal';
}

const MAX_LINES = 8000;

/** 带行号的只读视图，错误行红色高亮，警告行黄色高亮。 */
function HighlightedContent({ content }: { content: string }) {
  const raw   = content.split('\n');
  const lines = raw.length > MAX_LINES ? raw.slice(0, MAX_LINES) : raw;
  const clipped = raw.length > MAX_LINES;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto select-text">
      <table className="w-full border-collapse font-mono text-[12.5px] leading-[1.65]">
        <tbody>
          {lines.map((line, i) => {
            const lvl = classifyLine(line);
            return (
              <tr
                key={i}
                className={`group ${
                  lvl === 'error' ? 'bg-rose-500/[0.09] hover:bg-rose-500/[0.14]' :
                  lvl === 'warn'  ? 'bg-amber-400/[0.08] hover:bg-amber-400/[0.13]' :
                  'hover:bg-white/[0.03]'
                }`}
              >
                {/* 行号 */}
                <td className="w-12 shrink-0 select-none pr-4 pl-3 text-right text-[11px] text-white/20 align-top pt-px">
                  {i + 1}
                </td>

                {/* 行内容 */}
                <td className={`pr-5 break-all whitespace-pre-wrap align-top ${
                  lvl === 'error' ? 'text-rose-300' :
                  lvl === 'warn'  ? 'text-amber-300' :
                  'text-white/78'
                }`}>
                  {/* 错误 / 警告左边屏 */}
                  {lvl !== 'normal' && (
                    <span className={`mr-2 inline-block h-full w-0.5 rounded-full align-middle ${
                      lvl === 'error' ? 'bg-rose-400' : 'bg-amber-400'
                    }`} />
                  )}
                  {line || '\u00a0'}
                </td>
              </tr>
            );
          })}

          {clipped && (
            <tr>
              <td colSpan={2} className="py-2 text-center text-[11px] text-white/25">
                文件较大，仅显示前 {MAX_LINES.toLocaleString()} 行（共 {raw.length.toLocaleString()} 行）
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── 树节点组件 ─────────────────────────────────────────────────────────────

function TreeItem({
  node,
  depth,
  selected,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selected: string | null;
  onSelect: (n: TreeNode) => void;
  onToggle: (n: TreeNode) => void;
}) {
  const isSelected = selected === node.path;

  return (
    <>
      <button
        type="button"
        onClick={() => (node.is_dir ? onToggle(node) : onSelect(node))}
        title={sftpToDisplay(node.path)}
        className={`flex w-full items-center gap-1.5 rounded-lg py-[3px] text-left text-[12px] transition-colors
          ${isSelected
            ? 'bg-white/10 text-white'
            : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'}`}
        style={{ paddingLeft: `${10 + depth * 14}px`, paddingRight: 8 }}
      >
        {/* 展开箭头 */}
        <span className="w-3 shrink-0 text-center text-[10px] text-white/25">
          {node.is_dir ? (node.expanded ? '▾' : '▸') : ''}
        </span>

        {/* 图标 */}
        <span className="shrink-0 text-[11px] leading-none">
          {node.is_dir ? (node.expanded ? '📂' : '📁') : getFileIcon(node.name)}
        </span>

        <span className="min-w-0 flex-1 truncate">{node.name}</span>

        {!node.is_dir && (
          <span className="shrink-0 text-[10px] text-white/20">{formatSize(node.size)}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {node.is_dir && node.expanded && node.children && (
          <motion.div
            key="ch"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {node.children.length === 0 ? (
              <span
                className="block text-[11px] text-white/20 py-0.5"
                style={{ paddingLeft: `${10 + (depth + 1) * 14 + 18}px` }}
              >
                空目录
              </span>
            ) : (
              node.children.map((child) => (
                <TreeItem
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  selected={selected}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** 根据文件扩展名返回对应 emoji 图标。 */
function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    txt: '📝', log: '📋', md: '📄', json: '📋', xml: '📋', yaml: '📋', yml: '📋',
    js: '🟨', ts: '🟦', jsx: '🟨', tsx: '🟦', css: '🎨', html: '🌐',
    py: '🐍', rs: '🦀', go: '🐹', java: '☕', cs: '💠', cpp: '⚙️', c: '⚙️',
    exe: '⚙️', dll: '🔧', bat: '📜', ps1: '📜', cmd: '📜',
    zip: '📦', rar: '📦', gz: '📦', tar: '📦',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', ico: '🖼️',
    mp4: '🎬', avi: '🎬', mp3: '🎵', wav: '🎵',
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗',
    ini: '⚙️', cfg: '⚙️', conf: '⚙️', env: '⚙️',
  };
  return map[ext] ?? '📄';
}

// ── 样式常量 ───────────────────────────────────────────────────────────────

const fieldCls =
  'glass glass-input w-full rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none';

// ── 主视图 ─────────────────────────────────────────────────────────────────

export function RemoteMachineView() {
  // 连接表单
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [connStatus, setConnStatus] = useState<ConnStatus>('idle');
  const [connError, setConnError] = useState('');

  // 文件树
  const [diskRoots, setDiskRoots] = useState<string[]>([]);
  const [trees, setTrees] = useState<Record<string, TreeNode[]>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // 编辑器
  const [fileContent, setFileContent] = useState('');
  const [editorDraft, setEditorDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const isDirty = useRef(false);
  const saveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── 连接 ────────────────────────────────────────────────────────────────

  async function handleConnect() {
    if (!host.trim() || !username.trim()) return;
    setConnStatus('connecting');
    setConnError('');
    try {
      await invoke('ssh_connect', {
        host: host.trim(),
        port: port.trim() ? Number(port) : undefined,
        username: username.trim(),
        password,
      });

      const disks: string[] = await invoke('ssh_get_disks');
      setDiskRoots(disks);

      // 预加载每个磁盘根目录的第一层
      const initTrees: Record<string, TreeNode[]> = {};
      for (const disk of disks) {
        try {
          const entries: FileEntry[] = await invoke('ssh_list_dir', { path: disk });
          initTrees[disk] = buildNodes(entries);
        } catch {
          initTrees[disk] = [];
        }
      }
      setTrees(initTrees);
      setConnStatus('connected');
    } catch (err: unknown) {
      setConnError(String(err));
      setConnStatus('error');
    }
  }

  async function handleDisconnect() {
    stopListening();
    if (selectedFile) await invoke('ssh_unwatch_file', { path: selectedFile }).catch(() => {});
    try { await invoke('ssh_disconnect'); } catch { /* ignore */ }
    setConnStatus('idle');
    setDiskRoots([]);
    setTrees({});
    setSelectedFile(null);
    setFileContent('');
    setEditorDraft('');
    isDirty.current = false;
  }

  // ── 文件树展开 ──────────────────────────────────────────────────────────

  async function handleToggle(node: TreeNode) {
    if (!node.is_dir) return;

    // 找到该节点所属的磁盘根
    const diskRoot = diskRoots.find((d) => node.path.startsWith(d));
    if (!diskRoot) return;

    // 已有子节点 → 仅切换展开/折叠
    if (node.children !== null) {
      setTrees((prev) => ({
        ...prev,
        [diskRoot]: updateNode(prev[diskRoot] ?? [], node.path, (n) => ({
          ...n,
          expanded: !n.expanded,
        })),
      }));
      return;
    }

    // 首次展开 → 加载子目录
    try {
      const entries: FileEntry[] = await invoke('ssh_list_dir', { path: node.path });
      const children = buildNodes(entries);
      setTrees((prev) => ({
        ...prev,
        [diskRoot]: updateNode(prev[diskRoot] ?? [], node.path, (n) => ({
          ...n,
          children,
          expanded: true,
        })),
      }));
    } catch {
      // 无权限等情况：标记为已加载空列表
      setTrees((prev) => ({
        ...prev,
        [diskRoot]: updateNode(prev[diskRoot] ?? [], node.path, (n) => ({
          ...n,
          children: [],
          expanded: true,
        })),
      }));
    }
  }

  // ── 文件读取 / 编辑 / 保存 ───────────────────────────────────────────────

  const loadFile = useCallback(async (path: string, silent = false) => {
    if (!silent) setLoadingFile(true);
    try {
      const content: string = await invoke('ssh_read_file', { path });
      setFileContent(content);
      if (!isDirty.current) setEditorDraft(content);
    } catch (err: unknown) {
      if (!silent) {
        setFileContent(`[读取失败] ${String(err)}`);
        setEditorDraft('');
      }
    } finally {
      if (!silent) setLoadingFile(false);
    }
  }, []);

  function handleSelectFile(node: TreeNode) {
    setSelectedFile(node.path);
    setFileContent('');
    setEditorDraft('');
    setIsEditing(false);
    setSaveMsg('');
    isDirty.current = false;
    loadFile(node.path);
  }

  function handleDraftChange(val: string) {
    isDirty.current = true;
    setEditorDraft(val);
  }

  // 自动刷新：仅在内容发生变化时更新（不覆盖用户正在编辑的 draft）
  useEffect(() => {
    if (!isDirty.current) setEditorDraft(fileContent);
  }, [fileContent]);

  // ── 实时监视（基于 Tauri 事件，不再轮询）──────────────────────────────────

  /** 停止前端事件监听器（同步）。 */
  function stopListening() {
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
  }

  /** 启动实时监视：先注册 Tauri 事件监听器，再启动后端监视任务。 */
  async function startWatching(path: string) {
    stopListening();
    const unlisten = await listen<{ path: string; content: string }>('file-changed', (e) => {
      if (e.payload.path === path) setFileContent(e.payload.content);
    });
    unlistenRef.current = unlisten;
    await invoke('ssh_watch_file', { path });
  }

  // autoRefresh 开关或切换文件时自动启停监视
  useEffect(() => {
    if (autoRefresh && selectedFile) {
      const path = selectedFile;
      void startWatching(path);
    } else {
      stopListening();
      if (selectedFile) void invoke('ssh_unwatch_file', { path: selectedFile }).catch(() => {});
    }
    return () => {
      stopListening();
      if (selectedFile) void invoke('ssh_unwatch_file', { path: selectedFile }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedFile]);

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await invoke('ssh_write_file', { path: selectedFile, content: editorDraft });
      isDirty.current = false;
      setFileContent(editorDraft);
      setIsEditing(false);
      showSaveMsg('✓ 已保存');
    } catch (err: unknown) {
      showSaveMsg(`✗ 保存失败: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function showSaveMsg(msg: string) {
    setSaveMsg(msg);
    if (saveMsgTimer.current) clearTimeout(saveMsgTimer.current);
    saveMsgTimer.current = setTimeout(() => setSaveMsg(''), 3000);
  }

  const isConnected = connStatus === 'connected';
  const isConnecting = connStatus === 'connecting';

  // ── 渲染 ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full gap-3 overflow-hidden">

      {/* ── 左栏：连接表单 + 文件树 ───────────────────────────────── */}
      <div className="flex w-[268px] shrink-0 flex-col gap-3 overflow-hidden">

        {/* 连接卡片 */}
        <GlassCard index={0} className="shrink-0">
          {/* 标题行 */}
          <div className="mb-3 flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3" />
              <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3" />
            </svg>
            <span className="text-sm font-semibold tracking-tight card-title">远程机器</span>
            {isConnected && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                已连接
              </span>
            )}
          </div>

          <div className="space-y-2.5">
            {/* IP + 端口 */}
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-[11px] text-white/45">IP / 主机名</label>
                <input
                  className={fieldCls}
                  placeholder="192.168.1.100"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !isConnected && handleConnect()}
                  disabled={isConnected || isConnecting}
                />
              </div>
              <div className="w-[60px] space-y-1">
                <label className="text-[11px] text-white/45">端口</label>
                <input
                  className={fieldCls}
                  placeholder="22"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={isConnected || isConnecting}
                />
              </div>
            </div>

            {/* 账号 */}
            <div className="space-y-1">
              <label className="text-[11px] text-white/45">账号</label>
              <input
                className={fieldCls}
                placeholder="Administrator"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isConnected && handleConnect()}
                disabled={isConnected || isConnecting}
                autoComplete="username"
              />
            </div>

            {/* 密码 */}
            <div className="space-y-1">
              <label className="text-[11px] text-white/45">密码</label>
              <input
                className={fieldCls}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isConnected && handleConnect()}
                disabled={isConnected || isConnecting}
                autoComplete="current-password"
              />
            </div>

            {/* 错误提示 */}
            <AnimatePresence>
              {connError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden rounded-xl bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-400"
                >
                  {connError}
                </motion.p>
              )}
            </AnimatePresence>

            {/* 连接 / 断开 按钮 */}
            {!isConnected ? (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting || !host.trim() || !username.trim()}
                className="relative w-full overflow-hidden rounded-xl py-2 text-sm font-medium
                  text-white transition-all disabled:opacity-40"
                style={{
                  background: 'rgb(var(--accent-rgb) / 0.15)',
                  border: '1px solid rgb(var(--accent-rgb) / 0.35)',
                }}
              >
                {isConnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                    </svg>
                    连接中…
                  </span>
                ) : '连 接'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDisconnect}
                className="w-full rounded-xl py-2 text-sm text-white/50 transition-colors
                  hover:bg-rose-500/10 hover:text-rose-400"
                style={{ border: '1px solid rgb(255 255 255 / 0.08)' }}
              >
                断开连接
              </button>
            )}
          </div>
        </GlassCard>

        {/* 文件树 */}
        <AnimatePresence>
          {isConnected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="glass app-card relative flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px
                bg-gradient-to-r from-transparent via-white/70 to-transparent" />

              {/* 树头部 */}
              <div className="flex shrink-0 items-center justify-between
                border-b border-white/[0.06] px-3.5 py-2">
                <span className="text-xs font-medium text-white/60">文件系统</span>
                <span className="text-[10px] text-white/25">
                  {diskRoots.length} 个磁盘
                </span>
              </div>

              {/* 滚动区 */}
              <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
                {diskRoots.map((disk) => (
                  <div key={disk} className="mb-1">
                    {/* 磁盘根标签 */}
                    <div className="mb-0.5 flex items-center gap-1.5 px-2 py-0.5">
                      <span className="text-[13px]">💾</span>
                      <span className="text-[11px] font-bold text-white/55">
                        {diskLabel(disk)}
                      </span>
                    </div>
                    {(trees[disk] ?? []).map((node) => (
                      <TreeItem
                        key={node.path}
                        node={node}
                        depth={0}
                        selected={selectedFile}
                        onSelect={handleSelectFile}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── 右栏：文件编辑器 ────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AnimatePresence mode="wait">
          {selectedFile ? (
            <motion.div
              key={selectedFile}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass app-card relative flex h-full flex-col overflow-hidden"
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px
                bg-gradient-to-r from-transparent via-white/70 to-transparent" />

              {/* 工具栏 */}
              <div className="flex shrink-0 items-center gap-2
                border-b border-white/[0.06] px-4 py-2.5">
                {/* 文件路径 */}
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/50"
                  title={sftpToDisplay(selectedFile)}>
                  {sftpToDisplay(selectedFile)}
                </span>

                {/* 自动刷新 */}
                <button
                  type="button"
                  onClick={() => setAutoRefresh((v) => !v)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1
                    text-[11px] transition-colors
                    ${autoRefresh
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : 'bg-white/[0.04] text-white/35 hover:text-white/65'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-white/20'}`} />
                  {autoRefresh ? '监视中' : '实时监视'}
                </button>

                {/* 手动刷新 */}
                <button
                  type="button"
                  onClick={() => { isDirty.current = false; setIsEditing(false); loadFile(selectedFile); }}
                  className="shrink-0 rounded-lg bg-white/[0.04] px-2.5 py-1
                    text-[11px] text-white/35 transition-colors hover:text-white/65"
                >
                  刷新
                </button>

                {/* 视图 / 编辑 切换 */}
                <button
                  type="button"
                  onClick={() => setIsEditing((v) => !v)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] transition-colors ${
                    isEditing
                      ? 'bg-white/[0.08] text-white/70 hover:text-white'
                      : 'bg-white/[0.04] text-white/35 hover:text-white/65'
                  }`}
                >
                  {isEditing ? '🔒 退出编辑' : '✏️ 编辑'}
                </button>

                {/* 保存（仅编辑模式显示） */}
                {isEditing && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="shrink-0 rounded-lg px-3 py-1 text-[11px] font-medium
                    text-white transition-all disabled:opacity-40"
                  style={{
                    background: 'rgb(var(--accent-rgb) / 0.14)',
                    border: '1px solid rgb(var(--accent-rgb) / 0.3)',
                  }}
                >
                  {saving ? '保存中…' : '保 存'}
                </button>
                )}

                {/* 保存状态提示 */}
                <AnimatePresence>
                  {saveMsg && (
                    <motion.span
                      initial={{ opacity: 0, x: 6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`shrink-0 text-[11px] ${saveMsg.startsWith('✗') ? 'text-rose-400' : 'text-emerald-400'}`}
                    >
                      {saveMsg}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* 查看区 / 编辑区 */}
              {loadingFile ? (
                <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/30">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                  </svg>
                  加载中…
                </div>
              ) : isEditing ? (
                <textarea
                  className="min-h-0 flex-1 resize-none bg-transparent px-5 py-4
                    font-mono text-[13px] leading-relaxed text-white/80
                    placeholder:text-white/20 focus:outline-none"
                  spellCheck={false}
                  value={editorDraft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  placeholder="选择文件后显示内容…"
                  autoFocus
                />
              ) : (
                <HighlightedContent content={editorDraft} />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center gap-3 text-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-12 w-12 opacity-30" fill="none"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <span className="text-sm">
                {isConnected ? '← 在左侧选择一个文件' : '请先连接到远程机器'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
