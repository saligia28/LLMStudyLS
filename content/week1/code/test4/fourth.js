import 'dotenv/config'
import OpenAI from 'openai'
import readline from 'readline'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * 完整的对话管理器
 * 支持：历史管理、裁剪、总结、调试
 */
class ConversationManager {
  constructor(config = {}) {
    this.systemPrompt = config.systemPrompt || '你是一个有帮助的助手。'
    this.history = []
    this.maxHistoryTurns = config.maxHistoryTurns || 10
    this.debug = config.debug || false
  }

  /**
   * 构建 messages 数组
   */
  buildMessages(userInput) {
    const messages = []

    messages.push({ role: 'system', content: this.systemPrompt })

    const recentHistory = this.history.slice(-this.maxHistoryTurns * 2)
    messages.push(...recentHistory)

    messages.push({ role: 'user', content: userInput })

    if (this.debug) {
      console.log(`\n [debug] Messages 结构：`)
      messages.forEach((m, i) => {
        const preview = m.content.slice(0, 40) + (m.content.length > 40 ? '...' : '')
        console.log(`  ${i + 1}. [${m.role}  ${preview}]`)
      })
      console.log('')
    }

    return messages
  }

  /**
   * 发送消息并获取回复
   */
  async chat(userInput) {
    const messages = this.buildMessages(userInput)

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages,
      max_tokens: 1000,
      stream: true,
    })

    let fullReply = ''

    for await (const chunk of response) {
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        process.stdout.write(content)
        fullReply += content
      }
    }

    console.log('')

    this.history.push({ role: 'user', content: userInput }, { role: 'assistant', content: fullReply })
  }

  /**
   * 清空历史
   */
  clear() {
    this.history = []
    console.log('[系统] 对话历史已清空！')
  }

  /**
   * 显示历史
   */
  showHistory() {
    console.log(`\n[对话历史]`)
    if (this.history.length === 0) {
      console.log('  (空)  ')
      return
    }

    this.history.forEach((m, i) => {
      const label = m.role === 'user' ? '你' : 'AI'
      console.log(`   ${Math.floor(i / 2) + 1}.  ${label}  ${m.content.slice(0, 50)}...`)
    })

    console.log('')
  }

  /**
   * 修改 system prompt
   */
  setSystemPrompt(prompt) {
    this.systemPrompt = prompt
    console.log('[系统] System prompt 已更新')
  }
}

async function startChat() {
  const manager = new ConversationManager({
    systemPrompt: '你是一个专业的变成助手，回答简洁清晰。',
    maxHistoryTurns: 5,
    debug: false,
  })

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('=== 对话系统启动 ===')
  console.log('命令：/clear 清空历史 ｜ /history 显示历史 ｜ /debug 切换调试 ｜ /quit 退出')
  console.log('')

  const askQuestion = () => {
    rl.question('你：', async input => {
      input = input.trim()

      if (!input) {
        askQuestion()
        return
      }

      if (input.startsWith('/')) {
        switch (input) {
          case '/clear':
            manager.clear()
            break
          case '/history':
            manager.showHistory()
            break
          case '/debug':
            manager.debug = !manager.debug
            console.log(`[系统] 调试模式: ${manager.debug ? '开启' : '关闭'}`)
            break
          case '/quit':
            console.log('再见👋！')
            rl.close()
            return
          default:
            console.log('[系统] 未知命令！')
        }

        askQuestion()
        return
      }

      process.stdout.write('AI：')
      try {
        await manager.chat(input)
      } catch (error) {
        console.log(`\n[错误] ${error.message}`)
      }

      console.log('')
      askQuestion()
    })
  }

  askQuestion()
}

startChat()
