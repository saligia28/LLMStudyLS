# Step 97: vLLM 高性能推理｜接入你的 chat 前端

> **定位**：Week 14 属于进阶选修，服务于高并发部署方向。这里的目标不是替换掉主线，而是在需要时把默认 DeepSeek 请求切换到本地 vLLM。

## 学习目标

这一节要把前面构建的 chat 应用接上一个 **DeepSeek-first** 的多后端适配层。

完成后你应该能：

1. 用环境变量控制默认后端仍然是 DeepSeek
2. 在需要时切到 Ollama 或 vLLM
3. 让前端知道当前使用的是哪个后端
4. 完成一次端到端流式验证

---

## 一、先定默认策略

```text
默认：DeepSeek
本地替代：Ollama
高并发扩展：vLLM
```

也就是说，这一节不是把三者当成并列主线，而是把 vLLM 接进一个已有的 DeepSeek-first 应用。

---

## 二、推荐的适配器配置

```js
const BACKEND = process.env.LLM_BACKEND || 'deepseek'

const backendConfigs = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },
  ollama: {
    apiKey: 'ollama',
    baseURL: process.env.OLLAMA_URL ? `${process.env.OLLAMA_URL}/v1` : 'http://localhost:11434/v1',
    model: process.env.OLLAMA_MODEL || 'qwen2.5:7b-instruct-q4_K_M',
  },
  vllm: {
    apiKey: 'vllm',
    baseURL: process.env.VLLM_URL ? `${process.env.VLLM_URL}/v1` : 'http://localhost:8000/v1',
    model: process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
  },
}
```

---

## 三、统一聊天接口

```js
import OpenAI from 'openai'

const config = backendConfigs[BACKEND]
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
})

export function chatCompletion(messages, options = {}) {
  return client.chat.completions.create({
    model: config.model,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 1024,
  })
}

export function chatCompletionStream(messages, options = {}) {
  return client.chat.completions.create({
    model: config.model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 1024,
  })
}
```

---

## 四、给前端一个当前后端标识

```js
export function getBackendInfo() {
  return {
    backend: BACKEND,
    model: config.model,
    baseURL: config.baseURL,
  }
}
```

前端可以显示一个 badge：

```text
deepseek · deepseek-chat
```

当你切到本地后端时再显示：

```text
vllm · Qwen/... 
```

---

## 五、小结

这一节最重要的不是“把 vLLM 接上了”，而是：

1. 默认后端仍然是 DeepSeek
2. vLLM 是可切换的部署扩展
3. 你的业务代码不应该因为后端变化而重写
