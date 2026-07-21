'use client';

import '../styles/globals.css';
import { V2ThemeProvider, useV2Theme } from '../features/theme/ThemeContext';
import { ModelProvidersProvider } from '../features/models/ModelProvidersContext';
import { ToastProvider } from '../components/ui/Toast';
import { AppShell } from '../components/layout/AppShell';

/** 应用 data-v2-theme 的根容器，作用域限定在 .v2-root 子树内。 */
function V2Surface() {
	const { theme } = useV2Theme();
	return (
		<div className="v2-root" data-v2-theme={theme}>
			<AppShell />
		</div>
	);
}

/**
 * Version 2 页面入口。
 * 独立于 v1：拥有自成体系的样式框架 (styles/globals.css) 与主题上下文，
 * 沿用 v1 的分层结构（app / components / features / lib）但不复用任何 v1 样式。
 */
export function V2App() {
	return (
		<V2ThemeProvider defaultTheme="light">
			<ToastProvider>
				<ModelProvidersProvider>
					<V2Surface />
				</ModelProvidersProvider>
			</ToastProvider>
		</V2ThemeProvider>
	);
}

export default V2App;
