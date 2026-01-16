# Step 15: 对话记忆｜理解上下文（context window）和 token 预算

## 学习目标

这个任务的本质是回答一个核心问题：**为什么 LLM 对话会"忘记"之前说的话？如何管理有限的上下文空间？**

通过本教程，你将：

1. 理解 LLM 的上下文窗口（context window）机制
2. 学会计算和管理 token 预算
3. 掌握多轮对话的消息历史管理
4. 了解不同的记忆策略及其权衡

---

## 一、核心认知：LLM 的"记忆"本质

### 1.1 LLM 没有真正的记忆

```
┌─────────────────────────────────────────────────────────────┐
│           LLM 的"记忆"是如何工作的？                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ❌ 错误认知：                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  LLM 会"记住"之前的对话，像人一样存储记忆       │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   ✅ 正确认知：                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  LLM 每次调用都是独立的，"记忆"来自于           │       │
│   │  把历史对话作为输入再次喂给模型                │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   第一轮对话：                                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Input:  "你好，我叫小明"                       │       │
│   │  Output: "你好小明！很高兴认识你"               │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   第二轮对话（错误做法）：                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Input:  "我叫什么名字？"                       │       │
│   │  Output: "抱歉，我不知道你的名字"               │       │
│   └─────────────────────────────────────────────────┘       │
│                    ↓                                        │
│           模型无法"记住"之前的对话                           │
│                                                             │
│   第二轮对话（正确做法）：                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  Input:  [                                       │       │
│   │    { role: "user", content: "你好，我叫小明" },  │       │
│   │    { role: "assistant", content: "你好小明！..." },│     │
│   │    { role: "user", content: "我叫什么名字？" }   │       │
│   │  ]                                               │       │
│   │  Output: "你的名字是小明"                       │       │
│   └─────────────────────────────────────────────────┘       │
│                    ↓                                        │
│           通过重新输入历史实现"记忆"                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**关键洞察：**
- LLM 本身是无状态的（stateless）
- "记忆"是通过重新发送历史消息实现的
- 每次 API 调用都需要包含完整的上下文

---

### 1.2 什么是 Context Window（上下文窗口）

```
┌─────────────────────────────────────────────────────────────┐
│                   Context Window 可视化                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Context Window = 模型一次能"看到"的最大文本量              │
│                                                             │
│   以 GPT-3.5-turbo (4K) 为例：                               │
│   ┌────────────────────── 4096 tokens ──────────────────┐   │
│   │                                                      │   │
│   │  ┌──────────────────────────────────────────────┐   │   │
│   │  │ System Prompt (系统提示)                     │   │   │
│   │  │ "You are a helpful assistant..."             │   │   │
│   │  │ ~50 tokens                                   │   │   │
│   │  └──────────────────────────────────────────────┘   │   │
│   │                                                      │   │
│   │  ┌──────────────────────────────────────────────┐   │   │
│   │  │ History (历史消息)                            │   │   │
│   │  │ User: "..."                                  │   │   │
│   │  │ Assistant: "..."                             │   │   │
│   │  │ User: "..."                                  │   │   │
│   │  │ ~3000 tokens                                 │   │   │
│   │  └──────────────────────────────────────────────┘   │   │
│   │                                                      │   │
│   │  ┌──────────────────────────────────────────────┐   │   │
│   │  │ Current Input (当前输入)                      │   │   │
│   │  │ User: "请帮我写一个..."                      │   │   │
│   │  │ ~200 tokens                                  │   │   │
│   │  └──────────────────────────────────────────────┘   │   │
│   │                                                      │   │
│   │  ┌──────────────────────────────────────────────┐   │   │
│   │  │ Response Space (响应空间)                     │   │   │
│   │  │ Assistant: "好的，我来帮你..."               │   │   │
│   │  │ ~846 tokens (剩余空间)                       │   │   │
│   │  └──────────────────────────────────────────────┘   │   │
│   │                                                      │   │
│   └──────────────────────────────────────────────────────┘   │
│                                                             │
│   常见模型的 Context Window：                                │
│   - GPT-3.5-turbo:     4K / 16K tokens                      │
│   - GPT-4:             8K / 32K / 128K tokens               │
│   - GPT-4-turbo:       128K tokens                          │
│   - Claude 3:          200K tokens                          │
│   - DeepSeek V3:       64K tokens                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**重要概念：**
- **输入 tokens**: 系统提示 + 历史消息 + 当前输入
- **输出 tokens**: 模型生成的响应
- **总和不能超过 context window 限制**

---

### 1.3 什么是 Token？

```
┌─────────────────────────────────────────────────────────────┐
│                    Token 分词示例                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   文本: "Hello, 世界！I love AI."                            │
│                                                             │
│   Token 分解:                                                │
│   ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐         │
│   │Hello│  ,  │  世 │  界 │  ！ │  I  │ love│ AI  │         │
│   └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘         │
│     1      2     3     4     5     6     7     8            │
│                                                             │
│   共 8 个 tokens                                             │
│                                                             │
│   估算规则（英文）：                                          │
│   - 1 token ≈ 4 个字符（平均）                               │
│   - 1 token ≈ 0.75 个单词                                    │
│   - 100 tokens ≈ 75 个单词                                   │
│                                                             │
│   估算规则（中文）：                                          │
│   - 1 个汉字 ≈ 1-2 个 tokens                                 │
│   - 100 个汉字 ≈ 150-200 tokens                              │
│                                                             │
│   代码示例：                                                 │
│   ┌─────────────────────────────────────────────────┐       │
│   │  function hello() {                              │       │
│   │    console.log("Hello World");                   │       │
│   │  }                                               │       │
│   └─────────────────────────────────────────────────┘       │
│   约 15-20 tokens                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**实用工具：**
- OpenAI Tokenizer: https://platform.openai.com/tokenizer
- tiktoken 库（Python）: 精确计算 token 数

---

## 二、Token 预算管理策略

### 2.1 为什么需要管理 Token 预算？

```
┌─────────────────────────────────────────────────────────────┐
│              Token 超限会发生什么？                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   场景：用户在长时间聊天后继续对话                            │
│                                                             │
│   消息历史增长：                                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  轮次 1:   50 tokens   ✅ 正常                   │       │
│   │  轮次 2:   150 tokens  ✅ 正常                   │       │
│   │  轮次 3:   400 tokens  ✅ 正常                   │       │
│   │  轮次 4:   800 tokens  ✅ 正常                   │       │
│   │  轮次 5:   1500 tokens ✅ 正常                   │       │
│   │  轮次 6:   2800 tokens ✅ 正常                   │       │
│   │  轮次 7:   4200 tokens ❌ 超出限制！              │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   可能的后果：                                               │
│   1. API 返回错误: "context_length_exceeded"                 │
│   2. 请求被拒绝，用户无法继续对话                             │
│   3. 费用快速增长（按 token 计费）                           │
│   4. 响应时间变长（更多 token 需要更长处理时间）              │
│                                                             │
│   Token 预算管理的必要性：                                    │
│   ┌─────────────────────────────────────────────────┐       │
│   │  ✅ 防止超出上下文窗口限制                       │       │
│   │  ✅ 控制 API 调用成本                            │       │
│   │  ✅ 保持响应速度                                 │       │
│   │  ✅ 提供稳定的用户体验                           │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 2.2 简单的 Token 计数器

创建 `experiments/memory/token-counter.js`：

```javascript
/**
 * Token 计数器
 * 用于估算文本的 token 数量
 */

/**
 * 简单估算 token 数（英文为主）
 * 实际应用建议使用 tiktoken 等精确工具
 */
function estimateTokens(text) {
  if (!text) return 0;

  // 简单规则：4 个字符约等于 1 个 token
  return Math.ceil(text.length / 4);
}

/**
 * 计算消息数组的总 token 数
 */
function countMessagesTokens(messages) {
  let total = 0;

  for (const msg of messages) {
    // 每条消息的固定开销（role、格式等）
    total += 4;

    // role
    if (msg.role) {
      total += estimateTokens(msg.role);
    }

    // content
    if (msg.content) {
      total += estimateTokens(msg.content);
    }

    // name（如果有）
    if (msg.name) {
      total += estimateTokens(msg.name);
    }
  }

  // 消息数组的固定开销
  total += 2;

  return total;
}

/**
 * 检查是否超出预算
 */
function checkBudget(messages, maxTokens = 4000, reserveForResponse = 1000) {
  const usedTokens = countMessagesTokens(messages);
  const availableTokens = maxTokens - reserveForResponse;

  return {
    used: usedTokens,
    available: availableTokens,
    reserve: reserveForResponse,
    total: maxTokens,
    isOverBudget: usedTokens > availableTokens,
    remaining: availableTokens - usedTokens,
    percentage: Math.round((usedTokens / availableTokens) * 100)
  };
}

/**
 * 格式化预算信息
 */
function formatBudgetInfo(budgetInfo) {
  const bar = '█'.repeat(Math.floor(budgetInfo.percentage / 5));
  const empty = '░'.repeat(20 - bar.length);

  return `
Token 预算状态:
├─ 已使用: ${budgetInfo.used} tokens
├─ 可用空间: ${budgetInfo.available} tokens
├─ 预留响应: ${budgetInfo.reserve} tokens
├─ 总容量: ${budgetInfo.total} tokens
├─ 剩余: ${budgetInfo.remaining} tokens
└─ 使用率: [${bar}${empty}] ${budgetInfo.percentage}%

状态: ${budgetInfo.isOverBudget ? '⚠️ 超出预算！' : '✅ 正常'}
  `.trim();
}

// 测试示例
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== Token 计数测试 ===\n');

  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant.'
    },
    {
      role: 'user',
      content: 'Hello! Can you help me understand context windows?'
    },
    {
      role: 'assistant',
      content: 'Of course! A context window is the maximum amount of text (measured in tokens) that a language model can process in a single request. For example, GPT-3.5-turbo has a 4K context window, meaning it can handle about 4096 tokens of combined input and output.'
    },
    {
      role: 'user',
      content: 'What happens if I exceed it?'
    }
  ];

  console.log('测试消息：');
  messages.forEach((msg, i) => {
    const tokens = estimateTokens(msg.content);
    console.log(`  [${i + 1}] ${msg.role}: ${tokens} tokens`);
  });

  console.log('\n' + '='.repeat(50) + '\n');

  const budget = checkBudget(messages, 4096, 1000);
  console.log(formatBudgetInfo(budget));

  console.log('\n' + '='.repeat(50) + '\n');

  // 测试超出预算的情况
  const longMessage = {
    role: 'user',
    content: 'A'.repeat(15000) // 约 3750 tokens
  };

  const messagesOverBudget = [...messages, longMessage];
  const budgetOver = checkBudget(messagesOverBudget, 4096, 1000);

  console.log('添加超长消息后：');
  console.log(formatBudgetInfo(budgetOver));
}

export {
  estimateTokens,
  countMessagesTokens,
  checkBudget,
  formatBudgetInfo
};
```

运行测试：

```bash
cd experiments/memory
node token-counter.js
```

**输出示例：**

```
=== Token 计数测试 ===

测试消息：
  [1] system: 8 tokens
  [2] user: 13 tokens
  [3] assistant: 66 tokens
  [4] user: 7 tokens

==================================================

Token 预算状态:
├─ 已使用: 118 tokens
├─ 可用空间: 3096 tokens
├─ 预留响应: 1000 tokens
├─ 总容量: 4096 tokens
├─ 剩余: 2978 tokens
└─ 使用率: [█░░░░░░░░░░░░░░░░░░░] 3%

状态: ✅ 正常

==================================================

添加超长消息后：
Token 预算状态:
├─ 已使用: 3880 tokens
├─ 可用空间: 3096 tokens
├─ 预留响应: 1000 tokens
├─ 总容量: 4096 tokens
├─ 剩余: -784 tokens
└─ 使用率: [████████████████████] 125%

状态: ⚠️ 超出预算！
```

---

### 2.3 不同记忆策略对比

```
┌─────────────────────────────────────────────────────────────┐
│                 常见记忆管理策略                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 无限制策略（Naive）                                      │
│   ┌─────────────────────────────────────────────────┐       │
│   │  保留所有历史消息，直到超出上下文窗口               │       │
│   │                                                  │       │
│   │  ✅ 优点：实现简单，完整上下文                    │       │
│   │  ❌ 缺点：必然会超限，不可持续                    │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   2. 固定轮次策略（Fixed Window）                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  只保留最近 N 轮对话（例如最近 10 轮）            │       │
│   │                                                  │       │
│   │  ✅ 优点：实现简单，token 数可控                  │       │
│   │  ❌ 缺点：可能丢失重要信息，轮次固定不灵活         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   3. Token 滑窗策略（Token-based Sliding Window）             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  根据 token 数动态保留消息，超出预算时丢弃旧消息  │       │
│   │                                                  │       │
│   │  ✅ 优点：精确控制 token 使用，灵活                │       │
│   │  ❌ 缺点：可能丢失早期重要上下文                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   4. 总结压缩策略（Summarization）                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  定期总结历史对话，保留摘要 + 最近消息            │       │
│   │                                                  │       │
│   │  ✅ 优点：保留关键信息，支持长对话                │       │
│   │  ❌ 缺点：总结需要额外 API 调用，有信息损失        │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   5. 向量数据库检索策略（RAG）                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  将历史存入向量数据库，按相关性检索注入上下文      │       │
│   │                                                  │       │
│   │  ✅ 优点：可扩展到无限对话，智能检索               │       │
│   │  ❌ 缺点：实现复杂，需要外部服务                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、实践：简单的预算监控系统

创建 `experiments/memory/budget-monitor.js`：

```javascript
/**
 * Token 预算监控器
 * 实时监控对话的 token 使用情况
 */

import { countMessagesTokens, formatBudgetInfo, checkBudget } from './token-counter.js';

class BudgetMonitor {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 4096;
    this.reserveTokens = options.reserveTokens || 1000;
    this.warningThreshold = options.warningThreshold || 0.8; // 80%
    this.listeners = [];
  }

  /**
   * 检查消息数组的预算状态
   */
  check(messages) {
    const budget = checkBudget(messages, this.maxTokens, this.reserveTokens);

    // 触发警告
    if (budget.percentage >= this.warningThreshold * 100) {
      this.emit('warning', budget);
    }

    // 触发超限
    if (budget.isOverBudget) {
      this.emit('exceeded', budget);
    }

    return budget;
  }

  /**
   * 监听事件
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    this.listeners
      .filter(l => l.event === event)
      .forEach(l => l.callback(data));
  }

  /**
   * 生成预算报告
   */
  report(messages) {
    const budget = this.check(messages);

    console.log('\n' + '='.repeat(60));
    console.log('Token 预算监控报告');
    console.log('='.repeat(60) + '\n');
    console.log(formatBudgetInfo(budget));
    console.log('\n' + '='.repeat(60) + '\n');

    return budget;
  }
}

// 测试示例
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== 预算监控器测试 ===\n');

  const monitor = new BudgetMonitor({
    maxTokens: 4096,
    reserveTokens: 1000,
    warningThreshold: 0.7
  });

  // 监听警告
  monitor.on('warning', (budget) => {
    console.log(`⚠️ 警告：Token 使用率已达 ${budget.percentage}%`);
  });

  // 监听超限
  monitor.on('exceeded', (budget) => {
    console.log(`❌ 错误：Token 已超出预算 ${-budget.remaining} tokens`);
  });

  // 模拟对话
  const messages = [
    { role: 'system', content: 'You are a helpful assistant.' }
  ];

  console.log('开始模拟对话...\n');

  for (let i = 1; i <= 20; i++) {
    messages.push({
      role: 'user',
      content: `This is message ${i}. `.repeat(50) // 每条约 250 tokens
    });

    messages.push({
      role: 'assistant',
      content: `Response to message ${i}. `.repeat(50)
    });

    const budget = monitor.check(messages);
    console.log(`轮次 ${i}: ${budget.used} tokens (${budget.percentage}%)`);

    if (budget.isOverBudget) {
      console.log('\n预算超限，停止测试。\n');
      monitor.report(messages);
      break;
    }
  }
}

export default BudgetMonitor;
```

运行测试：

```bash
node budget-monitor.js
```

---

## 四、学习检查清单

- [ ] 理解 LLM 的无状态特性
- [ ] 掌握 Context Window 概念
- [ ] 能计算和估算 token 数量
- [ ] 理解不同记忆策略的权衡
- [ ] 能实现简单的 token 预算监控

---

## 五、思考题

### 问题 1：Token 计费

假设 API 定价为：
- 输入：$0.001 / 1K tokens
- 输出：$0.002 / 1K tokens

一个 20 轮的对话，平均每轮用户输入 50 tokens，助手回复 200 tokens，总费用是多少？

<details>
<summary>点击查看答案</summary>

```
输入 tokens: 20 * 50 = 1000 tokens
输出 tokens: 20 * 200 = 4000 tokens

但注意：每轮对话都需要包含历史，所以实际 tokens 会累积

第1轮: 输入 50, 输出 200
第2轮: 输入 50+250, 输出 200
第3轮: 输入 50+250+250, 输出 200
...

总输入 = 50 + 300 + 550 + 800 + ... (等差数列)
总输入 ≈ 50,500 tokens
总输出 = 4,000 tokens

费用 = (50.5 * 0.001) + (4 * 0.002) = $0.0505 + $0.008 = $0.0585
```

这就是为什么长对话会变贵！
</details>

### 问题 2：系统提示的位置

系统提示（system message）应该放在消息数组的哪里？为什么？

<details>
<summary>点击查看答案</summary>

应该放在最开始（数组第一个元素）。

原因：
1. 系统提示定义模型的行为和角色
2. 放在开头确保它不会因为 token 限制被截断
3. 模型会首先"看到"系统提示，然后处理对话历史
4. 符合 OpenAI API 的最佳实践

```javascript
const messages = [
  { role: 'system', content: '你是一个...' },  // 必须在最前
  { role: 'user', content: '...' },
  { role: 'assistant', content: '...' },
  // ...
];
```
</details>

---

## 六、下一步

在下一节（Step 16）中，我们将实现一个**短期对话记忆模块**，包括：

1. 消息历史存储
2. 自动 token 计数
3. 超限时的截断策略
4. 完整的测试用例

---

**理解 token 预算是构建可靠 LLM 应用的第一步。记住：每个 token 都有成本，每个上下文窗口都有限制！**
