# AI-Flow: 多智能体工作流编排系统

> 一个统一的 AI CLI 工具，根据预定义规则自动调度多个 AI 模型协作完成复杂任务。

## 项目愿景

用户只需输入需求，系统自动：
1. **Claude** 分析需求，输出技术方案
2. **Codex** 评审方案可行性
3. **DeepSeek** 实现代码
4. **Codex** 进行代码审查
5. **Gemini** 优化代码风格
6. **Claude** 生成完成报告

全程无需用户干预，最终交付完整结果。

---

## 当前进度

### 已完成 ✅

| 模块 | 描述 | 状态 |
|------|------|------|
| CLI 入口 | `bin/cli.js` - 命令行界面 | ✅ 完成 |
| 配置加载器 | `src/config/loader.js` - YAML 配置解析 | ✅ 完成 |
| 工作流引擎 | `src/core/orchestrator.js` - 状态机执行 | ✅ 完成 |
| Agent 管理器 | `src/core/agent-manager.js` - Agent 实例化 | ✅ 完成 |
| 上下文管理 | `src/core/context.js` - 跨阶段数据传递 | ✅ 完成 |
| OpenAI 兼容 Provider | DeepSeek/GLM 等 API 调用 | ✅ 完成 |
| Anthropic Provider | Claude API 调用 | ✅ 完成 |
| CLI Provider | Codex 等命令行工具桥接 | ✅ 完成 |
| 工作流定义 | `config/workflow.yaml` - 9 阶段流程 | ✅ 完成 |
| Agent 配置 | `config/agents.yaml` - 5 个 Agent | ✅ 完成 |
| Dry-Run 模式 | 预览工作流不实际执行 | ✅ 完成 |

### 待开发 🚧

| 模块 | 描述 | 优先级 |
|------|------|--------|
| 真实 API 调试 | 配置 API Keys 进行端到端测试 | P0 |
| 错误重试机制 | 失败自动重试，智能回退 | P1 |
| 交互式确认 | 关键阶段暂停等待用户确认 | P1 |
| 文件变更预览 | 应用前显示 diff | P1 |
| 执行日志持久化 | 保存完整执行记录 | P2 |
| Web UI | 可视化工作流监控 | P2 |
| MCP Server 集成 | 作为 Claude Code 插件 | P3 |
| 插件系统 | 自定义扩展能力 | P3 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              用户输入                                    │
│        $ ai-flow run "实现用户认证" --doc ./prd.md                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         工作流引擎 (Orchestrator)                        │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                          状态机                                     │ │
│  │                                                                    │ │
│  │   analyze ──→ review_plan ──→ implement ──→ code_review            │ │
│  │      │            │              │              │                  │ │
│  │      │         rejected       blocked      logic_issues            │ │
│  │      │            │              │              │                  │ │
│  │      └────────────┘              │         fix_logic ──┐           │ │
│  │                                  │              ▲      │           │ │
│  │                                  │              └──────┘           │ │
│  │                                  │                                 │ │
│  │                                  ▼                                 │ │
│  │                           style_check ──→ apply_changes ──→ complete│ │
│  │                                  │                                 │ │
│  │                            style_issues                            │ │
│  │                                  │                                 │ │
│  │                             fix_style ──┘                          │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                       上下文管理器 (Context)                         │ │
│  │  requirement │ document │ technicalSpec │ codeChanges │ ...        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┬───────────────┐
                    ▼               ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │   Claude    │ │   Codex     │ │  DeepSeek   │ │   Gemini    │
            │  规划/总结   │ │  评审/审查   │ │   代码实现   │ │  风格优化   │
            └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 工作流阶段详解

```yaml
阶段 1: analyze (需求分析)
  Agent: Claude (architect)
  输入: 用户需求 + 需求文档
  输出: 技术方案 + 任务拆解
  ↓
阶段 2: review_plan (方案评审)
  Agent: Codex (reviewer)
  输入: 技术方案
  输出: 评审结果 (approved/rejected/needs_revision)
  ↓ approved          ↓ rejected/needs_revision
  │                   └──→ 返回阶段 1 或修订
  ↓
阶段 3: implement (代码实现)
  Agent: DeepSeek (coder)
  输入: 实现计划 + 任务列表
  输出: 代码变更
  ↓
阶段 4: code_review (代码审查)
  Agent: Codex (code_reviewer)
  输入: 代码变更
  输出: 审查结果 (approved/logic_issues/style_issues)
  ↓ approved          ↓ logic_issues    ↓ style_issues
  │                   └──→ fix_logic    └──→ fix_style
  │                        (DeepSeek)        (Gemini)
  │                        └────────────────────┘
  │                                ↓
  │                        返回阶段 4 重新审查
  ↓
阶段 5: style_check (样式检查)
  Agent: Gemini (stylist)
  输入: 最终代码
  输出: 优化后的代码
  ↓
阶段 6: apply_changes (应用变更)
  Agent: System
  动作: 写入文件系统
  ↓
阶段 7: complete (生成报告)
  Agent: Claude (summarizer)
  输出: 完成报告给用户
```

---

## 项目结构

```
ai-flow/
├── bin/
│   └── cli.js                    # CLI 入口点
├── config/
│   ├── agents.yaml               # Agent 配置（模型、角色、Prompt）
│   └── workflow.yaml             # 工作流定义（状态机）
├── src/
│   ├── config/
│   │   └── loader.js             # YAML 配置加载器
│   ├── core/
│   │   ├── orchestrator.js       # 工作流编排引擎
│   │   ├── agent-manager.js      # Agent 实例管理
│   │   └── context.js            # 执行上下文管理
│   └── providers/
│       ├── openai-compatible.js  # OpenAI 兼容 API (DeepSeek/GLM)
│       ├── anthropic.js          # Claude API
│       └── cli.js                # CLI 工具桥接 (Codex)
├── .env.example                  # 环境变量模板
├── package.json
└── README.md                     # 本文档
```

---

## 快速开始

### 1. 安装

```bash
cd ai-flow
npm install
```

### 2. 配置 API Keys

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Claude (规划与总结)
ANTHROPIC_API_KEY=sk-ant-xxx

# DeepSeek (代码实现)
DEEPSEEK_API_KEY=sk-xxx

# Gemini (代码风格优化)
GEMINI_API_KEY=xxx

# GLM (备选)
GLM_API_KEY=xxx
```

### 3. 运行

```bash
# 查看帮助
./bin/cli.js --help

# 查看配置的 Agents
./bin/cli.js agents

# 检查 API 配置
./bin/cli.js check

# Dry-Run 预览
./bin/cli.js run "实现用户登录功能" --dry-run

# 实际执行
./bin/cli.js run "实现用户登录功能" --doc ./requirements.md
```

---

## 命令参考

```bash
ai-flow run <requirement> [options]

参数:
  requirement          需求描述

选项:
  -d, --doc <path>     需求文档路径
  -w, --workflow <n>   工作流名称 (默认: software-development)
  -o, --output <dir>   输出目录 (默认: 当前目录)
  --dry-run            仅预览，不实际执行
  -v, --verbose        详细输出

示例:
  ai-flow run "添加用户注册功能"
  ai-flow run "重构认证模块" --doc ./spec.md --dry-run
  ai-flow run "修复登录 bug" -v
```

---

## 配置说明

### agents.yaml

定义可用的 AI Agent 及其角色：

```yaml
agents:
  claude:
    name: "Claude"
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    baseUrl: "https://api.anthropic.com"
    apiKeyEnv: "ANTHROPIC_API_KEY"
    roles:
      architect:
        description: "分析需求，设计技术方案"
        systemPrompt: |
          你是一个资深软件架构师...
```

### workflow.yaml

定义工作流状态机：

```yaml
stages:
  analyze:
    name: "需求分析"
    agent: "claude"
    role: "architect"
    input:
      - name: "requirement"
        source: "user"
    output:
      - name: "technicalSpec"
    transitions:
      - condition: "output.success"
        next: "review_plan"
```

---

## 扩展指南

### 添加新 Agent

1. 在 `config/agents.yaml` 添加配置
2. 如需新 Provider，在 `src/providers/` 创建
3. 在 `src/core/agent-manager.js` 注册

### 自定义工作流

1. 复制 `config/workflow.yaml`
2. 修改阶段定义和转换条件
3. 使用 `--workflow` 参数指定

### 添加新 Provider

```javascript
// src/providers/custom.js
export class CustomProvider {
  async chat(messages, options) {
    // 实现 API 调用
    return { choices: [{ message: { content: '...' } }] };
  }
}
```

---

## 技术栈

- **运行时**: Node.js 18+
- **CLI 框架**: Commander.js
- **配置格式**: YAML
- **终端美化**: Chalk, Ora
- **API 通信**: Fetch API

---

## 路线图

### Phase 1: MVP (当前)
- [x] 基础 CLI 框架
- [x] 工作流引擎
- [x] 多 Provider 支持
- [x] Dry-Run 模式
- [ ] 端到端测试

### Phase 2: 稳定性
- [ ] 错误重试与回退
- [ ] 执行日志持久化
- [ ] 交互式确认模式
- [ ] 文件变更 Diff 预览

### Phase 3: 增强功能
- [ ] Web UI 监控面板
- [ ] 并行任务执行
- [ ] 自定义工作流模板
- [ ] 项目上下文自动扫描

### Phase 4: 生态集成
- [ ] MCP Server 模式
- [ ] VS Code 扩展
- [ ] 插件系统
- [ ] 团队协作功能

---

## 相关资源

- [LangChain](https://langchain.com/) - LLM 应用框架
- [AutoGen](https://github.com/microsoft/autogen) - 多 Agent 对话
- [CrewAI](https://www.crewai.com/) - 角色化 Agent 协作
- [Dify](https://dify.ai/) - 可视化 Agent 编排

---

## License

MIT

---

*Generated by AI-Flow v0.1.0*
