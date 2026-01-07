# Step 6: LLM 基础参数 - 理解 Token、Max Tokens、Temperature

## 学习目标

这个任务的本质是回答一个核心问题：**LLM 的核心参数如何影响输出结果，我们如何通过调参来控制生成效果**。

通过本教程，你将：

1. 理解 Token 的概念和计算方式
2. 掌握 max_tokens 参数对输出长度的控制
3. 深入理解 temperature 对创造性和确定性的影响
4. 通过实验对比不同参数组合的效果差异

---

## 一、核心认知：LLM 的"语言单位"——Token

### 1.1 什么是 Token？

```
┌─────────────────────────────────────────────────────────────┐
│                    Token 概念解析                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Token ≠ 单词 ≠ 字符                                        │
│                                                             │
│   Token 是 LLM 处理文本的最小单位                             │
│   它是介于字符和单词之间的一种分词方式                          │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  "Hello world" → ["Hello", " world"]            │       │
│   │                   2 个 tokens                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  "你好世界" → ["你", "好", "世", "界"]             │       │
│   │               4 个 tokens（中文通常 1 字 1 token）│       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  "chatGPT" → ["chat", "G", "PT"]                │       │
│   │              3 个 tokens（驼峰命名会被拆分）      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Token 的计算规则

| 语言/内容类型 | 大致规则                   | 示例                      |
| ------------- | -------------------------- | ------------------------- |
| **英文**      | 约 4 个字符 = 1 token      | "hello" ≈ 1 token         |
| **中文**      | 约 1 个汉字 = 1 token      | "你好" = 2 tokens         |
| **代码**      | 变量名/符号各算            | `const x = 1;` ≈ 5 tokens |
| **空格/标点** | 通常与相邻词合并或单独计算 | " " 可能与后续词合并      |

### 1.3 为什么 Token 重要？

```
┌─────────────────────────────────────────────────────────────┐
│                 Token 的三大影响                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 💰 成本计算                                             │
│      - API 按 token 数量计费                                 │
│      - 输入 token + 输出 token = 总费用                       │
│      - 示例：1K tokens ≈ $0.001-0.01（不同模型价格不同）       │
│                                                             │
│   2. 📏 长度限制                                             │
│      - 每个模型有上下文窗口限制（如 4K, 8K, 128K tokens）      │
│      - 输入 + 输出 不能超过窗口大小                           │
│      - 超出会被截断或报错                                     │
│                                                             │
│   3. ⚡ 响应速度                                             │
│      - Token 数量影响生成时间                                 │
│      - 更多 token = 更长等待时间                              │
│      - 流式输出可以缓解等待感                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 实践：创建 Token 计数工具

创建 `experiments/token-counter.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 通过 API 调用来观察 token 使用情况
 */
async function analyzeTokenUsage(text) {
  console.log('=== Token 使用分析 ===\n')
  console.log('输入文本:', text)
  console.log('文本长度:', text.length, '字符')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: text }],
    max_tokens: 100,
  })

  const usage = response.usage
  console.log('\n--- Token 统计 ---')
  console.log('输入 tokens:', usage.prompt_tokens)
  console.log('输出 tokens:', usage.completion_tokens)
  console.log('总计 tokens:', usage.total_tokens)
  console.log('\n字符/Token 比例:', (text.length / usage.prompt_tokens).toFixed(2))

  return usage
}

/**
 * 对比不同语言的 token 效率
 */
async function compareLanguageTokens() {
  console.log('\n=== 不同语言的 Token 对比实验 ===\n')

  const testCases = [
    { name: '英文', text: 'Hello, this is a test message for token counting.' },
    { name: '中文', text: '你好，这是一条用于统计 token 的测试消息。' },
    { name: '代码', text: 'function add(a, b) { return a + b; }' },
    { name: '混合', text: '使用 JavaScript 实现 hello world 功能' },
  ]

  const results = []

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`)
    console.log('文本:', testCase.text)

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: testCase.text }],
      max_tokens: 10, // 最小输出，专注于输入 token 统计
    })

    const inputTokens = response.usage.prompt_tokens
    const ratio = (testCase.text.length / inputTokens).toFixed(2)

    console.log(`字符数: ${testCase.text.length}, Token 数: ${inputTokens}, 比例: ${ratio}`)

    results.push({
      name: testCase.name,
      chars: testCase.text.length,
      tokens: inputTokens,
      ratio: ratio,
    })
  }

  console.log('\n=== 对比结果汇总 ===')
  console.table(results)
}

// 运行实验
async function main() {
  // 实验 1: 基础 token 分析
  await analyzeTokenUsage('请用一句话解释什么是人工智能。')

  // 实验 2: 语言对比
  await compareLanguageTokens()
}

main().catch(console.error)
```

运行：

```bash
node experiments/token-counter.js
```

**预期观察**：

- 中文每个字符约 1 个 token
- 英文约 4 个字符 1 个 token
- 代码的 token 效率介于两者之间

---

## 二、Max Tokens：控制输出长度

### 2.1 max_tokens 参数详解

```
┌─────────────────────────────────────────────────────────────┐
│                 max_tokens 参数说明                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   定义：限制模型生成的最大 token 数量                          │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  max_tokens: 100                                │       │
│   │  → 模型最多生成 100 个 tokens 后停止              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   重要概念：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  上下文窗口 = 输入 tokens + 输出 tokens            │       │
│   │                                                 │       │
│   │  如果模型上下文窗口是 4096：                      │       │
│   │  输入用了 3000 tokens → 最多输出 1096 tokens      │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   注意事项：                                                 │
│   - 设置过小：输出可能被截断，回答不完整                        │
│   - 设置过大：可能浪费资源，增加延迟                           │
│   - 不设置：使用模型默认值或剩余可用空间                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 max_tokens 使用场景

| 场景         | 推荐 max_tokens | 说明                |
| ------------ | --------------- | ------------------- |
| **简短回答** | 50-100          | 是/否问题、简单事实 |
| **一般对话** | 500-1000        | 日常问答、解释概念  |
| **代码生成** | 1000-2000       | 函数实现、代码片段  |
| **长文写作** | 2000-4000       | 文章、报告、文档    |
| **不限制**   | 不设置或很大    | 让模型自然结束      |

### 2.3 实践：max_tokens 对比实验

创建 `experiments/max-tokens-experiment.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 测试不同 max_tokens 值的效果
 */
async function testMaxTokens(maxTokens) {
  const prompt = '请详细解释什么是机器学习，包括它的定义、主要类型、应用场景和发展趋势。'

  console.log(`\n=== max_tokens: ${maxTokens} ===\n`)

  const startTime = Date.now()

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  })

  const endTime = Date.now()
  const content = response.choices[0].message.content
  const finishReason = response.choices[0].finish_reason

  console.log('输出内容:')
  console.log(content)
  console.log('\n--- 统计信息 ---')
  console.log('结束原因:', finishReason) // 'stop' = 自然结束, 'length' = 达到限制被截断
  console.log('输出 tokens:', response.usage.completion_tokens)
  console.log('耗时:', endTime - startTime, 'ms')

  return {
    maxTokens,
    actualTokens: response.usage.completion_tokens,
    finishReason,
    duration: endTime - startTime,
  }
}

/**
 * 运行对比实验
 */
async function runExperiment() {
  console.log('============================================')
  console.log('       max_tokens 参数对比实验')
  console.log('============================================')
  console.log('\n提示词: "请详细解释什么是机器学习..."')

  const testValues = [50, 200, 500, 1000]
  const results = []

  for (const value of testValues) {
    const result = await testMaxTokens(value)
    results.push(result)
    console.log('\n' + '─'.repeat(50))
  }

  console.log('\n=== 实验结果汇总 ===')
  console.table(results)

  console.log('\n关键发现:')
  for (const result of results) {
    if (result.finishReason === 'length') {
      console.log(`- max_tokens=${result.maxTokens}: 输出被截断（达到限制）`)
    } else {
      console.log(`- max_tokens=${result.maxTokens}: 输出完整（自然结束）`)
    }
  }
}

runExperiment().catch(console.error)
```

运行：

```bash
node experiments/max-tokens-experiment.js
```

**关键观察点**：

- `finish_reason: "length"` 表示输出被截断
- `finish_reason: "stop"` 表示模型自然完成
- 较小的 max_tokens 会导致回答不完整

---

## 三、Temperature：控制创造性与确定性

### 3.1 temperature 参数详解

```
┌─────────────────────────────────────────────────────────────┐
│                 temperature 参数说明                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   定义：控制模型输出的随机性程度                               │
│   取值范围：0.0 - 2.0（通常建议 0.0 - 1.0）                   │
│                                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │                                                 │       │
│   │   0.0        0.3        0.7        1.0    2.0   │       │
│   │    │          │          │          │      │    │       │
│   │    ▼          ▼          ▼          ▼      ▼    │       │
│   │   确定性     较确定     平衡      较随机  非常随机│       │
│   │   (精确)    (推荐)    (默认)    (创意)  (混乱)  │       │
│   │                                                 │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   工作原理：                                                 │
│   - 模型对每个可能的下一个 token 计算概率分布                   │
│   - temperature 影响这个概率分布的"平滑度"                     │
│   - 低温：概率高的 token 更容易被选中（更确定）                 │
│   - 高温：概率分布更均匀，低概率 token 也有机会（更随机）         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 temperature 直观理解

```
┌─────────────────────────────────────────────────────────────┐
│           temperature 的概率分布效果                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   问题：The capital of France is ___                        │
│                                                             │
│   temperature = 0.0 时的 token 概率：                        │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Paris  ████████████████████████  95%          │       │
│   │  Lyon   █                          2%          │       │
│   │  Nice   █                          2%          │       │
│   │  Other  ▏                          1%          │       │
│   └─────────────────────────────────────────────────┘       │
│   → 几乎总是选择 "Paris"                                     │
│                                                             │
│   temperature = 1.0 时的 token 概率：                        │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Paris  █████████████             60%          │       │
│   │  Lyon   ████                      18%          │       │
│   │  Nice   ███                       12%          │       │
│   │  Other  ██                        10%          │       │
│   └─────────────────────────────────────────────────┘       │
│   → 有可能选择其他城市                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 temperature 使用场景

| 场景         | 推荐 temperature | 原因                   |
| ------------ | ---------------- | ---------------------- |
| **代码生成** | 0.0 - 0.3        | 需要精确、可预测的输出 |
| **事实问答** | 0.0 - 0.3        | 需要准确、一致的答案   |
| **文档写作** | 0.3 - 0.5        | 需要一定的表达变化     |
| **对话聊天** | 0.5 - 0.7        | 需要自然、多样的回复   |
| **创意写作** | 0.7 - 1.0        | 需要新颖、独特的内容   |
| **头脑风暴** | 0.8 - 1.2        | 需要发散思维、意外想法 |

### 3.4 实践：temperature 对比实验

创建 `experiments/temperature-experiment.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 实验 1：相同问题，不同 temperature，多次请求
 * 观察输出的一致性
 */
async function experimentConsistency() {
  console.log('============================================')
  console.log('   实验 1: Temperature 对输出一致性的影响')
  console.log('============================================\n')

  const prompt = '用一句话概括：什么是递归？'
  const temperatures = [0.0, 0.5, 1.0]

  for (const temp of temperatures) {
    console.log(`\n--- temperature: ${temp} ---`)
    console.log('连续 3 次请求的结果：\n')

    for (let i = 1; i <= 3; i++) {
      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: temp,
        max_tokens: 100,
      })

      console.log(`第 ${i} 次: ${response.choices[0].message.content}`)
    }
  }
}

/**
 * 实验 2：创意任务中 temperature 的影响
 */
async function experimentCreativity() {
  console.log('\n\n============================================')
  console.log('   实验 2: Temperature 对创造性的影响')
  console.log('============================================\n')

  const prompt = '为一家咖啡店想一个有创意的店名，只需要名字，不要解释。'
  const temperatures = [0.0, 0.5, 0.8, 1.2]

  for (const temp of temperatures) {
    console.log(`\n--- temperature: ${temp} ---`)
    console.log('生成 5 个店名：')

    const names = []
    for (let i = 0; i < 5; i++) {
      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: temp,
        max_tokens: 50,
      })

      names.push(response.choices[0].message.content.trim())
    }

    console.log(names.join(' | '))

    // 计算重复率
    const uniqueNames = [...new Set(names)]
    console.log(`唯一名字数: ${uniqueNames.length}/5 (重复率: ${(((5 - uniqueNames.length) / 5) * 100).toFixed(0)}%)`)
  }
}

/**
 * 实验 3：代码生成任务中 temperature 的影响
 */
async function experimentCodeGeneration() {
  console.log('\n\n============================================')
  console.log('   实验 3: Temperature 对代码生成的影响')
  console.log('============================================\n')

  const prompt = '用 JavaScript 写一个判断素数的函数，只输出代码，不要解释。'
  const temperatures = [0.0, 0.7, 1.0]

  for (const temp of temperatures) {
    console.log(`\n--- temperature: ${temp} ---\n`)

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
      max_tokens: 300,
    })

    console.log(response.choices[0].message.content)
    console.log('\n' + '─'.repeat(40))
  }
}

/**
 * 运行所有实验
 */
async function runAllExperiments() {
  await experimentConsistency()
  await experimentCreativity()
  await experimentCodeGeneration()

  console.log('\n\n============================================')
  console.log('              实验总结')
  console.log('============================================')
  console.log(`
关键发现：

1. 一致性实验：
   - temperature=0.0: 多次请求结果几乎相同
   - temperature=1.0: 每次结果都不同

2. 创意实验：
   - 低温: 名字重复率高，缺乏多样性
   - 高温: 名字更有创意，但可能出现奇怪结果

3. 代码实验：
   - 低温: 代码风格一致，更符合常见写法
   - 高温: 可能出现不同的实现方式

实践建议：
- 需要确定性输出 → temperature=0.0-0.3
- 需要创造性输出 → temperature=0.7-1.0
- 生产环境代码生成 → temperature=0.0
`)
}

runAllExperiments().catch(console.error)
```

运行：

```bash
node experiments/temperature-experiment.js
```

---

## 四、综合实践：参数组合实验

### 4.1 创建参数调优工具

创建 `experiments/parameter-tuner.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 参数调优实验器
 * 对比不同参数组合的效果
 */
class ParameterTuner {
  constructor() {
    this.results = []
  }

  /**
   * 运行单次测试
   */
  async runTest(prompt, params, label) {
    const startTime = Date.now()

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      ...params,
    })

    const endTime = Date.now()

    return {
      label,
      params: { ...params },
      output: response.choices[0].message.content,
      finishReason: response.choices[0].finish_reason,
      usage: response.usage,
      duration: endTime - startTime,
    }
  }

  /**
   * 运行参数组合对比
   */
  async compareParameters(prompt, parameterSets) {
    console.log('=== 参数组合对比实验 ===\n')
    console.log('测试提示词:', prompt)
    console.log('\n' + '═'.repeat(60) + '\n')

    const results = []

    for (const { label, params } of parameterSets) {
      console.log(`--- ${label} ---`)
      console.log('参数:', JSON.stringify(params))

      const result = await this.runTest(prompt, params, label)
      results.push(result)

      console.log('\n输出:')
      console.log(result.output)
      console.log('\n统计:')
      console.log(`  结束原因: ${result.finishReason}`)
      console.log(`  输入 tokens: ${result.usage.prompt_tokens}`)
      console.log(`  输出 tokens: ${result.usage.completion_tokens}`)
      console.log(`  耗时: ${result.duration}ms`)
      console.log('\n' + '─'.repeat(60) + '\n')
    }

    return results
  }

  /**
   * 生成对比报告
   */
  generateReport(results) {
    console.log('\n=== 对比报告 ===\n')

    const summary = results.map(r => ({
      配置: r.label,
      temperature: r.params.temperature ?? '默认',
      max_tokens: r.params.max_tokens ?? '默认',
      输出tokens: r.usage.completion_tokens,
      完成状态: r.finishReason === 'stop' ? '完整' : '截断',
      耗时ms: r.duration,
    }))

    console.table(summary)
  }
}

/**
 * 场景 1：问答任务参数调优
 */
async function tuneForQA() {
  console.log('\n' + '█'.repeat(60))
  console.log('    场景 1: 问答任务参数调优')
  console.log('█'.repeat(60) + '\n')

  const tuner = new ParameterTuner()

  const prompt = '解释一下什么是 RESTful API，以及它的核心设计原则。'

  const results = await tuner.compareParameters(prompt, [
    {
      label: '精确模式',
      params: { temperature: 0.0, max_tokens: 500 },
    },
    {
      label: '平衡模式',
      params: { temperature: 0.5, max_tokens: 500 },
    },
    {
      label: '创意模式',
      params: { temperature: 0.9, max_tokens: 500 },
    },
  ])

  tuner.generateReport(results)
}

/**
 * 场景 2：代码生成参数调优
 */
async function tuneForCode() {
  console.log('\n' + '█'.repeat(60))
  console.log('    场景 2: 代码生成参数调优')
  console.log('█'.repeat(60) + '\n')

  const tuner = new ParameterTuner()

  const prompt = '用 JavaScript 实现一个简单的事件发布订阅（EventEmitter）类。'

  const results = await tuner.compareParameters(prompt, [
    {
      label: '低温短输出',
      params: { temperature: 0.0, max_tokens: 300 },
    },
    {
      label: '低温长输出',
      params: { temperature: 0.0, max_tokens: 800 },
    },
    {
      label: '中温长输出',
      params: { temperature: 0.5, max_tokens: 800 },
    },
  ])

  tuner.generateReport(results)
}

/**
 * 场景 3：创意写作参数调优
 */
async function tuneForCreativeWriting() {
  console.log('\n' + '█'.repeat(60))
  console.log('    场景 3: 创意写作参数调优')
  console.log('█'.repeat(60) + '\n')

  const tuner = new ParameterTuner()

  const prompt = '写一个关于程序员和 AI 之间友情的微小说开头（100字以内）。'

  const results = await tuner.compareParameters(prompt, [
    {
      label: '保守创作',
      params: { temperature: 0.3, max_tokens: 200 },
    },
    {
      label: '标准创作',
      params: { temperature: 0.7, max_tokens: 200 },
    },
    {
      label: '大胆创作',
      params: { temperature: 1.0, max_tokens: 200 },
    },
    {
      label: '极端创作',
      params: { temperature: 1.5, max_tokens: 200 },
    },
  ])

  tuner.generateReport(results)
}

/**
 * 运行所有调优实验
 */
async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              LLM 参数调优实验                                  ║
║                                                              ║
║  本实验将对比不同 temperature 和 max_tokens 组合的效果         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`)

  await tuneForQA()
  await tuneForCode()
  await tuneForCreativeWriting()

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                      参数选择指南                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  场景           │ temperature │ max_tokens                   ║
║  ───────────────┼─────────────┼──────────                    ║
║  代码生成       │  0.0 - 0.2  │ 根据复杂度 500-2000          ║
║  事实问答       │  0.0 - 0.3  │ 根据详细度 200-800           ║
║  文档写作       │  0.3 - 0.5  │ 根据长度 500-2000            ║
║  对话交流       │  0.5 - 0.7  │ 500-1000                     ║
║  创意写作       │  0.7 - 1.0  │ 根据需要                      ║
║  头脑风暴       │  1.0 - 1.5  │ 不限制                        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`)
}

main().catch(console.error)
```

运行：

```bash
node experiments/parameter-tuner.js
```

---

## 五、其他重要参数（扩展知识）

### 5.1 top_p（核采样）

```
┌─────────────────────────────────────────────────────────────┐
│                    top_p 参数说明                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   也叫 "nucleus sampling"（核采样）                          │
│   取值范围：0.0 - 1.0                                        │
│                                                             │
│   工作原理：                                                 │
│   - 按概率从高到低排列所有可能的 token                         │
│   - 累加概率直到达到 top_p 值                                │
│   - 只从这个"核"中采样                                       │
│                                                             │
│   示例（top_p = 0.9）：                                      │
│   ┌──────────────────────────────────────────────────┐      │
│   │  Token   概率    累积概率   是否在核中             │      │
│   │  ─────   ────    ────────   ──────────            │      │
│   │  "的"    45%     45%        ✅                    │      │
│   │  "是"    25%     70%        ✅                    │      │
│   │  "有"    15%     85%        ✅                    │      │
│   │  "在"    8%      93%        ✅（刚好超过 90%）     │      │
│   │  "和"    4%      97%        ❌                    │      │
│   │  其他    3%      100%       ❌                    │      │
│   └──────────────────────────────────────────────────┘      │
│                                                             │
│   建议：                                                     │
│   - 通常 temperature 和 top_p 二选一调整                     │
│   - 同时调整可能产生不可预测的结果                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 frequency_penalty 与 presence_penalty

```
┌─────────────────────────────────────────────────────────────┐
│              重复惩罚参数说明                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   frequency_penalty（频率惩罚）                               │
│   ─────────────────────────────                             │
│   - 取值：-2.0 到 2.0                                        │
│   - 作用：根据 token 已出现的次数来惩罚                          │
│   - 正值：减少重复用词（出现越多，惩罚越大）                       │
│   - 负值：鼓励重复用词                                         │
│                                                             │
│   presence_penalty（存在惩罚）                                │
│   ────────────────────────────                              │
│   - 取值：-2.0 到 2.0                                        │
│   - 作用：根据 token 是否已出现来惩罚                           │
│   - 正值：鼓励使用新词汇，增加话题多样性                          │
│   - 负值：倾向于重复已有内容                                    │
│                                                             │
│   区别：                                                     │
│   ┌──────────────────────────────────────────────────┐      │
│   │  "我喜欢苹果，苹果很好吃，苹果苹果苹果"                │      │
│   │                                                  │      │
│   │  presence_penalty: "苹果"出现过 → 惩罚固定值        │      │
│   │  frequency_penalty: "苹果"出现5次 → 惩罚 5 倍       │      │
│   └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 参数速查表

| 参数                | 取值范围   | 默认值   | 作用         |
| ------------------- | ---------- | -------- | ------------ |
| `temperature`       | 0.0-2.0    | 1.0      | 控制随机性   |
| `max_tokens`        | 1-模型上限 | 模型默认 | 限制输出长度 |
| `top_p`             | 0.0-1.0    | 1.0      | 核采样阈值   |
| `frequency_penalty` | -2.0-2.0   | 0        | 频率重复惩罚 |
| `presence_penalty`  | -2.0-2.0   | 0        | 存在重复惩罚 |
| `stop`              | 字符串数组 | null     | 停止序列     |

---

## 六、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：概念理解

- [ ] 理解 Token 是什么，以及与字符、单词的区别
- [ ] 知道中英文的 Token 计算差异
- [ ] 理解 Token 对成本、长度限制、响应速度的影响

### 第二层：参数掌握

- [ ] 掌握 max_tokens 的作用和使用场景
- [ ] 理解 finish_reason 中 "stop" 和 "length" 的区别
- [ ] 掌握 temperature 的作用原理
- [ ] 知道不同场景下 temperature 的推荐值

### 第三层：实践能力

- [ ] 运行了 Token 计数实验
- [ ] 运行了 max_tokens 对比实验
- [ ] 运行了 temperature 一致性实验
- [ ] 运行了 temperature 创意实验
- [ ] 运行了参数组合调优实验

### 综合能力

- [ ] 能根据任务类型选择合适的参数组合
- [ ] 能解释参数调整对输出的影响
- [ ] 能进行参数调优实验并分析结果

---

## 七、实践作业

### 作业 1：Token 成本计算器

**要求**：

- 创建一个工具，输入一段文本
- 输出：Token 数量、预估成本（假设 $0.001/1K tokens）
- 对比中英文版本的成本差异

### 作业 2：最优 temperature 探索

**要求**：

- 选择一个特定任务（如翻译、摘要、改写）
- 测试 5 个不同的 temperature 值
- 人工评估输出质量，找到最优值
- 记录你的发现

### 作业 3：自动参数调优器

**要求**：

- 创建一个工具，对同一个 prompt
- 自动测试多种参数组合
- 输出包含质量评分的对比报告
- 推荐最佳参数组合

---

## 八、常见问题排查

### Q1: 输出突然被截断

**原因**：max_tokens 设置过小

**解决**：

1. 检查 `finish_reason`，如果是 `length` 说明被截断
2. 增加 max_tokens 值
3. 或者优化 prompt，要求更简洁的输出

### Q2: 每次输出都一样，缺乏变化

**原因**：temperature 设置为 0 或很低

**解决**：

1. 如果需要多样性，提高 temperature 到 0.7-1.0
2. 如果确实需要一致性，当前设置是正确的

### Q3: 输出内容很奇怪或不合逻辑

**原因**：temperature 设置过高

**解决**：

1. 降低 temperature 到 0.5 以下
2. 对于事实性任务，使用 temperature=0

### Q4: 成本超出预期

**原因**：Token 消耗过多

**解决**：

1. 精简 prompt，减少不必要的说明
2. 设置合理的 max_tokens 上限
3. 使用更高效的提示词设计
4. 考虑中文任务的 token 成本（1 字 ≈ 1 token）

---

## 九、项目文件总结

完成本教程后，你的练习文件应该包括：

```
experiments/
├── token-counter.js           # Token 计数与语言对比
├── max-tokens-experiment.js   # max_tokens 参数实验
├── temperature-experiment.js  # temperature 参数实验
└── parameter-tuner.js         # 综合参数调优工具
```

---

## 十、下一步学习方向

完成本节后，你可以深入以下方向：

1. **高级采样策略**

   - top_p 与 temperature 的组合使用
   - beam search vs sampling
   - 自定义采样策略

2. **上下文管理**

   - 长文本的 Token 优化
   - 上下文窗口的有效利用
   - 会话历史的管理策略

3. **成本优化**

   - 不同模型的性价比对比
   - Prompt 压缩技术
   - 缓存策略

4. **质量评估**
   - 建立输出质量评估指标
   - A/B 测试框架
   - 自动化评估流程

---

**掌握这些基础参数，就是掌握了与 LLM 对话的"音量旋钮"和"风格开关"。理解它们的工作原理，才能在不同场景下做出正确的调参决策。**
