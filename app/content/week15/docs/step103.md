# Step 103: 模型量化｜加入量化模型切换

## 学习目标

这一节要把 Step 97 的适配器升级成一个 **DeepSeek-first** 的多后端切换器。

完成后你应该能：

1. 让默认后端始终是 DeepSeek
2. 把 Ollama / vLLM 作为本地替代或性能扩展
3. 通过统一注册表切换模型
4. 为 fallback 链设计合理顺序

> **本节默认能力边界**：生产默认先走 DeepSeek；本地量化模型是替代路径，不再和云端主线并列。

---

## 一、先改默认思路

从这一节开始，推荐的模型路由不是“所有后端平起平坐”，而是：

```text
默认：DeepSeek
需要本地或降本：Ollama
需要高并发：vLLM
```

所以注册表应该先把云端主线放在最前面。

---

## 二、推荐的注册表

```js
export const MODEL_REGISTRY = {
  deepseek_chat: {
    kind: 'llm',
    backend: 'deepseek',
    baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.LLM_MODEL || 'deepseek-chat',
    priority: 1,
  },

  ollama_q4: {
    kind: 'llm',
    backend: 'openai-compatible-local',
    baseURL: process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/v1` : 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
    priority: 2,
  },

  vllm_fp16: {
    kind: 'llm',
    backend: 'openai-compatible-local',
    baseURL: process.env.VLLM_URL ? `${process.env.VLLM_URL}/v1` : 'http://localhost:8000/v1',
    apiKey: 'vllm',
    model: process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    priority: 3,
  },
}

export const DEFAULT_MODEL_KEY = 'deepseek_chat'
```

---

## 三、统一适配器工厂

```js
import OpenAI from 'openai'

class ModelAdapter {
  constructor(config) {
    this.config = config
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
  }

  chat(messages, options = {}) {
    return this.client.chat.completions.create({
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1024,
    })
  }

  chatStream(messages, options = {}) {
    return this.client.chat.completions.create({
      model: this.config.model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1024,
    })
  }
}

const adapterCache = new Map()

export function getAdapter(modelKey = DEFAULT_MODEL_KEY) {
  if (!adapterCache.has(modelKey)) {
    adapterCache.set(modelKey, new ModelAdapter(MODEL_REGISTRY[modelKey]))
  }
  return adapterCache.get(modelKey)
}
```

---

## 四、推荐的 fallback 顺序

如果你的目标是“默认稳定上线”，推荐链路是：

```js
const FALLBACK_CHAIN = [
  'deepseek_chat',
  'ollama_q4',
  'vllm_fp16',
]
```

原因不是本地模型更差，而是这节的产品策略已经改了：

- DeepSeek 是默认主线
- Ollama 是本地替代
- vLLM 是性能扩展

如果你的目标是“本地优先”，再按场景重新排顺序，而不是把教程默认值写成本地第一。

---

## 五、小结

这一节最重要的变化不是代码细节，而是默认策略：

1. `DEFAULT_MODEL_KEY` 先指向 DeepSeek
2. 本地量化模型属于可切换的替代路径
3. 适配器层保持统一接口，方便后面继续扩展

下一节我们把这些实验结果整理成一份更像工程决策文档的性能报告。
