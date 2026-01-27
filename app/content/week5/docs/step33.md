# Step 33: Function Calling｜多层验证策略 - Joi 与 Zod

## 学习目标

这个任务的本质是回答一个核心问题:**如何在企业级应用中实现多层次的参数验证,确保从 HTTP 请求到函数执行的全链路类型安全**。

通过本教程,你将:

1. 理解 AI-backend 的多层验证架构
2. 掌握 Joi 在 HTTP 层的验证实践
3. 学习 Zod 在函数层的类型安全
4. 实现三层防御体系:HTTP → Function → Schema

> **实战项目**: 本教程基于 AI-backend 的实际验证架构,展示生产级的验证策略。

---

## 一、AI-backend 的多层验证架构

### 1.1 为什么需要多层验证?

```
┌─────────────────────────────────────────────────────────────┐
│       AI-backend 的三层验证防御体系                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Layer 1: HTTP 层验证 (Joi)                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Controller → Validator (chatValidator.js)     │       │
│   │  目标: 验证 HTTP 请求的结构和基本类型              │       │
│   │  工具: Joi                                      │       │
│   │                                                 │       │
│   │  const chatRequestSchema = Joi.object({        │       │
│   │    messages: Joi.array().items(messageSchema)  │       │
│   │      .min(1).max(50).required(),               │       │
│   │    provider: Joi.string()                      │       │
│   │      .valid('deepseek','openai').optional(),   │       │
│   │    functions: Joi.array()                      │       │
│   │      .items(functionSchema).optional()         │       │
│   │  })                                            │       │
│   │                                                 │       │
│   │  防御:                                          │       │
│   │  • 恶意请求体(超长、格式错误)                    │       │
│   │  • 无效的 provider 参数                         │       │
│   │  • 超出限制的 messages 数量                     │       │
│   └─────────────────────────────────────────────────┘       │
│         ↓ 通过验证后                                         │
│   Layer 2: 业务逻辑验证                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Service → Function Executor                   │       │
│   │  目标: 验证业务规则和函数参数                     │       │
│   │                                                 │       │
│   │  防御:                                          │       │
│   │  • 函数名不存在                                  │       │
│   │  • arguments 不是有效 JSON                      │       │
│   │  • 业务规则冲突                                  │       │
│   └─────────────────────────────────────────────────┘       │
│         ↓ 通过验证后                                         │
│   Layer 3: 函数层验证 (Zod)                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Functions (getTime.js, sum.js)                │       │
│   │  目标: 严格的类型检查和值约束                     │       │
│   │  工具: 手动验证 或 Zod                           │       │
│   │                                                 │       │
│   │  const SumParamsSchema = z.object({            │       │
│   │    a: z.number(),                              │       │
│   │    b: z.number()                               │       │
│   │  })                                            │       │
│   │                                                 │       │
│   │  防御:                                          │       │
│   │  • AI 传递的类型错误("10" vs 10)                │       │
│   │  • 值超出有效范围                                │       │
│   │  • 业务逻辑约束(如负数、NaN)                     │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   为什么需要三层?                                            │
│   • Layer 1 快速拦截恶意请求,保护服务器                      │
│   • Layer 2 确保业务逻辑正确                                 │
│   • Layer 3 保证函数内部类型安全,防止 AI 传错参数            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Joi vs Zod: 选择合适的工具

| 维度 | Joi | Zod | AI-backend 的选择 |
|------|-----|-----|------------------|
| **使用场景** | HTTP 请求验证 | 函数参数/返回值验证 | Joi 在 HTTP 层,Zod 在函数层 |
| **类型推断** | 不支持 TypeScript 推断 | 原生支持 `z.infer<>` | Zod 更适合 TypeScript 项目 |
| **错误信息** | 详细,适合返回给客户端 | 简洁,适合内部验证 | Joi 错误给用户,Zod 错误记日志 |
| **性能** | 稍慢 | 更快 | 关键路径用 Zod |
| **生态** | Express 生态成熟 | 新兴,社区活跃 | 两者结合使用 |

---

## 二、Layer 1: HTTP 层的 Joi 验证

### 2.1 AI-backend 的实际实现

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/src/validators/chatValidator.js`

```javascript
import Joi from 'joi'
import { BadRequestError } from '../errors/index.js'

// 消息 Schema
const messageSchema = Joi.object({
  role: Joi.string().valid('system', 'user', 'assistant', 'function').required(),
  content: Joi.string().max(10000).allow(null),
  name: Joi.string().optional(),        // function role 需要
  function_call: Joi.object().optional(), // assistant 带函数调用时
})

// Function Schema (用于验证 functions 参数)
const functionSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().required(),
  parameters: Joi.object().required(),
})

// 聊天请求 Schema
const chatRequestSchema = Joi.object({
  messages: Joi.array().items(messageSchema).min(1).max(50).required(),
  provider: Joi.string().valid('deepseek', 'openai', 'claude').optional(),
  model: Joi.string().optional(),
  temperature: Joi.number().min(0).max(2).optional(),
  maxTokens: Joi.number().min(1).max(8000).optional(),
  functions: Joi.array().items(functionSchema).optional(), // ← 支持 Function Calling
})

export function validateChatRequest(data) {
  const { error, value } = chatRequestSchema.validate(data, {
    abortEarly: false, // 返回所有错误,不只是第一个
  })

  if (error) {
    // 格式化错误信息
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message,
    }))
    throw new BadRequestError('Validation failed', errors)
  }

  return value
}
```

### 2.2 在 Controller 中使用

**文件路径**: `/Users/jianglin/Desktop/backend/AI-backend/src/controllers/chat.controller.js`

```javascript
import aiService from '../services/ai.service.js'
import functionExecutor from '../utils/functionExecutor.js'
import { success } from '../utils/response.js'
import { validateChatRequest } from '../validators/chatValidator.js'
import logger from '../utils/logger.js'

class ChatController {
  async chat(req, res) {
    // Layer 1: HTTP 层验证
    const validatedData = validateChatRequest(req.body)

    logger.info('Chat request validated', {
      provider: validatedData.provider,
      messageCount: validatedData.messages.length,
      hasFunctions: !!validatedData.functions,
    })

    const messages = [...validatedData.messages]

    // 调用 AI Service
    let result = await aiService.chat(messages, {
      provider: validatedData.provider,
      model: validatedData.model,
      temperature: validatedData.temperature,
      max_tokens: validatedData.maxTokens,
      functions: validatedData.functions, // ← 通过验证的 functions
    })

    // 检查是否需要调用函数
    if (result.function_call) {
      // Layer 2 & 3 验证在这里进行
      // (详见后续章节)
    }

    return res.json(success(result))
  }
}

export default new ChatController()
```

### 2.3 Joi 验证的优势

```
┌─────────────────────────────────────────────────────────────┐
│           Joi 在 HTTP 层的作用                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 统一的错误格式                                          │
│      {                                                     │
│        "status": "error",                                  │
│        "message": "Validation failed",                     │
│        "errors": [                                         │
│          { "field": "messages", "message": "..." }         │
│        ]                                                   │
│      }                                                     │
│                                                             │
│   2. 自动类型转换                                            │
│      temperature: "0.7" → 0.7 (字符串转数字)                │
│                                                             │
│   3. 清晰的约束定义                                          │
│      .min(1).max(50)  ← 一看就懂                            │
│      .valid('deepseek', 'openai')                          │
│                                                             │
│   4. 完整的错误收集                                          │
│      abortEarly: false  ← 返回所有错误,不只是第一个          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、Layer 3: 函数层的 Zod 验证

### 3.1 为什么需要 Zod?

AI-backend 目前在函数层使用手动验证:

```javascript
// functions/sum.js (现有实现)
export function sum(a, b) {
  // 手动验证
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('参数必须是数字类型')
  }

  if (isNaN(a) || isNaN(b)) {
    throw new Error('参数不能是 NaN')
  }

  return a + b
}
```

**问题**:
- 代码冗长,重复性高
- 没有类型推断支持
- 错误信息不统一
- 难以维护复杂验证规则

**Zod 解决方案**:

```javascript
// functions/sum.zod.js (推荐)
import { z } from 'zod'

// 定义参数 Schema
export const SumParamsSchema = z.object({
  a: z.number().describe('第一个加数'),
  b: z.number().describe('第二个加数'),
})

// 定义返回值 Schema (可选但推荐)
export const SumResultSchema = z.number()

export function sum(params) {
  // 一行完成验证
  const { a, b } = SumParamsSchema.parse(params)

  const result = a + b

  // 验证返回值 (确保函数内部逻辑正确)
  return SumResultSchema.parse(result)
}
```

### 3.2 Zod 快速入门

```javascript
import { z } from 'zod'

// ========== 基础类型 ==========
z.string()       // 字符串
z.number()       // 数字
z.boolean()      // 布尔值
z.array(z.string())  // 字符串数组

// ========== 字符串验证 ==========
z.string().min(3).max(10)     // 长度限制
z.string().email()            // 邮箱
z.string().url()              // URL
z.string().regex(/^\d+$/)     // 正则

// ========== 数字验证 ==========
z.number().min(0).max(100)    // 范围
z.number().int()              // 整数
z.number().positive()         // 正数

// ========== 对象验证 ==========
const UserSchema = z.object({
  name: z.string(),
  age: z.number().optional(),  // 可选
  email: z.string().nullable(), // 可为 null
})

// ========== 枚举 ==========
z.enum(['pending', 'success', 'error'])

// ========== 默认值 ==========
z.string().default('default value')
z.number().default(0)

// ========== 使用 ==========
const data = { name: 'Alice', age: 25 }
const result = UserSchema.parse(data)  // 验证并返回
```

### 3.3 改造 AI-backend 函数

创建 `functions/getTime.zod.js`:

```javascript
import { z } from 'zod'

// 参数 Schema
export const GetTimeParamsSchema = z.object({
  timezone: z
    .enum(['UTC', 'Asia/Shanghai', 'America/New_York'])
    .default('Asia/Shanghai')
    .describe('时区标识符'),
})

// 返回值 Schema
export const GetTimeResultSchema = z.string()

export function getTime(params = {}) {
  // 验证参数 (使用 .catch 提供默认值)
  const validatedParams = GetTimeParamsSchema.catch({
    timezone: 'Asia/Shanghai',
  }).parse(params)

  const { timezone } = validatedParams

  try {
    const now = new Date()
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }

    const formatter = new Intl.DateTimeFormat('zh-CN', options)
    const formattedTime = formatter.format(now)

    const result = `当前时间 (${timezone}): ${formattedTime}`

    // 验证返回值
    return GetTimeResultSchema.parse(result)
  } catch (error) {
    throw new Error(`获取时间失败: ${error.message}`)
  }
}

// 测试
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(getTime({ timezone: 'Asia/Shanghai' }))
  console.log(getTime({ timezone: 'UTC' }))

  // 测试类型错误
  try {
    getTime({ timezone: 'Invalid/Timezone' })
  } catch (error) {
    console.log('错误捕获:', error.message)
  }
}
```

---

## 四、集成到 AI-backend 架构

### 4.1 扩展 FunctionExecutor 支持 Zod

创建 `src/utils/functionExecutor.zod.js`:

```javascript
import logger from './logger.js'
import { BadRequestError } from '../errors/index.js'
import { ZodError } from 'zod'

/**
 * 支持 Zod 验证的函数执行器
 */
export class ZodFunctionExecutor {
  constructor() {
    // functions = Map<functionName, { fn, paramsSchema, resultSchema }>
    this.functions = new Map()
  }

  /**
   * 注册函数 (带 Zod Schema)
   * @param {string} name - 函数名
   * @param {Object} config - { fn, paramsSchema, resultSchema }
   */
  register(name, config) {
    const { fn, paramsSchema, resultSchema } = config

    if (typeof fn !== 'function') {
      throw new Error(`${name} must be a function`)
    }

    this.functions.set(name, { fn, paramsSchema, resultSchema })
    logger.info(`Registered Zod function: ${name}`)
  }

  /**
   * 执行函数 (带完整验证)
   * @param {string} name - 函数名
   * @param {string} argumentsJson - JSON 字符串
   * @returns {any} 函数执行结果
   */
  execute(name, argumentsJson) {
    // 1. 检查函数是否存在
    if (!this.functions.has(name)) {
      throw new BadRequestError(`Function ${name} not found`)
    }

    const { fn, paramsSchema, resultSchema } = this.functions.get(name)

    // 2. 解析 JSON
    let args
    try {
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

    // 3. Zod 验证参数
    try {
      const validatedArgs = paramsSchema.parse(args)
      logger.debug(`Function ${name} params validated`, { args: validatedArgs })

      // 4. 执行函数
      const result = fn(validatedArgs)
      logger.info(`Function ${name} executed successfully`)

      // 5. 验证返回值 (可选)
      if (resultSchema) {
        const validatedResult = resultSchema.parse(result)
        logger.debug(`Function ${name} result validated`)
        return validatedResult
      }

      return result

    } catch (error) {
      if (error instanceof ZodError) {
        // Zod 验证错误
        const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
        logger.error(`Zod validation failed for ${name}`, { errors: messages })
        throw new BadRequestError(`参数验证失败: ${messages.join('; ')}`)
      }

      // 其他错误
      logger.error(`Function ${name} execution failed`, {
        error: error.message,
        args,
      })
      throw new Error(`Function execution failed: ${error.message}`)
    }
  }

  list() {
    return Array.from(this.functions.keys())
  }
}

export default new ZodFunctionExecutor()
```

### 4.2 注册 Zod 函数

创建 `src/config/functions.zod.js`:

```javascript
import functionExecutor from '../utils/functionExecutor.zod.js'
import { getTime, GetTimeParamsSchema, GetTimeResultSchema } from '../../functions/getTime.zod.js'
import { sum, SumParamsSchema, SumResultSchema } from '../../functions/sum.zod.js'

export function initZodFunctions() {
  // 注册带 Zod Schema 的函数
  functionExecutor.register('getTime', {
    fn: getTime,
    paramsSchema: GetTimeParamsSchema,
    resultSchema: GetTimeResultSchema,
  })

  functionExecutor.register('sum', {
    fn: sum,
    paramsSchema: SumParamsSchema,
    resultSchema: SumResultSchema,
  })

  console.log(`Registered Zod functions: ${functionExecutor.list().join(', ')}`)
}
```

### 4.3 完整流程示例

```
┌─────────────────────────────────────────────────────────────┐
│     AI-backend 三层验证的完整请求流程                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 用户请求                                                │
│      POST /api/chat                                         │
│      {                                                      │
│        messages: [{ role: "user", content: "10+20=?" }],   │
│        functions: [sumSchema]                              │
│      }                                                      │
│      ↓                                                      │
│   2. Layer 1: Joi 验证 (chatValidator.js)                   │
│      ✓ messages 数组长度 1-50                                │
│      ✓ functions 格式正确                                    │
│      ✓ provider 有效                                        │
│      ↓                                                      │
│   3. Controller → Service → Adapter                         │
│      AI 返回: { function_call: { name: "sum", args: ... } }│
│      ↓                                                      │
│   4. Layer 2: JSON 解析 (parseArguments)                    │
│      arguments: '{"a":10,"b":20}'                          │
│      → { a: 10, b: 20 }                                    │
│      ↓                                                      │
│   5. Layer 3: Zod 验证 (SumParamsSchema)                    │
│      ✓ a 是 number 类型                                     │
│      ✓ b 是 number 类型                                     │
│      ↓                                                      │
│   6. 执行函数                                                │
│      sum({ a: 10, b: 20 }) → 30                            │
│      ↓                                                      │
│   7. 验证返回值 (SumResultSchema)                            │
│      ✓ 结果是 number 类型                                    │
│      ↓                                                      │
│   8. 返回给 AI,生成最终回复                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、Zod 高级用法

### 5.1 自定义验证逻辑

```javascript
import { z } from 'zod'

// 确保两个数都是正数
const PositiveSumSchema = z
  .object({
    a: z.number(),
    b: z.number(),
  })
  .refine(
    data => data.a > 0 && data.b > 0,
    {
      message: '两个数必须都是正数',
    }
  )

// 测试
try {
  PositiveSumSchema.parse({ a: -5, b: 10 })
} catch (error) {
  console.log(error.errors[0].message)  // "两个数必须都是正数"
}
```

### 5.2 数据转换

```javascript
// 自动转换字符串为数字 (容错处理)
const FlexibleSumSchema = z.object({
  a: z.string().transform(val => Number(val)),
  b: z.string().transform(val => Number(val)),
})

const result = FlexibleSumSchema.parse({ a: '10', b: '20' })
console.log(result)  // { a: 10, b: 20 }
```

### 5.3 条件验证

```javascript
const TemperatureSchema = z.object({
  type: z.enum(['celsius', 'fahrenheit']),
  value: z.number(),
}).refine(
  data => {
    if (data.type === 'celsius') {
      return data.value >= -273.15  // 绝对零度
    }
    return data.value >= -459.67  // 华氏度绝对零度
  },
  {
    message: '温度值低于绝对零度',
  }
)
```

---

## 六、测试多层验证

创建测试文件 `test-multi-layer-validation.http`:

```http
### 测试 1: 正常请求 (通过所有验证层)
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "帮我算 10 + 20" }
  ],
  "functions": [
    {
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
  ]
}

### 测试 2: Layer 1 验证失败 (messages 超过限制)
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    // ... 51 条消息 (超过 max 50)
  ],
  "functions": []
}

### 测试 3: Layer 2 验证失败 (无效 JSON)
# AI 返回的 arguments 格式错误

### 测试 4: Layer 3 验证失败 (Zod 类型错误)
# AI 传递: { a: "hello", b: 20 }
```

---

## 七、学习检查清单

### 第一层:架构理解

- [ ] 理解三层验证的必要性
- [ ] 知道 Joi 和 Zod 的职责分工
- [ ] 理解每一层防御什么问题

### 第二层:工具掌握

- [ ] 掌握 Joi 的基本用法
- [ ] 掌握 Zod 的基本用法
- [ ] 能够编写验证 Schema
- [ ] 能够处理验证错误

### 第三层:实践能力

- [ ] 在 AI-backend 中实现了 Joi 验证
- [ ] 改造了函数支持 Zod 验证
- [ ] 扩展了 FunctionExecutor
- [ ] 测试了完整的验证流程

---

## 八、常见问题

### Q1: Zod 会影响性能吗?

**答**: 会有轻微影响,但换来的是类型安全:

- **开发环境**: 完全值得,帮助快速发现错误
- **生产环境**: 影响很小 (毫秒级),可以通过缓存 Schema 优化
- **AI-backend 实践**: 在函数执行前验证,性能损耗可忽略

### Q2: 必须同时使用 Joi 和 Zod 吗?

**答**: 不是必须,但推荐:

- **小项目**: 只用 Joi 或 Zod 之一即可
- **中大项目**: 两者结合,各司其职
- **AI-backend**: Joi (HTTP) + Zod (函数) 是最佳实践

### Q3: 如何选择验证工具?

**答**: 看场景:

| 场景 | 推荐工具 | 原因 |
|------|----------|------|
| HTTP API 请求验证 | Joi | 错误信息友好,Express 生态成熟 |
| 函数参数验证 | Zod | 类型推断,性能更好 |
| TypeScript 项目 | Zod | 原生支持类型推断 |
| 复杂业务规则 | 两者结合 | 发挥各自优势 |

---

## 九、下一步

完成本节后,你已经掌握了企业级的多层验证策略。接下来:

1. **Step 34**: 构建完整的天气查询 Demo,应用所有验证技巧
2. **Step 35**: 总结企业级最佳实践

---

**记住: 多层验证不是重复,而是不同层次的防御。HTTP 层快速拦截恶意请求,函数层确保类型安全,Schema 层指导 AI 正确调用。**
