# Step 51: 项目级 Agent｜设置权限控制

## 学习目标

这一节的重点不是“加一个 if 判断”，而是建立一套真正能用在项目级 Agent 里的权限模型。

做完本节后，你应该能：

1. 把权限分成读、写、删、执行、联网、敏感操作几个层级
2. 为不同风险动作设计不同的审批门
3. 用风险矩阵判断任务是否允许进入执行阶段
4. 让权限控制和 task object、diff、确认、回滚自然衔接

> 权限不是附属功能，它是项目级 Agent 的第一道边界。

---

## 一、问题背景：为什么项目级 Agent 必须先谈权限

项目级 Agent 一旦连上真实仓库，就不再是“想说什么就说什么”的聊天工具，而是一个会碰代码、碰命令、碰测试、碰配置的执行者。

如果没有权限控制，常见事故会是：

- 读取了不该暴露的 `.env`
- 修改了不该写的生产配置
- 执行了危险 shell 命令
- 对外联网抓取了不该访问的数据
- 把本该人工确认的变更自动执行了

所以权限控制不是“安全附加项”，而是系统能否进入真实项目的前提。

### 1.1 权限应该回答的三个问题

1. 这个任务允许访问哪些资源
2. 这个动作在当前风险等级下能不能执行
3. 如果不能执行，需要谁来确认

这三个问题不清楚，Agent 就会在“看起来很聪明”和“实际很危险”之间来回切换。

---

## 二、架构拆解：权限控制应该放在哪些点

权限控制不是单点，而是贯穿任务生命周期。

### 2.1 推荐的权限链路

```text
user request
   |
   v
task parser -> scope resolver -> permission checker -> approval gate
   |                                   |
   |                                   v
   |                             policy decision
   v
executor -> audit log -> verifier
```

### 2.2 典型权限维度

| 维度 | 例子 | 风险 |
|---|---|---|
| 文件读取 | `src/**`, `docs/**` | 低到中 |
| 文件写入 | `src/services/**` | 中到高 |
| 文件删除 | 删除旧实现、删除目录 | 高 |
| 命令执行 | `npm test`, `git diff` | 中到高 |
| 网络访问 | 调接口、拉远程资源 | 中到高 |
| 密钥访问 | `.env`, secret store | 极高 |

项目级 Agent 的理想状态不是“所有动作都允许”，而是“每个动作都能被解释、被限制、被审计”。

---

## 三、机制设计：权限分级与风险矩阵

最实用的做法，是先把动作分级，再把任务映射到分级规则里。

### 3.1 权限等级示意

```text
Level 0: 只读
  - 读文档
  - 读源码
  - 看日志

Level 1: 安全写入
  - 修改教程文档
  - 修改非关键配置

Level 2: 受控写入
  - 修改业务代码
  - 新增测试
  - 创建 patch

Level 3: 受控执行
  - 跑 lint / test / build
  - 执行受限 shell 命令

Level 4: 高风险动作
  - 删除文件
  - 改生产配置
  - 访问密钥
  - 强制推送
```

### 3.2 风险矩阵

| 动作 | 读 | 写 | 删 | exec | network | secret |
|---|---:|---:|---:|---:|---:|---:|
| docs 修改 | 1 | 1 | 0 | 0 | 0 | 0 |
| 代码重构 | 1 | 1 | 0 | 1 | 0 | 0 |
| 删除旧文件 | 1 | 1 | 1 | 0 | 0 | 0 |
| 跑测试 | 0 | 0 | 0 | 1 | 0 | 0 |
| 拉远程依赖 | 0 | 0 | 0 | 1 | 1 | 0 |
| 读取密钥 | 1 | 0 | 0 | 0 | 0 | 1 |

矩阵的意义不是“表格好看”，而是让系统在执行前能回答：

- 这一步是低风险还是高风险
- 是否需要人工确认
- 是否允许自动执行

---

## 四、代码示例：一个可落地的权限检查器

下面这个例子展示的是“先判定，再执行”的思路。

```js
const defaultPolicy = {
  allowRead: ['docs/**', 'src/**', 'package.json'],
  allowWrite: ['docs/**', 'src/**'],
  allowExec: ['npm test', 'npm run lint', 'git diff'],
  denyWrite: ['.env', '.git/**', 'node_modules/**'],
  denyExec: ['rm -rf *', 'sudo *', 'git push --force'],
  requireApproval: ['write:src/**', 'exec:npm run build', 'delete:*'],
}

function matchPattern(value, patterns = []) {
  return patterns.some((pattern) => value.startsWith(pattern.replace('/**', '')))
}

function checkPermission(task, action) {
  if (action.type === 'write' && matchPattern(action.path, defaultPolicy.denyWrite)) {
    return { allowed: false, reason: '写入敏感路径被拒绝' }
  }

  if (action.type === 'exec' && defaultPolicy.denyExec.some((cmd) => action.command.startsWith(cmd.replace(' *', '')))) {
    return { allowed: false, reason: '危险命令被拒绝' }
  }

  const approvalKey = `${action.type}:${action.target || action.path || action.command}`
  if (defaultPolicy.requireApproval.includes(approvalKey)) {
    return { allowed: false, needApproval: true, reason: '需要人工确认' }
  }

  return { allowed: true }
}
```

这段代码的核心不是字符串匹配，而是把“系统允许什么”从业务逻辑里抽出来，变成一个清晰的 policy 层。

### 4.1 推荐再加一层权限解析

```js
function resolveScope(task) {
  return {
    repo: task.scope.repo,
    readable: task.scope.include ?? [],
    writable: task.scope.write ?? [],
    forbidden: task.scope.exclude ?? [],
    maxRisk: task.riskLevel ?? 'medium',
  }
}
```

这样 planner 输出的 scope，approval 才能真正接住。

---

## 五、风险与验证：权限要可测试、可审计、可解释

权限系统最怕“写了等于没写”，所以必须验证它真的生效。

### 5.1 必须覆盖的测试场景

- 只读任务不能触发写入
- 写入任务不能覆盖敏感路径
- 删除任务必须进入审批
- 高风险命令必须被拦截
- 白名单命令可以自动执行
- 被拒绝的动作必须留下审计日志

### 5.2 审计记录建议

```js
{
  taskId: 'task-001',
  action: 'write',
  target: 'src/services/agent.js',
  decision: 'need_approval',
  reason: 'write:src/**',
  timestamp: '2026-04-10T10:00:00Z'
}
```

有了审计记录，后续你才能追溯为什么这个动作没有执行，也才能复盘权限规则是不是太松或太紧。

---

## 六、总结

这一节解决的是项目级 Agent 的“边界感”问题。

- 没有权限，Agent 只是会动手的模型
- 有了权限，Agent 才能进入真实项目
- 权限不是阻碍效率，而是在风险可控的前提下换来效率

下一节我们会把“改了什么”讲清楚，因为有了权限之后，系统还要让人能审查这些改动。那就是 diff 的价值。
