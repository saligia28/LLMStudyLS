# Step 90: Ollama 入门｜做一次性能测试

## 学习目标

这一节系统测量 Ollama 的推理性能，建立本地模型的性能基线。

完成后你应该能：

1. 定义并测量 TTFT（首 token 延迟）和 TPS（tokens/s 吞吐量）
2. 测试不同提示长度对性能的影响
3. 理解 GPU vs CPU 推理的差距
4. 写一个可重用的性能测试脚本
5. 把测试结果整理成表格，为后续 vLLM 对比做准备

---

## 一、核心性能指标

```text
TTFT（Time to First Token）
  用户发送请求 → 收到第一个 token 的时间
  影响"感知速度"，越低越好

TPS（Tokens Per Second）
  每秒输出多少个 token
  影响"等待时间"，越高越好

总延迟（Total Latency）
  从请求到完整回答的时间
  = prefill 时间 + (输出 token 数 / TPS)
```

---

## 二、性能测试脚本

```js
// perf-test.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
})

async function measurePerformance(model, prompt, runs = 3) {
  const results = []

  for (let i = 0; i < runs; i++) {
    const startTime = Date.now()
    let firstTokenTime = null
    let tokenCount = 0

    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0,
      max_tokens: 150,
    })

    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || ''
      if (token && firstTokenTime === null) {
        firstTokenTime = Date.now() - startTime
      }
      if (token) tokenCount++
    }

    const totalTime = Date.now() - startTime
    results.push({
      ttft: firstTokenTime,
      totalTime,
      tokenCount,
      tps: tokenCount / (totalTime / 1000),
    })

    // 每次测试之间等待一下，让模型冷却
    if (i < runs - 1) await new Promise(r => setTimeout(r, 1000))
  }

  // 取中位数
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  return {
    ttft:      median(results.map(r => r.ttft)),
    totalTime: median(results.map(r => r.totalTime)),
    tps:       median(results.map(r => r.tps)).toFixed(1),
    tokenCount: median(results.map(r => r.tokenCount)),
    runs: results.length,
  }
}

// 测试矩阵：不同模型 × 不同 prompt 长度
const models = ['llama3.2:3b', 'llama3:8b']

const prompts = {
  short:  '什么是机器学习？',
  medium: '请解释 Transformer 架构的工作原理，包括自注意力机制和位置编码。',
  long:   '你是一位 AI 专家。请详细说明检索增强生成（RAG）系统的完整架构，包括：1）文档入库流程（清洗、切分、embedding、存储），2）查询流程（embedding、向量搜索、rerank、prompt 构建、LLM 生成），3）常见的优化手段，以及 4）适合使用 RAG 的场景。',
}

console.log('=== Ollama 性能测试 ===')
console.log(`测试时间: ${new Date().toLocaleString()}\n`)

const table = []

for (const model of models) {
  console.log(`\n测试模型: ${model}`)
  for (const [label, prompt] of Object.entries(prompts)) {
    process.stdout.write(`  ${label} prompt 测试中...`)
    const result = await measurePerformance(model, prompt, 3)
    console.log(` 完成`)
    table.push({ model, promptSize: label, ...result })
  }
}

// 输出表格
console.log('\n=== 测试结果 ===\n')
console.log('模型'.padEnd(20) + 'Prompt'.padEnd(10) + 'TTFT(ms)'.padEnd(12) + 'TPS'.padEnd(10) + '总耗时(ms)')
console.log('-'.repeat(65))
for (const r of table) {
  console.log(
    r.model.padEnd(20) +
    r.promptSize.padEnd(10) +
    String(r.ttft).padEnd(12) +
    String(r.tps).padEnd(10) +
    String(r.totalTime)
  )
}
```

---

## 三、预期结果范围

以下是在不同硬件上的参考值（实际数值因硬件差异较大）：

**Apple Silicon Mac（M1/M2/M3）**:

| 模型 | TTFT | TPS | 备注 |
| --- | --- | --- | --- |
| llama3.2:3b | 200-500ms | 40-80 | Metal GPU 加速 |
| llama3:8b | 400-800ms | 20-40 | |

**纯 CPU（无 GPU）**:

| 模型 | TTFT | TPS | 备注 |
| --- | --- | --- | --- |
| llama3.2:3b | 1-3s | 5-15 | 慢但能用 |
| llama3:8b | 3-8s | 2-8 | 需要耐心 |

---

## 四、理解影响因素

```text
影响 TTFT 的因素：
  · 输入 prompt 长度（越长，prefill 越慢）
  · 模型大小
  · GPU/CPU 差异

影响 TPS 的因素：
  · 模型大小（越小越快）
  · 量化级别（q4 比 q8 快）
  · GPU 显存带宽
  · batch size（Ollama 单请求模式）
```

---

## 五、小结

1. **TTFT 和 TPS 是两个不同维度**：TTFT 影响响应感知，TPS 影响等待总时长。
2. Prompt 越长，TTFT 越高；但 TPS 基本稳定（输出阶段与输入长度关系不大）。
3. Apple Silicon 的统一内存架构对 Ollama 很友好，效果接近 GPU。
4. 把这份基准数据保存下来，Week 14 做 vLLM 对比时直接用。
5. 性能测试要跑多次取中位数，单次结果受系统负载影响大。
