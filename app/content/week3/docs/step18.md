# Step 18: 对话记忆｜尝试 Conversation Window 滑窗策略

## 学习目标

掌握基于滑动窗口的对话记忆管理策略，理解其优势和局限性。

---

## 一、滑窗策略详解

### 1.1 核心原理

滑动窗口策略始终保持固定大小的上下文窗口，当新消息到来时，丢弃最旧的消息。

```
初始状态(窗口大小=4)：
[System, Msg1, Msg2, Msg3]

添加 Msg4：
[System, Msg2, Msg3, Msg4]  ← Msg1 被丢弃

添加 Msg5：
[System, Msg3, Msg4, Msg5]  ← Msg2 被丢弃
```

---

## 二、实现滑窗策略

创建 `experiments/memory/sliding-window-memory.js`：

```javascript
import { countMessagesTokens } from './token-counter.js';

class SlidingWindowMemory {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 10; // 最多保留10条消息
    this.maxTokens = options.maxTokens || 4000;
    this.messages = [];
  }

  addMessage(role, content) {
    this.messages.push({ role, content });
    this._slideWindow();
    return this;
  }

  _slideWindow() {
    const systemMsg = this.messages.find(m => m.role === 'system');
    let others = this.messages.filter(m => m.role !== 'system');

    // 策略1：基于消息数量
    while (others.length > this.maxMessages) {
      others.shift();
    }

    // 策略2：基于 token 数量
    while (countMessagesTokens([...others]) > this.maxTokens) {
      if (others.length <= 2) break; // 至少保留2条
      others.shift();
    }

    this.messages = systemMsg ? [systemMsg, ...others] : others;
  }

  getMessages() {
    return [...this.messages];
  }

  printStatus() {
    const tokens = countMessagesTokens(this.messages);
    console.log(`消息数: ${this.messages.length}, Token数: ${tokens}`);
    this.messages.forEach((m, i) => {
      console.log(`  [${i}] ${m.role}: ${m.content.slice(0, 50)}...`);
    });
  }
}

export default SlidingWindowMemory;
```

---

## 三、滑窗策略对比

| 特性 | 固定消息数窗口 | Token窗口 | 混合窗口 |
|-----|-------------|----------|---------|
| **实现难度** | 简单 | 中等 | 中等 |
| **精确度** | 低 | 高 | 高 |
| **适用场景** | 消息长度均匀 | 消息长度不一 | 通用 |
| **性能** | 最快 | 较慢 | 中等 |

---

## 四、实践作业

1. 实现按对话轮次(user+assistant成对)的滑窗
2. 添加窗口大小动态调整功能
3. 对比不同窗口大小的效果

---

**滑窗策略简单高效，适合90%的聊天场景！**
