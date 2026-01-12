# Step 8: 流式输出（SSE）+ 前端渲染 - 学习 EventSource / SSE 协议基础

## 学习目标

这个任务的本质是回答一个核心问题：**如何让 LLM 的响应像"打字机"一样逐字显示，而不是等待全部生成完才展示给用户**。

通过本教程，你将：

1. 理解 SSE（Server-Sent Events）协议的工作原理
2. 掌握 EventSource API 的使用方法
3. 实现前端流式渲染 LLM 响应
4. 处理流式输出中的错误和重连

---

## 一、核心认知：为什么需要流式输出？

### 1.1 传统请求 vs 流式请求

```
┌─────────────────────────────────────────────────────────────┐
│                 传统请求 vs 流式请求                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   传统请求（Request-Response）                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  客户端 ──请求──> 服务端                          │       │
│   │                    │                            │       │
│   │                    │ (等待 5-30 秒...)           │       │
│   │                    ▼                            │       │
│   │  客户端 <──完整响应── 服务端                      │       │
│   │                                                 │       │
│   │  用户体验：漫长等待 → 突然出现大段文字              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   流式请求（Streaming）                                      │
│   ┌─────────────────────────────────────────────────┐       │
│   │  客户端 ──请求──> 服务端                          │       │
│   │                    │                            │       │
│   │  客户端 <──"你"──   │                            │       │
│   │  客户端 <──"好"──   │                            │       │
│   │  客户端 <──"，"──   │                            │       │
│   │  客户端 <──"我"──   │                            │       │
│   │  客户端 <──"是"──   │  (实时推送)                 │       │
│   │  客户端 <──"AI"──   │                            │       │
│   │  客户端 <──"..."──  ▼                            │       │
│   │                                                 │       │
│   │  用户体验：即时反馈 → 看到文字逐字"打"出来         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 流式输出的优势

| 维度         | 传统请求           | 流式请求                 |
| ------------ | ------------------ | ------------------------ |
| **首字延迟** | 5-30 秒            | 几百毫秒                 |
| **用户体验** | 长时间白屏等待     | 即时反馈，像对话一样自然 |
| **感知速度** | 感觉很慢           | 感觉很快（实际一样快）   |
| **中断处理** | 等到最后才知道失败 | 立即知道是否出问题       |
| **取消操作** | 无法中途取消       | 可以随时中断             |

### 1.3 首字延迟（Time to First Token）

```
┌─────────────────────────────────────────────────────────────┐
│              首字延迟（TTFT）概念                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   TTFT = Time to First Token                                │
│   从发送请求到收到第一个 token 的时间                          │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │  发送请求    收到第一个 token     收到最后一个 token│       │
│   │     │             │                    │        │       │
│   │     ▼             ▼                    ▼        │       │
│   │  ───┼─────────────┼────────────────────┼───>    │       │
│   │     │<── TTFT ───>│<─── 生成过程 ──────>│        │       │
│   │                                                 │       │
│   │  TTFT 决定用户何时开始看到响应                    │       │
│   │  流式输出让用户在 TTFT 后就开始看到内容             │       │
│   │  而不用等到整个生成过程结束                        │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、SSE 协议基础

### 2.1 什么是 SSE？

```
┌─────────────────────────────────────────────────────────────┐
│               SSE（Server-Sent Events）                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   定义：一种服务器向客户端单向推送消息的协议                    │
│                                                             │
│   特点：                                                     │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 基于 HTTP 协议（不需要 WebSocket）            │       │
│   │  2. 单向通信：服务器 → 客户端                     │       │
│   │  3. 纯文本格式，简单易懂                          │       │
│   │  4. 自动重连机制                                  │       │
│   │  5. 浏览器原生支持（EventSource API）             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   SSE vs WebSocket：                                        │
│   ┌───────────────┬──────────────┬────────────────┐        │
│   │    特性       │     SSE      │   WebSocket    │        │
│   ├───────────────┼──────────────┼────────────────┤        │
│   │   通信方向    │   单向       │    双向        │        │
│   │   协议        │   HTTP       │   独立协议     │        │
│   │   复杂度      │   简单       │    复杂        │        │
│   │   自动重连    │   内置       │    需要实现    │        │
│   │   数据格式    │   纯文本     │    任意        │        │
│   │   适用场景    │  实时推送    │   实时交互     │        │
│   └───────────────┴──────────────┴────────────────┘        │
│                                                             │
│   LLM 流式输出非常适合用 SSE，因为：                           │
│   - 只需要服务器向客户端推送（单向）                           │
│   - 数据是纯文本（token 文本）                                │
│   - 简单可靠，易于实现                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 SSE 数据格式

```
┌─────────────────────────────────────────────────────────────┐
│                    SSE 数据格式                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   HTTP 响应头：                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Content-Type: text/event-stream                │       │
│   │  Cache-Control: no-cache                        │       │
│   │  Connection: keep-alive                         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   事件格式：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  event: message          ← 事件类型（可选）       │       │
│   │  id: 1                   ← 事件 ID（可选）        │       │
│   │  retry: 3000             ← 重连间隔毫秒（可选）    │       │
│   │  data: {"content":"你"}  ← 数据内容（必需）       │       │
│   │                          ← 空行表示事件结束       │       │
│   │  data: {"content":"好"}                         │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键规则：                                                 │
│   - 每个字段占一行，格式为 "字段名: 值"                        │
│   - data 字段可以有多行，用 "data: " 开头                     │
│   - 事件之间用空行分隔                                        │
│   - 流结束时发送 "data: [DONE]"（OpenAI 风格）                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 实际的 SSE 响应示例

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"你"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"好"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"！"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"我"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"是"}}]}

data: {"id":"chatcmpl-123","choices":[{"delta":{"content":"AI"}}]}

data: [DONE]
```

---

## 三、EventSource API 详解

### 3.1 基础用法

```
┌─────────────────────────────────────────────────────────────┐
│                 EventSource 基础用法                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   创建连接：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const eventSource = new EventSource('/api/sse')│       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   监听事件：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  // 监听 message 事件（默认）                    │       │
│   │  eventSource.onmessage = (event) => {           │       │
│   │    console.log(event.data)                      │       │
│   │  }                                              │       │
│   │                                                 │       │
│   │  // 监听自定义事件                               │       │
│   │  eventSource.addEventListener('custom', (e) => {│       │
│   │    console.log(e.data)                          │       │
│   │  })                                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   错误处理：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  eventSource.onerror = (error) => {             │       │
│   │    console.error('SSE 错误:', error)            │       │
│   │  }                                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关闭连接：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  eventSource.close()                            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 EventSource 连接状态

```
┌─────────────────────────────────────────────────────────────┐
│                EventSource 连接状态                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   readyState 属性：                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │   EventSource.CONNECTING = 0  // 正在连接        │       │
│   │   EventSource.OPEN = 1        // 已连接          │       │
│   │   EventSource.CLOSED = 2      // 已关闭          │       │
│   │                                                 │       │
│   │   状态流转：                                     │       │
│   │                                                 │       │
│   │   CONNECTING ──成功──> OPEN ──关闭──> CLOSED    │       │
│   │        │                 │                      │       │
│   │        │                 │                      │       │
│   │        └──失败后自动重连──┘                      │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   自动重连机制：                                              │
│   - 连接断开时，浏览器会自动尝试重连                           │
│   - 默认重连间隔：3 秒                                        │
│   - 可通过服务器的 retry 字段自定义                            │
│   - 手动 close() 后不会自动重连                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 EventSource 的局限性

```
┌─────────────────────────────────────────────────────────────┐
│               EventSource 的局限性                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 只支持 GET 请求                                         │
│      - 不能发送 POST 请求                                    │
│      - 不能设置请求体                                        │
│      - 数据只能通过 URL 参数传递                              │
│                                                             │
│   2. 不能设置自定义请求头                                     │
│      - 不能发送 Authorization 头                             │
│      - 不能发送 Content-Type 头                              │
│                                                             │
│   3. 解决方案：使用 Fetch API + ReadableStream               │
│      - 支持 POST 请求                                        │
│      - 支持自定义请求头                                       │
│      - 更灵活的控制                                          │
│                                                             │
│   LLM API 通常需要：                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  POST /api/chat                                 │       │
│   │  Content-Type: application/json                 │       │
│   │  Authorization: Bearer sk-xxx                   │       │
│   │                                                 │       │
│   │  {"messages": [...], "stream": true}            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   因此，对于 LLM 流式调用，推荐使用 Fetch API！               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、实践：使用 OpenAI SDK 处理流式输出

### 4.1 基础流式请求

创建 `experiments/sse-basic.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 基础流式输出演示
 * 观察 token 是如何一个个返回的
 */
async function basicStreamDemo() {
  console.log('=== 基础流式输出演示 ===\n')
  console.log('提问：用简单的话解释什么是 SSE？\n')
  console.log('回答：', '')

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '用简单的话解释什么是 SSE？' }],
    stream: true, // 启用流式输出
  })

  // 逐个处理 token
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ''
    process.stdout.write(content) // 不换行输出
  }

  console.log('\n\n--- 流式输出完成 ---')
}

basicStreamDemo().catch(console.error)
```

运行：

```bash
node experiments/sse-basic.js
```

**预期观察**：

- 文字像打字一样逐字出现
- 不再是等待很久后突然显示

### 4.2 分析流式响应结构

创建 `experiments/sse-structure.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 分析流式响应的数据结构
 */
async function analyzeStreamStructure() {
  console.log('=== 分析流式响应结构 ===\n')

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '说三个字' }],
    stream: true,
  })

  let chunkIndex = 0

  for await (const chunk of stream) {
    console.log(`\n--- Chunk ${chunkIndex++} ---`)
    console.log('完整数据:', JSON.stringify(chunk, null, 2))
    console.log('delta 内容:', chunk.choices[0]?.delta)
    console.log('finish_reason:', chunk.choices[0]?.finish_reason)
  }

  console.log('\n=== 分析完成 ===')
  console.log(`
关键发现：
1. 每个 chunk 包含一个 delta 对象
2. delta.content 是本次返回的 token 内容
3. delta.role 只在第一个 chunk 中出现
4. finish_reason 只在最后一个 chunk 中有值
5. 最后一个 chunk 的 finish_reason 是 "stop"
`)
}

analyzeStreamStructure().catch(console.error)
```

### 4.3 流式输出统计

创建 `experiments/sse-stats.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 统计流式输出的性能指标
 */
async function streamWithStats() {
  console.log('=== 流式输出性能统计 ===\n')

  const startTime = Date.now()
  let firstTokenTime = null
  let tokenCount = 0
  let fullContent = ''

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: '写一首关于编程的四行小诗' }],
    stream: true,
  })

  console.log('回答：')

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content || ''

    if (content && !firstTokenTime) {
      firstTokenTime = Date.now()
    }

    if (content) {
      tokenCount++
      fullContent += content
      process.stdout.write(content)
    }
  }

  const endTime = Date.now()

  console.log('\n\n--- 性能统计 ---')
  console.log(`首字延迟 (TTFT): ${firstTokenTime - startTime} ms`)
  console.log(`总耗时: ${endTime - startTime} ms`)
  console.log(`Token 数量: ${tokenCount}`)
  console.log(`平均每 Token 耗时: ${((endTime - firstTokenTime) / tokenCount).toFixed(2)} ms`)
  console.log(`内容长度: ${fullContent.length} 字符`)
}

streamWithStats().catch(console.error)
```

---

## 五、前端流式渲染实现

### 5.1 使用 Fetch API 处理流式响应

```
┌─────────────────────────────────────────────────────────────┐
│              Fetch API 处理 SSE 流程                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 发送 fetch 请求                              │       │
│   │     const response = await fetch('/api/chat', { │       │
│   │       method: 'POST',                           │       │
│   │       headers: {...},                           │       │
│   │       body: JSON.stringify({...})               │       │
│   │     })                                          │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  2. 获取 ReadableStream                         │       │
│   │     const reader = response.body.getReader()    │       │
│   │     const decoder = new TextDecoder()           │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  3. 循环读取数据块                               │       │
│   │     while (true) {                              │       │
│   │       const { done, value } = await reader.read()│       │
│   │       if (done) break                           │       │
│   │       const text = decoder.decode(value)        │       │
│   │       // 解析并渲染                              │       │
│   │     }                                           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 推荐的渲染策略：缓冲 + requestAnimationFrame

```
┌─────────────────────────────────────────────────────────────┐
│                两种渲染策略对比                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 即时渲染（不推荐）                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  每收到一个 token → 立即更新 DOM                  │       │
│   │                                                 │       │
│   │  问题：                                          │       │
│   │  - DOM 更新非常频繁（每秒几十次）                 │       │
│   │  - 可能导致页面卡顿                              │       │
│   │  - 浏览器无法批量处理                            │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 缓冲渲染（推荐）                                         │
│   ┌─────────────────────────────────────────────────┐       │
│   │  收到 token → 放入缓冲区                         │       │
│   │  每帧（~16ms） → 统一更新 DOM                    │       │
│   │                                                 │       │
│   │  优点：                                          │       │
│   │  - DOM 更新频率与屏幕刷新率同步                   │       │
│   │  - 页面流畅不卡顿                                │       │
│   │  - 利用浏览器的渲染优化                           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 缓冲渲染实现代码

```javascript
const output = document.querySelector('#output')
let buffer = ''
let scheduled = false

function flush() {
  output.textContent += buffer
  buffer = ''
  scheduled = false
}

function enqueue(text) {
  buffer += text
  if (!scheduled) {
    scheduled = true
    requestAnimationFrame(flush)
  }
}

// 使用示例
source.addEventListener('delta', event => {
  const payload = JSON.parse(event.data)
  enqueue(payload.text)
})
```

### 5.4 完整前端实现示例

创建 `experiments/sse-frontend.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SSE 流式输出演示</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
        background: #f5f5f5;
      }
      .container {
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
      h1 {
        color: #333;
        margin-bottom: 24px;
      }
      .input-group {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
      }
      input {
        flex: 1;
        padding: 12px 16px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
      }
      button {
        padding: 12px 24px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 16px;
        cursor: pointer;
      }
      button:hover {
        background: #0056b3;
      }
      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
      .output {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 16px;
        min-height: 200px;
        white-space: pre-wrap;
        font-size: 15px;
        line-height: 1.6;
      }
      .stats {
        margin-top: 16px;
        padding: 12px;
        background: #e9ecef;
        border-radius: 8px;
        font-size: 14px;
        color: #666;
      }
      .cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: #333;
        animation: blink 1s infinite;
        vertical-align: text-bottom;
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
    <div class="container">
      <h1>SSE 流式输出演示</h1>
      <div class="input-group">
        <input type="text" id="prompt" placeholder="输入你的问题..." value="用简单的话解释什么是机器学习？" />
        <button id="sendBtn" onclick="sendMessage()">发送</button>
        <button id="stopBtn" onclick="stopStream()" disabled>停止</button>
      </div>
      <div class="output" id="output">等待输入...</div>
      <div class="stats" id="stats"></div>
    </div>

    <script>
      let abortController = null
      let startTime = null
      let firstTokenTime = null
      let tokenCount = 0

      // 缓冲渲染机制
      let buffer = ''
      let scheduled = false
      const output = document.getElementById('output')

      function flush() {
        output.innerHTML = buffer + '<span class="cursor"></span>'
        scheduled = false
      }

      function enqueue(text) {
        buffer += text
        if (!scheduled) {
          scheduled = true
          requestAnimationFrame(flush)
        }
      }

      async function sendMessage() {
        const prompt = document.getElementById('prompt').value
        const stats = document.getElementById('stats')
        const sendBtn = document.getElementById('sendBtn')
        const stopBtn = document.getElementById('stopBtn')

        if (!prompt.trim()) return

        // 重置状态
        buffer = ''
        output.innerHTML = '<span class="cursor"></span>'
        stats.textContent = ''
        sendBtn.disabled = true
        stopBtn.disabled = false
        startTime = Date.now()
        firstTokenTime = null
        tokenCount = 0

        abortController = new AbortController()

        try {
          const response = await fetch('/api/llm/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: prompt }],
            }),
            signal: abortController.signal,
          })

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const text = decoder.decode(value, { stream: true })
            const lines = text.split('\n')

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6)
                if (data === '[DONE]') continue

                try {
                  const parsed = JSON.parse(data)
                  const content = parsed.choices?.[0]?.delta?.content || ''

                  if (content) {
                    if (!firstTokenTime) firstTokenTime = Date.now()
                    tokenCount++
                    enqueue(content)
                  }
                } catch (e) {
                  /* 忽略解析错误 */
                }
              }
            }
          }

          // 完成后移除光标
          output.textContent = buffer

          // 显示统计
          const endTime = Date.now()
          stats.innerHTML = `
          <strong>性能统计：</strong><br>
          首字延迟 (TTFT): ${firstTokenTime - startTime} ms<br>
          总耗时: ${endTime - startTime} ms<br>
          Token 数量: ${tokenCount}
        `
        } catch (error) {
          if (error.name === 'AbortError') {
            output.textContent = buffer + '\n\n[已停止]'
          } else {
            output.textContent = `错误: ${error.message}`
          }
        } finally {
          sendBtn.disabled = false
          stopBtn.disabled = true
        }
      }

      function stopStream() {
        if (abortController) abortController.abort()
      }

      document.getElementById('prompt').addEventListener('keypress', e => {
        if (e.key === 'Enter') sendMessage()
      })
    </script>
  </body>
</html>
```

---

## 六、后端 SSE 接口实现

### 6.1 创建 SSE 服务端（Node.js 原生）

创建 `experiments/sse-server.js` 文件：

```javascript
import http from 'http'

const server = http.createServer((req, res) => {
  if (req.url === '/sse') {
    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })

    // 设置重连时间
    res.write('retry: 3000\n\n')

    let id = 0
    const text = '你好，这是 SSE 流式输出演示！每个字符都会逐个发送...'

    const timer = setInterval(() => {
      const chunk = text[id % text.length]
      id += 1

      // 发送 SSE 格式的事件
      res.write(`id: ${id}\n`)
      res.write('event: delta\n')
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`)

      if (id >= text.length) {
        res.write('event: done\n')
        res.write('data: [DONE]\n\n')
        clearInterval(timer)
      }
    }, 100)

    // 客户端断开时清理
    req.on('close', () => {
      clearInterval(timer)
    })

    return
  }

  // 返回演示页面
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SSE Demo</title>
  <style>
    body { font-family: system-ui; padding: 24px; }
    #output { font-size: 18px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>SSE 流式输出 Demo</h1>
  <div id="output"></div>
  <script>
    const output = document.querySelector('#output')
    let buffer = ''
    let scheduled = false

    function flush() {
      output.textContent += buffer
      buffer = ''
      scheduled = false
    }

    function enqueue(text) {
      buffer += text
      if (!scheduled) {
        scheduled = true
        requestAnimationFrame(flush)
      }
    }

    const source = new EventSource('/sse')

    source.addEventListener('delta', event => {
      const payload = JSON.parse(event.data)
      enqueue(payload.text)
    })

    source.addEventListener('done', () => {
      source.close()
      enqueue('\\n\\n[完成]')
    })
  </script>
</body>
</html>
`)
})

server.listen(3100, () => {
  console.log('SSE 演示服务器运行在 http://localhost:3100')
})
```

运行：

```bash
node experiments/sse-server.js
```

打开浏览器访问 `http://localhost:3100`

---

## 七、流式 vs 非流式对比实验

创建 `experiments/sse-comparison.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

const TEST_PROMPT = '详细解释什么是神经网络，包括基本概念、工作原理和应用场景。'

/**
 * 非流式请求
 */
async function nonStreamRequest() {
  console.log('=== 非流式请求 ===\n')

  const startTime = Date.now()

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: TEST_PROMPT }],
    stream: false,
  })

  const endTime = Date.now()
  const content = response.choices[0].message.content

  console.log('内容预览:', content.substring(0, 100) + '...\n')
  console.log('统计:')
  console.log(`  - 首字延迟: ${endTime - startTime} ms（等于总耗时）`)
  console.log(`  - 总耗时: ${endTime - startTime} ms`)

  return { ttft: endTime - startTime, total: endTime - startTime }
}

/**
 * 流式请求
 */
async function streamRequest() {
  console.log('\n=== 流式请求 ===\n')

  const startTime = Date.now()
  let firstTokenTime = null
  let content = ''

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: TEST_PROMPT }],
    stream: true,
  })

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || ''
    if (token && !firstTokenTime) {
      firstTokenTime = Date.now()
    }
    content += token
  }

  const endTime = Date.now()

  console.log('内容预览:', content.substring(0, 100) + '...\n')
  console.log('统计:')
  console.log(`  - 首字延迟: ${firstTokenTime - startTime} ms`)
  console.log(`  - 总耗时: ${endTime - startTime} ms`)

  return { ttft: firstTokenTime - startTime, total: endTime - startTime }
}

/**
 * 对比实验
 */
async function comparison() {
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║           流式 vs 非流式 对比实验                          ║')
  console.log('╚═══════════════════════════════════════════════════════════╝\n')

  const nonStream = await nonStreamRequest()
  const stream = await streamRequest()

  console.log('\n╔═══════════════════════════════════════════════════════════╗')
  console.log('║                     对比结果                              ║')
  console.log('╠═══════════════════════════════════════════════════════════╣')
  console.log(`║  指标        │   非流式       │    流式        │  提升   ║`)
  console.log('╠───────────────────────────────────────────────────────────╣')

  const ttftImprovement = (((nonStream.ttft - stream.ttft) / nonStream.ttft) * 100).toFixed(0)
  console.log(
    `║  首字延迟    │   ${String(nonStream.ttft).padStart(6)} ms   │   ${String(stream.ttft).padStart(
      6
    )} ms   │  ${ttftImprovement}%   ║`
  )
  console.log(
    `║  总耗时      │   ${String(nonStream.total).padStart(6)} ms   │   ${String(stream.total).padStart(
      6
    )} ms   │  ~0%   ║`
  )
  console.log('╚═══════════════════════════════════════════════════════════╝')

  console.log(`
关键发现：
1. 首字延迟（TTFT）：流式输出显著更快，提升约 ${ttftImprovement}%
2. 总耗时：两者基本相同
3. 用户体验：流式输出让用户更早看到响应，感知速度更快
`)
}

comparison().catch(console.error)
```

运行：

```bash
node experiments/sse-comparison.js
```

---

## 八、处理流式输出的边界情况

### 8.1 错误处理策略

```
┌─────────────────────────────────────────────────────────────┐
│                流式输出错误处理                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   常见错误类型：                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 网络错误 - 连接断开、超时                    │       │
│   │  2. API 错误 - 认证失败、配额用尽                │       │
│   │  3. 解析错误 - 数据格式异常                      │       │
│   │  4. 用户取消 - 主动中断请求                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   处理策略：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  网络错误 → 显示重试按钮                         │       │
│   │  API 错误 → 显示具体错误信息                     │       │
│   │  解析错误 → 跳过该 chunk，继续处理               │       │
│   │  用户取消 → 保留已接收内容                       │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 健壮的流式处理实现

创建 `experiments/sse-robust.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 健壮的流式输出处理类
 */
class RobustStreamHandler {
  constructor(options = {}) {
    this.onToken = options.onToken || (() => {})
    this.onError = options.onError || console.error
    this.onComplete = options.onComplete || (() => {})
    this.onStart = options.onStart || (() => {})

    this.content = ''
    this.tokenCount = 0
    this.aborted = false
  }

  async send(messages) {
    this.content = ''
    this.tokenCount = 0
    this.aborted = false

    const startTime = Date.now()
    let firstTokenTime = null

    try {
      this.onStart()

      const stream = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: messages,
        stream: true,
      })

      for await (const chunk of stream) {
        if (this.aborted) break

        const content = chunk.choices[0]?.delta?.content
        const finishReason = chunk.choices[0]?.finish_reason

        if (content) {
          if (!firstTokenTime) firstTokenTime = Date.now()
          this.content += content
          this.tokenCount++
          this.onToken(content, this.content)
        }

        if (finishReason === 'stop') break
        if (finishReason === 'length') {
          this.onError(new Error('输出被截断：达到 max_tokens 限制'))
        }
      }

      const endTime = Date.now()

      this.onComplete({
        content: this.content,
        tokenCount: this.tokenCount,
        ttft: firstTokenTime ? firstTokenTime - startTime : null,
        totalTime: endTime - startTime,
        aborted: this.aborted,
      })
    } catch (error) {
      if (error.name === 'AbortError') {
        this.onComplete({ content: this.content, aborted: true })
      } else if (error.status === 401) {
        this.onError(new Error('认证失败：请检查 API Key'))
      } else if (error.status === 429) {
        this.onError(new Error('请求过于频繁：请稍后重试'))
      } else {
        this.onError(error)
      }
    }
  }

  abort() {
    this.aborted = true
  }
}

// 演示
async function demo() {
  console.log('=== 健壮的流式输出处理演示 ===\n')

  const handler = new RobustStreamHandler({
    onStart: () => console.log('[开始] 正在连接...\n'),
    onToken: token => process.stdout.write(token),
    onError: error => console.error('\n[错误]', error.message),
    onComplete: stats => {
      console.log('\n\n[完成] 统计信息:')
      console.log(`  - Token 数量: ${stats.tokenCount}`)
      console.log(`  - 首字延迟: ${stats.ttft} ms`)
      console.log(`  - 总耗时: ${stats.totalTime} ms`)
    },
  })

  await handler.send([{ role: 'user', content: '写一首关于代码的诗，四行即可' }])
}

demo().catch(console.error)
```

---

## 九、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：概念理解

- [ ] 理解流式输出的优势和应用场景
- [ ] 理解 SSE 协议的基本原理
- [ ] 知道 SSE 与 WebSocket 的区别
- [ ] 理解首字延迟（TTFT）的概念

### 第二层：API 掌握

- [ ] 掌握 EventSource API 的基本用法
- [ ] 了解 EventSource 的局限性
- [ ] 掌握使用 Fetch API 处理流式响应
- [ ] 理解 ReadableStream 的使用方法

### 第三层：实践能力

- [ ] 运行了基础流式输出演示
- [ ] 分析了流式响应的数据结构
- [ ] 实现了流式输出性能统计
- [ ] 完成了前端流式渲染实现
- [ ] 运行了流式 vs 非流式对比实验

### 综合能力

- [ ] 能处理流式输出中的错误情况
- [ ] 能实现用户中断流式请求
- [ ] 能在前端实现"打字机"效果
- [ ] 能使用缓冲 + requestAnimationFrame 优化渲染

---

## 十、实践作业

### 作业 1：实时打字效果

**要求**：

- 实现一个前端页面，展示 LLM 的流式回复
- 添加光标闪烁效果
- 支持用户中途停止生成
- 显示实时的 Token 计数和 TTFT

### 作业 2：流式 Markdown 渲染

**要求**：

- 在流式输出过程中实时渲染 Markdown
- 处理代码块的语法高亮
- 处理不完整 Markdown 标记的边界情况

### 作业 3：多轮对话流式实现

**要求**：

- 实现支持多轮对话的流式聊天界面
- 维护对话历史
- 每条消息都使用流式输出
- 支持清空对话历史

---

## 十一、常见问题排查

### Q1: 流式输出没有逐字显示，而是一大段一起出现

**原因**：服务器端有缓冲，或者前端没有正确处理流

**解决**：

1. 服务器添加 `X-Accel-Buffering: no` 响应头
2. 确保 Nginx 等代理配置了 `proxy_buffering off`
3. 检查前端是否正确使用 `getReader()` 读取流

### Q2: EventSource 连接被频繁重连

**原因**：服务器返回的不是有效的 SSE 格式

**解决**：

1. 确保响应头包含 `Content-Type: text/event-stream`
2. 确保每个事件以空行结尾
3. 检查服务器是否正确发送 `data:` 前缀

### Q3: 前端收到的数据不完整或格式错误

**原因**：SSE 数据被拆分成多个 chunk

**解决**：

1. 使用 buffer 累积数据，按完整行解析
2. 检查数据是否以 `\n\n` 结尾后再解析
3. 处理跨 chunk 的数据拼接

### Q4: 用户取消请求后服务器仍在生成

**原因**：服务器没有检测到连接断开

**解决**：

1. 前端使用 `AbortController` 发送取消信号
2. 服务器监听 `req.on('close')` 事件
3. 收到关闭事件后停止调用 LLM API

---

## 十二、项目文件总结

完成本教程后，你的练习文件应该包括：

```
experiments/
├── sse-basic.js          # 基础流式输出演示
├── sse-structure.js      # 流式响应结构分析
├── sse-stats.js          # 流式输出性能统计
├── sse-frontend.html     # 前端流式渲染页面
├── sse-server.js         # SSE 后端服务
├── sse-robust.js         # 健壮的流式处理
└── sse-comparison.js     # 流式vs非流式对比
```

---

## 十三、下一步学习方向

完成本节后，你可以深入以下方向：

1. **高级渲染技术**

   - 流式 Markdown 解析与渲染
   - 代码块语法高亮
   - LaTeX 公式渲染

2. **用户体验优化**

   - 打字机动画效果
   - 骨架屏加载提示
   - 进度条显示

3. **性能优化**

   - 虚拟滚动处理长内容
   - 内存管理与垃圾回收
   - 并发请求控制

4. **生产环境实践**
   - 错误监控与告警
   - 请求日志与分析
   - 熔断与限流策略

---

**掌握流式输出技术，就是掌握了提升 LLM 应用用户体验的关键。虽然总耗时不变，但即时反馈让用户感觉"快了很多"——这就是流式输出的魔力。**
