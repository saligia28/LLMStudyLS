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

export default server
