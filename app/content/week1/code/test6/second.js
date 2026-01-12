import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

async function testMaxTokens(maxTokens) {
  const prompt = '请详细解释什么是机器学习，包括它的定义、主要类型、应用场景和发展趋势。'

  console.log(`\n=== max_tokens: ${maxTokens}  ===\n`)

  const startTime = Date.now()

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
  })

  const endTime = Date.now()
  const content = response.choices[0].message.content
  const finishReason = response.choices[0].finish_reason

  console.log('输出内容:')
  console.log(content)
  console.log('\n--- 统计信息 ---')
  console.log('结束原因:', finishReason) // 'stop' = 自然结束, 'length' = 达到限制被截断
  console.log('输出 tokens:', response.usage.completion_tokens)
  console.log('耗时:', endTime - startTime, 'ms')

  return {
    maxTokens,
    actualTokens: response.usage.completion_tokens,
    finishReason,
    duration: endTime - startTime,
  }
}
async function runExperiment() {
  console.log('============================================')
  console.log('       max_tokens 参数对比实验')
  console.log('============================================')
  console.log('\n提示词: "请详细解释什么是机器学习..."')

  const testValues = [50, 200, 500, 1000]
  const results = []

  for (const value of testValues) {
    const result = await testMaxTokens(value)
    results.push(result)
    console.log('\n' + '─'.repeat(50))
  }

  console.log('\n=== 实验结果汇总 ===')
  console.table(results)

  console.log('\n关键发现:')
  for (const result of results) {
    if (result.finishReason === 'length') {
      console.log(`- max_tokens=${result.maxTokens}: 输出被截断（达到限制）`)
    } else {
      console.log(`- max_tokens=${result.maxTokens}: 输出完整（自然结束）`)
    }
  }
}

runExperiment().catch(console.error)
