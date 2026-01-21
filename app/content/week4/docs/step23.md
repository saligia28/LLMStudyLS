# Step 23: Node AI 后端封装｜统一的 AI 请求封装函数

## 学习目标

这个任务的本质是回答一个核心问题：**如何设计一个通用的、可扩展的 AI 请求封装函数，支持多种 AI 服务提供商**。

通过本教程,你将：

1. 理解为什么需要统一的 AI 请求封装
2. 掌握适配器模式（Adapter Pattern）的应用
3. 实现支持多个 AI 提供商的统一接口
4. 处理不同 API 的差异和兼容性

---

## 一、核心认知：为什么需要统一封装？

### 1.1 混乱的直接调用 vs 统一封装

```
┌─────────────────────────────────────────────────────────────┐
│           直接调用 vs 统一封装                                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   直接调用（不推荐）                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // routes/chat.js                              │       │
│   │  import OpenAI from 'openai'                    │       │
│   │                                                 │       │
│   │  router.post('/openai', async (req, res) => {  │       │
│   │    const client = new OpenAI({...})            │       │
│   │    const result = await client.chat.create()   │       │
│   │  })                                            │       │
│   │                                                 │       │
│   │  router.post('/deepseek', async (req, res) => {│       │
│   │    const client = new OpenAI({...})            │       │
│   │    const result = await client.chat.create()   │       │
│   │  })                                            │       │
│   │                                                 │       │
│   │  问题：                                          │       │
│   │  - 代码重复，每个路由都要初始化客户端             │       │
│   │  - 切换服务商需要修改多处代码                    │       │
│   │  - 错误处理分散，不统一                          │       │
│   │  - 难以添加通用逻辑（如日志、重试）               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   统一封装（推荐）                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // services/ai.service.js                      │       │
│   │  class AIService {                              │       │
│   │    async chat(messages, provider = 'deepseek') {│       │
│   │      // 统一的调用逻辑                           │       │
│   │      // 自动选择提供商                           │       │
│   │      // 统一错误处理                             │       │
│   │      // 统一日志记录                             │       │
│   │    }                                            │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  // routes/chat.js                              │       │
│   │  router.post('/chat', async (req, res) => {    │       │
│   │    const result = await aiService.chat(messages)│       │
│   │  })                                            │       │
│   │                                                 │       │
│   │  优点：                                          │       │
│   │  - 代码复用，一处实现处处可用                    │       │
│   │  - 切换服务商只需修改配置                        │       │
│   │  - 错误处理统一管理                              │       │
│   │  - 易于扩展新功能                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 多提供商支持的必要性

```
┌─────────────────────────────────────────────────────────────┐
│              为什么需要多提供商支持？                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   现实场景：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 成本优化                                     │       │
│   │     - DeepSeek 便宜，用于日常对话                │       │
│   │     - GPT-4 贵但强，用于复杂任务                 │       │
│   │                                                 │       │
│   │  2. 容灾备份                                     │       │
│   │     - 主服务故障时自动切换备用服务                │       │
│   │     - 提高系统可用性                             │       │
│   │                                                 │       │
│   │  3. 功能互补                                     │       │
│   │     - 不同模型擅长不同任务                        │       │
│   │     - 代码生成用 Claude，翻译用 GPT              │       │
│   │                                                 │       │
│   │  4. 避免厂商锁定                                 │       │
│   │     - 不依赖单一服务商                           │       │
│   │     - 灵活切换和迁移                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、适配器模式（Adapter Pattern）

### 2.1 适配器模式概念

```
┌─────────────────────────────────────────────────────────────┐
│                适配器模式                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   定义：                                                     │
│   将不同接口转换为统一接口，使原本不兼容的类可以一起工作       │
│                                                             │
│   类比：                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  电源适配器                                      │       │
│   │                                                 │       │
│   │  中国插头 (220V) ──┐                            │       │
│   │  美国插头 (110V) ──┤→  适配器  → 统一供电        │       │
│   │  欧洲插头 (230V) ──┘                            │       │
│   │                                                 │       │
│   │  不同的插头通过适配器转换为统一的供电接口          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   AI 场景：                                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  OpenAI API ──┐                                 │       │
│   │  DeepSeek API ─┤→  AI Adapter  → 统一接口        │       │
│   │  Claude API ───┘                                │       │
│   │                                                 │       │
│   │  不同的 AI API 通过适配器转换为统一的调用接口     │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 适配器模式架构

```
┌─────────────────────────────────────────────────────────────┐
│              AI 服务适配器架构                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │          统一接口层 (AIService)                  │       │
│   │                                                 │       │
│   │   chat(messages, options)                       │       │
│   │   chatStream(messages, options)                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │          Provider Factory                       │       │
│   │      (根据配置创建对应的 Adapter)                 │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌───────────┬─────────────┬───────────────────────┐       │
│   │           │             │                       │       │
│   │  OpenAI   │  DeepSeek   │    Claude            │       │
│   │  Adapter  │  Adapter    │    Adapter           │       │
│   │           │             │                       │       │
│   └───────────┴─────────────┴───────────────────────┘       │
│        ↓             ↓               ↓                      │
│   ┌───────────┬─────────────┬───────────────────────┐       │
│   │  OpenAI   │  DeepSeek   │    Claude            │       │
│   │  API      │  API        │    API               │       │
│   └───────────┴─────────────┴───────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实践：实现 AI 适配器

### 3.1 定义适配器基类

创建 `src/adapters/base.adapter.js`：

```javascript
/**
 * AI 适配器基类
 * 定义所有 AI 服务必须实现的接口
 */
class BaseAdapter {
  constructor(config) {
    this.config = config
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   * @returns {Promise<Object>} - 返回消息对象
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass')
  }

  /**
   * 发送流式聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   * @returns {Promise<Stream>} - 返回流对象
   */
  async chatStream(messages, options = {}) {
    throw new Error('chatStream() must be implemented by subclass')
  }

  /**
   * 格式化消息（可选）
   * 将统一格式的消息转换为特定 API 的格式
   */
  formatMessages(messages) {
    return messages
  }

  /**
   * 格式化响应（可选）
   * 将特定 API 的响应转换为统一格式
   */
  formatResponse(response) {
    return response
  }
}

export default BaseAdapter
```

### 3.2 实现 DeepSeek 适配器

创建 `src/adapters/deepseek.adapter.js`：

```javascript
import OpenAI from 'openai'
import BaseAdapter from './base.adapter.js'
import logger from '../utils/logger.js'

/**
 * DeepSeek 适配器
 * DeepSeek 使用 OpenAI 兼容的 API
 */
class DeepSeekAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
    this.model = config.model || 'deepseek-chat'
  }

  async chat(messages, options = {}) {
    try {
      logger.info('[DeepSeek] Sending chat request')

      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: this.formatMessages(messages),
        stream: false,
        ...options,
      })

      logger.info('[DeepSeek] Chat completed', {
        usage: response.usage,
      })

      return this.formatResponse(response.choices[0].message)
    } catch (error) {
      logger.error('[DeepSeek] Chat failed:', error.message)
      throw this.handleError(error)
    }
  }

  async chatStream(messages, options = {}) {
    try {
      logger.info('[DeepSeek] Sending stream request')

      const stream = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: this.formatMessages(messages),
        stream: true,
        ...options,
      })

      return stream
    } catch (error) {
      logger.error('[DeepSeek] Stream failed:', error.message)
      throw this.handleError(error)
    }
  }

  formatMessages(messages) {
    // DeepSeek 使用标准 OpenAI 格式，无需特殊处理
    return messages
  }

  formatResponse(message) {
    // 返回统一格式
    return {
      role: message.role,
      content: message.content,
      provider: 'deepseek',
    }
  }

  handleError(error) {
    // 统一错误格式
    return {
      provider: 'deepseek',
      message: error.message,
      status: error.status,
      code: error.code,
    }
  }
}

export default DeepSeekAdapter
```

### 3.3 实现 OpenAI 适配器

创建 `src/adapters/openai.adapter.js`：

```javascript
import OpenAI from 'openai'
import BaseAdapter from './base.adapter.js'
import logger from '../utils/logger.js'

/**
 * OpenAI 适配器
 */
class OpenAIAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.client = new OpenAI({
      apiKey: config.apiKey,
    })
    this.model = config.model || 'gpt-3.5-turbo'
  }

  async chat(messages, options = {}) {
    try {
      logger.info('[OpenAI] Sending chat request')

      const response = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: this.formatMessages(messages),
        stream: false,
        ...options,
      })

      logger.info('[OpenAI] Chat completed', {
        usage: response.usage,
      })

      return this.formatResponse(response.choices[0].message)
    } catch (error) {
      logger.error('[OpenAI] Chat failed:', error.message)
      throw this.handleError(error)
    }
  }

  async chatStream(messages, options = {}) {
    try {
      logger.info('[OpenAI] Sending stream request')

      const stream = await this.client.chat.completions.create({
        model: options.model || this.model,
        messages: this.formatMessages(messages),
        stream: true,
        ...options,
      })

      return stream
    } catch (error) {
      logger.error('[OpenAI] Stream failed:', error.message)
      throw this.handleError(error)
    }
  }

  formatResponse(message) {
    return {
      role: message.role,
      content: message.content,
      provider: 'openai',
    }
  }

  handleError(error) {
    return {
      provider: 'openai',
      message: error.message,
      status: error.status,
      code: error.code,
    }
  }
}

export default OpenAIAdapter
```

### 3.4 实现 Provider Factory

创建 `src/adapters/factory.js`：

```javascript
import DeepSeekAdapter from './deepseek.adapter.js'
import OpenAIAdapter from './openai.adapter.js'

/**
 * AI Provider Factory
 * 根据配置创建对应的适配器实例
 */
class ProviderFactory {
  constructor() {
    this.providers = new Map()
  }

  /**
   * 注册提供商
   */
  register(name, AdapterClass, config) {
    this.providers.set(name, {
      AdapterClass,
      config,
    })
  }

  /**
   * 获取提供商实例
   */
  get(name) {
    const provider = this.providers.get(name)
    if (!provider) {
      throw new Error(`Provider "${name}" not found`)
    }

    // 每次创建新实例（也可以改为单例模式）
    return new provider.AdapterClass(provider.config)
  }

  /**
   * 列出所有已注册的提供商
   */
  list() {
    return Array.from(this.providers.keys())
  }
}

export default new ProviderFactory()
```

### 3.5 更新配置文件

更新 `src/config/index.js`：

```javascript
import 'dotenv/config'

const config = {
  // 服务器配置
  port: process.env.PORT || 3000,

  // AI 提供商配置
  ai: {
    // 默认提供商
    defaultProvider: process.env.AI_DEFAULT_PROVIDER || 'deepseek',

    // DeepSeek 配置
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    },

    // OpenAI 配置
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    },
  },
}

export default config
```

### 3.6 重构 AI Service

更新 `src/services/ai.service.js`：

```javascript
import config from '../config/index.js'
import factory from '../adapters/factory.js'
import DeepSeekAdapter from '../adapters/deepseek.adapter.js'
import OpenAIAdapter from '../adapters/openai.adapter.js'
import logger from '../utils/logger.js'

/**
 * AI 服务
 * 使用适配器模式支持多个 AI 提供商
 */
class AIService {
  constructor() {
    this.init()
  }

  /**
   * 初始化：注册所有可用的 AI 提供商
   */
  init() {
    // 注册 DeepSeek
    if (config.ai.deepseek.apiKey) {
      factory.register('deepseek', DeepSeekAdapter, config.ai.deepseek)
      logger.info('Registered provider: deepseek')
    }

    // 注册 OpenAI
    if (config.ai.openai.apiKey) {
      factory.register('openai', OpenAIAdapter, config.ai.openai)
      logger.info('Registered provider: openai')
    }

    // 检查是否至少有一个提供商
    if (factory.list().length === 0) {
      logger.error('No AI provider configured!')
      throw new Error('At least one AI provider must be configured')
    }

    logger.info(`Available providers: ${factory.list().join(', ')}`)
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   */
  async chat(messages, options = {}) {
    const provider = options.provider || config.ai.defaultProvider
    const adapter = factory.get(provider)

    logger.info(`Using provider: ${provider}`)

    return await adapter.chat(messages, options)
  }

  /**
   * 发送流式聊天请求
   * @param {Array} messages - 消息数组
   * @param {Object} options - 配置选项
   */
  async chatStream(messages, options = {}) {
    const provider = options.provider || config.ai.defaultProvider
    const adapter = factory.get(provider)

    logger.info(`Using provider: ${provider} (stream)`)

    return await adapter.chatStream(messages, options)
  }

  /**
   * 获取可用的提供商列表
   */
  getAvailableProviders() {
    return factory.list()
  }
}

export default new AIService()
```

### 3.7 更新路由

更新 `src/routes/chat.routes.js` 添加提供商选择：

```javascript
import express from 'express'
import aiService from '../services/ai.service.js'
import { success, error } from '../utils/response.js'
import logger from '../utils/logger.js'

const router = express.Router()

/**
 * POST /api/chat
 * 普通聊天接口（支持多提供商）
 */
router.post('/chat', async (req, res) => {
  try {
    const { messages, provider, model } = req.body

    // 参数验证
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json(error('messages 参数必须是非空数组', 400))
    }

    // 调用服务层（传递提供商选项）
    const result = await aiService.chat(messages, { provider, model })

    // 返回成功响应
    res.json(success(result))
  } catch (err) {
    logger.error('Chat route error:', err)
    res.status(500).json(error(err.message))
  }
})

/**
 * GET /api/providers
 * 获取可用的 AI 提供商列表
 */
router.get('/providers', (req, res) => {
  try {
    const providers = aiService.getAvailableProviders()
    res.json(success({ providers }))
  } catch (err) {
    logger.error('Providers route error:', err)
    res.status(500).json(error(err.message))
  }
})

export default router
```

---

## 四、测试统一封装

### 4.1 测试可用提供商

```bash
curl http://localhost:3000/api/providers
```

预期输出：

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "providers": ["deepseek", "openai"]
  }
}
```

### 4.2 测试 DeepSeek

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}],
    "provider": "deepseek"
  }'
```

### 4.3 测试 OpenAI

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "provider": "openai"
  }'
```

### 4.4 测试默认提供商

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

---

## 五、扩展：添加新的 AI 提供商

### 5.1 添加步骤

假设要添加 Claude 支持：

1. **创建适配器**：`src/adapters/claude.adapter.js`
2. **添加配置**：在 `config/index.js` 添加 Claude 配置
3. **注册提供商**：在 `ai.service.js` 的 `init()` 方法中注册

### 5.2 Claude 适配器示例

```javascript
import Anthropic from '@anthropic-ai/sdk'
import BaseAdapter from './base.adapter.js'
import logger from '../utils/logger.js'

class ClaudeAdapter extends BaseAdapter {
  constructor(config) {
    super(config)
    this.client = new Anthropic({
      apiKey: config.apiKey,
    })
    this.model = config.model || 'claude-3-sonnet-20240229'
  }

  async chat(messages, options = {}) {
    try {
      logger.info('[Claude] Sending chat request')

      const response = await this.client.messages.create({
        model: options.model || this.model,
        messages: this.formatMessages(messages),
        max_tokens: options.max_tokens || 1024,
      })

      return this.formatResponse(response)
    } catch (error) {
      logger.error('[Claude] Chat failed:', error.message)
      throw this.handleError(error)
    }
  }

  formatMessages(messages) {
    // Claude 的消息格式略有不同，需要转换
    return messages.filter((m) => m.role !== 'system')
  }

  formatResponse(response) {
    return {
      role: 'assistant',
      content: response.content[0].text,
      provider: 'claude',
    }
  }

  handleError(error) {
    return {
      provider: 'claude',
      message: error.message,
      status: error.status,
    }
  }
}

export default ClaudeAdapter
```

---

## 六、适配器模式的优势

```
┌─────────────────────────────────────────────────────────────┐
│              适配器模式的优势                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 解耦                                                    │
│      - 业务代码不依赖具体的 AI 提供商                        │
│      - 切换提供商无需修改业务代码                            │
│                                                             │
│   2. 可扩展                                                  │
│      - 添加新提供商只需实现新适配器                          │
│      - 不影响现有代码                                        │
│                                                             │
│   3. 可测试                                                  │
│      - 可以 mock 适配器进行单元测试                          │
│      - 每个适配器可以独立测试                                │
│                                                             │
│   4. 统一接口                                                │
│      - 所有提供商使用相同的调用方式                          │
│      - 降低学习成本                                          │
│                                                             │
│   5. 容错能力                                                │
│      - 主提供商失败时可以快速切换备用                        │
│      - 提高系统可用性                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：概念理解

- [ ] 理解为什么需要统一的 AI 请求封装
- [ ] 理解适配器模式的核心思想
- [ ] 知道如何处理不同 API 的差异
- [ ] 理解 Factory 模式的作用

### 第二层：代码实现

- [ ] 实现了适配器基类
- [ ] 实现了至少两个具体适配器
- [ ] 实现了 Provider Factory
- [ ] 重构了 AI Service 使用适配器

### 第三层：实践能力

- [ ] 能够在不同提供商之间切换
- [ ] 能够添加新的 AI 提供商
- [ ] 能够处理不同 API 的响应格式
- [ ] 测试了多提供商调用

### 综合能力

- [ ] 理解适配器模式的优势
- [ ] 能够设计可扩展的服务架构
- [ ] 能够处理 API 兼容性问题

---

## 八、实践作业

### 作业 1：添加自动切换功能

**要求**：

- 当主提供商失败时自动切换到备用提供商
- 实现重试机制
- 记录切换日志

### 作业 2：实现负载均衡

**要求**：

- 实现轮询策略，在多个提供商间轮流分配请求
- 添加统计功能，记录每个提供商的调用次数
- 支持权重配置

### 作业 3：添加缓存层

**要求**：

- 对相同的请求返回缓存结果
- 设置缓存过期时间
- 支持缓存清除

---

## 九、常见问题排查

### Q1: 为什么要用适配器模式而不是简单的 if-else？

**答**：

```javascript
// ❌ 不好的做法
async function chat(messages, provider) {
  if (provider === 'openai') {
    // OpenAI 调用逻辑
  } else if (provider === 'deepseek') {
    // DeepSeek 调用逻辑
  } else if (provider === 'claude') {
    // Claude 调用逻辑
  }
  // 添加新提供商需要修改这个函数
}

// ✅ 好的做法（适配器模式）
const adapter = factory.get(provider)
return await adapter.chat(messages)
// 添加新提供商只需创建新适配器，不修改现有代码
```

### Q2: 每次调用都创建新的适配器实例会不会影响性能？

**答**：可以改为单例模式：

```javascript
class ProviderFactory {
  constructor() {
    this.providers = new Map()
    this.instances = new Map() // 缓存实例
  }

  get(name) {
    // 如果已有实例，直接返回
    if (this.instances.has(name)) {
      return this.instances.get(name)
    }

    // 否则创建新实例并缓存
    const provider = this.providers.get(name)
    const instance = new provider.AdapterClass(provider.config)
    this.instances.set(name, instance)
    return instance
  }
}
```

### Q3: 如何处理不同 API 的参数差异？

**答**：在适配器的 `formatMessages()` 方法中转换：

```javascript
formatMessages(messages) {
  // 示例：Claude 不支持 system role，需要转换
  if (this.provider === 'claude') {
    return messages.filter(m => m.role !== 'system')
  }
  return messages
}
```

---

## 十、下一步学习方向

完成本节后，你已经实现了统一的 AI 请求封装。接下来：

1. **Step 24**：加入跨域、中间件、环境变量管理
2. **Step 25**：完善日志系统
3. **Step 26**：实现统一错误处理
4. **Step 27**：重构和优化代码结构

---

**记住：好的封装不仅仅是代码复用，更是为未来的扩展和维护打下基础。适配器模式让你的代码具备"拥抱变化"的能力。**
