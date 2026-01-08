import axios from 'axios'

const API_BASE = `http://localhost:${import.meta.env.VITE_SERVER_PORT}/api`

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
})

/**
 * 获取内容结构
 */
export async function fetchContentStructure(refresh = false) {
  const res = await api.get('/content/structure', {
    params: { refresh },
  })
  return res.data
}

/**
 * 获取 Step 详情
 */
export async function fetchStepDetail(weekId, stepId) {
  const res = await api.get(`/content/week/${weekId}/step/${stepId}`)
  return res.data
}

/**
 * 获取代码文件内容
 */
export async function fetchCodeContent(filePath) {
  const res = await api.get('/content/code', {
    params: { path: filePath },
  })
  return res.data.content
}

/**
 * LLM 对话
 */
export async function chatWithLLM(messages, options = {}) {
  const res = await api.post('/llm/chat', {
    messages,
    ...options,
  })
  return res.data
}

export default api
