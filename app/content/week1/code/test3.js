import 'dotenv/config'
import OpenAI from 'openai'

const apiKey = process.env.DEEPSEEK_API_KEY
const baseURL = process.env.DEEPSEEK_BASEURL

const client = new OpenAI({
  apiKey,
  baseURL,
})

const messages = [{ role: 'system', content: 'you are a Javascript code assistant.' }]

async function chat(userMessage) {
  messages.push({ role: 'user', content: userMessage })

  const response = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  })

  const reply = response.choices[0].message.content

  messages.push({ role: 'assistant', content: reply })
  return reply
}

async function main() {
  console.log('=== multi-round dialogue demonstration ===\n')

  // first round
  console.log('user:what is closure?')
  const reply1 = await chat('what is closure?')
  console.log(`AI:${reply1}\n`)

  //second round
  console.log('user:give me an example')
  const reply2 = await chat('give me an example')
  console.log(`AI:${reply2}\n`)

  //third round
  console.log("user:what's it for?")
  const reply3 = await chat("what's it for?")
  console.log(`AI:${reply3}\n`)
}

main()
