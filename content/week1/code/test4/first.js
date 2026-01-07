import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})
/**
 * Message Constructor Class
 * Responsible for managing and constructing the array of messages
 * sent to LLM
 */
class MessageBuilder {
  constructor(systemPrompt) {
    // System Prompt:Long-term,unchanging instructions
    this.systemPrompt = systemPrompt
    // Conversation History:Trimmable History
    this.history = []
    // Maximum historical length(to prevent token overflow)
    this.maxHistoryLength = 10
  }

  /**
   * Add user messages to history
   */
  addUserMessage(content) {
    this.history.push({ role: 'user', content })
  }

  /**
   * Add assistant messages to history
   */
  addAssistantMessage(content) {
    this.history.push({ role: 'assistant', content })
  }

  /**
   * Construct a complete messages array
   */
  build(currentInput) {
    const message = []

    if (this.systemPrompt) {
      message.push({ role: 'system', content: this.systemPrompt })
    }

    const historyToInclude = this.getRecentHistory()
    message.push(...historyToInclude)

    message.push({ role: 'user', content: currentInput })

    return message
  }

  /**
   * Retrieve recent history(trimming policy)
   */
  getRecentHistory() {
    // Simple strategy: Retain the most recent N entries
    if (this.history.length <= this.maxHistoryLength) {
      return [...this.history]
    }
    return this.history.slice(-this.maxHistoryLength)
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = []
  }

  /**
   * Get the current history length
   */
  getHistoryLength() {
    return this.history.length
  }
}

async function demo() {
  const builder = new MessageBuilder(
    'You are a professional Javascript assistant,providing concise and expert answers.'
  )

  console.log('=== Message Constructor Demonstration ===\n')

  // first found of dialogue
  const messages1 = builder.build('what is closure?')
  console.log('first round messages:')
  console.log(JSON.stringify(messages1, null, 2))

  const response1 = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: messages1,
    max_tokens: 200,
  })

  const reply1 = response1.choices[0].message.content

  // Save conversation history
  builder.addUserMessage('what is closure?')
  builder.addAssistantMessage(reply1)

  console.log('\nAI answer:', reply1)

  // second round of dialogue(include history)
  console.log('\n--- second round ---')
  const message2 = builder.build('give me an example.')
  console.log('\nsecond round messages length:', message2.length)
  console.log('include role:', message2.map(m => m.role).join('→'))

  const response2 = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: message2,
  })

  console.log('\nAI answer:', response2.choices[0].message.content)
}

demo().catch(console.error)
