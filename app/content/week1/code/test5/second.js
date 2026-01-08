import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

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

async function analyzeRequirement(requirement) {
  const prompt = buildRequirementPrompt(requirement)

  console.log('=== 需求分析开始 ===\n')
  console.log('原始需求:')
  console.log(requirement)
  console.log('\n--- 分析结果 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_tokens: 2000,
    stream: true,
  })

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      process.stdout.write(content || '')
    }
  }

  console.log('\n\n=== 分析完成 ===')
}

const testRequirement = `
## 产品需求
开发一个在线购物平台，支持用户注册、登录、浏览商品、添加购物车和下单支付等功能。
`

analyzeRequirement(testRequirement).catch(console.error)
