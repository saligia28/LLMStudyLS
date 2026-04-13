# Step 33: Function Calling｜实现 Function 执行循环

## 学习目标

这一节要解决一个真实的工程问题：**AI 调用函数之后，还想继续调用另一个函数，怎么办？**

以及一个更隐蔽的问题：**流式（stream）模式下，Function Calling 的参数是逐 token 输出的，该怎么处理？**

完成后你应该能：

1. 把 `if (result.function_call)` 改成正确的 `while` 循环，支持 AI 连续调用多个函数
2. 理解 stream 模式和普通模式在 Function Calling 处理上的本质差异
3. 给 `chatStream` 补上 Function Calling 支持
4. 加入循环次数限制，防止 AI 陷入无限调用

> **当前项目状态**：`chat.controller.js` 里用的是 `if`，只处理一次函数调用。`chatStream` 完全没有 function calling 逻辑。本节把这两处都补全。

---

## 一、为什么 `if` 不够用

### 1.1 当前实现的局限

打开 `src/controllers/chat.controller.js`，你会看到：

```js
// 当前代码 — 只处理一次 function_call
if (result.function_call) {
  const functionResult = functionExecutor.execute(name, args)
  messages.push(...)      // 加入 assistant + function 消息
  result = await aiService.chat(messages, ...)   // 第二次调用 AI
  // ← 结束。如果 AI 在第二次回复里还想调用函数？直接忽略了。
}
```

这在"只调用一个函数"的场景下没问题。但如果用户问：

> "帮我算 3+5，然后告诉我现在几点"

AI 可能会先调用 `sum`，拿到结果后，再调用 `getTime`，最后才给你完整回答。这种**多步函数链**用 `if` 是接不住的。

### 1.2 正确的模型：循环

```text
用户消息
   ↓
第 1 次调用 AI
   ├─ 返回普通文本  → 直接结束 ✓
   └─ 返回 function_call
         ↓
      执行函数，把结果加入 messages
         ↓
      第 2 次调用 AI
         ├─ 返回普通文本  → 结束 ✓
         └─ 返回 function_call
               ↓
            再执行函数，再加入 messages
               ↓
            第 3 次调用 AI  ...（直到不再调用函数，或达到上限）
```

---

## 二、改造普通 chat：`if` → `while`

### 2.1 核心改动

```js
// src/controllers/chat.controller.js

async chat(req, res) {
  const validatedData = validateChatRequest(req.body)
  const messages = [...validatedData.messages]

  const callOptions = {
    provider: validatedData.provider,
    model: validatedData.model,
    temperature: validatedData.temperature,
    max_tokens: validatedData.maxTokens,
    functions: validatedData.functions,
  }

  // 第一次调用 AI
  let result = await aiService.chat(messages, callOptions)

  // ✅ 改成 while：AI 只要还想调用函数，就继续循环
  const MAX_ITERATIONS = 5   // 防止无限循环
  let iterations = 0

  while (result.function_call && iterations < MAX_ITERATIONS) {
    iterations++

    const { name, arguments: args } = result.function_call
    logger.info(`[iteration ${iterations}] AI requested function: ${name}`, { args })

    // 执行函数（executor 内部会处理 JSON 解析 + 错误）
    let functionResult
    try {
      functionResult = functionExecutor.execute(name, args)
      logger.info(`Function ${name} executed`, { result: functionResult })
    } catch (error) {
      logger.error(`Function ${name} failed`, { error: error.message })
      // 把错误告诉 AI，让它自行处理（而不是直接抛出中断流程）
      functionResult = { error: error.message }
    }

    // 把这一轮的 assistant（带 function_call）+ function 结果 加入历史
    messages.push({
      role: 'assistant',
      content: null,
      function_call: result.function_call,
    })
    messages.push({
      role: 'function',
      name,
      content: typeof functionResult === 'string'
        ? functionResult
        : JSON.stringify(functionResult),
    })

    // 再次调用 AI（带上函数结果）
    result = await aiService.chat(messages, callOptions)
  }

  if (iterations >= MAX_ITERATIONS) {
    logger.warn(`Function call loop hit MAX_ITERATIONS (${MAX_ITERATIONS}), forcing stop`)
  }

  return res.json(success(result))
}
```

### 2.2 两个关键设计决策

**① 函数执行错误不要直接 throw**

```js
// ❌ 这样做会中断整个请求，返回 500
const functionResult = functionExecutor.execute(name, args)  // 如果 throw，直接崩

// ✅ 捕获错误，把错误信息作为函数返回值传给 AI
try {
  functionResult = functionExecutor.execute(name, args)
} catch (error) {
  functionResult = { error: error.message }
}
```

这样 AI 会收到 `{ error: "Function xxx not found" }`，它可以告诉用户"这个函数无法使用"，而不是你的服务直接挂掉。

**② MAX_ITERATIONS 防止死循环**

AI 理论上可能一直返回 `function_call`（比如提示词设计有问题，或模型行为异常）。加上上限是生产代码的标配。5 次通常够用，极端场景可以调高。

---

## 三、Stream 模式的 Function Calling

### 3.1 问题所在

打开 `src/controllers/chat.controller.js`，看 `chatStream` 方法：

```js
async chatStream(req, res) {
  const validatedData = validateChatRequest(req.body)
  const streamHandler = new StreamHandler(res)
  const stream = await aiService.chatStream(validatedData.messages, { ... })
  await streamHandler.handleStream(stream)
  // ← 完全没有 function calling 处理
}
```

`streamHandler.handleStream` 只会把 `delta.content` 里的文字 token 流式发出去。如果 AI 不返回文字，而是返回 `function_call`，这段代码会静默忽略。

### 3.2 Stream 下 function_call 的特殊性

在非 stream 模式，函数调用是一次性返回的：

```json
{
  "function_call": {
    "name": "getTime",
    "arguments": "{\"timezone\":\"Asia/Shanghai\"}"
  }
}
```

在 stream 模式，同样的内容是**逐 token 分片流出来的**：

```text
chunk 1: { "delta": { "function_call": { "name": "getTime", "arguments": "" } } }
chunk 2: { "delta": { "function_call": { "arguments": "{\"time" } } }
chunk 3: { "delta": { "function_call": { "arguments": "zone\":" } } }
chunk 4: { "delta": { "function_call": { "arguments": "\"Asia/Shanghai\"}" } } }
chunk 5: { "finish_reason": "function_call" }
```

所以处理 stream Function Calling 的核心思路：

```text
1. 检测第一个 chunk 是否有 function_call.name  → 进入"函数模式"
2. 持续拼接后续 chunk 的 arguments 片段
3. 收到 finish_reason: "function_call" 后，拼接完成
4. 执行函数，拿到结果
5. 继续用普通 chat（非 stream）让 AI 生成最终回复
   或者再次开一个新 stream 让 AI 流式输出最终回复
```

### 3.3 改造 StreamHandler

先扩展 `src/utils/streamHandler.js`，让它能收集 function_call：

```js
// src/utils/streamHandler.js

export class StreamHandler {
  constructor(res) {
    this.res = res
    this.setupHeaders()
  }

  setupHeaders() {
    this.res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    this.res.setHeader('Cache-Control', 'no-cache')
    this.res.setHeader('Connection', 'keep-alive')
  }

  sendChunk(data) {
    this.res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  sendDone() {
    this.res.write('data: [DONE]\n\n')
  }

  sendError(error) {
    this.res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
  }

  end() {
    this.res.end()
  }

  /**
   * 原来的流处理：只处理文字 token
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

  /**
   * ✅ 新增：支持 Function Calling 的流处理
   *
   * 返回值：
   *   - { type: 'done' }                          → 正常结束，纯文字回复已流出
   *   - { type: 'function_call', name, arguments } → AI 要调用函数，调用方去执行
   */
  async handleStreamWithFunctionCall(stream) {
    let functionCallName = ''
    let functionCallArgs = ''
    let hasFunctionCall = false

    try {
      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue

        const delta = choice.delta

        // 检测是否是 function_call 模式
        if (delta?.function_call) {
          hasFunctionCall = true
          if (delta.function_call.name) {
            functionCallName = delta.function_call.name
          }
          if (delta.function_call.arguments) {
            functionCallArgs += delta.function_call.arguments
          }
          // function_call 期间不向客户端发送任何内容（等函数执行完再说）
          continue
        }

        // 普通文字 token：流式发给客户端
        if (delta?.content) {
          this.sendChunk(chunk)
        }

        // 检查结束原因
        if (choice.finish_reason === 'function_call') {
          // 函数调用结束，告诉调用方
          return {
            type: 'function_call',
            name: functionCallName,
            arguments: functionCallArgs,
          }
        }

        if (choice.finish_reason === 'stop') {
          // 正常结束
          this.sendDone()
          return { type: 'done' }
        }
      }

      // stream 结束但没有明确的 finish_reason
      if (hasFunctionCall) {
        return {
          type: 'function_call',
          name: functionCallName,
          arguments: functionCallArgs,
        }
      }

      this.sendDone()
      return { type: 'done' }

    } catch (error) {
      logger.error('Stream handler error:', error)
      this.sendError(error)
      return { type: 'done' }
    } finally {
      // 注意：不在这里 end()，由 controller 决定何时关闭
    }
  }
}
```

### 3.4 改造 chatStream Controller

```js
// src/controllers/chat.controller.js

async chatStream(req, res) {
  const validatedData = validateChatRequest(req.body)
  const messages = [...validatedData.messages]

  const callOptions = {
    provider: validatedData.provider,
    model: validatedData.model,
    temperature: validatedData.temperature,
    max_tokens: validatedData.maxTokens,
    functions: validatedData.functions,
  }

  const streamHandler = new StreamHandler(res)
  const MAX_ITERATIONS = 5
  let iterations = 0

  // ✅ 外层也是循环：AI 可能连续调用多个函数
  while (iterations < MAX_ITERATIONS) {
    // 开启一个新的 stream
    const stream = await aiService.chatStream(messages, callOptions)
    const outcome = await streamHandler.handleStreamWithFunctionCall(stream)

    if (outcome.type === 'done') {
      // 正常结束，流已经发完
      break
    }

    if (outcome.type === 'function_call') {
      iterations++
      const { name, arguments: args } = outcome
      logger.info(`[stream iteration ${iterations}] AI requested function: ${name}`)

      // 执行函数
      let functionResult
      try {
        functionResult = functionExecutor.execute(name, args)
      } catch (error) {
        logger.error(`Function ${name} failed`, { error: error.message })
        functionResult = { error: error.message }
      }

      // 把这一轮加入 messages
      messages.push({
        role: 'assistant',
        content: null,
        function_call: { name, arguments: args },
      })
      messages.push({
        role: 'function',
        name,
        content: typeof functionResult === 'string'
          ? functionResult
          : JSON.stringify(functionResult),
      })

      // 继续循环，让 AI 生成下一步（可能还是 function_call，也可能是最终回答）
    }
  }

  // 确保 SSE 连接关闭
  streamHandler.end()
}
```

### 3.5 整体流程图

```text
POST /api/chat/stream
        ↓
validateChatRequest
        ↓
aiService.chatStream(messages)   ← 第 1 次开 stream
        ↓
handleStreamWithFunctionCall
  ├─ 返回 { type: 'done' }
  │       ↓
  │   SSE 流结束，res.end()  ✓
  │
  └─ 返回 { type: 'function_call', name, arguments }
          ↓
      执行函数，得到结果
          ↓
      messages.push(assistant + function)
          ↓
      aiService.chatStream(messages)   ← 第 2 次开 stream
          ↓
      handleStreamWithFunctionCall
          ├─ 返回 { type: 'done' }  → SSE 流结束 ✓
          └─ 返回 { type: 'function_call' }  → 继续循环...
```

---

## 四、普通 chat 和 stream chat 的完整对比

| 维度 | chat（普通） | chatStream（流式） |
|------|-------------|------------------|
| function_call 获取 | 一次性返回完整 JSON | 逐 token 拼接，需要手动收集 |
| 中间过程展示 | 不展示 | 文字 token 实时发给客户端，function 调用期间静默 |
| 循环机制 | `while (result.function_call)` | `while` 内每次开新 stream |
| 最终结束 | `res.json(success(result))` | `streamHandler.end()` |
| 复杂度 | 较低 | 较高，需要区分 delta 类型 |

---

## 五、验证

### 5.1 测试多步函数调用（普通模式）

```http
POST http://localhost:3000/api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "帮我算 3+5，然后告诉我现在北京时间" }
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
    },
    {
      "name": "getTime",
      "description": "获取当前时间",
      "parameters": {
        "type": "object",
        "properties": {
          "timezone": { "type": "string" }
        }
      }
    }
  ]
}
```

**预期日志**：
```
[iteration 1] AI requested function: sum
Function sum executed { result: 8 }
[iteration 2] AI requested function: getTime
Function getTime executed { result: "当前时间 (Asia/Shanghai): 2026-04-13 ..." }
```

### 5.2 测试 Stream 模式

```http
POST http://localhost:3000/api/chat/stream
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "现在几点？" }
  ],
  "functions": [
    {
      "name": "getTime",
      "description": "获取当前时间",
      "parameters": {
        "type": "object",
        "properties": {
          "timezone": { "type": "string" }
        }
      }
    }
  ]
}
```

**预期行为**：
- AI 先发出 `function_call`（stream 静默收集）
- 执行 `getTime`，得到时间字符串
- 重新开 stream，AI 流式输出最终回答（客户端能看到 token 逐字出现）

### 5.3 检查循环限制

观察日志：如果看到 `Function call loop hit MAX_ITERATIONS`，说明 AI 陷入了循环，限制生效。

---

## 六、小结

1. **`if` → `while`**：处理多步函数调用的核心改动，三行代码，意义重大。
2. **MAX_ITERATIONS**：生产代码必须有上限，AI 的行为不可完全预测。
3. **Stream 下 function_call 是碎片化的**：需要手动按 name + arguments 拼接，不能直接用。
4. **Stream + Function Calling 的关键设计**：函数调用期间对客户端静默，拿到结果后再开新 stream 流出最终回答。
5. **函数错误不要直接 throw**：转成 `{ error: message }` 回传给 AI，让 AI 优雅处理，服务不崩。
