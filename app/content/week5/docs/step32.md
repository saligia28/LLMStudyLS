# Step 32: Function Calling｜调试 arguments 的 JSON 解析与错误处理

## 学习目标

这个任务的本质是回答一个核心问题:**如何在企业级应用中安全地解析和处理 AI 返回的函数参数,并结合完善的错误处理体系**。

通过本教程,你将:

1. 理解 arguments 字段的数据格式和常见陷阱
2. 学习 AI-backend 的错误处理架构
3. 掌握安全的 JSON 解析方法和边界情况处理
4. 实现生产级的参数解析和错误恢复机制

> **实战重点**: 结合 AI-backend 的 ApiError 体系,实现健壮的参数处理。

---

## 一、arguments 的真实面目

### 1.1 AI 返回的数据格式

```
┌─────────────────────────────────────────────────────────────┐
│         AI 返回的 tool_calls 格式                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   {                                                         │
│     role: "assistant",                                      │
│     content: null,                                          │
│     tool_calls: [{              // ← 新版：tool_calls 数组   │
│       id: "call_abc123",        // ← 唯一 ID，返回时必须带上  │
│       type: "function",                                     │
│       function: {                                           │
│         name: "sum",            // ← 函数名(字符串)          │
│         arguments: "{\"a\":10,\"b\":20}"  // ← JSON 字符串! │
│       }                                                     │
│     }]                                                      │
│   }                                                         │
│                                                             │
│   关键理解:                                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  arguments 是 JSON 字符串,不是对象!              │       │
│   │                                                 │       │
│   │  ✗ 错误: tool_calls[0].function.arguments.a     │       │
│   │  ✓ 正确:                                        │       │
│   │    JSON.parse(tool_calls[0].function.arguments) │       │
│   │    .a  → 10                                     │       │
│   │                                                 │       │
│   │  AI-backend 在哪里解析?                          │       │
│   │  → FunctionExecutor.execute() 方法中             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 常见的解析陷阱

```javascript
// ❌ 陷阱 1: 仍用旧的 function_call 字段
const functionCall = assistantMessage.function_call  // undefined！新版没有这个字段

// ❌ 陷阱 2: 忘记取数组第一项
const toolCall = assistantMessage.tool_calls        // 取到的是数组
const a = toolCall.function.arguments.a             // TypeError！数组没有 function 属性

// ❌ 陷阱 3: 直接当对象使用
const toolCall = assistantMessage.tool_calls[0]
const a = toolCall.function.arguments.a  // undefined! (字符串没有 a 属性)

// ❌ 陷阱 4: 无错误处理的解析
const args = JSON.parse(toolCall.function.arguments)  // 可能抛异常

// ✓ AI-backend 的正确做法
const toolCall = assistantMessage.tool_calls[0]  // 取第一个工具调用
try {
  const rawArgs = toolCall.function.arguments
  const args = typeof rawArgs === 'string'
    ? JSON.parse(rawArgs)
    : rawArgs  // 容错：某些情况下已是对象

  const result = sum(args.a, args.b)
} catch (error) {
  // 使用 AI-backend 的错误体系
  logger.error('参数解析失败', { error, arguments: toolCall.function.arguments })
  throw new BadRequestError(`Invalid arguments: ${error.message}`)
}
```

---

## 二、AI-backend 的错误处理架构

### 2.1 错误类层次结构

```
┌─────────────────────────────────────────────────────────────┐
│         AI-backend 错误类继承体系                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ApiError (基类)                                            │
│   ├── statusCode: HTTP 状态码                                │
│   ├── errorCode: 自定义错误码                                │
│   └── isOperational: 是否可预测                              │
│       ↓                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  BadRequestError (400)                         │       │
│   │  - 用于参数验证失败                              │       │
│   │  - 用于 JSON 解析错误                           │       │
│   └─────────────────────────────────────────────────┘       │
│       ↓                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  AIServiceError (500)                          │       │
│   │  - 用于 AI Provider 调用失败                     │       │
│   │  - 包含 provider 信息                           │       │
│   └─────────────────────────────────────────────────┘       │
│       ↓                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  InternalServerError (500)                     │       │
│   │  - 用于未预期的系统错误                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 AI-backend 的错误处理文件

**文件**: `src/errors/ApiError.js`
```javascript
class ApiError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message)
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.errorCode = errorCode
    this.isOperational = true  // 可预测的错误
    Error.captureStackTrace(this, this.constructor)
  }
}

export default ApiError
```

**文件**: `src/errors/BadRequestError.js`
```javascript
import ApiError from './ApiError.js'

class BadRequestError extends ApiError {
  constructor(message, details = null) {
    super(message, 400, 'BAD_REQUEST')
    this.details = details
  }
}

export default BadRequestError
```

---

## 三、在 FunctionExecutor 中实现安全解析

### 3.1 增强 FunctionExecutor (基于 Step 31)

**文件**: `src/utils/functionExecutor.js`

```javascript
import logger from './logger.js'
import { BadRequestError } from '../errors/index.js'

export class FunctionExecutor {
  constructor() {
    this.functions = new Map()
  }

  register(name, fn) {
    if (typeof fn !== 'function') {
      throw new Error(`${name} must be a function`)
    }
    this.functions.set(name, fn)
    logger.info(`Registered function: ${name}`)
  }

  /**
   * 安全解析 arguments
   * @param {string|object} argumentsJson - JSON 字符串或对象
   * @returns {Object} 解析后的参数对象
   */
  parseArguments(argumentsJson) {
    // 1. 类型检查和容错
    if (argumentsJson === null || argumentsJson === undefined) {
      logger.debug('Arguments is null/undefined, treating as empty object')
      return {}
    }

    // 2. 如果已经是对象,直接返回 (容错处理)
    if (typeof argumentsJson === 'object') {
      logger.debug('Arguments is already an object')
      return argumentsJson
    }

    // 3. 如果是字符串,进行 JSON 解析
    if (typeof argumentsJson === 'string') {
      // 空字符串处理
      if (argumentsJson.trim() === '') {
        return {}
      }

      // JSON 解析 + 错误处理
      try {
        const parsed = JSON.parse(argumentsJson)

        // 验证解析结果是对象
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error('Parsed result must be an object')
        }

        return parsed
      } catch (error) {
        logger.error('Failed to parse arguments', {
          arguments: argumentsJson,
          error: error.message,
        })

        // 抛出 AI-backend 的标准错误
        throw new BadRequestError(
          `Invalid JSON in arguments: ${error.message}`,
          { originalArguments: argumentsJson }
        )
      }
    }

    // 4. 其他类型,抛出错误
    throw new BadRequestError(
      `Invalid arguments type: ${typeof argumentsJson}. Expected string or object.`
    )
  }

  /**
   * 执行函数 (增强版)
   * @param {string} name - 函数名
   * @param {string|object} argumentsJson - JSON 字符串或对象
   * @returns {any} 函数执行结果
   */
  execute(name, argumentsJson) {
    // 1. 检查函数是否存在
    if (!this.functions.has(name)) {
      logger.error(`Function ${name} not found`, {
        availableFunctions: Array.from(this.functions.keys())
      })
      throw new BadRequestError(`Function ${name} not found`)
    }

    // 2. 解析参数 (使用安全解析器)
    let args
    try {
      args = this.parseArguments(argumentsJson)
      logger.debug(`Parsed arguments for ${name}`, { args })
    } catch (error) {
      // parseArguments 已经抛出 BadRequestError,直接向上传递
      throw error
    }

    // 3. 执行函数
    try {
      const fn = this.functions.get(name)
      logger.info(`Executing function: ${name}`, { args })

      const startTime = Date.now()
      const result = fn(args)
      const duration = Date.now() - startTime

      logger.info(`Function ${name} executed successfully`, {
        duration,
        hasResult: !!result
      })

      return result
    } catch (error) {
      logger.error(`Function ${name} execution failed`, {
        error: error.message,
        args,
        stack: error.stack
      })

      // 包装函数执行错误
      throw new Error(`Function execution failed: ${error.message}`)
    }
  }

  list() {
    return Array.from(this.functions.keys())
  }
}

export default new FunctionExecutor()
```

### 3.2 解析逻辑详解

```
┌─────────────────────────────────────────────────────────────┐
│         parseArguments 处理流程                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   输入: argumentsJson                                        │
│      ↓                                                      │
│   【检查 1】null/undefined?                                  │
│      Yes → 返回 {}                                          │
│      No  → 继续                                             │
│      ↓                                                      │
│   【检查 2】已是对象?                                         │
│      Yes → 直接返回 (容错)                                   │
│      No  → 继续                                             │
│      ↓                                                      │
│   【检查 3】是字符串?                                         │
│      Yes → JSON.parse() + try-catch                        │
│          → 检查结果是对象                                    │
│          → 返回解析结果                                      │
│      No  → 抛出 BadRequestError                             │
│                                                             │
│   关键设计:                                                  │
│   - 多层防御,逐步验证                                        │
│   - 容错处理,兼容不规范输入                                  │
│   - 详细日志,便于调试                                        │
│   - 标准错误,统一异常类型                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、错误情况的测试与处理

### 4.1 测试用例

创建 `test/functionExecutor.test.js`:

```javascript
import functionExecutor from '../src/utils/functionExecutor.js'
import { sum } from '../functions/sum.js'
import { getTime } from '../functions/getTime.js'

// 注册函数
functionExecutor.register('sum', (args) => sum(args.a, args.b))
functionExecutor.register('getTime', (args) => getTime(args.timezone))

console.log('=== 测试 1: 正常 JSON 字符串 ===')
try {
  const result = functionExecutor.execute('sum', '{"a":10,"b":20}')
  console.log('✓ 成功:', result)  // 30
} catch (error) {
  console.log('✗ 失败:', error.message)
}

console.log('\n=== 测试 2: 空对象 JSON ===')
try {
  const result = functionExecutor.execute('getTime', '{}')
  console.log('✓ 成功:', result)
} catch (error) {
  console.log('✗ 失败:', error.message)
}

console.log('\n=== 测试 3: 已经是对象 (容错) ===')
try {
  const result = functionExecutor.execute('sum', { a: 5, b: 15 })
  console.log('✓ 成功:', result)  // 20
} catch (error) {
  console.log('✗ 失败:', error.message)
}

console.log('\n=== 测试 4: 无效 JSON (应该报错) ===')
try {
  const result = functionExecutor.execute('sum', '{a:10,b:20}')  // 缺引号
  console.log('✗ 不应该成功')
} catch (error) {
  console.log('✓ 正确捕获错误:', error.message)
}

console.log('\n=== 测试 5: 空字符串 ===')
try {
  const result = functionExecutor.execute('getTime', '')
  console.log('✓ 成功:', result)
} catch (error) {
  console.log('✗ 失败:', error.message)
}

console.log('\n=== 测试 6: null 参数 ===')
try {
  const result = functionExecutor.execute('getTime', null)
  console.log('✓ 成功:', result)
} catch (error) {
  console.log('✗ 失败:', error.message)
}

console.log('\n=== 测试 7: 函数不存在 (应该报错) ===')
try {
  const result = functionExecutor.execute('unknownFunc', '{}')
  console.log('✗ 不应该成功')
} catch (error) {
  console.log('✓ 正确捕获错误:', error.message)
}

console.log('\n=== 测试 8: 特殊字符 JSON ===')
try {
  const result = functionExecutor.execute('getTime', '{"timezone":"Asia/Shanghai"}')
  console.log('✓ 成功:', result)
} catch (error) {
  console.log('✗ 失败:', error.message)
}
```

### 4.2 运行测试

```bash
cd /Users/jianglin/Desktop/backend/AI-backend
node test/functionExecutor.test.js
```

### 4.3 预期输出

```
=== 测试 1: 正常 JSON 字符串 ===
✓ 成功: 30

=== 测试 2: 空对象 JSON ===
✓ 成功: 当前时间 (Asia/Shanghai): 2024-01-27 15:30:45

=== 测试 3: 已经是对象 (容错) ===
✓ 成功: 20

=== 测试 4: 无效 JSON (应该报错) ===
✓ 正确捕获错误: Invalid JSON in arguments: Unexpected token a in JSON at position 1

=== 测试 5: 空字符串 ===
✓ 成功: 当前时间 (Asia/Shanghai): 2024-01-27 15:30:45

=== 测试 6: null 参数 ===
✓ 成功: 当前时间 (Asia/Shanghai): 2024-01-27 15:30:45

=== 测试 7: 函数不存在 (应该报错) ===
✓ 正确捕获错误: Function unknownFunc not found

=== 测试 8: 特殊字符 JSON ===
✓ 成功: 当前时间 (Asia/Shanghai): 2024-01-27 15:30:45
```

---

## 五、在 Controller 中集成错误处理

### 5.1 ChatController 的完整错误处理

**文件**: `src/controllers/chat.controller.js`

```javascript
import aiService from '../services/ai.service.js'
import functionExecutor from '../utils/functionExecutor.js'
import { success } from '../utils/response.js'
import { validateChatRequest } from '../validators/chatValidator.js'
import logger from '../utils/logger.js'
import { BadRequestError } from '../errors/index.js'

class ChatController {
  async chat(req, res) {
    const validatedData = validateChatRequest(req.body)
    const messages = [...validatedData.messages]

    // 第一次 AI 调用
    let result = await aiService.chat(messages, {
      provider: validatedData.provider,
      model: validatedData.model,
      temperature: validatedData.temperature,
      max_tokens: validatedData.maxTokens,
      functions: validatedData.functions,
    })

    // 检查是否需要调用函数（新版：检查 tool_calls 数组）
    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0]
      const name = toolCall.function.name
      const args = toolCall.function.arguments

      logger.info('AI requested tool call', {
        name,
        arguments: args,
        toolCallId: toolCall.id,
        requestId: req.requestId
      })

      try {
        // ========== 关键:使用增强的 execute 方法 ==========
        // 内部会调用 parseArguments 安全解析
        const functionResult = functionExecutor.execute(name, args)

        logger.info('Function executed successfully', {
          name,
          result: functionResult,
          requestId: req.requestId
        })

        // 添加 assistant 消息（必须保留 tool_calls 原始数组）
        messages.push({
          role: 'assistant',
          content: null,
          tool_calls: result.tool_calls,
        })

        // 添加 tool 消息（必须带 tool_call_id！）
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,  // ← 关键：与上方 tool_calls[0].id 对应
          content: typeof functionResult === 'string'
            ? functionResult
            : JSON.stringify(functionResult),
        })

        // 第二次 AI 调用
        result = await aiService.chat(messages, {
          provider: validatedData.provider,
          model: validatedData.model,
          temperature: validatedData.temperature,
          max_tokens: validatedData.maxTokens,
        })

      } catch (error) {
        // ========== 错误分类处理 ==========

        if (error instanceof BadRequestError) {
          // 参数解析错误
          logger.error('Tool call failed due to invalid arguments', {
            name,
            arguments: args,
            error: error.message,
            requestId: req.requestId
          })

          // 让 AI 生成用户友好的错误回复
          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: result.tool_calls,
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: 'invalid_arguments',
              message: '参数格式错误,请检查输入'
            })
          })

        } else {
          // 函数执行错误
          logger.error('Function execution error', {
            name,
            error: error.message,
            requestId: req.requestId
          })

          messages.push({
            role: 'assistant',
            content: null,
            tool_calls: result.tool_calls,
          })
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              error: 'execution_failed',
              message: error.message
            })
          })
        }

        // 让 AI 基于错误信息生成回复
        result = await aiService.chat(messages, {
          provider: validatedData.provider,
          model: validatedData.model,
        })
      }
    }

    return res.json(success(result))
  }

  // ... 其他方法
}

export default new ChatController()
```

---

## 六、边界情况汇总

### 6.1 需要处理的所有情况

```
┌─────────────────────────────────────────────────────────────┐
│         arguments 可能出现的各种情况                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ✓ 正常情况                                                │
│   1. '{"a":10,"b":20}'          → 标准 JSON 字符串          │
│   2. '{}'                        → 空对象                   │
│   3. '{"timezone":"UTC"}'        → 包含字符串值              │
│   4. '{"list":[1,2,3]}'          → 包含数组                 │
│                                                             │
│   ⚠ 边界情况                                                │
│   5. ''                          → 空字符串 (返回 {})        │
│   6. null                        → null (返回 {})           │
│   7. undefined                   → undefined (返回 {})      │
│   8. {a:10,b:20}                 → 已是对象 (直接返回)       │
│                                                             │
│   ✗ 错误情况                                                │
│   9. '{a:10,b:20}'               → 无效 JSON (缺引号)        │
│   10. '{"a":10,"b":}'            → 无效 JSON (值缺失)        │
│   11. '[1,2,3]'                  → 数组,不是对象             │
│   12. 123                        → 数字类型                  │
│   13. true                       → 布尔类型                  │
│                                                             │
│   AI-backend 的处理策略:                                     │
│   - 正常情况: JSON.parse() 解析                              │
│   - 边界情况: 容错处理,返回默认值                            │
│   - 错误情况: 抛出 BadRequestError,记录日志                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、日志记录策略

### 7.1 AI-backend 的日志级别

```javascript
// DEBUG: 详细的解析过程
logger.debug('Parsing arguments', {
  argumentsJson,
  type: typeof argumentsJson
})

// INFO: 成功执行
logger.info('Function executed successfully', {
  name,
  duration,
  hasResult: !!result
})

// ERROR: 解析或执行失败
logger.error('Failed to parse arguments', {
  arguments: argumentsJson,
  error: error.message,
  stack: error.stack,
  requestId  // ← 关联请求
})
```

### 7.2 错误追踪的完整链路

```
Request → requestId (UUID)
    ↓
Controller → 记录 tool_calls + requestId
    ↓
FunctionExecutor.parseArguments → 记录解析失败 + requestId
    ↓
FunctionExecutor.execute → 记录执行失败 + requestId
    ↓
Global ErrorHandler → 返回错误给用户 + requestId

用户可以用 requestId 查询完整日志:
grep "abc-123-def" logs/app-*.log
```

---

## 八、学习检查清单

### 第一层:概念理解

- [ ] 理解 arguments 是 JSON 字符串
- [ ] 知道为什么需要 JSON.parse()
- [ ] 理解 AI-backend 的错误类体系
- [ ] 知道 BadRequestError 的使用场景

### 第二层:代码实现

- [ ] 实现了 parseArguments 方法
- [ ] 添加了各种边界情况处理
- [ ] 集成了 AI-backend 的错误类
- [ ] 实现了详细的日志记录

### 第三层:测试验证

- [ ] 测试了正常 JSON 解析
- [ ] 测试了无效 JSON 处理
- [ ] 测试了边界情况
- [ ] 验证了错误被正确捕获

---

## 九、常见问题

### Q1: 为什么要容错处理已是对象的情况?

**答**: AI Provider 不同版本可能行为不一致:
- OpenAI 正式版: 返回 JSON 字符串
- 某些测试版本: 可能直接返回对象
- Mock 数据: 开发时可能用对象

容错让代码更健壮,兼容不同场景。

### Q2: 为什么用 BadRequestError 而不是普通 Error?

**答**: AI-backend 的错误分类:
- `BadRequestError` (400): 客户端错误,可修复
- `InternalServerError` (500): 服务端错误,不可预测

参数解析失败是客户端问题,应该用 400 状态码。

### Q3: 解析失败后应该终止还是继续?

**答**: 看场景:
- **终止**: 参数是必需的,无法默认值
- **继续**: 可以用默认参数,告诉 AI 执行失败让它重试

AI-backend 选择告诉 AI,让它生成友好的错误提示。

---

## 十、下一步

完成本节后,你已经掌握了参数解析和错误处理。接下来:

1. **Step 33**: 使用 Joi/Zod 增强类型安全
2. **Step 34**: 构建完整的天气查询 API
3. **Step 35**: 总结企业级最佳实践

---

**记住: 在生产环境中,永远不要信任 AI 的输出。多层验证、详细日志、优雅降级是关键。AI-backend 展示了如何构建健壮的参数处理系统。**
