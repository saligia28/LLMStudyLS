import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

function buildCodeReviewPrompt(language, code) {
  return `
    ## 角色
    你是一位资深的代码审查专家，拥有10年以上的软件开发经验。
    你擅长发现代码中的潜在问题，并给出具有建设性的改进建议。

    ## 任务
    对以下代码进行全面审查，从多个维度进行分析。

    ## 分析维度
    1. **功能正确性**：逻辑是否正确，边界情况是否处理
    2. **代码质量**：可读性、命名规范、代码结构
    3. **性能问题**：是否有明显的性能隐患
    4. **安全漏洞**：是否存在安全风险（注入、XSS 等）

    ## 待审查代码
    \`\`\`${language}
    ${code}
    \`\`\`

    ## 输出格式
    请按照以下JSON格式输出审查结果：
    \`\`\`json
    {
        "summary": "一句话总结代码质量",
        "score": "1-10分",
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
    请只输出JSON，不要有其他内容。
    `
}

async function reviewCode(language, code) {
  const prompt = buildCodeReviewPrompt(language, code)

  console.log('=== 代码审查开始 === \n')
  console.log('待审查代码：')
  console.log('```' + language)
  console.log(code)
  console.log('```\n')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个专业的代码审查助手，输出格式为JSON。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 2000,
  })

  const result = response.choices[0].message.content
  console.log('审查结果:')
  console.log(result)

  try {
    const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1])
      console.log('\n=== 解析后的结构化结果 ===')
      console.log('总结:', parsed.summary)
      console.log('评分:', parsed.score)
      console.log('问题数量:', parsed.issues?.length || 0)
    }
  } catch (err) {
    console.log('\n(JSON 解析跳过)')
  }

  return result
}

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
