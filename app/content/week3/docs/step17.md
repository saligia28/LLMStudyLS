# Step 17: 对话记忆｜实现"自动总结"功能（summary 模式）

## 学习目标

这个任务的本质是回答一个核心问题：**如何在不丢失关键信息的前提下，支持任意长度的对话？**

通过本教程，你将：

1. 理解对话总结（Conversation Summarization）的原理
2. 实现自动总结历史对话的功能
3. 掌握总结触发时机的策略
4. 对比滑窗策略 vs 总结策略的优劣

---

## 一、核心认知：总结策略

### 1.1 为什么需要总结？

```
┌─────────────────────────────────────────────────────────────┐
│              滑窗策略 vs 总结策略                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   滑窗策略（Sliding Window）：                               │
│   ┌─────────────────────────────────────────────────┐       │
│   │  直接删除旧消息，只保留最近的消息                │       │
│   │                                                  │       │
│   │  System: "你是助手"                             │       │
│   │  ❌ User: "我叫小明"        ← 被删除              │       │
│   │  ❌ AI: "你好小明"          ← 被删除              │       │
│   │  ❌ User: "我25岁"          ← 被删除              │       │
│   │  ❌ AI: "知道了"            ← 被删除              │       │
│   │  ✅ User: "我喜欢编程"      ← 保留                │       │
│   │  ✅ AI: "很棒！"            ← 保留                │       │
│   │  ✅ User: "介绍React"       ← 保留                │       │
│   │                                                  │       │
│   │  问题：AI 忘记了"小明"和"25岁"这些信息          │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   总结策略（Summarization）：                                │
│   ┌─────────────────────────────────────────────────┐       │
│   │  将旧消息总结成摘要，保留关键信息                │       │
│   │                                                  │       │
│   │  System: "你是助手"                             │       │
│   │  Summary: "用户叫小明，25岁，喜欢编程"  ← 总结   │       │
│   │  User: "介绍React"                              │       │
│   │  AI: "React是..."                               │       │
│   │  User: "Vue呢？"                                │       │
│   │                                                  │       │
│   │  优势：保留了关键信息，支持更长对话             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**总结策略的优势：**
- ✅ 保留重要的上下文信息
- ✅ 支持任意长度的对话
- ✅ Token 使用更高效

**总结策略的劣势：**
- ❌ 需要额外的 API 调用（成本）
- ❌ 总结可能损失细节
- ❌ 实现更复杂

---

### 1.2 总结触发时机

```
┌─────────────────────────────────────────────────────────────┐
│                  总结触发策略                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   策略 1：基于消息数量                                        │
│   ┌─────────────────────────────────────────────────┐       │
│   │  每 10 轮对话触发一次总结                        │       │
│   │  简单直观，但不考虑消息长度                     │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   策略 2：基于 Token 数量 ⭐ 推荐                             │
│   ┌─────────────────────────────────────────────────┐       │
│   │  当 token 使用达到 70% 时触发总结                │       │
│   │  更精确，能更好地控制预算                       │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   策略 3：基于时间                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  每隔 5 分钟总结一次历史                         │       │
│   │  适合长时间连续对话                             │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
│   策略 4：混合策略                                            │
│   ┌─────────────────────────────────────────────────┐       │
│   │  满足以下任一条件就触发：                        │       │
│   │  - Token 使用 > 70%                              │       │
│   │  - 消息数 > 15 条                                │       │
│   │  - 距离上次总结 > 10 分钟                        │       │
│   └─────────────────────────────────────────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、实现自动总结功能

### 2.1 总结记忆管理器

创建 `experiments/memory/summary-memory.js`：

```javascript
/**
 * 带总结功能的记忆管理器
 */

import OpenAI from 'openai';
import { countMessagesTokens } from './token-counter.js';

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL || 'https://api.deepseek.com'
});

class SummaryMemory {
  constructor(options = {}) {
    this.maxTokens = options.maxTokens || 8000;
    this.reserveTokens = options.reserveTokens || 2000;
    this.summaryThreshold = options.summaryThreshold || 0.7; // 70% 触发总结
    this.minMessagesToSummarize = options.minMessagesToSummarize || 6; // 至少6条消息才总结
    this.keepRecentCount = options.keepRecentCount || 4; // 保留最近4条消息

    this.messages = [];
    this.summary = null; // 当前总结
    this.stats = {
      totalSummarized: 0,
      lastSummaryTime: null
    };
  }

  get availableTokens() {
    return this.maxTokens - this.reserveTokens;
  }

  /**
   * 添加消息
   */
  addMessage(role, content) {
    this.messages.push({ role, content });
    return this;
  }

  addUserMessage(content) {
    return this.addMessage('user', content);
  }

  addAssistantMessage(content) {
    return this.addMessage('assistant', content);
  }

  setSystemMessage(content) {
    this.messages = this.messages.filter(m => m.role !== 'system');
    this.messages.unshift({ role: 'system', content });
    return this;
  }

  /**
   * 获取所有消息（包含总结）
   */
  getMessages() {
    const systemMsg = this.messages.find(m => m.role === 'system');
    const otherMessages = this.messages.filter(m => m.role !== 'system');

    const result = [];

    // 添加 system 消息
    if (systemMsg) {
      result.push(systemMsg);
    }

    // 添加总结（如果有）
    if (this.summary) {
      result.push({
        role: 'system',
        content: `对话历史总结：${this.summary}`
      });
    }

    // 添加其他消息
    result.push(...otherMessages);

    return result;
  }

  /**
   * 检查是否需要总结
   */
  shouldSummarize() {
    const currentTokens = countMessagesTokens(this.getMessages());
    const usagePercentage = currentTokens / this.availableTokens;

    // 条件1: token 使用率超过阈值
    const tokenThresholdMet = usagePercentage >= this.summaryThreshold;

    // 条件2: 有足够的消息可以总结
    const otherMessages = this.messages.filter(m => m.role !== 'system');
    const hasEnoughMessages = otherMessages.length >= this.minMessagesToSummarize;

    return tokenThresholdMet && hasEnoughMessages;
  }

  /**
   * 执行总结
   */
  async summarize() {
    const systemMsg = this.messages.find(m => m.role === 'system');
    const otherMessages = this.messages.filter(m => m.role !== 'system');

    if (otherMessages.length < this.minMessagesToSummarize) {
      console.log('消息数量不足，跳过总结');
      return;
    }

    // 确定需要总结的消息范围
    const toSummarize = otherMessages.slice(0, -this.keepRecentCount);
    const toKeep = otherMessages.slice(-this.keepRecentCount);

    if (toSummarize.length === 0) {
      console.log('没有需要总结的消息');
      return;
    }

    console.log(`\n📝 开始总结 ${toSummarize.length} 条消息...`);

    try {
      // 构建总结提示
      const conversationText = toSummarize
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const summaryPrompt = [
        {
          role: 'system',
          content: '你是一个对话总结助手。请简洁地总结以下对话的关键信息，包括：用户提到的重要事实、主题、决定等。总结要精炼，长度控制在100-200字。'
        },
        {
          role: 'user',
          content: `请总结以下对话：\n\n${conversationText}`
        }
      ];

      const response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: summaryPrompt,
        temperature: 0.3,
        max_tokens: 500
      });

      const newSummary = response.choices[0].message.content.trim();

      // 如果已有总结，合并总结
      if (this.summary) {
        const mergePrompt = [
          {
            role: 'system',
            content: '请将两段对话总结合并成一段连贯的总结。'
          },
          {
            role: 'user',
            content: `旧总结：${this.summary}\n\n新总结：${newSummary}\n\n请合并这两段总结：`
          }
        ];

        const mergeResponse = await client.chat.completions.create({
          model: 'deepseek-chat',
          messages: mergePrompt,
          temperature: 0.3,
          max_tokens: 500
        });

        this.summary = mergeResponse.choices[0].message.content.trim();
      } else {
        this.summary = newSummary;
      }

      // 更新消息列表：只保留 system + 最近的消息
      this.messages = systemMsg ? [systemMsg, ...toKeep] : toKeep;

      // 更新统计
      this.stats.totalSummarized++;
      this.stats.lastSummaryTime = new Date();

      console.log(`✅ 总结完成！当前总结：\n${this.summary}\n`);

      return this.summary;
    } catch (error) {
      console.error('❌ 总结失败:', error.message);
      throw error;
    }
  }

  /**
   * 自动管理：添加消息后检查是否需要总结
   */
  async autoManage() {
    if (this.shouldSummarize()) {
      await this.summarize();
    }
  }

  /**
   * 清空记忆
   */
  clear(keepSystem = true) {
    if (keepSystem) {
      this.messages = this.messages.filter(m => m.role === 'system');
    } else {
      this.messages = [];
    }
    this.summary = null;
    return this;
  }

  /**
   * 打印状态
   */
  printStatus() {
    const allMessages = this.getMessages();
    const tokens = countMessagesTokens(allMessages);
    const percentage = Math.round((tokens / this.availableTokens) * 100);

    console.log('\n' + '='.repeat(60));
    console.log('总结记忆状态');
    console.log('='.repeat(60));
    console.log(`\nToken 使用: ${tokens} / ${this.availableTokens} (${percentage}%)`);
    console.log(`消息数量: ${this.messages.length}`);
    console.log(`总结次数: ${this.stats.totalSummarized}`);

    if (this.summary) {
      console.log(`\n当前总结:\n${this.summary}`);
    }

    console.log('\n消息列表:');
    allMessages.forEach((msg, i) => {
      const preview = msg.content.slice(0, 60) + (msg.content.length > 60 ? '...' : '');
      console.log(`  [${i}] ${msg.role.padEnd(10)}: ${preview}`);
    });
    console.log('\n' + '='.repeat(60) + '\n');
  }
}

// 测试示例
if (import.meta.url === `file://${process.argv[1]}`) {
  const memory = new SummaryMemory({
    maxTokens: 4000,
    reserveTokens: 1000,
    summaryThreshold: 0.5, // 50% 就触发（为了测试）
    minMessagesToSummarize: 4,
    keepRecentCount: 2
  });

  async function test() {
    console.log('=== 总结记忆管理器测试 ===\n');

    memory.setSystemMessage('你是一个友好的助手。');

    const conversations = [
      ['你好，我叫小明', '你好小明！很高兴认识你。'],
      ['我今年25岁', '知道了，你今年25岁。'],
      ['我喜欢编程', '编程是个很好的爱好！'],
      ['我会JavaScript', '太棒了！JavaScript很有用。'],
      ['还会Python', 'Python也是非常流行的语言！'],
      ['能推荐学习资源吗？', '当然！我推荐...' + ' 这是一些很好的资源。'.repeat(50)],
      ['谢谢你', '不客气！有问题随时问。']
    ];

    for (const [userMsg, aiMsg] of conversations) {
      console.log(`\nUser: ${userMsg}`);
      memory.addUserMessage(userMsg);
      await memory.autoManage();

      console.log(`AI: ${aiMsg.slice(0, 50)}...`);
      memory.addAssistantMessage(aiMsg);
      await memory.autoManage();
    }

    memory.printStatus();
  }

  test().catch(console.error);
}

export default SummaryMemory;
```

---

## 三、学习检查清单

- [ ] 理解总结策略的原理和优势
- [ ] 掌握总结触发时机的设计
- [ ] 能实现自动总结功能
- [ ] 理解如何合并多次总结

---

## 四、下一步

在下一节（Step 18）中，我们将实现**Conversation Window 滑窗策略**的高级版本。

---

**总结策略是支持长对话的关键技术。合理使用总结，可以让你的应用支持几乎无限长的对话！**
