# Step 16: 对话记忆｜写一个"短期对话记忆"模块

## 学习目标

这个任务的本质是回答一个核心问题：**如何实现一个实用的短期记忆管理系统，让 LLM 在有限的上下文窗口内高效工作？**

通过本教程，你将：

1. 实现一个完整的短期记忆管理类
2. 掌握基于 token 预算的消息截断策略
3. 学会保护重要消息（system prompt）不被删除
4. 理解 FIFO（先进先出）策略在记忆管理中的应用

---

## 一、核心认知：短期记忆的设计原则

### 1.1 什么是短期记忆？

```
┌─────────────────────────────────────────────────────────────┐
│              短期记忆 vs 长期记忆 vs 无记忆                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   无记忆（Stateless）：                                       │
│   ┌─────────────────────────────────────────────────┐       │
│   │  每次对话都是全新的，没有任何历史上下文           │       │
│   │  优点：简单，无状态                             │       │
│   │  缺点：无法进行多轮对话                         │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   短期记忆（Short-term Memory）：                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  保留最近 N 轮或最近 M tokens 的对话历史         │       │
│   │  优点：支持多轮对话，token 可控                 │       │
│   │  缺点：会遗忘较早的信息                         │       │
│   └─────────────────────────────────────────────────┘       │
│                    ↑                                        │
│              本节课重点！                                    │
│                                                             │
│   长期记忆（Long-term Memory）：                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  通过总结、向量数据库等方式存储所有历史           │       │
│   │  优点：可以"记住"任意长的对话                  │       │
│   │  缺点：实现复杂，需要额外存储                   │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**短期记忆的应用场景：**
- 客服机器人：保留最近几轮对话上下文
- 编程助手：记住当前任务的代码片段
- 聊天应用：一般对话不需要完整历史

---

### 1.2 短期记忆的截断策略

```
┌─────────────────────────────────────────────────────────────┐
│                  截断策略可视化                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   假设 token 预算 = 3000 tokens（不含响应空间）               │
│                                                             │
│   原始消息列表（超出预算）：                                  │
│   ┌─────────────────────────────────────────────────┐       │
│   │  [0] System:     "你是一个助手" (50 tokens)     │ 🔒保留 │
│   │  [1] User:       "你好" (10 tokens)             │       │
│   │  [2] Assistant:  "你好！..." (50 tokens)        │       │
│   │  [3] User:       "我叫小明" (20 tokens)         │       │
│   │  [4] Assistant:  "很高兴..." (80 tokens)        │       │
│   │  [5] User:       "我今年25岁" (30 tokens)       │       │
│   │  [6] Assistant:  "知道了..." (100 tokens)       │       │
│   │  [7] User:       "我喜欢编程" (30 tokens)       │       │
│   │  [8] Assistant:  "很棒！..." (200 tokens)       │       │
│   │  [9] User:       "介绍React" (20 tokens)        │       │
│   │  [10] Assistant: "React是..." (1500 tokens)     │       │
│   │  [11] User:      "Vue呢？" (15 tokens)          │       │
│   │  [12] Assistant: "Vue是..." (1200 tokens)       │       │
│   │  [13] User:      "两者对比" (20 tokens)         │ 🎯当前 │
│   └─────────────────────────────────────────────────┘       │
│   总计: ~3325 tokens ❌ 超出预算！                            │
│                                                             │
│   FIFO 截断后：                                              │
│   ┌─────────────────────────────────────────────────┐       │
│   │  [0] System:     "你是一个助手" (50 tokens)     │ 🔒保留 │
│   │  [1-7] ❌ 删除                                   │       │
│   │  [8] Assistant:  "很棒！..." (200 tokens)       │ ✅保留 │
│   │  [9] User:       "介绍React" (20 tokens)        │ ✅保留 │
│   │  [10] Assistant: "React是..." (1500 tokens)     │ ✅保留 │
│   │  [11] User:      "Vue呢？" (15 tokens)          │ ✅保留 │
│   │  [12] Assistant: "Vue是..." (1200 tokens)       │ ✅保留 │
│   │  [13] User:      "两者对比" (20 tokens)         │ ✅保留 │
│   └─────────────────────────────────────────────────┘       │
│   总计: ~3005 tokens → 截断后 ~2955 tokens ✅ 符合预算         │
│                                                             │
│   截断规则：                                                 │
│   1. System 消息永远保留（protected）                        │
│   2. 从最旧的消息开始删除（FIFO）                            │
│   3. 保留最近的消息，直到符合预算                            │
│   4. 总是成对删除 user-assistant 消息（可选）                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现短期记忆管理器

### 2.1 核心类设计

创建 `experiments/memory/short-term-memory.js`：

```javascript
/**
 * 短期对话记忆管理器
 * 基于 token 预算管理对话历史
 */

import { countMessagesTokens } from './token-counter.js';

class ShortTermMemory {
  constructor(options = {}) {
    // 配置
    this.maxTokens = options.maxTokens || 4096;
    this.reserveTokens = options.reserveTokens || 1000;
    this.protectSystemMessage = options.protectSystemMessage !== false; // 默认保护
    this.minMessages = options.minMessages || 1; // 至少保留多少条消息（不含system）

    // 状态
    this.messages = [];
    this.stats = {
      totalAdded: 0,
      totalTruncated: 0,
      currentTokens: 0
    };
  }

  /**
   * 获取可用 token 预算
   */
  get availableTokens() {
    return this.maxTokens - this.reserveTokens;
  }

  /**
   * 添加消息
   */
  addMessage(role, content) {
    const message = { role, content };
    this.messages.push(message);
    this.stats.totalAdded++;

    // 更新 token 计数
    this._updateTokenCount();

    // 检查并截断
    this._truncateIfNeeded();

    return this;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content) {
    return this.addMessage('user', content);
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content) {
    return this.addMessage('assistant', content);
  }

  /**
   * 设置系统提示
   */
  setSystemMessage(content) {
    // 移除旧的 system 消息
    this.messages = this.messages.filter(m => m.role !== 'system');

    // 添加新的 system 消息到开头
    this.messages.unshift({ role: 'system', content });
    this._updateTokenCount();
    this._truncateIfNeeded();

    return this;
  }

  /**
   * 获取所有消息
   */
  getMessages() {
    return [...this.messages]; // 返回副本
  }

  /**
   * 获取最近 N 条消息
   */
  getRecentMessages(count) {
    const systemMessage = this.messages.find(m => m.role === 'system');
    const otherMessages = this.messages.filter(m => m.role !== 'system');

    const recent = otherMessages.slice(-count);

    return systemMessage ? [systemMessage, ...recent] : recent;
  }

  /**
   * 清空记忆（可选保留 system message）
   */
  clear(keepSystem = true) {
    if (keepSystem) {
      this.messages = this.messages.filter(m => m.role === 'system');
    } else {
      this.messages = [];
    }

    this._updateTokenCount();
    return this;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      messageCount: this.messages.length,
      availableTokens: this.availableTokens,
      usagePercentage: Math.round((this.stats.currentTokens / this.availableTokens) * 100)
    };
  }

  /**
   * 更新 token 计数
   */
  _updateTokenCount() {
    this.stats.currentTokens = countMessagesTokens(this.messages);
  }

  /**
   * 截断消息以符合预算
   */
  _truncateIfNeeded() {
    // 如果没有超出预算，直接返回
    if (this.stats.currentTokens <= this.availableTokens) {
      return;
    }

    // 分离 system 消息和其他消息
    const systemMessages = this.protectSystemMessage
      ? this.messages.filter(m => m.role === 'system')
      : [];

    let otherMessages = this.messages.filter(m => m.role !== 'system');

    // 确保至少保留 minMessages 条消息
    const minKeep = Math.max(this.minMessages, 2); // 至少保留最后一轮对话

    // 从最旧的消息开始删除
    while (otherMessages.length > minKeep) {
      // 尝试删除最旧的消息
      otherMessages.shift();

      // 重新计算 token
      const testMessages = [...systemMessages, ...otherMessages];
      const testTokens = countMessagesTokens(testMessages);

      // 如果符合预算，停止删除
      if (testTokens <= this.availableTokens) {
        this.messages = testMessages;
        this.stats.totalTruncated++;
        this._updateTokenCount();
        return;
      }
    }

    // 如果删除到最小数量还是超出，保留最小数量
    this.messages = [...systemMessages, ...otherMessages];
    this.stats.totalTruncated++;
    this._updateTokenCount();
  }

  /**
   * 打印当前状态
   */
  printStatus() {
    console.log('\n' + '='.repeat(60));
    console.log('短期记忆状态');
    console.log('='.repeat(60));

    const stats = this.getStats();
    const bar = '█'.repeat(Math.floor(stats.usagePercentage / 5));
    const empty = '░'.repeat(20 - bar.length);

    console.log(`\n消息数量: ${stats.messageCount}`);
    console.log(`Token 使用: ${stats.currentTokens} / ${this.availableTokens}`);
    console.log(`使用率: [${bar}${empty}] ${stats.usagePercentage}%`);
    console.log(`\n统计:`);
    console.log(`  - 总添加: ${stats.totalAdded} 条`);
    console.log(`  - 总截断: ${stats.totalTruncated} 次`);

    console.log(`\n消息列表:`);
    this.messages.forEach((msg, i) => {
      const preview = msg.content.slice(0, 50) + (msg.content.length > 50 ? '...' : '');
      console.log(`  [${i}] ${msg.role.padEnd(10)}: ${preview}`);
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// 测试示例
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('=== 短期记忆管理器测试 ===\n');

  const memory = new ShortTermMemory({
    maxTokens: 4096,
    reserveTokens: 1000,
    protectSystemMessage: true,
    minMessages: 2
  });

  // 设置系统提示
  memory.setSystemMessage('你是一个友好的 AI 助手，擅长回答技术问题。');

  console.log('初始状态:');
  memory.printStatus();

  // 模拟多轮对话
  console.log('开始添加对话...\n');

  const conversations = [
    ['你好', '你好！很高兴为你服务。'],
    ['我叫小明', '很高兴认识你，小明！'],
    ['我想学习 JavaScript', '太好了！JavaScript 是一门非常有用的编程语言。' + ' 它可以用于前端开发、后端开发（Node.js）等多个领域。'.repeat(20)],
    ['什么是闭包？', '闭包是 JavaScript 中的一个重要概念。' + ' 简单来说，闭包就是函数能够访问其外部作用域的变量。'.repeat(30)],
    ['能举个例子吗？', 'function outer() { let count = 0; return function inner() { count++; return count; } }'.repeat(40)],
    ['我明白了', '太好了！还有什么问题吗？'],
    ['讲讲 Promise', 'Promise 是用于处理异步操作的对象。' + ' 它有三个状态：pending、fulfilled、rejected。'.repeat(50)],
    ['async/await 呢？', 'async/await 是基于 Promise 的语法糖。' + ' 它让异步代码看起来像同步代码，更容易理解。'.repeat(50)]
  ];

  conversations.forEach(([userMsg, assistantMsg], i) => {
    console.log(`--- 第 ${i + 1} 轮对话 ---`);
    memory.addUserMessage(userMsg);
    memory.addAssistantMessage(assistantMsg);

    const stats = memory.getStats();
    console.log(`Token 使用: ${stats.currentTokens} (${stats.usagePercentage}%)\n`);
  });

  console.log('最终状态:');
  memory.printStatus();

  // 测试获取最近消息
  console.log('获取最近 4 条消息:');
  const recent = memory.getRecentMessages(4);
  recent.forEach((msg, i) => {
    console.log(`  [${i}] ${msg.role}: ${msg.content.slice(0, 50)}...`);
  });

  console.log('\n测试完成！');
}

export default ShortTermMemory;
```

运行测试：

```bash
cd experiments/memory
node short-term-memory.js
```

---

### 2.2 预期输出

```
=== 短期记忆管理器测试 ===

初始状态:
============================================================
短期记忆状态
============================================================

消息数量: 1
Token 使用: 28 / 3096
使用率: [░░░░░░░░░░░░░░░░░░░░] 0%

统计:
  - 总添加: 0 条
  - 总截断: 0 次

消息列表:
  [0] system    : 你是一个友好的 AI 助手，擅长回答技术问题。

============================================================

开始添加对话...

--- 第 1 轮对话 ---
Token 使用: 56 (1%)

--- 第 2 轮对话 ---
Token 使用: 92 (2%)

--- 第 3 轮对话 ---
Token 使用: 645 (20%)

--- 第 4 轮对话 ---
Token 使用: 1428 (46%)

--- 第 5 轮对话 ---
Token 使用: 2350 (75%)

--- 第 6 轮对话 ---
Token 使用: 2390 (77%)

--- 第 7 轮对话 ---
Token 使用: 2876 (92%)

--- 第 8 轮对话 ---
Token 使用: 2950 (95%)  ← 触发截断

最终状态:
============================================================
短期记忆状态
============================================================

消息数量: 11  ← 早期消息被删除
Token 使用: 2950 / 3096
使用率: [███████████████████░] 95%

统计:
  - 总添加: 16 条
  - 总截断: 1 次

消息列表:
  [0] system    : 你是一个友好的 AI 助手，擅长回答技术问题。
  [1] user      : 我想学习 JavaScript
  [2] assistant : 太好了！JavaScript 是一门非常有用的编程语言...
  [3] user      : 什么是闭包？
  [4] assistant : 闭包是 JavaScript 中的一个重要概念...
  ...

============================================================
```

---

## 三、与 LLM API 集成

### 3.1 完整的对话示例

创建 `experiments/memory/chat-with-memory.js`：

```javascript
/**
 * 使用短期记忆的聊天示例
 */

import OpenAI from 'openai';
import ShortTermMemory from './short-term-memory.js';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
});

class ChatWithMemory {
  constructor(options = {}) {
    this.memory = new ShortTermMemory({
      maxTokens: options.maxTokens || 8000,
      reserveTokens: options.reserveTokens || 2000,
      protectSystemMessage: true
    });

    this.model = options.model || 'deepseek-chat';

    // 设置系统提示
    if (options.systemPrompt) {
      this.memory.setSystemMessage(options.systemPrompt);
    }
  }

  /**
   * 发送消息并获取回复
   */
  async chat(userMessage) {
    // 添加用户消息到记忆
    this.memory.addUserMessage(userMessage);

    try {
      // 获取消息历史
      const messages = this.memory.getMessages();

      // 调用 API
      const response = await client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.7
      });

      const assistantMessage = response.choices[0].message.content;

      // 添加助手回复到记忆
      this.memory.addAssistantMessage(assistantMessage);

      return {
        content: assistantMessage,
        stats: this.memory.getStats()
      };
    } catch (error) {
      console.error('API 调用失败:', error.message);
      throw error;
    }
  }

  /**
   * 流式对话
   */
  async *chatStream(userMessage) {
    this.memory.addUserMessage(userMessage);

    const messages = this.memory.getMessages();
    let assistantMessage = '';

    try {
      const stream = await client.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        assistantMessage += content;
        yield content;
      }

      // 保存完整的助手回复
      this.memory.addAssistantMessage(assistantMessage);

      yield { done: true, stats: this.memory.getStats() };
    } catch (error) {
      console.error('流式调用失败:', error.message);
      throw error;
    }
  }

  /**
   * 清空对话
   */
  reset() {
    this.memory.clear(true); // 保留 system message
  }

  /**
   * 打印状态
   */
  printStatus() {
    this.memory.printStatus();
  }
}

// 测试示例
if (import.meta.url === `file://${process.argv[1]}`) {
  const chat = new ChatWithMemory({
    systemPrompt: '你是一个简洁友好的助手，回答要精炼。',
    maxTokens: 8000,
    reserveTokens: 2000
  });

  console.log('=== 带记忆的聊天测试 ===\n');

  async function runTest() {
    try {
      // 第一轮
      console.log('User: 你好，我叫小明');
      const reply1 = await chat.chat('你好，我叫小明');
      console.log(`Assistant: ${reply1.content}`);
      console.log(`[Token 使用: ${reply1.stats.currentTokens}]\n`);

      // 第二轮
      console.log('User: 我叫什么名字？');
      const reply2 = await chat.chat('我叫什么名字？');
      console.log(`Assistant: ${reply2.content}`);
      console.log(`[Token 使用: ${reply2.stats.currentTokens}]\n`);

      // 第三轮
      console.log('User: 给我讲个笑话');
      const reply3 = await chat.chat('给我讲个笑话');
      console.log(`Assistant: ${reply3.content}`);
      console.log(`[Token 使用: ${reply3.stats.currentTokens}]\n`);

      // 打印最终状态
      chat.printStatus();
    } catch (error) {
      console.error('测试失败:', error);
    }
  }

  runTest();
}

export default ChatWithMemory;
```

---

## 四、学习检查清单

- [ ] 理解短期记忆的设计原则
- [ ] 掌握 FIFO 截断策略
- [ ] 能实现基于 token 的消息管理
- [ ] 理解如何保护重要消息（system prompt）
- [ ] 能将记忆管理集成到聊天应用中

---

## 五、思考题

### 问题 1：成对删除

为什么有些实现会成对删除 user-assistant 消息？有什么好处和坏处？

<details>
<summary>点击查看答案</summary>

**好处：**
- 保持对话的完整性和连贯性
- 避免出现"问题没有答案"或"答案没有问题"的情况
- 更符合对话的自然逻辑

**坏处：**
- 删除粒度变大，可能删除过多内容
- 如果一轮对话的 tokens 很多，可能一次删除太多
- 实现稍微复杂一些

**建议：**
- 对于一般聊天场景，成对删除更合理
- 对于需要精确 token 控制的场景，可以单条删除
</details>

### 问题 2：最小消息数

为什么要设置 `minMessages` 参数？

<details>
<summary>点击查看答案</summary>

原因：
1. **避免完全丢失上下文**：至少保留最近一轮对话，让模型有基本的上下文
2. **防止过度截断**：如果单条消息就很长，不应该把它删除（除非真的没办法）
3. **用户体验**：确保用户的最新问题和最新回复始终可见

典型值：
- minMessages = 2：至少保留 1 条 user + 1 条 assistant
- minMessages = 4：至少保留 2 轮对话
</details>

---

## 六、下一步

在下一节（Step 17）中，我们将实现**自动总结功能**，包括：

1. 定期总结历史对话
2. 用摘要替换旧消息
3. 实现 summary mode 策略
4. 对比滑窗 vs 总结的效果

---

**短期记忆是最实用的记忆管理策略，适用于 90% 的聊天场景。记住：简单有效永远比复杂但难维护要好！**
