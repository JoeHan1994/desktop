'use client';

import React from 'react';

interface State {
  error: Error | null;
}

/**
 * 全局错误边界。
 * 捕获子树中的任何渲染/生命周期错误，显示深色兜底 UI，
 * 避免 Tauri 透明窗口因白屏/崩溃而透出桌面。
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#04060c] px-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10">
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6 text-rose-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <circle cx="12" cy="16" r="0.5" fill="currentColor" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white/80">渲染错误</p>
            <p className="mt-1 max-w-sm text-[11px] text-white/35">
              {this.state.error.message}
            </p>
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-xl border border-white/12 px-4 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/80"
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
