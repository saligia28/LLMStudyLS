# Step 83: 应用落地｜打包成 web 小产品

## 学习目标

这一节把前几天的零散代码整理成一个可启动、可配置、可说明的小产品。

完成后你应该能：

1. 梳理应用架构
2. 把环境变量分成生成链、embedding 链、应用链三组
3. 做到一键启动和基础健康检查
4. 为后面的 README 和部署说明打好底稿

> **本节默认能力边界**：应用里仍然坚持 `DeepSeek = 生成`、`Local Embedding = 检索`，不要把两条链混在一组配置里。

---

## 一、推荐目录结构

```text
doc-qa-app/
├── server/
│   ├── index.js
│   ├── config.js
│   ├── routes/
│   │   ├── upload.js
│   │   ├── query.js
│   │   └── health.js
│   └── services/
│       ├── chunker.js
│       ├── embedder.js
│       ├── vector-store.js
│       └── rag.js
├── public/
│   ├── index.html
│   ├── app.js
│   └── style.css
├── uploads/
├── .cache/
├── scripts/
│   └── setup.js
├── .env
├── .env.example
└── package.json
```

---

## 二、环境变量分三组

```bash
# 生成链
DEEPSEEK_API_KEY=your-key
DEEPSEEK_BASEURL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# embedding 链
EMBEDDING_BACKEND=openai-compatible
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_API_KEY=ollama
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_CACHE_FILE=./.cache/embeddings.json

# 应用参数
PORT=3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
CHUNK_SIZE=800
CHUNK_OVERLAP=160
TOP_K=5
SIMILARITY_THRESHOLD=0.5
```

不要再把同一个变量既拿来做回答模型，又拿来做 embedding 模型。

---

## 三、补回一个完整的 `config.js`

```js
// server/config.js
import 'dotenv/config'

function requireEnv(key) {
  const value = process.env[key]
  if (!value) {
    throw new Error(`缺少必须的环境变量: ${key}`)
  }
  return value
}

export const config = {
  llm: {
    apiKey: requireEnv('DEEPSEEK_API_KEY'),
    baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },
  embedding: {
    backend: process.env.EMBEDDING_BACKEND || 'openai-compatible',
    baseURL: process.env.EMBEDDING_BASE_URL,
    apiKey: process.env.EMBEDDING_API_KEY || 'local',
    model: requireEnv('EMBEDDING_MODEL'),
    cacheFile: process.env.EMBEDDING_CACHE_FILE || './.cache/embeddings.json',
  },
  app: {
    port: Number(process.env.PORT || 3000),
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB || 10),
    chunkSize: Number(process.env.CHUNK_SIZE || 800),
    overlap: Number(process.env.CHUNK_OVERLAP || 160),
    topK: Number(process.env.TOP_K || 5),
    threshold: Number(process.env.SIMILARITY_THRESHOLD || 0.5),
  },
}
```

这段配置模块保留下来后，后面无论是写 README、换环境，还是让同学抄项目结构，都会轻松很多。

---

## 四、补回服务入口 `server/index.js`

```js
// server/index.js
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { config } from './config.js'
import uploadRouter from './routes/upload.js'
import queryRouter from './routes/query.js'
import healthRouter from './routes/health.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '../public')))

app.use('/api', uploadRouter)
app.use('/api', queryRouter)
app.use('/api', healthRouter)

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

app.use((error, req, res, next) => {
  console.error('[server]', error)
  res.status(error.status || 500).json({
    error: error.message || '服务器内部错误',
    code: error.code || 'INTERNAL_ERROR',
  })
})

app.listen(config.app.port, () => {
  console.log(`server ready: http://localhost:${config.app.port}`)
})
```

---

## 五、补回 `package.json` 的脚本示例

下面的依赖版本号只作示意，安装时以当前稳定版为准。

```json
{
  "name": "doc-qa-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "setup": "node scripts/setup.js",
    "dev": "node --watch server/index.js",
    "start": "node server/index.js",
    "clean": "rm -rf uploads/* .cache/*"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.67.3"
  }
}
```

这一段不是炫技，而是为了把“怎么启动它”讲清楚。

---

## 六、补回启动前检查脚本

```js
// scripts/setup.js
import 'dotenv/config'
import fs from 'fs'
import path from 'path'

const required = ['DEEPSEEK_API_KEY', 'EMBEDDING_MODEL']

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`缺少环境变量: ${key}`)
  }
}

const uploadDir = process.env.UPLOAD_DIR || './uploads'
const cacheFile = process.env.EMBEDDING_CACHE_FILE || './.cache/embeddings.json'
const cacheDir = path.dirname(cacheFile)

fs.mkdirSync(uploadDir, { recursive: true })
fs.mkdirSync(cacheDir, { recursive: true })

console.log('环境检查完成，可以启动应用')
```

如果你要把教程给别人照着搭项目，这种脚本会非常实用。

---

## 七、最小前端交互骨架也补回来

```js
// public/app.js
const form = document.querySelector('#ask-form')
const input = document.querySelector('#question')
const output = document.querySelector('#answer')

form.addEventListener('submit', async (event) => {
  event.preventDefault()

  const question = input.value.trim()
  if (!question) return

  output.textContent = '思考中...'

  const response = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })

  const data = await response.json()
  output.textContent = data.answer || data.error || '无返回内容'
})
```

这一节不需要把前端写复杂，但要保留最小闭环，这样教程才像一个真正的小产品，而不是只有后端片段。

---

## 八、自测 Checklist

```text
功能检查
  □ 上传文件后返回 chunkCount
  □ /api/health 能看到 docCount 与 totalChunks
  □ 提问能返回基于文档的答案
  □ 文档中未提及的问题不会胡编

配置检查
  □ LLM_MODEL 只用于生成
  □ EMBEDDING_MODEL 只用于向量化
  □ DEEPSEEK_* 与 EMBEDDING_* 没有混用
```

---

## 九、小结

这一节的目标不是多写功能，而是把架构讲清楚：

1. 生成链配置单独管理
2. embedding 链配置单独管理
3. 应用运行参数单独管理
4. 教程里要保留入口、脚本、最小前端这些关键代码实例，才方便你真的把它搭起来

这样到 README 和部署阶段，你的项目说明才会真正清晰。
