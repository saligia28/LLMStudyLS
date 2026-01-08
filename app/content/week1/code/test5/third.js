import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

function buildDocPrompt(options) {
  const { docType, audience, content, tone = '专业友好' } = options

  return `
    ## 角色
    你是以为技术文档专家，擅长编写清晰、准确、易于理解的基数文档。

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
    2. 快速开始（30秒上手）
    3. API参考
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
    2. 特性亮点（3-5个）
    3. 快速开始
    4. 配置说明
    5. 示例

    ### 输出要求
    - 要求 Markdown 格式
    - 代码块标注语言
    - 关键术语加粗
    - 每个代码示例都要可运行
    `
}

async function generateDoc(options) {
  const prompt = buildDocPrompt(options)

  console.log('=== w文档生成开始 ===\n')
  console.log(`类型: ${options.docType}`)
  console.log(`读者: ${options.audience}`)
  console.log(`内容: ${options.content.slice(0, 50)}...`)
  console.log('\n--- 生成的文档 ---\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
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

generateDoc({
  docType: 'API文档',
  audience: '前端开发者',
  content: `
    一个用户认证API:
    - POST /api/login: 用户登录，参数为email和password
    - POST /api/register: 用户注册，参数为email、password、name
    - GET /api/profile: 获取当前用户信息，需要JWT token
    - POST /api/logout: 用户登出
  `,
  tone: '专业友好',
}).catch(console.error)
