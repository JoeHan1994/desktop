import type { Metadata } from 'next';
import './globals.css';
import { HyperspeedBackground } from '@/components/HyperspeedBackground';
import { ThemeProvider } from '@/features/theme/ThemeContext';
import { ModelProvidersProvider } from '@/features/models/ModelProvidersContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SplashScreen } from '@/components/SplashScreen';

export const metadata: Metadata = {
  title: 'Vector Vision',
  description: '3D 液态玻璃向量数据库可视化',
};

/**
 * 全局布局。
 *
 * ThemeProvider 包裹背景与内容，驱动全站玻璃组件外观；Hyperspeed 光速隧道作为常驻背景。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="overflow-hidden bg-[#04060c] text-white antialiased">
        <ThemeProvider>
          <ModelProvidersProvider>
          <div className="relative flex h-screen min-h-0 flex-col bg-[#04060c]">
            {/* 启动动画遮罩 */}
            <SplashScreen />
            {/* 全局 Hyperspeed 光速隧道背景 */}
            <HyperspeedBackground />
            <main className="relative z-10 flex-1 min-h-0 h-full overflow-hidden">
              <ErrorBoundary>{children}</ErrorBoundary>
            </main>
          </div>
          </ModelProvidersProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
