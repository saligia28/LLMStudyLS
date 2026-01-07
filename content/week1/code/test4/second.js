import 'dotenv/config'
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

/**
 * Advanced Message Manager
 * Support multiple trimming strategies and message priorities
 */
class AdvancedMessageManager {
  constructor(options = {}) {
    this.systemPrompt = options.systemPrompt || ''
    this.history = []
    this.maxTokens = options.maxTokens || 4000 // Number of tokens reserved for history
    this.strategy = options.strategy || 'recent' // trimming strategy
  }

  /**
   * Estimating the number of tokens in a message (simplified version; tiktoken should be used in practice)
   * Chinese: approximately 1.5 characters per token English: approximately 4 characters per token
   */
  estimateTokens(content) {
    return Math.ceil(content.length / 2)
  }

  /**
   * Add dialogue round
   */
  addTurn(useMessage, assistantMessage) {
    this.history.push(
      {
        role: 'user',
        content: useMessage,
      },
      {
        role: 'assistant',
        content: assistantMessage,
      }
    )
  }

  /**
   * Tailor history according to strategy
   */
  async trimHistory() {
    switch (this.strategy) {
      case 'recent':
        return this.trimByRecent()
      case 'summary':
        return await this.trimBySummary()
      case 'important':
        return this.trimByImportance()
      default:
        return this.trimByRecent()
    }
  }

  /**
   * Strategy 1: Keep recent conversations
   */
  trimByRecent() {
    const result = []
    let totalTokens = this.estimateTokens(this.systemPrompt)

    // Add from the end until the token limit is reached.
    for (let i = this.history.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens(this.history[i].content)

      if (totalTokens + msgTokens > this.maxTokens) break

      result.unshift(this.history[i])

      totalTokens += msgTokens
    }
    return result
  }

  /**
   * Strategy 2:Summary-based cropping (requires additional API calls)
   */
  async trimBySummary() {
    if (this.history.length <= 4) {
      return [...this.history]
    }

    // Condensing early history into a summary
    const earlyHistory = this.history.slice(0, -4)
    const recentHistory = this.history.slice(-4)

    // Call the API to generate a summary
    const summaryPrompt = `Please summarize the key points of the following conversation in one paragraph:\n${earlyHistory
      .map(m => `${m.role}:${m.content}`)
      .join('\n')}`

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: summaryPrompt }],
      max_tokens: 200,
    })

    const summary = response.choices[0].message.content

    return [{ role: 'system', content: summary }, ...recentHistory]
  }

  /**
   * Strategy 3: Prioritize by Importance (Simplified Version)
   */
  trimByImportance() {
    // Mark messages containing keywords as important
    const keywords = [
      'importance',
      'important',
      'crucial',
      'key',
      'must',
      'caution',
      'attention',
      'question',
      'mistake',
    ]

    const scored = this.history.map((msg, index) => ({
      msg,
      index,
      score: keywords.some(k => msg.content.includes(k)) ? 10 : 1,
      recency: index, // The newer the news, the higher the recency
    }))

    // Comprehensive Score: Importance + Recency
    scored.forEach(item => {
      item.finalScore = item.score + (item.recency / this.history.length) * 5
    })

    // Sort by rating and select the top N
    scored.sort((a, b) => b.finalScore - a.finalScore)
    const selected = scored.slice(0, 10)

    // Return in original order
    selected.sort((a, b) => a.index - b.index)
    return selected.map(item => item.msg)
  }

  /**
   * Construct the final messages
   */
  async build(currentInput) {
    const messages = []

    // 1. System Command
    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt })
    }

    // 2. Edited History
    const trimmedHistory = await this.trimHistory()
    messages.push(...trimmedHistory)

    // 3. Current Input
    messages.push({ role: 'user', content: currentInput })

    return messages
  }

  /**
   * Retrieve statistical information
   */
  getState() {
    return {
      totalMessages: this.history.length,
      estimatedTokens: this.history.reduce((sum, msg) => sum + this.estimateTokens(msg.content), 0),
    }
  }
}

/**
 * DEMO
 */
async function demo() {
  const manager = new AdvancedMessageManager({
    systemPrompt: 'You are a technical consultant.',
    maxTokens: 2000,
    strategy: 'summary',
  })

  // Simulate multi-round conversations
  const conversations = [
    [
      '什么是 React？',
      'React 是一个用于构建用户界面的 JavaScript 库，由 Facebook 推出，核心思想是用组件化的方式构建 UI，并通过状态变化驱动视图更新。',
    ],

    [
      '它和 Vue 有什么区别？',
      'React 和 Vue 的主要区别在于设计理念和使用方式。React 更偏向函数式编程，强调不可变数据和单向数据流；Vue 提供了更完整的框架能力，上手成本相对更低。',
    ],

    [
      '我应该学哪个？',
      '这取决于你的具体需求和背景。如果你更关注大型应用、生态和函数式思维，React 更合适；如果你希望快速上手并提高开发效率，Vue 会是不错的选择。',
    ],

    [
      'React 的核心概念是什么？',
      'React 的核心概念包括组件（Component）、状态（State）、属性（Props）、虚拟 DOM，以及通过状态变化触发视图重新渲染的机制。',
    ],

    [
      '什么是 Hooks？',
      'Hooks 是 React 16.8 引入的特性，它允许你在函数组件中使用状态和生命周期能力，比如 useState、useEffect，从而减少对 class 组件的依赖。',
    ],

    [
      'useEffect 是用来做什么的？',
      'useEffect 用于处理副作用，比如数据请求、订阅、手动操作 DOM 等。它可以模拟 componentDidMount、componentDidUpdate 和 componentWillUnmount 的行为。',
    ],

    [
      'Hooks 会不会让代码更难理解？',
      '在简单场景下 Hooks 通常更直观，但在复杂逻辑中，如果 useEffect 依赖管理不当，确实可能增加理解成本，因此需要良好的拆分和封装习惯。',
    ],

    [
      '什么是受控组件？',
      '受控组件是指表单元素的值由 React 的 state 来控制，用户的输入会触发状态更新，从而保持数据来源的单一性。',
    ],

    [
      'React 为什么要使用虚拟 DOM？',
      '虚拟 DOM 是对真实 DOM 的一种抽象表示，React 通过对比前后两次虚拟 DOM 的差异，最小化真实 DOM 操作，从而提高性能。',
    ],

    [
      'React 适合做大型项目吗？',
      '非常适合。React 的组件化、单向数据流以及成熟的生态（如路由、状态管理方案）使其在大型复杂项目中具有很好的可维护性。',
    ],
  ]

  for (const [user, assistant] of conversations) {
    manager.addTurn(user, assistant)
  }

  console.log('Statistical Information:', manager.getState())

  const message = await manager.build('How to choose between Hooks and class components?')
  console.log(`\nConstructed messages:`)
  message.forEach((m, i) => {
    console.log(`${i + 1}. [${m.role}] ${m.content.slice(0, 50)}...`)
  })
}

demo()
