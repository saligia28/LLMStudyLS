# Step 88: Ollama 入门｜加入 stream 输出

## 学习目标

这一节实现 Ollama 的流式输出，体验本地模型的逐 token 输出过程。

完成后你应该能：

1. 理解 Ollama 流式响应的数据格式（newline-delimited JSON）
2. 用 Node.js fetch API 实现流式读取
3. 对比 Ollama streaming 与 OpenAI SSE 的异同
4. 构建一个完整的命令行流式对话循环
5. 处理流式输出中的错误和中断

---

## 一、Ollama 流式响应格式

Ollama 的流式输出与 OpenAI 的 SSE 不同，它使用**换行符分隔的 JSON**（NDJSON）：

```text
// 每行是一个完整的 JSON 对象

{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"你"},"done":false}
{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"好"},"done":false}
{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"！"},"done":false}
{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":""},"done":true,"total_duration":1234567890,"eval_count":42,"eval_duration":900000000}
```

最后一行 `"done":true` 时携带统计信息（耗时、token 数等）。

---

## 二、Node.js 流式实现

```js
// stream-chat.js
import 'dotenv/config'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'

async function streamChat(model, messages) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Ollama 请求失败 (${response.status}): ${err}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let stats = null

  process.stdout.write(`\n[${model}]: `)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value, { stream: true })
    const lines = text.split('\n').filter(l => l.trim())

    for (const line of lines) {
      try {
        const data = JSON.parse(line)

        if (!data.done) {
          const token = data.message?.content || ''
          process.stdout.write(token)
          fullContent += token
        } else {
          // 最后一行，包含统计信息
          stats = {
            totalDuration: data.total_duration,
            evalCount: data.eval_count,
            evalDuration: data.eval_duration,
          }
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  process.stdout.write('\n')

  if (stats) {
    const tokensPerSec = stats.evalCount / (stats.evalDuration / 1e9)
    console.log(`[统计] ${stats.evalCount} tokens | ${tokensPerSec.toFixed(1)} tokens/s`)
  }

  return fullContent
}

// 测试
const answer = await streamChat('llama3', [
  { role: 'user', content: '用三句话解释什么是大语言模型。' }
])
```

---

## 三、多轮流式对话

```js
// interactive-stream.js
import readline from 'readline'
import 'dotenv/config'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const MODEL = process.argv[2] || 'llama3'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const history = []

async function chat(userMessage) {
  history.push({ role: 'user', content: userMessage })

  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: history, stream: true }),
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let assistantMessage = ''

  process.stdout.write(`\n助手: `)

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    for (const line of chunk.split('\n').filter(Boolean)) {
      try {
        const data = JSON.parse(line)
        if (!data.done && data.message?.content) {
          process.stdout.write(data.message.content)
          assistantMessage += data.message.content
        }
      } catch { /* ignore */ }
    }
  }

  process.stdout.write('\n\n')
  history.push({ role: 'assistant', content: assistantMessage })
}

function prompt() {
  rl.question('你: ', async (input) => {
    const question = input.trim()
    if (!question) return prompt()
    if (question === '/quit') { rl.close(); return }
    if (question === '/clear') {
      history.length = 0
      console.log('[对话历史已清空]\n')
      return prompt()
    }

    try {
      await chat(question)
    } catch (err) {
      console.error('错误:', err.message)
    }
    prompt()
  })
}

console.log(`使用模型: ${MODEL}`)
console.log('输入 /quit 退出，/clear 清除历史\n')
prompt()
```

---

## 四、与 OpenAI SSE 的对比

| 特性 | Ollama Stream | OpenAI SSE |
| --- | --- | --- |
| 格式 | 换行分隔 JSON | `data: {...}\n\n` |
| 结束标记 | `"done":true` | `data: [DONE]` |
| 统计信息 | 最后一行包含 | 不包含 |
| Node.js 处理 | `body.getReader()` | `body.getReader()` 或 SDK |
| 适配 OpenAI SDK | `/v1` 端点可用 | 原生支持 |

---

## 五、适配 OpenAI SDK（推荐）

Ollama 提供 OpenAI 兼容端点，可以直接用 OpenAI SDK：

```js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: 'ollama',  // Ollama 不校验 key
  baseURL: 'http://localhost:11434/v1',
})

// 流式输出，和 OpenAI 完全一样的写法
const stream = await client.chat.completions.create({
  model: 'llama3',
  messages: [{ role: 'user', content: '解释向量数据库的原理。' }],
  stream: true,
})

for await (const chunk of stream) {
  const token = chunk.choices[0]?.delta?.content || ''
  process.stdout.write(token)
}
process.stdout.write('\n')
```

推荐用这种方式：**一套代码，切换 baseURL 就能在 DeepSeek 和 Ollama 之间切换**。

---

## 六、小结

1. Ollama 流式格式是**换行分隔 JSON**，每行独立解析，最后一行含统计信息。
2. 用 `response.body.getReader()` 手动读取流，或直接用 **Ollama 的 `/v1` 端点配合 OpenAI SDK**。
3. 最后一行的 `eval_count / eval_duration` 可以计算真实的 **tokens/s**，是性能测试的基础数据。
4. 多轮对话需要维护 `history` 数组，每次将完整历史传给 Ollama。
5. 推荐使用 OpenAI SDK + `/v1` 兼容端点，复用已有的 API 调用逻辑。
