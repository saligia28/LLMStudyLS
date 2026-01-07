import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

async function analyzeTokenUsage(text) {
  console.log('=== Token 使用分析 ===\n')
  console.log('输入文本:', text)
  console.log('文本长度:', text.length, '字符')

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: text }],
    max_tokens: 100,
  })

  const usage = response.usage
  console.log('\n--- Token 统计 ---')
  console.log('输入 tokens:', usage.prompt_tokens)
  console.log('输出 tokens:', usage.completion_tokens)
  console.log('总计 tokens:', usage.total_tokens)
  console.log('\n字符/Token 比例:', (text.length / usage.prompt_tokens).toFixed(2))

  return usage
}

async function compareLanguageTokens() {
  console.log('\n=== 不同语言的 Token 对比实验 ===\n')

  const testCases = [
    { name: '英文', text: 'Hello, this is a test message for token counting.' },
    { name: '中文', text: '你好，这是一条用于统计 token 的测试消息。' },
    { name: '代码', text: 'function add(a, b) { return a + b; }' },
    { name: '混合', text: '使用 JavaScript 实现 hello world 功能' },
  ]

  const results = []

  for (const testCase of testCases) {
    console.log(`\n--- ${testCase.name} ---`)
    console.log('文本:', testCase.text)

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: testCase.text }],
      max_tokens: 10, // 最小输出，专注于输入 token 统计
    })

    const inputTokens = response.usage.prompt_tokens
    const ratio = (testCase.text.length / inputTokens).toFixed(2)

    console.log(`字符数: ${testCase.text.length}, Token 数: ${inputTokens}, 比例: ${ratio}`)

    results.push({
      name: testCase.name,
      chars: testCase.text.length,
      tokens: inputTokens,
      ratio,
    })
  }

  console.log('\n=== 对比结果汇总 ===')
  console.table(results)
}

async function main() {
  await analyzeTokenUsage('请用一句话解释什么是闭包。')

  await compareLanguageTokens()
}

main().catch(console.error)
