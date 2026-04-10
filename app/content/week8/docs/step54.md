# Step 54: 项目级 Agent｜加入任务链（plan → execute → verify）

## 学习目标

这一节要把前面所有能力串起来，形成一条可运行、可回放、可恢复的任务链。

做完本节后，你应该能：

1. 把复杂任务拆成 plan / execute / verify 三阶段
2. 为每一阶段设计状态机和检查点
3. 在失败时做恢复、重试或回滚
4. 理解为什么项目级 Agent 不能只靠“一次回答”完成任务

> 任务链的核心不是步骤多，而是每一步都可验证、可恢复、可审计。

---

## 一、问题背景：为什么单步执行很容易出事

在真实工程里，用户给出的任务往往不是一句话就能完成的简单操作，而是：

- 先理解问题
- 再列出修改方案
- 再确认风险
- 再执行写入
- 再跑测试
- 最后整理结果

如果把这些合成一次性动作，系统很容易出现：

- 计划不完整就开始写
- 写完不验证，直接汇报成功
- 中间失败了但不知道停在哪里
- 用户只看到结论，看不到过程

所以项目级 Agent 最需要的能力之一，就是把任务变成**阶段化流程**。

---

## 二、架构拆解：任务链和状态机

### 2.1 推荐状态机

```text
draft
  -> planned
  -> awaiting_approval
  -> executing
  -> verifying
  -> succeeded

任何阶段都可能进入:
  -> failed
  -> rolled_back
  -> needs_attention
```

### 2.2 各阶段职责

| 阶段 | 作用 | 输出 |
|---|---|---|
| plan | 生成步骤、风险、验证命令 | patch plan |
| execute | 按计划修改文件或运行命令 | 写入结果、执行日志 |
| verify | 证明结果可用 | 测试结果、lint、diff |
| rollback | 当失败时回退到安全状态 | 恢复快照、撤销补丁 |

任务链不应该只是“函数串联”，它应该是**带状态的任务生命周期**。

---

## 三、机制设计：把 plan、execute、verify 组织成一个 runner

### 3.1 任务对象示例

```js
const task = {
  id: 'task-20260410-002',
  goal: '给工程师 Agent 增加任务链',
  state: 'draft',
  plan: null,
  snapshotId: null,
  result: null,
  verification: null,
  error: null,
}
```

### 3.2 runner 的职责

runner 不负责具体业务细节，它只负责：

- 控制阶段顺序
- 记录状态变化
- 处理失败
- 触发回滚
- 汇总最终结果

### 3.3 最小状态迁移规则

```js
function transition(task, nextState) {
  const allowed = {
    draft: ['planned', 'failed'],
    planned: ['awaiting_approval', 'failed'],
    awaiting_approval: ['executing', 'rejected'],
    executing: ['verifying', 'failed'],
    verifying: ['succeeded', 'failed'],
    failed: ['rolled_back', 'needs_attention'],
  }

  if (!allowed[task.state]?.includes(nextState)) {
    throw new Error(`invalid transition: ${task.state} -> ${nextState}`)
  }

  task.state = nextState
  return task
}
```

状态机的意义在于：你不会把“失败了还能继续执行”的危险路径藏起来。

---

## 四、代码示例：一个带恢复能力的任务链执行器

```js
class TaskRunner {
  constructor({ planner, approval, executor, verifier, memory }) {
    this.planner = planner
    this.approval = approval
    this.executor = executor
    this.verifier = verifier
    this.memory = memory
  }

  async run(taskInput) {
    const task = { ...taskInput, state: 'draft' }

    try {
      task.plan = await this.planner.buildPlan(task)
      transition(task, 'planned')

      const approval = await this.approval.request(task, task.plan)
      if (!approval.approved) {
        transition(task, 'failed')
        return { task, approval }
      }

      transition(task, 'awaiting_approval')
      task.snapshotId = await this.memory.createSnapshot(task)

      transition(task, 'executing')
      task.result = await this.executor.execute(task, task.plan)

      transition(task, 'verifying')
      task.verification = await this.verifier.verify(task, task.result)

      if (!task.verification.passed) {
        throw new Error(task.verification.reason || 'verification failed')
      }

      transition(task, 'succeeded')
      return { task, approval, result: task.result, verification: task.verification }
    } catch (error) {
      task.error = error.message
      transition(task, 'failed')
      await this.memory.rollback(task.snapshotId)
      transition(task, 'rolled_back')
      return { task, error: task.error, rolledBack: true }
    }
  }
}
```

这个示例有三个关键点：

1. `snapshotId` 让系统知道回滚基线在哪
2. `verification` 让成功不是靠口头声明，而是靠检查
3. `catch` 里的回滚让失败不会留下一半改动

---

## 五、风险与验证：失败恢复比成功更重要

### 5.1 需要明确的失败类型

- 计划失败：任务目标不清楚
- 审批失败：用户拒绝或权限不足
- 执行失败：写入、命令、补丁应用出错
- 验证失败：测试未通过、lint 报错、健康检查异常

### 5.2 恢复策略

| 失败位置 | 推荐处理 |
|---|---|
| 计划前 | 重新提问，补充任务信息 |
| 审批前 | 返回 diff 和风险说明 |
| 执行中 | 停止后续步骤并保存日志 |
| 验证中 | 回滚到最近快照 |

### 5.3 验证建议

- 每个阶段都要有独立日志
- 每次状态迁移都要可回放
- 成功和失败都要能复现
- 回滚要验证“恢复后仓库是否干净”

---

## 六、总结

任务链是项目级 Agent 的骨架。

- plan 让系统先想清楚
- execute 让系统真正做事
- verify 让系统证明自己做对了
- rollback 让失败不会变成事故

有了这条链，Agent 才从“会聊天的工具”变成“能承担工程责任的执行体”。

下一节，我们就把这套能力放进一次真实项目演练里，看看它是否真的能跑通。
