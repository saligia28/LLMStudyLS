# Step 25: Node AI 后端封装｜日志系统（完善版）

## 学习目标

这个任务的本质是回答一个核心问题：**如何构建一个专业的、可扩展的日志系统**。

通过本教程,你将：

1. 理解日志级别和日志分类
2. 实现日志文件持久化
3. 掌握日志轮转和归档
4. 学会结构化日志和日志查询

---

## 一、核心认知：为什么需要完善的日志系统？

### 1.1 简单日志 vs 专业日志

```
┌─────────────────────────────────────────────────────────────┐
│              简单日志 vs 专业日志                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   简单日志（console.log）                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  console.log('User logged in')                  │       │
│   │  console.error('API failed')                    │       │
│   │                                                 │       │
│   │  问题：                                          │       │
│   │  ✗ 日志混乱，难以查找                            │       │
│   │  ✗ 没有时间戳和上下文                            │       │
│   │  ✗ 无法持久化保存                                │       │
│   │  ✗ 生产环境无法追溯                              │       │
│   │  ✗ 无法按级别过滤                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   专业日志系统                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  [2024-01-20 10:30:15] [INFO] [UserService]    │       │
│   │  User logged in {                               │       │
│   │    userId: "123",                               │       │
│   │    ip: "192.168.1.1",                           │       │
│   │    requestId: "abc-123"                         │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  优点：                                          │       │
│   │  ✓ 结构化日志，易于查询                          │       │
│   │  ✓ 包含时间、级别、来源                          │       │
│   │  ✓ 持久化到文件                                  │       │
│   │  ✓ 支持日志轮转                                  │       │
│   │  ✓ 可按条件过滤                                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 日志的作用

```
┌─────────────────────────────────────────────────────────────┐
│                  日志的四大作用                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【调试】开发阶段定位问题                                  │
│      - 查看程序执行流程                                       │
│      - 追踪变量值变化                                         │
│      - 定位错误发生位置                                       │
│                                                             │
│   2. 【监控】生产环境运行状态                                  │
│      - 监控系统健康状况                                       │
│      - 发现性能瓶颈                                          │
│      - 追踪用户行为                                          │
│                                                             │
│   3. 【审计】记录关键操作                                      │
│      - 记录用户操作日志                                       │
│      - 追踪数据变更                                          │
│      - 满足合规要求                                          │
│                                                             │
│   4. 【分析】数据统计和分析                                    │
│      - 统计 API 调用量                                       │
│      - 分析用户行为                                          │
│      - 生成运营报表                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、日志级别系统

### 2.1 标准日志级别

```
┌─────────────────────────────────────────────────────────────┐
│                  日志级别                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   级别优先级（从高到低）：                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │  FATAL  → 致命错误，程序无法继续                 │       │
│   │  ERROR  → 错误，影响功能但程序可继续             │       │
│   │  WARN   → 警告，潜在问题                         │       │
│   │  INFO   → 信息，重要的业务流程                   │       │
│   │  DEBUG  → 调试信息，详细的执行过程               │       │
│   │  TRACE  → 追踪信息，最详细的日志                 │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   使用场景：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  FATAL: 数据库连接失败，服务无法启动              │       │
│   │  ERROR: API 调用失败，返回错误                   │       │
│   │  WARN:  API 响应慢（超过阈值）                   │       │
│   │  INFO:  用户登录、API 调用、关键操作              │       │
│   │  DEBUG: 函数参数、中间变量、执行步骤              │       │
│   │  TRACE: 每一行代码的执行（很少使用）              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   环境配置：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  开发环境: DEBUG 及以上                          │       │
│   │  测试环境: INFO 及以上                           │       │
│   │  生产环境: WARN 及以上                           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实现专业日志系统

### 3.1 使用 Winston 日志库

安装依赖：

```bash
npm install winston winston-daily-rotate-file
```

### 3.2 创建日志工具

重写 `src/utils/logger.js`：

```javascript
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志目录
const LOG_DIR = path.join(__dirname, '../../logs')

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `[${timestamp}] [${level.toUpperCase()}] ${message}`
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`
    }
    return log
  })
)

// 控制台格式（带颜色）
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `[${timestamp}] ${level}: ${message}`
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`
    }
    return log
  })
)

/**
 * 创建日志记录器
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: consoleFormat,
    }),

    // 所有日志文件（按天轮转）
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m', // 单文件最大 20MB
      maxFiles: '14d', // 保留 14 天
      format: logFormat,
    }),

    // 错误日志单独文件
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d', // 错误日志保留 30 天
      format: logFormat,
    }),
  ],
})

/**
 * 扩展方法：记录 HTTP 请求
 */
logger.http = (message, meta = {}) => {
  logger.info(message, { type: 'http', ...meta })
}

/**
 * 扩展方法：记录性能
 */
logger.perf = (message, meta = {}) => {
  logger.info(message, { type: 'performance', ...meta })
}

/**
 * 扩展方法：记录审计
 */
logger.audit = (message, meta = {}) => {
  logger.info(message, { type: 'audit', ...meta })
}

export default logger
```

### 3.3 结构化日志示例

创建 `src/utils/logHelper.js`：

```javascript
import logger from './logger.js'

/**
 * 日志辅助工具
 */

/**
 * 记录 API 调用
 */
export function logApiCall(provider, method, duration, success = true) {
  logger.http(`API Call: ${provider}`, {
    provider,
    method,
    duration,
    success,
  })
}

/**
 * 记录错误
 */
export function logError(context, error, extra = {}) {
  logger.error(`Error in ${context}`, {
    context,
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...extra,
  })
}

/**
 * 记录性能指标
 */
export function logPerformance(operation, duration, meta = {}) {
  const level = duration > 1000 ? 'warn' : 'info'
  logger[level](`Performance: ${operation}`, {
    operation,
    duration,
    ...meta,
  })
}

/**
 * 记录用户操作
 */
export function logUserAction(action, userId, details = {}) {
  logger.audit(`User action: ${action}`, {
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  })
}
```

---

## 四、在项目中使用日志

### 4.1 更新 AI Service

更新 `src/services/ai.service.js`：

```javascript
import config from '../config/index.js'
import factory from '../adapters/factory.js'
import DeepSeekAdapter from '../adapters/deepseek.adapter.js'
import OpenAIAdapter from '../adapters/openai.adapter.js'
import logger from '../utils/logger.js'
import { logApiCall, logError, logPerformance } from '../utils/logHelper.js'

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
      logger.fatal('No AI provider configured!')
      throw new Error('At least one AI provider must be configured')
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

      // 记录性能
      logPerformance('AI Chat', duration, { provider })

      // 记录 API 调用
      logApiCall(provider, 'chat', duration, true)

      logger.info(`Chat completed`, {
        provider,
        duration,
      })

      return result
    } catch (error) {
      const duration = Date.now() - startTime

      // 记录错误
      logError('AI Chat', error, { provider, duration })

      // 记录失败的 API 调用
      logApiCall(provider, 'chat', duration, false)

      throw error
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
      const stream = await adapter.chatStream(messages, options)

      logger.info(`Stream chat started`, { provider })

      return stream
    } catch (error) {
      logError('AI Chat Stream', error, { provider })
      throw error
    }
  }

  getAvailableProviders() {
    return factory.list()
  }
}

export default new AIService()
```

### 4.2 更新请求日志中间件

更新 `src/middleware/requestLogger.js`：

```javascript
import logger from '../utils/logger.js'
import { randomUUID } from 'crypto'

/**
 * 增强的请求日志中间件
 */
export function requestLoggerMiddleware(req, res, next) {
  // 生成请求 ID
  const requestId = randomUUID()
  req.requestId = requestId

  const startTime = Date.now()

  // 记录请求开始
  logger.http(`→ ${req.method} ${req.url}`, {
    requestId,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
  })

  // 拦截响应
  const originalEnd = res.end
  res.end = function (...args) {
    const duration = Date.now() - startTime
    const statusCode = res.statusCode

    // 记录响应
    logger.http(`← ${req.method} ${req.url} ${statusCode}`, {
      requestId,
      duration,
      statusCode,
    })

    // 记录慢请求
    if (duration > 1000) {
      logger.warn(`Slow request detected`, {
        requestId,
        method: req.method,
        url: req.url,
        duration,
      })
    }

    originalEnd.apply(res, args)
  }

  next()
}
```

---

## 五、日志查询和分析

### 5.1 查看日志文件

```bash
# 查看最新日志
tail -f logs/app-2024-01-20.log

# 查看错误日志
tail -f logs/error-2024-01-20.log

# 搜索特定内容
grep "ERROR" logs/app-2024-01-20.log

# 搜索特定请求 ID
grep "abc-123" logs/app-2024-01-20.log
```

### 5.2 日志统计脚本

创建 `scripts/log-stats.js`：

```javascript
import fs from 'fs'
import path from 'path'

/**
 * 日志统计工具
 */
function analyzeLogFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter((line) => line.trim())

  const stats = {
    total: lines.length,
    byLevel: {},
    errors: [],
    slowRequests: [],
  }

  for (const line of lines) {
    // 统计级别
    const levelMatch = line.match(/\[(INFO|WARN|ERROR|DEBUG)\]/)
    if (levelMatch) {
      const level = levelMatch[1]
      stats.byLevel[level] = (stats.byLevel[level] || 0) + 1
    }

    // 收集错误
    if (line.includes('[ERROR]')) {
      stats.errors.push(line)
    }

    // 收集慢请求
    if (line.includes('Slow request')) {
      stats.slowRequests.push(line)
    }
  }

  return stats
}

// 示例使用
const logFile = process.argv[2] || './logs/app-2024-01-20.log'

if (fs.existsSync(logFile)) {
  const stats = analyzeLogFile(logFile)
  console.log('日志统计:', JSON.stringify(stats, null, 2))
} else {
  console.error('日志文件不存在:', logFile)
}
```

运行：

```bash
node scripts/log-stats.js logs/app-2024-01-20.log
```

---

## 六、日志最佳实践

```
┌─────────────────────────────────────────────────────────────┐
│                  日志最佳实践                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 合适的日志级别                                           │
│      ✓ 不要所有日志都用 INFO                                 │
│      ✓ 错误使用 ERROR，警告使用 WARN                         │
│      ✓ 调试信息使用 DEBUG（生产环境不输出）                   │
│                                                             │
│   2. 结构化日志                                               │
│      ✓ 使用 JSON 格式记录额外信息                            │
│      ✓ 包含上下文（请求 ID、用户 ID）                        │
│      ✓ 避免纯文本拼接                                        │
│                                                             │
│   3. 敏感信息处理                                             │
│      ✗ 不记录密码、Token                                     │
│      ✗ 不记录完整的信用卡号                                   │
│      ✓ 记录脱敏后的数据                                      │
│                                                             │
│   4. 性能考虑                                                 │
│      ✓ 避免在循环中大量记录                                   │
│      ✓ 使用异步日志写入                                       │
│      ✓ 定期清理旧日志                                         │
│                                                             │
│   5. 日志轮转                                                 │
│      ✓ 按天或按大小轮转                                       │
│      ✓ 保留合理天数                                          │
│      ✓ 压缩归档旧日志                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、学习检查清单

- [ ] 理解日志级别和使用场景
- [ ] 掌握 Winston 日志库的使用
- [ ] 实现了日志文件持久化
- [ ] 配置了日志轮转和归档
- [ ] 实现了结构化日志
- [ ] 能够查询和分析日志

---

## 八、实践作业

### 作业 1：实现日志过滤

创建工具脚本，按级别、时间范围过滤日志。

### 作业 2：日志告警

当错误日志超过阈值时发送告警通知。

### 作业 3：日志可视化

将日志导入到 ELK（Elasticsearch + Logstash + Kibana）进行可视化分析。

---

**记住：日志是排查问题的最后一道防线，好的日志系统能节省大量调试时间。**
