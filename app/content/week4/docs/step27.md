# Step 27: Node AI 后端封装｜尝试一次重构，把 API 逻辑抽离成独立模块

## 学习目标

这个任务的本质是回答一个核心问题：**如何重构代码，让它更模块化、更易维护、更易测试**。

通过本教程,你将：

1. 理解重构的原则和时机
2. 掌握模块化设计的方法
3. 学会识别和消除代码坏味道
4. 实践重构的安全流程

---

## 一、核心认知：什么是重构？

### 1.1 重构 vs 重写

```
┌─────────────────────────────────────────────────────────────┐
│              重构 vs 重写                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   【重构 (Refactoring)】                                      │
│   ┌─────────────────────────────────────────────────┐       │
│   │  定义：在不改变外部行为的前提下，改善代码内部结构  │       │
│   │                                                 │       │
│   │  特点：                                          │       │
│   │  - 小步迭代，每次改动很小                        │       │
│   │  - 功能保持不变                                  │       │
│   │  - 可以随时停止                                  │       │
│   │  - 风险较低                                     │       │
│   │                                                 │       │
│   │  例如：                                          │       │
│   │  - 提取函数                                     │       │
│   │  - 重命名变量                                   │       │
│   │  - 分离关注点                                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   【重写 (Rewrite)】                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  定义：推倒重来，从零开始实现                     │       │
│   │                                                 │       │
│   │  特点：                                          │       │
│   │  - 大改动，耗时长                                │       │
│   │  - 可能改变功能                                  │       │
│   │  - 必须完成才能上线                              │       │
│   │  - 风险较高                                     │       │
│   │                                                 │       │
│   │  适用场景：                                      │       │
│   │  - 技术栈过时                                    │       │
│   │  - 架构设计有根本问题                            │       │
│   │  - 代码无法维护                                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   本节重点：重构，而非重写                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 重构的原则

```
┌─────────────────────────────────────────────────────────────┐
│                  重构的黄金法则                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【红绿重构循环】                                         │
│      ┌─────────────────────────────────────────────┐       │
│      │  红：写一个失败的测试                        │       │
│      │  绿：写最简单的代码让测试通过                │       │
│      │  重构：改善代码结构                          │       │
│      └─────────────────────────────────────────────┘       │
│                                                             │
│   2. 【小步快跑】                                             │
│      - 每次只改一小处                                        │
│      - 改完立即测试                                          │
│      - 确保功能正常                                          │
│                                                             │
│   3. 【保持可运行】                                           │
│      - 重构过程中代码始终可运行                              │
│      - 随时可以回滚                                          │
│      - 不阻塞其他开发                                        │
│                                                             │
│   4. 【重构时不加新功能】                                      │
│      - 重构和新功能分开做                                    │
│      - 不要混在一起                                          │
│      - 保持每次提交的纯粹性                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、识别代码坏味道

### 2.1 常见代码坏味道

```
┌─────────────────────────────────────────────────────────────┐
│                  代码坏味道清单                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【重复代码】Duplicated Code                              │
│      - 相同或相似的代码出现在多个地方                         │
│      - 解决：提取函数、提取类                                │
│                                                             │
│   2. 【过长函数】Long Method                                  │
│      - 函数超过 20-30 行                                     │
│      - 解决：提取函数、分解职责                              │
│                                                             │
│   3. 【过大类】Large Class                                    │
│      - 类有太多字段和方法                                    │
│      - 解决：提取类、提取子系统                              │
│                                                             │
│   4. 【参数过多】Long Parameter List                          │
│      - 函数参数超过 3-4 个                                   │
│      - 解决：引入参数对象、保持对象完整                       │
│                                                             │
│   5. 【发散式变化】Divergent Change                           │
│      - 一个类因多种原因被修改                                │
│      - 解决：提取类、分离职责                                │
│                                                             │
│   6. 【霰弹式修改】Shotgun Surgery                            │
│      - 一个变化需要修改多个类                                │
│      - 解决：移动函数、移动字段                              │
│                                                             │
│   7. 【依恋情结】Feature Envy                                 │
│      - 函数过度使用其他类的数据                              │
│      - 解决：移动函数到正确的类                              │
│                                                             │
│   8. 【过度耦合】Inappropriate Intimacy                       │
│      - 类之间过度了解彼此的实现细节                          │
│      - 解决：移动函数、提取类、隐藏委托                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 当前项目的坏味道

让我们审查当前的代码,找出需要重构的地方：

```javascript
// ❌ 问题 1：路由层包含太多逻辑
router.post('/chat', async (req, res) => {
  try {
    const { messages, provider, model } = req.body

    // 参数验证在路由层
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json(error('messages 参数必须是非空数组', 400))
    }

    // 业务逻辑在路由层
    const result = await aiService.chat(messages, { provider, model })

    // 响应格式化在路由层
    res.json(success(result))
  } catch (err) {
    logger.error('Chat route error:', err)
    res.status(500).json(error(err.message))
  }
})

// ❌ 问题 2：Service 层职责不清晰
class AIService {
  async chat(messages, options = {}) {
    const provider = options.provider || config.ai.defaultProvider
    const adapter = factory.get(provider)

    logger.info(`Using provider: ${provider}`)

    // 日志、性能统计、错误处理都在这里
    return await adapter.chat(messages, options)
  }
}
```

---

## 三、重构实践

### 3.1 提取控制器层

创建 `src/controllers/chat.controller.js`：

```javascript
import aiService from '../services/ai.service.js'
import { success } from '../utils/response.js'
import { BadRequestError } from '../errors/index.js'

/**
 * 聊天控制器
 * 负责处理聊天相关的业务逻辑
 */
class ChatController {
  /**
   * 普通聊天
   */
  async chat(req, res) {
    const { messages, provider, model, temperature, maxTokens } = req.body

    const result = await aiService.chat(messages, {
      provider,
      model,
      temperature,
      max_tokens: maxTokens,
    })

    return res.json(success(result))
  }

  /**
   * 流式聊天
   */
  async chatStream(req, res) {
    const { messages, provider, model, temperature, maxTokens } = req.body

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await aiService.chatStream(messages, {
      provider,
      model,
      temperature,
      max_tokens: maxTokens,
    })

    // 转发流
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  }

  /**
   * 获取可用提供商
   */
  async getProviders(req, res) {
    const providers = aiService.getAvailableProviders()
    return res.json(success({ providers }))
  }
}

export default new ChatController()
```

### 3.2 简化路由层

重构 `src/routes/chat.routes.js`：

```javascript
import express from 'express'
import chatController from '../controllers/chat.controller.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { validateMessages } from '../middleware/validator.js'

const router = express.Router()

/**
 * 路由层只负责：
 * 1. 定义路由路径
 * 2. 应用中间件
 * 3. 调用控制器
 */

router.post('/chat', validateMessages, asyncHandler(chatController.chat.bind(chatController)))

router.post('/chat/stream', validateMessages, asyncHandler(chatController.chatStream.bind(chatController)))

router.get('/providers', asyncHandler(chatController.getProviders.bind(chatController)))

export default router
```

### 3.3 提取参数验证器

创建 `src/validators/chatValidator.js`：

```javascript
import Joi from 'joi'
import { BadRequestError } from '../errors/index.js'

/**
 * 消息格式 Schema
 */
const messageSchema = Joi.object({
  role: Joi.string().valid('system', 'user', 'assistant').required(),
  content: Joi.string().required().max(10000),
})

/**
 * 聊天请求 Schema
 */
const chatRequestSchema = Joi.object({
  messages: Joi.array().items(messageSchema).min(1).max(50).required(),
  provider: Joi.string().valid('deepseek', 'openai', 'claude').optional(),
  model: Joi.string().optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  maxTokens: Joi.number().min(1).max(8000).optional(),
})

/**
 * 验证聊天请求
 */
export function validateChatRequest(data) {
  const { error, value } = chatRequestSchema.validate(data, {
    abortEarly: false,
  })

  if (error) {
    const messages = error.details.map((d) => d.message)
    throw new BadRequestError(`参数验证失败: ${messages.join(', ')}`)
  }

  return value
}
```

安装 Joi：

```bash
npm install joi
```

### 3.4 提取流处理器

创建 `src/utils/streamHandler.js`：

```javascript
import logger from './logger.js'

/**
 * SSE 流处理器
 */
export class StreamHandler {
  constructor(res) {
    this.res = res
    this.setupHeaders()
  }

  /**
   * 设置 SSE 响应头
   */
  setupHeaders() {
    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    this.res.setHeader('Cache-Control', 'no-cache')
    this.res.setHeader('Connection', 'keep-alive')
  }

  /**
   * 发送数据块
   */
  sendChunk(data) {
    this.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  /**
   * 发送完成信号
   */
  sendDone() {
    this.res.write('data: [DONE]\n\n')
  }

  /**
   * 发送错误
   */
  sendError(error) {
    this.res.write(
      `data: ${JSON.stringify({
        error: error.message,
      })}\n\n`
    )
  }

  /**
   * 结束流
   */
  end() {
    this.res.end()
  }

  /**
   * 处理流式响应
   */
  async handleStream(stream) {
    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          this.sendChunk(chunk)
        }
      }
      this.sendDone()
    } catch (error) {
      logger.error('Stream handler error:', error)
      this.sendError(error)
    } finally {
      this.end()
    }
  }
}
```

### 3.5 更新控制器使用新工具

重构 `src/controllers/chat.controller.js`：

```javascript
import aiService from '../services/ai.service.js'
import { success } from '../utils/response.js'
import { validateChatRequest } from '../validators/chatValidator.js'
import { StreamHandler } from '../utils/streamHandler.js'

class ChatController {
  async chat(req, res) {
    // 验证参数
    const validatedData = validateChatRequest(req.body)

    // 调用服务
    const result = await aiService.chat(validatedData.messages, {
      provider: validatedData.provider,
      model: validatedData.model,
      temperature: validatedData.temperature,
      max_tokens: validatedData.maxTokens,
    })

    return res.json(success(result))
  }

  async chatStream(req, res) {
    // 验证参数
    const validatedData = validateChatRequest(req.body)

    // 创建流处理器
    const streamHandler = new StreamHandler(res)

    // 获取流
    const stream = await aiService.chatStream(validatedData.messages, {
      provider: validatedData.provider,
      model: validatedData.model,
      temperature: validatedData.temperature,
      max_tokens: validatedData.maxTokens,
    })

    // 处理流
    await streamHandler.handleStream(stream)
  }

  async getProviders(req, res) {
    const providers = aiService.getAvailableProviders()
    return res.json(success({ providers }))
  }
}

export default new ChatController()
```

---

## 四、重构后的项目结构

```
src/
├── adapters/              # 适配器层
│   ├── base.adapter.js
│   ├── deepseek.adapter.js
│   ├── openai.adapter.js
│   └── factory.js
│
├── controllers/           # 控制器层（新增）
│   └── chat.controller.js
│
├── services/              # 服务层
│   └── ai.service.js
│
├── routes/                # 路由层
│   ├── index.js
│   └── chat.routes.js
│
├── middleware/            # 中间件
│   ├── cors.js
│   ├── requestLogger.js
│   ├── errorHandler.js
│   ├── validator.js
│   └── performance.js
│
├── validators/            # 验证器（新增）
│   └── chatValidator.js
│
├── utils/                 # 工具函数
│   ├── logger.js
│   ├── logHelper.js
│   ├── response.js
│   ├── asyncHandler.js
│   └── streamHandler.js   # 新增
│
├── errors/                # 错误类
│   ├── ApiError.js
│   └── index.js
│
├── config/                # 配置
│   └── index.js
│
└── app.js                 # Express 应用
```

---

## 五、重构前后对比

```
┌─────────────────────────────────────────────────────────────┐
│              重构前后对比                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   重构前：                                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  routes/chat.routes.js (100+ 行)                │       │
│   │  - 路由定义                                      │       │
│   │  - 参数验证                                      │       │
│   │  - 业务逻辑                                      │       │
│   │  - 错误处理                                      │       │
│   │  - 响应格式化                                    │       │
│   │  - 流处理                                        │       │
│   │                                                 │       │
│   │  问题：职责混乱，难以测试和复用                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   重构后：                                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  routes/chat.routes.js (10 行)                  │       │
│   │  - 只负责路由定义                                │       │
│   │                                                 │       │
│   │  controllers/chat.controller.js (50 行)         │       │
│   │  - 负责业务流程编排                              │       │
│   │                                                 │       │
│   │  validators/chatValidator.js (30 行)            │       │
│   │  - 负责参数验证                                  │       │
│   │                                                 │       │
│   │  utils/streamHandler.js (40 行)                 │       │
│   │  - 负责流处理                                    │       │
│   │                                                 │       │
│   │  优点：职责清晰，易于测试，代码复用               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、重构的收益

```
┌─────────────────────────────────────────────────────────────┐
│                  重构的收益                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 【可维护性】                                             │
│      ✓ 代码结构清晰，容易理解                                │
│      ✓ 修改局部不影响全局                                    │
│      ✓ 新人容易上手                                          │
│                                                             │
│   2. 【可测试性】                                             │
│      ✓ 每个模块可以独立测试                                  │
│      ✓ 容易 mock 依赖                                       │
│      ✓ 测试覆盖率更高                                        │
│                                                             │
│   3. 【可复用性】                                             │
│      ✓ 工具函数可以在多处使用                                │
│      ✓ 验证器可以复用                                        │
│      ✓ 流处理器可以复用                                      │
│                                                             │
│   4. 【可扩展性】                                             │
│      ✓ 添加新功能更容易                                      │
│      ✓ 不会破坏现有代码                                      │
│      ✓ 符合开闭原则                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、学习检查清单

- [ ] 理解重构和重写的区别
- [ ] 掌握重构的原则和流程
- [ ] 能够识别代码坏味道
- [ ] 实现了控制器层
- [ ] 提取了验证器和工具函数
- [ ] 理解分层架构的优势

---

## 八、实践作业

### 作业 1：测试重构后的代码

编写单元测试，确保重构没有破坏功能。

### 作业 2：继续重构

识别项目中其他需要重构的地方，进行优化。

### 作业 3：性能对比

对比重构前后的性能和代码质量指标。

---

**记住：重构是持续的过程，不是一次性任务。保持代码整洁是每个开发者的责任。**
