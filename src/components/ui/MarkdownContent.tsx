'use client';

/**
 * MarkdownContent
 *
 * 将 Markdown 字符串渲染为样式化的 JSX。
 * 用于 AssistantView 中 assistant 消息气泡的内容渲染。
 *
 * 样式设计原则：贴合全局深色玻璃 UI，不依赖 @tailwindcss/typography 插件。
 */

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

// ── 自定义 renderer map ──────────────────────────────────────────────────

const components: Components = {
  // 段落
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),

  // 标题
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-[15px] font-bold text-white/90 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[14px] font-semibold text-white/85 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-[13px] font-semibold text-white/80 first:mt-0">{children}</h3>
  ),

  // 列表
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 text-white/75 marker:text-white/30">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-white/75 marker:text-white/40">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,

  // 引用块
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-white/20 pl-3 text-white/50 italic">
      {children}
    </blockquote>
  ),

  // 水平线
  hr: () => <hr className="my-3 border-white/[0.08]" />,

  // 强调
  strong: ({ children }) => (
    <strong className="font-semibold text-white/90">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-white/70">{children}</em>
  ),

  // 删除线（GFM）
  del: ({ children }) => (
    <del className="text-white/35 line-through">{children}</del>
  ),

  // 链接
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[#60a5fa] underline underline-offset-2 hover:text-[#93c5fd] transition-colors"
    >
      {children}
    </a>
  ),

  // 表格（GFM）
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-white/[0.08]">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-white/[0.08] bg-white/[0.04]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-white/[0.05]">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[12px] text-white/70">{children}</td>
  ),

  // 代码块与行内代码
  pre: ({ children }) => (
    // pre 本身只作容器；实际样式由下方 code 处理
    <div className="my-2">{children}</div>
  ),
  code: CodeBlock,
};

/** 代码块 / 行内代码渲染器。 */
function CodeBlock({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<'code'>) {
  const lang = (className ?? '').replace('language-', '');
  const isBlock = !!className || (typeof children === 'string' && (children as string).includes('\n'));
  const codeText = String(children).replace(/\n$/, '');

  if (!isBlock) {
    // 行内代码
    return (
      <code
        className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.8em] text-[#a78bfa]"
        {...props}
      >
        {children}
      </code>
    );
  }

  // 代码块
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0f17]">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">
          {lang || 'code'}
        </span>
        <CopyButton text={codeText} />
      </div>
      {/* 代码内容 */}
      <pre className="overflow-x-auto p-4">
        <code
          className="font-mono text-[12px] leading-relaxed text-white/80"
          {...props}
        >
          {codeText}
        </code>
      </pre>
    </div>
  );
}

/** 复制按钮（带 ✓ 反馈动画）。 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/60"
    >
      {copied ? (
        <>
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M1.5 5.5 L4 8 L8.5 2.5" />
          </svg>
          已复制
        </>
      ) : (
        <>
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3.5" y="1" width="5.5" height="7" rx="1" />
            <path d="M1 3.5v5.5a1 1 0 0 0 1 1h4.5" />
          </svg>
          复制
        </>
      )}
    </button>
  );
}

// ── 导出 ─────────────────────────────────────────────────────────────────

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="min-w-0 text-[13px] text-white/80">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
