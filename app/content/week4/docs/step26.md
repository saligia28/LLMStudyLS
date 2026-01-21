# Step 26: Node AI 后端封装｜统一错误处理

## 学习目标

这个任务的本质是回答一个核心问题：**如何构建一个健壮的、用户友好的错误处理系统**。

通过本教程,你将：

1. 理解错误类型和错误处理策略
2. 实现自定义错误类
3. 构建统一错误处理中间件
4. 学会错误码设计和错误响应规范

---

## 一、核心认知：为什么需要统一错误处理？

### 1.1 混乱的错误处理 vs 统一错误处理

```
┌─────────────────────────────────────────────────────────────┐
│          混乱的错误处理 vs 统一错误处理                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   混乱的错误处理                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // 路由 A                                       │       │
│   │  try {                                          │       │
│   │    // ...                                       │       │
│   │  } catch (err) {                                │       │
│   │    res.json({ error: err.message })             │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  // 路由 B                                       │       │
│   │  try {                                          │       │
│   │    // ...                                       │       │
│   │  } catch (e) {                                  │       │
│   │    res.status(500).send('Error: ' + e)          │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  问题：                                          │       │
│   │  ✗ 错误格式不统一                                │       │
│   │  ✗ 状态码混乱                                    │       │
│   │  ✗ 暴露敏感信息                                  │       │
│   │  ✗ 难以维护和调试                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   统一错误处理                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // 任何路由                                     │       │
│   │  throw new ApiError('资源不存在', 404)           │       │
│   │                                                 │       │
│   │  // 统一错误中间件自动处理                        │       │
│   │  {                                              │       │
│   │    "success": false,                            │       │
│   │    "code": 404,                                 │       │
│   │    "message": "资源不存在",                      │       │
│   │    "requestId": "abc-123"                       │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  优点：                                          │       │
│   │  ✓ 格式统一，易于前端处理                        │       │
│   │  ✓ 状态码规范                                    │       │
│   │  ✓ 生产环境隐藏敏感信息                          │       │
│   │  ✓ 便于日志记录和追踪                            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 错误的分类

```
┌─────────────────────────────────────────────────────────────┐
│                  错误分类                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【客户端错误】4xx                                        │
│      - 400 Bad Request: 参数错误                             │
│      - 401 Unauthorized: 未认证                              │
│      - 403 Forbidden: 无权限                                 │
│      - 404 Not Found: 资源不存在                             │
│      - 429 Too Many Requests: 请求过多                       │
│                                                             │
│   2. 【服务端错误】5xx                                        │
│      - 500 Internal Server Error: 服务器内部错误              │
│      - 502 Bad Gateway: 网关错误                             │
│      - 503 Service Unavailable: 服务不可用                   │
│      - 504 Gateway Timeout: 网关超时                         │
│                                                             │
│   3. 【业务错误】自定义                                        │
│      - 10001: AI 服务不可用                                  │
│      - 10002: API 配额用尽                                   │
│      - 10003: 内容审核失败                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现自定义错误类

### 2.1 基础错误类

创建 `src/errors/ApiError.js`：

```javascript
/**
 * API 错误基类
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, errorCode = null, isOperational = true) {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.isOperational = isOperational // 是否是可预期的业务错误

    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      success: false,
      code: this.errorCode || this.statusCode,
      message: this.message,
    }
  }
}

export default ApiError
```

### 2.2 具体错误类型

创建 `src/errors/index.js`：

```javascript
import ApiError from './ApiError.js'

/**
 * 400 - 请求参数错误
 */
export class BadRequestError extends ApiError {
  constructor(message = '请求参数错误', errorCode = 400) {
    super(message, 400, errorCode)
  }
}

/**
 * 401 - 未认证
 */
export class UnauthorizedError extends ApiError {
  constructor(message = '未认证，请先登录', errorCode = 401) {
    super(message, 401, errorCode)
  }
}

/**
 * 403 - 无权限
 */
export class ForbiddenError extends ApiError {
  constructor(message = '无权限访问', errorCode = 403) {
    super(message, 403, errorCode)
  }
}

/**
 * 404 - 资源不存在
 */
export class NotFoundError extends ApiError {
  constructor(message = '资源不存在', errorCode = 404) {
    super(message, 404, errorCode)
  }
}

/**
 * 429 - 请求过多
 */
export class TooManyRequestsError extends ApiError {
  constructor(message = '请求过于频繁', errorCode = 429) {
    super(message, 429, errorCode)
  }
}

/**
 * 500 - 服务器内部错误
 */
export class InternalServerError extends ApiError {
  constructor(message = '服务器内部错误', errorCode = 500) {
    super(message, 500, errorCode)
  }
}

/**
 * 503 - 服务不可用
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message = '服务暂时不可用', errorCode = 503) {
    super(message, 503, errorCode)
  }
}

/**
 * 自定义业务错误
 */
export class BusinessError extends ApiError {
  constructor(message, errorCode) {
    super(message, 400, errorCode)
  }
}

/**
 * AI 服务错误
 */
export class AIServiceError extends ApiError {
  constructor(message = 'AI 服务调用失败', provider, originalError) {
    super(message, 500, 10001)
    this.provider = provider
    this.originalError = originalError
  }

  toJSON() {
    return {
      ...super.toJSON(),
      provider: this.provider,
      details: this.originalError?.message,
    }
  }
}

export default ApiError
```

---

## 三、统一错误处理中间件

### 3.1 错误处理中间件

创建 `src/middleware/errorHandler.js`：

```javascript
import logger from '../utils/logger.js'
import { logError } from '../utils/logHelper.js'
import ApiError from '../errors/ApiError.js'

/**
 * 统一错误处理中间件
 * 必须放在所有路由之后
 */
export function errorHandler(err, req, res, next) {
  // 如果响应已经发送，交给默认错误处理
  if (res.headersSent) {
    return next(err)
  }

  // 记录错误日志
  logError('Global Error Handler', err, {
    url: req.url,
    method: req.method,
    requestId: req.requestId,
    ip: req.ip,
  })

  // 如果是 ApiError 实例
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.errorCode || err.statusCode,
      message: err.message,
      requestId: req.requestId,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
      }),
    })
  }

  // 处理 Mongoose 验证错误
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 400,
      message: '数据验证失败',
      errors: Object.values(err.errors).map((e) => e.message),
      requestId: req.requestId,
    })
  }

  // 处理 JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 401,
      message: 'Token 无效',
      requestId: req.requestId,
    })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 401,
      message: 'Token 已过期',
      requestId: req.requestId,
    })
  }

  // 未知错误
  logger.error('Unhandled error:', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  })

  // 生产环境不暴露错误详情
  const message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message

  res.status(500).json({
    success: false,
    code: 500,
    message,
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  })
}

/**
 * 404 错误处理
 * 放在所有路由之后，错误处理中间件之前
 */
export function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    code: 404,
    message: `路由不存在: ${req.method} ${req.url}`,
    requestId: req.requestId,
  })
}
```

### 3.2 异步错误包装器

创建 `src/utils/asyncHandler.js`：

```javascript
/**
 * 异步路由处理器包装
 * 自动捕获 async/await 中的错误
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 使用示例：
 * router.get('/chat', asyncHandler(async (req, res) => {
 *   const result = await aiService.chat(messages)
 *   res.json(success(result))
 * }))
 */
```

---

## 四、在项目中使用错误处理

### 4.1 更新 app.js

更新 `src/app.js`：

```javascript
import express from 'express'
import config from './config/index.js'
import routes from './routes/index.js'
import { corsMiddleware } from './middleware/cors.js'
import { requestLoggerMiddleware } from './middleware/requestLogger.js'
import { performanceMiddleware, requestCounterMiddleware } from './middleware/performance.js'
import { validateBodySize } from './middleware/validator.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()

// ===== 全局中间件 =====
app.use(corsMiddleware(config.cors))
app.use(requestLoggerMiddleware)
app.use(performanceMiddleware(config.performance))
app.use(requestCounterMiddleware)
app.use(express.json({ limit: config.security.maxBodySize }))
app.use(express.urlencoded({ extended: true, limit: config.security.maxBodySize }))
app.use(validateBodySize(config.security.maxBodySize))

// ===== 路由 =====
app.use('/api', routes)

// ===== 404 处理（必须在路由之后）=====
app.use(notFoundHandler)

// ===== 错误处理（必须在最后）=====
app.use(errorHandler)

export default app
```

### 4.2 更新路由使用错误类

更新 `src/routes/chat.routes.js`：

```javascript
import express from 'express'
import aiService from '../services/ai.service.js'
import { success } from '../utils/response.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { BadRequestError, NotFoundError } from '../errors/index.js'
import { validateMessages } from '../middleware/validator.js'

const router = express.Router()

/**
 * POST /api/chat
 */
router.post(
  '/chat',
  validateMessages,
  asyncHandler(async (req, res) => {
    const { messages, provider, model } = req.body

    // 使用错误类抛出错误
    if (!messages || messages.length === 0) {
      throw new BadRequestError('messages 不能为空')
    }

    const result = await aiService.chat(messages, { provider, model })
    res.json(success(result))
  })
)

/**
 * POST /api/chat/stream
 */
router.post(
  '/chat/stream',
  validateMessages,
  asyncHandler(async (req, res) => {
    const { messages, provider, model } = req.body

    if (!messages || messages.length === 0) {
      throw new BadRequestError('messages 不能为空')
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await aiService.chatStream(messages, { provider, model })

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  })
)

/**
 * GET /api/providers
 */
router.get(
  '/providers',
  asyncHandler(async (req, res) => {
    const providers = aiService.getAvailableProviders()

    if (providers.length === 0) {
      throw new NotFoundError('没有可用的 AI 提供商')
    }

    res.json(success({ providers }))
  })
)

export default router
```

### 4.3 更新 AI Service 使用错误类

更新 `src/services/ai.service.js`：

```javascript
import config from '../config/index.js'
import factory from '../adapters/factory.js'
import DeepSeekAdapter from '../adapters/deepseek.adapter.js'
import OpenAIAdapter from '../adapters/openai.adapter.js'
import logger from '../utils/logger.js'
import { logApiCall, logError, logPerformance } from '../utils/logHelper.js'
import { AIServiceError, ServiceUnavailableError } from '../errors/index.js'

class AIService {
  constructor() {
    this.init()
  }

  init() {
    logger.info('Initializing AI Service')

    if (config.ai.deepseek.apiKey) {
      factory.register('deepseek', DeepSeekAdapter, config.ai.deepseek)
      logger.info('Registered provider: deepseek')
    }

    if (config.ai.openai.apiKey) {
      factory.register('openai', OpenAIAdapter, config.ai.openai)
      logger.info('Registered provider: openai')
    }

    const providers = factory.list()
    if (providers.length === 0) {
      throw new ServiceUnavailableError('没有配置可用的 AI 提供商')
    }

    logger.info(`Available providers: ${providers.join(', ')}`)
  }

  async chat(messages, options = {}) {
    const provider = options.provider || config.ai.defaultProvider
    const startTime = Date.now()

    try {
      logger.debug(`Starting chat request`, {
        provider,
        messagesCount: messages.length,
      })

      const adapter = factory.get(provider)
      const result = await adapter.chat(messages, options)

      const duration = Date.now() - startTime
      logPerformance('AI Chat', duration, { provider })
      logApiCall(provider, 'chat', duration, true)

      return result
    } catch (error) {
      const duration = Date.now() - startTime
      logError('AI Chat', error, { provider, duration })
      logApiCall(provider, 'chat', duration, false)

      // 转换为 AIServiceError
      throw new AIServiceError(`AI 服务调用失败: ${error.message}`, provider, error)
    }
  }

  async chatStream(messages, options = {}) {
    const provider = options.provider || config.ai.defaultProvider

    try {
      logger.debug(`Starting stream chat request`, {
        provider,
        messagesCount: messages.length,
      })

      const adapter = factory.get(provider)
      return await adapter.chatStream(messages, options)
    } catch (error) {
      logError('AI Chat Stream', error, { provider })
      throw new AIServiceError(`AI 流式服务调用失败: ${error.message}`, provider, error)
    }
  }

  getAvailableProviders() {
    return factory.list()
  }
}

export default new AIService()
```

---

## 五、错误码设计

创建 `src/constants/errorCodes.js`：

```javascript
/**
 * 错误码定义
 */
export const ErrorCodes = {
  // 通用错误 1xxxx
  UNKNOWN_ERROR: 10000,
  INVALID_PARAMS: 10001,
  UNAUTHORIZED: 10002,
  FORBIDDEN: 10003,
  NOT_FOUND: 10004,
  TOO_MANY_REQUESTS: 10005,

  // AI 服务错误 2xxxx
  AI_SERVICE_UNAVAILABLE: 20001,
  AI_API_KEY_INVALID: 20002,
  AI_QUOTA_EXCEEDED: 20003,
  AI_RESPONSE_TIMEOUT: 20004,
  AI_CONTENT_FILTERED: 20005,

  // 业务错误 3xxxx
  INVALID_MESSAGE_FORMAT: 30001,
  MESSAGE_TOO_LONG: 30002,
  UNSUPPORTED_PROVIDER: 30003,
}

/**
 * 错误消息
 */
export const ErrorMessages = {
  [ErrorCodes.UNKNOWN_ERROR]: '未知错误',
  [ErrorCodes.INVALID_PARAMS]: '参数错误',
  [ErrorCodes.UNAUTHORIZED]: '未认证',
  [ErrorCodes.FORBIDDEN]: '无权限',
  [ErrorCodes.NOT_FOUND]: '资源不存在',
  [ErrorCodes.TOO_MANY_REQUESTS]: '请求过于频繁',

  [ErrorCodes.AI_SERVICE_UNAVAILABLE]: 'AI 服务不可用',
  [ErrorCodes.AI_API_KEY_INVALID]: 'AI API Key 无效',
  [ErrorCodes.AI_QUOTA_EXCEEDED]: 'AI 配额已用尽',
  [ErrorCodes.AI_RESPONSE_TIMEOUT]: 'AI 响应超时',
  [ErrorCodes.AI_CONTENT_FILTERED]: '内容被过滤',

  [ErrorCodes.INVALID_MESSAGE_FORMAT]: '消息格式错误',
  [ErrorCodes.MESSAGE_TOO_LONG]: '消息过长',
  [ErrorCodes.UNSUPPORTED_PROVIDER]: '不支持的提供商',
}

/**
 * 获取错误消息
 */
export function getErrorMessage(code) {
  return ErrorMessages[code] || ErrorMessages[ErrorCodes.UNKNOWN_ERROR]
}
```

---

## 六、测试错误处理

### 6.1 测试参数错误

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{}'
```

预期输出：

```json
{
  "success": false,
  "code": 400,
  "message": "messages 不能为空",
  "requestId": "abc-123"
}
```

### 6.2 测试 404 错误

```bash
curl http://localhost:3000/api/nonexistent
```

### 6.3 测试服务错误

修改 API Key 为无效值，测试错误处理。

---

## 七、学习检查清单

- [ ] 理解错误分类和 HTTP 状态码
- [ ] 实现了自定义错误类
- [ ] 创建了统一错误处理中间件
- [ ] 使用 asyncHandler 简化异步错误处理
- [ ] 设计了错误码体系
- [ ] 生产环境隐藏敏感信息

---

## 八、实践作业

### 作业 1：错误监控

集成错误监控服务（如 Sentry），自动上报错误。

### 作业 2：错误重试机制

对于临时性错误（如网络超时），实现自动重试。

### 作业 3：错误统计

统计不同错误类型的发生次数和频率。

---

**记住：好的错误处理不仅能提升用户体验，更能帮助开发者快速定位和解决问题。**
