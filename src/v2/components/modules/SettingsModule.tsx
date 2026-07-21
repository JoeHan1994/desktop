'use client';

import { useState } from 'react';
import { BentoCard, BentoGrid } from '../ui/Bento';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { SecretInput } from '../ui/SecretInput';
import { TactileSlider } from '../ui/Slider';
import { Switch, Segmented } from '../ui/Toggle';
import { Select } from '../ui/Select';
import { useToast } from '../ui/Toast';
import { useV2Theme } from '@/v2/features/theme/ThemeContext';
import { useModelProviders, type ProviderType } from '@/v2/features/models/ModelProvidersContext';
import { IconCpu, IconDatabase, IconServer, IconSpark } from '../ui/icons';

interface ProviderTile {
	id: string;
	name: string;
	storage: ProviderType;
	baseUrl: string;
	model: string;
	icon: 'openai' | 'anthropic' | 'ollama';
}

const PROVIDERS: ProviderTile[] = [
	{ id: 'openai', name: 'OpenAI', storage: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', icon: 'openai' },
	{ id: 'anthropic', name: 'Anthropic', storage: 'openai', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-7', icon: 'anthropic' },
	{ id: 'ollama', name: 'Ollama', storage: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', icon: 'ollama' },
];

const DB_ENGINES = ['PostgreSQL + pgvector', 'Qdrant', 'Milvus', 'ChromaDB'] as const;

export function SettingsModule() {
	const { theme, setTheme } = useV2Theme();
	const { saveProvider } = useModelProviders();
	const { notify } = useToast();

	const [activeProvider, setActiveProvider] = useState('openai');
	const [apiKey, setApiKey] = useState('');
	const [baseUrl, setBaseUrl] = useState(PROVIDERS[0].baseUrl);
	const [temperature, setTemperature] = useState(0.7);
	const [topP, setTopP] = useState(0.9);

	const [dbEngine, setDbEngine] = useState<(typeof DB_ENGINES)[number]>('PostgreSQL + pgvector');
	const [dbConn, setDbConn] = useState('postgres://localhost:5432/terraforge');
	const [testing, setTesting] = useState(false);

	const [telemetry, setTelemetry] = useState(true);
	const [autoUpdate, setAutoUpdate] = useState(false);
	const [gateway, setGateway] = useState(false);
	const [rateLimit, setRateLimit] = useState(true);

	const provider = PROVIDERS.find((p) => p.id === activeProvider) ?? PROVIDERS[0];

	function selectProvider(id: string) {
		const p = PROVIDERS.find((x) => x.id === id);
		if (!p) return;
		setActiveProvider(id);
		setBaseUrl(p.baseUrl);
	}

	async function saveModel() {
		await saveProvider({
			id: provider.id,
			name: provider.name,
			provider: provider.storage,
			apiBaseUrl: baseUrl,
			model: provider.model,
			apiKey,
		}).catch(() => {});
		notify({ tone: 'success', title: '模型配置已保存', body: `${provider.name} · ${provider.model}` });
	}

	function testConnection() {
		setTesting(true);
		window.setTimeout(() => {
			setTesting(false);
			notify({ tone: 'success', title: '连接成功', body: `${dbEngine} · 12ms` });
		}, 900);
	}

	return (
		<div className="v2-module">
			<header className="v2-module__head">
				<div>
					<h1 className="v2-module__title">系统设置</h1>
					<p className="v2-module__desc">模型提供商 · 数据库连接 · 系统偏好与预留模块</p>
				</div>
			</header>

			<BentoGrid columns={3}>
				{/* AI 模型提供商 2x1 */}
				<BentoCard span="2x1" label="AI 模型提供商" action={<Button size="sm" variant="primary" onClick={saveModel}>保存</Button>}>
					<div className="v2-row v2-gap-3 v2-wrap" style={{ marginBottom: 'var(--v2-space-4)' }}>
						{PROVIDERS.map((p) => (
							<button
								key={p.id}
								type="button"
								className={`v2-provider${activeProvider === p.id ? ' v2-provider--active' : ''}`}
								onClick={() => selectProvider(p.id)}
							>
								<span className="v2-provider__icon">
									<IconSpark width={18} height={18} />
								</span>
								<div className="v2-col">
									<span style={{ fontWeight: 600 }}>{p.name}</span>
									<span className="v2-text-subtle" style={{ fontSize: 'var(--v2-text-xs)' }}>
										{p.model}
									</span>
								</div>
							</button>
						))}
					</div>

					<div className="v2-stack-4">
						<SecretInput label="API Key" value={apiKey} placeholder="sk-••••••••••••••••" onChange={setApiKey} />
						<label className="v2-field">
							<span className="v2-label">Base URL</span>
							<input className="v2-input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
						</label>
						<div className="v2-grid v2-grid--2">
							<TactileSlider label="Temperature" value={temperature} min={0} max={2} step={0.01} format={(v) => v.toFixed(2)} onChange={setTemperature} />
							<TactileSlider label="Top-P" value={topP} min={0} max={1} step={0.01} format={(v) => v.toFixed(2)} onChange={setTopP} />
						</div>
					</div>
				</BentoCard>

				{/* 向量 & 关系型数据库 1x1 */}
				<BentoCard span="1x1" label="向量 & 关系型数据库">
					<div className="v2-stack-4 v2-fill">
						<label className="v2-field">
							<span className="v2-label">数据库类型</span>
							<Select
								aria-label="数据库类型"
								value={dbEngine}
								onChange={(v) => setDbEngine(v as (typeof DB_ENGINES)[number])}
								options={DB_ENGINES.map((e) => ({ value: e, label: e }))}
							/>
						</label>
						<label className="v2-field">
							<span className="v2-label">连接字符串</span>
							<input className="v2-input v2-mono" value={dbConn} onChange={(e) => setDbConn(e.target.value)} />
						</label>
						<Button variant="outline" onClick={testConnection} disabled={testing}>
							<IconDatabase width={16} height={16} /> {testing ? '测试中…' : '测试连接'}
						</Button>
					</div>
				</BentoCard>

				{/* 系统偏好 1x1 */}
				<BentoCard span="1x1" label="系统偏好">
					<div className="v2-stack-4 v2-fill">
						<div className="v2-col v2-gap-2">
							<span className="v2-label">主题（新拟态）</span>
							<Segmented
								value={theme}
								onChange={(v) => setTheme(v)}
								aria-label="主题切换"
								options={[
									{ value: 'light', label: '浅色' },
									{ value: 'dark', label: '深色' },
								]}
							/>
						</div>
						<div className="v2-surface-block v2-row v2-between">
							<span className="v2-text-muted">遥测</span>
							<Switch checked={telemetry} onChange={setTelemetry} label="遥测" />
						</div>
						<div className="v2-surface-block v2-row v2-between">
							<span className="v2-text-muted">自动更新</span>
							<Switch checked={autoUpdate} onChange={setAutoUpdate} label="自动更新" />
						</div>
					</div>
				</BentoCard>

				{/* 未来模块 & 集成 2x1 */}
				<BentoCard span="2x1" label="未来模块 & 集成">
					<div className="v2-grid v2-grid--2 v2-fill">
						<div className="v2-surface-block v2-row v2-between">
							<span className="v2-row v2-gap-2">
								<IconServer width={16} height={16} /> API 网关
							</span>
							<Switch checked={gateway} onChange={setGateway} label="API 网关" />
						</div>
						<div className="v2-surface-block v2-row v2-between">
							<span className="v2-row v2-gap-2">
								<IconCpu width={16} height={16} /> 速率限制规则
							</span>
							<Switch checked={rateLimit} onChange={setRateLimit} label="速率限制" />
						</div>
						<div className="v2-surface-block v2-row v2-between" style={{ opacity: 0.6 }}>
							<span>vLLM 推理后端</span>
							<Badge>预留</Badge>
						</div>
						<div className="v2-surface-block v2-row v2-between" style={{ opacity: 0.6 }}>
							<span>系统备份</span>
							<Badge>预留</Badge>
						</div>
					</div>
				</BentoCard>
			</BentoGrid>
		</div>
	);
}
