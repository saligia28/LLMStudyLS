# Step 87: Ollama 入门｜写一个 Ollama 请求脚本

## 学习目标

这一节的重点是从 CLI 对话进入编程调用，用 Node.js 脚本直接对接 Ollama 的 REST API。

做完本节后，你应该能：

1. 理解 Ollama REST API 的两个核心端点：`/api/chat` 与 `/api/generate`
2. 用 Node.js `fetch` 写一个完整的 Ollama 调用脚本
3. 解析 Ollama 的 JSON 响应格式
4. 对比 Ollama API 与 OpenAI API 的异同
5. 实现一个 adapter，让 Ollama 像 OpenAI SDK 一样被调用

> **核心**：Ollama 的 API 设计刻意向 OpenAI 靠拢，理解这个设计意图，让你能在本地模型与云端 API 之间无缝切换。

---

## 一、Ollama REST API 概览

### 1.1 基础信息

Ollama daemon 在本地监听以下地址：

```
Base URL: http://localhost:11434
```

主要端点：

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/chat` | POST | 多轮对话（messages 数组格式） |
| `/api/generate` | POST | 单次文本生成（completion 格式） |
| `/api/tags` | GET | 列出本地模型 |
| `/api/show` | POST | 查看模型详情 |
| `/api/pull` | POST | 拉取模型 |
| `/api/delete` | DELETE | 删除模型 |

### 1.2 /api/chat 请求结构

```json
{
  "model": "llama3:8b",
  "messages": [
    { "role": "system", "content": "你是一个帮助用户的 AI 助手" },
    { "role": "user", "content": "用简单的话解释机器学习" }
  ],
  "stream": false,
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "num_predict": 512
  }
}
```

### 1.3 /api/generate 请求结构

```json
{
  "model": "llama3:8b",
  "prompt": "用简单的话解释机器学习",
  "system": "你是一个帮助用户的 AI 助手",
  "stream": false,
  "options": {
    "temperature": 0.7
  }
}
```

> `/api/chat` 适合多轮对话（有 messages 历史），`/api/generate` 适合单次补全任务。

---

## 二、第一个 Ollama 请求脚本

### 2.1 项目初始化

```bash
mkdir ollama-client && cd ollama-client
npm init -y
```

确认 `package.json` 中有 `"type": "module"`（使用 ES Modules）：

```json
{
  "name": "ollama-client",
  "version": "1.0.0",
  "type": "module"
}
```

### 2.2 基础请求脚本

创建 `chat.js`：

```javascript
// chat.js — 最简单的 Ollama /api/chat 调用

const OLLAMA_BASE_URL = 'http://localhost:11434';

async function chat(model, messages, options = {}) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      options: {
        temperature: 0.7,
        ...options,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data;
}

// 主函数
async function main() {
  const model = 'llama3:8b';
  const messages = [
    {
      role: 'system',
      content: '你是一个简洁的 AI 助手，用中文回答，每次回答不超过 100 字。',
    },
    {
      role: 'user',
      content: '什么是向量数据库？',
    },
  ];

  console.log(`[发送请求] 模型: ${model}`);
  console.log(`[问题] ${messages[messages.length - 1].content}\n`);

  const result = await chat(model, messages);

  console.log(`[回答]\n${result.message.content}`);
  console.log('\n[统计信息]');
  console.log(`  模型: ${result.model}`);
  console.log(`  生成 token 数: ${result.eval_count}`);
  console.log(`  总耗时: ${(result.total_duration / 1e9).toFixed(2)}s`);
  console.log(`  推理速度: ${(result.eval_count / (result.eval_duration / 1e9)).toFixed(1)} tokens/s`);
}

main().catch(console.error);
```

运行：

```bash
node chat.js
```

### 2.3 理解响应格式

Ollama `/api/chat` 的响应（`stream: false` 时）：

```json
{
  "model": "llama3:8b",
  "created_at": "2024-08-01T10:00:00Z",
  "message": {
    "role": "assistant",
    "content": "向量数据库是专门用于存储和检索高维向量的数据库..."
  },
  "done": true,
  "total_duration": 5500000000,
  "load_duration": 800000000,
  "prompt_eval_count": 42,
  "prompt_eval_duration": 500000000,
  "eval_count": 128,
  "eval_duration": 4200000000
}
```

关键字段说明：

| 字段 | 含义 | 单位 |
|---|---|---|
| `message.content` | 模型回答文本 | 字符串 |
| `total_duration` | 总耗时 | 纳秒 |
| `load_duration` | 模型加载时间 | 纳秒 |
| `prompt_eval_count` | 输入 token 数 | 整数 |
| `eval_count` | 输出 token 数 | 整数 |
| `eval_duration` | 推理耗时 | 纳秒 |

---

## 三、/api/generate 端点调用

### 3.1 generate 脚本

```javascript
// generate.js — 调用 /api/generate

const OLLAMA_BASE_URL = 'http://localhost:11434';

async function generate(model, prompt, system = '', options = {}) {
  const body = {
    model,
    prompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 512,
      ...options,
    },
  };

  if (system) {
    body.system = system;
  }

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const result = await generate(
    'qwen2:7b',
    '列出 3 个使用向量数据库的典型应用场景',
    '你是一个技术专家，用中文简洁回答。'
  );

  console.log('回答:', result.response);
  console.log('耗时:', (result.total_duration / 1e9).toFixed(2) + 's');
}

main().catch(console.error);
```

---

## 四、Ollama API 与 OpenAI API 对比

### 4.1 接口层面对比

| 特性 | OpenAI API | Ollama API |
|---|---|---|
| 端点 | `/v1/chat/completions` | `/api/chat` |
| 认证 | `Authorization: Bearer <key>` | 无需认证（本地） |
| messages 格式 | 相同 | 相同 |
| 模型字段 | `"model": "gpt-4o"` | `"model": "llama3:8b"` |
| 响应字段 | `choices[0].message.content` | `message.content` |
| 流式格式 | SSE（`data: {...}\n\n`） | NDJSON（`{...}\n`） |
| 统计信息 | `usage.total_tokens` | `eval_count`, `total_duration` |

### 4.2 OpenAI 兼容模式

Ollama 提供了一个 OpenAI 兼容端点：

```
POST http://localhost:11434/v1/chat/completions
```

这意味着你可以直接用 OpenAI SDK 调 Ollama：

```javascript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama', // 随便填，Ollama 不验证
});

const response = await client.chat.completions.create({
  model: 'llama3:8b',
  messages: [
    { role: 'user', content: '你好！' },
  ],
});

console.log(response.choices[0].message.content);
```

> 这个兼容模式极其实用——可以在不修改代码的情况下，把现有 OpenAI 应用切换到本地 Ollama。

---

## 五、实现一个通用 Ollama Adapter

### 5.1 adapter.js

```javascript
// adapter.js — 让 Ollama 用起来像 OpenAI SDK

const OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaAdapter {
  constructor(model = 'llama3:8b', baseUrl = OLLAMA_BASE_URL) {
    this.model = model;
    this.baseUrl = baseUrl;
  }

  /**
   * 非流式对话 — 接口与 OpenAI SDK 一致
   * @param {Array} messages - [{role, content}]
   * @param {Object} options - 模型参数
   * @returns {Object} - { content, usage, model }
   */
  async chat(messages, options = {}) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model || this.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.max_tokens ?? 1024,
          top_p: options.top_p ?? 0.9,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    // 返回与 OpenAI 风格一致的对象
    return {
      content: data.message.content,
      model: data.model,
      usage: {
        prompt_tokens: data.prompt_eval_count,
        completion_tokens: data.eval_count,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latency: {
        total_ms: Math.round(data.total_duration / 1e6),
        tokens_per_second: data.eval_count
          ? (data.eval_count / (data.eval_duration / 1e9)).toFixed(1)
          : null,
      },
    };
  }

  /**
   * 列出本地可用模型
   */
  async listModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    return data.models.map((m) => ({
      id: m.name,
      size: m.size,
      modified: m.modified_at,
    }));
  }

  /**
   * 检查 Ollama daemon 是否运行
   */
  async isAvailable() {
    try {
      const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// 使用示例
async function demo() {
  const ollama = new OllamaAdapter('qwen2:7b');

  // 检查服务可用性
  const available = await ollama.isAvailable();
  if (!available) {
    console.error('Ollama daemon 未运行，请先执行 ollama serve');
    process.exit(1);
  }

  // 列出模型
  console.log('可用模型:');
  const models = await ollama.listModels();
  models.forEach((m) => console.log(`  - ${m.id} (${(m.size / 1e9).toFixed(1)} GB)`));

  // 发起对话
  const result = await ollama.chat([
    { role: 'system', content: '你是一个简洁的技术助手，用中文回答。' },
    { role: 'user', content: '什么是 RAG？用两句话解释。' },
  ]);

  console.log('\n回答:', result.content);
  console.log('Token 用量:', result.usage);
  console.log('推理速度:', result.latency.tokens_per_second, 'tokens/s');
}

demo().catch(console.error);
```

---

## 六、多轮对话状态管理

### 6.1 维护对话历史

```javascript
// multi-turn.js — 多轮对话示例

import { OllamaAdapter } from './adapter.js';
import * as readline from 'readline/promises';

async function multiTurnChat() {
  const ollama = new OllamaAdapter('qwen2:7b');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const history = [
    { role: 'system', content: '你是一个友好的 AI 助手，用简洁的中文回答。' },
  ];

  console.log('多轮对话已启动（输入 exit 退出）\n');

  while (true) {
    const userInput = await rl.question('你: ');
    if (userInput.trim().toLowerCase() === 'exit') break;

    history.push({ role: 'user', content: userInput.trim() });

    process.stdout.write('AI: ');
    const result = await ollama.chat(history);
    console.log(result.content);
    console.log(`[${result.latency.tokens_per_second} tokens/s]\n`);

    // 将助手回答加入历史
    history.push({ role: 'assistant', content: result.content });
  }

  rl.close();
  console.log('对话结束。');
}

multiTurnChat().catch(console.error);
```

---

## 小结

1. Ollama 提供两个核心端点：`/api/chat`（多轮对话）和 `/api/generate`（单次补全）
2. 响应中的 `eval_count` / `eval_duration` 直接给出 token 速度，无需额外计算
3. Ollama 提供 `/v1/chat/completions` 兼容端点，可以用 OpenAI SDK 直接调用，迁移成本极低
4. 封装一个 `OllamaAdapter` 让调用接口统一，方便后续在本地与云端 API 之间切换
5. 多轮对话的关键是在客户端维护 `messages` 历史数组，Ollama 本身是无状态的
