# Step 48: MCP 实践｜测试：让 AI 自动修改项目代码

## 学习目标

这一节要解决的是：**如何把 MCP 工具真正串成一条“AI 自动改项目代码”的安全链路**。这不是单个工具的能力，而是 read、plan、diff、write、shell、audit 共同组成的工作流。

学完这一节，你应该能：

1. 设计一条受控的代码修改流程
2. 理解为什么不能让模型直接写最终文件
3. 把预览、确认、落盘、验证、回滚串成闭环
4. 给自动改码流程增加审计和失败保护

> **本节主线：** 让 AI 做“受控修改者”，不是“无约束编辑器”。

---

## 一、先认清风险：自动改码为什么不能直连写入

### 1.1 真正危险的不是“改错一行”

自动改代码最怕的不是语法错误，而是：

- 改到了错误文件
- 覆盖了本来稳定的实现
- 破坏了依赖顺序
- 忽略了项目约定
- 修复一个 bug 又引入三个 bug

所以自动改码不能是“模型说写就写”，而应该是**有计划、有预览、有确认的执行过程**。

### 1.2 推荐的安全链路

```
用户需求
   ↓
任务拆解 / 计划
   ↓
读取相关文件与上下文
   ↓
生成修改方案或 patch
   ↓
预览 diff
   ↓
确认是否执行
   ↓
受控写入 / patch 应用
   ↓
运行测试与 lint
   ↓
失败则回滚，成功则汇报
```

这条链路里，**write 只是最后一步，不是起点**。

---

## 二、协议和数据结构：把“改码”拆成可审计的任务对象

### 2.1 推荐的任务描述

```json
{
  "task": "Add input validation for user profile update",
  "scope": {
    "allowedFiles": ["src/profile/update.js", "src/profile/validation.js"],
    "blockedPatterns": [".env", "secrets", "private.key"]
  },
  "constraints": {
    "maxFileChanges": 3,
    "maxPatchLines": 200,
    "requireApproval": true
  }
}
```

这个任务对象的意义是：**把修改边界前置到系统层**。

### 2.2 推荐的执行结果

```json
{
  "ok": true,
  "status": "completed",
  "changedFiles": [
    "src/profile/update.js"
  ],
  "checks": {
    "lint": "passed",
    "test": "passed"
  },
  "audit": {
    "readFiles": 4,
    "writeFiles": 1,
    "shellCalls": 2
  }
}
```

如果失败，也要明确告诉模型和客户端失败发生在哪一步：

```json
{
  "ok": false,
  "stage": "verification",
  "error": {
    "type": "TestFailed",
    "message": "npm test failed after patch application"
  }
}
```

---

## 三、代码实现：把修改过程写成“计划驱动”的工作流

### 3.1 一个最小的 orchestrator

```js
export async function editProjectCode(task, registry, context) {
  const plan = await createPlan(task)

  const files = await Promise.all(
    plan.targetFiles.map((file) =>
      registry.call('read_file', { path: file, maxBytes: 200000 }, context)
    )
  )

  const patch = await generatePatch(task, files)
  const preview = await previewPatch(patch)

  if (!task.approved) {
    return {
      ok: true,
      stage: 'preview',
      preview,
      message: 'Patch generated, waiting for approval'
    }
  }

  await applyPatch(patch)

  const testResult = await registry.call(
    'run_command',
    { command: 'npm', args: ['test'], cwd: '.' },
    context
  )

  if (!testResult.ok) {
    await rollbackPatch(patch)
    return {
      ok: false,
      stage: 'verification',
      error: testResult.error ?? { type: 'TestFailed' }
    }
  }

  return {
    ok: true,
    stage: 'completed',
    changedFiles: patch.files
  }
}
```

### 3.2 为什么要先生成 patch

patch 是非常适合自动改码的中间态，因为它有三个优点：

- 可以先预览
- 可以做差异审查
- 可以回滚

比起直接写文件，patch 更适合作为 Agent 的“修改提案”。

### 3.3 最好不要让模型直接调用 `write_file`

更稳的做法是：

- 模型先读文件
- 模型输出变更计划
- 系统生成 patch
- 人或策略确认
- 再把 patch 应用到文件

这样能显著降低“模型一激动就改错”。

---

## 四、调试和安全：自动改码必须有硬门槛

### 4.1 必须做的限制

1. **文件范围限制**：只允许编辑白名单内文件
2. **变更量限制**：一次修改文件数、行数都要有限制
3. **敏感文件限制**：`.env`、密钥、证书、私有配置默认禁止
4. **验证门禁**：写完必须跑测试或静态检查
5. **回滚机制**：验证失败就恢复备份或撤销 patch

### 4.2 调试顺序建议

- 先看 plan 是否准确
- 再看读取上下文是否完整
- 再看 patch 是否语义合理
- 最后才看 write / shell 是否执行成功

很多失败并不发生在 I/O 层，而是发生在“理解任务”这一步。

### 4.3 安全上最容易犯的错

- 只看文件路径，不看内容是否敏感
- 没有限制 patch 大小
- 直接让 shell 跑任意命令
- 失败后没有回滚
- 把一次任务拆得太碎，导致状态失控

---

## 五、小结

自动修改项目代码的正确姿势，不是“模型替你写代码”，而是“模型在协议和权限约束下，参与一个受控的软件修改流程”。

你真正要记住的是这条原则：

> **任何会改变代码仓库状态的动作，都应该先被表示为计划、再变成 patch、最后才是写入和验证。**

下一节我们会把这整个周的内容收束成一个本地操作 Agent 的最佳实践总结，补上你后续继续扩展时最需要的边界感和方法论。
