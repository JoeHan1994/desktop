# Vector Vision

> 本地私有化向量数据库全流程可视化桌面应用，基于 Next.js + Tauri + Rust 构建，采用 3D 液态玻璃（Liquid Glass）视觉特效系统。

---

## 功能特性

- **全流程向量管道**：数据准备 → 向量化 Embedding → 存储索引 → ANN 检索 → 可视化，5 个阶段贯通一体
- **3D 液态玻璃 UI**：基于 WebGL / Three.js 的实时折射、动态流体、毛玻璃模糊三位一体视觉系统
- **本地 AI 对话**：接入 Ollama / OpenAI 兼容 API，流式逐字输出，Token 用量实时可视化
- **RAG 工作台**：Hybrid / Vector / Keyword 三种检索模式，上下文召回与引用校验可视化
- **Windows 远程引导**：远程机器视图可打开 RDP，并下载 OpenSSH 配置脚本，便于先进入目标 Windows 启用 SSH
- **知识库管理**：拖拽上传 PDF / Word / Excel，Chunk 实时审核，向量化进度追踪
- **私有化部署**：数据完全本地，SQLite 持久化，零网络依赖
- **自定义外观**：液态玻璃主题参数（颜色、透明度、模糊、圆角）实时可调
- **自由窗口拉伸**：所有视图全面自适应，最小窗口 1380 × 780，支持任意比例缩放

---

## 技术栈

| 层级          | 技术                                                                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 桌面运行时    | [Tauri 1.x](https://tauri.app)                                                                                                                      |
| 前端框架      | [Next.js 14](https://nextjs.org) (静态导出 SSG)                                                                                                     |
| 3D 渲染       | [Three.js](https://threejs.org) + [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) + [@react-three/drei](https://github.com/pmndrs/drei) |
| 动画          | [Framer Motion](https://www.framer.com/motion/)                                                                                                     |
| 样式          | [Tailwind CSS 3](https://tailwindcss.com)                                                                                                           |
| 后端逻辑      | Rust (Tauri commands)                                                                                                                               |
| 本地数据库    | SQLite via `rusqlite` (bundled)                                                                                                                     |
| Markdown 渲染 | `react-markdown` + `remark-gfm`                                                                                                                     |

---

## 目录结构

```
.
├── src/
│   ├── app/                  # Next.js App Router 入口
│   ├── components/           # 全局 UI 组件（AppShell、Sidebar、ControlPanel…）
│   │   ├── ui/               # 基础原子组件（GlassCard、Icon、Switch…）
│   │   └── views/            # 页面级视图（Assistant、RAG、Knowledge、Settings）
│   ├── features/             # 功能模块
│   │   ├── ingestion/        # 文件拖拽上传
│   │   ├── liquid-glass/     # WebGL 液态玻璃 GLSL 着色器
│   │   ├── models/           # Model Provider 上下文
│   │   ├── nav/              # 导航配置
│   │   ├── pipeline/         # 流水线步进器 & 阶段控件
│   │   ├── theme/            # 外观主题配置器
│   │   └── vector-stars/     # 三维向量粒子星云视图
│   ├── hooks/                # 自定义 React hooks
│   └── services/             # LLM 客户端 & Tauri Bridge
├── src-tauri/
│   ├── src/
│   │   ├── commands/         # Tauri IPC 命令（pipeline、settings、vector_db）
│   │   ├── db.rs             # SQLite 数据库初始化
│   │   ├── embed.rs          # 本地 Embedding 推理
│   │   ├── store.rs          # 应用全局状态
│   │   └── main.rs           # 程序入口 & 窗口圆角（Windows 11 DWM）
│   ├── Cargo.toml
│   └── tauri.conf.json
├── public/
│   ├── icons/                # 应用图标
│   └── models/               # 本地 ONNX Embedding 模型（可选）
├── scripts/
│   └── run-tauri.mjs         # 跨平台 Tauri 启动脚本
├── DESIGN.MD                 # 3D 液态玻璃视觉特效系统设计文档
└── project.md                # 向量数据库全流程规范文档
```

---

## 快速开始

### 前置依赖

| 工具                | 版本要求                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| Node.js             | ≥ 18                                                                                                     |
| Rust & Cargo        | stable（通过 [rustup](https://rustup.rs) 安装）                                                          |
| Tauri CLI           | 通过 `npm run tauri` 封装，无需全局安装                                                                  |
| WebView2（Windows） | Windows 11 内置，Windows 10 需[手动安装](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) |

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
# 同时启动 Next.js dev server 和 Tauri 窗口
npm run tauri:dev
```

### 生产构建

```bash
# 构建 Next.js 静态产物 + 打包 Tauri 安装包
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

### 仅运行前端（浏览器预览）

```bash
npm run dev
# 访问 http://localhost:3000
```

---

## 视图说明

| 视图           | 路由标识    | 功能                                                                          |
| -------------- | ----------- | ----------------------------------------------------------------------------- |
| AI 对话        | `assistant` | 与本地/云端 LLM 流式对话，Token 用量实时统计                                  |
| RAG 检索       | `rag`       | 检索增强生成工作台，支持 Hybrid / Vector / Keyword 三模式                     |
| Knowledge Base | `knowledge` | 文件上传、解析状态、Chunk 审核、元数据绑定                                    |
| 远程机器       | `remote`    | 通过 RDP 引导启用 OpenSSH，再使用 SSH/SFTP 浏览远程 Windows 文件与 Hyper-V VM |
| 设置           | `settings`  | Model Provider 管理（Ollama / OpenAI 兼容接口）                               |

---

## Windows 远程连接引导

当目标 Windows 机器还没有启用 OpenSSH 时，可以先在「远程机器」视图创建 profile，点击显示器图标打开 RDP。RDP 会尽量复用 profile 中已保存的账号密码，并通过 Windows Credential Manager 提供给远程桌面客户端。顶部的 Script 按钮会下载 `configure-windows-ssh-server.ps1`，将脚本带到目标机器后，在管理员 PowerShell 中执行：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\configure-windows-ssh-server.ps1 -SetNetworkPrivate -EnablePasswordAuthentication
```

脚本完成后回到应用点击 SSH 连接，即可继续使用远程文件浏览、日志查看和 Hyper-V VM 操作。RDP 本身需要目标机器已允许远程桌面并且网络可达；该入口不会远程开启 RDP 服务。

---

## 向量管道流程

```
数据准备 (Ingestion)
  └─ 多源文档导入 → 文本清洗 → 智能重叠分块 (Chunking)
        ↓
向量化 (Embedding)
  └─ 本地 ONNX 模型推理 → 高维向量生成 → 元数据绑定
        ↓
存储索引 (Storage)
  └─ SQLite / 向量库写入 → HNSW 近似最近邻索引构建
        ↓
检索优化 (Retrieval)
  └─ 查询向量化 → ANN Search → Rerank → 上下文裁剪
        ↓
前端可视化 (Visualize)
  └─ 3D 点云降维 → 液态玻璃 UI → RAG 引用校验
```

---

## 外观配置

点击顶栏右侧调色板图标打开「外观配置」面板，可实时调节：

- **玻璃底色 & 透明度**
- **毛玻璃模糊强度**
- **圆角半径**
- **强调色（Accent Color）**
- **文字亮度 & 阴影强度**
- **背景图片**

---

## 窗口说明

- 默认尺寸：1280 × 800
- 最小尺寸：1380 × 780
- 无系统原生标题栏（`decorations: false`），使用应用内自定义拖拽区
- Windows 11 自动启用 DWM 系统圆角（`DWMWCP_ROUND`）

---

## 液态玻璃设计规范

详见 [DESIGN.MD](./DESIGN.MD)，涵盖：

- 动态流体顶点着色器（GLSL Simplex Noise）
- 实时折射离屏纹理捕获原理
- `MeshTransmissionMaterial` 推荐参数配置
- GPU 性能优化策略

---

## License

[MIT](./LICENSE)
