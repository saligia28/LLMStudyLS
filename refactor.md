# Electron 项目改造方案

## 一、需求分析

### 1.1 项目目标

将当前的 LLM 学习项目改造成一个 Electron 桌面应用，实现：

- 直观展示每个 Step 中的学习内容
- 通过前端界面控制参数，方便学习相关知识
- 集成虚拟终端，展示代码运行结果
- **支持后续持续扩展更多学习内容**（更多 step、更多 week）

### 1.2 扩展性需求

```
当前结构:
LLMStudyLS/
└── week1/
    ├── stepDocs/        # step1-step6（会持续增加）
    └── deepseekAITest/  # 对应的测试代码

未来可能的结构:
LLMStudyLS/
├── week1/
│   ├── stepDocs/        # 基础入门
│   └── tests/
├── week2/
│   ├── stepDocs/        # 进阶内容
│   └── tests/
├── week3/
│   ├── stepDocs/        # 高级应用
│   └── tests/
└── ...
```

### 1.3 技术栈

| 层级      | 技术                | 说明                        |
| --------- | ------------------- | --------------------------- |
| 桌面框架  | Electron            | 跨平台桌面应用              |
| 前端框架  | React 18            | UI 构建                     |
| UI 组件库 | Ant Design 5.x      | 企业级 UI 组件              |
| 样式方案  | Tailwind CSS        | 原子化 CSS                  |
| 后端框架  | Express             | Node.js Web 服务            |
| 终端实现  | node-pty + xterm.js | 虚拟终端（VSCode 同款方案） |

---

## 二、可行性分析

### 2.1 技术可行性

| 技术点           | 可行性  | 说明                                               |
| ---------------- | ------- | -------------------------------------------------- |
| Electron         | ✅ 高   | 成熟稳定，VSCode、Slack 等大型应用都在使用         |
| React + Electron | ✅ 高   | 主流组合，有 electron-react-boilerplate 等成熟模板 |
| Ant Design       | ✅ 高   | 中文文档完善，组件丰富                             |
| Tailwind CSS     | ✅ 中高 | 与 Ant Design 有少量样式冲突，需配置 prefix        |
| node-pty         | ✅ 高   | VSCode 核心组件，需要原生编译                      |
| Express 集成     | ✅ 高   | 可在 Electron 主进程中启动                         |

### 2.2 难点分析

| 难点                         | 等级   | 解决方案                              |
| ---------------------------- | ------ | ------------------------------------- |
| node-pty 原生模块编译        | ⭐⭐⭐ | 使用 electron-rebuild 重新编译        |
| Tailwind 与 Antd 样式冲突    | ⭐⭐   | 配置 Tailwind prefix 或使用 important |
| Electron 主进程/渲染进程通信 | ⭐⭐   | 使用 contextBridge + ipcRenderer      |
| 动态内容管理与扩展           | ⭐⭐   | 使用配置文件 + 约定目录结构           |

### 2.3 总体评估

- **难度等级**：中等偏上（⭐⭐⭐☆☆）
- **预计工作量**：需要完成约 15 个主要步骤
- **风险点**：node-pty 的跨平台编译可能遇到问题，需要 Python 和 C++ 编译工具

---

## 三、项目架构设计

### 3.1 整体目录结构（支持多 Week 扩展）

```
LLMStudyLS/                      # 学习项目根目录
├── app/                         # Electron 应用（独立于学习内容）
│   ├── electron/                # Electron 主进程代码
│   │   ├── main.js              # 主进程入口
│   │   ├── preload.js           # 预加载脚本
│   │   └── pty-service.js       # 终端服务
│   │
│   ├── server/                  # Express 后端服务
│   │   ├── index.js             # 服务入口
│   │   ├── routes/              # 路由
│   │   │   ├── content.js       # 内容管理路由
│   │   │   ├── llm.js           # LLM 调用路由
│   │   │   └── terminal.js      # 终端路由
│   │   └── services/            # 服务层
│   │       ├── content-scanner.js  # 内容扫描服务（动态发现）
│   │       └── llm-service.js      # LLM 调用封装
│   │
│   ├── src/                     # React 前端代码
│   │   ├── main.jsx             # React 入口
│   │   ├── App.jsx              # 根组件
│   │   ├── components/          # 通用组件
│   │   │   ├── Layout/          # 布局组件
│   │   │   ├── Terminal/        # 终端组件
│   │   │   ├── Sidebar/         # 侧边栏（支持多级目录）
│   │   │   ├── DocViewer/       # 文档查看器
│   │   │   ├── CodeRunner/      # 代码运行面板
│   │   │   └── ParamPanel/      # 参数控制面板
│   │   ├── pages/               # 页面
│   │   │   ├── Home.jsx         # 首页/欢迎页
│   │   │   └── StepDetail.jsx   # Step 详情页
│   │   ├── hooks/               # 自定义 Hooks
│   │   ├── services/            # 前端 API 服务
│   │   ├── store/               # 状态管理（可选）
│   │   └── styles/              # 样式文件
│   │
│   ├── package.json             # 应用依赖配置
│   ├── vite.config.js           # Vite 配置
│   ├── tailwind.config.js       # Tailwind 配置
│   └── electron-builder.json    # Electron 打包配置
│
├── content/                     # 学习内容目录（与应用分离）
│   ├── content.config.json      # 内容配置文件（定义结构）
│   │
│   ├── week1/                   # 第一周学习内容
│   │   ├── week.json            # 周配置（标题、描述等）
│   │   ├── docs/                # 文档目录
│   │   │   ├── step1.md
│   │   │   ├── step2.md
│   │   │   └── ...
│   │   └── code/                # 代码目录
│   │       ├── step1/
│   │       ├── step2/
│   │       └── ...
│   │
│   ├── week2/                   # 第二周（未来扩展）
│   │   ├── week.json
│   │   ├── docs/
│   │   └── code/
│   │
│   └── ...                      # 更多周次
│
├── .env                         # 环境变量（API Key 等）
└── README.md
```

### 3.2 内容配置文件设计

**`content/content.config.json`：**

```json
{
  "title": "LLM 学习计划",
  "description": "从入门到精通的 LLM 学习之旅",
  "weeks": [
    {
      "id": "week1",
      "title": "Week 1: LLM 基础入门",
      "description": "学习 LLM 基础概念、API 调用和 Prompt 设计",
      "enabled": true
    },
    {
      "id": "week2",
      "title": "Week 2: 进阶应用",
      "description": "Function Calling、RAG 等进阶内容",
      "enabled": false
    }
  ]
}
```

**`content/week1/week.json`：**

```json
{
  "id": "week1",
  "title": "LLM 基础入门",
  "description": "从零开始学习大语言模型",
  "steps": [
    {
      "id": "step1",
      "title": "LLM 基础 + Prompt 结构与 API 调用",
      "docFile": "step1.md",
      "codeDir": "step1",
      "tags": ["基础", "API"]
    },
    {
      "id": "step2",
      "title": "流式输出与多轮对话",
      "docFile": "step2.md",
      "codeDir": "step2",
      "tags": ["Stream", "对话"]
    }
  ]
}
```

### 3.3 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron 主进程                           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   窗口管理    │    │  IPC 通信    │    │  node-pty   │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
           │                    │                   │
           │              contextBridge              │
           │                    │                   │
           ▼                    ▼                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Electron 渲染进程                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                     React 应用                            │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐    │  │
│  │  │ Sidebar │ │ParamPanel│ │ Terminal │ │  DocViewer  │    │  │
│  │  │(多级树) │ │         │ │         │ │             │    │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                         HTTP / WS
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Express 服务                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ 内容扫描器   │    │  LLM API    │    │  终端 WS    │        │
│  │(动态发现)   │    │             │    │             │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
                         读取文件
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       content/ 目录                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │   week1/    │    │   week2/    │    │   week3/    │        │
│  │  docs/code  │    │  docs/code  │    │  docs/code  │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 四、详细实施步骤

### 阶段一：环境准备与项目初始化（步骤 1-4）

#### 步骤 1：安装必要的系统依赖

node-pty 需要原生编译，确保系统有以下工具：

**macOS：**

```bash
# 安装 Xcode 命令行工具
xcode-select --install
```

**Windows：**

```bash
# 安装 windows-build-tools（以管理员身份运行）
npm install --global windows-build-tools
```

**验证：**

```bash
python --version   # 需要 Python 3.x
node --version     # 需要 Node.js 18+
```

---

#### 步骤 2：创建新的项目结构

```bash
# 在 LLMStudyLS 目录下操作
cd /Users/jianglin/Desktop/LLMStudyLS

# 创建应用目录
mkdir -p app/electron app/server/routes app/server/services app/src/components app/src/pages app/src/hooks app/src/services app/src/styles

# 创建内容目录结构
mkdir -p content/week1/docs content/week1/code

# 迁移现有内容到新结构
cp week1/stepDocs/*.md content/week1/docs/
cp -r week1/deepseekAITest/* content/week1/code/

# 复制环境变量文件
cp week1/.env app/.env
```

---

#### 步骤 3：初始化应用项目

在 `app/` 目录下创建 `package.json`：

```bash
cd app
```

创建 `app/package.json`：

```json
{
  "name": "llm-study-app",
  "version": "1.0.0",
  "description": "LLM 学习桌面应用",
  "main": "electron/main.js",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "electron:dev": "concurrently \"npm run dev\" \"wait-on http://localhost:5173 && electron .\"",
    "electron:build": "npm run build && electron-builder",
    "server:dev": "nodemon server/index.js",
    "start:dev": "concurrently \"npm run server:dev\" \"npm run electron:dev\"",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "openai": "^6.10.0",
    "dotenv": "^17.2.3",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "ws": "^8.16.0",
    "node-pty": "^1.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.0",
    "antd": "^5.15.0",
    "@ant-design/icons": "^5.3.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0",
    "xterm-addon-web-links": "^0.9.0",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "rehype-highlight": "^7.0.0",
    "axios": "^1.6.7",
    "glob": "^10.3.10"
  },
  "devDependencies": {
    "electron": "^29.0.0",
    "electron-builder": "^24.13.0",
    "electron-rebuild": "^3.2.9",
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.1.0",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.35",
    "autoprefixer": "^10.4.17",
    "concurrently": "^8.2.2",
    "wait-on": "^7.2.0",
    "nodemon": "^3.0.3"
  }
}
```

---

#### 步骤 4：安装依赖并配置构建工具

```bash
# 安装依赖
npm install

# 重新编译原生模块
npx electron-rebuild
```

**4.1 创建 `app/vite.config.js`：**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
})
```

**4.2 创建 `app/tailwind.config.js`：**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  prefix: 'tw-',
  theme: {
    extend: {},
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
}
```

**4.3 创建 `app/postcss.config.js`：**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

---

### 阶段二：内容配置系统（步骤 5-6）

#### 步骤 5：创建内容配置文件

**5.1 创建 `content/content.config.json`：**

```json
{
  "title": "LLM 学习计划",
  "description": "从入门到精通的 LLM 学习之旅",
  "version": "1.0.0",
  "autoScan": true,
  "weeks": [
    {
      "id": "week1",
      "enabled": true
    }
  ]
}
```

**5.2 创建 `content/week1/week.json`：**

```json
{
  "id": "week1",
  "title": "LLM 基础入门",
  "description": "从零开始学习大语言模型的基础知识",
  "order": 1,
  "steps": [
    {
      "id": "step1",
      "title": "LLM 基础 + Prompt 结构与 API 调用",
      "description": "学习 LLM 概念、Prompt 设计和 API 调用",
      "docFile": "step1.md",
      "codeFiles": ["test1.js"],
      "tags": ["基础", "API", "Prompt"]
    },
    {
      "id": "step2",
      "title": "流式输出",
      "description": "学习 Stream 流式输出的实现",
      "docFile": "step2.md",
      "codeFiles": ["test2.js"],
      "tags": ["Stream"]
    },
    {
      "id": "step3",
      "title": "多轮对话",
      "description": "实现多轮对话上下文管理",
      "docFile": "step3.md",
      "codeFiles": ["test3.js"],
      "tags": ["对话", "上下文"]
    },
    {
      "id": "step4",
      "title": "进阶实践",
      "description": "多种提示词技巧实践",
      "docFile": "step4.md",
      "codeDir": "test4",
      "tags": ["进阶"]
    },
    {
      "id": "step5",
      "title": "高级应用",
      "description": "更复杂的应用场景",
      "docFile": "step5.md",
      "codeDir": "test5",
      "tags": ["高级"]
    },
    {
      "id": "step6",
      "title": "参数调优",
      "description": "理解 Token、Temperature 等核心参数",
      "docFile": "step6.md",
      "codeDir": "test6",
      "tags": ["参数", "调优"]
    }
  ]
}
```

---

#### 步骤 6：创建内容扫描服务

**6.1 创建 `app/server/services/content-scanner.js`：**

```javascript
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_ROOT = path.join(__dirname, '../../../content')

class ContentScanner {
  constructor() {
    this.cache = null
    this.lastScanTime = null
  }

  /**
   * 获取完整的内容结构
   */
  async getContentStructure(forceRefresh = false) {
    // 缓存 5 分钟
    if (!forceRefresh && this.cache && Date.now() - this.lastScanTime < 5 * 60 * 1000) {
      return this.cache
    }

    const config = await this.readConfig()
    const weeks = []

    for (const weekConfig of config.weeks) {
      if (!weekConfig.enabled) continue

      const weekData = await this.scanWeek(weekConfig.id)
      if (weekData) {
        weeks.push(weekData)
      }
    }

    // 按 order 排序
    weeks.sort((a, b) => (a.order || 0) - (b.order || 0))

    this.cache = {
      ...config,
      weeks,
      scannedAt: new Date().toISOString(),
    }
    this.lastScanTime = Date.now()

    return this.cache
  }

  /**
   * 读取主配置文件
   */
  async readConfig() {
    const configPath = path.join(CONTENT_ROOT, 'content.config.json')
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      // 配置文件不存在则自动扫描
      return { title: 'LLM 学习', autoScan: true, weeks: await this.autoDetectWeeks() }
    }
  }

  /**
   * 自动检测 week 目录
   */
  async autoDetectWeeks() {
    const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && e.name.startsWith('week'))
      .map(e => ({ id: e.name, enabled: true }))
      .sort((a, b) => {
        const numA = parseInt(a.id.replace('week', ''))
        const numB = parseInt(b.id.replace('week', ''))
        return numA - numB
      })
  }

  /**
   * 扫描单个 week 目录
   */
  async scanWeek(weekId) {
    const weekPath = path.join(CONTENT_ROOT, weekId)

    try {
      await fs.access(weekPath)
    } catch {
      return null
    }

    // 读取 week.json 配置
    let weekConfig
    try {
      const configContent = await fs.readFile(path.join(weekPath, 'week.json'), 'utf-8')
      weekConfig = JSON.parse(configContent)
    } catch {
      // 没有配置文件则自动扫描
      weekConfig = await this.autoScanWeek(weekId, weekPath)
    }

    // 验证每个 step 的文件是否存在
    const validSteps = []
    for (const step of weekConfig.steps || []) {
      const docPath = path.join(weekPath, 'docs', step.docFile)
      try {
        await fs.access(docPath)
        validSteps.push({
          ...step,
          weekId,
          docPath,
        })
      } catch {
        console.warn(`文档不存在: ${docPath}`)
      }
    }

    return {
      ...weekConfig,
      steps: validSteps,
      path: weekPath,
    }
  }

  /**
   * 自动扫描 week 目录内容
   */
  async autoScanWeek(weekId, weekPath) {
    const docsPath = path.join(weekPath, 'docs')
    const codePath = path.join(weekPath, 'code')

    let docFiles = []
    try {
      const files = await fs.readdir(docsPath)
      docFiles = files.filter(f => f.endsWith('.md')).sort()
    } catch {
      // docs 目录不存在
    }

    const steps = docFiles.map((file, index) => {
      const id = file.replace('.md', '')
      return {
        id,
        title: `Step ${index + 1}`,
        docFile: file,
        codeDir: id.replace('step', 'test'),
      }
    })

    return {
      id: weekId,
      title: weekId.replace('week', 'Week '),
      steps,
    }
  }

  /**
   * 获取单个 Step 的详细信息
   */
  async getStepDetail(weekId, stepId) {
    const weekPath = path.join(CONTENT_ROOT, weekId)
    const structure = await this.getContentStructure()

    const week = structure.weeks.find(w => w.id === weekId)
    if (!week) throw new Error(`Week not found: ${weekId}`)

    const step = week.steps.find(s => s.id === stepId)
    if (!step) throw new Error(`Step not found: ${stepId}`)

    // 读取文档内容
    const docPath = path.join(weekPath, 'docs', step.docFile)
    const docContent = await fs.readFile(docPath, 'utf-8')

    // 获取代码文件列表
    let codeFiles = []
    if (step.codeDir) {
      const codeDirPath = path.join(weekPath, 'code', step.codeDir)
      try {
        const files = await fs.readdir(codeDirPath)
        codeFiles = files
          .filter(f => f.endsWith('.js'))
          .map(f => ({
            name: f,
            path: path.join(codeDirPath, f),
          }))
      } catch {
        // 目录不存在
      }
    } else if (step.codeFiles) {
      codeFiles = step.codeFiles.map(f => ({
        name: f,
        path: path.join(weekPath, 'code', f),
      }))
    }

    return {
      ...step,
      weekId,
      docContent,
      codeFiles,
    }
  }

  /**
   * 读取代码文件内容
   */
  async getCodeContent(filePath) {
    // 安全检查：确保路径在 content 目录内
    const normalizedPath = path.normalize(filePath)
    if (!normalizedPath.startsWith(CONTENT_ROOT)) {
      throw new Error('Access denied: path outside content directory')
    }

    return await fs.readFile(filePath, 'utf-8')
  }
}

export default new ContentScanner()
```

---

### 阶段三：Electron 主进程开发（步骤 7-9）

#### 步骤 7：创建 Electron 主进程

**7.1 创建 `app/electron/main.js`：**

```javascript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import ptyService from './pty-service.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 注册 IPC 处理
function setupIPC() {
  // 终端相关
  let currentTerminalId = null

  ipcMain.handle('terminal:create', async event => {
    const id = Date.now().toString()
    currentTerminalId = id

    const terminal = ptyService.create(id)

    terminal.onData(data => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', data)
      }
    })

    return id
  })

  ipcMain.on('terminal:write', (event, data) => {
    if (currentTerminalId) {
      ptyService.write(currentTerminalId, data)
    }
  })

  ipcMain.on('terminal:resize', (event, cols, rows) => {
    if (currentTerminalId) {
      ptyService.resize(currentTerminalId, cols, rows)
    }
  })

  ipcMain.handle('terminal:destroy', async (event, id) => {
    ptyService.destroy(id || currentTerminalId)
    if (id === currentTerminalId) {
      currentTerminalId = null
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIPC()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

---

#### 步骤 8：创建预加载脚本

**8.1 创建 `app/electron/preload.js`：**

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 终端 API
  terminal: {
    create: () => ipcRenderer.invoke('terminal:create'),
    write: data => ipcRenderer.send('terminal:write', data),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
    destroy: id => ipcRenderer.invoke('terminal:destroy', id),
    onData: callback => {
      const handler = (event, data) => callback(data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
  },

  // 平台信息
  platform: process.platform,
})
```

---

#### 步骤 9：创建终端服务

**9.1 创建 `app/electron/pty-service.js`：**

```javascript
import * as pty from 'node-pty'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class PtyService {
  constructor() {
    this.terminals = new Map()
  }

  create(id) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'zsh'

    // 设置工作目录为 content 目录
    const cwd = path.join(__dirname, '../../content')

    const terminal = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    })

    this.terminals.set(id, terminal)
    return terminal
  }

  write(id, data) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.write(data)
    }
  }

  resize(id, cols, rows) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.resize(cols, rows)
    }
  }

  destroy(id) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.kill()
      this.terminals.delete(id)
    }
  }

  destroyAll() {
    for (const [id, terminal] of this.terminals) {
      terminal.kill()
    }
    this.terminals.clear()
  }
}

export default new PtyService()
```

---

### 阶段四：Express 后端服务（步骤 10-11）

#### 步骤 10：创建 Express 服务入口

**10.1 创建 `app/server/index.js`：**

```javascript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import contentRoutes from './routes/content.js'
import llmRoutes from './routes/llm.js'

const app = express()
const PORT = process.env.SERVER_PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())

// 路由
app.use('/api/content', contentRoutes)
app.use('/api/llm', llmRoutes)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const server = createServer(app)

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})

export default server
```

---

#### 步骤 11：创建 API 路由

**11.1 创建 `app/server/routes/content.js`：**

```javascript
import express from 'express'
import contentScanner from '../services/content-scanner.js'

const router = express.Router()

// 获取完整内容结构
router.get('/structure', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true'
    const structure = await contentScanner.getContentStructure(forceRefresh)
    res.json(structure)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 获取单个 Step 详情
router.get('/weeks/:weekId/steps/:stepId', async (req, res) => {
  try {
    const { weekId, stepId } = req.params
    const detail = await contentScanner.getStepDetail(weekId, stepId)
    res.json(detail)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// 读取代码文件内容
router.get('/code', async (req, res) => {
  try {
    const { path: filePath } = req.query
    if (!filePath) {
      return res.status(400).json({ error: 'path parameter required' })
    }
    const content = await contentScanner.getCodeContent(filePath)
    res.json({ content })
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

export default router
```

**11.2 创建 `app/server/routes/llm.js`：**

```javascript
import express from 'express'
import OpenAI from 'openai'

const router = express.Router()

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
})

// 普通对话
router.post('/chat', async (req, res) => {
  try {
    const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = req.body

    const response = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
    })

    res.json({
      content: response.choices[0].message.content,
      usage: response.usage,
      finishReason: response.choices[0].finish_reason,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 流式对话
router.post('/chat/stream', async (req, res) => {
  try {
    const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = req.body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    res.end()
  }
})

export default router
```

---

### 阶段五：React 前端开发（步骤 12-14）

#### 步骤 12：创建前端入口

**12.1 创建 `app/index.html`：**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:*;"
    />
    <title>LLM 学习工具</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**12.2 创建 `app/src/main.jsx`：**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
```

**12.3 创建 `app/src/styles/index.css`：**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

/* xterm 样式 */
.xterm {
  padding: 8px;
}

.xterm-viewport {
  overflow-y: auto !important;
}

/* Markdown 代码块样式 */
.markdown-body pre {
  background-color: #f6f8fa;
  border-radius: 6px;
  padding: 16px;
  overflow-x: auto;
}

.markdown-body code {
  background-color: #f6f8fa;
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-size: 85%;
}

.markdown-body pre code {
  background-color: transparent;
  padding: 0;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
```

---

#### 步骤 13：创建主应用组件

**13.1 创建 `app/src/App.jsx`：**

```jsx
import React, { useState, useEffect } from 'react'
import { Layout, Spin, message } from 'antd'
import Sidebar from './components/Sidebar'
import StepDetail from './pages/StepDetail'
import Terminal from './components/Terminal'
import { fetchContentStructure } from './services/api'

const { Sider, Content } = Layout

function App() {
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [structure, setStructure] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null) // { weekId, stepId }

  useEffect(() => {
    loadContent()
  }, [])

  const loadContent = async () => {
    try {
      setLoading(true)
      const data = await fetchContentStructure()
      setStructure(data)

      // 默认选中第一个 step
      if (data.weeks?.length > 0 && data.weeks[0].steps?.length > 0) {
        const firstWeek = data.weeks[0]
        const firstStep = firstWeek.steps[0]
        setSelectedItem({ weekId: firstWeek.id, stepId: firstStep.id })
      }
    } catch (error) {
      message.error('加载内容失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (weekId, stepId) => {
    setSelectedItem({ weekId, stepId })
  }

  if (loading) {
    return (
      <div className="tw-h-screen tw-flex tw-items-center tw-justify-center">
        <Spin size="large" tip="加载中..." />
      </div>
    )
  }

  return (
    <Layout className="tw-h-screen">
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={280}
        collapsedWidth={80}
        className="tw-bg-white tw-border-r tw-border-gray-200"
        theme="light"
      >
        <div className="tw-h-12 tw-flex tw-items-center tw-justify-center tw-border-b tw-border-gray-200">
          <span className="tw-font-bold tw-text-lg">{collapsed ? 'LLM' : structure?.title || 'LLM 学习'}</span>
        </div>
        <Sidebar structure={structure} selectedItem={selectedItem} onSelect={handleSelect} collapsed={collapsed} />
      </Sider>

      <Layout>
        <Content className="tw-flex tw-flex-col tw-bg-gray-50">
          {/* 主内容区 */}
          <div className="tw-flex-1 tw-p-4 tw-overflow-hidden tw-flex tw-flex-col">
            {selectedItem ? (
              <StepDetail weekId={selectedItem.weekId} stepId={selectedItem.stepId} />
            ) : (
              <div className="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400">
                请从左侧选择学习内容
              </div>
            )}
          </div>

          {/* 终端区 */}
          <div className="tw-h-64 tw-bg-black tw-border-t tw-border-gray-300">
            <Terminal />
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
```

---

#### 步骤 14：创建核心组件

**14.1 创建 `app/src/components/Sidebar/index.jsx`：**

```jsx
import React from 'react'
import { Menu, Tag } from 'antd'
import { BookOutlined, FileTextOutlined, FolderOutlined } from '@ant-design/icons'

function Sidebar({ structure, selectedItem, onSelect, collapsed }) {
  if (!structure?.weeks) return null

  const menuItems = structure.weeks.map(week => ({
    key: week.id,
    icon: <FolderOutlined />,
    label: collapsed ? week.id.replace('week', 'W') : week.title,
    children: week.steps.map(step => ({
      key: `${week.id}:${step.id}`,
      icon: <FileTextOutlined />,
      label: (
        <div className="tw-flex tw-items-center tw-justify-between">
          <span className="tw-truncate">{step.title}</span>
          {!collapsed && step.tags?.length > 0 && (
            <Tag color="blue" className="tw-ml-2 tw-text-xs">
              {step.tags[0]}
            </Tag>
          )}
        </div>
      ),
    })),
  }))

  const selectedKey = selectedItem ? `${selectedItem.weekId}:${selectedItem.stepId}` : null

  const handleClick = ({ key }) => {
    const [weekId, stepId] = key.split(':')
    if (weekId && stepId) {
      onSelect(weekId, stepId)
    }
  }

  return (
    <Menu
      mode="inline"
      selectedKeys={selectedKey ? [selectedKey] : []}
      defaultOpenKeys={structure.weeks.map(w => w.id)}
      items={menuItems}
      onClick={handleClick}
      className="tw-border-none"
    />
  )
}

export default Sidebar
```

**14.2 创建 `app/src/components/Terminal/index.jsx`：**

```jsx
import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

function Terminal() {
  const containerRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const cleanupRef = useRef(null)

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || xtermRef.current) return

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selection: '#264f78',
      },
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.open(containerRef.current)

    // 延迟 fit 以确保容器尺寸正确
    setTimeout(() => fitAddon.fit(), 100)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // 创建 PTY 终端
    if (window.electronAPI?.terminal) {
      await window.electronAPI.terminal.create()

      // 监听终端输出
      cleanupRef.current = window.electronAPI.terminal.onData(data => {
        xterm.write(data)
      })

      // 监听用户输入
      xterm.onData(data => {
        window.electronAPI.terminal.write(data)
      })
    } else {
      // 非 Electron 环境的提示
      xterm.writeln('\\x1b[33m终端功能需要在 Electron 环境中运行\\x1b[0m')
      xterm.writeln('')
    }
  }, [])

  useEffect(() => {
    /* --------------------------------
     1️⃣ 初始化终端（可能会在内部创建 xterm、fitAddon，并把清理函数存到 cleanupRef）
     -------------------------------- */
    initTerminal()

    /* --------------------------------
     2️⃣ 为窗口 resize 注册事件监听器
        该函数会在窗口尺寸改变时让终端重新适配大小
     -------------------------------- */

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)

    /* --------------------------------
     3️⃣ 清理函数（在卸载或依赖变化前调用）
        - 移除 resize 监听
        - 调用 initTerminal 返回的清理函数（如果有）
        - 释放 xterm 实例
     -------------------------------- */
    return () => {
      window.removeEventListener('resize', handleResize)
      if (cleanupRef.current) {
        cleanupRef.current()
      }
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [initTerminal]) // 依赖数组：仅当 initTerminal 函数引用变化时重新执行

  return <div ref={containerRef} className="tw-w-full tw-h-full" />
}

export default Terminal
```

**14.3 创建 `app/src/pages/StepDetail.jsx`：**

```jsx
import React, { useState, useEffect, useCallback } from 'react'
import { Tabs, Card, Slider, InputNumber, Button, Space, Spin, Select, message } from 'antd'
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchStepDetail, fetchCodeContent } from '../services/api'

function StepDetail({ weekId, stepId }) {
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null)
  const [selectedCode, setSelectedCode] = useState(null)
  const [codeContent, setCodeContent] = useState('')
  const [params, setParams] = useState({
    temperature: 0.7,
    max_tokens: 500,
  })

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchStepDetail(weekId, stepId)
      setDetail(data)

      // 默认选中第一个代码文件
      if (data.codeFiles?.length > 0) {
        setSelectedCode(data.codeFiles[0])
        const content = await fetchCodeContent(data.codeFiles[0].path)
        setCodeContent(content)
      } else {
        setSelectedCode(null)
        setCodeContent('')
      }
    } catch (error) {
      message.error('加载失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }, [weekId, stepId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  const handleCodeSelect = async file => {
    setSelectedCode(file)
    try {
      const content = await fetchCodeContent(file.path)
      setCodeContent(content)
    } catch (error) {
      message.error('加载代码失败')
    }
  }

  const handleRunCode = () => {
    if (!selectedCode || !window.electronAPI?.terminal) {
      message.warning('请先选择代码文件')
      return
    }

    // 构建运行命令
    const cmd = `node "${selectedCode.path}"\n`
    window.electronAPI.terminal.write(cmd)
  }

  if (loading) {
    return (
      <div className="tw-h-full tw-flex tw-items-center tw-justify-center">
        <Spin size="large" />
      </div>
    )
  }

  if (!detail) {
    return <div className="tw-h-full tw-flex tw-items-center tw-justify-center tw-text-gray-400">内容加载失败</div>
  }

  return (
    <div className="tw-h-full tw-flex tw-flex-col">
      <div className="tw-mb-4">
        <h2 className="tw-text-xl tw-font-bold tw-m-0">{detail.title}</h2>
        {detail.description && <p className="tw-text-gray-500 tw-mt-1 tw-mb-0">{detail.description}</p>}
      </div>

      <Tabs
        className="tw-flex-1 tw-min-h-0"
        items={[
          {
            key: 'doc',
            label: '学习文档',
            children: (
              <div className="tw-h-full tw-overflow-auto tw-bg-white tw-rounded-lg tw-p-6">
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.docContent}</ReactMarkdown>
                </div>
              </div>
            ),
          },
          {
            key: 'code',
            label: '代码实践',
            children: (
              <div className="tw-h-full tw-flex tw-gap-4">
                {/* 代码区 */}
                <div className="tw-flex-1 tw-flex tw-flex-col tw-bg-white tw-rounded-lg tw-overflow-hidden">
                  <div className="tw-p-3 tw-border-b tw-flex tw-items-center tw-justify-between">
                    <Select
                      value={selectedCode?.name}
                      onChange={(_, option) => handleCodeSelect(option.file)}
                      style={{ width: 200 }}
                      placeholder="选择代码文件"
                      options={detail.codeFiles?.map(f => ({
                        value: f.name,
                        label: f.name,
                        file: f,
                      }))}
                    />
                    <Space>
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleRunCode}
                        disabled={!selectedCode}
                      >
                        运行
                      </Button>
                    </Space>
                  </div>
                  <pre className="tw-flex-1 tw-m-0 tw-p-4 tw-overflow-auto tw-bg-gray-50 tw-text-sm">
                    <code>{codeContent || '// 请选择代码文件'}</code>
                  </pre>
                </div>

                {/* 参数控制面板 */}
                <div className="tw-w-72">
                  <Card title="参数控制" size="small">
                    <div className="tw-space-y-4">
                      <div>
                        <label className="tw-block tw-text-sm tw-mb-1">Temperature: {params.temperature}</label>
                        <Slider
                          min={0}
                          max={2}
                          step={0.1}
                          value={params.temperature}
                          onChange={v => setParams(p => ({ ...p, temperature: v }))}
                        />
                        <p className="tw-text-xs tw-text-gray-400 tw-mt-1">控制输出随机性 (0=确定, 2=随机)</p>
                      </div>

                      <div>
                        <label className="tw-block tw-text-sm tw-mb-1">Max Tokens</label>
                        <InputNumber
                          min={1}
                          max={4096}
                          value={params.max_tokens}
                          onChange={v => setParams(p => ({ ...p, max_tokens: v }))}
                          className="tw-w-full"
                        />
                        <p className="tw-text-xs tw-text-gray-400 tw-mt-1">限制输出最大长度</p>
                      </div>
                    </div>
                  </Card>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}

export default StepDetail
```

**14.4 创建 `app/src/services/api.js`：**

```javascript
import axios from 'axios'

const API_BASE = 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

/**
 * 获取内容结构
 */
export async function fetchContentStructure(refresh = false) {
  const res = await api.get('/content/structure', {
    params: { refresh },
  })
  return res.data
}

/**
 * 获取 Step 详情
 */
export async function fetchStepDetail(weekId, stepId) {
  const res = await api.get(`/content/weeks/${weekId}/steps/${stepId}`)
  return res.data
}

/**
 * 获取代码文件内容
 */
export async function fetchCodeContent(filePath) {
  const res = await api.get('/content/code', {
    params: { path: filePath },
  })
  return res.data.content
}

/**
 * LLM 对话
 */
export async function chatWithLLM(messages, options = {}) {
  const res = await api.post('/llm/chat', {
    messages,
    ...options,
  })
  return res.data
}

export default api
```

---

### 阶段六：集成测试与打包（步骤 15）

#### 步骤 15：配置打包与测试

**15.1 创建 `app/electron-builder.json`：**

```json
{
  "appId": "com.llmstudy.app",
  "productName": "LLM学习工具",
  "directories": {
    "output": "release"
  },
  "files": ["dist/**/*", "electron/**/*", "server/**/*", "package.json"],
  "extraResources": [
    {
      "from": "../content",
      "to": "content",
      "filter": ["**/*"]
    }
  ],
  "mac": {
    "target": ["dmg", "zip"],
    "icon": "build/icon.icns"
  },
  "win": {
    "target": ["nsis", "zip"],
    "icon": "build/icon.ico"
  },
  "linux": {
    "target": ["AppImage", "deb"]
  }
}
```

**15.2 开发测试流程：**

```bash
# 进入应用目录
cd app

# 终端 1: 启动后端服务
npm run server:dev

# 终端 2: 启动前端 + Electron
npm run electron:dev

# 或者一键启动
npm run start:dev
```

**15.3 生产打包：**

```bash
npm run electron:build
```

---

## 五、添加新内容指南

### 5.1 添加新的 Step

1. 在 `content/week1/docs/` 下创建新的 markdown 文件，如 `step7.md`
2. 在 `content/week1/code/` 下创建对应的代码目录或文件
3. 更新 `content/week1/week.json`，添加新 step 配置：

```json
{
  "id": "step7",
  "title": "新的学习主题",
  "description": "描述内容",
  "docFile": "step7.md",
  "codeDir": "test7",
  "tags": ["标签"]
}
```

### 5.2 添加新的 Week

1. 创建新目录：`content/week2/`
2. 创建配置文件：`content/week2/week.json`
3. 创建文档和代码目录：`docs/` 和 `code/`
4. 更新 `content/content.config.json`：

```json
{
  "weeks": [
    { "id": "week1", "enabled": true },
    { "id": "week2", "enabled": true }
  ]
}
```

### 5.3 自动发现模式

如果启用了 `autoScan: true`，系统会自动：

- 扫描 `content/` 下所有 `week*` 目录
- 扫描每个 week 下的 `docs/*.md` 文件
- 无需手动配置即可显示新内容

---

## 六、常见问题解决

### 6.1 node-pty 编译失败

```bash
# macOS
xcode-select --install

# Windows (管理员运行)
npm install -g windows-build-tools

# 重新编译
rm -rf node_modules
npm install
npx electron-rebuild
```

### 6.2 内容不显示

检查点：

1. 确保 `content/` 目录结构正确
2. 检查 `week.json` 配置是否有语法错误
3. 检查后端服务是否正常运行：`http://localhost:3001/api/content/structure`

### 6.3 终端无响应

检查点：

1. 确认在 Electron 环境中运行
2. 检查 `preload.js` 是否正确加载
3. 查看开发者工具控制台是否有错误

---

## 七、参考资源

- [Electron 文档](https://www.electronjs.org/docs)
- [React 文档](https://react.dev)
- [Ant Design 文档](https://ant.design/docs/react/introduce-cn)
- [xterm.js 文档](https://xtermjs.org/)
- [node-pty GitHub](https://github.com/microsoft/node-pty)

---

**按照以上步骤逐一完成，你将拥有一个可扩展的 LLM 学习桌面应用！**
