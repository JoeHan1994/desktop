/** @type {import('next').NextConfig} */
const nextConfig = {
  // 静态导出（SSG），以适配 Tauri 的本地加载机制
  output: 'export',
  // Tauri 使用本地文件协议，需要禁用图片优化
  images: {
    unoptimized: true,
  },
  // react-markdown 和 remark-gfm 是 ESM-only 包，需要 Next.js 转编译
  transpilePackages: ['react-markdown', 'remark-gfm', 'remark-parse', 'remark-rehype',
    'unified', 'bail', 'is-plain-obj', 'trough', 'vfile', 'vfile-message',
    'unist-util-stringify-position', 'mdast-util-from-markdown', 'mdast-util-to-hast',
    'mdast-util-gfm', 'micromark', 'decode-named-character-reference', 'character-entities',
    'hast-util-whitespace', 'property-information', 'hast-util-to-jsx-runtime',
    'devlop', 'comma-separated-tokens', 'space-separated-tokens',
    'estree-util-is-identifier-name', 'html-url-attributes', 'remark-stringify',
  ],
  // GLSL 着色器文件作为原始字符串导入
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glsl|vert|frag|vs|fs)$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
