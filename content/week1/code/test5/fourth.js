import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

function buildRewritePrompt(options) {
  const { originalContent, targetStyle, targetLength, keepElements } = options

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
   ${keepElements ? keepElements.map(ele => `- ${ele}`).join('\n') : '- 核心观点和关键信息'}

   ## 改写规则
   1. **保持原意**：不要添加原文没有的信息
   2. **风格统一**：全文保持一致的语气和风格
   3. **自然流畅**：读起来像原创，不是机械翻译
   4. **适应场景**：考虑目标读者的阅读习惯

   ## 输出格式
   直接输出改写后的内容，不需要解释说明。
  `
}

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

const originalContent = `
闭包是 JavaScript 中一个重要的概念。当一个函数能够访问其词法作用域中的变量，
即使该函数在其词法作用域之外执行时，就形成了闭包。闭包常用于数据封装、
创建私有变量、以及在异步编程中保持状态。
`

async function demo() {
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
    targetLength: 'longer',
    keepElements: ['核心概念'],
  })
}

demo().catch(console.error)
