# Step 24: Node AI 后端封装｜跨域、中间件、环境变量管理

## 学习目标

这个任务的本质是回答一个核心问题：**如何构建一个安全、规范、易配置的 Node.js 后端应用**。

通过本教程,你将：

1. 理解跨域（CORS）的原理和配置
2. 掌握 Express 中间件的使用和自定义
3. 学会规范的环境变量管理
4. 实现请求日志和性能监控

---

## 一、核心认知：Web 安全的三大基石

### 1.1 跨域、中间件、环境变量的作用

```
┌─────────────────────────────────────────────────────────────┐
│              Web 后端的三大基石                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   【跨域 - CORS】                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  作用：控制哪些前端可以访问后端 API               │       │
│   │  场景：                                          │       │
│   │  - 前端: http://localhost:5173                  │       │
│   │  - 后端: http://localhost:3000                  │       │
│   │  - 没有 CORS → 浏览器拦截请求                    │       │
│   │  - 配置 CORS → 允许跨域访问                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   【中间件 - Middleware】                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  作用：在请求到达路由前/后执行通用逻辑            │       │
│   │  场景：                                          │       │
│   │  - 请求日志记录                                  │       │
│   │  - 身份认证验证                                  │       │
│   │  - 请求参数解析                                  │       │
│   │  - 错误统一处理                                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   【环境变量 - Environment Variables】                        │
│   ┌─────────────────────────────────────────────────┐       │
│   │  作用：管理不同环境的配置                         │       │
│   │  场景：                                          │       │
│   │  - 开发环境: 本地数据库                          │       │
│   │  - 测试环境: 测试数据库                          │       │
│   │  - 生产环境: 线上数据库                          │       │
│   │  - 敏感信息: API Key、密码等不写死在代码里        │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、跨域（CORS）详解

### 2.1 什么是跨域？

```
┌─────────────────────────────────────────────────────────────┐
│                  跨域问题                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   同源策略（Same-Origin Policy）：                            │
│   浏览器的安全机制，限制不同源之间的资源访问                   │
│                                                             │
│   什么是"同源"？                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  协议 + 域名 + 端口 完全相同                      │       │
│   │                                                 │       │
│   │  示例：                                          │       │
│   │  http://example.com:80/api                      │       │
│   │  └──┬──┘ └────┬────┘ └┬┘                        │       │
│   │   协议      域名     端口                         │       │
│   │                                                 │       │
│   │  这些是同源：                                     │       │
│   │  ✓ http://example.com/api                       │       │
│   │  ✓ http://example.com/other                     │       │
│   │                                                 │       │
│   │  这些是跨域：                                     │       │
│   │  ✗ https://example.com      (协议不同)           │       │
│   │  ✗ http://api.example.com   (域名不同)           │       │
│   │  ✗ http://example.com:3000  (端口不同)           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   跨域场景：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  前端页面: http://localhost:5173                │       │
│   │              ↓ 发送请求                          │       │
│   │  后端 API:  http://localhost:3000               │       │
│   │              ↓ 浏览器拦截                        │       │
│   │  ❌ CORS Error: No 'Access-Control-Allow-Origin'│       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 CORS 工作原理

```
┌─────────────────────────────────────────────────────────────┐
│              CORS 请求流程                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   简单请求（GET、POST）：                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 浏览器发送请求 →                             │       │
│   │     GET /api/data                               │       │
│   │     Origin: http://localhost:5173               │       │
│   │                                                 │       │
│   │  2. 服务器返回响应 ←                             │       │
│   │     Access-Control-Allow-Origin: *              │       │
│   │     或者                                         │       │
│   │     Access-Control-Allow-Origin:                │       │
│   │        http://localhost:5173                    │       │
│   │                                                 │       │
│   │  3. 浏览器检查响应头                             │       │
│   │     - 如果匹配 → 允许访问数据                    │       │
│   │     - 如果不匹配 → 拒绝访问                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   复杂请求（PUT、DELETE、自定义头）：                         │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 预检请求（Preflight）                        │       │
│   │     OPTIONS /api/data                           │       │
│   │     Origin: http://localhost:5173               │       │
│   │     Access-Control-Request-Method: PUT          │       │
│   │                                                 │       │
│   │  2. 服务器返回允许的方法                         │       │
│   │     Access-Control-Allow-Origin: *              │       │
│   │     Access-Control-Allow-Methods: GET,POST,PUT  │       │
│   │                                                 │       │
│   │  3. 浏览器发送实际请求                           │       │
│   │     PUT /api/data                               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 实现 CORS 中间件

创建 `src/middleware/cors.js`：

```javascript
import logger from '../utils/logger.js'

/**
 * CORS 中间件
 * 处理跨域请求
 */
export function corsMiddleware(options = {}) {
  const {
    origin = '*', // 允许的来源
    methods = 'GET,POST,PUT,DELETE,OPTIONS', // 允许的方法
    allowedHeaders = 'Content-Type,Authorization', // 允许的请求头
    credentials = true, // 是否允许携带凭证
    maxAge = 86400, // 预检请求缓存时间（秒）
  } = options

  return (req, res, next) => {
    // 设置 CORS 响应头
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', methods)
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders)
    res.setHeader('Access-Control-Allow-Credentials', credentials)
    res.setHeader('Access-Control-Max-Age', maxAge)

    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      logger.debug(`CORS preflight: ${req.method} ${req.url}`)
      return res.status(204).end()
    }

    next()
  }
}

/**
 * 高级 CORS 中间件
 * 支持动态来源验证
 */
export function advancedCorsMiddleware(allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.headers.origin

    // 检查来源是否在白名单中
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    } else {
      logger.warn(`Blocked CORS request from origin: ${origin}`)
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    next()
  }
}
```

---

## 三、中间件系统

### 3.1 Express 中间件流程

```
┌─────────────────────────────────────────────────────────────┐
│              Express 中间件执行流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   请求 → 中间件1 → 中间件2 → 路由 → 中间件3 → 响应           │
│                                                             │
│   示例：                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │  POST /api/chat                                 │       │
│   │    ↓                                            │       │
│   │  [1] CORS 中间件                                │       │
│   │    ↓                                            │       │
│   │  [2] 日志中间件                                  │       │
│   │    ↓                                            │       │
│   │  [3] Body Parser                                │       │
│   │    ↓                                            │       │
│   │  [4] 认证中间件                                  │       │
│   │    ↓                                            │       │
│   │  [5] 路由处理器                                  │       │
│   │    ↓                                            │       │
│   │  [6] 错误处理中间件                              │       │
│   │    ↓                                            │       │
│   │  返回响应                                        │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   中间件类型：                                               │
│   - 应用级中间件: app.use()                                  │
│   - 路由级中间件: router.use()                               │
│   - 错误处理中间件: (err, req, res, next) => {}              │
│   - 内置中间件: express.json()                               │
│   - 第三方中间件: cors(), helmet()                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 请求日志中间件

创建 `src/middleware/requestLogger.js`：

```javascript
import logger from '../utils/logger.js'

/**
 * 请求日志中间件
 * 记录每个请求的详细信息和响应时间
 */
export function requestLoggerMiddleware(req, res, next) {
  const startTime = Date.now()

  // 记录请求信息
  logger.info(`→ ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  })

  // 拦截响应的 end 方法
  const originalEnd = res.end
  res.end = function (...args) {
    const duration = Date.now() - startTime
    const statusCode = res.statusCode

    // 记录响应信息
    logger.info(`← ${req.method} ${req.url} ${statusCode} ${duration}ms`, {
      duration,
      statusCode,
    })

    // 调用原始的 end 方法
    originalEnd.apply(res, args)
  }

  next()
}
```

### 3.3 性能监控中间件

创建 `src/middleware/performance.js`：

```javascript
import logger from '../utils/logger.js'

/**
 * 性能监控中间件
 * 监控慢请求和统计性能指标
 */
export function performanceMiddleware(options = {}) {
  const { slowThreshold = 1000 } = options // 慢请求阈值（毫秒）

  return (req, res, next) => {
    const startTime = Date.now()
    const startMemory = process.memoryUsage()

    res.on('finish', () => {
      const duration = Date.now() - startTime
      const endMemory = process.memoryUsage()
      const memoryDelta = {
        heapUsed: endMemory.heapUsed - startMemory.heapUsed,
        external: endMemory.external - startMemory.external,
      }

      // 记录慢请求
      if (duration > slowThreshold) {
        logger.warn(`Slow request detected: ${req.method} ${req.url}`, {
          duration,
          memoryDelta,
        })
      }
    })

    next()
  }
}

/**
 * 请求计数中间件
 * 统计 API 调用次数
 */
const requestCounts = new Map()

export function requestCounterMiddleware(req, res, next) {
  const key = `${req.method} ${req.path}`
  const count = requestCounts.get(key) || 0
  requestCounts.set(key, count + 1)

  // 暴露统计数据
  req.requestCounts = requestCounts

  next()
}

/**
 * 获取请求统计
 */
export function getRequestStats() {
  return Object.fromEntries(requestCounts)
}
```

### 3.4 请求验证中间件

创建 `src/middleware/validator.js`：

```javascript
import { error } from '../utils/response.js'

/**
 * 验证消息格式
 */
export function validateMessages(req, res, next) {
  const { messages } = req.body

  if (!messages) {
    return res.status(400).json(error('缺少 messages 参数', 400))
  }

  if (!Array.isArray(messages)) {
    return res.status(400).json(error('messages 必须是数组', 400))
  }

  if (messages.length === 0) {
    return res.status(400).json(error('messages 不能为空', 400))
  }

  // 验证每条消息的格式
  for (const [index, message] of messages.entries()) {
    if (!message.role || !message.content) {
      return res.status(400).json(error(`messages[${index}] 缺少 role 或 content`, 400))
    }

    if (!['system', 'user', 'assistant'].includes(message.role)) {
      return res.status(400).json(error(`messages[${index}] role 无效`, 400))
    }
  }

  next()
}

/**
 * 限制请求体大小
 */
export function validateBodySize(maxSize = 1024 * 1024) {
  // 1MB
  return (req, res, next) => {
    const contentLength = parseInt(req.get('content-length') || '0')

    if (contentLength > maxSize) {
      return res.status(413).json(error('请求体过大', 413))
    }

    next()
  }
}
```

---

## 四、环境变量管理

### 4.1 环境变量最佳实践

```
┌─────────────────────────────────────────────────────────────┐
│              环境变量最佳实践                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   原则：                                                     │
│   1. 敏感信息不写在代码里                                     │
│   2. 不同环境使用不同配置                                     │
│   3. .env 文件不提交到版本控制                                │
│   4. 提供 .env.example 作为模板                               │
│                                                             │
│   文件结构：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  .env              ← 实际配置（不提交）           │       │
│   │  .env.example      ← 配置模板（提交）             │       │
│   │  .env.development  ← 开发环境配置                │       │
│   │  .env.production   ← 生产环境配置                │       │
│   │  .env.test         ← 测试环境配置                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 完善的 .env.example

创建 `.env.example`：

```bash
# 服务器配置
NODE_ENV=development
PORT=3000

# CORS 配置
CORS_ORIGIN=http://localhost:5173
CORS_CREDENTIALS=true

# AI 服务配置
AI_DEFAULT_PROVIDER=deepseek

# DeepSeek 配置
DEEPSEEK_API_KEY=
DEEPSEEK_BASEURL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# OpenAI 配置
OPENAI_API_KEY=
OPENAI_MODEL=gpt-3.5-turbo

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/app.log

# 性能监控
SLOW_REQUEST_THRESHOLD=1000

# 安全配置
REQUEST_BODY_MAX_SIZE=1048576
```

### 4.3 配置验证

更新 `src/config/index.js`：

```javascript
import 'dotenv/config'
import logger from '../utils/logger.js'

/**
 * 验证必需的环境变量
 */
function validateEnv() {
  const required = ['DEEPSEEK_API_KEY']

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

// 执行验证
try {
  validateEnv()
} catch (error) {
  logger.error('Environment validation failed:', error.message)
  process.exit(1)
}

const config = {
  // 环境
  env: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',

  // 服务器
  port: parseInt(process.env.PORT || '3000'),

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  // AI 服务
  ai: {
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'deepseek',
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    },
  },

  // 性能
  performance: {
    slowThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD || '1000'),
  },

  // 安全
  security: {
    maxBodySize: parseInt(process.env.REQUEST_BODY_MAX_SIZE || '1048576'),
  },
}

export default config
```

---

## 五、整合所有中间件

更新 `src/app.js`：

```javascript
import express from 'express'
import config from './config/index.js'
import routes from './routes/index.js'
import { corsMiddleware } from './middleware/cors.js'
import { requestLoggerMiddleware } from './middleware/requestLogger.js'
import { performanceMiddleware, requestCounterMiddleware } from './middleware/performance.js'
import { validateBodySize } from './middleware/validator.js'
import logger from './utils/logger.js'

const app = express()

// ===== 全局中间件 =====

// 1. CORS（必须在最前面）
app.use(corsMiddleware(config.cors))

// 2. 请求日志
app.use(requestLoggerMiddleware)

// 3. 性能监控
app.use(performanceMiddleware(config.performance))

// 4. 请求计数
app.use(requestCounterMiddleware)

// 5. 请求体解析
app.use(express.json({ limit: config.security.maxBodySize }))
app.use(express.urlencoded({ extended: true, limit: config.security.maxBodySize }))

// 6. 请求体大小验证
app.use(validateBodySize(config.security.maxBodySize))

// ===== 路由 =====
app.use('/api', routes)

// ===== 404 处理 =====
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.url,
  })
})

// ===== 错误处理（后续实现）=====
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err)
  res.status(500).json({
    success: false,
    message: config.isDev ? err.message : 'Internal server error',
  })
})

export default app
```

---

## 六、添加统计接口

更新 `src/routes/index.js`：

```javascript
import express from 'express'
import chatRoutes from './chat.routes.js'
import { getRequestStats } from '../middleware/performance.js'
import { success } from '../utils/response.js'

const router = express.Router()

// 挂载聊天路由
router.use('/', chatRoutes)

// 健康检查
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  })
})

// 请求统计
router.get('/stats', (req, res) => {
  res.json(
    success({
      requests: getRequestStats(),
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    })
  )
})

export default router
```

---

## 七、测试

### 7.1 测试 CORS

```javascript
// 前端代码
fetch('http://localhost:3000/api/health')
  .then((res) => res.json())
  .then((data) => console.log(data))
  .catch((err) => console.error('CORS Error:', err))
```

### 7.2 测试请求日志

启动服务器并发送请求，观察控制台输出：

```bash
[INFO] → POST /api/chat
[INFO] ← POST /api/chat 200 1234ms
```

### 7.3 测试性能监控

```bash
curl http://localhost:3000/api/stats
```

---

## 八、学习检查清单

- [ ] 理解跨域的原理和 CORS 工作流程
- [ ] 掌握 Express 中间件的编写和使用
- [ ] 实现了 CORS、日志、性能监控中间件
- [ ] 理解环境变量管理的最佳实践
- [ ] 配置验证和错误处理

---

## 九、实践作业

### 作业 1：实现 API 限流中间件

限制每个 IP 每分钟最多 60 次请求。

### 作业 2：添加请求 ID

为每个请求生成唯一 ID，用于追踪日志。

### 作业 3：实现缓存中间件

对相同的请求返回缓存结果。

---

**记住：中间件是 Express 的核心，合理使用中间件能让代码更清晰、更易维护。**
