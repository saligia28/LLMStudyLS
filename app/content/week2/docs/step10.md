# Step 10: 前端流式渲染 - 用 Fetch + ReadableStream 实现"打字机"效果

## 学习目标

这个任务的本质是回答一个核心问题：**如何在前端优雅地处理 SSE 流式响应，实现像 ChatGPT 一样的"打字机"效果**。

通过本教程，你将：

1. 掌握 Fetch API 处理流式响应的完整流程
2. 理解 ReadableStream 和 TextDecoder 的使用
3. 实现流畅的"打字机"渲染效果
4. 学会性能优化技巧（缓冲渲染）

---

## 一、核心认知：Fetch + ReadableStream 工作原理

### 1.1 为什么选择 Fetch 而不是 EventSource？

```
┌─────────────────────────────────────────────────────────────┐
│           EventSource vs Fetch + ReadableStream             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   EventSource 的局限：                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  ❌ 只支持 GET 请求                              │       │
│   │  ❌ 无法设置请求头（如 Authorization）            │       │
│   │  ❌ 无法发送请求体                               │       │
│   │  ❌ 无法精确控制连接                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   Fetch + ReadableStream 的优势：                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  ✅ 支持所有 HTTP 方法（POST/GET/PUT...）        │       │
│   │  ✅ 可以设置任意请求头                           │       │
│   │  ✅ 可以发送 JSON 请求体                         │       │
│   │  ✅ 可以使用 AbortController 取消请求            │       │
│   │  ✅ 更灵活的错误处理                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   结论：对于 LLM API，Fetch + ReadableStream 是更好的选择    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 数据流动过程

```
┌─────────────────────────────────────────────────────────────┐
│              Fetch 流式响应处理流程                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 发送请求                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const response = await fetch(url, options)     │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   2. 获取 ReadableStream                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const reader = response.body.getReader()       │       │
│   │  const decoder = new TextDecoder()              │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   3. 循环读取数据块                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  while (true) {                                 │       │
│   │    const { done, value } = await reader.read()  │       │
│   │    if (done) break                              │       │
│   │    const text = decoder.decode(value)           │       │
│   │    // 解析 SSE 格式，提取 token                  │       │
│   │  }                                              │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   4. 渲染到页面                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  outputElement.textContent += token             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、基础实现：最简单的流式渲染

### 2.1 核心代码结构

创建 `experiments/stream-render/basic.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>基础流式渲染</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
      }
      .output {
        background: #f5f5f5;
        padding: 20px;
        border-radius: 8px;
        min-height: 100px;
        white-space: pre-wrap;
        line-height: 1.6;
      }
      button {
        padding: 10px 20px;
        margin: 10px 5px 10px 0;
        cursor: pointer;
      }
    </style>
  </head>
  <body>
    <h1>基础流式渲染演示</h1>
    <button onclick="startStream()">开始</button>
    <div class="output" id="output">等待开始...</div>

    <script>
      async function startStream() {
        const output = document.getElementById('output')
        output.textContent = ''

        // 1. 发送请求
        const response = await fetch('/api/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '讲一个简短的故事' }],
            stream: true,
          }),
        })

        // 2. 获取 ReadableStream
        const reader = response.body.getReader()
        const decoder = new TextDecoder()

        // 3. 循环读取
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            console.log('流结束')
            break
          }

          // 4. 解码二进制数据为文本
          const chunk = decoder.decode(value, { stream: true })

          // 5. 解析 SSE 格式
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6))
                const token = json.choices?.[0]?.delta?.content || ''
                // 6. 渲染到页面
                output.textContent += token
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }
    </script>
  </body>
</html>
```

### 2.2 关键 API 详解

```
┌─────────────────────────────────────────────────────────────┐
│                    关键 API 详解                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. response.body.getReader()                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  返回一个 ReadableStreamDefaultReader 对象       │       │
│   │  用于逐块读取响应体数据                          │       │
│   │  每个 reader 只能被获取一次                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. reader.read()                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  返回 Promise<{ done: boolean, value: Uint8Array }>│     │
│   │  done: true 表示流结束                           │       │
│   │  value: 本次读取的二进制数据块                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. TextDecoder                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  将 Uint8Array 解码为字符串                      │       │
│   │  { stream: true } 处理跨块的多字节字符           │       │
│   │  默认使用 UTF-8 编码                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、进阶实现：处理 SSE 数据边界问题

### 3.1 问题：数据可能被拆分

```
┌─────────────────────────────────────────────────────────────┐
│                   SSE 数据边界问题                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   理想情况：每个 chunk 包含完整的 SSE 事件                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  chunk 1: "data: {\"content\":\"你\"}\n\n"      │       │
│   │  chunk 2: "data: {\"content\":\"好\"}\n\n"      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   实际情况：数据可能在任意位置被拆分                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  chunk 1: "data: {\"content\":\""               │       │
│   │  chunk 2: "你\"}\n\ndata: {\"content\":\"好"    │       │
│   │  chunk 3: "\"}\n\n"                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   解决方案：使用缓冲区累积数据，按完整行处理                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 健壮的 SSE 解析器

创建 `experiments/stream-render/sse-parser.js` 文件：

```javascript
/**
 * SSE 解析器类
 * 处理数据边界问题，确保正确解析 SSE 事件
 */
export class SSEParser {
  constructor() {
    this.buffer = ''
  }

  /**
   * 解析 SSE 数据块
   * @param {string} chunk - 原始数据块
   * @returns {Array} 解析出的事件数组
   */
  parse(chunk) {
    this.buffer += chunk
    const events = []

    // SSE 事件以双换行符分隔
    const parts = this.buffer.split('\n\n')

    // 最后一部分可能不完整，保留在缓冲区
    this.buffer = parts.pop() || ''

    for (const part of parts) {
      if (!part.trim()) continue

      const event = this.parseEvent(part)
      if (event) {
        events.push(event)
      }
    }

    return events
  }

  /**
   * 解析单个 SSE 事件
   * @param {string} eventStr - 事件字符串
   * @returns {Object|null} 解析后的事件对象
   */
  parseEvent(eventStr) {
    const lines = eventStr.split('\n')
    const event = {
      type: 'message',
      data: '',
      id: null,
      retry: null,
    }

    for (const line of lines) {
      if (line.startsWith('event:')) {
        event.type = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        // data 可以有多行，需要拼接
        if (event.data) {
          event.data += '\n'
        }
        event.data += line.slice(5).trim()
      } else if (line.startsWith('id:')) {
        event.id = line.slice(3).trim()
      } else if (line.startsWith('retry:')) {
        event.retry = parseInt(line.slice(6).trim(), 10)
      }
    }

    // 检查是否是结束标识
    if (event.data === '[DONE]') {
      return { type: 'done', data: null }
    }

    // 尝试解析 JSON
    if (event.data) {
      try {
        event.data = JSON.parse(event.data)
      } catch (e) {
        // 保持原始字符串
      }
    }

    return event.data ? event : null
  }

  /**
   * 重置解析器
   */
  reset() {
    this.buffer = ''
  }
}
```

### 3.3 使用 SSE 解析器的完整示例

创建 `experiments/stream-render/robust.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>健壮的流式渲染</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
      }
      .output {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 20px;
        border-radius: 8px;
        min-height: 150px;
        white-space: pre-wrap;
        line-height: 1.6;
        font-family: 'Consolas', monospace;
      }
      .cursor {
        display: inline-block;
        width: 8px;
        height: 18px;
        background: #d4d4d4;
        animation: blink 1s infinite;
        vertical-align: text-bottom;
        margin-left: 2px;
      }
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      button {
        padding: 12px 24px;
        margin: 10px 5px 10px 0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }
      .btn-primary { background: #007bff; color: white; }
      .btn-primary:hover { background: #0056b3; }
      .stats {
        margin-top: 15px;
        padding: 10px;
        background: #e9ecef;
        border-radius: 6px;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <h1>健壮的流式渲染</h1>
    <button class="btn-primary" onclick="startStream()">开始流式请求</button>
    <div class="output" id="output">等待开始...<span class="cursor" id="cursor" style="display:none"></span></div>
    <div class="stats" id="stats"></div>

    <script type="module">
      // SSE 解析器（内联版本）
      class SSEParser {
        constructor() {
          this.buffer = ''
        }

        parse(chunk) {
          this.buffer += chunk
          const events = []
          const parts = this.buffer.split('\n\n')
          this.buffer = parts.pop() || ''

          for (const part of parts) {
            if (!part.trim()) continue
            const event = this.parseEvent(part)
            if (event) events.push(event)
          }
          return events
        }

        parseEvent(eventStr) {
          const lines = eventStr.split('\n')
          let data = ''

          for (const line of lines) {
            if (line.startsWith('data:')) {
              data += line.slice(5).trim()
            }
          }

          if (data === '[DONE]') return { type: 'done' }
          if (!data) return null

          try {
            return { type: 'message', data: JSON.parse(data) }
          } catch {
            return { type: 'message', data }
          }
        }

        reset() {
          this.buffer = ''
        }
      }

      // 暴露到全局
      window.startStream = async function() {
        const output = document.getElementById('output')
        const cursor = document.getElementById('cursor')
        const stats = document.getElementById('stats')

        // 重置状态
        output.textContent = ''
        output.appendChild(cursor)
        cursor.style.display = 'inline-block'
        stats.textContent = ''

        const parser = new SSEParser()
        const startTime = Date.now()
        let firstTokenTime = null
        let tokenCount = 0
        let content = ''

        try {
          const response = await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: '讲一个关于程序员的笑话' }],
              stream: true,
              speed: 'normal',
            }),
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
          }

          const reader = response.body.getReader()
          const decoder = new TextDecoder()

          while (true) {
            const { done, value } = await reader.read()

            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const events = parser.parse(chunk)

            for (const event of events) {
              if (event.type === 'done') {
                break
              }

              const token = event.data?.choices?.[0]?.delta?.content
              if (token) {
                if (!firstTokenTime) firstTokenTime = Date.now()
                tokenCount++
                content += token

                // 更新显示（保持光标在最后）
                output.textContent = content
                output.appendChild(cursor)
              }
            }
          }

          // 完成，隐藏光标
          cursor.style.display = 'none'

          // 显示统计
          const endTime = Date.now()
          stats.innerHTML = `
            <strong>统计信息：</strong>
            首字延迟: ${firstTokenTime ? firstTokenTime - startTime : '-'} ms |
            总耗时: ${endTime - startTime} ms |
            Token 数: ${tokenCount}
          `
        } catch (error) {
          cursor.style.display = 'none'
          output.textContent = `错误: ${error.message}`
        }
      }
    </script>
  </body>
</html>
```

---

## 四、性能优化：缓冲渲染

### 4.1 问题：频繁 DOM 更新

```
┌─────────────────────────────────────────────────────────────┐
│                 频繁 DOM 更新的问题                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   问题描述：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  每收到一个 token（可能每秒 20-50 个）           │       │
│   │        ↓                                        │       │
│   │  立即更新 DOM                                   │       │
│   │        ↓                                        │       │
│   │  触发重排(reflow)和重绘(repaint)                │       │
│   │        ↓                                        │       │
│   │  页面可能出现卡顿                               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   解决方案：缓冲渲染                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  收到 token → 放入缓冲区                         │       │
│   │        ↓                                        │       │
│   │  使用 requestAnimationFrame                     │       │
│   │        ↓                                        │       │
│   │  每帧（~16ms）批量更新一次 DOM                   │       │
│   │        ↓                                        │       │
│   │  页面流畅，不卡顿                               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 缓冲渲染实现

创建 `experiments/stream-render/buffered.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>缓冲渲染演示</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 900px;
        margin: 50px auto;
        padding: 20px;
      }
      .container {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .panel {
        background: white;
        border-radius: 8px;
        padding: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .panel h3 {
        margin-top: 0;
        color: #333;
      }
      .output {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 15px;
        border-radius: 6px;
        min-height: 200px;
        white-space: pre-wrap;
        line-height: 1.5;
        font-family: monospace;
        font-size: 14px;
      }
      .stats {
        margin-top: 10px;
        padding: 10px;
        background: #f8f9fa;
        border-radius: 4px;
        font-size: 13px;
      }
      button {
        padding: 10px 20px;
        margin: 10px 5px 10px 0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        background: #007bff;
        color: white;
      }
      button:hover { background: #0056b3; }
      .cursor {
        display: inline-block;
        width: 8px;
        height: 16px;
        background: #d4d4d4;
        animation: blink 1s infinite;
      }
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
    </style>
  </head>
  <body>
    <h1>缓冲渲染 vs 即时渲染 对比</h1>
    <button onclick="runComparison()">开始对比测试</button>

    <div class="container">
      <div class="panel">
        <h3>即时渲染（每个 token 立即更新）</h3>
        <div class="output" id="immediateOutput"></div>
        <div class="stats" id="immediateStats"></div>
      </div>
      <div class="panel">
        <h3>缓冲渲染（requestAnimationFrame）</h3>
        <div class="output" id="bufferedOutput"></div>
        <div class="stats" id="bufferedStats"></div>
      </div>
    </div>

    <script>
      /**
       * 缓冲渲染器类
       */
      class BufferedRenderer {
        constructor(element) {
          this.element = element
          this.buffer = ''
          this.content = ''
          this.scheduled = false
          this.updateCount = 0
        }

        // 添加内容到缓冲区
        append(text) {
          this.buffer += text
          this.scheduleFlush()
        }

        // 调度刷新
        scheduleFlush() {
          if (this.scheduled) return

          this.scheduled = true
          requestAnimationFrame(() => this.flush())
        }

        // 刷新到 DOM
        flush() {
          if (this.buffer) {
            this.content += this.buffer
            this.element.textContent = this.content
            this.buffer = ''
            this.updateCount++
          }
          this.scheduled = false
        }

        // 重置
        reset() {
          this.buffer = ''
          this.content = ''
          this.scheduled = false
          this.updateCount = 0
          this.element.textContent = ''
        }

        getUpdateCount() {
          return this.updateCount
        }
      }

      /**
       * 即时渲染器类
       */
      class ImmediateRenderer {
        constructor(element) {
          this.element = element
          this.content = ''
          this.updateCount = 0
        }

        append(text) {
          this.content += text
          this.element.textContent = this.content
          this.updateCount++
        }

        reset() {
          this.content = ''
          this.updateCount = 0
          this.element.textContent = ''
        }

        getUpdateCount() {
          return this.updateCount
        }
      }

      /**
       * 模拟 SSE 数据流
       */
      function simulateSSEStream(callback, interval = 30) {
        const text = '这是一段用于测试渲染性能的文本。我们将逐字符发送，观察即时渲染和缓冲渲染的区别。缓冲渲染使用 requestAnimationFrame 将多个 DOM 更新合并为一次，从而减少浏览器的重排和重绘次数，提高性能和流畅度。这对于快速流式输出尤其重要，可以避免页面卡顿。'

        let index = 0
        const timer = setInterval(() => {
          if (index >= text.length) {
            clearInterval(timer)
            callback(null, true) // 完成
            return
          }
          callback(text[index], false)
          index++
        }, interval)

        return () => clearInterval(timer) // 返回取消函数
      }

      /**
       * 运行对比测试
       */
      async function runComparison() {
        const immediateOutput = document.getElementById('immediateOutput')
        const bufferedOutput = document.getElementById('bufferedOutput')
        const immediateStats = document.getElementById('immediateStats')
        const bufferedStats = document.getElementById('bufferedStats')

        // 创建渲染器
        const immediateRenderer = new ImmediateRenderer(immediateOutput)
        const bufferedRenderer = new BufferedRenderer(bufferedOutput)

        immediateRenderer.reset()
        bufferedRenderer.reset()
        immediateStats.textContent = '运行中...'
        bufferedStats.textContent = '运行中...'

        const startTime = performance.now()

        // 同时运行两种渲染
        await new Promise(resolve => {
          let completed = 0

          simulateSSEStream((char, done) => {
            if (done) {
              completed++
              if (completed === 2) resolve()
              return
            }
            immediateRenderer.append(char)
          }, 20)

          simulateSSEStream((char, done) => {
            if (done) {
              completed++
              if (completed === 2) resolve()
              return
            }
            bufferedRenderer.append(char)
          }, 20)
        })

        // 确保缓冲渲染器最后一次刷新
        bufferedRenderer.flush()

        const endTime = performance.now()

        // 显示统计
        immediateStats.innerHTML = `
          <strong>DOM 更新次数:</strong> ${immediateRenderer.getUpdateCount()} 次<br>
          <strong>总耗时:</strong> ${(endTime - startTime).toFixed(2)} ms
        `

        bufferedStats.innerHTML = `
          <strong>DOM 更新次数:</strong> ${bufferedRenderer.getUpdateCount()} 次<br>
          <strong>总耗时:</strong> ${(endTime - startTime).toFixed(2)} ms<br>
          <strong>减少更新:</strong> ${((1 - bufferedRenderer.getUpdateCount() / immediateRenderer.getUpdateCount()) * 100).toFixed(0)}%
        `
      }
    </script>
  </body>
</html>
```

---

## 五、完整的流式渲染组件

### 5.1 封装可复用的 StreamRenderer

创建 `experiments/stream-render/stream-renderer.js` 文件：

```javascript
/**
 * 流式渲染器
 * 封装 Fetch + ReadableStream + 缓冲渲染的完整逻辑
 */
export class StreamRenderer {
  constructor(options = {}) {
    this.outputElement = options.outputElement
    this.onToken = options.onToken || (() => {})
    this.onStart = options.onStart || (() => {})
    this.onComplete = options.onComplete || (() => {})
    this.onError = options.onError || console.error

    this.abortController = null
    this.buffer = ''
    this.content = ''
    this.scheduled = false
    this.stats = {
      startTime: 0,
      firstTokenTime: 0,
      endTime: 0,
      tokenCount: 0,
    }
  }

  /**
   * 开始流式请求
   */
  async stream(url, options = {}) {
    // 重置状态
    this.reset()
    this.stats.startTime = Date.now()
    this.abortController = new AbortController()

    this.onStart()

    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`)
      }

      await this.processStream(response.body)

      this.stats.endTime = Date.now()
      this.onComplete(this.getStats())
    } catch (error) {
      if (error.name === 'AbortError') {
        this.stats.endTime = Date.now()
        this.onComplete({ ...this.getStats(), aborted: true })
      } else {
        this.onError(error)
      }
    }
  }

  /**
   * 处理响应流
   */
  async processStream(body) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      sseBuffer += chunk

      // 解析 SSE 事件
      const parts = sseBuffer.split('\n\n')
      sseBuffer = parts.pop() || ''

      for (const part of parts) {
        this.processSSEEvent(part)
      }
    }
  }

  /**
   * 处理单个 SSE 事件
   */
  processSSEEvent(eventStr) {
    if (!eventStr.trim()) return

    for (const line of eventStr.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)

        if (data === '[DONE]') return

        try {
          const json = JSON.parse(data)
          const token = json.choices?.[0]?.delta?.content

          if (token) {
            if (this.stats.tokenCount === 0) {
              this.stats.firstTokenTime = Date.now()
            }
            this.stats.tokenCount++
            this.appendToken(token)
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }

  /**
   * 添加 token 到缓冲区
   */
  appendToken(token) {
    this.buffer += token
    this.onToken(token)
    this.scheduleRender()
  }

  /**
   * 调度渲染
   */
  scheduleRender() {
    if (this.scheduled) return

    this.scheduled = true
    requestAnimationFrame(() => this.render())
  }

  /**
   * 渲染到 DOM
   */
  render() {
    if (this.buffer) {
      this.content += this.buffer
      if (this.outputElement) {
        this.outputElement.textContent = this.content
      }
      this.buffer = ''
    }
    this.scheduled = false
  }

  /**
   * 停止流
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.buffer = ''
    this.content = ''
    this.scheduled = false
    this.stats = {
      startTime: 0,
      firstTokenTime: 0,
      endTime: 0,
      tokenCount: 0,
    }
    if (this.outputElement) {
      this.outputElement.textContent = ''
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ttft: this.stats.firstTokenTime ? this.stats.firstTokenTime - this.stats.startTime : 0,
      totalTime: this.stats.endTime - this.stats.startTime,
      tokenCount: this.stats.tokenCount,
      content: this.content,
    }
  }

  /**
   * 获取当前内容
   */
  getContent() {
    return this.content
  }
}
```

### 5.2 使用 StreamRenderer 组件

创建 `experiments/stream-render/component-demo.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>StreamRenderer 组件演示</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        max-width: 800px;
        margin: 50px auto;
        padding: 20px;
        background: #f5f5f5;
      }
      .container {
        background: white;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
      h1 { color: #333; margin-bottom: 20px; }
      .input-group {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }
      input {
        flex: 1;
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 14px;
      }
      button {
        padding: 12px 24px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
      }
      .btn-primary { background: #007bff; color: white; }
      .btn-primary:hover { background: #0056b3; }
      .btn-primary:disabled { background: #ccc; }
      .btn-danger { background: #dc3545; color: white; }
      .btn-danger:hover { background: #bd2130; }
      .output {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 20px;
        border-radius: 8px;
        min-height: 200px;
        white-space: pre-wrap;
        line-height: 1.6;
        font-family: 'Consolas', monospace;
        position: relative;
      }
      .cursor {
        display: inline-block;
        width: 8px;
        height: 18px;
        background: #d4d4d4;
        animation: blink 1s infinite;
        vertical-align: text-bottom;
      }
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }
      .stats {
        margin-top: 15px;
        padding: 12px;
        background: #e9ecef;
        border-radius: 6px;
        font-size: 14px;
      }
      .status {
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 13px;
        margin-bottom: 15px;
      }
      .status-idle { background: #e9ecef; }
      .status-streaming { background: #d4edda; color: #155724; }
      .status-complete { background: #cce5ff; color: #004085; }
      .status-error { background: #f8d7da; color: #721c24; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>StreamRenderer 组件演示</h1>

      <div id="status" class="status status-idle">状态：空闲</div>

      <div class="input-group">
        <input type="text" id="prompt" placeholder="输入你的问题..." value="用 JavaScript 写一个快速排序算法" />
        <button class="btn-primary" id="sendBtn" onclick="send()">发送</button>
        <button class="btn-danger" id="stopBtn" onclick="stop()" disabled>停止</button>
      </div>

      <div class="output" id="output"><span class="cursor" id="cursor" style="display:none"></span></div>

      <div class="stats" id="stats"></div>
    </div>

    <script type="module">
      // 内联 StreamRenderer（简化版）
      class StreamRenderer {
        constructor(options = {}) {
          this.outputElement = options.outputElement
          this.cursorElement = options.cursorElement
          this.onStart = options.onStart || (() => {})
          this.onComplete = options.onComplete || (() => {})
          this.onError = options.onError || console.error

          this.abortController = null
          this.buffer = ''
          this.content = ''
          this.scheduled = false
          this.stats = { startTime: 0, firstTokenTime: 0, endTime: 0, tokenCount: 0 }
        }

        async stream(url, options = {}) {
          this.reset()
          this.stats.startTime = Date.now()
          this.abortController = new AbortController()
          if (this.cursorElement) this.cursorElement.style.display = 'inline-block'

          this.onStart()

          try {
            const response = await fetch(url, { ...options, signal: this.abortController.signal })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let sseBuffer = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              sseBuffer += decoder.decode(value, { stream: true })
              const parts = sseBuffer.split('\n\n')
              sseBuffer = parts.pop() || ''

              for (const part of parts) {
                this.processEvent(part)
              }
            }

            this.render() // 最后一次渲染
            this.stats.endTime = Date.now()
            if (this.cursorElement) this.cursorElement.style.display = 'none'
            this.onComplete(this.getStats())
          } catch (error) {
            if (this.cursorElement) this.cursorElement.style.display = 'none'
            if (error.name === 'AbortError') {
              this.stats.endTime = Date.now()
              this.onComplete({ ...this.getStats(), aborted: true })
            } else {
              this.onError(error)
            }
          }
        }

        processEvent(eventStr) {
          for (const line of eventStr.split('\n')) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.slice(6))
                const token = json.choices?.[0]?.delta?.content
                if (token) {
                  if (!this.stats.firstTokenTime) this.stats.firstTokenTime = Date.now()
                  this.stats.tokenCount++
                  this.buffer += token
                  this.scheduleRender()
                }
              } catch {}
            }
          }
        }

        scheduleRender() {
          if (this.scheduled) return
          this.scheduled = true
          requestAnimationFrame(() => this.render())
        }

        render() {
          if (this.buffer) {
            this.content += this.buffer
            if (this.outputElement) {
              this.outputElement.textContent = this.content
              if (this.cursorElement) {
                this.outputElement.appendChild(this.cursorElement)
              }
            }
            this.buffer = ''
          }
          this.scheduled = false
        }

        stop() {
          if (this.abortController) this.abortController.abort()
        }

        reset() {
          this.buffer = ''
          this.content = ''
          this.scheduled = false
          this.stats = { startTime: 0, firstTokenTime: 0, endTime: 0, tokenCount: 0 }
          if (this.outputElement) this.outputElement.textContent = ''
        }

        getStats() {
          return {
            ttft: this.stats.firstTokenTime ? this.stats.firstTokenTime - this.stats.startTime : 0,
            totalTime: this.stats.endTime - this.stats.startTime,
            tokenCount: this.stats.tokenCount,
          }
        }
      }

      // 创建渲染器实例
      const renderer = new StreamRenderer({
        outputElement: document.getElementById('output'),
        cursorElement: document.getElementById('cursor'),
        onStart: () => {
          document.getElementById('status').className = 'status status-streaming'
          document.getElementById('status').textContent = '状态：正在接收...'
          document.getElementById('sendBtn').disabled = true
          document.getElementById('stopBtn').disabled = false
          document.getElementById('stats').textContent = ''
        },
        onComplete: (stats) => {
          const status = document.getElementById('status')
          if (stats.aborted) {
            status.className = 'status status-idle'
            status.textContent = '状态：已停止'
          } else {
            status.className = 'status status-complete'
            status.textContent = '状态：完成'
          }
          document.getElementById('sendBtn').disabled = false
          document.getElementById('stopBtn').disabled = true
          document.getElementById('stats').innerHTML = `
            <strong>首字延迟:</strong> ${stats.ttft} ms |
            <strong>总耗时:</strong> ${stats.totalTime} ms |
            <strong>Token 数:</strong> ${stats.tokenCount}
          `
        },
        onError: (error) => {
          document.getElementById('status').className = 'status status-error'
          document.getElementById('status').textContent = `状态：错误 - ${error.message}`
          document.getElementById('sendBtn').disabled = false
          document.getElementById('stopBtn').disabled = true
        },
      })

      // 暴露到全局
      window.send = function() {
        const prompt = document.getElementById('prompt').value
        renderer.stream('/api/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            stream: true,
          }),
        })
      }

      window.stop = function() {
        renderer.stop()
      }

      // 回车发送
      document.getElementById('prompt').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !document.getElementById('sendBtn').disabled) {
          window.send()
        }
      })
    </script>
  </body>
</html>
```

---

## 六、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：基础理解

- [ ] 理解 Fetch API 处理流式响应的流程
- [ ] 掌握 ReadableStream 和 TextDecoder 的使用
- [ ] 理解 SSE 数据边界问题及解决方案

### 第二层：实现能力

- [ ] 能实现基础的流式渲染
- [ ] 能正确解析 SSE 格式数据
- [ ] 能实现带光标的"打字机"效果

### 第三层：性能优化

- [ ] 理解频繁 DOM 更新的问题
- [ ] 掌握 requestAnimationFrame 缓冲渲染
- [ ] 能封装可复用的流式渲染组件

---

## 七、实践作业

### 作业 1：添加打字音效

为"打字机"效果添加音效，每输出一个字符播放一个轻微的打字声。

### 作业 2：实现代码高亮

在流式输出过程中，检测代码块并实时应用语法高亮。

### 作业 3：平滑滚动

当内容超出容器高度时，自动平滑滚动到最新内容。

---

## 八、项目文件总结

```
experiments/stream-render/
├── basic.html              # 基础流式渲染
├── sse-parser.js           # SSE 解析器
├── robust.html             # 健壮的流式渲染
├── buffered.html           # 缓冲渲染对比
├── stream-renderer.js      # StreamRenderer 组件
└── component-demo.html     # 组件演示
```

---

**掌握 Fetch + ReadableStream 的流式渲染技术，就能为用户带来丝滑的"打字机"体验。记住：缓冲渲染是性能优化的关键！**
