# Step 50: 项目级 Agent｜规划一个“工程师 Agent”架构

## 学习目标

这一节先不急着写代码，而是先把“项目级 Agent”到底长什么样说清楚。

做完本节后，你应该能：

1. 说清楚普通 Chat/Tool Agent 和项目级工程师 Agent 的区别
2. 画出 planner / executor / tool layer / verifier / memory / approval 的协作关系
3. 认识“任务对象”为什么要成为系统里的第一等公民
4. 为后面的权限、diff、确认、任务链、验证和回滚打下统一架构

> 本节先建立系统模型，再进入后续的安全与执行细节。

---

## 一、问题背景：为什么“能调用工具”还不够

前面几周里，你已经看到 Agent 会思考、会调用工具、会观察结果。但一旦进入真实工程，问题就会立刻变难：

- 它会读很多文件，但不知道哪些文件能写
- 它能生成很多修改，但你看不懂到底改了什么
- 它会直接覆盖代码，但没有确认门
- 它能跑命令，但不会区分安全命令和破坏性命令
- 它会做长任务，但没有 plan -> execute -> verify 的闭环

这意味着，项目级 Agent 不只是“更强的聊天机器人”，而是一个**有任务边界、有执行审计、有人工审批、有验证反馈**的工程系统。

### 1.1 任务场景示例

假设用户给出一个真实改动请求：

> “把当前仓库里的聊天链路重构一下，先拆出计划，再改代码，最后跑测试并给我 diff。”

如果只是普通 Agent，它可能会：

- 直接开始改文件
- 只返回一段总结
- 不告诉你中间决策
- 出错后不知道回滚到哪里

项目级 Agent 则应该这样工作：

1. 先形成 task object
2. 再由 planner 输出可执行计划
3. 再由 approval 判断是否允许进入写入阶段
4. 再由 executor 分步执行
5. 再由 verifier 跑验证
6. 最后产出可审查的结果包

---

## 二、架构拆解：六个模块分别负责什么

项目级 Agent 的关键，不在于“用了多少 LLM”，而在于模块边界清不清楚。

### 2.1 总体结构

```text
User Request
   |
   v
┌──────────┐     ┌──────────┐
│ planner  │ --> │ approval │
└──────────┘     └──────────┘
      |                |
      v                v
┌──────────┐     ┌──────────┐
│ executor │ --> │ verifier │
└──────────┘     └──────────┘
      ^                |
      |                v
   ┌──────────┐   ┌──────────┐
   │ tool     │   │ memory   │
   │ layer    │   │ & audit  │
   └──────────┘   └──────────┘
```

### 2.2 各模块职责

| 模块 | 职责 | 产物 |
|---|---|---|
| planner | 把自然语言任务拆成步骤 | 计划、检查点、风险说明 |
| approval | 决定是否允许进入危险动作 | 通过 / 拒绝 / 需要补充信息 |
| executor | 实际执行读写、命令、补丁应用 | 文件修改、命令结果、错误信息 |
| tool layer | 统一封装文件、终端、Git、测试等工具 | 可调用的工具集合 |
| verifier | 证明“改完真的可用” | 测试结果、lint 结果、健康检查 |
| memory & audit | 记录上下文、决策和审计轨迹 | 任务历史、回滚点、执行日志 |

这里最重要的一点是：**planner 负责想清楚，executor 负责做，verifier 负责证明，approval 负责控制风险，memory 负责让系统记得自己做过什么。**

---

## 三、机制设计：任务对象比“命令列表”更重要

项目级 Agent 不应该只处理一串动作，而应该处理一个结构化任务。

### 3.1 任务对象示例

```js
const task = {
  id: 'task-20260410-001',
  goal: '重构 chat 路由的写入流程，加入 diff 和确认门',
  scope: {
    repo: 'current-repo',
    include: ['src/routes/**', 'src/services/**'],
    exclude: ['.env', 'logs/**', 'node_modules/**'],
  },
  mode: 'human-in-the-loop',
  riskLevel: 'high',
  plan: [],
  checkpoints: [],
  approval: {
    required: true,
    status: 'pending',
    reason: '会产生代码写入和测试执行',
  },
  memory: {
    notes: [],
    snapshots: [],
  },
}
```

这个对象的价值在于，它把“要做什么”变成了“系统可以跟踪什么”。

### 3.2 任务状态建议

```text
draft -> planned -> awaiting_approval -> executing -> verifying
   |          |                |              |             |
   |          |                |              |             v
   |          |                |              |         succeeded
   |          |                |              v
   |          |                |           failed -> rolled_back
   |          |                v
   |          v            rejected
   v       needs_info
```

每个状态都应该是可观测的，因为真实工程里最怕的不是失败，而是**失败了却不知道停在哪一步**。

---

## 四、代码示例：一个最小的工程师 Agent 编排器

下面不是完整产品代码，而是一个能帮助你理解模块关系的最小骨架。

```js
class EngineerAgent {
  constructor({ planner, approval, executor, verifier, memory, tools }) {
    this.planner = planner
    this.approval = approval
    this.executor = executor
    this.verifier = verifier
    this.memory = memory
    this.tools = tools
  }

  async run(userInput) {
    const task = await this.planner.createTask(userInput)
    this.memory.save('task.created', task)

    const plan = await this.planner.buildPlan(task)
    task.plan = plan.steps

    const approval = await this.approval.request(task, plan)
    if (!approval.approved) {
      return { status: 'rejected', reason: approval.reason, task }
    }

    const result = await this.executor.execute(task, plan)
    const verification = await this.verifier.verify(task, result)

    this.memory.save('task.finished', {
      taskId: task.id,
      result,
      verification,
    })

    return { task, plan, result, verification }
  }
}
```

你可以把这段代码理解成一条主线：

- planner 负责从用户输入里抽出目标
- approval 负责给高风险动作加闸门
- executor 负责真正改动系统
- verifier 负责给改动做证据
- memory 负责保留上下文和审计

---

## 五、风险与验证：架构设计阶段就要先想清楚

项目级 Agent 一旦进入真实项目，风险不再是“答错题”，而是：

- 改错文件
- 写坏配置
- 误删内容
- 执行了不该执行的命令
- 测试没过却误以为成功

所以从第一天起就要把验证策略写进架构里。

### 5.1 最少要有的验证动作

- 计划前检查：任务范围是否明确
- 执行前检查：权限是否通过
- 写入前检查：是否已有 diff 预览
- 写入后检查：补丁是否能应用
- 完成后检查：测试命令是否通过
- 失败后检查：是否回滚到最近快照

### 5.2 推荐的工程原则

1. 默认不写入，先规划再执行
2. 默认可回滚，所有写入都要留快照
3. 默认要审查，diff 是产品输出不是内部日志
4. 默认要验证，成功必须被测试证明

---

## 六、总结

这一节最重要的不是记住几个模块名，而是建立项目级 Agent 的基本心智模型：

- 它不是单个模型调用
- 它是一个带审批和验证的工程执行系统
- 它的核心资产不是回答，而是任务对象、计划、差异、审计和回滚点

下一节开始，我们会把这个架构拆到更细的治理层，先从**权限控制**开始。
