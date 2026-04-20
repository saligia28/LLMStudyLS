# Step 55: 项目级 Agent｜做一次真实项目测试

## 学习目标

这一节不再停留在“概念讲解”，而是把项目级 Agent 放进一次真实工程任务里完整跑一遍。

做完本节后，你应该能：

1. 从真实项目里挑一个足够小但足够真的任务
2. 让 Agent 先给出计划，再给 diff，再进入确认
3. 把执行、验证、失败恢复串成一条完整演练链
4. 用这次演练输出一份可复盘的工程总结

> 这一节的目标不是“演示功能”，而是“模拟一次会被真正 review 的改动”。

---

## 一、问题背景：为什么一定要做真实项目测试

项目级 Agent 最容易在 demo 里显得很强，但一进入真实项目就暴露问题：

- 文件很多，范围不清
- 命令很多，权限不稳
- 改动不大，但影响链条很长
- 一旦失败，不知道怎么回滚

因此，真实项目测试的意义是验证三件事：

1. 系统能不能准确理解任务
2. 系统能不能在边界内执行
3. 系统能不能在失败时恢复

如果这三件事做不到，Agent 就只能停留在实验室。

---

## 二、演练准备：先选一个“可被审查”的真实任务

真正适合练手的任务，通常满足这几个条件：

- 范围小，但不是玩具
- 会改文件，但不会大规模破坏
- 需要验证，但不要求长时间跑任务
- 能在一两个回合内看出结果

### 2.1 推荐的真实任务形态

你可以从这些方向里选一个：

- 给某个现有模块补一个验证步骤
- 重构一个小的执行链路
- 把重复逻辑提成一个可复用函数
- 为现有命令加上 `dry-run`
- 给项目文档补一段 agent 使用说明

### 2.2 任务对象示例

```js
const task = {
  id: 'task-real-001',
  repo: 'current-repo',
  goal: '把验证链路整理成可审查、可回滚的真实任务',
  scope: {
    include: ['src/**', 'docs/**'],
    exclude: ['.env', 'node_modules/**', 'logs/**'],
  },
  constraints: [
    '不要触碰密钥',
    '不要删除现有测试',
    '改动后必须提供验证命令',
  ],
  riskLevel: 'medium',
}
```

这个任务对象的关键，是它明确了边界，也明确了成功标准。

---

## 三、演练流程：从任务输入到最终汇报

### 3.1 第一轮：planner 输出计划

planner 不是简单列步骤，而是给出**可执行、可审查、可验证**的方案。

```text
Plan
1. 读取相关文件，确认当前执行链路
2. 生成 patch plan，标出会改的文件
3. 对高风险写入发起确认
4. 执行修改并保留快照
5. 运行验证命令
6. 输出 diff、验证结果和总结
```

### 3.2 第二轮：diff 预览和确认

在真实项目里，Agent 不应该直接写入，而应该先给出：

- 摘要
- 变更文件
- 高风险片段
- 验证命令
- 回滚方式

用户看到这些内容后，再决定是否继续。

### 3.3 第三轮：执行和验证

执行阶段建议至少保留三类日志：

- 文件写入日志
- 命令执行日志
- 验证结果日志

验证阶段建议至少跑两层检查：

1. 快速检查：语法、lint、diff 是否合理
2. 结果检查：核心命令是否通过

---

## 四、代码示例：真实演练的最小脚本

下面这个脚本的重点是“过程记录”。

```js
async function runRealProjectTask(agent, task) {
  const report = {
    taskId: task.id,
    state: 'draft',
    plan: null,
    diff: null,
    approval: null,
    execution: null,
    verification: null,
    rollback: null,
  }

  report.plan = await agent.plan(task)
  report.state = 'planned'

  report.diff = await agent.previewDiff(task, report.plan)
  report.approval = await agent.requestApproval(report.diff)
  if (!report.approval.approved) {
    report.state = 'cancelled'
    return report
  }

  try {
    report.state = 'executing'
    report.execution = await agent.execute(task, report.plan)

    report.state = 'verifying'
    report.verification = await agent.verify(task, report.execution)

    if (!report.verification.passed) {
      throw new Error(report.verification.reason || 'verification failed')
    }

    report.state = 'succeeded'
    return report
  } catch (error) {
    report.state = 'failed'
    report.rollback = await agent.rollback(task)
    report.error = error.message
    report.state = 'rolled_back'
    return report
  }
}
```

### 4.1 真实项目测试时必须记录的内容

```text
- task id
- repo / branch
- scope
- plan
- diff
- approval result
- executed commands
- verification commands
- rollback result
```

没有这些记录，演练就很难变成可复盘经验。

---

## 五、风险与验证：真实项目测试要重点看什么

### 5.1 成功标准

- 任务边界没有跑偏
- diff 能看懂
- 确认门正常工作
- 写入后能通过验证
- 失败时能恢复

### 5.2 失败标准

- 计划里没有提到的文件被改了
- 未经确认就写入了高风险内容
- 验证命令没跑，结果却被报告为成功
- 回滚后仓库状态仍然脏

### 5.3 建议的验收命令

```bash
npm test
npm run lint
git diff --stat
git status --short
```

这些命令不是形式，而是让你确认：

- 修改是否真的落地
- 仓库是否干净
- 变更是否可解释

---

## 六、总结

一次真实项目测试的价值，不在于“Agent 看起来很厉害”，而在于它能不能经得起工程现场的约束。

- 先选真实任务
- 再做计划和 diff
- 再进入确认和写入
- 最后用验证和回滚证明系统可靠

这一节做完以后，Week 8 的所有关键能力就都串起来了。下一节我们会把这些经验总结成原则，并顺手给 Week 9 留出接口。
