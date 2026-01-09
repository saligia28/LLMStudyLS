import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import contentRouter from './routes/content.js'
import llmRouter from './routes/llm.js'

const app = new express()
const PORT = process.env.SERVER_PORT || 3001

app.use(cors())
app.use(express.json())

app.use('/api/content', contentRouter)
app.use('/api/llm', llmRouter)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const server = createServer(app)

server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})

// 优雅退出处理
const gracefulShutdown = (signal) => {
  console.log(`\n收到 ${signal} 信号，正在关闭服务器...`)
  server.close(() => {
    console.log('服务器已关闭')
    process.exit(0)
  })

  // 如果 5 秒内未能关闭，强制退出
  setTimeout(() => {
    console.log('强制关闭服务器')
    process.exit(1)
  }, 5000)
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

export default server
