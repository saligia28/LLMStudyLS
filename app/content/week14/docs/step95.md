# Step 95: vLLM 高性能推理｜实现 vLLM API 服务器

## 学习目标

这一节启动 vLLM 的 OpenAI 兼容 API 服务，并用 Node.js 客户端接入。

完成后你应该能：

1. 用一条命令启动 vLLM OpenAI API 服务器
2. 理解关键启动参数及其含义
3. 用 curl 和 Node.js 测试 vLLM API
4. 实现流式输出与 vLLM 服务对接
5. 了解生产部署的基本注意事项

---

## 一、启动 API 服务器

vLLM 内置了 OpenAI 兼容的 HTTP API 服务：

```bash
# 基础启动
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-7B-Instruct \
  --port 8000

# 生产配置（4 卡 GPU）
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3-8B-Instruct \
  --tensor-parallel-size 4 \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.9 \
  --port 8000 \
  --host 0.0.0.0

# 使用 Docker 启动（推荐）
docker run --runtime nvidia --gpus all \
  -v ~/.cache/huggingface:/root/.cache/huggingface \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct
```

---

## 二、关键参数说明

| 参数 | 说明 | 典型值 |
| --- | --- | --- |
| `--model` | HuggingFace 模型 ID 或本地路径 | `Qwen/Qwen2.5-7B-Instruct` |
| `--tensor-parallel-size` | 跨 GPU 张量并行数，必须是 2 的幂 | 1, 2, 4, 8 |
| `--max-model-len` | 最大上下文长度（tokens） | 4096, 8192 |
| `--gpu-memory-utilization` | GPU 显存利用率（0-1） | 0.9 |
| `--dtype` | 模型精度 | auto, float16, bfloat16 |
| `--quantization` | 量化方法 | awq, gptq, int8 |
| `--port` | HTTP 端口 | 8000 |
| `--max-num-seqs` | 最大并发请求数 | 256 |

---

## 三、验证服务

```bash
# 检查服务是否就绪
curl http://localhost:8000/health

# 列出可用模型
curl http://localhost:8000/v1/models | python3 -m json.tool

# 测试聊天（普通）
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "你好，介绍一下自己。"}],
    "max_tokens": 100
  }'

# 测试流式输出
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen2.5-7B-Instruct",
    "messages": [{"role": "user", "content": "解释向量数据库的原理。"}],
    "stream": true,
    "max_tokens": 200
  }'
```

---

## 四、Node.js 客户端

vLLM API 与 OpenAI API 完全兼容，直接用 OpenAI SDK 即可：

```js
// vllm-client.js
import OpenAI from 'openai'

const VLLM_URL   = process.env.VLLM_URL   || 'http://localhost:8000'
const VLLM_MODEL = process.env.VLLM_MODEL || 'Qwen/Qwen2.5-7B-Instruct'

const client = new OpenAI({
  apiKey: 'vllm',  // vLLM 不校验 key，填任意值
  baseURL: `${VLLM_URL}/v1`,
})

// 普通请求
export async function chat(messages, options = {}) {
  const response = await client.chat.completions.create({
    model: VLLM_MODEL,
    messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 512,
  })
  return response.choices[0].message.content
}

// 流式请求
export async function chatStream(messages, onToken, options = {}) {
  const stream = await client.chat.completions.create({
    model: VLLM_MODEL,
    messages,
    stream: true,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 512,
  })

  let fullContent = ''
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || ''
    if (token) {
      onToken(token)
      fullContent += token
    }
  }
  return fullContent
}

// 测试
const answer = await chat([
  { role: 'user', content: '用一句话解释什么是 PagedAttention。' }
])
console.log('回答:', answer)

await chatStream(
  [{ role: 'user', content: '列举 3 个使用 RAG 的典型场景。' }],
  (token) => process.stdout.write(token)
)
```

---

## 五、并发测试（验证批处理能力）

这是 vLLM 相比 Ollama 的核心优势：多请求并发处理。

```js
// concurrent-test.js
import { chat } from './vllm-client.js'

async function runConcurrentRequests(n) {
  const questions = Array.from({ length: n }, (_, i) =>
    `请用一句话解释第 ${i + 1} 个问题：向量数据库的应用场景是什么？`
  )

  const startTime = Date.now()

  // 并发发送所有请求
  const results = await Promise.all(
    questions.map(q => chat([{ role: 'user', content: q }]))
  )

  const elapsed = (Date.now() - startTime) / 1000
  console.log(`${n} 个并发请求完成，总耗时: ${elapsed.toFixed(2)}s`)
  console.log(`平均每请求: ${(elapsed / n).toFixed(2)}s`)
  return results
}

// 顺序执行对比
async function runSequentialRequests(n) {
  const startTime = Date.now()
  for (let i = 0; i < n; i++) {
    await chat([{ role: 'user', content: `解释第${i + 1}个概念。` }])
  }
  const elapsed = (Date.now() - startTime) / 1000
  console.log(`${n} 个顺序请求完成，总耗时: ${elapsed.toFixed(2)}s`)
}

console.log('=== 并发 vs 顺序 对比 ===')
await runConcurrentRequests(10)
await runSequentialRequests(10)
```

---

## 六、小结

1. `python -m vllm.entrypoints.openai.api_server` 一条命令启动完整的 OpenAI 兼容服务。
2. vLLM API 与 OpenAI API 100% 兼容，改 `baseURL` 就能接入，**无需改业务代码**。
3. 并发请求是 vLLM 的核心优势：10 个并发请求的总耗时接近 1 个请求，而 Ollama 是串行的。
4. `--tensor-parallel-size` 多卡并行，`--max-num-seqs` 控制并发上限，按硬件调整。
5. 生产部署用 Docker，挂载 HuggingFace 缓存避免重复下载模型。
