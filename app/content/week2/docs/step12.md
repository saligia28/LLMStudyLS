# Step 12: 连接真实 API - 实现完整流式聊天

## 学习目标

这个任务的本质是回答一个核心问题：**如何将前面学到的所有技术整合起来，构建一个连接真实 LLM API 的完整流式聊天应用**。

通过本教程，你将：

1. 配置并连接真实的 LLM API（DeepSeek）
2. 实现完整的多轮对话功能
3. 整合流式渲染、异常处理、停止控制
4. 构建一个可用的聊天应用原型

---

## 一、核心认知：从测试到生产

### 1.1 连接真实 API 的变化

```
┌─────────────────────────────────────────────────────────────┐
│              测试服务器 vs 真实 API                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   测试服务器：                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 本地运行，无需认证                            │       │
│   │  - 响应可控，结果可预测                          │       │
│   │  - 无成本，无限制                                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   真实 API：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  - 需要 API Key 认证                             │       │
│   │  - 响应内容由模型生成，不可预测                   │       │
│   │  - 有成本限制和速率限制                          │       │
│   │  - 需要处理更多边界情况                          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   关键变化点：                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  1. 请求需要 Authorization 头                    │       │
│   │  2. 需要后端代理（保护 API Key）                  │       │
│   │  3. 需要更完善的错误处理                         │       │
│   │  4. 需要管理对话历史                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    完整聊天应用架构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   前端页面   │───>│  后端代理   │───>│  LLM API    │    │
│   │  (浏览器)   │<───│  (Express)  │<───│ (DeepSeek)  │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│         │                   │                              │
│         │                   │                              │
│   ┌─────────────┐    ┌─────────────┐                       │
│   │  对话历史   │    │  API Key    │                       │
│   │ (前端状态)  │    │ (.env 文件) │                       │
│   └─────────────┘    └─────────────┘                       │
│                                                             │
│   数据流：                                                   │
│   1. 用户输入 → 前端添加到对话历史                           │
│   2. 前端发送完整对话历史到后端                              │
│   3. 后端添加 API Key，转发到 LLM API                        │
│   4. LLM API 流式返回响应                                    │
│   5. 后端透传 SSE 数据到前端                                 │
│   6. 前端渲染并保存助手回复到对话历史                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、后端实现：API 代理服务

### 2.1 创建项目结构

```
experiments/chat-app/
├── server/
│   ├── index.js        # 服务器入口
│   └── .env            # 环境变量（API Key）
├── public/
│   ├── index.html      # 聊天页面
│   ├── styles.css      # 样式文件
│   └── app.js          # 前端逻辑
└── package.json
```

### 2.2 后端代理服务

创建 `experiments/chat-app/server/index.js` 文件：

```javascript
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import OpenAI from 'openai'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3200

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
})

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.static(join(__dirname, '../public')))

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`)
  next()
})

/**
 * 流式聊天接口
 * POST /api/chat/stream
 */
app.post('/api/chat/stream', async (req, res) => {
  const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 2000 } = req.body

  // 验证请求
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: { message: '消息列表不能为空' } })
  }

  console.log('[Chat] 开始流式请求:', {
    messageCount: messages.length,
    lastMessage: messages[messages.length - 1]?.content?.slice(0, 50),
  })

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
    })

    for await (const chunk of stream) {
      // 检查客户端是否断开
      if (res.destroyed) {
        console.log('[Chat] 客户端已断开')
        break
      }

      // 发送 SSE 数据
      res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }

    // 发送结束标识
    res.write('data: [DONE]\n\n')
    res.end()

    console.log('[Chat] 流式响应完成')
  } catch (error) {
    console.error('[Chat] 错误:', error.message)

    // 如果响应还没开始，返回 JSON 错误
    if (!res.headersSent) {
      return res.status(500).json({
        error: {
          message: error.message,
          type: 'api_error',
        },
      })
    }

    // 如果已经开始流式响应，通过 SSE 发送错误
    res.write(
      `data: ${JSON.stringify({
        error: { message: error.message },
      })}\n\n`
    )
    res.end()
  }
})

/**
 * 非流式聊天接口（用于对比）
 * POST /api/chat
 */
app.post('/api/chat', async (req, res) => {
  const { messages, model = 'deepseek-chat' } = req.body

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      stream: false,
    })

    res.json(response)
  } catch (error) {
    res.status(500).json({ error: { message: error.message } })
  }
})

/**
 * 健康检查
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    hasApiKey: !!process.env.DEEPSEEK_API_KEY,
  })
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    流式聊天服务器                          ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  地址: http://localhost:${PORT}                             ║
║  API Key: ${process.env.DEEPSEEK_API_KEY ? '已配置 ✓' : '未配置 ✗'}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `)
})
```

### 2.3 环境变量配置

创建 `experiments/chat-app/server/.env` 文件：

```env
DEEPSEEK_API_KEY=your-api-key-here
DEEPSEEK_BASEURL=https://api.deepseek.com
PORT=3200
```

### 2.4 package.json

创建 `experiments/chat-app/package.json` 文件：

```json
{
  "name": "chat-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "openai": "^4.20.0"
  }
}
```

---

## 三、前端实现：完整聊天界面

### 3.1 前端应用逻辑

创建 `experiments/chat-app/public/app.js` 文件：

```javascript
/**
 * 聊天应用主逻辑
 */

// === 状态管理 ===
const state = {
  messages: [], // 对话历史
  isStreaming: false, // 是否正在流式输出
  abortController: null, // 用于取消请求
}

// === DOM 元素 ===
const elements = {
  messageList: document.getElementById('messageList'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusText: document.getElementById('statusText'),
}

// === 工具函数 ===

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 滚动到底部
 */
function scrollToBottom() {
  elements.messageList.scrollTop = elements.messageList.scrollHeight
}

/**
 * 更新 UI 状态
 */
function updateUI() {
  elements.sendBtn.disabled = state.isStreaming
  elements.stopBtn.disabled = !state.isStreaming
  elements.userInput.disabled = state.isStreaming

  if (state.isStreaming) {
    elements.statusText.textContent = '正在输出...'
    elements.statusText.className = 'status streaming'
  } else {
    elements.statusText.textContent = '就绪'
    elements.statusText.className = 'status ready'
  }
}

// === 消息渲染 ===

/**
 * 添加用户消息
 */
function addUserMessage(content) {
  const message = { role: 'user', content }
  state.messages.push(message)
  renderMessage(message)
  scrollToBottom()
}

/**
 * 创建助手消息元素（用于流式更新）
 */
function createAssistantMessage() {
  const message = { role: 'assistant', content: '' }
  state.messages.push(message)

  const messageEl = document.createElement('div')
  messageEl.className = 'message assistant'
  messageEl.innerHTML = `
    <div class="message-avatar">AI</div>
    <div class="message-content">
      <span class="message-text"></span>
      <span class="cursor"></span>
    </div>
  `
  elements.messageList.appendChild(messageEl)

  return {
    element: messageEl,
    textElement: messageEl.querySelector('.message-text'),
    cursorElement: messageEl.querySelector('.cursor'),
    message,
  }
}

/**
 * 渲染单条消息
 */
function renderMessage(message) {
  const messageEl = document.createElement('div')
  messageEl.className = `message ${message.role}`

  const avatar = message.role === 'user' ? '你' : 'AI'
  messageEl.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-content">
      <span class="message-text">${escapeHtml(message.content)}</span>
    </div>
  `

  elements.messageList.appendChild(messageEl)
}

/**
 * 渲染所有消息
 */
function renderAllMessages() {
  elements.messageList.innerHTML = ''
  for (const message of state.messages) {
    renderMessage(message)
  }
  scrollToBottom()
}

// === 流式请求 ===

/**
 * 发送消息并获取流式响应
 */
async function sendMessage() {
  const content = elements.userInput.value.trim()
  if (!content || state.isStreaming) return

  // 清空输入框
  elements.userInput.value = ''

  // 添加用户消息
  addUserMessage(content)

  // 创建助手消息占位
  const assistant = createAssistantMessage()

  // 开始流式请求
  state.isStreaming = true
  state.abortController = new AbortController()
  updateUI()

  // 缓冲渲染
  let buffer = ''
  let scheduled = false

  function flush() {
    assistant.textElement.textContent += buffer
    assistant.message.content += buffer
    buffer = ''
    scheduled = false
    scrollToBottom()
  }

  function appendToken(token) {
    buffer += token
    if (!scheduled) {
      scheduled = true
      requestAnimationFrame(flush)
    }
  }

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: state.messages.slice(0, -1), // 不包含当前空的助手消息
      }),
      signal: state.abortController.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error?.message || `HTTP ${response.status}`)
    }

    // 处理流式响应
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
        if (!part.trim()) continue

        for (const line of part.split('\n')) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)

              // 检查错误
              if (json.error) {
                throw new Error(json.error.message)
              }

              const token = json.choices?.[0]?.delta?.content
              if (token) {
                appendToken(token)
              }
            } catch (e) {
              if (e.message !== 'Unexpected end of JSON input') {
                console.warn('解析错误:', e)
              }
            }
          }
        }
      }
    }

    // 确保最后的缓冲被刷新
    flush()

    // 隐藏光标
    assistant.cursorElement.style.display = 'none'
  } catch (error) {
    // 隐藏光标
    assistant.cursorElement.style.display = 'none'

    if (error.name === 'AbortError') {
      assistant.textElement.textContent += '\n\n[已停止]'
      assistant.message.content += '\n\n[已停止]'
    } else {
      assistant.textElement.textContent = `错误: ${error.message}`
      assistant.message.content = `错误: ${error.message}`
      assistant.element.classList.add('error')
    }
  } finally {
    state.isStreaming = false
    state.abortController = null
    updateUI()
    scrollToBottom()
  }
}

/**
 * 停止输出
 */
function stopOutput() {
  if (state.abortController) {
    state.abortController.abort()
  }
}

/**
 * 清空对话
 */
function clearChat() {
  if (state.isStreaming) {
    stopOutput()
  }
  state.messages = []
  elements.messageList.innerHTML = ''
}

// === 事件绑定 ===

// 发送按钮
elements.sendBtn.addEventListener('click', sendMessage)

// 停止按钮
elements.stopBtn.addEventListener('click', stopOutput)

// 清空按钮
elements.clearBtn.addEventListener('click', clearChat)

// 回车发送（Shift+Enter 换行）
elements.userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
})

// Esc 停止
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.isStreaming) {
    stopOutput()
  }
})

// 初始化
updateUI()
console.log('聊天应用已初始化')
```

### 3.2 HTML 页面

创建 `experiments/chat-app/public/index.html` 文件：

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI 聊天助手</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div class="chat-container">
      <!-- 头部 -->
      <header class="chat-header">
        <h1>AI 聊天助手</h1>
        <div class="header-actions">
          <span id="statusText" class="status ready">就绪</span>
          <button id="clearBtn" class="btn-icon" title="清空对话">🗑️</button>
        </div>
      </header>

      <!-- 消息列表 -->
      <main class="message-list" id="messageList">
        <div class="welcome-message">
          <h2>👋 你好！</h2>
          <p>我是 AI 助手，有什么可以帮助你的吗？</p>
        </div>
      </main>

      <!-- 输入区域 -->
      <footer class="chat-input">
        <textarea
          id="userInput"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行, Esc 停止)"
          rows="1"
        ></textarea>
        <div class="input-actions">
          <button id="stopBtn" class="btn-stop" disabled>停止</button>
          <button id="sendBtn" class="btn-send">发送</button>
        </div>
      </footer>
    </div>

    <script src="app.js"></script>
  </body>
</html>
```

### 3.3 样式文件

创建 `experiments/chat-app/public/styles.css` 文件：

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #f0f2f5;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

.chat-container {
  width: 100%;
  max-width: 800px;
  height: 90vh;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 头部 */
.chat-header {
  padding: 16px 20px;
  background: #4a90d9;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h1 {
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
}

.status.streaming {
  background: #ffc107;
  color: #333;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.btn-icon {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

/* 消息列表 */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-message {
  text-align: center;
  padding: 40px;
  color: #666;
}

.welcome-message h2 {
  font-size: 24px;
  margin-bottom: 10px;
}

/* 消息 */
.message {
  display: flex;
  gap: 12px;
  max-width: 85%;
}

.message.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.message.user .message-avatar {
  background: #4a90d9;
  color: white;
}

.message.assistant .message-avatar {
  background: #e9ecef;
  color: #495057;
}

.message-content {
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.message.user .message-content {
  background: #4a90d9;
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-content {
  background: #f0f2f5;
  color: #333;
  border-bottom-left-radius: 4px;
}

.message.error .message-content {
  background: #f8d7da;
  color: #721c24;
}

/* 光标 */
.cursor {
  display: inline-block;
  width: 8px;
  height: 18px;
  background: #333;
  animation: blink 1s infinite;
  vertical-align: text-bottom;
  margin-left: 2px;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

/* 输入区域 */
.chat-input {
  padding: 16px 20px;
  background: white;
  border-top: 1px solid #e9ecef;
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.chat-input textarea {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  resize: none;
  max-height: 150px;
  line-height: 1.5;
}

.chat-input textarea:focus {
  outline: none;
  border-color: #4a90d9;
}

.input-actions {
  display: flex;
  gap: 8px;
}

.btn-send,
.btn-stop {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send {
  background: #4a90d9;
  color: white;
}

.btn-send:hover:not(:disabled) {
  background: #3a7bc8;
}

.btn-send:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-stop {
  background: #dc3545;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background: #c82333;
}

.btn-stop:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* 滚动条 */
.message-list::-webkit-scrollbar {
  width: 6px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: #999;
}
```

---

## 四、运行和测试

### 4.1 启动步骤

```bash
# 1. 进入项目目录
cd experiments/chat-app

# 2. 安装依赖
npm install

# 3. 配置 API Key
# 编辑 server/.env 文件，填入你的 DeepSeek API Key

# 4. 启动服务器
npm start

# 5. 打开浏览器访问
# http://localhost:3200
```

### 4.2 功能测试清单

- [ ] 发送消息并收到流式响应
- [ ] 多轮对话（上下文保持）
- [ ] 点击停止按钮中断输出
- [ ] 按 Esc 键停止输出
- [ ] 清空对话历史
- [ ] 错误处理（断网测试）

---

## 五、学习检查清单

- [ ] 理解前后端分离的架构设计
- [ ] 能配置并连接真实的 LLM API
- [ ] 掌握多轮对话的实现原理
- [ ] 能整合流式渲染和错误处理
- [ ] 理解 API Key 保护的重要性

---

## 六、实践作业

### 作业 1：添加系统提示

允许用户设置系统提示（System Prompt），影响 AI 的回复风格。

### 作业 2：对话导出

实现对话历史的导出功能，支持导出为 Markdown 或 JSON 格式。

### 作业 3：多模型支持

添加模型选择功能，支持在不同 LLM 模型之间切换。

---

## 七、项目文件总结

```
experiments/chat-app/
├── package.json
├── server/
│   ├── index.js        # API 代理服务
│   └── .env            # 环境变量
└── public/
    ├── index.html      # 聊天页面
    ├── styles.css      # 样式
    └── app.js          # 前端逻辑
```

---

**恭喜你！现在你已经构建了一个连接真实 LLM API 的完整流式聊天应用。这是从学习到实践的重要一步！**
