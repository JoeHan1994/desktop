'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  getProviders,
  importLegacyModelProviders,
  upsertProvider,
  deleteProvider,
  type ModelProviderPayload,
} from '@/services/tauriBridge';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type ProviderType = 'ollama' | 'openai';

export interface ModelProvider {
  id: string;
  name: string;
  provider: ProviderType;
  apiBaseUrl: string;
  model: string;
  apiKey: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI__' in window;

function toPayload(p: ModelProvider): ModelProviderPayload {
  return { ...p };
}

function fromPayload(p: ModelProviderPayload): ModelProvider {
  return { ...p, provider: p.provider as ProviderType };
}

/* ------------------------------------------------------------------ */
/* Context                                                              */
/* ------------------------------------------------------------------ */

interface ModelProvidersContextValue {
  providers: ModelProvider[];
  /** 新增或覆盖一个 Provider（持久化到后端）。 */
  saveProvider: (provider: ModelProvider) => Promise<void>;
  /** 按 id 删除一个 Provider（持久化到后端）。 */
  removeProvider: (id: string) => Promise<void>;
}

const ModelProvidersContext = createContext<ModelProvidersContextValue>({
  providers: [],
  saveProvider: async () => {},
  removeProvider: async () => {},
});

export function ModelProvidersProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<ModelProvider[]>([]);

  // 应用启动时从后端加载已持久化的 providers
  useEffect(() => {
    if (!isTauri()) return;
    importLegacyModelProviders()
      .catch(() => getProviders())
      .then((list) => setProviders(list.map(fromPayload)))
      .catch(() => {}); // 非 Tauri 环境或读取失败时静默忽略
  }, []);

  const saveProvider = useCallback(async (provider: ModelProvider) => {
    // 先乐观更新 UI
    setProviders((prev) => {
      const idx = prev.findIndex((p) => p.id === provider.id);
      return idx >= 0
        ? prev.map((p, i) => (i === idx ? provider : p))
        : [...prev, provider];
    });
    // 再持久化到后端（非 Tauri 时静默跳过）
    if (isTauri()) {
      await upsertProvider(toPayload(provider)).catch(() => {});
    }
  }, []);

  const removeProvider = useCallback(async (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    if (isTauri()) {
      await deleteProvider(id).catch(() => {});
    }
  }, []);

  return (
    <ModelProvidersContext.Provider value={{ providers, saveProvider, removeProvider }}>
      {children}
    </ModelProvidersContext.Provider>
  );
}

export function useModelProviders() {
  return useContext(ModelProvidersContext);
}
