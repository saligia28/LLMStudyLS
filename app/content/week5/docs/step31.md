# Step 31: Function Calling｜让模型根据内容自动调用函数

## 学习目标

这个任务的本质是回答一个核心问题:**如何让 AI 模型根据用户输入自动选择并调用合适的函数,并在企业级应用中实现完整的调用流程**。

通过本教程,你将:

1. 理解 AI-backend 项目中的完整函数调用流程
2. 学习如何通过 AIService 和 Adapter 传递函数定义
3. 掌握解析 tool_calls 并执行函数的方法
4. 实现多轮对话和函数执行的集成

> **实战重点**: 本教程将展示如何在 AI-backend 的架构基础上扩展 Function Calling 功能。

---

## 一、AI-backend 的函数调用流程

### 1.1 完整的请求链路

```
┌─────────────────────────────────────────────────────────────┐
│        AI-backend 中的 Function Calling 完整流程                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 用户请求                                                │
│      POST /api/chat                                         │
│      {                                                      │
│        messages: [{ role: "user", content: "现在几点?" }],   │
│        tools: [{ type: "function", function: getTimeSchema }] │
│      }                                                      │
│      ↓                                                      │
│   2. ChatController 接收请求                                 │
│      - 使用 chatValidator 验证参数                           │
│      - 调用 aiService.chat()                                │
│      ↓                                                      │
│   3. AIService 处理                                          │
│      - 获取 provider (deepseek/openai)                      │
│      - 从 factory 获取对应 adapter                           │
│      - 调用 adapter.chat(messages, { tools })              │
│      ↓                                                      │
│   4. DeepSeekAdapter 发送请求                                │
│      const response = await this.client.chat.completions    │
│        .create({                                            │
│          model: 'deepseek-chat',                           │
│          messages: messages,                               │
│          tools: tools,         ← 传给 AI Provider（新版）    │
│          tool_choice: 'auto',                              │
│        })                                                   │
│      ↓                                                      │
│   5. AI Provider 返回                                        │
│      {                                                      │
│        choices: [{                                         │
│          message: {                                        │
│            role: "assistant",                              │
│            content: null,                                  │
│            tool_calls: [{      ← 新版字段（数组！）           │
│              id: "call_abc",                               │
│              type: "function",                             │
│              function: {                                   │
│                name: "getTime",                            │
│                arguments: '{"timezone":"Asia/Shanghai"}'   │
│              }                                             │
│            }]                                              │
│          }                                                 │
│        }]                                                  │
│      }                                                      │
│      ↓                                                      │
│   6. 【需要我们实现】解析并执行函数                            │
│      const toolCall = tool_calls[0]                        │
│      const args = JSON.parse(toolCall.function.arguments)  │
│      const result = getTime(args.timezone)                 │
│      ↓                                                      │
│   7. 【需要我们实现】将结果返回给 AI                           │
│      再次调用 chat API,添加 role:"tool" 消息                 │
│      ↓                                                      │
│   8. AI 生成最终回复                                         │
│      "当前北京时间是 2024-01-27 14:30:45"                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 当前 AI-backend 的能力范围

**✓ 已实现**:
- Controller → Service → Adapter 的完整架构
- 多 AI 提供商支持(DeepSeek, OpenAI)
- 消息验证和错误处理
- 日志记录和性能监控

**✗ 待扩展**:
- 函数执行器(Function Executor)
- tool_calls 的解析和调用
- 多轮对话管理
- 函数结果的处理

**我们的目标**: 在现有架构上添加 Function Calling 能力。

---

## 二、实现函数执行器

### 2.1 设计函数执行器类

创建 `src/utils/functionExecutor.js`:

```javascript
import logger from './logger.js'
import { BadRequestError } from '../errors/index.js'

/**
 * 函数执行器
 * 负责注册、解析和执行函数
 */
export class FunctionExecutor {
  constructor() {
    this.functions = new Map()
  }

  /**
   * 注册函数
   * @param {string} name - 函数名
   * @param {Function} fn - 函数实现
   */
  register(name, fn) {
    if (typeof fn !== 'function') {
      throw new Error(`${name} must be a function`)
    }

    this.functions.set(name, fn)
    logger.info(`Registered function: ${name}`)
  }

  /**
   * 批量注册函数
   * @param {Object} functionsMap - { functionName: functionImpl }
   */
  registerAll(functionsMap) {
    Object.entries(functionsMap).forEach(([name, fn]) => {
      this.register(name, fn)
    })
  }

  /**
   * 执行函数
   * @param {string} name - 函数名
   * @param {string} argumentsJson - JSON 字符串格式的参数
   * @returns {any} 函数执行结果
   */
  execute(name, argumentsJson) {
    // 1. 检查函数是否存在
    if (!this.functions.has(name)) {
      throw new BadRequestError(`Function ${name} not found`)
    }

    // 2. 解析参数
    let args
    try {
      // arguments 可能是字符串或对象
      args = typeof argumentsJson === 'string'
        ? JSON.parse(argumentsJson)
        : argumentsJson
    } catch (error) {
      logger.error(`Failed to parse arguments for ${name}`, {
        arguments: argumentsJson,
        error: error.message,
      })
      throw new BadRequestError(`Invalid arguments format: ${error.message}`)
    }

    // 3. 执行函数
    try {
      const fn = this.functions.get(name)
      logger.debug(`Executing function: ${name}`, { args })

      const result = fn(args)

      logger.info(`Function ${name} executed successfully`)
      return result
    } catch (error) {
      logger.error(`Function ${name} execution failed`, {
        error: error.message,
        args,
      })
      throw new Error(`Function execution failed: ${error.message}`)
    }
  }

  /**
   * 获取已注册的函数列表
   */
  list() {
    return Array.from(this.functions.keys())
  }
}

// 导出单例
export default new FunctionExecutor()
```

### 2.2 注册函数到执行器

创建 `src/config/functions.js`:

```javascript
import functionExecutor from '../utils/functionExecutor.js'
import { getTime } from '../../functions/getTime.js'
import { sum } from '../../functions/sum.js'

/**
 * 初始化函数执行器
 * 注册所有可用函数
 */
export function initFunctions() {
  // 方式 1: 单个注册
  functionExecutor.register('getTime', (args) => {
    return getTime(args.timezone)
  })

  functionExecutor.register('sum', (args) => {
    return sum(args.a, args.b)
  })

  // 方式 2: 批量注册
  // functionExecutor.registerAll({
  //   getTime: (args) => getTime(args.timezone),
  //   sum: (args) => sum(args.a, args.b),
  // })

  console.log(`Registered functions: ${functionExecutor.list().join(', ')}`)
}
```

### 2.3 在应用启动时初始化

修改 `server.js`:

```javascript
import app from './src/app.js'
import config from './src/config/index.js'
import logger from './src/utils/logger.js'
import { initFunctions } from './src/config/functions.js'  // ← 新增

const PORT = config.port

// 初始化函数执行器
initFunctions()  // ← 新增

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  logger.info(`Environment: ${config.env}`)
  console.log(`🚀 Server ready at http://localhost:${PORT}`)
})
```

---

## 三、扩展 ChatController 支持函数调用

### 3.1 处理 tool_calls 响应

修改 `src/controllers/chat.controller.js`:

```javascript
import aiService from '../services/ai.service.js'
import functionExecutor from '../utils/functionExecutor.js'
import { success } from '../utils/response.js'
import { validateChatRequest } from '../validators/chatValidator.js'
import { StreamHandler } from '../utils/streamHandler.js'
import logger from '../utils/logger.js'

class ChatController {
  /**
   * 标准聊天(支持函数调用)
   */
  async chat(req, res) {
    const validatedData = validateChatRequest(req.body)
    const messages = [...validatedData.messages]

    // 第一次调用 AI
    let result = await aiService.chat(messages, {
      provider: validatedData.provider,
      model: validatedData.model,
      temperature: validatedData.temperature,
      max_tokens: validatedData.maxTokens,
      tools: validatedData.tools, // ← 新版：传入 tools 定义
    })

    // 检查是否需要调用函数（新版：检查 tool_calls 数组）
    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0]           // 取第一个工具调用
      const { name, arguments: args } = toolCall.function

      logger.info(`AI requested tool call`, { name, args, toolCallId: toolCall.id })

      try {
        // 执行函数
        const functionResult = functionExecutor.execute(name, args)

        logger.info(`Function ${name} executed`, { result: functionResult })

        // 添加 assistant 消息（带 tool_calls，必须原样保留）
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: result.tool_calls,
        })

        // 添加 tool 消息（函数执行结果，必须带 tool_call_id）
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,  // ← 必须与上面的 tool_calls[0].id 对应
          content: typeof functionResult === 'string'
            ? functionResult
            : JSON.stringify(functionResult),
        })

        // 第二次调用 AI,让它生成最终回复
        result = await aiService.chat(messages, {
          provider: validatedData.provider,
          model: validatedData.model,
          temperature: validatedData.temperature,
          max_tokens: validatedData.maxTokens,
        })

        logger.info(`Final response generated`)

      } catch (error) {
        logger.error(`Function execution failed`, { error: error.message })

        // 告诉 AI 函数执行失败
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: result.tool_calls,
        })
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error.message }),
        })

        // 让 AI 生成错误回复
        result = await aiService.chat(messages, {
          provider: validatedData.provider,
          model: validatedData.model,
        })
      }
    }

    return res.json(success(result))
  }

  // ... 其他方法保持不变
}

export default new ChatController()
```

### 3.2 更新 Validator 支持 functions 参数

修改 `src/validators/chatValidator.js`:

```javascript
import Joi from 'joi'
import { BadRequestError } from '../errors/index.js'

// 消息 Schema（新版增加 tool role）
const messageSchema = Joi.object({
  role: Joi.string().valid('system', 'user', 'assistant', 'tool').required(),
  content: Joi.string().max(10000).allow(null),
  tool_call_id: Joi.string().optional(), // tool role 需要
  tool_calls: Joi.array().optional(),    // assistant 带工具调用时
})

// Tool Schema（新版用 tools 数组，每项包裹一层 type + function）
const toolSchema = Joi.object({
  type: Joi.string().valid('function').required(),
  function: Joi.object({
    name: Joi.string().required(),
    description: Joi.string().required(),
    parameters: Joi.object().required(),
  }).required(),
})

// 聊天请求 Schema
const chatRequestSchema = Joi.object({
  messages: Joi.array().items(messageSchema).min(1).max(50).required(),
  provider: Joi.string().valid('deepseek', 'openai', 'claude').optional(),
  model: Joi.string().optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  maxTokens: Joi.number().min(1).max(8000).optional(),
  tools: Joi.array().items(toolSchema).optional(), // ← 新版字段
})

export function validateChatRequest(data) {
  const { error, value } = chatRequestSchema.validate(data, {
    abortEarly: false,
  })

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }))
    throw new BadRequestError('Validation failed', errors)
  }

  return value
}
```

---

## 四、测试函数调用

### 4.1 准备测试数据

创建测试文件 `test-function-calling.http`:

```http
### 测试 1: 不带参数的函数调用
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "现在几点了?" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getTime",
        "description": "获取指定时区的当前时间。如果不指定时区,返回北京时间。",
        "parameters": {
          "type": "object",
          "properties": {
            "timezone": {
              "type": "string",
              "description": "时区标识符",
              "enum": ["UTC", "Asia/Shanghai", "America/New_York"],
              "default": "Asia/Shanghai"
            }
          },
          "required": []
        }
      }
    }
  ]
}

### 测试 2: 带参数的函数调用
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "帮我算一下 123 加 456 等于多少" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "sum",
        "description": "计算两个数字的和。支持整数和浮点数。",
        "parameters": {
          "type": "object",
          "properties": {
            "a": { "type": "number", "description": "第一个加数" },
            "b": { "type": "number", "description": "第二个加数" }
          },
          "required": ["a", "b"]
        }
      }
    }
  ]
}

### 测试 3: 多函数场景
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "现在几点?顺便帮我算 10+20" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "getTime",
        "description": "获取当前时间",
        "parameters": {
          "type": "object",
          "properties": {
            "timezone": {
              "type": "string",
              "enum": ["UTC", "Asia/Shanghai", "America/New_York"]
            }
          },
          "required": []
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "sum",
        "description": "计算两个数的和",
        "parameters": {
          "type": "object",
          "properties": {
            "a": { "type": "number" },
            "b": { "type": "number" }
          },
          "required": ["a", "b"]
        }
      }
    }
  ]
}
```

### 4.2 预期响应流程

**测试 1 的完整流程**:

```
1. 用户: "现在几点了?"
   ↓
2. AI 返回 tool_calls: [{ id: "call_xxx", function: { name: "getTime", arguments: "{}" } }]
   ↓
3. 执行 getTime() → "当前时间 (Asia/Shanghai): 2024-01-27 14:30:45"
   ↓
4. 将结果以 role:"tool" + tool_call_id 发回 AI
   ↓
5. AI 最终回复: "现在是北京时间 2024年1月27日 14:30:45"
```

---

## 五、AI-backend 架构的优势

### 5.1 设计模式的应用

```
┌─────────────────────────────────────────────────────────────┐
│       AI-backend 中 Function Calling 的架构优势                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 单一职责原则                                             │
│      - Controller: 处理 HTTP 请求/响应                       │
│      - Service: 编排业务逻辑                                 │
│      - Adapter: 对接 AI Provider                            │
│      - Executor: 执行函数                                    │
│                                                             │
│   2. 开闭原则                                                │
│      - 添加新函数: 只需注册到 executor                        │
│      - 添加新 Provider: 只需实现 BaseAdapter                 │
│      - 不修改现有代码                                        │
│                                                             │
│   3. 依赖倒置                                                │
│      - Service 依赖 Adapter 接口,不依赖具体实现               │
│      - 便于测试和 mock                                       │
│                                                             │
│   4. 统一错误处理                                            │
│      - 函数执行错误被 catch 并转换为 ApiError                 │
│      - 日志记录完整                                          │
│      - 用户友好的错误信息                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 对比简单实现

**简单实现** (不推荐):
```javascript
// 所有逻辑混在一起
app.post('/chat', async (req, res) => {
  const response = await fetch('https://api.deepseek.com/chat', {
    method: 'POST',
    body: JSON.stringify(req.body)
  })
  const data = await response.json()

  if (data.tool_calls && data.tool_calls.length > 0) {
    if (data.tool_calls[0].function.name === 'getTime') {
      const result = getTime()
      // ... 继续处理
    }
  }
  res.json(data)
})
```

**AI-backend 实现** (推荐):
```javascript
// 清晰的职责分离
Controller → Validator → Service → Adapter → Executor
     ↓           ↓          ↓          ↓         ↓
  HTTP请求    参数验证   业务编排   Provider  函数执行
```

---

## 六、学习检查清单

### 第一层:流程理解

- [ ] 理解 AI-backend 的完整调用链路
- [ ] 知道 tool_calls 在哪个环节返回
- [ ] 理解为什么需要两次 AI 调用
- [ ] 知道如何将函数结果返回给 AI

### 第二层:代码实现

- [ ] 实现了 FunctionExecutor 类
- [ ] 在 Controller 中添加了 tool_calls 处理
- [ ] 更新了 Validator 支持 tools 参数
- [ ] 在应用启动时注册了函数

### 第三层:测试验证

- [ ] 成功调用 getTime 函数
- [ ] 成功调用 sum 函数
- [ ] 测试了多函数场景
- [ ] 测试了错误处理

---

## 七、下一步

完成本节后,你已经实现了完整的函数调用流程。接下来:

1. **Step 32**: 深入调试 arguments 的 JSON 解析
2. **Step 33**: 使用 Joi/Zod 增强参数验证
3. **Step 34**: 构建完整的天气查询 API
4. **Step 35**: 总结企业级最佳实践

---

**记住: AI-backend 的架构让 Function Calling 的集成变得清晰和可维护。每一层都有明确的职责,便于扩展和测试。**
