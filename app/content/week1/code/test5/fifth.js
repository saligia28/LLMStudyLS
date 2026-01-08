import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

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
      { role: 'system', content: '你是一个专业的代码生成助手，只输出高质量、可直接运行的代码。' },
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
demo3().catch(console.error)
