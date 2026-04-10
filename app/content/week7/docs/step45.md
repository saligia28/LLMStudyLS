# Step 45: MCP 实践｜实现文件写入工具

## 学习目标

这一节要解决的是：**怎样把“写文件”设计成一个可控、可回滚、可审计的 MCP tool**。和读取不同，写入会直接改变本地状态，所以它必须比读操作更严格。

学完这一节，你应该能：

1. 设计一个适合 Agent 调用的 `write_file` schema
2. 理解写入工具为什么要有 `dryRun`、`overwrite`、`backup` 这类开关
3. 用原子写入和备份机制降低损坏风险
4. 看懂“预览 -> 确认 -> 落盘 -> 校验”的安全链路

> **本节主线：** 让模型能改文件，但不能“任性改文件”。

---

## 一、先定原则：写入工具不是简单封装 `fs.writeFile`

### 1.1 写入工具的职责

写入工具主要做四件事：

- 根据路径找到目标文件
- 校验是否允许写入
- 安全落盘，尽量保证原子性
- 返回可审计的结果

这意味着它不仅是一个 I/O 接口，还是一条**状态变更通道**。

### 1.2 为什么要比读取更谨慎

读取失败，通常只是上下文不完整；写入失败，可能导致：

- 项目文件损坏
- 配置覆盖
- 代码语义错误
- 敏感信息泄漏

所以写入工具默认应该是“拒绝更多，放行更少”。

---

## 二、输入输出设计：把风险前置到 schema

### 2.1 推荐输入 schema

```json
{
  "type": "object",
  "properties": {
    "path": { "type": "string" },
    "content": { "type": "string" },
    "encoding": { "type": "string", "enum": ["utf-8"], "default": "utf-8" },
    "overwrite": { "type": "boolean", "default": false },
    "createDirectories": { "type": "boolean", "default": true },
    "backup": { "type": "boolean", "default": true },
    "dryRun": { "type": "boolean", "default": false }
  },
  "required": ["path", "content"]
}
```

几个关键设计点：

- `overwrite` 默认关闭，避免覆盖已有文件
- `backup` 默认开启，方便回滚
- `dryRun` 用来预览结果，不真正落盘
- 只允许明确的文本编码，避免把写入工具变成二进制搬运器

### 2.2 推荐输出结构

```json
{
  "ok": true,
  "path": "src/demo.js",
  "absPath": "/workspace/src/demo.js",
  "action": "written",
  "bytesWritten": 421,
  "backupPath": "/workspace/src/demo.js.bak",
  "meta": {
    "dryRun": false,
    "overwritten": true,
    "checksum": "..."
  }
}
```

如果是 `dryRun`，输出应该明确告诉模型“没有真的改”：

```json
{
  "ok": true,
  "action": "preview",
  "meta": {
    "dryRun": true,
    "wouldWriteBytes": 421
  }
}
```

---

## 三、代码实现：原子写入、备份和路径保护

### 3.1 一个安全的最小实现

```js
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export async function writeFileTool(input, context) {
  const root = context.workspaceRoot
  const absPath = path.resolve(root, input.path)

  if (!absPath.startsWith(root + path.sep)) {
    throw new Error('Path outside workspace is not allowed')
  }

  if (input.dryRun) {
    return {
      ok: true,
      action: 'preview',
      path: input.path,
      absPath,
      meta: { dryRun: true, wouldWriteBytes: Buffer.byteLength(input.content, 'utf-8') }
    }
  }

  const exists = await fs
    .access(absPath)
    .then(() => true)
    .catch(() => false)

  if (exists && !input.overwrite) {
    throw new Error('File exists and overwrite is disabled')
  }

  await fs.mkdir(path.dirname(absPath), { recursive: !!input.createDirectories })

  const tempPath = `${absPath}.tmp-${Date.now()}`
  const backupPath = exists && input.backup ? `${absPath}.bak` : null

  if (backupPath) {
    await fs.copyFile(absPath, backupPath)
  }

  await fs.writeFile(tempPath, input.content, input.encoding ?? 'utf-8')
  await fs.rename(tempPath, absPath)

  return {
    ok: true,
    path: input.path,
    absPath,
    action: exists ? 'overwritten' : 'created',
    bytesWritten: Buffer.byteLength(input.content, 'utf-8'),
    backupPath,
    meta: {
      checksum: crypto.createHash('sha256').update(input.content).digest('hex')
    }
  }
}
```

### 3.2 tool definition 里要标明副作用

```js
registry.register({
  name: 'write_file',
  description: 'Write text content to a workspace file safely',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      overwrite: { type: 'boolean' },
      dryRun: { type: 'boolean' }
    },
    required: ['path', 'content']
  },
  meta: {
    sideEffect: 'write',
    permission: 'workspace-write',
    requiresConfirmation: true
  },
  handler: writeFileTool
})
```

`requiresConfirmation: true` 不是装饰字段，它是给 client 和 agent 的“别直接动手”的提示。

---

## 四、调试和安全：写入工具必须有防误伤机制

### 4.1 最重要的四个控制点

1. **路径限制**：只允许 workspace 内写入
2. **覆盖控制**：默认不能覆盖已有文件
3. **备份控制**：修改前先留备份
4. **审计控制**：记录谁写了什么、写到哪里、写了多少

### 4.2 推荐的安全流程

```
Agent 提出修改意图
      ↓
生成 patch 或写入计划
      ↓
客户端预览差异
      ↓
用户或策略确认
      ↓
调用 write_file
      ↓
执行后校验和日志记录
```

这条链路里，**确认不是可选项，而是防止 Agent 失控的关键阀门**。

### 4.3 常见故障

- `overwrite` 没开，导致修改直接被拒绝
- 目录不存在，落盘失败
- 写入后文件格式损坏，通常是内容生成环节出了问题，不一定是 I/O 层
- 备份路径被覆盖，说明备份命名策略不够明确

---

## 五、小结

写入工具的教学重点不是“能写”，而是“能写但不乱写”。真正可上线的本地操作 Agent，必须把写入设计成一个受控操作：

- 有明确输入边界
- 有默认保护
- 有备份和回滚
- 有日志和审计

下一节我们会把另一个高风险能力接进来：shell 命令执行。它比文件写入更危险，因此需要更严格的白名单和沙箱策略。
