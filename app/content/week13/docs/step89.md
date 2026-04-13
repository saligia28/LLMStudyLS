# Step 89: Ollama 入门｜测试不同模型大小差异

## 学习目标

这一节通过横向对比，建立对"模型大小 vs. 能力"直观认知。

完成后你应该能：

1. 理解模型参数量（1B/3B/7B/13B）对能力和资源的影响
2. 用 Ollama 拉取并运行多个不同大小的模型
3. 设计公平的对比实验（相同问题、相同配置）
4. 从回答质量、速度、内存占用三个维度做横向对比
5. 为不同使用场景选择合适的模型大小

---

## 一、模型参数量的含义

```text
参数量 ≈ 模型"记住"的知识量，也决定了运算复杂度

1B   ≈ 10亿参数  → RAM ~2GB   → 很快，但推理能力有限
3B   ≈ 30亿参数  → RAM ~4GB   → 快，适合简单任务
7B   ≈ 70亿参数  → RAM ~8GB   → 速度和质量的平衡点
13B  ≈ 130亿参数 → RAM ~16GB  → 质量更好，需要更多内存
70B  ≈ 700亿参数 → RAM ~48GB+ → 接近 GPT-4，需要多 GPU
```

> **核心**：对于大多数开发者，**7B 是性价比最高的起点**。8GB 显存/内存就能跑，推理能力够用。

---

## 二、准备测试模型

```bash
# 拉取不同大小的模型（选择你机器能跑的）
ollama pull llama3.2:1b        # 最小，1B
ollama pull llama3.2:3b        # 3B
ollama pull llama3:8b          # 7B（实际 8B）
ollama pull qwen2.5:1.5b       # 中文优化，1.5B
ollama pull qwen2.5:7b         # 中文优化，7B

# 查看已下载的模型
ollama list
```

---

## 三、对比测试脚本

```js
// model-comparison.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
})

// 测试问题集（覆盖不同能力维度）
const testQuestions = [
  {
    id: 'factual',
    label: '事实问答',
    prompt: '法国的首都是哪里？用一句话回答。',
  },
  {
    id: 'reasoning',
    label: '逻辑推理',
    prompt: '如果 A > B，B > C，那么 A 和 C 的关系是什么？请解释。',
  },
  {
    id: 'chinese',
    label: '中文理解',
    prompt: '请用简洁的中文解释什么是"向量数据库"，不超过 3 句话。',
  },
  {
    id: 'code',
    label: '代码生成',
    prompt: '写一个 JavaScript 函数，接收数组，返回去重后的结果。',
  },
  {
    id: 'instruction',
    label: '指令遵循',
    prompt: '请列出 3 个番茄炒蛋的步骤，每步用数字编号，不超过 20 字。',
  },
]

const models = ['llama3.2:1b', 'llama3.2:3b', 'llama3:8b']

async function testModel(model, question) {
  const startTime = Date.now()
  let tokenCount = 0

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: question.prompt }],
      stream: true,
      temperature: 0,
      max_tokens: 200,
    })

    let answer = ''
    for await (const chunk of stream) {
      const token = chunk.choices[0]?.delta?.content || ''
      answer += token
      tokenCount++
    }

    const elapsed = (Date.now() - startTime) / 1000
    return {
      answer: answer.trim(),
      elapsed: elapsed.toFixed(2),
      tokensPerSec: (tokenCount / elapsed).toFixed(1),
    }
  } catch (err) {
    return { answer: `[错误: ${err.message}]`, elapsed: '-', tokensPerSec: '-' }
  }
}

// 运行对比
console.log('=== 模型对比测试 ===\n')

for (const question of testQuestions) {
  console.log(`\n--- ${question.label} ---`)
  console.log(`问题: ${question.prompt}\n`)

  for (const model of models) {
    process.stdout.write(`[${model}] 测试中...`)
    const result = await testModel(model, question)
    console.log(`\r[${model}]`)
    console.log(`  答案: ${result.answer}`)
    console.log(`  耗时: ${result.elapsed}s | 速度: ${result.tokensPerSec} tokens/s\n`)
  }
}
```

---

## 四、典型对比结果

以下是预期的对比结果（实际数值取决于你的硬件）：

| 模型 | 事实问答 | 推理 | 中文 | 代码 | 速度(tok/s) | RAM |
| --- | --- | --- | --- | --- | --- | --- |
| llama3.2:1b | ✓ | ✗ 偶有错误 | △ 质量一般 | △ 简单可以 | 60-100 | ~2GB |
| llama3.2:3b | ✓ | ✓ | △ | ✓ | 30-60 | ~4GB |
| llama3:8b | ✓ | ✓ | ✓ | ✓ | 15-40 | ~8GB |
| qwen2.5:7b | ✓ | ✓ | ✓✓ 中文最佳 | ✓ | 15-35 | ~8GB |

> 中文任务强烈推荐 qwen2.5，专门针对中文语料训练。

---

## 五、监控内存使用

```bash
# macOS: 运行模型时查看内存
# 方法1: 活动监视器 → 搜索 "ollama"
# 方法2: 终端

while true; do
  ps aux | grep ollama | grep -v grep | awk '{print "内存: "$6/1024 " MB"}'
  sleep 2
done
```

```js
// 也可以通过 Ollama API 查询运行中的模型
const response = await fetch('http://localhost:11434/api/ps')
const data = await response.json()
console.log('当前运行的模型:')
for (const model of data.models || []) {
  console.log(`  ${model.name}: ${(model.size_vram / 1024 / 1024).toFixed(0)} MB VRAM`)
}
```

---

## 六、如何选择模型大小

```text
可用内存/显存    推荐模型          适合场景
< 4GB          llama3.2:1b      快速测试、简单 QA
4-8GB          llama3.2:3b      轻量应用、工具调用
8-16GB         llama3:8b        通用开发、RAG 集成
                qwen2.5:7b      中文场景首选
16-32GB        llama3:13b       质量要求高的场景
32GB+          llama3:70b       接近 API 质量
```

---

## 七、小结

1. 模型大小和推理能力**正相关**，但收益递减——3B 比 1B 好很多，13B 比 7B 好一些。
2. **中文任务用 qwen2.5**，不要用英文优化的 llama 系列。
3. 速度和质量是对立的，7B 是大多数开发场景的甜点。
4. 在自己的机器上测完整的 5 道题，而不是靠感觉猜。
5. 模型选型应该先跑 benchmark，再做决定，不要被参数量迷惑。
