# Step 81: 应用落地｜加入前端问答框

## 学习目标

这一节把后端 RAG 能力与前端界面连接起来，完成问答交互闭环。

完成后你应该能：

1. 构建一个完整的问答 UI（输入框 + 提交 + 结果展示）
2. 用 SSE 流式展示 LLM 回答，避免长时间白屏
3. 展示问答历史记录
4. 在 UI 上处理加载状态和错误提示
5. 将问答框与后端 `/api/query` 接口对接

> **核心**：用户体验的关键不是功能完整，而是**感知延迟**。流式输出让用户在 0.5 秒内看到第一个字，而不是等待 5 秒后才出现完整答案。

---

## 一、问答 UI 结构

```text
┌─────────────────────────────────────────┐
│  文档问答助手                            │
├─────────────────────────────────────────┤
│                                         │
│  [对话历史区域]                          │
│  用户: 什么是 RAG？                      │
│  助手: RAG 是... [来源1] [来源2]         │
│                                         │
│  用户: 它有哪些优势？                    │
│  助手: 主要优势包括...                   │
│                                         │
├─────────────────────────────────────────┤
│  [输入框]              [发送]           │
└─────────────────────────────────────────┘
```

---

## 二、问答接口设计

首先在 Express 后端加入流式问答接口：

```js
// server/routes/query.js
import express from 'express'
import { RagPipeline } from '../services/rag-pipeline.js'

const router = express.Router()
const pipeline = new RagPipeline()

// 普通问答
router.post('/query', async (req, res) => {
  const { question } = req.body
  if (!question?.trim()) return res.status(400).json({ error: '问题不能为空' })

  try {
    const result = await pipeline.query(question)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 流式问答（SSE）
router.post('/query/stream', async (req, res) => {
  const { question } = req.body
  if (!question?.trim()) return res.status(400).json({ error: '问题不能为空' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // 先发送来源信息
    const sources = await pipeline.retrieveSources(question)
    res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)

    // 流式生成答案
    const stream = await pipeline.queryStream(question, sources)
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || ''
      if (text) res.write(`data: ${JSON.stringify({ type: 'token', text })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
  } finally {
    res.end()
  }
})

export default router
```

---

## 三、前端问答组件（vanilla JS）

```html
<!-- 在已有的 index.html 中加入问答区域 -->
<div class="qa-container">
  <div class="chat-history" id="chatHistory"></div>
  <div class="input-area">
    <textarea
      id="questionInput"
      placeholder="输入你的问题..."
      rows="2"
    ></textarea>
    <button id="sendBtn">发送</button>
  </div>
</div>
```

```css
.qa-container {
  display: flex;
  flex-direction: column;
  height: 500px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 8px;
  line-height: 1.6;
}

.message.user {
  align-self: flex-end;
  background: #1677ff;
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: #f5f5f5;
  color: #333;
}

.sources-list {
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}

.source-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #e6f4ff;
  border: 1px solid #91caff;
  border-radius: 4px;
  margin-right: 4px;
  cursor: pointer;
}

.input-area {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid #e0e0e0;
}

.input-area textarea {
  flex: 1;
  resize: none;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  padding: 8px;
  font-size: 14px;
}

.input-area button {
  padding: 0 20px;
  background: #1677ff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.input-area button:disabled {
  background: #bfbfbf;
  cursor: not-allowed;
}

.typing-cursor::after {
  content: '▋';
  animation: blink 0.7s infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}
```

---

## 四、流式问答交互逻辑

```js
const chatHistory = document.getElementById('chatHistory')
const questionInput = document.getElementById('questionInput')
const sendBtn = document.getElementById('sendBtn')

function addMessage(role, content, sources = []) {
  const div = document.createElement('div')
  div.className = `message ${role}`
  div.innerHTML = content

  if (sources.length > 0) {
    const sourceDiv = document.createElement('div')
    sourceDiv.className = 'sources-list'
    sourceDiv.innerHTML = '来源：' + sources
      .map(s => `<span class="source-tag" title="${s.source}">[${s.index}] ${s.source}</span>`)
      .join('')
    div.appendChild(sourceDiv)
  }

  chatHistory.appendChild(div)
  chatHistory.scrollTop = chatHistory.scrollHeight
  return div
}

async function sendQuestion() {
  const question = questionInput.value.trim()
  if (!question) return

  // 禁用输入
  sendBtn.disabled = true
  questionInput.disabled = true
  questionInput.value = ''

  // 展示用户消息
  addMessage('user', question)

  // 创建助手消息占位符
  const assistantDiv = addMessage('assistant', '<span class="typing-cursor"></span>')
  let fullAnswer = ''
  let sources = []

  try {
    const response = await fetch('/api/query/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value)
      const lines = text.split('\n').filter(l => l.startsWith('data: '))

      for (const line of lines) {
        const data = JSON.parse(line.slice(6))

        if (data.type === 'sources') {
          sources = data.sources
        } else if (data.type === 'token') {
          fullAnswer += data.text
          // 更新消息内容（保留 typing cursor）
          assistantDiv.innerHTML = fullAnswer + '<span class="typing-cursor"></span>'
          chatHistory.scrollTop = chatHistory.scrollHeight
        } else if (data.type === 'done') {
          // 移除 typing cursor，加入来源标签
          assistantDiv.innerHTML = fullAnswer
          if (sources.length > 0) {
            const sourceDiv = document.createElement('div')
            sourceDiv.className = 'sources-list'
            sourceDiv.innerHTML = '来源：' + sources
              .map(s => `<span class="source-tag">[${s.index}] ${s.source}</span>`)
              .join('')
            assistantDiv.appendChild(sourceDiv)
          }
        } else if (data.type === 'error') {
          assistantDiv.innerHTML = `<span style="color:red">错误：${data.message}</span>`
        }
      }
    }
  } catch (err) {
    assistantDiv.innerHTML = `<span style="color:red">网络错误：${err.message}</span>`
  } finally {
    sendBtn.disabled = false
    questionInput.disabled = false
    questionInput.focus()
  }
}

// 事件绑定
sendBtn.addEventListener('click', sendQuestion)
questionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendQuestion()
  }
})
```

---

## 五、加载状态和错误处理

### 5.1 发送中的视觉反馈

```js
function setLoading(loading) {
  sendBtn.disabled = loading
  questionInput.disabled = loading
  sendBtn.textContent = loading ? '回答中...' : '发送'
}
```

### 5.2 空状态提示

```js
function showEmptyState() {
  chatHistory.innerHTML = `
    <div style="text-align:center; color:#aaa; margin-top:80px">
      <div style="font-size:40px">💬</div>
      <p>上传文档后，开始提问吧</p>
    </div>
  `
}

// 检查是否有已上传的文档
async function checkDocumentStatus() {
  const res = await fetch('/api/documents/status')
  const { hasDocuments } = await res.json()
  if (!hasDocuments) showEmptyState()
}
```

---

## 六、小结

1. **流式输出** 是问答 UI 的核心体验，用 SSE 让用户看到逐字输出而不是等待。
2. **来源标签** 直接展示在答案下方，增加可信度，引导用户验证。
3. **Enter 发送 / Shift+Enter 换行** 是聊天界面的标准交互。
4. 错误状态要明确展示（网络错误、后端错误、无文档状态）。
5. 问答框和上传功能配合后，用户就有了完整的"上传 → 问答"体验闭环。
