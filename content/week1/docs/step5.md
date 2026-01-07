# Step 5: Prompt 工程进阶 - 设计可复用的 Prompt 模板

## 学习目标

这个任务的本质是回答一个核心问题：**如何把零散的 Prompt 技巧，升级为可复用、可组合、可维护的工程化模板**。

通过本教程，你将：

1. 理解 Prompt 模板的设计原则和结构化思维
2. 掌握三大类 Prompt 模板：分析类、生成类、代码类
3. 学会根据场景选择和组合模板要素
4. 独立设计 5 个可在实际项目中复用的 Prompt 模板

---

## 一、核心认知：从"写 Prompt"到"设计模板"

### 1.1 为什么需要 Prompt 模板？

```
❌ 错误做法：每次都临时编写 Prompt
✅ 正确做法：建立模板库，根据场景快速组装
```

**模板化的好处：**

| 优势       | 说明                   |
| ---------- | ---------------------- |
| **可复用** | 一次设计，多次使用     |
| **可优化** | 集中改进，全局生效     |
| **可测试** | 标准化输入，可对比效果 |
| **可维护** | 团队共享，知识沉淀     |

### 1.2 Prompt 模板的核心结构

```
┌─────────────────────────────────────────────────────────────┐
│                    Prompt 模板结构                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │    角色     │  → 你是谁？专业背景是什么？                   │
│   │   (Role)    │     例：资深代码审查专家                     │
│   └──────┬──────┘                                           │
│          ↓                                                  │
│   ┌─────────────┐                                           │
│   │    任务     │  → 要完成什么？目标是什么？                    │
│   │   (Task)    │     例：分析代码中的潜在问题                  │
│   └──────┬──────┘                                           │
│          ↓                                                  │
│   ┌─────────────┐                                           │
│   │    约束     │  → 有什么限制？边界在哪？                     │
│   │ (Constraint)│     例：只关注安全性，不修改功能              │
│   └──────┬──────┘                                           │
│          ↓                                                  │
│   ┌─────────────┐                                           │
│   │    格式     │  → 输出什么格式？结构如何？                   │
│   │  (Format)   │     例：JSON 格式，包含问题列表              │
│   └──────┬──────┘                                           │
│          ↓                                                  │
│   ┌─────────────┐                                           │
│   │    示例     │  → 有参考吗？期望输出是什么样？               │
│   │ (Example)   │     例：提供一个分析结果样例                 │
│   └─────────────┘                                           │
│                                                             │
│   记忆口诀：RTCFE（Role-Task-Constraint-Format-Example）      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 三大类 Prompt 模板

| 类型       | 核心目标         | 典型场景                     | 关键要素           |
| ---------- | ---------------- | ---------------------------- | ------------------ |
| **分析类** | 理解、评估、诊断 | 代码审查、需求分析、问题定位 | 分析维度、评估标准 |
| **生成类** | 创造、产出、转化 | 文案写作、文档生成、内容创作 | 风格指南、内容要求 |
| **代码类** | 编写、重构、优化 | 功能实现、代码重构、测试生成 | 技术规范、代码风格 |

### 1.4 衡量标准

> 拿到一个新场景，你能在 2 分钟内选择合适的模板类型，并填充关键要素。

---

## 二、分析类 Prompt 模板

分析类的核心是：**提供清晰的分析框架和评估维度**。

### 2.1 模板一：代码审查模板

#### 模板设计

```javascript
const codeReviewTemplate = {
  name: '代码审查模板',
  type: 'analysis',

  // 模板结构
  template: `
## 角色
你是一位资深的代码审查专家，拥有 10 年以上的软件开发经验。
你擅长发现代码中的潜在问题，并给出具有建设性的改进建议。

## 任务
对以下代码进行全面审查，从多个维度进行分析。

## 分析维度
请从以下 5 个维度进行分析：
1. **功能正确性**：逻辑是否正确，边界情况是否处理
2. **代码质量**：可读性、命名规范、代码结构
3. **性能问题**：是否有明显的性能隐患
4. **安全漏洞**：是否存在安全风险（注入、XSS 等）
5. **最佳实践**：是否符合语言/框架的最佳实践

## 待审查代码
\`\`\`{{language}}
{{code}}
\`\`\`

## 输出格式
请按以下 JSON 格式输出审查结果：
\`\`\`json
{
  "summary": "一句话总结代码质量",
  "score": "1-10 分",
  "issues": [
    {
      "dimension": "分析维度",
      "severity": "high/medium/low",
      "location": "问题位置（行号或函数名）",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "highlights": ["代码中值得肯定的地方"]
}
\`\`\`
`,

  // 变量说明
  variables: {
    language: '编程语言',
    code: '待审查的代码',
  },
}
```

#### 实践：创建代码审查工具

创建 `code-review-tool.js` 文件：

````javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 代码审查 Prompt 模板
 */
function buildCodeReviewPrompt(language, code) {
  return `
## 角色
你是一位资深的代码审查专家，拥有 10 年以上的软件开发经验。
你擅长发现代码中的潜在问题，并给出具有建设性的改进建议。

## 任务
对以下代码进行全面审查，从多个维度进行分析。

## 分析维度
请从以下 5 个维度进行分析：
1. **功能正确性**：逻辑是否正确，边界情况是否处理
2. **代码质量**：可读性、命名规范、代码结构
3. **性能问题**：是否有明显的性能隐患
4. **安全漏洞**：是否存在安全风险（注入、XSS 等）
5. **最佳实践**：是否符合语言/框架的最佳实践

## 待审查代码
\`\`\`${language}
${code}
\`\`\`

## 输出格式
请按以下 JSON 格式输出审查结果：
\`\`\`json
{
  "summary": "一句话总结代码质量",
  "score": "1-10 分",
  "issues": [
    {
      "dimension": "分析维度",
      "severity": "high/medium/low",
      "location": "问题位置",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "highlights": ["代码中值得肯定的地方"]
}
\`\`\`
请只输出 JSON，不要有其他内容。
`
}

/**
 * 执行代码审查
 */
async function reviewCode(language, code) {
  const prompt = buildCodeReviewPrompt(language, code)

  console.log('=== 代码审查开始 ===\n')
  console.log('待审查代码:')
  console.log('```' + language)
  console.log(code)
  console.log('```\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个专业的代码审查助手，输出格式为 JSON。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2000,
  })

  const result = response.choices[0].message.content
  console.log('审查结果:')
  console.log(result)

  // 尝试解析 JSON
  try {
    const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      console.log('\n=== 解析后的结构化结果 ===')
      console.log('总结:', parsed.summary)
      console.log('评分:', parsed.score)
      console.log('问题数量:', parsed.issues?.length || 0)
    }
  } catch (e) {
    console.log('\n(JSON 解析跳过)')
  }

  return result
}

// 测试示例
const testCode = `
function getUserData(userId) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  const result = db.query(query);
  return result;
}

function processItems(items) {
  for (var i = 0; i < items.length; i++) {
    console.log(items[i]);
  }
}
`

reviewCode('javascript', testCode).catch(console.error)
````

运行：

```bash
node code-review-tool.js
```

**预期输出**（示例）：

```json
{
  "summary": "代码存在严重的 SQL 注入漏洞和多处代码规范问题",
  "score": "3",
  "issues": [
    {
      "dimension": "安全漏洞",
      "severity": "high",
      "location": "getUserData 函数",
      "description": "直接拼接 SQL 字符串，存在 SQL 注入风险",
      "suggestion": "使用参数化查询或 ORM"
    },
    {
      "dimension": "最佳实践",
      "severity": "medium",
      "location": "processItems 函数",
      "description": "使用 var 声明变量",
      "suggestion": "使用 let 或 const 替代 var"
    }
  ],
  "highlights": ["函数命名清晰"]
}
```

### 2.2 模板二：需求分析模板

#### 模板设计

```javascript
const requirementAnalysisTemplate = {
  name: '需求分析模板',
  type: 'analysis',

  template: `
## 角色
你是一位经验丰富的产品经理和需求分析师。
你擅长从模糊的需求描述中提取关键信息，并识别潜在的风险和遗漏。

## 任务
分析以下需求描述，提供结构化的需求分析报告。

## 原始需求
{{requirement}}

## 分析框架
请从以下方面进行分析：

### 1. 需求拆解
- 核心功能点
- 非功能性需求（性能、安全、可用性）
- 隐含需求

### 2. 用户故事
为主要功能编写用户故事（As a... I want... So that...）

### 3. 边界与约束
- 范围边界：什么不做
- 技术约束：有什么限制
- 业务约束：有什么规则

### 4. 风险识别
- 技术风险
- 业务风险
- 资源风险

### 5. 待澄清问题
列出需要与需求方确认的问题

## 输出格式
使用 Markdown 格式输出，每个分析部分使用二级标题。
`,
}
```

#### 实践：创建需求分析工具

创建 `requirement-analyzer.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 需求分析 Prompt 模板
 */
function buildRequirementPrompt(requirement) {
  return `
## 角色
你是一位经验丰富的产品经理和需求分析师。
你擅长从模糊的需求描述中提取关键信息，并识别潜在的风险和遗漏。

## 任务
分析以下需求描述，提供结构化的需求分析报告。

## 原始需求
${requirement}

## 分析框架
请从以下方面进行分析：

### 1. 需求拆解
- 核心功能点（列出 3-5 个）
- 非功能性需求（性能、安全、可用性）
- 隐含需求（用户没说但必须有的）

### 2. 用户故事
为主要功能编写 2-3 个用户故事：
格式：作为【角色】，我想要【功能】，以便【价值】

### 3. 边界与约束
- 范围边界：明确什么不做
- 技术约束：可能的技术限制
- 业务约束：业务规则

### 4. 风险识别
| 风险类型 | 具体风险 | 影响程度 | 缓解措施 |
|----------|----------|----------|----------|

### 5. 待澄清问题
列出 3-5 个需要与需求方确认的关键问题

## 输出要求
- 使用 Markdown 格式
- 每个部分简洁明了
- 重点突出，避免废话
`
}

/**
 * 执行需求分析
 */
async function analyzeRequirement(requirement) {
  const prompt = buildRequirementPrompt(requirement)

  console.log('=== 需求分析开始 ===\n')
  console.log('原始需求:')
  console.log(requirement)
  console.log('\n--- 分析结果 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    stream: true,
  })

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)
    }
  }

  console.log('\n\n=== 分析完成 ===')
}

// 测试示例
const testRequirement = `
我们需要做一个用户登录功能。
用户可以用手机号或邮箱登录，要支持记住密码。
登录成功后跳转到首页。
`

analyzeRequirement(testRequirement).catch(console.error)
```

运行：

```bash
node requirement-analyzer.js
```

### 2.3 分析类模板设计要点

```
┌─────────────────────────────────────────────────────────────┐
│               分析类模板的关键要素                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 明确的分析框架                                          │
│      - 告诉模型从哪些维度分析                                 │
│      - 提供评估标准和等级                                     │
│      - 示例：5 个分析维度、风险等级定义                        │
│                                                             │
│   2. 结构化的输出格式                                         │
│      - 表格、列表、JSON 都是好选择                            │
│      - 便于后续程序处理                                       │
│      - 示例：JSON schema、Markdown 模板                      │
│                                                             │
│   3. 专业的角色设定                                           │
│      - 领域专家身份提升输出质量                                │
│      - 提供分析的权威性和专业性                                │
│      - 示例：资深架构师、安全专家                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 三、生成类 Prompt 模板

生成类的核心是：**明确的风格指南和内容结构**。

### 3.1 模板三：技术文档生成模板

#### 模板设计

```javascript
const techDocTemplate = {
  name: '技术文档生成模板',
  type: 'generation',

  template: `
## 角色
你是一位技术文档专家，擅长编写清晰、准确、易于理解的技术文档。
你遵循"好的文档是最好的用户体验"的理念。

## 任务
根据提供的信息，生成一份专业的技术文档。

## 文档信息
- 文档类型：{{docType}}
- 目标读者：{{audience}}
- 核心内容：{{content}}

## 写作风格
- 语言：简洁专业，避免冗余
- 结构：层次分明，逻辑清晰
- 示例：关键概念配合代码示例
- 语气：{{tone}}

## 文档结构
根据文档类型，自动选择合适的结构：

### API 文档结构
1. 概述
2. 快速开始
3. API 参考（每个接口包含：描述、参数、返回值、示例）
4. 错误码
5. 最佳实践

### 使用指南结构
1. 简介
2. 安装/配置
3. 基本用法
4. 高级用法
5. 常见问题

### README 结构
1. 项目简介
2. 特性列表
3. 快速开始
4. 使用示例
5. 配置说明
6. 贡献指南

## 输出要求
- 使用 Markdown 格式
- 代码块标注语言类型
- 关键信息使用适当的强调
- 提供可运行的示例代码
`,
}
```

#### 实践：创建文档生成工具

创建 `doc-generator.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 技术文档生成 Prompt 模板
 */
function buildDocPrompt(options) {
  const { docType, audience, content, tone = '专业友好' } = options

  return `
## 角色
你是一位技术文档专家，擅长编写清晰、准确、易于理解的技术文档。

## 任务
根据提供的信息，生成一份专业的技术文档。

## 文档信息
- 文档类型：${docType}
- 目标读者：${audience}
- 核心内容：${content}

## 写作风格
- 语言：简洁专业，避免冗余
- 结构：层次分明，逻辑清晰
- 示例：关键概念配合代码示例
- 语气：${tone}

## 文档结构参考

### 如果是 API 文档
1. 概述（一句话说明用途）
2. 快速开始（30 秒上手）
3. API 参考
4. 错误处理
5. 示例代码

### 如果是使用指南
1. 简介
2. 安装配置
3. 基本用法
4. 进阶用法
5. FAQ

### 如果是 README
1. 项目一句话介绍
2. 特性亮点（3-5 个）
3. 快速开始
4. 配置说明
5. 示例

## 输出要求
- 使用 Markdown 格式
- 代码块标注语言
- 关键术语加粗
- 每个代码示例都要可运行
`
}

/**
 * 生成技术文档
 */
async function generateDoc(options) {
  const prompt = buildDocPrompt(options)

  console.log('=== 文档生成开始 ===\n')
  console.log(`类型: ${options.docType}`)
  console.log(`读者: ${options.audience}`)
  console.log(`内容: ${options.content.slice(0, 50)}...`)
  console.log('\n--- 生成的文档 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 3000,
    stream: true,
  })

  let fullContent = ''
  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)
      fullContent += content
    }
  }

  console.log('\n\n=== 生成完成 ===')
  return fullContent
}

// 测试示例
generateDoc({
  docType: 'API 文档',
  audience: '前端开发者',
  content: `
    一个用户认证 API：
    - POST /api/login：用户登录，参数为 email 和 password
    - POST /api/register：用户注册，参数为 email、password、name
    - GET /api/profile：获取当前用户信息，需要 JWT token
    - POST /api/logout：用户登出
  `,
  tone: '专业友好',
}).catch(console.error)
```

运行：

```bash
node doc-generator.js
```

### 3.2 模板四：内容改写模板

#### 模板设计

这个模板用于将内容改写为不同的风格和形式。

创建 `content-rewriter.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 内容改写 Prompt 模板
 */
function buildRewritePrompt(options) {
  const { originalContent, targetStyle, targetLength, keepElements } = options

  // 风格描述映射
  const styleDescriptions = {
    professional: '专业正式：使用行业术语，结构严谨，语气权威',
    casual: '轻松随意：口语化表达，亲切友好，适当使用比喻',
    academic: '学术风格：逻辑严密，引用规范，客观中立',
    marketing: '营销风格：突出卖点，情感诉求，行动号召',
    technical: '技术风格：精确简洁，代码示例，步骤清晰',
    storytelling: '叙事风格：故事开场，情节推进，引人入胜',
  }

  const lengthDescriptions = {
    shorter: '压缩至原文的 50% 左右，保留核心信息',
    same: '保持与原文相近的长度',
    longer: '扩展至原文的 150-200%，增加细节和例子',
    tweet: '压缩至 280 字符以内，适合社交媒体',
    summary: '提炼为 3-5 句话的摘要',
  }

  return `
## 角色
你是一位专业的内容编辑，擅长在保持原意的前提下改写内容。

## 任务
将以下内容改写为指定的风格和长度。

## 原始内容
${originalContent}

## 改写要求

### 目标风格
${styleDescriptions[targetStyle] || targetStyle}

### 目标长度
${lengthDescriptions[targetLength] || targetLength}

### 必须保留的元素
${keepElements ? keepElements.map(e => `- ${e}`).join('\n') : '- 核心观点和关键信息'}

## 改写原则
1. **保持原意**：不要添加原文没有的信息
2. **风格统一**：全文保持一致的语气和风格
3. **自然流畅**：读起来像原创，不是机械翻译
4. **适应场景**：考虑目标读者的阅读习惯

## 输出格式
直接输出改写后的内容，不需要解释说明。
`
}

/**
 * 改写内容
 */
async function rewriteContent(options) {
  const prompt = buildRewritePrompt(options)

  console.log('=== 内容改写 ===\n')
  console.log('原文:')
  console.log(options.originalContent)
  console.log('\n目标风格:', options.targetStyle)
  console.log('目标长度:', options.targetLength)
  console.log('\n--- 改写结果 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2000,
    stream: true,
  })

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)
    }
  }

  console.log('\n')
}

// 测试：同一内容改写为不同风格
const originalContent = `
闭包是 JavaScript 中一个重要的概念。当一个函数能够访问其词法作用域中的变量，
即使该函数在其词法作用域之外执行时，就形成了闭包。闭包常用于数据封装、
创建私有变量、以及在异步编程中保持状态。
`

async function demo() {
  // 改写为营销风格
  await rewriteContent({
    originalContent,
    targetStyle: 'marketing',
    targetLength: 'same',
    keepElements: ['闭包的定义', '闭包的用途'],
  })

  console.log('---\n')

  // 改写为推文
  await rewriteContent({
    originalContent,
    targetStyle: 'casual',
    targetLength: 'tweet',
    keepElements: ['核心概念'],
  })
}

demo().catch(console.error)
```

运行：

```bash
node content-rewriter.js
```

### 3.3 生成类模板设计要点

```
┌─────────────────────────────────────────────────────────────┐
│               生成类模板的关键要素                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 明确的风格指南                                           │
│      - 语气（正式/轻松/权威/友好）                              │
│      - 用词（专业术语/日常用语）                                │
│      - 结构（长句/短句/列表/段落）                              │
│                                                             │
│   2. 清晰的内容结构                                           │
│      - 提供模板或大纲                                         │
│      - 指定必要的组成部分                                      │
│      - 示例：文档结构、文章框架                                 │
│                                                             │
│   3. 受众适配                                                │
│      - 明确目标读者                                           │
│      - 调整复杂度和专业程度                                    │
│      - 示例：面向开发者 vs 面向普通用户                          │
│                                                             │
│   4. 质量标准                                                │
│      - 原创性要求                                            │
│      - 准确性要求                                            │
│      - 长度和格式要求                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 四、代码类 Prompt 模板

代码类的核心是：**明确的技术规范和代码风格**。

### 4.1 模板五：代码生成模板

#### 模板设计

这是一个功能强大的代码生成模板，支持多种场景。

创建 `code-generator.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 代码生成 Prompt 模板
 */
function buildCodeGenPrompt(options) {
  const {
    task,
    language,
    framework = '',
    codeStyle = 'standard',
    includeTests = false,
    includeComments = true,
    existingCode = '',
  } = options

  // 代码风格描述
  const styleGuides = {
    standard: '遵循语言的官方风格指南',
    google: '遵循 Google 代码风格指南',
    airbnb: '遵循 Airbnb 代码风格指南（JavaScript）',
    pep8: '遵循 PEP 8 风格指南（Python）',
    minimal: '极简风格，减少冗余代码',
  }

  return `
## 角色
你是一位高级软件工程师，擅长编写高质量、可维护的代码。
你遵循 SOLID 原则和 Clean Code 理念。

## 任务
根据以下需求编写代码。

## 需求描述
${task}

## 技术要求
- **编程语言**：${language}
${framework ? `- **框架/库**：${framework}` : ''}
- **代码风格**：${styleGuides[codeStyle] || codeStyle}
- **包含注释**：${includeComments ? '是，关键逻辑需要注释' : '否，代码应自解释'}
- **包含测试**：${includeTests ? '是，需要单元测试' : '否'}

${
  existingCode
    ? `
## 现有代码（需要与之集成）
\`\`\`${language}
${existingCode}
\`\`\`
`
    : ''
}

## 代码规范
1. **命名规范**
   - 变量和函数：使用有意义的名称
   - 常量：大写字母和下划线
   - 类名：PascalCase

2. **结构规范**
   - 单一职责：每个函数只做一件事
   - 适度抽象：避免过度工程
   - 错误处理：合理处理异常情况

3. **质量要求**
   - 无明显的安全漏洞
   - 考虑边界情况
   - 代码可测试

## 输出格式
\`\`\`${language}
// 你的代码
\`\`\`

${
  includeTests
    ? `
测试代码：
\`\`\`${language}
// 测试代码
\`\`\`
`
    : ''
}

如有必要，可以在代码后简要说明设计决策。
`
}

/**
 * 生成代码
 */
async function generateCode(options) {
  const prompt = buildCodeGenPrompt(options)

  console.log('=== 代码生成 ===\n')
  console.log('任务:', options.task)
  console.log('语言:', options.language)
  console.log('框架:', options.framework || '无')
  console.log('\n--- 生成的代码 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的代码生成助手，只输出高质量、可直接运行的代码。',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 3000,
    stream: true,
  })

  let fullCode = ''
  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)
      fullCode += content
    }
  }

  console.log('\n\n=== 生成完成 ===')
  return fullCode
}

// 测试示例 1：基础功能
async function demo1() {
  console.log('\n========== 示例 1: 基础功能 ==========\n')
  await generateCode({
    task: '实现一个 LRU (Least Recently Used) 缓存，支持 get 和 put 操作，时间复杂度要求 O(1)',
    language: 'javascript',
    codeStyle: 'standard',
    includeTests: true,
    includeComments: true,
  })
}

// 测试示例 2：框架集成
async function demo2() {
  console.log('\n========== 示例 2: React 组件 ==========\n')
  await generateCode({
    task: '创建一个可复用的 Pagination 分页组件，支持页码显示、上一页/下一页、跳转到指定页',
    language: 'typescript',
    framework: 'React + Tailwind CSS',
    codeStyle: 'airbnb',
    includeComments: true,
  })
}

// 测试示例 3：基于现有代码扩展
async function demo3() {
  console.log('\n========== 示例 3: 扩展现有代码 ==========\n')
  await generateCode({
    task: '为现有的 User 类添加邮箱验证和密码强度检查功能',
    language: 'javascript',
    existingCode: `
class User {
  constructor(email, password) {
    this.email = email;
    this.password = password;
  }

  save() {
    // 保存到数据库
    console.log('User saved');
  }
}
    `,
    includeTests: true,
  })
}

// 运行示例
demo1().catch(console.error)
// 可以取消注释运行其他示例
// demo2().catch(console.error)
// demo3().catch(console.error)
```

运行：

```bash
node code-generator.js
```

### 4.2 代码类模板的变体

根据不同场景，代码生成模板可以有多种变体：

```
┌─────────────────────────────────────────────────────────────┐
│               代码类模板变体                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐                                           │
│   │  功能实现   │  → 从需求生成完整功能代码                    │
│   └─────────────┘     适用：新功能开发                        │
│                                                             │
│   ┌─────────────┐                                           │
│   │  代码重构   │  → 改进现有代码结构和质量                    │
│   └─────────────┘     适用：技术债务清理                      │
│                                                             │
│   ┌─────────────┐                                           │
│   │  Bug 修复   │  → 分析并修复代码问题                       │
│   └─────────────┘     适用：问题排查                         │
│                                                             │
│   ┌─────────────┐                                           │
│   │  测试生成   │  → 为代码生成测试用例                       │
│   └─────────────┘     适用：提高测试覆盖率                    │
│                                                             │
│   ┌─────────────┐                                           │
│   │  代码转换   │  → 语言/框架迁移                           │
│   └─────────────┘     适用：技术栈升级                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 代码类模板设计要点

```
┌─────────────────────────────────────────────────────────────┐
│               代码类模板的关键要素                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 明确的技术栈                                            │
│      - 编程语言和版本                                        │
│      - 框架和库                                              │
│      - 运行环境                                              │
│                                                             │
│   2. 代码风格规范                                            │
│      - 命名约定                                              │
│      - 格式化规则                                            │
│      - 注释要求                                              │
│                                                             │
│   3. 质量要求                                                │
│      - 是否需要测试                                          │
│      - 是否需要类型定义                                       │
│      - 是否需要错误处理                                       │
│                                                             │
│   4. 上下文信息                                              │
│      - 现有代码（如果是扩展）                                 │
│      - 接口定义（如果需要集成）                               │
│      - 依赖约束                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、综合实践：模板管理系统

### 5.1 创建可复用的模板管理器

创建 `prompt-template-manager.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * Prompt 模板管理器
 * 统一管理和使用各类 Prompt 模板
 */
class PromptTemplateManager {
  constructor() {
    this.templates = new Map()
    this.initBuiltInTemplates()
  }

  /**
   * 初始化内置模板
   */
  initBuiltInTemplates() {
    // 模板 1：代码审查
    this.register('code-review', {
      name: '代码审查',
      type: 'analysis',
      variables: ['language', 'code'],
      template: vars => `
## 角色
你是一位资深代码审查专家。

## 任务
审查以下 ${vars.language} 代码，从功能、质量、安全、性能四个维度分析。

## 代码
\`\`\`${vars.language}
${vars.code}
\`\`\`

## 输出格式（JSON）
{
  "score": "1-10",
  "issues": [{"severity": "high/medium/low", "description": "...", "suggestion": "..."}],
  "summary": "一句话总结"
}
只输出 JSON。
`,
    })

    // 模板 2：需求分析
    this.register('requirement-analysis', {
      name: '需求分析',
      type: 'analysis',
      variables: ['requirement'],
      template: vars => `
## 角色
你是一位资深产品经理。

## 任务
分析以下需求，输出结构化分析报告。

## 需求
${vars.requirement}

## 分析要点
1. 核心功能（3-5 个）
2. 用户故事（2-3 个）
3. 风险点
4. 待确认问题
`,
    })

    // 模板 3：文档生成
    this.register('doc-generation', {
      name: '文档生成',
      type: 'generation',
      variables: ['docType', 'content', 'audience'],
      template: vars => `
## 角色
你是一位技术文档专家。

## 任务
生成一份 ${vars.docType}，面向 ${vars.audience}。

## 内容素材
${vars.content}

## 要求
- Markdown 格式
- 结构清晰
- 包含代码示例
`,
    })

    // 模板 4：内容改写
    this.register('content-rewrite', {
      name: '内容改写',
      type: 'generation',
      variables: ['content', 'style', 'length'],
      template: vars => `
## 任务
将以下内容改写为 ${vars.style} 风格，长度 ${vars.length}。

## 原文
${vars.content}

## 要求
- 保持原意
- 风格一致
- 自然流畅

直接输出改写结果。
`,
    })

    // 模板 5：代码生成
    this.register('code-generation', {
      name: '代码生成',
      type: 'code',
      variables: ['task', 'language', 'framework', 'includeTests'],
      template: vars => `
## 角色
你是一位高级软件工程师。

## 任务
${vars.task}

## 技术要求
- 语言：${vars.language}
${vars.framework ? `- 框架：${vars.framework}` : ''}
- 包含测试：${vars.includeTests ? '是' : '否'}

## 代码规范
- 遵循语言最佳实践
- 适当的错误处理
- 清晰的命名

输出格式：代码块 + 简要说明
`,
    })
  }

  /**
   * 注册新模板
   */
  register(id, templateConfig) {
    this.templates.set(id, templateConfig)
  }

  /**
   * 列出所有模板
   */
  list() {
    const result = []
    for (const [id, config] of this.templates) {
      result.push({
        id,
        name: config.name,
        type: config.type,
        variables: config.variables,
      })
    }
    return result
  }

  /**
   * 使用模板生成 Prompt
   */
  build(templateId, variables) {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`模板 "${templateId}" 不存在`)
    }

    // 检查必要变量
    for (const v of template.variables) {
      if (!(v in variables)) {
        throw new Error(`缺少必要变量: ${v}`)
      }
    }

    return template.template(variables)
  }

  /**
   * 执行模板
   */
  async execute(templateId, variables, options = {}) {
    const prompt = this.build(templateId, variables)

    const response = await client.chat.completions.create({
      model: options.model || 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: options.maxTokens || 2000,
      stream: options.stream !== false,
    })

    if (options.stream !== false) {
      let result = ''
      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          if (options.onChunk) {
            options.onChunk(content)
          }
          result += content
        }
      }
      return result
    } else {
      return response.choices[0].message.content
    }
  }
}

// 演示
async function demo() {
  const manager = new PromptTemplateManager()

  console.log('=== Prompt 模板管理器 ===\n')

  // 列出所有模板
  console.log('可用模板:')
  manager.list().forEach(t => {
    console.log(`  - ${t.id} (${t.type}): ${t.name}`)
    console.log(`    变量: ${t.variables.join(', ')}`)
  })

  console.log('\n--- 执行代码审查模板 ---\n')

  // 执行代码审查
  await manager.execute(
    'code-review',
    {
      language: 'javascript',
      code: `
function add(a, b) {
  return a + b
}
    `.trim(),
    },
    {
      onChunk: chunk => process.stdout.write(chunk),
    }
  )

  console.log('\n\n--- 执行代码生成模板 ---\n')

  // 执行代码生成
  await manager.execute(
    'code-generation',
    {
      task: '实现一个防抖函数 (debounce)',
      language: 'typescript',
      framework: '',
      includeTests: true,
    },
    {
      onChunk: chunk => process.stdout.write(chunk),
    }
  )

  console.log('\n')
}

demo().catch(console.error)
```

运行：

```bash
node prompt-template-manager.js
```

---

## 六、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

### 第一层：模板认知

- [ ] 理解 Prompt 模板的价值（可复用、可优化）
- [ ] 掌握 RTCFE 结构（Role-Task-Constraint-Format-Example）
- [ ] 能区分分析类、生成类、代码类模板的特点

### 第二层：模板实现

- [ ] 实现了代码审查模板并成功运行
- [ ] 实现了需求分析模板并成功运行
- [ ] 实现了文档生成模板并成功运行
- [ ] 实现了内容改写模板并成功运行
- [ ] 实现了代码生成模板并成功运行

### 第三层：模板设计

- [ ] 能根据场景选择合适的模板类型
- [ ] 能识别模板中需要参数化的变量
- [ ] 能设计结构化的输出格式
- [ ] 理解不同模板类型的关键要素

### 综合能力

- [ ] 实现了模板管理器
- [ ] 能为新场景设计自己的模板
- [ ] 能评估和优化模板效果

---

## 七、实践作业

### 作业 1：设计一个"错误诊断"模板（分析类）

**要求**：

- 输入：错误日志、代码片段
- 输出：错误原因、修复建议、预防措施
- 包含错误分类（语法/逻辑/运行时/环境）

### 作业 2：设计一个"Git Commit 消息"模板（生成类）

**要求**：

- 输入：代码变更描述
- 输出：符合 Conventional Commits 规范的提交信息
- 支持不同类型（feat/fix/docs/refactor 等）

### 作业 3：设计一个"API 接口"模板（代码类）

**要求**：

- 输入：接口需求描述
- 输出：完整的 REST API 代码
- 支持指定框架（Express/Koa/Fastify）

---

## 八、常见问题排查

### Q1: 模板输出不稳定

**原因**：缺少明确的格式约束

**解决**：

1. 使用 JSON Schema 定义输出结构
2. 提供完整的输出示例
3. 在 Prompt 末尾强调格式要求

### Q2: 生成内容偏离要求

**原因**：任务描述不够具体

**解决**：

1. 增加具体的约束条件
2. 使用负面示例（"不要..."）
3. 分步骤拆解任务

### Q3: 代码生成不可运行

**原因**：缺少上下文信息

**解决**：

1. 提供完整的技术栈信息
2. 说明运行环境和依赖
3. 要求包含必要的 import 语句

---

## 九、项目文件总结

完成本教程后，你的练习文件应该包括：

```
project/
├── code-review-tool.js          # 代码审查工具
├── requirement-analyzer.js       # 需求分析工具
├── doc-generator.js             # 文档生成工具
├── content-rewriter.js          # 内容改写工具
├── code-generator.js            # 代码生成工具
└── prompt-template-manager.js   # 模板管理器
```

---

## 十、下一步学习方向

完成本节后，你可以深入以下方向：

1. **Prompt 优化技巧**

   - Chain of Thought (思维链)
   - Few-shot Learning (少样本学习)
   - Self-Consistency (自一致性)

2. **模板测试与评估**

   - 建立评估指标
   - A/B 测试不同模板
   - 收集和分析失败案例

3. **模板库建设**

   - 团队模板共享
   - 版本管理
   - 使用数据分析

4. **与 Agent 结合**
   - 动态选择模板
   - 模板组合编排
   - 上下文感知的模板调用

---

**掌握模板设计，就是掌握了与 LLM 高效协作的标准化语言。这是从"调参工程师"到"提示词架构师"的关键一步。**
