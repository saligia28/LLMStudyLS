# Step 20: 对话记忆｜做一次性能测试（大对话）

## 学习目标

通过压力测试，评估不同记忆策略的性能表现。

---

## 一、性能测试指标

### 1.1 关键指标

```
┌─────────────────────────────────────────────────────────────┐
│                    性能测试指标                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Token 使用效率                                           │
│     - 平均 token 使用量                                      │
│     - 峰值 token 使用量                                      │
│     - Token 增长速率                                         │
│                                                             │
│  2. 响应时间                                                 │
│     - 平均响应时间                                           │
│     - P95 响应时间                                           │
│     - 总结操作耗时                                           │
│                                                             │
│  3. 成本                                                     │
│     - API 调用次数                                           │
│     - 总 token 消耗                                          │
│     - 预估费用                                               │
│                                                             │
│  4. 信息保留                                                 │
│     - 能否回答早期问题                                       │
│     - 上下文连贯性                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、性能测试工具

创建 `experiments/memory/performance-test.js`：

```javascript
import ShortTermMemory from './short-term-memory.js';
import SummaryMemory from './summary-memory.js';
import SlidingWindowMemory from './sliding-window-memory.js';

class MemoryPerformanceTester {
  constructor() {
    this.results = {};
  }

  /**
   * 生成测试对话
   */
  generateTestConversations(count = 50) {
    const conversations = [];
    for (let i = 1; i <= count; i++) {
      conversations.push([
        `这是第${i}轮对话的问题。` + '一些额外内容。'.repeat(10),
        `这是第${i}轮对话的回答。` + '这里是详细的回复内容。'.repeat(20)
      ]);
    }
    return conversations;
  }

  /**
   * 测试某个记忆策略
   */
  async testStrategy(strategyName, Memory, conversations) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试策略: ${strategyName}`);
    console.log('='.repeat(60));

    const memory = new Memory({
      maxTokens: 8000,
      reserveTokens: 2000
    });

    memory.setSystemMessage('你是一个测试助手。');

    const stats = {
      strategyName,
      totalMessages: 0,
      totalTokens: 0,
      peakTokens: 0,
      truncations: 0,
      summaries: 0,
      startTime: Date.now()
    };

    for (let i = 0; i < conversations.length; i++) {
      const [userMsg, aiMsg] = conversations[i];

      memory.addUserMessage(userMsg);
      memory.addAssistantMessage(aiMsg);

      // 自动管理（如果支持）
      if (memory.autoManage) {
        await memory.autoManage();
      }

      const currentStats = memory.getStats ? memory.getStats() : {};
      const tokens = currentStats.currentTokens || 0;

      stats.totalMessages += 2;
      stats.totalTokens += tokens;
      stats.peakTokens = Math.max(stats.peakTokens, tokens);

      if (currentStats.totalTruncated) {
        stats.truncations = currentStats.totalTruncated;
      }
      if (currentStats.totalSummarized) {
        stats.summaries = currentStats.totalSummarized;
      }

      if ((i + 1) % 10 === 0) {
        console.log(`  进度: ${i + 1}/${conversations.length} 轮 | Token: ${tokens}`);
      }
    }

    stats.endTime = Date.now();
    stats.duration = stats.endTime - stats.startTime;
    stats.avgTokens = Math.round(stats.totalTokens / conversations.length);

    this.results[strategyName] = stats;

    console.log(`\n✅ 测试完成！`);
    console.log(`  - 总轮次: ${conversations.length}`);
    console.log(`  - 平均Token: ${stats.avgTokens}`);
    console.log(`  - 峰值Token: ${stats.peakTokens}`);
    console.log(`  - 截断次数: ${stats.truncations}`);
    console.log(`  - 总结次数: ${stats.summaries}`);
    console.log(`  - 耗时: ${stats.duration}ms`);

    return stats;
  }

  /**
   * 生成对比报告
   */
  generateReport() {
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('性能测试报告');
    console.log('='.repeat(70));

    console.log('\n策略对比:\n');

    const headers = ['策略', '平均Token', '峰值Token', '截断', '总结', '耗时'];
    console.log(headers.join('\t| '));
    console.log('-'.repeat(70));

    Object.values(this.results).forEach(stats => {
      const row = [
        stats.strategyName.padEnd(15),
        stats.avgTokens.toString().padEnd(8),
        stats.peakTokens.toString().padEnd(8),
        stats.truncations.toString().padEnd(6),
        stats.summaries.toString().padEnd(6),
        `${stats.duration}ms`
      ];
      console.log(row.join('\t| '));
    });

    console.log('\n推荐策略:');
    const best = Object.values(this.results).sort((a, b) => a.avgTokens - b.avgTokens)[0];
    console.log(`  Token效率最高: ${best.strategyName} (平均${best.avgTokens} tokens)`);

    console.log('\n' + '='.repeat(70) + '\n');
  }
}

// 运行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new MemoryPerformanceTester();
  const conversations = tester.generateTestConversations(30);

  async function runTests() {
    // 测试滑窗策略
    await tester.testStrategy('滑动窗口', SlidingWindowMemory, conversations);

    // 测试短期记忆
    await tester.testStrategy('短期记忆', ShortTermMemory, conversations);

    // 测试总结策略（需要API，可能较慢）
    // await tester.testStrategy('总结策略', SummaryMemory, conversations);

    // 生成报告
    tester.generateReport();
  }

  runTests().catch(console.error);
}

export default MemoryPerformanceTester;
```

运行测试：

```bash
cd experiments/memory
node performance-test.js
```

---

## 三、测试结果分析

### 3.1 预期结果

```
策略          | 平均Token | 峰值Token | 截断 | 总结 | 耗时
-----------------------------------------------------------
滑动窗口      | 2500     | 2800     | 8    | 0    | 150ms
短期记忆      | 2600     | 2900     | 5    | 0    | 180ms
总结策略      | 1800     | 2500     | 0    | 3    | 8500ms
```

### 3.2 结论

- **滑动窗口**：速度最快，适合实时场景
- **短期记忆**：平衡性好，推荐大多数场景
- **总结策略**：Token最省，适合长对话，但需要API调用

---

## 四、优化建议

1. **短对话(<10轮)**：使用滑动窗口或短期记忆
2. **中等对话(10-50轮)**：使用短期记忆
3. **长对话(>50轮)**：使用总结策略
4. **成本敏感**：混合策略，前期用滑窗，后期用总结

---

## 五、Week 3 总结

恭喜你完成 Week 3 的学习！你现在已经掌握：

- ✅ Context Window 和 Token 预算的概念
- ✅ 短期对话记忆的实现
- ✅ 自动总结功能
- ✅ 滑窗策略的应用
- ✅ 系统提示的动态注入
- ✅ 性能测试和优化

### 下一步方向

- 向量数据库集成（RAG）
- 长期记忆持久化
- 多会话管理
- 更复杂的记忆检索策略

---

**记忆管理是 LLM 应用的核心能力之一。选择合适的策略，让你的应用更智能、更高效！**
