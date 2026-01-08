import OpenAI from 'openai'
import 'dotenv/config'

const apiKey = process.env.DEEPSEEK_API_KEY
const baseURL = process.env.DEEPSEEK_BASEURL

const client = new OpenAI({
  apiKey,
  baseURL,
})

const prompts = [
  '你是一名前端开发者，解释一下闭包的含义',
  '你是一名资深的前端开发，请解释一下闭包的含义',
  '你是一名工作10年的前端开发工程师，拥有丰富的工作经验，请用专业的说法解释一下闭包。',
]

async function main() {
  for (const prompt of prompts) {
    console.log(`\n${'='.repeat(50)}`)
    console.log(`prompt = ${prompt}`)
    console.log(`${'='.repeat(50)}\n`)
    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_completion_tokens: 200,
    })

    console.log(response.choices[0].message.content)
  }
}

main()
