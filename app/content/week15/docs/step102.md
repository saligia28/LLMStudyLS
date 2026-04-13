# Step 102: 模型量化｜测试不同量化模型

## 学习目标

这一节通过 Ollama 对比不同量化精度的 GGUF 模型，建立对量化效果的直观感受。

完成后你应该能：

1. 理解 GGUF 量化命名规则（q4_K_M、q5_K_M、q8_0 等）
2. 用 Ollama 拉取不同量化版本的模型
3. 在多个任务类型上横向对比量化差异
4. 判断哪种量化级别适合你的使用场景

---

## 一、GGUF 量化命名解读

```text
qwen2.5:7b-instruct-q4_K_M

qwen2.5  → 模型系列
7b       → 参数量（70亿）
instruct → 指令微调版本
q4       → 4-bit 量化
K        → K-quants 方法（比 legacy 更智能的量化）
M        → Medium，在 S（小）、M（中）、L（大）中的精度选择
```

**常用量化等级速查**：

| 名称 | 精度 | 文件大小（7B） | 特点 |
| --- | --- | --- | --- |
| q2_K | 2-bit | ~3GB | 极小，质量损失明显 |
| q4_K_S | 4-bit small | ~4GB | 体积最小的 q4 |
| q4_K_M | 4-bit medium | ~4.5GB | 最常用，推荐 |
| q5_K_M | 5-bit medium | ~5.5GB | 质量更好，略大 |
| q6_K | 6-bit | ~6GB | 接近 q8 质量 |
| q8_0 | 8-bit | ~7.5GB | 接近全精度，体积大 |

---

## 二、拉取多个量化版本

```bash
# 拉取 qwen2.5:7b 的不同量化版本
ollama pull qwen2.5:7b-instruct-q4_K_M
ollama pull qwen2.5:7b-instruct-q5_K_M
ollama pull qwen2.5:7b-instruct-q8_0

# 查看下载的模型（会显示大小）
ollama list

# 示例输出：
# NAME                              ID            SIZE    MODIFIED
# qwen2.5:7b-instruct-q8_0          abc123...    7.3 GB  2 minutes ago
# qwen2.5:7b-instruct-q5_K_M        def456...    5.5 GB  5 minutes ago
# qwen2.5:7b-instruct-q4_K_M        ghi789...    4.4 GB  10 minutes ago
```

---

## 三、横向对比测试脚本

```js
// quant-comparison.js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1',
})

const models = [
  'qwen2.5:7b-instruct-q4_K_M',
  'qwen2.5:7b-instruct-q5_K_M',
  'qwen2.5:7b-instruct-q8_0',
]

// 多维度测试题
const tests = [
  {
    category: '事实问答',
    prompt: '中国的首都是哪里？请用一句话回答。',
    criteria: '应该回答"北京"',
  },
  {
    category: '代码生成',
    prompt: '写一个 JavaScript 函数，计算数组中所有数字的平均值，处理空数组的情况。',
    criteria: '应包含边界检查和正确的计算逻辑',
  },
  {
    category: '中文写作',
    prompt: '用 3 句话介绍人工智能对社会的影响，语言流畅自然。',
    criteria: '语言应当流畅，逻辑清晰',
  },
  {
    category: '逻辑推理',
    prompt: '有 5 只鸡，每天生 5 个蛋，5 天生多少个蛋？请说明计算过程。',
    criteria: '答案应为 125，过程清晰',
  },
  {
    category: '长文理解',
    prompt: `请总结以下内容的核心要点（2-3 点）：
向量数据库是一种专门存储和检索高维向量的数据库系统。
与传统关系型数据库不同，它支持基于语义相似度的模糊搜索，
而非精确的键值匹配。在 AI 应用中，embedding 模型将文本、
图片等非结构化数据转换为向量，再存入向量数据库，
从而支持语义搜索、推荐系统和 RAG 等场景。`,
    criteria: '应能准确提炼出：1) 存储高维向量，2) 支持语义相似度搜索，3) AI 应用场景',
  },
]

async function testModel(model, prompt) {
  const start = Date.now()
  let tokenCount = 0

  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    temperature: 0,
    max_tokens: 200,
  })

  let answer = ''
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || ''
    if (token) { answer += token; tokenCount++ }
  }

  const elapsed = (Date.now() - start) / 1000
  return {
    answer: answer.trim(),
    tps: (tokenCount / elapsed).toFixed(1),
    elapsed: elapsed.toFixed(2),
  }
}

// 运行对比
console.log('=== GGUF 量化版本对比测试 ===\n')

for (const test of tests) {
  console.log(`\n📋 ${test.category}`)
  console.log(`问题: ${test.prompt.slice(0, 60)}...`)
  console.log(`评判标准: ${test.criteria}\n`)

  for (const model of models) {
    const shortName = model.split(':')[1]
    process.stdout.write(`  [${shortName}] 运行中...`)
    const result = await testModel(model, test.prompt)
    console.log(`\r  [${shortName}] ${result.tps} tok/s | ${result.elapsed}s`)
    console.log(`    → ${result.answer.slice(0, 100)}${result.answer.length > 100 ? '...' : ''}`)
  }
}
```

---

## 四、预期差异规律

通过测试，通常会发现以下规律：

```text
事实问答（简单）：q4_K_M = q5_K_M = q8_0
  → 对量化精度不敏感，q4 足够

代码生成（中等）：q4_K_M < q5_K_M ≈ q8_0
  → q4 偶尔出现小错误，q5 明显改善

逻辑推理（困难）：q4_K_M < q5_K_M < q8_0
  → 对精度最敏感，q8 效果最好

速度：q4_K_M > q5_K_M > q8_0
  → q4 最快，约比 q8 快 30-50%

内存：q4_K_M < q5_K_M < q8_0
  → q4 用最少内存，允许在小内存设备上跑更大模型
```

---

## 五、选量化版本的决策原则

```text
1. 先测 q4_K_M
   → 如果质量满足需求，用它（速度最快，内存最小）

2. 如果 q4 质量不够
   → 升级到 q5_K_M（5% 更大，质量明显提升）

3. 如果 q5 还不够
   → 考虑 q8_0 或换小一号全精度模型

4. 代码生成场景推荐 q5_K_M 起步
   → q4 在代码精度上损失明显
```

---

## 六、小结

1. **q4_K_M 是日常使用的最佳起点**：体积最小，速度最快，大多数任务够用。
2. **K-quants 比老版 q4_0 更智能**：会对重要层保留更高精度，整体质量更好。
3. 量化对"简单事实型"任务几乎无影响，对"复杂推理型"影响明显。
4. 质量不满足时，先升级量化级别（q4→q5），再考虑换更大的模型。
5. 不要只看参数量——一个量化好的 7B 模型，可能比一个小得多的 3B 全精度模型效果更好。
