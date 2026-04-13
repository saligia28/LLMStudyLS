# Step 103: 模型量化｜加入量化模型切换

## 学习目标

这一节扩展 Step 97 的适配器，支持在运行时动态切换模型和后端。

完成后你应该能：

1. 设计支持多后端多模型的适配器工厂
2. 通过 API 参数在运行时切换模型
3. 实现 fallback 降级策略（本地失败时切回云端）
4. 在前端展示当前模型信息

---

## 一、扩展模型配置

```js
// server/config/models.js
export const MODEL_REGISTRY = {
  // DeepSeek 云端
  'deepseek-chat': {
    backend:  'openai-compatible',
    baseURL:  process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    apiKey:   process.env.DEEPSEEK_API_KEY,
    model:    'deepseek-chat',
    type:     'cloud',
    maxTokens: 4096,
  },

  // Ollama 本地（不同量化版本）
  'qwen2.5-7b-q4': {
    backend: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    apiKey:  'ollama',
    model:   'qwen2.5:7b-instruct-q4_K_M',
    type:    'local',
    maxTokens: 4096,
  },
  'qwen2.5-7b-q8': {
    backend: 'openai-compatible',
    baseURL: 'http://localhost:11434/v1',
    apiKey:  'ollama',
    model:   'qwen2.5:7b-instruct-q8_0',
    type:    'local',
    maxTokens: 4096,
  },

  // vLLM 服务
  'vllm-qwen2.5-7b': {
    backend: 'openai-compatible',
    baseURL: process.env.VLLM_URL ? `${process.env.VLLM_URL}/v1` : 'http://localhost:8000/v1',
    apiKey:  'vllm',
    model:   'Qwen/Qwen2.5-7B-Instruct',
    type:    'vllm',
    maxTokens: 8192,
  },
}

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'deepseek-chat'
```

---

## 二、模型适配器工厂

```js
// server/services/model-factory.js
import OpenAI from 'openai'
import { MODEL_REGISTRY, DEFAULT_MODEL } from '../config/models.js'

class ModelAdapter {
  constructor(config) {
    this.config = config
    this.client = new OpenAI({
      apiKey:  config.apiKey,
      baseURL: config.baseURL,
    })
  }

  async chat(messages, options = {}) {
    return this.client.chat.completions.create({
      model:       this.config.model,
      messages,
      temperature: options.temperature ?? 0,
      max_tokens:  options.maxTokens   ?? this.config.maxTokens,
    })
  }

  async chatStream(messages, options = {}) {
    return this.client.chat.completions.create({
      model:       this.config.model,
      messages,
      stream:      true,
      temperature: options.temperature ?? 0,
      max_tokens:  options.maxTokens   ?? this.config.maxTokens,
    })
  }

  info() {
    return {
      name:    Object.keys(MODEL_REGISTRY).find(k => MODEL_REGISTRY[k] === this.config),
      model:   this.config.model,
      type:    this.config.type,
      baseURL: this.config.baseURL,
    }
  }
}

// 适配器缓存（避免重复创建 OpenAI client）
const adapterCache = new Map()

export function getAdapter(modelKey = DEFAULT_MODEL) {
  if (!MODEL_REGISTRY[modelKey]) {
    throw new Error(`未知模型: ${modelKey}。可用: ${Object.keys(MODEL_REGISTRY).join(', ')}`)
  }

  if (!adapterCache.has(modelKey)) {
    adapterCache.set(modelKey, new ModelAdapter(MODEL_REGISTRY[modelKey]))
  }

  return adapterCache.get(modelKey)
}

export function listModels() {
  return Object.entries(MODEL_REGISTRY).map(([key, cfg]) => ({
    key,
    model:   cfg.model,
    type:    cfg.type,
    baseURL: cfg.baseURL,
  }))
}
```

---

## 三、Fallback 降级策略

```js
// server/services/llm-with-fallback.js
import { getAdapter } from './model-factory.js'

const FALLBACK_CHAIN = [
  'vllm-qwen2.5-7b',   // 优先本地 vLLM
  'qwen2.5-7b-q8',     // 降级到 Ollama q8
  'qwen2.5-7b-q4',     // 再降级到 Ollama q4
  'deepseek-chat',     // 最后回退到云端 API
]

export async function chatWithFallback(messages, preferredModel, options = {}) {
  // 确定降级链
  const chain = preferredModel
    ? [preferredModel, ...FALLBACK_CHAIN.filter(m => m !== preferredModel)]
    : FALLBACK_CHAIN

  const errors = []

  for (const modelKey of chain) {
    try {
      const adapter = getAdapter(modelKey)

      // 健康检查（本地模型）
      if (MODEL_REGISTRY[modelKey]?.type !== 'cloud') {
        await checkModelHealth(modelKey)
      }

      const result = await adapter.chat(messages, options)
      const usedModel = adapter.info()

      if (modelKey !== chain[0]) {
        console.warn(`[Fallback] 降级到 ${modelKey}（原因: ${errors[0]?.message}）`)
      }

      return { ...result, usedModel }
    } catch (err) {
      errors.push({ model: modelKey, message: err.message })
      console.warn(`[Fallback] ${modelKey} 失败: ${err.message}，尝试下一个...`)
    }
  }

  throw new Error(`所有模型都不可用:\n${errors.map(e => `  ${e.model}: ${e.message}`).join('\n')}`)
}

async function checkModelHealth(modelKey) {
  const config = MODEL_REGISTRY[modelKey]
  if (!config) return

  const healthUrl = config.baseURL.includes('11434')
    ? 'http://localhost:11434/api/tags'
    : `${config.baseURL.replace('/v1', '')}/health`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000) // 2 秒超时

  try {
    const res = await fetch(healthUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`健康检查失败: ${res.status}`)
  } catch (err) {
    clearTimeout(timeout)
    throw new Error(`服务不可达: ${err.message}`)
  }
}
```

---

## 四、在路由中使用

```js
// server/routes/query.js（带模型选择）
import { getAdapter, listModels } from '../services/model-factory.js'
import { chatWithFallback } from '../services/llm-with-fallback.js'

// 获取可用模型列表
router.get('/models', (req, res) => {
  res.json({ models: listModels() })
})

// 流式问答（支持模型选择）
router.post('/query/stream', async (req, res) => {
  const { question, model: modelKey } = req.body

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')

  try {
    // 先告知前端使用了哪个模型
    const adapter = getAdapter(modelKey)
    res.write(`data: ${JSON.stringify({ type: 'model', info: adapter.info() })}\n\n`)

    // ... 余下与 Step 97 相同
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
  }
})
```

---

## 五、前端模型选择器

```js
// 加载可用模型
async function loadModelList() {
  const res = await fetch('/api/models')
  const { models } = await res.json()

  const select = document.getElementById('modelSelect')
  select.innerHTML = models.map(m =>
    `<option value="${m.key}">[${m.type}] ${m.key} (${m.model})</option>`
  ).join('')
}

loadModelList()
```

```html
<select id="modelSelect">
  <!-- 动态填充 -->
</select>
```

---

## 六、小结

1. **Model Registry + 工厂模式** 让添加新模型变成填一条配置，不需要改业务代码。
2. **Fallback 链** 保证高可用：本地模型挂了自动切云端，开发体验不中断。
3. 健康检查要有超时（2 秒），否则挂掉的服务会卡住整个请求。
4. 前端展示当前模型信息，让用户/开发者知道"正在用哪个后端"。
5. 这套适配器是 Week 11-15 所有后端能力的统一出口，后续可以继续扩展。
