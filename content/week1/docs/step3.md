# Step 3: 动手实践 - 实现最小官方 SDK 调用脚本

## 学习目标

通过本教程，你将：
1. 从零开始搭建一个 Node.js 项目
2. 使用官方 OpenAI SDK 调用 DeepSeek API
3. 理解 API 调用的核心代码结构
4. 掌握环境变量管理 API Key 的最佳实践
5. 实现流式输出和多轮对话

---

## 一、准备工作

### 1.1 确认已安装 Node.js

打开终端，运行以下命令检查：

```bash
node -v
```

**预期输出**：显示版本号，如 `v18.17.0` 或更高版本。

如果未安装，请访问 https://nodejs.org 下载安装。

### 1.2 获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com
2. 注册并登录账号
3. 进入 https://platform.deepseek.com/api_keys
4. 点击「创建 API Key」
5. **复制并保存好你的 API Key**（只显示一次）

> 💡 新用户通常有免费额度，可以直接开始实验。

---

## 二、创建项目

### 2.1 创建项目文件夹

```bash
# 创建项目目录
mkdir my-llm-demo
cd my-llm-demo
```

### 2.2 初始化 Node.js 项目

```bash
npm init -y
```

**预期结果**：生成 `package.json` 文件。

### 2.3 配置 ES Module 支持

打开 `package.json`，添加 `"type": "module"` 配置：

```json
{
  "name": "my-llm-demo",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

> 💡 添加 `"type": "module"` 后，可以使用 `import` 语法。

### 2.4 安装依赖

```bash
npm install openai dotenv
```

**安装的包说明**：
- `openai`：OpenAI 官方 SDK，DeepSeek 兼容此 SDK
- `dotenv`：用于加载 `.env` 文件中的环境变量

---

## 三、配置环境变量

### 3.1 创建 .env 文件

在项目根目录创建 `.env` 文件：

```bash
touch .env
```

### 3.2 填写 API Key

编辑 `.env` 文件，填入你的 API Key：

```
DEEPSEEK_API_KEY=sk-你的API-Key
DEEPSEEK_BASEURL=https://api.deepseek.com
```

> ⚠️ **重要**：将 `sk-你的API-Key` 替换为你实际的 API Key。

### 3.3 创建 .gitignore 文件

创建 `.gitignore` 文件，防止 API Key 被提交到代码仓库：

```bash
touch .gitignore
```

编辑 `.gitignore`，添加以下内容：

```
# 环境变量（包含敏感信息）
.env

# 依赖目录
node_modules/
```

> 🔒 **安全提醒**：永远不要将 API Key 硬编码在代码中或提交到 Git。

---

## 四、实现最小 API 调用

### 4.1 创建主文件

创建 `index.js` 文件：

```bash
touch index.js
```

### 4.2 编写代码

将以下代码复制到 `index.js`：

```javascript
// 第一步：导入依赖
import 'dotenv/config'  // 自动加载 .env 文件
import OpenAI from 'openai'

// 第二步：初始化客户端
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,    // 从环境变量读取 API Key
  baseURL: process.env.DEEPSEEK_BASEURL,   // DeepSeek 的 API 地址
})

// 第三步：定义主函数
async function main() {
  console.log('正在调用 API...\n')

  // 第四步：发送请求
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',  // 使用的模型
    messages: [
      {
        role: 'system',
        content: '你是一个有帮助的助手。'
      },
      {
        role: 'user',
        content: '用一句话解释什么是 API？'
      }
    ],
    temperature: 0.7,   // 控制随机性，0-2 之间
    max_tokens: 200     // 限制返回的最大 token 数
  })

  // 第五步：打印结果
  console.log('AI 回复：')
  console.log(response.choices[0].message.content)

  // 第六步：打印 Token 使用统计
  console.log('\n--- Token 使用统计 ---')
  console.log(`输入 tokens: ${response.usage.prompt_tokens}`)
  console.log(`输出 tokens: ${response.usage.completion_tokens}`)
  console.log(`总计 tokens: ${response.usage.total_tokens}`)
}

// 第七步：运行主函数
main().catch(console.error)
```

### 4.3 运行代码

```bash
node index.js
```

**预期输出**：

```
正在调用 API...

AI 回复：
API 是软件之间相互通信和交换数据的标准化接口。

--- Token 使用统计 ---
输入 tokens: 16
输出 tokens: 13
总计 tokens: 29
```

> 🎉 如果看到类似输出，恭喜你！第一个 API 调用成功了！

---

## 五、代码详解

### 5.1 核心结构图解

```
┌─────────────────────────────────────────────────────────────┐
│                      API 调用流程                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   1. 初始化客户端                                             │
│      ┌─────────────────────────────────┐                    │
│      │ const client = new OpenAI({     │                    │
│      │   apiKey: '...',                │                    │
│      │   baseURL: '...'                │                    │
│      │ })                              │                    │
│      └─────────────────────────────────┘                    │
│                         ↓                                   │
│   2. 构造请求                                                │
│      ┌─────────────────────────────────┐                    │
│      │ client.chat.completions.create({│                    │
│      │   model: 'deepseek-chat',       │                    │
│      │   messages: [...],              │                    │
│      │   temperature: 0.7              │                    │
│      │ })                              │                    │
│      └─────────────────────────────────┘                    │
│                         ↓                                   │
│      3. 获取响应                                             │
│      ┌─────────────────────────────────┐                    │
│      │ response.choices[0].message     │                    │
│      │   .content                      │                    │
│      └─────────────────────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 messages 数组说明

```javascript
messages: [
  { role: 'system', content: '...' },   // 系统角色：设定 AI 的行为
  { role: 'user', content: '...' },     // 用户角色：你的问题
  { role: 'assistant', content: '...' } // 助手角色：AI 的回复（多轮对话时使用）
]
```

| 角色 | 作用 | 示例 |
|------|------|------|
| `system` | 定义 AI 的人设和行为规则 | "你是一个专业的前端开发工程师" |
| `user` | 用户的输入/问题 | "请解释什么是闭包？" |
| `assistant` | AI 的回复（用于多轮对话） | "闭包是指..." |

### 5.3 关键参数说明

| 参数 | 类型 | 说明 | 推荐值 |
|------|------|------|--------|
| `model` | string | 使用的模型名称 | `deepseek-chat` |
| `temperature` | number | 控制输出的随机性，越高越有创意 | 0.7（平衡）|
| `max_tokens` | number | 限制输出的最大长度 | 根据需求设置 |
| `stream` | boolean | 是否启用流式输出 | `false`（默认）|

---

## 六、练习任务

### 练习 1：修改 Prompt

修改 `index.js` 中的 messages，尝试以下场景：

**场景 A：让 AI 扮演编程导师**
```javascript
messages: [
  { role: 'system', content: '你是一个耐心的编程导师，善于用简单的语言解释复杂概念。' },
  { role: 'user', content: '请解释什么是变量？' }
]
```

**场景 B：让 AI 扮演翻译专家**
```javascript
messages: [
  { role: 'system', content: '你是一个专业的中英翻译，保持原文风格的同时确保翻译准确流畅。' },
  { role: 'user', content: '请翻译：The quick brown fox jumps over the lazy dog.' }
]
```

**场景 C：让 AI 扮演代码审查专家**
```javascript
messages: [
  { role: 'system', content: '你是一个资深的代码审查专家，能够发现代码中的问题并给出改进建议。' },
  { role: 'user', content: '请审查这段代码：var x = 1; var y = 2; var z = x + y; console.log(z)' }
]
```

### 练习 2：调整 temperature 参数

创建一个新文件 `temperature-test.js`，测试不同 temperature 值的效果：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

const prompt = '用一句话描述夏天的感觉。'
const temperatures = [0.2, 0.7, 1.5]

async function test() {
  for (const temp of temperatures) {
    console.log(`\n=== temperature = ${temp} ===`)

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: temp,
      max_tokens: 100
    })

    console.log(response.choices[0].message.content)
  }
}

test()
```

运行并观察不同 temperature 的输出差异：
```bash
node temperature-test.js
```

---

## 七、进阶实践：流式输出

### 7.1 什么是流式输出？

普通请求需要等待 AI 生成完整回复才能看到结果，而流式输出可以实时显示生成过程，体验更好。

### 7.2 创建流式输出示例

创建 `stream-demo.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

async function streamChat() {
  console.log('AI 正在回复：\n')

  // 启用流式输出
  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一位科普作家。' },
      { role: 'user', content: '用 100 字介绍人工智能的发展历史。' }
    ],
    temperature: 0.7,
    max_tokens: 300,
    stream: true  // 关键：启用流式输出
  })

  // 逐块接收并打印
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content)  // 不换行打印，实现打字机效果
    }
  }

  console.log('\n\n--- 输出完成 ---')
}

streamChat()
```

运行：
```bash
node stream-demo.js
```

**观察**：文字会像打字一样逐字显示，而不是一次性全部出现。

---

## 八、进阶实践：多轮对话

### 8.1 多轮对话原理

LLM 本身不记忆对话历史，需要每次请求时传入完整的对话记录。

```
第一轮：messages = [system, user1]
第二轮：messages = [system, user1, assistant1, user2]
第三轮：messages = [system, user1, assistant1, user2, assistant2, user3]
```

### 8.2 创建多轮对话示例

创建 `multi-turn.js` 文件：

```javascript
import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 维护对话历史
const messages = [
  { role: 'system', content: '你是一个 JavaScript 编程助手。' }
]

// 发送消息并获取回复
async function chat(userMessage) {
  // 1. 添加用户消息
  messages.push({ role: 'user', content: userMessage })

  // 2. 发送请求（包含完整历史）
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages,
    temperature: 0.7,
    max_tokens: 500
  })

  // 3. 获取回复
  const reply = response.choices[0].message.content

  // 4. 将回复加入历史（重要！）
  messages.push({ role: 'assistant', content: reply })

  return reply
}

// 演示多轮对话
async function main() {
  console.log('=== 多轮对话演示 ===\n')

  // 第一轮
  console.log('用户: 什么是闭包？')
  const reply1 = await chat('什么是闭包？')
  console.log(`AI: ${reply1}\n`)

  // 第二轮（AI 会记住上文）
  console.log('用户: 给我一个例子')
  const reply2 = await chat('给我一个例子')
  console.log(`AI: ${reply2}\n`)

  // 第三轮
  console.log('用户: 它有什么用？')
  const reply3 = await chat('它有什么用？')
  console.log(`AI: ${reply3}\n`)
}

main()
```

运行：
```bash
node multi-turn.js
```

**观察**：AI 能够理解「它」指的是闭包，说明上下文传递成功。

---

## 九、项目结构总结

完成本教程后，你的项目结构应该如下：

```
my-llm-demo/
├── .env                    # 环境变量（API Key）
├── .gitignore              # Git 忽略配置
├── package.json            # 项目配置
├── package-lock.json       # 依赖锁定
├── node_modules/           # 依赖目录
├── index.js                # 最小 API 调用示例
├── temperature-test.js     # temperature 参数测试
├── stream-demo.js          # 流式输出示例
└── multi-turn.js           # 多轮对话示例
```

---

## 十、常见问题排查

### Q1: 运行报错 `Cannot find module 'openai'`

**原因**：依赖未安装

**解决**：
```bash
npm install openai dotenv
```

### Q2: 报错 `Authentication Error`

**原因**：API Key 错误或未配置

**排查步骤**：
1. 检查 `.env` 文件是否存在
2. 检查 API Key 是否正确复制（无多余空格）
3. 确认 API Key 有效（在 DeepSeek 控制台查看）

### Q3: 报错 `Cannot use import statement outside a module`

**原因**：未配置 ES Module

**解决**：在 `package.json` 中添加：
```json
"type": "module"
```

### Q4: 响应很慢或超时

**原因**：网络问题或请求内容过长

**解决**：
- 检查网络连接
- 减少 `max_tokens` 值
- 使用流式输出提升体验

---

## 十一、学习检查清单

完成以下所有项目，说明你已掌握本节内容：

- [x] 成功创建项目并安装依赖
- [x] 配置了 `.env` 和 `.gitignore`
- [x] 运行 `index.js` 得到 AI 回复
- [x] 理解 messages 数组的三种角色
- [x] 修改过 Prompt 并观察输出变化
- [x] 测试了不同 temperature 的效果
- [x] 实现了流式输出
- [x] 实现了多轮对话

---

## 十二、下一步学习方向

1. **Prompt Engineering 进阶**
   - 学习 step2.md 中的角色、任务、约束结构
   - 尝试设计复杂的多步骤 Prompt

2. **错误处理**
   - 添加 try-catch 处理 API 错误
   - 实现重试机制

3. **实际应用**
   - 构建命令行聊天机器人
   - 实现代码解释器
   - 开发文档翻译工具

---

**🎉 恭喜完成 Step 3！你已经掌握了 LLM API 调用的核心技能。**

记住：**动手实践是最好的学习方式**，多尝试、多修改、多观察！
