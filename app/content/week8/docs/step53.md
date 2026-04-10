# Step 53: 项目级 Agent｜加入重写文件前的确认机制

## 学习目标

这一节讨论的是一个非常现实的问题：当 Agent 准备覆盖文件时，用户该如何确认，系统又该如何把这个确认做得可靠、可用、不过度打扰。

做完本节后，你应该能：

1. 设计不同风险等级对应的确认方式
2. 在重写前展示摘要、diff、影响范围和回滚信息
3. 让确认机制和权限、diff、写入、验证形成闭环
4. 理解 human-in-the-loop 不是“人工点一下按钮”，而是一个明确的协作协议

> 确认机制的目标不是阻止 Agent，而是确保高风险动作只在用户真正理解后才发生。

---

## 一、问题背景：为什么“直接写文件”在真实项目里不可接受

项目级 Agent 最危险的地方，不是它不会写，而是它会**很快**写。

如果没有确认门，典型风险会包括：

- 原文件被覆盖，用户还没看 diff
- 大范围替换导致功能回归
- 修复一个问题时误伤别的模块
- Agent 自己判断“应该没问题”，但用户其实并不同意

所以确认机制本质上是在回答：

1. 这个动作是否真的值得执行
2. 用户是否已经理解结果
3. 执行后如果有问题，能否快速撤回

---

## 二、架构拆解：确认门放在哪里

确认机制通常不该放在最底层的文件写入函数里，而应该放在**任务编排层和执行层之间**。

### 2.1 推荐链路

```text
plan -> diff preview -> approval gate -> write -> verify
```

### 2.2 不同风险的确认策略

| 风险等级 | 例子 | 确认方式 |
|---|---|---|
| 低 | 更新文档、生成只读报告 | 自动继续或轻提示 |
| 中 | 修改业务代码、批量改文件 | 一次确认 |
| 高 | 删除文件、覆盖关键模块、执行危险命令 | 二次确认或输入口令 |
| 极高 | 改生产配置、访问密钥、强制写入 | 必须人工审批 |

确认门不是统一的“请确认”，而是**按风险分层**。

---

## 三、机制设计：确认前必须展示什么

好的确认界面，必须让用户在很短时间内回答三个问题：

- 你打算改什么
- 这次改动会影响哪里
- 如果不满意怎么回滚

### 3.1 最小确认信息包

```js
const confirmationPackage = {
  taskId: 'task-20260410-001',
  title: '重写文件前确认',
  summary: '准备覆盖 2 个核心文件，并新增 1 个审批模块',
  riskLevel: 'high',
  impactedFiles: [
    'src/agent/orchestrator.js',
    'src/agent/executor.js',
    'src/agent/approval.js',
  ],
  validationCommands: ['npm test', 'npm run lint'],
  rollbackPlan: '恢复最近一次快照并撤销未提交补丁',
}
```

### 3.2 用户体验原则

1. 先摘要，后细节
2. 先风险，再操作
3. 先影响范围，再确认按钮
4. 先回滚说明，再允许写入
5. 对危险动作不要只给“是/否”，要给“为什么”

这些原则的意义是减少用户误操作，而不是把用户拦在外面。

---

## 四、代码示例：一个可落地的确认流程

下面的实现展示的是“计划 -> 预览 -> 确认 -> 写入”的流程。

```js
async function rewriteWithApproval(task, patchPlan, ui) {
  const preview = {
    taskId: task.id,
    summary: patchPlan.summary,
    files: patchPlan.files,
    riskLevel: patchPlan.riskLevel,
    validationCommands: patchPlan.validationCommands,
    rollbackPlan: patchPlan.rollbackPlan,
  }

  const decision = await ui.requestApproval(preview)

  if (decision.status === 'rejected') {
    return {
      status: 'cancelled',
      reason: decision.reason || '用户取消',
      preview,
    }
  }

  if (decision.status === 'needs_changes') {
    return {
      status: 'revise_plan',
      feedback: decision.feedback,
      preview,
    }
  }

  const writeResult = await task.executor.applyPatch(patchPlan)
  return {
    status: 'written',
    preview,
    writeResult,
  }
}
```

### 4.1 UI 文案建议

确认时最好不要只写“是否继续”，而是写成更有信息量的文本：

```text
即将修改 3 个文件，其中 1 个文件为高风险覆盖。
建议先查看 diff，再确认是否继续。
如果执行后不满意，可以立即回滚到快照 #12。
```

这类文案会明显提升用户对系统的信任度，因为它把“操作”翻译成了“结果”。

### 4.2 高风险动作的二次确认

对于删除、覆盖、强制写入这类动作，可以要求用户输入固定短语：

```text
请输入 "CONFIRM WRITE" 继续
```

这不是形式主义，而是防止误点和误触。

---

## 五、风险与验证：确认机制要避免两种极端

### 5.1 过松

- 所有动作都只点一下就通过
- 高风险动作和低风险动作没有差别
- 用户以为只是预览，实际上已经写入

### 5.2 过紧

- 每一步都要确认，体验非常差
- 用户对系统失去耐心
- Agent 变成“会说话但做不了事”

### 5.3 验证建议

- 低风险任务应尽量无感通过
- 高风险任务必须卡住确认门
- 拒绝后必须可取消，不应留下半写入状态
- 需要补充信息时，系统要返回明确的下一步

确认机制不是为了增加阻力，而是为了让用户知道：**这次写入不是偷偷发生的**。

---

## 六、总结

这一节讲的是项目级 Agent 的“尊重用户”。

- 先展示要改什么
- 再说明为什么要改
- 然后给出确认方式
- 最后再真正写入

到这里为止，Agent 已经具备了边界、审查和确认。下一节我们会把这些动作串成真正可执行的任务链。
