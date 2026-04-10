# Step 52: 项目级 Agent｜实现文件 diff 输出

## 学习目标

这一节要解决的问题很直接：Agent 改了代码以后，怎么让人类真正看懂它改了什么。

做完本节后，你应该能：

1. 把 diff 当成可审查输出，而不是 git 命令的副产品
2. 生成适合人工 review 的变更摘要、文件列表和补丁片段
3. 在写入前展示“预览版改动”，在写入后展示“最终版改动”
4. 把 diff 和确认门、回滚点、验证命令连成完整链路

> diff 不是内部细节，它是 Agent 和人类之间最重要的协作语言之一。

---

## 一、问题背景：为什么“改完给个总结”远远不够

项目级 Agent 经常会给出这样的结果：

- “我已经重构完成”
- “相关文件已更新”
- “功能已经修复”

但这些话并不能回答最重要的问题：

1. 哪些文件被改了
2. 每个文件改动的范围有多大
3. 是新增、删除还是替换
4. 这些改动是否和目标一致
5. 是否存在高风险操作

所以 diff 的角色不是“展示给程序员看一下”，而是：

- 让人类复核
- 让审批门决定放行与否
- 让验证阶段知道重点检查什么
- 让回滚阶段知道基线在哪里

---

## 二、架构拆解：diff 应该如何嵌入任务流

### 2.1 变更流

```text
task -> plan -> patch plan -> diff preview -> approval -> write -> verify -> final diff
```

这里要特别注意一个顺序：

- 先有 patch plan，再有 diff
- 先让人看预览，再执行写入
- 写完之后，再生成最终 diff 和验证结果

### 2.2 diff 输出的产品结构

| 部分 | 作用 |
|---|---|
| 变更摘要 | 让人快速知道这次改动的目的 |
| 影响范围 | 告诉人类改了哪些目录/文件 |
| 补丁内容 | 展示具体新增、删除、替换 |
| 风险标记 | 标出删除、覆盖、重命名等高风险动作 |
| 验证建议 | 给出应该跑哪些命令 |

如果一个 diff 只长得像 git 输出，但没有摘要、风险和验证，它就只是“技术文本”，还不是 Agent 的审查界面。

---

## 三、机制设计：把 diff 变成可审查对象

### 3.1 diff envelope

建议把 diff 包装成一个统一对象，而不是直接丢一大串文本。

```js
const diffEnvelope = {
  taskId: 'task-20260410-001',
  summary: '将写入流程拆成计划、预览、确认和执行四步',
  riskLevel: 'medium',
  changedFiles: [
    {
      path: 'src/agent/orchestrator.js',
      status: 'modified',
      additions: 24,
      deletions: 11,
    },
    {
      path: 'src/agent/approval.js',
      status: 'new',
      additions: 68,
      deletions: 0,
    },
  ],
  patch: '--- a/...\\n+++ b/...\\n@@ ...',
  validation: ['npm test', 'npm run lint'],
}
```

### 3.2 为什么要这样包一层

因为人类在 review 时，通常不是按“逐字阅读文件”来决策，而是按：

- 这次改动值不值得看
- 是否超过风险阈值
- 是否需要确认
- 验证命令是什么

diff envelope 把这些决策信息提前组织好了。

---

## 四、代码示例：从 patch plan 生成 review 输出

下面这个示例重点不在“怎么写算法”，而在“怎么组织输出”。

```js
function buildDiffEnvelope(task, patchPlan, rawDiff) {
  const changedFiles = patchPlan.files.map((file) => ({
    path: file.path,
    status: file.operation,
    additions: file.additions ?? 0,
    deletions: file.deletions ?? 0,
  }))

  const riskyFiles = changedFiles.filter((file) =>
    file.status === 'deleted' || file.deletions > 50
  )

  return {
    taskId: task.id,
    summary: patchPlan.summary,
    riskLevel: riskyFiles.length > 0 ? 'high' : task.riskLevel,
    changedFiles,
    patch: rawDiff,
    validation: patchPlan.validationCommands,
    reviewHint: riskyFiles.length > 0 ? '需要人工确认删除或大范围替换' : '可快速审查',
  }
}

function renderDiffPreview(envelope) {
  return [
    `任务: ${envelope.taskId}`,
    `摘要: ${envelope.summary}`,
    `风险: ${envelope.riskLevel}`,
    '文件列表:',
    ...envelope.changedFiles.map(
      (file) => `- ${file.path} (${file.status}, +${file.additions} / -${file.deletions})`
    ),
    '验证命令:',
    ...envelope.validation.map((cmd) => `- ${cmd}`),
    'Patch:',
    envelope.patch,
  ].join('\\n')
}
```

这段代码里最有价值的部分不是 `rawDiff`，而是它把 diff 前面配上了“摘要、风险、验证命令”。这才是项目级 Agent 的产品化思路。

### 4.1 推荐的 patch plan 结构

```js
const patchPlan = {
  summary: '拆分写入逻辑并加入确认门',
  files: [
    { path: 'src/agent/orchestrator.js', operation: 'modified', additions: 24, deletions: 11 },
    { path: 'src/agent/approval.js', operation: 'new', additions: 68 },
  ],
  validationCommands: ['npm test', 'npm run lint'],
}
```

patch plan 的职责是先说明“准备改什么”，diff 的职责是再说明“实际上改了什么”。

---

## 五、风险与验证：diff 必须能被审查和回放

### 5.1 diff 输出的几条纪律

1. 变更摘要必须先于 patch 出现
2. 大改动必须标记风险等级
3. 删除和重写必须单独提示
4. 验证命令必须和变更绑定
5. diff 内容要能被回放，用于复盘和回滚

### 5.2 常见坑

- 只输出了 patch，没有摘要
- 文件太多，审查者不知道先看哪几个
- diff 里混入了密钥或用户隐私
- patch 看起来通过了，但没有跑验证
- 写入后没有保存最终版本号，后续无法回放

### 5.3 验证建议

- 先对小文件跑 diff，确认格式没问题
- 再对多文件改动跑汇总视图
- 对删除、覆盖、重命名单独做提示
- 在验证阶段附带 `git diff` 和测试结果

---

## 六、总结

diff 在项目级 Agent 里不是“附带功能”，而是一个核心交互面。

- 它让系统变得可审查
- 它让确认门有依据
- 它让验证阶段知道该查什么
- 它让回滚阶段知道改了什么

下一节我们会把“确认门”做得更像真实产品，而不是简单的 yes/no 提示。
