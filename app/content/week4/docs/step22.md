# Step 22: Node AI 后端封装｜设计后端项目结构（routes、services、utils）

## 学习目标

这个任务的本质是回答一个核心问题：**如何设计一个清晰、可维护、可扩展的 Node.js AI 后端项目结构**。

通过本教程，你将：

1. 理解后端项目分层架构的设计思想
2. 掌握 routes、services、utils 的职责划分
3. 学会设计符合"单一职责原则"的文件结构
4. 构建一个可扩展的 AI 后端骨架

---

## 一、核心认知：为什么需要项目结构设计？

### 1.1 混乱的代码 vs 结构化的代码

```
┌─────────────────────────────────────────────────────────────┐
│              混乱的代码 vs 结构化的代码                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   混乱的代码（All in One）                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // server.js (1000+ 行)                        │       │
│   │  app.post('/api/chat', async (req, res) => {    │       │
│   │    // 验证输入                                   │       │
│   │    // 调用 OpenAI                               │       │
│   │    // 处理错误                                   │       │
│   │    // 记录日志                                   │       │
│   │    // 格式化响应                                 │       │
│   │    // ... 所有逻辑堆在一起                        │       │
│   │  })                                             │       │
│   │                                                 │       │
│   │  问题：                                          │       │
│   │  - 代码难以阅读和维护                            │       │
│   │  - 逻辑混乱，职责不清                            │       │
│   │  - 难以测试和复用                                │       │
│   │  - 修改一处影响多处                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   结构化的代码（分层架构）                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  routes/      → 定义路由，处理 HTTP 请求         │       │
│   │  services/    → 业务逻辑，调用外部 API           │       │
│   │  utils/       → 工具函数，可复用的功能            │       │
│   │  middleware/  → 中间件，通用处理逻辑             │       │
│   │  config/      → 配置文件，环境变量管理            │       │
│   │                                                 │       │
│   │  优点：                                          │       │
│   │  - 职责清晰，易于理解                            │       │
│   │  - 代码可复用，易于测试                          │       │
│   │  - 修改局部，不影响全局                          │       │
│   │  - 团队协作更高效                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 分层架构的核心思想

```
┌─────────────────────────────────────────────────────────────┐
│                  三层架构设计                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │              【表现层 - Routes】                 │       │
│   │       接收 HTTP 请求，调用服务层，返回响应         │       │
│   │                                                 │       │
│   │   职责：                                         │       │
│   │   - 路由定义                                     │       │
│   │   - 请求验证                                     │       │
│   │   - 响应格式化                                   │       │
│   │   - 错误捕获                                     │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │              【业务层 - Services】               │       │
│   │        封装业务逻辑，调用外部服务和工具函数        │       │
│   │                                                 │       │
│   │   职责：                                         │       │
│   │   - 核心业务逻辑                                 │       │
│   │   - 调用外部 API                                │       │
│   │   - 数据处理                                     │       │
│   │   - 错误处理                                     │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │              【工具层 - Utils】                  │       │
│   │          提供可复用的工具函数和辅助功能           │       │
│   │                                                 │       │
│   │   职责：                                         │       │
│   │   - 通用工具函数                                 │       │
│   │   - 数据格式化                                   │       │
│   │   - 常量定义                                     │       │
│   │   - 辅助方法                                     │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键原则：                                                 │
│   - 单向依赖：上层依赖下层，下层不依赖上层                     │
│   - 单一职责：每一层只做自己该做的事                          │
│   - 高内聚低耦合：层内紧密，层间松散                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、设计项目目录结构

### 2.1 完整的项目结构

```
┌─────────────────────────────────────────────────────────────┐
│                推荐的项目目录结构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ai-backend/                                               │
│   ├── src/                     # 源代码目录                  │
│   │   ├── routes/              # 路由层                     │
│   │   │   ├── index.js         # 路由汇总                   │
│   │   │   └── chat.routes.js   # 聊天相关路由               │
│   │   │                                                     │
│   │   ├── services/            # 服务层                     │
│   │   │   └── ai.service.js    # AI 调用服务                │
│   │   │                                                     │
│   │   ├── utils/               # 工具层                     │
│   │   │   ├── logger.js        # 日志工具                   │
│   │   │   └── response.js      # 响应格式化                 │
│   │   │                                                     │
│   │   ├── middleware/          # 中间件                     │
│   │   │   ├── error.js         # 错误处理                   │
│   │   │   └── cors.js          # 跨域处理                   │
│   │   │                                                     │
│   │   ├── config/              # 配置                       │
│   │   │   └── index.js         # 配置管理                   │
│   │   │                                                     │
│   │   └── app.js               # Express 应用实例            │
│   │                                                         │
│   ├── server.js                # 服务器入口                  │
│   ├── .env                     # 环境变量                    │
│   ├── .env.example             # 环境变量示例                │
│   ├── package.json             # 依赖管理                    │
│   └── README.md                # 项目文档                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 各层的职责详解

```
┌─────────────────────────────────────────────────────────────┐
│                  各层职责详解                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   【routes/】- 路由层                                         │
│   ┌─────────────────────────────────────────────────┐       │
│   │  做什么：                                        │       │
│   │  ✓ 定义路由路径（如 POST /api/chat）             │       │
│   │  ✓ 提取请求参数（req.body, req.query）           │       │
│   │  ✓ 调用 service 方法                            │       │
│   │  ✓ 返回 HTTP 响应                                │       │
│   │                                                 │       │
│   │  不做什么：                                      │       │
│   │  ✗ 不包含业务逻辑                                │       │
│   │  ✗ 不直接调用外部 API                            │       │
│   │  ✗ 不处理复杂数据转换                            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   【services/】- 服务层                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  做什么：                                        │       │
│   │  ✓ 封装核心业务逻辑                              │       │
│   │  ✓ 调用外部 API（OpenAI/DeepSeek）              │       │
│   │  ✓ 数据处理和转换                                │       │
│   │  ✓ 错误处理和重试                                │       │
│   │                                                 │       │
│   │  不做什么：                                      │       │
│   │  ✗ 不处理 HTTP 请求/响应                         │       │
│   │  ✗ 不直接访问 req/res 对象                       │       │
│   │  ✗ 不包含路由定义                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   【utils/】- 工具层                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  做什么：                                        │       │
│   │  ✓ 提供纯函数工具                                │       │
│   │  ✓ 格式化和验证                                  │       │
│   │  ✓ 常量和配置                                    │       │
│   │  ✓ 辅助方法                                     │       │
│   │                                                 │       │
│   │  不做什么：                                      │       │
│   │  ✗ 不包含业务逻辑                                │       │
│   │  ✗ 不调用外部服务                                │       │
│   │  ✗ 不依赖特定框架                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实践：搭建项目骨架

### 3.1 初始化项目

创建项目目录并初始化：

```bash
mkdir ai-backend
cd ai-backend
npm init -y
```

安装依赖：

```bash
# 核心依赖
npm install express dotenv openai

# 开发依赖
npm install -D nodemon
```

### 3.2 配置 package.json

修改 `package.json` 添加以下内容：

```json
{
  "name": "ai-backend",
  "version": "1.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js"
  }
}
```

### 3.3 创建目录结构

```bash
mkdir -p src/{routes,services,utils,middleware,config}
```

### 3.4 创建 .env 文件

创建 `.env` 文件：

```bash
# 服务器配置
PORT=3000

# AI 服务配置
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_BASEURL=https://api.deepseek.com
```

创建 `.env.example` 文件（用于版本控制）：

```bash
# 服务器配置
PORT=3000

# AI 服务配置
DEEPSEEK_API_KEY=
DEEPSEEK_BASEURL=https://api.deepseek.com
```

---

## 四、实现各层代码

### 4.1 配置层：config/index.js

```javascript
import 'dotenv/config'

const config = {
  // 服务器配置
  port: process.env.PORT || 3000,

  // AI 服务配置
  ai: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASEURL,
    model: 'deepseek-chat',
  },
}

export default config
```

**设计要点**：

- 集中管理所有配置
- 提供默认值
- 验证必需的环境变量

### 4.2 工具层：utils/response.js

```javascript
/**
 * 统一成功响应格式
 */
export function success(data, message = 'Success') {
  return {
    success: true,
    message,
    data,
  }
}

/**
 * 统一错误响应格式
 */
export function error(message, code = 500) {
  return {
    success: false,
    message,
    code,
  }
}
```

**设计要点**：

- 统一响应格式
- 纯函数，易于测试
- 不依赖外部状态

### 4.3 工具层：utils/logger.js

```javascript
/**
 * 简单的日志工具
 */
class Logger {
  info(message, ...args) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args)
  }

  error(message, ...args) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args)
  }

  warn(message, ...args) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args)
  }

  debug(message, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args)
    }
  }
}

export default new Logger()
```

**设计要点**：

- 单例模式，全局使用
- 统一日志格式
- 支持不同日志级别

### 4.4 服务层：services/ai.service.js

```javascript
import OpenAI from 'openai'
import config from '../config/index.js'
import logger from '../utils/logger.js'

class AIService {
  constructor() {
    this.client = new OpenAI({
      apiKey: config.ai.apiKey,
      baseURL: config.ai.baseURL,
    })
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   */
  async chat(messages, options = {}) {
    try {
      logger.info('Sending chat request', { messagesCount: messages.length })

      const response = await this.client.chat.completions.create({
        model: options.model || config.ai.model,
        messages,
        stream: false,
        ...options,
      })

      logger.info('Chat request completed', {
        usage: response.usage,
      })

      return response.choices[0].message
    } catch (error) {
      logger.error('Chat request failed', error.message)
      throw error
    }
  }

  /**
   * 发送流式聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   */
  async chatStream(messages, options = {}) {
    try {
      logger.info('Sending stream chat request', { messagesCount: messages.length })

      const stream = await this.client.chat.completions.create({
        model: options.model || config.ai.model,
        messages,
        stream: true,
        ...options,
      })

      return stream
    } catch (error) {
      logger.error('Stream chat request failed', error.message)
      throw error
    }
  }
}

export default new AIService()
```

**设计要点**：

- 封装 OpenAI 客户端
- 统一错误处理
- 记录日志
- 支持配置覆盖

### 4.5 路由层：routes/chat.routes.js

```javascript
import express from 'express'
import aiService from '../services/ai.service.js'
import { success, error } from '../utils/response.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * POST /api/chat
 * 普通聊天接口
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, model } = req.body

    // 参数验证
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json(error('messages 参数必须是非空数组', 400))
    }

    // 调用服务层
    const result = await aiService.chat(messages, { model })

    // 返回成功响应
    res.json(success(result))
  } catch (err) {
    logger.error('Chat route error:', err)
    res.status(500).json(error(err.message))
  }
})

/**
 * POST /api/chat/stream
 * 流式聊天接口
 */
router.post('/chat/stream', async (req, res) => {
  try {
    const { messages, model } = req.body

    // 参数验证
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json(error('messages 参数必须是非空数组', 400))
    }

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 调用服务层获取流
    const stream = await aiService.chatStream(messages, { model })

    // 转发流到客户端
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err) {
    logger.error('Stream chat route error:', err)
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`)
    res.end()
  }
})

export default router
```

**设计要点**：

- 只处理 HTTP 层逻辑
- 参数验证在路由层
- 调用服务层处理业务
- 统一响应格式

### 4.6 路由汇总：routes/index.js

```javascript
import express from 'express'
import chatRoutes from './chat.routes.js'

const router = express.Router()

// 挂载聊天路由
router.use('/', chatRoutes)

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
```

### 4.7 Express 应用：src/app.js

```javascript
import express from 'express'
import routes from './routes/index.js'

const app = express()

// 中间件
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 挂载路由
app.use('/api', routes)

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  })
})

export default app
```

### 4.8 服务器入口：server.js

```javascript
import app from './src/app.js'
import config from './src/config/index.js'
import logger from './src/utils/logger.js'

const server = app.listen(config.port, () => {
  logger.info(`Server is running on http://localhost:${config.port}`)
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
})

// 优雅关闭
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server')
  server.close(() => {
    logger.info('HTTP server closed')
  })
})
```

---

## 五、测试项目结构

### 5.1 启动服务器

```bash
npm run dev
```

预期输出：

```
[INFO] 2024-01-20T10:00:00.000Z - Server is running on http://localhost:3000
[INFO] 2024-01-20T10:00:00.000Z - Environment: development
```

### 5.2 测试健康检查

```bash
curl http://localhost:3000/api/health
```

预期输出：

```json
{
  "status": "ok",
  "timestamp": "2024-01-20T10:00:00.000Z"
}
```

### 5.3 测试聊天接口

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "你好"}
    ]
  }'
```

预期输出：

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "role": "assistant",
    "content": "你好！有什么我可以帮助你的吗？"
  }
}
```

---

## 六、项目结构的优势

### 6.1 对比演示

```
┌─────────────────────────────────────────────────────────────┐
│              结构化项目的优势                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 可维护性                                                │
│      - 每个文件职责明确，修改不影响其他模块                    │
│      - 新人能快速理解代码结构                                 │
│                                                             │
│   2. 可测试性                                                │
│      - 服务层独立，可以单独测试                               │
│      - 工具函数纯粹，易于单元测试                             │
│                                                             │
│   3. 可扩展性                                                │
│      - 添加新路由：在 routes/ 目录新建文件                    │
│      - 添加新服务：在 services/ 目录新建文件                  │
│      - 添加新工具：在 utils/ 目录新建文件                     │
│                                                             │
│   4. 可复用性                                                │
│      - 服务层可在多个路由中复用                               │
│      - 工具函数可在项目任何地方使用                           │
│                                                             │
│   5. 团队协作                                                │
│      - 不同开发者可以并行开发不同模块                         │
│      - 代码冲突减少                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：概念理解

- [ ] 理解分层架构的核心思想
- [ ] 知道 routes、services、utils 的职责划分
- [ ] 理解单一职责原则
- [ ] 知道为什么不应该把所有代码写在一个文件

### 第二层：项目搭建

- [ ] 能够创建标准的项目目录结构
- [ ] 能够配置 package.json 和环境变量
- [ ] 能够组织配置文件
- [ ] 能够设置开发和生产环境

### 第三层：代码实现

- [ ] 实现了配置管理模块
- [ ] 实现了工具函数（response、logger）
- [ ] 实现了服务层（AI 调用封装）
- [ ] 实现了路由层（HTTP 请求处理）

### 综合能力

- [ ] 能够启动并测试整个项目
- [ ] 能够添加新的路由和服务
- [ ] 理解各层之间的依赖关系
- [ ] 能够解释为什么这样设计

---

## 八、实践作业

### 作业 1：添加翻译服务

**要求**：

- 在 `services/` 目录创建 `translate.service.js`
- 封装一个翻译功能（使用 AI 实现）
- 在 `routes/` 目录创建对应路由
- 测试翻译接口是否工作

### 作业 2：添加请求验证工具

**要求**：

- 在 `utils/` 目录创建 `validator.js`
- 实现参数验证函数（如：验证 messages 格式）
- 在路由中使用验证工具
- 测试验证是否生效

### 作业 3：完善配置管理

**要求**：

- 添加更多 AI 服务提供商的配置（如 OpenAI）
- 支持动态切换不同的 AI 服务
- 添加配置验证功能
- 测试不同配置是否生效

---

## 九、常见问题排查

### Q1: 为什么要分这么多层，不是更复杂吗？

**答**：短期看确实增加了文件数量，但长期收益巨大：

- 小项目：几百行代码，分层可能过度设计
- 中大项目：几千行代码，不分层会变得难以维护
- 团队项目：分层是必须的，否则无法协作

### Q2: services 和 utils 有什么区别？

**答**：

- **services**：有状态，调用外部服务，包含业务逻辑
- **utils**：无状态，纯函数，通用工具

例如：

```javascript
// services/ai.service.js (有状态)
class AIService {
  constructor() {
    this.client = new OpenAI() // 有状态：持有客户端实例
  }
}

// utils/format.js (无状态)
export function formatDate(date) {
  return date.toISOString() // 纯函数：输入 → 输出
}
```

### Q3: 所有路由都要放在 routes/ 目录吗？

**答**：是的，保持一致性很重要：

- ✓ 所有路由放在 `routes/`
- ✓ 按功能模块划分文件（如 `chat.routes.js`、`user.routes.js`）
- ✓ 在 `routes/index.js` 中统一导出

### Q4: 什么时候应该创建新的 service？

**答**：当你需要：

- 调用外部 API（AI、数据库、第三方服务）
- 封装复杂的业务逻辑
- 复用相同的功能

例如：

```javascript
services/
├── ai.service.js       # 调用 AI API
├── db.service.js       # 数据库操作
└── email.service.js    # 发送邮件
```

---

## 十、下一步学习方向

完成本节后，你已经搭建了一个清晰的后端架构。接下来你将：

1. **Step 23**：编写统一的 AI 请求封装函数
2. **Step 24**：加入跨域、中间件、环境变量管理
3. **Step 25**：加入日志系统（完善版）
4. **Step 26**：加入统一错误处理
5. **Step 27**：重构，抽离 API 逻辑成独立模块
6. **Step 28**：完成"通用 AI Router"文档

---

**记住：好的项目结构是项目成功的基石。花时间设计好结构，会让后续开发事半功倍。**
