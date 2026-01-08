import express from 'express'
import OpenAI from 'openai'
import 'dotenv/config'

const router = express.Router()

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASEURL,
})

// 普通对话
router.post('/chat', async (req, res) => {
  try {
    const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = req.body

    const response = client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
    })

    res.json({
      content: response.choices[0].message.content,
      usage: response.usage,
      finishReason: response.choices[0].finish_reason,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 流式对话
router.post('/chat/stream', async (req, res) => {
  try {
    const { messages, model = 'deepseek-chat', temperature = 0.7, max_tokens = 500 } = req.body

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      stream: true,
    })

    for await (const chunk of stream) {
      const content = stream.choices[0]?.delta?.content || ''
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`)
      }

      res.write(`data: [DONE]\n\n`)
      res.end()
    }
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`)
    res.end()
  }
})

export default router
