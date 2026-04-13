# Step 96: vLLM 高性能推理｜对比 Ollama 与 vLLM

## 学习目标

这一节做 Ollama 和 vLLM 的系统性对比，帮你建立选型判断力。

完成后你应该能：

1. 从部署复杂度、性能、并发、功能四个维度对比两者
2. 写一个并发压测脚本测量真实的吞吐差距
3. 清楚各自的适用场景
4. 做出合理的技术选型决策

---

## 一、全方位对比表

| 维度 | Ollama | vLLM |
| --- | --- | --- |
| **安装** | 一行命令，5 分钟 | pip install，需要 CUDA |
| **模型格式** | GGUF（量化后） | HuggingFace 原始权重 |
| **硬件要求** | CPU 可运行 | GPU 强烈推荐（CPU 极慢） |
| **并发处理** | 串行（一次一个） | 连续批处理，支持高并发 |
| **TPS（单请求）** | 7B: 15-40 tok/s | 7B: 80-150 tok/s（GPU） |
| **TPS（10 并发）** | ~同单请求（串行） | 接近线性扩展 |
| **API 格式** | OpenAI 兼容（/v1） | OpenAI 兼容（/v1） |
| **模型定制** | Modelfile | 启动参数 |
| **量化支持** | GGUF 内置 | AWQ/GPTQ/int8 |
| **显存优化** | 基础 | PagedAttention 高效管理 |
| **Windows** | 支持 | 不支持 |
| **适合场景** | 本地开发 | 生产服务 |

---

## 二、并发吞吐量对比实验

```js
// throughput-comparison.js
import OpenAI from 'openai'

function createClient(baseURL) {
  return new OpenAI({ apiKey: 'local', baseURL })
}

async function measureThroughput(client, model, concurrency, totalRequests) {
  const prompt = '用三句话解释向量数据库的工作原理。'

  async function singleRequest() {
    const start = Date.now()
    let tokens = 0
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      max_tokens: 100,
      temperature: 0,
    })
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) tokens++
    }
    return { latency: Date.now() - start, tokens }
  }

  // 分批发送并发请求
  const batchSize = concurrency
  const batches = Math.ceil(totalRequests / batchSize)
  const allResults = []

  const wallStart = Date.now()

  for (let b = 0; b < batches; b++) {
    const batch = Array.from({ length: batchSize }, () => singleRequest())
    const results = await Promise.all(batch)
    allResults.push(...results)
  }

  const wallTime = (Date.now() - wallStart) / 1000
  const totalTokens = allResults.reduce((s, r) => s + r.tokens, 0)
  const avgLatency = allResults.reduce((s, r) => s + r.latency, 0) / allResults.length

  return {
    wallTime:   wallTime.toFixed(2),
    throughput: (totalTokens / wallTime).toFixed(1), // 总 tokens/s
    avgLatency: avgLatency.toFixed(0),
    totalRequests,
    concurrency,
  }
}

// 对比测试（确保两个服务都在运行）
const ollamaClient = createClient('http://localhost:11434/v1')
const vllmClient   = createClient('http://localhost:8000/v1')

const tests = [
  { concurrency: 1,  totalRequests: 5 },
  { concurrency: 5,  totalRequests: 10 },
  { concurrency: 10, totalRequests: 20 },
]

console.log('=== Ollama vs vLLM 吞吐量对比 ===\n')

for (const { concurrency, totalRequests } of tests) {
  console.log(`并发: ${concurrency}, 总请求: ${totalRequests}`)

  const ollamaResult = await measureThroughput(
    ollamaClient, 'llama3:8b', concurrency, totalRequests
  )
  const vllmResult = await measureThroughput(
    vllmClient, 'meta-llama/Llama-3-8B-Instruct', concurrency, totalRequests
  )

  console.log(`  Ollama: ${ollamaResult.throughput} tok/s | 平均延迟 ${ollamaResult.avgLatency}ms`)
  console.log(`  vLLM:   ${vllmResult.throughput} tok/s | 平均延迟 ${vllmResult.avgLatency}ms`)
  console.log(`  vLLM 吞吐提升: ${(vllmResult.throughput / ollamaResult.throughput).toFixed(1)}x\n`)
}
```

---

## 三、典型测试结果（参考）

以下数据来自 A100 80GB 运行 Llama-3-8B：

| 并发数 | Ollama (tok/s) | vLLM (tok/s) | 倍数提升 |
| --- | --- | --- | --- |
| 1 | 45 | 110 | 2.4x |
| 5 | 45（串行）| 420 | 9.3x |
| 10 | 45（串行）| 700 | 15.6x |
| 20 | 45（串行）| 1100 | 24.4x |

> 并发越高，vLLM 的优势越明显。Ollama 是串行的，并发不会增加总吞吐。

---

## 四、选型决策树

```text
你的场景是？
   │
   ├── 本地开发 / 原型验证
   │      └── → Ollama（简单快速）
   │
   ├── 隐私数据，不能上云
   │      ├── 开发环境 → Ollama
   │      └── 生产环境 → vLLM（需要 GPU）
   │
   ├── 生产服务，有并发需求
   │      └── → vLLM
   │
   ├── 没有 GPU
   │      ├── 云端 API（DeepSeek）
   │      └── Ollama CPU 模式（慢但能用）
   │
   └── 最优性价比
          ├── 低并发 (<5 QPS) → Ollama 或 云端 API
          └── 高并发 (>10 QPS) → vLLM 自托管
```

---

## 五、小结

1. **Ollama 串行，vLLM 并发**：这是两者最核心的差异，决定了适用场景。
2. 单请求下 vLLM 比 Ollama 快约 2-3x（使用全精度模型）；10 并发下快 10-15x。
3. **Ollama 模型是量化的 GGUF，vLLM 是全精度 HF 权重**，质量也有差异。
4. 没有 GPU 的情况下，别强推 vLLM，Ollama + CPU 或者云端 API 更合理。
5. 保存这份对比数据，Step 98 写性能结论时用得上。
