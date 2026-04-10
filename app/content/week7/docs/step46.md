# Step 46: MCP 实践｜实现执行 shell 命令工具

## 学习目标

这一节要解决的是：**怎样把 shell 执行能力做成一个可审计、可限制、可超时回收的 MCP tool**。它是本地操作 Agent 里最危险的一类工具，所以设计标准必须比文件读写更严格。

学完这一节，你应该能：

1. 设计一个偏安全的 shell 工具 schema
2. 理解为什么要优先使用 `spawn` 而不是直接拼 shell 字符串
3. 给命令执行加上白名单、超时、cwd 限制和输出上限
4. 看懂工具执行日志和错误返回

> **本节主线：** 让模型“能执行有限命令”，而不是“拿到完整终端控制权”。

---

## 一、先定边界：shell 工具为什么最危险

### 1.1 shell 工具的用途

shell 工具通常用于：

- 运行测试
- 执行 lint / format
- 查询 git 状态
- 触发构建脚本
- 查看本地环境信息

这些事情都很有用，但它们共同点是：**一旦放开，就能影响整个系统状态**。

### 1.2 不推荐的设计

不推荐把工具做成这样：

```json
{
  "command": "rm -rf /"
}
```

也不推荐直接暴露“任意 shell 字符串”：

```json
{
  "command": "npm test && cat ~/.ssh/id_rsa"
}
```

shell 工具一定要做限制。最好的默认策略是：**命令白名单 + 参数数组 + 沙箱上下文**。

---

## 二、输入输出设计：用结构化参数替代任意字符串

### 2.1 推荐输入 schema

```json
{
  "type": "object",
  "properties": {
    "command": { "type": "string" },
    "args": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "cwd": { "type": "string" },
    "timeoutMs": { "type": "integer", "minimum": 100, "maximum": 300000, "default": 30000 },
    "env": { "type": "object" },
    "captureStderr": { "type": "boolean", "default": true }
  },
  "required": ["command"]
}
```

这里有两个关键点：

- `command` 和 `args` 分开，尽量避免 shell 注入
- `cwd` 必须受限于 workspace，不能让模型跳到任意目录

### 2.2 推荐输出结构

```json
{
  "ok": true,
  "command": "npm",
  "args": ["test"],
  "exitCode": 0,
  "stdout": "passed 12 tests",
  "stderr": "",
  "meta": {
    "pid": 12345,
    "durationMs": 1842,
    "timedOut": false,
    "truncated": false
  }
}
```

失败时，也要保持结构统一：

```json
{
  "ok": false,
  "error": {
    "type": "CommandDenied",
    "message": "Command is not in the allowlist"
  }
}
```

这样 client 才能基于错误类型做后续决策，而不是只看一段字符串。

---

## 三、代码实现：白名单 + `spawn` + 超时回收

### 3.1 一个安全的最小实现

```js
import { spawn } from 'node:child_process'
import path from 'node:path'

const ALLOWLIST = new Map([
  ['npm', [['test'], ['run', 'lint']]],
  ['git', [['status'], ['diff', '--stat']]],
  ['node', [['--version']]]
])

function isAllowed(command, args) {
  const allowedArgs = ALLOWLIST.get(command)
  if (!allowedArgs) return false
  return allowedArgs.some((pattern) =>
    pattern.length === args.length && pattern.every((value, index) => value === args[index])
  )
}

export async function shellTool(input, context) {
  const cwd = path.resolve(context.workspaceRoot, input.cwd ?? '.')
  if (!cwd.startsWith(context.workspaceRoot + path.sep)) {
    throw new Error('cwd outside workspace is not allowed')
  }

  const args = input.args ?? []
  if (!isAllowed(input.command, args)) {
    throw new Error('Command is not in the allowlist')
  }

  return await new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(input.command, args, {
      cwd,
      env: {
        ...process.env,
        ...(input.env ?? {}),
        PATH: process.env.PATH
      },
      shell: false
    })

    let stdout = ''
    let stderr = ''
    let finished = false
    const timer = setTimeout(() => {
      if (finished) return
      finished = true
      child.kill('SIGKILL')
      resolve({
        ok: false,
        error: { type: 'Timeout', message: 'Command timed out' }
      })
    }, input.timeoutMs ?? 30000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.length > 10000) stdout = stdout.slice(0, 10000)
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 10000) stderr = stderr.slice(0, 10000)
    })

    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve({
        ok: code === 0,
        command: input.command,
        args,
        exitCode: code,
        stdout,
        stderr,
        meta: { pid: child.pid, timedOut: false, durationMs: Date.now() - startedAt }
      })
    })
  })
}
```

### 3.2 为什么要用 `spawn`

`spawn` 直接执行命令和参数数组，不需要通过 shell 解析整段字符串，因此：

- 更容易限制参数
- 更不容易发生注入
- 更适合记录结构化日志
- 更容易和 allowlist 配合

如果必须支持 shell 语法，建议显式拆成另一类更危险的工具，而不是混在普通执行器里。

### 3.3 tool definition 的建议字段

```js
registry.register({
  name: 'run_command',
  description: 'Run a limited shell command inside the workspace sandbox',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      args: { type: 'array', items: { type: 'string' } },
      cwd: { type: 'string' },
      timeoutMs: { type: 'integer' }
    },
    required: ['command']
  },
  meta: {
    sideEffect: 'exec',
    permission: 'workspace-exec',
    requiresConfirmation: true,
    riskLevel: 'high'
  },
  handler: shellTool
})
```

---

## 四、调试和安全：shell 工具最容易出事故的地方

### 4.1 必做控制

1. **命令白名单**：只允许已知命令
2. **参数白名单**：命令参数也要限制
3. **cwd 限制**：只能在 workspace 内执行
4. **超时回收**：防止卡住
5. **输出截断**：防止上下文被日志淹没
6. **环境清洗**：不要把敏感变量随便暴露给子进程

### 4.2 常见错误怎么判断

- `Command not found`：通常是 PATH 配置或者白名单命令名写错
- `Exit code != 0`：先看 `stderr`，再看是不是测试本身失败
- `Timed out`：优先怀疑命令本身太慢，不要先改模型
- 输出太多：说明这个命令不适合直接喂给模型，应该换成更窄的命令

### 4.3 安全建议

shell 工具不应该默认开放给所有 Agent。

更合理的做法是：

- 低风险 Agent 只能读文件
- 中风险 Agent 可以写入指定目录
- 高风险 Agent 才能申请 shell 执行

这不是“保守”，而是本地自动化系统里最基本的权限分层。

---

## 五、小结

shell 工具是本周最接近“真正自动化”的能力，但它也是最容易越界的能力。真正可用的设计，不是把终端能力一次性全给模型，而是让模型在**白名单、沙箱、超时和审计**的约束下做有限执行。

下一节我们会把这些单个工具串起来，做成一个真正能发现、注册、调用的 MCP registry。
