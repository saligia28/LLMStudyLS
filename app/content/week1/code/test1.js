import 'dotenv/config'
import OpenAI from 'openai'

const apiKey = process.env.DEEPSEEK_API_KEY

const client = new OpenAI({
  apiKey,
  baseURL: 'https://api.deepseek.com',
})

async function main() {
  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个专业的AI分析助手。' },
      { role: 'user', content: '请用简洁的语言解释什么是神经网络？' },
    ],
    temperature: 0.7,
    max_completion_tokens: 500,
  })

  console.log(JSON.stringify(response))

  console.log(response.choices[0].message.content)
}

main()
