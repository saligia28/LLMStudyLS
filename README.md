# LLM Study LS

一款面向 LLM 学习者的桌面应用，基于 Electron + React 构建，集成教程文档浏览、集成终端与 AI 问答，帮助你在一个窗口内完成"看文档 → 写代码 → 验证结果"的完整学习闭环。

---

## 功能特性

- **结构化课程**：15 周 × 7 步共 105 个教程步骤，覆盖从 LLM 基础到模型量化的完整学习路径
- **Markdown 渲染**：支持代码高亮、GFM 表格、流程图等，文档即教材
- **集成终端**：内嵌 xterm.js + node-pty，在应用内直接运行代码验证
- **AI 问答**：通过 DeepSeek API 随时提问，不离开学习界面
- **侧边导航**：按周次 / 步骤快速跳转，进度一目了然

---

## 课程大纲

| 周次 | 主题 | 步骤范围 |
|------|------|---------|
| Week 1 | LLM 基础 + Prompt 结构 | Step 1–5 |
| Week 2 | 流式输出（SSE）+ 前端渲染 | Step 6–12 |
| Week 3 | 对话记忆 | Step 15–20 |
| Week 4 | Node AI 后端封装 | Step 22–28 |
| Week 5 | Function Calling | Step 29–35 |
| Week 6 | Agent + ReAct | Step 36–42 |
| Week 7 | MCP 实践 | Step 43–49 |
| Week 8 | Multi-Agent | Step 50–56 |
| Week 9 | Embedding + 向量存储 | Step 57–63 |
| Week 10 | Chunking | Step 64–70 |
| Week 11 | RAG Pipeline | Step 71–77 |
| Week 12 | 应用落地 | Step 78–84 |
| Week 13 | Ollama 入门 | Step 85–91 |
| Week 14 | vLLM 高性能推理 | Step 92–98 |
| Week 15 | 模型量化 | Step 99–105 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 29 |
| 前端 | React 18 + Vite + Ant Design + Tailwind CSS |
| 后端 | Express 4（端口 3001） |
| 终端 | xterm.js + node-pty |
| AI | OpenAI SDK（DeepSeek 兼容接口） |

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- npm ≥ 9

### 安装

```bash
cd app
npm install
```

> 安装时会自动执行 `electron-builder install-app-deps` 重新编译原生模块（node-pty）。

### 配置环境变量

在 `app/` 目录下创建 `.env` 文件：

```env
SERVER_PORT=3001
WINDOW_SERVER_PORT=5173
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASEURL=https://api.deepseek.com
```

### 启动开发环境

```bash
# 一键启动：后端 Express + Vite + Electron
npm run start:dev
```

单独启动各进程：

```bash
npm run dev          # 仅 Vite 开发服务器（端口 5173）
npm run server:dev   # 仅 Express 后端（端口 3001）
npm run electron:dev # Vite + Electron
```

### 生产构建

```bash
npm run build          # Vite 构建
npm run electron:build # 打包为桌面应用
```

---

## 项目结构

```
app/
├── electron/
│   ├── main.js          # 主进程：窗口管理、IPC
│   ├── pty-service.js   # PTY 终端服务（node-pty）
│   └── preload.js       # Context Bridge
├── server/
│   ├── index.js         # Express 入口（端口 3001）
│   ├── routes/
│   │   ├── content.js   # 课程内容 API
│   │   └── llm.js       # LLM 代理 API（DeepSeek）
│   └── services/
│       └── content-scanner.js  # 内容目录扫描与缓存
├── src/
│   ├── App.jsx          # 主布局（侧边栏 + 内容区 + 终端）
│   ├── components/
│   │   ├── Sidebar/     # 周次 / 步骤导航
│   │   └── Terminal/    # xterm.js 终端组件
│   ├── pages/
│   │   └── StepDetail.jsx  # Markdown 内容渲染
│   └── services/
│       └── api.js       # HTTP 客户端
└── content/
    ├── content.config.json  # 启用的周次配置
    └── week{1-15}/
        ├── week.json        # 周次元数据与步骤定义
        ├── docs/            # Markdown 教程（step*.md）
        └── code/            # 配套练习代码
```

---

## API 接口

### 内容接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/content/structure` | 获取完整课程结构 |
| GET | `/api/content/week/:weekId/step/:stepId` | 获取指定步骤详情 |

### AI 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/llm/chat` | 普通对话 |
| POST | `/api/llm/chat/stream` | 流式对话（SSE） |

---

## 内容开发

### 新增课程步骤

1. 在 `content/week{N}/docs/` 下创建 `step{N}.md`
2. 在 `content/week{N}/week.json` 的 `steps` 数组中注册该步骤
3. 重启 Express 服务，`ContentScanner` 会自动重新扫描

### 文档格式规范

```markdown
# Step N: 主题｜副标题

## 学习目标
...

## 一、章节标题
### 1.1 小节

## 二、...

## 小结
...
```

---

## 许可

MIT
