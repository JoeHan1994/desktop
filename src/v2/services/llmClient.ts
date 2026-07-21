/**
 * LLM 流式客户端。
 *
 * 支持两种 provider：
 *  - ollama  → POST {apiBaseUrl}/api/chat    (NDJSON stream)
 *  - openai  → POST {apiBaseUrl}/chat/completions (SSE stream)
 *
 * 以 async generator 形式逐 token 产出，调用方可随时通过 AbortSignal 取消。
 */

import type { ModelProvider } from '@/v2/features/models/ModelProvidersContext';

// ── 公共类型 ─────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** 来自 API 的真实 token 统计（仅在 done=true 的最终 chunk 中填充）。 */
export interface TokenStats {
  /** 输入词元数（prompt tokens） */
  promptTokens: number;
  /** 输出词元数（completion tokens） */
  completionTokens: number;
  /** 预填充速度 tok/s（Ollama: prompt_eval_count / prompt_eval_duration） */
  inputTps: number;
  /** 生成速度 tok/s（Ollama: eval_count / eval_duration） */
  outputTps: number;
}

export interface StreamChunk {
  /** 本次增量文本（可能为空字符串，尤其是 done=true 时） */
  content: string;
  done: boolean;
  /** API 返回的真实 token 统计（仅在最终 done chunk 中出现） */
  stats?: TokenStats;
}

// ── 入口 ─────────────────────────────────────────────────────────────────

/** 根据 provider 类型分发到对应流式实现。 */
export async function* streamChat(
  provider: ModelProvider,
  messages: LLMMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  if (provider.provider === 'ollama') {
    yield* streamOllama(provider, messages, signal);
  } else {
    yield* streamOpenAI(provider, messages, signal);
  }
}

// ── Ollama（NDJSON） ──────────────────────────────────────────────────────

async function* streamOllama(
  provider: ModelProvider,
  messages: LLMMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const base = provider.apiBaseUrl.replace(/\/+$/, '') || 'http://localhost:11434';
  const url = `${base}/api/chat`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: provider.model, messages, stream: true }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama ${res.status}: ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            prompt_eval_duration?: number;  // nanoseconds
            eval_count?: number;
            eval_duration?: number;          // nanoseconds
          };

          // 最终 done 包：提取真实 token 统计
          if (obj.done) {
            const stats: TokenStats | undefined =
              obj.prompt_eval_count != null && obj.eval_count != null
                ? {
                    promptTokens:     obj.prompt_eval_count,
                    completionTokens: obj.eval_count,
                    inputTps:
                      obj.prompt_eval_duration && obj.prompt_eval_duration > 0
                        ? obj.prompt_eval_count / (obj.prompt_eval_duration / 1e9)
                        : 0,
                    outputTps:
                      obj.eval_duration && obj.eval_duration > 0
                        ? obj.eval_count / (obj.eval_duration / 1e9)
                        : 0,
                  }
                : undefined;
            yield { content: obj.message?.content ?? '', done: true, stats };
            return;
          }

          yield {
            content: obj.message?.content ?? '',
            done: false,
          };
        } catch {
          // 忽略格式错误的行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── OpenAI-compatible（SSE） ──────────────────────────────────────────────

async function* streamOpenAI(
  provider: ModelProvider,
  messages: LLMMessage[],
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  const base = provider.apiBaseUrl.replace(/\/+$/, '') || 'https://api.openai.com/v1';
  const url = `${base}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    // stream_options.include_usage 让 OpenAI 在最终 chunk 中附加 usage 字段
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI ${res.status}: ${body}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  // usage 数据（OpenAI 在 stream_options.include_usage=true 时附加）
  let usageBuffer: { promptTokens: number; completionTokens: number } | null = null;
  // 第一个内容 token 到达的时间，用于计算生成速度
  let genStart = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // SSE 行以 "data: " 开头
        const data = trimmed.startsWith('data:')
          ? trimmed.slice(5).trimStart()
          : trimmed;

        if (data === '[DONE]') {
          // 构造 stats（tok/s 用挂钟时间估算，因 OpenAI 不提供 duration）
          const elapsed = genStart > 0 ? (Date.now() - genStart) / 1000 : 0;
          const stats: TokenStats | undefined = usageBuffer
            ? {
                promptTokens:     usageBuffer.promptTokens,
                completionTokens: usageBuffer.completionTokens,
                inputTps:  0,   // OpenAI 流式接口不暴露 prefill 时长
                outputTps: elapsed > 0 ? usageBuffer.completionTokens / elapsed : 0,
              }
            : undefined;
          yield { content: '', done: true, stats };
          return;
        }

        try {
          const obj = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };

          // 部分实现会在包含 usage 的独立 chunk（choices 为空）中提供统计
          if (obj.usage?.prompt_tokens != null) {
            usageBuffer = {
              promptTokens:     obj.usage.prompt_tokens ?? 0,
              completionTokens: obj.usage.completion_tokens ?? 0,
            };
          }

          const content  = obj.choices?.[0]?.delta?.content ?? '';
          const finished = obj.choices?.[0]?.finish_reason != null;

          // 记录第一个有内容 token 的时间
          if (content && genStart === 0) genStart = Date.now();

          if (finished) {
            const elapsed = genStart > 0 ? (Date.now() - genStart) / 1000 : 0;
            const stats: TokenStats | undefined = usageBuffer
              ? {
                  promptTokens:     usageBuffer.promptTokens,
                  completionTokens: usageBuffer.completionTokens,
                  inputTps:  0,
                  outputTps: elapsed > 0 ? usageBuffer.completionTokens / elapsed : 0,
                }
              : undefined;
            yield { content, done: true, stats };
            return;
          }

          yield { content, done: false };
        } catch {
          // 忽略非 JSON 行（如注释行）
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
