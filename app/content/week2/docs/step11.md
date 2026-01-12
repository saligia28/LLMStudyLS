# Step 11: 前端流式渲染 - 异常捕获与手动停止输出

## 学习目标

这个任务的本质是回答一个核心问题：**如何优雅地处理流式输出过程中的各种异常，以及如何让用户能够随时中断输出**。

通过本教程，你将：

1. 掌握流式输出中的错误分类和处理策略
2. 学会使用 AbortController 实现请求中断
3. 实现完善的异常捕获和用户反馈机制
4. 构建健壮的流式输出前端组件

---

## 一、核心认知：流式输出中的异常类型

### 1.1 异常分类

```
┌─────────────────────────────────────────────────────────────┐
│                  流式输出异常分类                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 请求阶段异常（在建立连接时发生）                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 网络错误：无法连接服务器                       │       │
│   │  - 认证错误：401 Unauthorized                   │       │
│   │  - 参数错误：400 Bad Request                    │       │
│   │  - 限流错误：429 Too Many Requests              │       │
│   │  - 服务器错误：500/502/503                      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 流式传输阶段异常（在接收数据时发生）                      │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 连接中断：网络断开                            │       │
│   │  - 超时：服务器响应过慢                          │       │
│   │  - 数据解析错误：格式异常                        │       │
│   │  - 服务端错误：流中途返回错误                    │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. 用户主动中断                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 点击停止按钮                                  │       │
│   │  - 关闭页面/切换路由                             │       │
│   │  - 发起新请求                                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 处理策略

| 异常类型     | 处理策略               | 用户反馈           |
| ------------ | ---------------------- | ------------------ |
| 网络错误     | 提示重试               | 显示重试按钮       |
| 认证错误     | 引导重新登录           | 跳转登录页         |
| 参数错误     | 检查输入               | 显示具体错误信息   |
| 限流错误     | 自动延迟重试           | 显示倒计时         |
| 服务器错误   | 提示稍后重试           | 显示错误提示       |
| 连接中断     | 保留已接收内容，提示重试| 显示"连接中断"    |
| 超时         | 可选择继续等待或取消   | 显示超时提示       |
| 用户中断     | 保留已接收内容         | 显示"已停止"      |

---

## 二、AbortController：请求中断的核心

### 2.1 AbortController 基础

```
┌─────────────────────────────────────────────────────────────┐
│                  AbortController 工作原理                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   创建控制器：                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  const controller = new AbortController()       │       │
│   │  const signal = controller.signal               │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   传递给 fetch：                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  fetch(url, { signal: controller.signal })      │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   需要取消时调用：                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  controller.abort()                             │       │
│   └─────────────────────────────────────────────────┘       │
│                          ↓                                  │
│   fetch 抛出 AbortError：                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  catch (error) {                                │       │
│   │    if (error.name === 'AbortError') {           │       │
│   │      // 处理取消逻辑                             │       │
│   │    }                                            │       │
│   │  }                                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 AbortController 使用示例

```javascript
// 创建控制器
const controller = new AbortController()

// 设置超时自动取消
const timeoutId = setTimeout(() => {
  controller.abort()
}, 30000) // 30 秒超时

try {
  const response = await fetch('/api/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, stream: true }),
    signal: controller.signal, // 传递 signal
  })

  // 处理响应...

  clearTimeout(timeoutId) // 成功后清除超时
} catch (error) {
  clearTimeout(timeoutId)

  if (error.name === 'AbortError') {
    console.log('请求已被取消')
  } else {
    console.error('请求失败:', error)
  }
}
```

---

## 三、实践：完善的异常处理实现

### 3.1 创建异常处理工具

创建 `experiments/error-handling/error-handler.js` 文件：

```javascript
/**
 * 流式请求错误类型
 */
export const ErrorType = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH',
  RATE_LIMIT: 'RATE_LIMIT',
  BAD_REQUEST: 'BAD_REQUEST',
  SERVER: 'SERVER',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  PARSE: 'PARSE',
  UNKNOWN: 'UNKNOWN',
}

/**
 * 自定义流式请求错误
 */
export class StreamError extends Error {
  constructor(type, message, originalError = null) {
    super(message)
    this.name = 'StreamError'
    this.type = type
    this.originalError = originalError
    this.timestamp = new Date()
  }

  /**
   * 获取用户友好的错误信息
   */
  getUserMessage() {
    const messages = {
      [ErrorType.NETWORK]: '网络连接失败，请检查网络后重试',
      [ErrorType.AUTH]: '认证失败，请重新登录',
      [ErrorType.RATE_LIMIT]: '请求过于频繁，请稍后再试',
      [ErrorType.BAD_REQUEST]: '请求参数错误，请检查输入',
      [ErrorType.SERVER]: '服务器暂时不可用，请稍后重试',
      [ErrorType.TIMEOUT]: '请求超时，请检查网络或稍后重试',
      [ErrorType.ABORTED]: '请求已取消',
      [ErrorType.PARSE]: '数据解析错误',
      [ErrorType.UNKNOWN]: '发生未知错误',
    }
    return messages[this.type] || this.message
  }

  /**
   * 是否可以重试
   */
  isRetryable() {
    return [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.SERVER, ErrorType.RATE_LIMIT].includes(this.type)
  }

  /**
   * 获取建议的重试延迟（毫秒）
   */
  getRetryDelay() {
    const delays = {
      [ErrorType.NETWORK]: 3000,
      [ErrorType.TIMEOUT]: 5000,
      [ErrorType.SERVER]: 5000,
      [ErrorType.RATE_LIMIT]: 10000,
    }
    return delays[this.type] || 3000
  }
}

/**
 * 从 HTTP 响应创建错误
 */
export function createErrorFromResponse(response) {
  const status = response.status

  if (status === 401 || status === 403) {
    return new StreamError(ErrorType.AUTH, `认证失败 (${status})`)
  }

  if (status === 429) {
    return new StreamError(ErrorType.RATE_LIMIT, '请求过于频繁')
  }

  if (status === 400) {
    return new StreamError(ErrorType.BAD_REQUEST, '请求参数错误')
  }

  if (status >= 500) {
    return new StreamError(ErrorType.SERVER, `服务器错误 (${status})`)
  }

  return new StreamError(ErrorType.UNKNOWN, `HTTP 错误 (${status})`)
}

/**
 * 从原生错误创建 StreamError
 */
export function createErrorFromNative(error) {
  if (error.name === 'AbortError') {
    return new StreamError(ErrorType.ABORTED, '请求已取消', error)
  }

  if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
    return new StreamError(ErrorType.NETWORK, '网络连接失败', error)
  }

  if (error.name === 'TimeoutError') {
    return new StreamError(ErrorType.TIMEOUT, '请求超时', error)
  }

  return new StreamError(ErrorType.UNKNOWN, error.message, error)
}
```

### 3.2 创建带异常处理的流式请求类

创建 `experiments/error-handling/robust-stream.js` 文件：

```javascript
import { StreamError, ErrorType, createErrorFromResponse, createErrorFromNative } from './error-handler.js'

/**
 * 健壮的流式请求类
 */
export class RobustStreamRequest {
  constructor(options = {}) {
    this.timeout = options.timeout || 30000
    this.maxRetries = options.maxRetries || 3
    this.retryDelay = options.retryDelay || 3000

    this.abortController = null
    this.timeoutId = null
    this.retryCount = 0

    // 回调函数
    this.onToken = options.onToken || (() => {})
    this.onStart = options.onStart || (() => {})
    this.onComplete = options.onComplete || (() => {})
    this.onError = options.onError || (() => {})
    this.onRetry = options.onRetry || (() => {})

    // 状态
    this.isStreaming = false
    this.content = ''
  }

  /**
   * 发起流式请求
   */
  async stream(url, options = {}) {
    this.reset()
    this.isStreaming = true
    this.onStart()

    try {
      await this.executeRequest(url, options)
    } catch (error) {
      await this.handleError(error, url, options)
    }
  }

  /**
   * 执行请求
   */
  async executeRequest(url, options) {
    // 创建新的 AbortController
    this.abortController = new AbortController()

    // 设置超时
    this.timeoutId = setTimeout(() => {
      this.abortController.abort()
    }, this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
      })

      // 清除超时
      this.clearTimeout()

      // 检查响应状态
      if (!response.ok) {
        throw createErrorFromResponse(response)
      }

      // 处理流
      await this.processStream(response.body)

      // 完成
      this.isStreaming = false
      this.onComplete({
        content: this.content,
        retryCount: this.retryCount,
      })
    } catch (error) {
      this.clearTimeout()
      throw error
    }
  }

  /**
   * 处理响应流
   */
  async processStream(body) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 事件
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          this.processSSEEvent(part)
        }
      }
    } catch (error) {
      // 如果是读取过程中的错误
      throw createErrorFromNative(error)
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 处理 SSE 事件
   */
  processSSEEvent(eventStr) {
    if (!eventStr.trim()) return

    for (const line of eventStr.split('\n')) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)

        if (data === '[DONE]') return

        try {
          const json = JSON.parse(data)

          // 检查是否有错误
          if (json.error) {
            throw new StreamError(ErrorType.SERVER, json.error.message || '服务器错误')
          }

          const token = json.choices?.[0]?.delta?.content
          if (token) {
            this.content += token
            this.onToken(token, this.content)
          }
        } catch (e) {
          if (e instanceof StreamError) {
            throw e
          }
          // JSON 解析错误，忽略
        }
      }
    }
  }

  /**
   * 处理错误
   */
  async handleError(error, url, options) {
    // 转换为 StreamError
    const streamError = error instanceof StreamError ? error : createErrorFromNative(error)

    // 如果是用户取消，直接完成
    if (streamError.type === ErrorType.ABORTED) {
      this.isStreaming = false
      this.onComplete({
        content: this.content,
        aborted: true,
      })
      return
    }

    // 检查是否可以重试
    if (streamError.isRetryable() && this.retryCount < this.maxRetries) {
      this.retryCount++
      const delay = streamError.getRetryDelay()

      this.onRetry({
        error: streamError,
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
        delay,
      })

      // 等待后重试
      await this.delay(delay)

      if (this.isStreaming) {
        try {
          await this.executeRequest(url, options)
        } catch (retryError) {
          await this.handleError(retryError, url, options)
        }
      }
    } else {
      // 不可重试或已达到最大重试次数
      this.isStreaming = false
      this.onError(streamError)
    }
  }

  /**
   * 停止请求
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.clearTimeout()
    this.isStreaming = false
  }

  /**
   * 清除超时定时器
   */
  clearTimeout() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.stop()
    this.content = ''
    this.retryCount = 0
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### 3.3 完整的演示页面

创建 `experiments/error-handling/demo.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>异常处理与停止控制演示</title>
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: system-ui, sans-serif;
        max-width: 900px;
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
      h1 { color: #333; margin-bottom: 10px; }
      .subtitle { color: #666; margin-bottom: 20px; }

      .controls {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
        flex-wrap: wrap;
      }
      button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s;
      }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: #007bff; color: white; }
      .btn-primary:hover:not(:disabled) { background: #0056b3; }
      .btn-danger { background: #dc3545; color: white; }
      .btn-danger:hover:not(:disabled) { background: #bd2130; }
      .btn-warning { background: #ffc107; color: #333; }
      .btn-warning:hover:not(:disabled) { background: #d39e00; }
      .btn-secondary { background: #6c757d; color: white; }

      .status-bar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px;
        border-radius: 6px;
        margin-bottom: 15px;
        font-size: 14px;
      }
      .status-idle { background: #e9ecef; color: #495057; }
      .status-streaming { background: #d4edda; color: #155724; }
      .status-complete { background: #cce5ff; color: #004085; }
      .status-error { background: #f8d7da; color: #721c24; }
      .status-retrying { background: #fff3cd; color: #856404; }

      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .output {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 20px;
        border-radius: 8px;
        min-height: 200px;
        max-height: 400px;
        overflow-y: auto;
        white-space: pre-wrap;
        line-height: 1.6;
        font-family: 'Consolas', monospace;
        font-size: 14px;
      }
      .cursor {
        display: inline-block;
        width: 8px;
        height: 16px;
        background: #d4d4d4;
        animation: blink 1s infinite;
        vertical-align: text-bottom;
      }
      @keyframes blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }

      .error-box {
        margin-top: 15px;
        padding: 15px;
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        border-radius: 6px;
        color: #721c24;
        display: none;
      }
      .error-box.show { display: block; }
      .error-box h4 { margin: 0 0 10px 0; }
      .error-box button { margin-top: 10px; }

      .stats {
        margin-top: 15px;
        padding: 12px;
        background: #e9ecef;
        border-radius: 6px;
        font-size: 13px;
      }

      .test-scenarios {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #eee;
      }
      .test-scenarios h3 { margin-bottom: 15px; color: #333; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>异常处理与停止控制</h1>
      <p class="subtitle">演示流式输出中的错误处理、重试机制和手动停止功能</p>

      <!-- 状态栏 -->
      <div id="statusBar" class="status-bar status-idle">
        <span id="statusText">就绪</span>
      </div>

      <!-- 控制按钮 -->
      <div class="controls">
        <button class="btn-primary" id="startBtn" onclick="startNormal()">正常请求</button>
        <button class="btn-danger" id="stopBtn" onclick="stop()" disabled>停止 (Ctrl+C)</button>
      </div>

      <!-- 输出区域 -->
      <div class="output" id="output">
        <span id="content"></span><span class="cursor" id="cursor" style="display:none"></span>
      </div>

      <!-- 错误提示框 -->
      <div class="error-box" id="errorBox">
        <h4 id="errorTitle">错误</h4>
        <p id="errorMessage"></p>
        <button class="btn-primary" id="retryBtn" onclick="retry()">重试</button>
      </div>

      <!-- 统计信息 -->
      <div class="stats" id="stats"></div>

      <!-- 测试场景 -->
      <div class="test-scenarios">
        <h3>测试不同场景</h3>
        <div class="controls">
          <button class="btn-warning" onclick="testSlow()">慢速响应</button>
          <button class="btn-warning" onclick="testTimeout()">模拟超时</button>
          <button class="btn-warning" onclick="testError500()">服务器错误 (500)</button>
          <button class="btn-warning" onclick="testError401()">认证错误 (401)</button>
          <button class="btn-warning" onclick="testError429()">限流错误 (429)</button>
          <button class="btn-warning" onclick="testMidError()">中途错误</button>
        </div>
      </div>
    </div>

    <script type="module">
      // === 错误类型定义 ===
      const ErrorType = {
        NETWORK: 'NETWORK',
        AUTH: 'AUTH',
        RATE_LIMIT: 'RATE_LIMIT',
        BAD_REQUEST: 'BAD_REQUEST',
        SERVER: 'SERVER',
        TIMEOUT: 'TIMEOUT',
        ABORTED: 'ABORTED',
        UNKNOWN: 'UNKNOWN',
      }

      class StreamError extends Error {
        constructor(type, message) {
          super(message)
          this.type = type
        }

        getUserMessage() {
          const messages = {
            [ErrorType.NETWORK]: '网络连接失败，请检查网络后重试',
            [ErrorType.AUTH]: '认证失败，请重新登录',
            [ErrorType.RATE_LIMIT]: '请求过于频繁，请稍后再试',
            [ErrorType.SERVER]: '服务器暂时不可用，请稍后重试',
            [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
            [ErrorType.ABORTED]: '请求已取消',
          }
          return messages[this.type] || this.message
        }

        isRetryable() {
          return [ErrorType.NETWORK, ErrorType.TIMEOUT, ErrorType.SERVER].includes(this.type)
        }
      }

      // === 全局状态 ===
      let abortController = null
      let isStreaming = false
      let currentContent = ''
      let lastUrl = ''
      let lastOptions = {}
      let startTime = 0
      let tokenCount = 0

      // === DOM 元素 ===
      const statusBar = document.getElementById('statusBar')
      const statusText = document.getElementById('statusText')
      const startBtn = document.getElementById('startBtn')
      const stopBtn = document.getElementById('stopBtn')
      const output = document.getElementById('output')
      const content = document.getElementById('content')
      const cursor = document.getElementById('cursor')
      const errorBox = document.getElementById('errorBox')
      const errorTitle = document.getElementById('errorTitle')
      const errorMessage = document.getElementById('errorMessage')
      const stats = document.getElementById('stats')

      // === 状态更新函数 ===
      function setStatus(type, text, showSpinner = false) {
        statusBar.className = `status-bar status-${type}`
        statusText.innerHTML = showSpinner
          ? `<span class="spinner"></span><span>${text}</span>`
          : text
      }

      function setStreaming(streaming) {
        isStreaming = streaming
        startBtn.disabled = streaming
        stopBtn.disabled = !streaming
        cursor.style.display = streaming ? 'inline-block' : 'none'
      }

      function showError(error) {
        errorBox.classList.add('show')
        errorTitle.textContent = `错误: ${error.type}`
        errorMessage.textContent = error.getUserMessage()
        document.getElementById('retryBtn').style.display = error.isRetryable() ? 'inline-block' : 'none'
      }

      function hideError() {
        errorBox.classList.remove('show')
      }

      function updateStats() {
        const elapsed = Date.now() - startTime
        stats.innerHTML = `
          <strong>Token 数:</strong> ${tokenCount} |
          <strong>内容长度:</strong> ${currentContent.length} 字符 |
          <strong>已用时:</strong> ${elapsed} ms
        `
      }

      // === 流式请求函数 ===
      async function streamRequest(url, options = {}) {
        // 保存用于重试
        lastUrl = url
        lastOptions = options

        // 重置状态
        currentContent = ''
        tokenCount = 0
        content.textContent = ''
        hideError()
        setStreaming(true)
        setStatus('streaming', '正在接收...', true)
        startTime = Date.now()

        // 创建 AbortController
        abortController = new AbortController()

        try {
          const response = await fetch(url, {
            ...options,
            signal: abortController.signal,
          })

          // 检查响应状态
          if (!response.ok) {
            const status = response.status
            if (status === 401) throw new StreamError(ErrorType.AUTH, '认证失败')
            if (status === 429) throw new StreamError(ErrorType.RATE_LIMIT, '请求过于频繁')
            if (status >= 500) throw new StreamError(ErrorType.SERVER, `服务器错误 (${status})`)
            throw new StreamError(ErrorType.UNKNOWN, `HTTP 错误 (${status})`)
          }

          // 处理流
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const parts = buffer.split('\n\n')
            buffer = parts.pop() || ''

            for (const part of parts) {
              processEvent(part)
            }
          }

          // 完成
          setStreaming(false)
          setStatus('complete', '完成')
          updateStats()

        } catch (error) {
          setStreaming(false)

          if (error.name === 'AbortError') {
            setStatus('idle', '已停止')
            stats.innerHTML = `<strong>已停止</strong> | 已接收 ${currentContent.length} 字符`
          } else {
            const streamError = error instanceof StreamError
              ? error
              : new StreamError(ErrorType.NETWORK, error.message)

            setStatus('error', '发生错误')
            showError(streamError)
          }
        }
      }

      function processEvent(eventStr) {
        for (const line of eventStr.split('\n')) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(6))
              const token = json.choices?.[0]?.delta?.content
              if (token) {
                tokenCount++
                currentContent += token
                content.textContent = currentContent
                updateStats()
              }
            } catch {}
          }
        }
      }

      // === 公开的控制函数 ===
      window.startNormal = function() {
        streamRequest('/api/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '讲一个关于编程的笑话' }],
            stream: true,
            speed: 'normal',
          }),
        })
      }

      window.stop = function() {
        if (abortController) {
          abortController.abort()
        }
      }

      window.retry = function() {
        if (lastUrl) {
          streamRequest(lastUrl, lastOptions)
        }
      }

      // 测试场景
      window.testSlow = () => streamRequest('/api/test/slow?interval=200', {})
      window.testTimeout = () => streamRequest('/api/test/timeout?stopAfter=3', {})
      window.testError500 = () => streamRequest('/api/test/error-start?type=500', {})
      window.testError401 = () => streamRequest('/api/test/error-start?type=401', {})
      window.testError429 = () => streamRequest('/api/test/error-start?type=429', {})
      window.testMidError = () => streamRequest('/api/test/error-mid', {})

      // 快捷键支持
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'c' && isStreaming) {
          e.preventDefault()
          window.stop()
        }
      })
    </script>
  </body>
</html>
```

---

## 四、最佳实践总结

### 4.1 错误处理原则

```
┌─────────────────────────────────────────────────────────────┐
│                    错误处理最佳实践                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 分类处理                                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 区分不同类型的错误                            │       │
│   │  - 针对每种错误提供合适的处理策略                 │       │
│   │  - 给用户清晰的错误提示                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 保留已接收内容                                          │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 错误发生时不要清空已显示的内容                 │       │
│   │  - 用户可以复制已接收的部分内容                   │       │
│   │  - 重试时可以选择从断点继续                       │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. 提供操作选项                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 可重试的错误显示重试按钮                       │       │
│   │  - 认证错误引导重新登录                          │       │
│   │  - 始终提供取消/关闭选项                         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 停止控制原则

```
┌─────────────────────────────────────────────────────────────┐
│                    停止控制最佳实践                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 提供明确的停止按钮                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 按钮状态与流状态同步                          │       │
│   │  - 使用醒目的颜色（如红色）                       │       │
│   │  - 支持快捷键（如 Esc 或 Ctrl+C）                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 立即响应停止请求                                         │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 使用 AbortController 立即中断请求             │       │
│   │  - 不要等待当前操作完成                          │       │
│   │  - 及时更新 UI 状态                              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. 防止重复操作                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 停止后禁用停止按钮                            │       │
│   │  - 新请求前取消旧请求                            │       │
│   │  - 避免状态混乱                                  │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、学习检查清单

- [ ] 理解流式输出中的异常分类
- [ ] 掌握 AbortController 的使用
- [ ] 能实现完善的错误处理机制
- [ ] 能实现用户手动停止功能
- [ ] 理解错误重试策略
- [ ] 能为用户提供友好的错误反馈

---

## 六、实践作业

### 作业 1：实现自动重试

实现带指数退避的自动重试机制，最多重试 3 次。

### 作业 2：添加网络状态检测

监听网络状态变化，在断网时显示提示，恢复后自动重试。

### 作业 3：实现请求队列

当用户快速发送多个请求时，自动取消之前的请求，只保留最新的。

---

**优雅的错误处理和流畅的停止控制，是提升用户体验的关键。让用户在任何情况下都能感到"一切尽在掌控"！**
