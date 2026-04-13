# Step 97: vLLM 高性能推理｜接入你的 chat 前端

## 学习目标

这一节把前面几周构建的 chat 应用接入 vLLM，实现本地高性能推理。

完成后你应该能：

1. 用环境变量切换推理后端（DeepSeek / Ollama / vLLM）
2. 实现一个统一的模型适配器，屏蔽底层差异
3. 更新 Express 后端支持 vLLM 端点
4. 端到端测试完整的流式问答流程

---

## 一、适配器模式：统一三个后端

目标是用一套代码，通过环境变量切换后端：

```text
LLM_BACKEND=deepseek  → 调用 DeepSeek API
LLM_BACKEND=ollama    → 调用本地 Ollama
LLM_BACKEND=vllm      → 调用本地 vLLM
```

---

## 二、LLM 适配器实现

```js
// server/services/llm-adapter.js
import OpenAI from 'openai'
import 'dotenv/config'

const BACKEND = process.env.LLM_BACKEND || 'deepseek'

const backendConfigs = {
  deepseek: {
    apiKey:  process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    model:   process.env.DEEPSEEK_MODEL   || 'deepseek-chat',
  },
  ollama: {
    apiKey:  'ollama',
    baseURL: process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/v1` : 'http://localhost:11434/v1',
    model:   process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  },
  vllm: {
    apiKey:  'vllm',
    baseURL: process.env.VLLM_URL ? `${process.env.VLLM_URL}/v1` : 'http://localhost:8000/v1',
    model:   process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
  },
}

const config = backendConfigs[BACKEND]
if (!config) throw new Error(`未知的 LLM_BACKEND: ${BACKEND}`)

const client = new OpenAI({
  apiKey:  config.apiKey,
  baseURL: config.baseURL,
})

console.log(`[LLM] 使用后端: ${BACKEND} | 模型: ${config.model}`)

export async function chatCompletion(messages, options = {}) {
  return client.chat.completions.create({
    model:       config.model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens:  options.maxTokens   ?? 1024,
  })
}

export async function chatCompletionStream(messages, options = {}) {
  return client.chat.completions.create({
    model:       config.model,
    messages,
    stream:      true,
    temperature: options.temperature ?? 0,
    max_tokens:  options.maxTokens   ?? 1024,
  })
}

export function getBackendInfo() {
  return { backend: BACKEND, model: config.model, baseURL: config.baseURL }
}
```

---

## 三、更新查询接口

```js
// server/routes/query.js（更新）
import express from 'express'
import { chatCompletionStream, getBackendInfo } from '../services/llm-adapter.js'
import { RagPipeline } from '../services/rag.js'

const router = express.Router()
const pipeline = new RagPipeline()

// 后端信息端点（前端可以显示当前使用哪个后端）
router.get('/backend-info', (req, res) => {
  res.json(getBackendInfo())
})

// 流式问答
router.post('/query/stream', async (req, res) => {
  const { question } = req.body
  if (!question?.trim()) return res.status(400).json({ error: '问题不能为空' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    // 检索相关 chunks
    const chunks = await pipeline.retrieve(question)
    const sources = chunks.map((c, i) => ({
      index: i + 1,
      source: c.metadata?.source || c.id,
      score: c.score,
    }))

    // 发送来源信息
    res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`)

    // 构建 prompt
    const context = chunks
      .map((c, i) => `[来源${i + 1}: ${c.metadata?.source || c.id}]\n${c.text}`)
      .join('\n\n---\n\n')

    const messages = [
      {
        role: 'system',
        content: '你是文档问答助手，只基于提供的文档内容回答，使用 [来源N] 标注引用，不确定时说"文档中未提及"。',
      },
      {
        role: 'user',
        content: `文档内容：\n${context}\n\n问题：${question}`,
      },
    ]

    // 流式生成
    const stream = await chatCompletionStream(messages)
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || ''
      if (token) res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`)
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
  } catch (err) {
    console.error('[query/stream error]', err)
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
  } finally {
    res.end()
  }
})

export default router
```

---

## 四、前端显示后端信息

```js
// public/app.js（加入后端信息展示）
async function loadBackendInfo() {
  try {
    const res = await fetch('/api/backend-info')
    const { backend, model } = await res.json()
    document.getElementById('backendBadge').textContent = `${backend} · ${model}`
  } catch {
    // 忽略
  }
}

loadBackendInfo()
```

```html
<!-- public/index.html -->
<div class="header">
  <h1>文档问答助手</h1>
  <span id="backendBadge" class="backend-badge">加载中...</span>
</div>
```

---

## 五、.env 切换配置

```bash
# 切换到 vLLM
LLM_BACKEND=vllm
VLLM_URL=http://localhost:8000
VLLM_MODEL=Qwen/Qwen2.5-7B-Instruct

# 切换到 Ollama
LLM_BACKEND=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b

# 切换到 DeepSeek（默认）
LLM_BACKEND=deepseek
DEEPSEEK_API_KEY=your-key
```

---

## 六、小结

1. 适配器模式让三个后端共用同一套业务代码，**切换后端只改 `.env`，不改代码**。
2. vLLM API 与 DeepSeek/OpenAI API 完全兼容，适配成本接近零。
3. 在 UI 上展示当前后端信息，有助于调试和演示。
4. 这套适配器在 Step 103（量化模型切换）里还会继续扩展。
5. 端到端测试：用 vLLM 运行完整问答流程，确认流式输出和引用都正常。
