# Step 9: 流式输出（SSE）+ 前端渲染 - 写一个 Node SSE 测试服务器

## 学习目标

这个任务的本质是回答一个核心问题：**如何从零开始构建一个完整的 SSE 测试服务器，用于开发和调试流式输出功能**。

通过本教程，你将：

1. 从零搭建一个完整的 Node.js SSE 服务器
2. 实现多种 SSE 测试场景（正常流、延迟流、错误模拟）
3. 构建配套的前端测试页面
4. 掌握 SSE 服务器的调试技巧

---

## 一、核心认知：为什么需要 SSE 测试服务器？

### 1.1 测试服务器的价值

```
┌─────────────────────────────────────────────────────────────┐
│              为什么需要独立的 SSE 测试服务器                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   开发阶段的痛点：                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 调用真实 LLM API 费钱费时                    │       │
│   │  2. 无法控制响应速度、内容、错误                  │       │
│   │  3. 网络问题难以复现和调试                        │       │
│   │  4. 无法模拟边界情况（超时、断连等）              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   测试服务器的优势：                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  ✅ 零成本：不消耗 API 额度                       │       │
│   │  ✅ 可控性：精确控制响应速度和内容                 │       │
│   │  ✅ 可重复：每次测试结果一致                       │       │
│   │  ✅ 可模拟：轻松模拟各种异常情况                   │       │
│   │  ✅ 离线可用：无需网络连接                         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 测试服务器应该具备的功能

| 功能             | 说明                             | 用途                   |
| ---------------- | -------------------------------- | ---------------------- |
| **基础流式输出** | 模拟正常的 token 逐字输出        | 测试基本功能           |
| **速度控制**     | 可调节每个 token 的输出间隔      | 测试不同网速下的表现   |
| **内容控制**     | 可指定输出的文本内容             | 测试特定场景           |
| **错误模拟**     | 模拟各种错误（超时、断连、5xx）  | 测试错误处理逻辑       |
| **格式兼容**     | 兼容 OpenAI 的 SSE 响应格式      | 无缝切换真实 API       |
| **日志输出**     | 显示请求和响应的详细信息         | 调试问题               |

---

## 二、项目结构设计

### 2.1 文件结构

```
experiments/
├── sse-test-server/
│   ├── server.js          # 主服务器文件
│   ├── routes/
│   │   ├── basic.js       # 基础 SSE 路由
│   │   ├── openai.js      # OpenAI 兼容格式路由
│   │   └── scenarios.js   # 特殊场景路由
│   ├── utils/
│   │   └── sse-helper.js  # SSE 工具函数
│   ├── public/
│   │   └── index.html     # 测试页面
│   └── package.json
```

### 2.2 功能模块划分

```
┌─────────────────────────────────────────────────────────────┐
│                    SSE 测试服务器架构                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │                   HTTP Server                   │       │
│   │                   (Express)                     │       │
│   └─────────────────────────────────────────────────┘       │
│                          │                                  │
│            ┌─────────────┼─────────────┐                    │
│            ▼             ▼             ▼                    │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│   │  /api/sse   │ │ /api/chat   │ │ /api/test   │          │
│   │  基础 SSE   │ │ OpenAI 格式 │ │ 场景测试    │          │
│   └─────────────┘ └─────────────┘ └─────────────┘          │
│                          │                                  │
│                          ▼                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │              SSE Helper 工具层                   │       │
│   │  - 设置响应头                                    │       │
│   │  - 发送事件                                      │       │
│   │  - 模拟延迟                                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实践：构建 SSE 测试服务器

### 3.1 创建项目基础

首先创建项目目录和 package.json：

```bash
mkdir -p experiments/sse-test-server
cd experiments/sse-test-server
```

创建 `experiments/sse-test-server/package.json` 文件：

```json
{
  "name": "sse-test-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  }
}
```

### 3.2 创建 SSE 工具函数

创建 `experiments/sse-test-server/utils/sse-helper.js` 文件：

```javascript
/**
 * SSE 工具函数
 * 封装 SSE 相关的通用操作
 */

/**
 * 设置 SSE 响应头
 * @param {Response} res - Express 响应对象
 */
export function setSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // 禁用 Nginx 缓冲
  res.flushHeaders()
}

/**
 * 发送 SSE 事件
 * @param {Response} res - Express 响应对象
 * @param {Object} options - 事件选项
 * @param {string} options.event - 事件类型（可选）
 * @param {string|Object} options.data - 事件数据
 * @param {string|number} options.id - 事件 ID（可选）
 * @param {number} options.retry - 重连时间（可选）
 */
export function sendSSEEvent(res, { event, data, id, retry }) {
  let message = ''

  if (id !== undefined) {
    message += `id: ${id}\n`
  }

  if (event) {
    message += `event: ${event}\n`
  }

  if (retry !== undefined) {
    message += `retry: ${retry}\n`
  }

  // 如果 data 是对象，转换为 JSON 字符串
  const dataStr = typeof data === 'object' ? JSON.stringify(data) : data

  // data 可以有多行，每行都需要 "data: " 前缀
  const lines = String(dataStr).split('\n')
  for (const line of lines) {
    message += `data: ${line}\n`
  }

  message += '\n' // 空行表示事件结束

  res.write(message)
}

/**
 * 发送 OpenAI 格式的 SSE 事件
 * @param {Response} res - Express 响应对象
 * @param {string} content - token 内容
 * @param {Object} options - 选项
 */
export function sendOpenAIChunk(res, content, options = {}) {
  const { id = 'chatcmpl-test', model = 'test-model', finishReason = null } = options

  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: content ? { content } : {},
        finish_reason: finishReason,
      },
    ],
  }

  sendSSEEvent(res, { data: chunk })
}

/**
 * 发送 SSE 结束标识（OpenAI 风格）
 * @param {Response} res - Express 响应对象
 */
export function sendSSEDone(res) {
  res.write('data: [DONE]\n\n')
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 逐字符发送文本
 * @param {Response} res - Express 响应对象
 * @param {string} text - 要发送的文本
 * @param {number} interval - 每个字符的间隔（毫秒）
 */
export async function streamText(res, text, interval = 50) {
  for (const char of text) {
    sendOpenAIChunk(res, char)
    await delay(interval)
  }
}

/**
 * 逐词发送文本（按空格分词）
 * @param {Response} res - Express 响应对象
 * @param {string} text - 要发送的文本
 * @param {number} interval - 每个词的间隔（毫秒）
 */
export async function streamWords(res, text, interval = 100) {
  const words = text.split(/(\s+)/) // 保留空格

  for (const word of words) {
    if (word) {
      sendOpenAIChunk(res, word)
      await delay(interval)
    }
  }
}
```

### 3.3 创建基础 SSE 路由

创建 `experiments/sse-test-server/routes/basic.js` 文件：

```javascript
/**
 * 基础 SSE 路由
 * 用于测试原始的 SSE 功能
 */
import { Router } from 'express'
import { setSSEHeaders, sendSSEEvent, delay } from '../utils/sse-helper.js'

const router = Router()

/**
 * GET /api/sse/basic
 * 最基础的 SSE 示例 - 发送简单文本
 */
router.get('/basic', async (req, res) => {
  console.log('[SSE] 基础流开始')
  setSSEHeaders(res)

  const text = '你好，这是一个基础的 SSE 流式输出测试。每个字符都会逐个发送给你。'

  let id = 0
  for (const char of text) {
    id++
    sendSSEEvent(res, {
      id,
      event: 'message',
      data: { text: char },
    })
    await delay(80)
  }

  // 发送完成事件
  sendSSEEvent(res, {
    event: 'done',
    data: 'Stream completed',
  })

  res.end()
  console.log('[SSE] 基础流结束')
})

/**
 * GET /api/sse/countdown
 * 倒计时示例 - 展示事件类型的使用
 */
router.get('/countdown', async (req, res) => {
  const count = parseInt(req.query.count) || 10
  console.log(`[SSE] 倒计时开始: ${count}`)

  setSSEHeaders(res)

  // 设置重连时间
  sendSSEEvent(res, { retry: 3000, data: '' })

  for (let i = count; i >= 0; i--) {
    sendSSEEvent(res, {
      id: count - i + 1,
      event: i === 0 ? 'finish' : 'countdown',
      data: { number: i, message: i === 0 ? '发射！' : `倒计时: ${i}` },
    })
    await delay(1000)
  }

  res.end()
  console.log('[SSE] 倒计时结束')
})

/**
 * GET /api/sse/progress
 * 进度条示例 - 模拟文件上传/处理进度
 */
router.get('/progress', async (req, res) => {
  const steps = parseInt(req.query.steps) || 20
  console.log(`[SSE] 进度开始: ${steps} 步`)

  setSSEHeaders(res)

  for (let i = 0; i <= steps; i++) {
    const progress = Math.round((i / steps) * 100)
    sendSSEEvent(res, {
      event: 'progress',
      data: {
        current: i,
        total: steps,
        percent: progress,
        message: progress === 100 ? '处理完成！' : `处理中... ${progress}%`,
      },
    })
    await delay(200)
  }

  res.end()
  console.log('[SSE] 进度结束')
})

/**
 * GET /api/sse/multiline
 * 多行数据示例 - 展示如何发送包含换行的数据
 */
router.get('/multiline', async (req, res) => {
  console.log('[SSE] 多行数据开始')
  setSSEHeaders(res)

  const codeSnippet = `function hello() {
  console.log("Hello, World!");
  return true;
}`

  // 逐行发送代码
  const lines = codeSnippet.split('\n')
  for (let i = 0; i < lines.length; i++) {
    sendSSEEvent(res, {
      event: 'code',
      data: { line: i + 1, content: lines[i] },
    })
    await delay(500)
  }

  sendSSEEvent(res, { event: 'done', data: 'Code complete' })
  res.end()
  console.log('[SSE] 多行数据结束')
})

export default router
```

### 3.4 创建 OpenAI 兼容格式路由

创建 `experiments/sse-test-server/routes/openai.js` 文件：

```javascript
/**
 * OpenAI 兼容格式路由
 * 模拟 OpenAI Chat Completion API 的流式响应
 */
import { Router } from 'express'
import {
  setSSEHeaders,
  sendOpenAIChunk,
  sendSSEDone,
  streamText,
  streamWords,
  delay,
} from '../utils/sse-helper.js'

const router = Router()

// 预设的测试回复
const PRESET_RESPONSES = {
  greeting: '你好！我是 SSE 测试服务器，很高兴为你服务。有什么我可以帮助你的吗？',
  code: `好的，这是一个简单的 JavaScript 函数：

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 测试
console.log(fibonacci(10)); // 输出: 55
\`\`\`

这个函数使用递归计算斐波那契数列。`,
  markdown: `# SSE 测试响应

这是一个 **Markdown** 格式的响应，包含：

1. 标题
2. **粗体** 和 *斜体*
3. 代码块
4. 列表

> 这是一段引用文本。

希望这个测试对你有帮助！`,
  long: '这是一段较长的测试文本。'.repeat(20),
}

/**
 * POST /api/chat/completions
 * OpenAI Chat Completion API 兼容接口
 */
router.post('/completions', async (req, res) => {
  const { messages, stream = true, speed = 'normal' } = req.body

  console.log('[OpenAI] 收到请求:', {
    messageCount: messages?.length,
    stream,
    speed,
  })

  // 获取最后一条用户消息
  const lastMessage = messages?.[messages.length - 1]?.content || ''

  // 根据用户输入选择回复
  let response = PRESET_RESPONSES.greeting
  if (lastMessage.includes('代码') || lastMessage.includes('code')) {
    response = PRESET_RESPONSES.code
  } else if (lastMessage.includes('markdown') || lastMessage.includes('格式')) {
    response = PRESET_RESPONSES.markdown
  } else if (lastMessage.includes('长') || lastMessage.includes('long')) {
    response = PRESET_RESPONSES.long
  }

  // 非流式响应
  if (!stream) {
    return res.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'test-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: response },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: lastMessage.length,
        completion_tokens: response.length,
        total_tokens: lastMessage.length + response.length,
      },
    })
  }

  // 流式响应
  setSSEHeaders(res)

  // 发送角色信息（第一个 chunk）
  sendOpenAIChunk(res, '', { id: 'chatcmpl-test' })

  // 根据速度设置间隔
  const intervalMap = {
    slow: 150,
    normal: 50,
    fast: 20,
    instant: 5,
  }
  const interval = intervalMap[speed] || 50

  // 流式发送内容
  await streamText(res, response, interval)

  // 发送结束标识
  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)

  res.end()
  console.log('[OpenAI] 响应完成')
})

/**
 * POST /api/chat/echo
 * 回声模式 - 返回用户输入的内容
 */
router.post('/echo', async (req, res) => {
  const { messages, speed = 'normal' } = req.body
  const lastMessage = messages?.[messages.length - 1]?.content || '(空消息)'

  console.log('[Echo] 收到:', lastMessage)

  setSSEHeaders(res)

  const response = `你说的是：「${lastMessage}」\n\n这是回声模式的测试响应。`

  const intervalMap = { slow: 100, normal: 50, fast: 20 }
  await streamText(res, response, intervalMap[speed] || 50)

  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)
  res.end()
})

/**
 * POST /api/chat/custom
 * 自定义响应 - 允许指定返回的内容
 */
router.post('/custom', async (req, res) => {
  const { response = '默认测试响应', interval = 50, wordMode = false } = req.body

  console.log('[Custom] 自定义响应:', { length: response.length, interval, wordMode })

  setSSEHeaders(res)

  if (wordMode) {
    await streamWords(res, response, interval)
  } else {
    await streamText(res, response, interval)
  }

  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)
  res.end()
})

export default router
```

### 3.5 创建场景测试路由

创建 `experiments/sse-test-server/routes/scenarios.js` 文件：

```javascript
/**
 * 场景测试路由
 * 用于测试各种边界情况和异常场景
 */
import { Router } from 'express'
import {
  setSSEHeaders,
  sendOpenAIChunk,
  sendSSEDone,
  sendSSEEvent,
  delay,
} from '../utils/sse-helper.js'

const router = Router()

/**
 * GET /api/test/slow
 * 慢速流 - 模拟网络延迟
 */
router.get('/slow', async (req, res) => {
  const interval = parseInt(req.query.interval) || 500
  console.log(`[Test] 慢速流开始, 间隔: ${interval}ms`)

  setSSEHeaders(res)

  const text = '这是一个慢速流测试，每个字符之间有较长的间隔...'

  for (const char of text) {
    sendOpenAIChunk(res, char)
    await delay(interval)
  }

  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)
  res.end()
  console.log('[Test] 慢速流结束')
})

/**
 * GET /api/test/burst
 * 突发流 - 模拟不均匀的输出速度
 */
router.get('/burst', async (req, res) => {
  console.log('[Test] 突发流开始')
  setSSEHeaders(res)

  const chunks = ['这是', '突发', '模式', '测试，', '有时', '很快，', '有时', '很慢...']

  for (const chunk of chunks) {
    sendOpenAIChunk(res, chunk)
    // 随机延迟 50-500ms
    await delay(Math.random() * 450 + 50)
  }

  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)
  res.end()
  console.log('[Test] 突发流结束')
})

/**
 * GET /api/test/large
 * 大数据量流 - 测试长内容
 */
router.get('/large', async (req, res) => {
  const size = parseInt(req.query.size) || 1000
  console.log(`[Test] 大数据量流开始, 大小: ${size}`)

  setSSEHeaders(res)

  // 生成指定大小的文本
  const text = '测试'.repeat(size)

  // 分批发送，每批 10 个字符
  const batchSize = 10
  for (let i = 0; i < text.length; i += batchSize) {
    const chunk = text.slice(i, i + batchSize)
    sendOpenAIChunk(res, chunk)
    await delay(10)
  }

  sendOpenAIChunk(res, '', { finishReason: 'stop' })
  sendSSEDone(res)
  res.end()
  console.log('[Test] 大数据量流结束')
})

/**
 * GET /api/test/timeout
 * 超时测试 - 中途停止响应
 */
router.get('/timeout', async (req, res) => {
  const stopAfter = parseInt(req.query.stopAfter) || 5
  console.log(`[Test] 超时测试开始, ${stopAfter} 秒后停止`)

  setSSEHeaders(res)

  const text = '这个流会在中途突然停止，用于测试超时处理...'

  for (const char of text) {
    sendOpenAIChunk(res, char)
    await delay(100)
  }

  // 等待指定时间后不发送任何数据
  console.log(`[Test] 等待 ${stopAfter} 秒...`)
  await delay(stopAfter * 1000)

  // 模拟超时 - 不发送结束标识，直接关闭
  console.log('[Test] 模拟超时，关闭连接')
  res.end()
})

/**
 * GET /api/test/error-mid
 * 中途错误 - 在流式输出过程中发送错误
 */
router.get('/error-mid', async (req, res) => {
  console.log('[Test] 中途错误测试开始')
  setSSEHeaders(res)

  const text = '正常输出一些内容...'

  for (const char of text) {
    sendOpenAIChunk(res, char)
    await delay(50)
  }

  // 发送错误事件
  sendSSEEvent(res, {
    event: 'error',
    data: {
      error: {
        message: '模拟的中途错误：服务器内部错误',
        type: 'server_error',
        code: 500,
      },
    },
  })

  res.end()
  console.log('[Test] 中途错误测试结束')
})

/**
 * GET /api/test/error-start
 * 立即错误 - 一开始就返回错误
 */
router.get('/error-start', (req, res) => {
  const errorType = req.query.type || '500'
  console.log(`[Test] 立即错误: ${errorType}`)

  const errors = {
    400: { status: 400, message: 'Bad Request: 请求参数错误' },
    401: { status: 401, message: 'Unauthorized: 认证失败，请检查 API Key' },
    429: { status: 429, message: 'Too Many Requests: 请求过于频繁' },
    500: { status: 500, message: 'Internal Server Error: 服务器内部错误' },
    503: { status: 503, message: 'Service Unavailable: 服务暂时不可用' },
  }

  const error = errors[errorType] || errors['500']

  res.status(error.status).json({
    error: {
      message: error.message,
      type: 'api_error',
      code: error.status,
    },
  })
})

/**
 * GET /api/test/truncate
 * 截断测试 - 模拟 max_tokens 限制
 */
router.get('/truncate', async (req, res) => {
  console.log('[Test] 截断测试开始')
  setSSEHeaders(res)

  const text = '这是一段会被截断的文本，模拟达到 max_tokens 限制的情况。后面还有很多内容但是不会显示...'

  // 只发送前一半
  const truncatedText = text.slice(0, Math.floor(text.length / 2))

  for (const char of truncatedText) {
    sendOpenAIChunk(res, char)
    await delay(30)
  }

  // 发送 finish_reason: length 表示被截断
  sendOpenAIChunk(res, '', { finishReason: 'length' })
  sendSSEDone(res)
  res.end()
  console.log('[Test] 截断测试结束')
})

/**
 * GET /api/test/reconnect
 * 重连测试 - 测试断线重连
 */
router.get('/reconnect', async (req, res) => {
  const lastEventId = req.headers['last-event-id']
  console.log(`[Test] 重连测试, Last-Event-ID: ${lastEventId || '无'}`)

  setSSEHeaders(res)

  // 设置重连时间
  sendSSEEvent(res, { retry: 1000, data: '' })

  const messages = ['第一条消息', '第二条消息', '第三条消息', '第四条消息', '第五条消息']

  // 如果有 last-event-id，从断点继续
  const startIndex = lastEventId ? parseInt(lastEventId) : 0

  for (let i = startIndex; i < messages.length; i++) {
    sendSSEEvent(res, {
      id: i + 1,
      event: 'message',
      data: { index: i + 1, content: messages[i] },
    })
    await delay(1000)
  }

  sendSSEEvent(res, { event: 'done', data: '所有消息发送完成' })
  res.end()
  console.log('[Test] 重连测试结束')
})

/**
 * GET /api/test/keepalive
 * 心跳测试 - 发送心跳保持连接
 */
router.get('/keepalive', async (req, res) => {
  const duration = parseInt(req.query.duration) || 30
  console.log(`[Test] 心跳测试开始, 持续 ${duration} 秒`)

  setSSEHeaders(res)

  const startTime = Date.now()
  let heartbeatCount = 0

  while (Date.now() - startTime < duration * 1000) {
    heartbeatCount++
    sendSSEEvent(res, {
      event: 'heartbeat',
      data: {
        count: heartbeatCount,
        timestamp: new Date().toISOString(),
        elapsed: Math.round((Date.now() - startTime) / 1000),
      },
    })
    await delay(5000) // 每 5 秒一次心跳
  }

  sendSSEEvent(res, { event: 'done', data: `心跳测试完成，共 ${heartbeatCount} 次` })
  res.end()
  console.log('[Test] 心跳测试结束')
})

export default router
```

### 3.6 创建主服务器文件

创建 `experiments/sse-test-server/server.js` 文件：

```javascript
/**
 * SSE 测试服务器
 * 用于开发和测试流式输出功能
 */
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

import basicRoutes from './routes/basic.js'
import openaiRoutes from './routes/openai.js'
import scenarioRoutes from './routes/scenarios.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3100

// 中间件
app.use(cors())
app.use(express.json())

// 请求日志
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.url}`)
  next()
})

// 静态文件
app.use(express.static(join(__dirname, 'public')))

// 路由
app.use('/api/sse', basicRoutes)
app.use('/api/chat', openaiRoutes)
app.use('/api/test', scenarioRoutes)

// 根路由 - API 文档
app.get('/api', (req, res) => {
  res.json({
    name: 'SSE Test Server',
    version: '1.0.0',
    endpoints: {
      basic: {
        '/api/sse/basic': 'GET - 基础 SSE 流',
        '/api/sse/countdown': 'GET - 倒计时 (?count=10)',
        '/api/sse/progress': 'GET - 进度条 (?steps=20)',
        '/api/sse/multiline': 'GET - 多行数据',
      },
      openai: {
        '/api/chat/completions': 'POST - OpenAI 兼容接口',
        '/api/chat/echo': 'POST - 回声模式',
        '/api/chat/custom': 'POST - 自定义响应',
      },
      test: {
        '/api/test/slow': 'GET - 慢速流 (?interval=500)',
        '/api/test/burst': 'GET - 突发流',
        '/api/test/large': 'GET - 大数据量 (?size=1000)',
        '/api/test/timeout': 'GET - 超时测试 (?stopAfter=5)',
        '/api/test/error-mid': 'GET - 中途错误',
        '/api/test/error-start': 'GET - 立即错误 (?type=500)',
        '/api/test/truncate': 'GET - 截断测试',
        '/api/test/reconnect': 'GET - 重连测试',
        '/api/test/keepalive': 'GET - 心跳测试 (?duration=30)',
      },
    },
  })
})

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Error]', err.message)
  res.status(500).json({ error: err.message })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  SSE 测试服务器                            ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  服务地址: http://localhost:${PORT}                         ║
║  测试页面: http://localhost:${PORT}/index.html              ║
║  API 文档: http://localhost:${PORT}/api                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `)
})
```

### 3.7 创建测试页面

创建 `experiments/sse-test-server/public/index.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SSE 测试服务器</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
        background: #f5f5f5;
      }
      h1 {
        color: #333;
        text-align: center;
      }
      .section {
        background: white;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }
      .section h2 {
        margin-top: 0;
        color: #444;
        border-bottom: 2px solid #eee;
        padding-bottom: 10px;
      }
      .btn-group {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 15px;
      }
      button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      .btn-primary {
        background: #007bff;
        color: white;
      }
      .btn-primary:hover {
        background: #0056b3;
      }
      .btn-success {
        background: #28a745;
        color: white;
      }
      .btn-success:hover {
        background: #1e7e34;
      }
      .btn-warning {
        background: #ffc107;
        color: #333;
      }
      .btn-warning:hover {
        background: #d39e00;
      }
      .btn-danger {
        background: #dc3545;
        color: white;
      }
      .btn-danger:hover {
        background: #bd2130;
      }
      .btn-secondary {
        background: #6c757d;
        color: white;
      }
      .btn-secondary:hover {
        background: #545b62;
      }
      .output-container {
        display: flex;
        gap: 20px;
      }
      .output-box {
        flex: 1;
      }
      .output {
        background: #1e1e1e;
        color: #d4d4d4;
        border-radius: 6px;
        padding: 15px;
        min-height: 200px;
        max-height: 400px;
        overflow-y: auto;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 14px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-all;
      }
      .output .token {
        color: #9cdcfe;
      }
      .output .event {
        color: #ce9178;
      }
      .output .error {
        color: #f44747;
      }
      .output .info {
        color: #6a9955;
      }
      .stats {
        background: #e9ecef;
        border-radius: 6px;
        padding: 15px;
        margin-top: 15px;
        font-size: 14px;
      }
      .stats span {
        margin-right: 20px;
      }
      .chat-input {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      .chat-input input {
        flex: 1;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
      }
      .chat-input select {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
      }
      .cursor {
        display: inline-block;
        width: 8px;
        height: 16px;
        background: #d4d4d4;
        animation: blink 1s infinite;
      }
      @keyframes blink {
        0%,
        50% {
          opacity: 1;
        }
        51%,
        100% {
          opacity: 0;
        }
      }
    </style>
  </head>
  <body>
    <h1>SSE 测试服务器控制台</h1>

    <!-- 基础 SSE 测试 -->
    <div class="section">
      <h2>基础 SSE 测试</h2>
      <div class="btn-group">
        <button class="btn-primary" onclick="testBasic()">基础流</button>
        <button class="btn-primary" onclick="testCountdown()">倒计时</button>
        <button class="btn-primary" onclick="testProgress()">进度条</button>
        <button class="btn-primary" onclick="testMultiline()">多行数据</button>
        <button class="btn-secondary" onclick="stopTest()">停止</button>
      </div>
      <div class="output" id="basicOutput">等待测试...</div>
    </div>

    <!-- OpenAI 兼容测试 -->
    <div class="section">
      <h2>OpenAI 兼容接口测试</h2>
      <div class="chat-input">
        <input type="text" id="chatInput" placeholder="输入消息..." value="请写一段代码示例" />
        <select id="speedSelect">
          <option value="slow">慢速</option>
          <option value="normal" selected>正常</option>
          <option value="fast">快速</option>
          <option value="instant">极速</option>
        </select>
        <button class="btn-success" onclick="sendChat()">发送</button>
        <button class="btn-secondary" onclick="stopChat()">停止</button>
      </div>
      <div class="output" id="chatOutput">等待输入...</div>
      <div class="stats" id="chatStats"></div>
    </div>

    <!-- 场景测试 -->
    <div class="section">
      <h2>场景测试</h2>
      <div class="btn-group">
        <button class="btn-warning" onclick="testSlow()">慢速流</button>
        <button class="btn-warning" onclick="testBurst()">突发流</button>
        <button class="btn-warning" onclick="testLarge()">大数据量</button>
        <button class="btn-danger" onclick="testTimeout()">超时测试</button>
        <button class="btn-danger" onclick="testErrorMid()">中途错误</button>
        <button class="btn-danger" onclick="testErrorStart()">立即错误</button>
        <button class="btn-warning" onclick="testTruncate()">截断测试</button>
        <button class="btn-secondary" onclick="stopScenario()">停止</button>
      </div>
      <div class="output" id="scenarioOutput">等待测试...</div>
    </div>

    <script>
      // 全局变量
      let currentEventSource = null
      let currentAbortController = null
      let startTime = null
      let tokenCount = 0

      // 基础 SSE 测试
      function testBasic() {
        const output = document.getElementById('basicOutput')
        output.innerHTML = ''
        stopTest()

        currentEventSource = new EventSource('/api/sse/basic')

        currentEventSource.onmessage = e => {
          const data = JSON.parse(e.data)
          output.innerHTML += `<span class="token">${data.text}</span>`
        }

        currentEventSource.addEventListener('done', () => {
          output.innerHTML += '\n<span class="info">[完成]</span>'
          currentEventSource.close()
        })

        currentEventSource.onerror = () => {
          output.innerHTML += '\n<span class="error">[连接错误]</span>'
        }
      }

      function testCountdown() {
        const output = document.getElementById('basicOutput')
        output.innerHTML = ''
        stopTest()

        currentEventSource = new EventSource('/api/sse/countdown?count=10')

        currentEventSource.addEventListener('countdown', e => {
          const data = JSON.parse(e.data)
          output.innerHTML = `<span class="event">${data.message}</span>`
        })

        currentEventSource.addEventListener('finish', e => {
          const data = JSON.parse(e.data)
          output.innerHTML = `<span class="info">${data.message}</span>`
          currentEventSource.close()
        })
      }

      function testProgress() {
        const output = document.getElementById('basicOutput')
        output.innerHTML = ''
        stopTest()

        currentEventSource = new EventSource('/api/sse/progress?steps=20')

        currentEventSource.addEventListener('progress', e => {
          const data = JSON.parse(e.data)
          const bar = '█'.repeat(Math.floor(data.percent / 5)) + '░'.repeat(20 - Math.floor(data.percent / 5))
          output.innerHTML = `<span class="event">[${bar}] ${data.percent}%\n${data.message}</span>`
        })
      }

      function testMultiline() {
        const output = document.getElementById('basicOutput')
        output.innerHTML = ''
        stopTest()

        currentEventSource = new EventSource('/api/sse/multiline')

        currentEventSource.addEventListener('code', e => {
          const data = JSON.parse(e.data)
          output.innerHTML += `<span class="token">${data.line}: ${data.content}</span>\n`
        })

        currentEventSource.addEventListener('done', () => {
          output.innerHTML += '<span class="info">[完成]</span>'
          currentEventSource.close()
        })
      }

      function stopTest() {
        if (currentEventSource) {
          currentEventSource.close()
          currentEventSource = null
        }
      }

      // OpenAI 兼容测试
      async function sendChat() {
        const input = document.getElementById('chatInput')
        const output = document.getElementById('chatOutput')
        const stats = document.getElementById('chatStats')
        const speed = document.getElementById('speedSelect').value

        output.innerHTML = '<span class="cursor"></span>'
        stats.innerHTML = ''
        stopChat()

        startTime = Date.now()
        tokenCount = 0
        let firstTokenTime = null
        let content = ''

        currentAbortController = new AbortController()

        try {
          const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: input.value }],
              stream: true,
              speed: speed,
            }),
            signal: currentAbortController.signal,
          })

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const text = decoder.decode(value)
            const lines = text.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6))
                  const token = data.choices?.[0]?.delta?.content || ''

                  if (token) {
                    if (!firstTokenTime) firstTokenTime = Date.now()
                    tokenCount++
                    content += token
                    output.innerHTML = `<span class="token">${escapeHtml(content)}</span><span class="cursor"></span>`
                  }
                } catch (e) {}
              }
            }
          }

          output.innerHTML = `<span class="token">${escapeHtml(content)}</span>`

          const endTime = Date.now()
          stats.innerHTML = `
            <span>首字延迟: ${firstTokenTime - startTime}ms</span>
            <span>总耗时: ${endTime - startTime}ms</span>
            <span>Token数: ${tokenCount}</span>
          `
        } catch (error) {
          if (error.name === 'AbortError') {
            output.innerHTML += '\n<span class="error">[已停止]</span>'
          } else {
            output.innerHTML = `<span class="error">错误: ${error.message}</span>`
          }
        }
      }

      function stopChat() {
        if (currentAbortController) {
          currentAbortController.abort()
          currentAbortController = null
        }
      }

      // 场景测试
      async function fetchScenario(url) {
        const output = document.getElementById('scenarioOutput')
        output.innerHTML = ''
        stopScenario()

        currentAbortController = new AbortController()

        try {
          const response = await fetch(url, { signal: currentAbortController.signal })

          if (!response.ok) {
            const error = await response.json()
            output.innerHTML = `<span class="error">错误 ${response.status}: ${error.error?.message || '未知错误'}</span>`
            return
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const text = decoder.decode(value)
            const lines = text.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(line.slice(6))
                  const token = data.choices?.[0]?.delta?.content || ''
                  if (token) {
                    output.innerHTML += `<span class="token">${escapeHtml(token)}</span>`
                  }
                } catch (e) {
                  // 处理非 JSON 格式的事件
                  output.innerHTML += `<span class="event">${line}</span>\n`
                }
              }
            }
          }

          output.innerHTML += '\n<span class="info">[完成]</span>'
        } catch (error) {
          if (error.name === 'AbortError') {
            output.innerHTML += '\n<span class="error">[已停止]</span>'
          } else {
            output.innerHTML = `<span class="error">错误: ${error.message}</span>`
          }
        }
      }

      function testSlow() {
        fetchScenario('/api/test/slow?interval=300')
      }
      function testBurst() {
        fetchScenario('/api/test/burst')
      }
      function testLarge() {
        fetchScenario('/api/test/large?size=500')
      }
      function testTimeout() {
        fetchScenario('/api/test/timeout?stopAfter=3')
      }
      function testErrorMid() {
        fetchScenario('/api/test/error-mid')
      }
      function testErrorStart() {
        fetchScenario('/api/test/error-start?type=500')
      }
      function testTruncate() {
        fetchScenario('/api/test/truncate')
      }

      function stopScenario() {
        if (currentAbortController) {
          currentAbortController.abort()
          currentAbortController = null
        }
      }

      // 工具函数
      function escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
      }

      // 回车发送
      document.getElementById('chatInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendChat()
      })
    </script>
  </body>
</html>
```

---

## 四、运行和测试

### 4.1 启动服务器

```bash
# 进入项目目录
cd experiments/sse-test-server

# 安装依赖
npm install

# 启动服务器
npm start

# 或者使用开发模式（自动重启）
npm run dev
```

### 4.2 访问测试页面

打开浏览器访问：`http://localhost:3100`

### 4.3 使用 curl 测试

```bash
# 测试基础 SSE
curl -N http://localhost:3100/api/sse/basic

# 测试 OpenAI 兼容接口
curl -X POST http://localhost:3100/api/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hello"}],"stream":true}'

# 测试错误场景
curl http://localhost:3100/api/test/error-start?type=401
```

---

## 五、API 接口文档

### 5.1 基础 SSE 接口

| 接口               | 方法 | 参数            | 说明             |
| ------------------ | ---- | --------------- | ---------------- |
| `/api/sse/basic`     | GET  | -               | 基础流式文本     |
| `/api/sse/countdown` | GET  | count=10        | 倒计时           |
| `/api/sse/progress`  | GET  | steps=20        | 进度条           |
| `/api/sse/multiline` | GET  | -               | 多行代码         |

### 5.2 OpenAI 兼容接口

| 接口                   | 方法 | Body 参数                          | 说明           |
| ---------------------- | ---- | ---------------------------------- | -------------- |
| `/api/chat/completions` | POST | messages, stream, speed            | 聊天补全       |
| `/api/chat/echo`        | POST | messages, speed                    | 回声模式       |
| `/api/chat/custom`      | POST | response, interval, wordMode       | 自定义响应     |

### 5.3 场景测试接口

| 接口                  | 方法 | 参数          | 说明                 |
| --------------------- | ---- | ------------- | -------------------- |
| `/api/test/slow`       | GET  | interval=500  | 慢速流               |
| `/api/test/burst`      | GET  | -             | 突发流（不均匀速度） |
| `/api/test/large`      | GET  | size=1000     | 大数据量             |
| `/api/test/timeout`    | GET  | stopAfter=5   | 超时测试             |
| `/api/test/error-mid`  | GET  | -             | 中途错误             |
| `/api/test/error-start`| GET  | type=500      | 立即错误(400/401/429/500/503) |
| `/api/test/truncate`   | GET  | -             | 截断测试             |
| `/api/test/reconnect`  | GET  | -             | 重连测试             |
| `/api/test/keepalive`  | GET  | duration=30   | 心跳测试             |

---

## 六、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：基础搭建

- [ ] 创建了完整的项目结构
- [ ] 理解 Express 中间件的作用
- [ ] 能正确设置 SSE 响应头
- [ ] 能发送符合规范的 SSE 事件

### 第二层：功能实现

- [ ] 实现了基础 SSE 路由
- [ ] 实现了 OpenAI 兼容格式
- [ ] 实现了多种测试场景
- [ ] 创建了配套的测试页面

### 第三层：调试技能

- [ ] 能使用 curl 测试 SSE 接口
- [ ] 能使用浏览器 DevTools 查看 SSE 响应
- [ ] 能分析 SSE 事件流格式
- [ ] 能模拟各种错误场景

---

## 七、实践作业

### 作业 1：添加日志功能

**要求**：

- 记录每个请求的详细信息
- 统计每个接口的调用次数
- 记录响应的 token 数量和耗时
- 提供一个 `/api/stats` 接口查看统计

### 作业 2：实现流控制

**要求**：

- 添加一个 `/api/test/pause` 接口
- 支持暂停和恢复流式输出
- 通过另一个请求控制暂停/恢复

### 作业 3：模拟真实 LLM

**要求**：

- 实现更智能的响应生成
- 根据用户输入关键词返回不同内容
- 支持多轮对话（记住上下文）
- 模拟真实的 token 分割（按词/句）

---

## 八、常见问题排查

### Q1: 启动报错 "Cannot find module"

**原因**：依赖未安装

**解决**：运行 `npm install` 安装依赖

### Q2: 浏览器看不到流式效果

**原因**：浏览器缓存或代理缓冲

**解决**：

1. 确保设置了 `X-Accel-Buffering: no` 响应头
2. 清除浏览器缓存后重试
3. 检查是否有代理服务器

### Q3: curl 测试没有逐字输出

**原因**：curl 默认缓冲输出

**解决**：使用 `curl -N` 参数禁用缓冲

### Q4: 端口被占用

**原因**：3100 端口已被其他程序使用

**解决**：设置环境变量 `PORT=3200 npm start`

---

## 九、项目文件总结

完成本教程后，你的项目结构应该如下：

```
experiments/sse-test-server/
├── package.json           # 项目配置
├── server.js              # 主服务器
├── routes/
│   ├── basic.js           # 基础 SSE 路由
│   ├── openai.js          # OpenAI 兼容路由
│   └── scenarios.js       # 场景测试路由
├── utils/
│   └── sse-helper.js      # SSE 工具函数
└── public/
    └── index.html         # 测试页面
```

---

## 十、下一步学习方向

完成本节后，你可以深入以下方向：

1. **生产环境部署**

   - 添加认证机制
   - 实现速率限制
   - 添加监控和告警

2. **高级功能**

   - 支持 WebSocket 协议
   - 实现消息队列
   - 添加数据持久化

3. **测试自动化**

   - 编写单元测试
   - 实现集成测试
   - 添加压力测试

4. **与真实 API 集成**
   - 实现代理转发
   - 添加响应缓存
   - 支持故障转移

---

**拥有一个可控的 SSE 测试服务器，就像拥有一个随时可用的"训练场"。它让你能够在安全的环境中充分测试各种边界情况，为生产环境做好准备。**
