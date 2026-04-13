# Step 83: 应用落地｜打包成 web 小产品

## 学习目标

这一节把过去几天零散的代码整理成一个完整、可部署的 web 应用。

完成后你应该能：

1. 梳理应用的整体架构，识别技术债务
2. 完善错误处理和边界情况
3. 通过环境变量配置不同的部署环境
4. 用 npm scripts 实现一键启动
5. 做一次自测 checklist，确保产品可用

---

## 一、当前架构梳理

```text
doc-qa-app/
├── server/
│   ├── index.js          # Express 入口
│   ├── routes/
│   │   ├── upload.js     # 文件上传 (Step 79)
│   │   └── query.js      # 问答接口 (Step 81)
│   └── services/
│       ├── chunker.js    # 文档切分 (Step 79)
│       ├── embedder.js   # Embedding (Step 80)
│       └── rag.js        # RAG Pipeline (Week 11)
├── public/
│   ├── index.html        # 主页面
│   ├── style.css
│   └── app.js            # 前端逻辑
├── uploads/              # 上传文件临时存放
├── .cache/               # Embedding 缓存
├── .env                  # 环境变量
├── .env.example          # 环境变量模板
└── package.json
```

---

## 二、完善 Express 服务入口

```js
// server/index.js
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import uploadRouter from './routes/upload.js'
import queryRouter  from './routes/query.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.static(path.join(__dirname, '../public')))

// API 路由
app.use('/api', uploadRouter)
app.use('/api', queryRouter)

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// SPA fallback（所有未知路由返回 index.html）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err)
  res.status(err.status || 500).json({
    error: err.message || '服务器内部错误',
    code: err.code || 'INTERNAL_ERROR',
  })
})

app.listen(PORT, () => {
  console.log(`服务启动成功 → http://localhost:${PORT}`)
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`)
})
```

---

## 三、环境变量配置

```bash
# .env.example
# 复制为 .env 并填入真实值

# 服务端口
PORT=3000
NODE_ENV=development

# DeepSeek API
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_BASEURL=https://api.deepseek.com

# 上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
ALLOWED_EXTENSIONS=txt,md,pdf

# 向量检索配置
EMBEDDING_CACHE_FILE=./.cache/embeddings.json
CHUNK_SIZE=800
CHUNK_OVERLAP=160
TOP_K=5
SIMILARITY_THRESHOLD=0.5
```

```js
// server/config.js
import 'dotenv/config'

function requireEnv(key) {
  const value = process.env[key]
  if (!value) throw new Error(`缺少必须的环境变量: ${key}`)
  return value
}

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  env: process.env.NODE_ENV || 'development',

  ai: {
    apiKey:  requireEnv('DEEPSEEK_API_KEY'),
    baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    model:   process.env.LLM_MODEL || 'deepseek-chat',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  },

  upload: {
    dir:          process.env.UPLOAD_DIR || './uploads',
    maxSizeMB:    parseInt(process.env.MAX_FILE_SIZE_MB || '10'),
    allowedExts:  (process.env.ALLOWED_EXTENSIONS || 'txt,md').split(','),
  },

  rag: {
    cacheFile:  process.env.EMBEDDING_CACHE_FILE || './.cache/embeddings.json',
    chunkSize:  parseInt(process.env.CHUNK_SIZE || '800'),
    overlap:    parseInt(process.env.CHUNK_OVERLAP || '160'),
    topK:       parseInt(process.env.TOP_K || '5'),
    threshold:  parseFloat(process.env.SIMILARITY_THRESHOLD || '0.5'),
  },
}
```

---

## 四、package.json 脚本

```json
{
  "name": "doc-qa-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start":     "node server/index.js",
    "dev":       "node --watch server/index.js",
    "setup":     "node scripts/setup.js",
    "clean":     "rm -rf uploads/* .cache/*",
    "test:api":  "node scripts/test-api.js"
  },
  "dependencies": {
    "cors":        "^2.8.5",
    "dotenv":      "^16.0.0",
    "express":     "^4.18.0",
    "multer":      "^1.4.5",
    "openai":      "^4.0.0"
  }
}
```

---

## 五、启动检查脚本

```js
// scripts/setup.js — 启动前环境检查
import fs from 'fs'
import path from 'path'

const checks = [
  {
    name: '环境变量',
    check: () => {
      const required = ['DEEPSEEK_API_KEY']
      const missing = required.filter(k => !process.env[k])
      if (missing.length > 0) throw new Error(`缺少: ${missing.join(', ')}`)
    }
  },
  {
    name: '上传目录',
    check: () => {
      const dir = process.env.UPLOAD_DIR || './uploads'
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
  },
  {
    name: '缓存目录',
    check: () => {
      const cacheFile = process.env.EMBEDDING_CACHE_FILE || './.cache/embeddings.json'
      const dir = path.dirname(cacheFile)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }
  },
]

console.log('=== 启动前检查 ===')
let allPassed = true

for (const { name, check } of checks) {
  try {
    check()
    console.log(`✓ ${name}`)
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`)
    allPassed = false
  }
}

if (!allPassed) {
  console.error('\n启动失败，请修复以上问题后重试。')
  process.exit(1)
}
console.log('\n所有检查通过，可以启动服务。')
```

---

## 六、上线前自测 Checklist

```text
功能测试
  □ 上传 .txt 文件 → 成功，显示 chunk 数量
  □ 上传 .md 文件  → 成功
  □ 上传超大文件   → 返回友好的大小限制提示
  □ 上传不支持的格式 → 返回格式限制提示
  □ 提问并获得答案  → 答案带来源引用
  □ 提问超出文档范围 → 回答"文档中未提及"而非乱编
  □ 问题为空       → 输入框不允许提交
  □ 流式输出正常   → 逐字显示，无乱码

错误处理
  □ API Key 错误   → 后端返回清晰错误，前端展示
  □ 网络断开提问   → 前端错误提示，不卡死

性能
  □ 首屏加载 < 2s  → 静态资源已压缩
  □ 重复问同一个问题 → 速度明显加快（缓存生效）
```

---

## 七、小结

1. 好的应用架构是**职责分明**：路由处理请求，service 处理业务，config 集中管理配置。
2. 环境变量是开发环境和生产环境切换的唯一开关，不要把 key 硬编码在代码里。
3. 全局错误处理中间件可以兜底所有未捕获的错误，统一响应格式。
4. 自测 checklist 是上线前的最后一道门，每次发布都应该跑一遍。
5. `--watch` 模式让开发时代码改动自动重启，无需安装 nodemon。
