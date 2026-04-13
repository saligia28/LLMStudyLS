# Step 79: 应用落地｜后端接收文件 → chunk

## 学习目标

上一节把上传 UI 做完了。这一节来做 Express 后端：接收文件、读取内容、调用 chunking 工具，最后把 chunk 预览返回给前端。

完成后你应该能：

1. 用 multer 在 Express 中处理 `multipart/form-data` 文件上传
2. 按文件类型（txt、md、json）分别读取并预处理内容
3. 复用 Week 10 的 chunking 工具生成 chunk 数组
4. 把 chunk 数量、预览和元数据作为 JSON 响应返回前端

> 后端文件处理是 RAG 入库链路的第一个节点。这一步的质量直接决定后续 embedding 的原料质量。

---

## 一、请求流程

```text
前端 FormData
  └── POST /api/upload
        │
        ├── multer 解析 multipart
        │     └── 文件临时写入 uploads/ 目录
        │
        ├── 读取文件内容（utf-8）
        │
        ├── 按类型预处理
        │     ├── .txt  → 直接读取
        │     ├── .md   → 可选去掉 frontmatter
        │     └── .json → 提取 text 字段或 JSON.stringify
        │
        ├── chunking（来自 Week 10 工具）
        │
        └── 返回 JSON { ok, filename, chunkCount, preview }
```

---

## 二、安装依赖

```bash
cd app
npm install multer
```

multer 是 Express 生态中最常用的 multipart 解析中间件，零配置即可使用。

---

## 三、multer 配置

### 3.1 基础配置

```js
// server/middleware/upload.js
import multer from 'multer'
import path from 'path'
import fs from 'fs'

// 确保临时上传目录存在
const UPLOAD_DIR = './uploads'
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR)
  },
  filename: (req, file, cb) => {
    // 保留原始文件名，加时间戳避免冲突
    const ext  = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext)
    const safe = base.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_')
    cb(null, `${safe}_${Date.now()}${ext}`)
  }
})

// 文件过滤：只接受允许的类型
const ALLOWED_MIMES = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'application/octet-stream' // 部分系统 .md 文件以此类型上传
])

const ALLOWED_EXTS = new Set(['.txt', '.md', '.json'])

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase()

  if (ALLOWED_EXTS.has(ext)) {
    cb(null, true)
  } else {
    cb(new Error(`不支持的文件类型：${ext}`), false)
  }
}

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 10                   // 单次最多 10 个文件
  }
})
```

### 3.2 为什么用 diskStorage 而不是 memoryStorage

| 策略 | 优点 | 缺点 |
|------|------|------|
| `memoryStorage` | 读写快，无磁盘 IO | 大文件会撑爆内存 |
| `diskStorage` | 内存占用低，支持大文件 | 需要手动清理临时文件 |

在真实产品中，文件大小不可控，优先使用 `diskStorage`。处理完成后记得删除临时文件。

---

## 四、文件内容读取与预处理

### 4.1 按文件类型分发处理

```js
// server/services/document-reader.js
import fs from 'fs/promises'
import path from 'path'

/**
 * 读取文件并返回纯文本内容
 * @param {string} filePath - 文件绝对路径
 * @param {string} originalName - 原始文件名（用于判断扩展名）
 * @returns {Promise<string>}
 */
export async function readDocument(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase()
  const raw = await fs.readFile(filePath, 'utf-8')

  switch (ext) {
    case '.txt':
      return cleanText(raw)

    case '.md':
      return cleanMarkdown(raw)

    case '.json':
      return extractFromJson(raw)

    default:
      throw new Error(`不支持的扩展名：${ext}`)
  }
}

/** 清理普通文本：去掉多余空行和行尾空格 */
function cleanText(text) {
  return text
    .split('\n')
    .map(line => line.trimEnd())
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n')
    .trim()
}

/** Markdown 预处理：去掉 YAML frontmatter */
function cleanMarkdown(md) {
  // 去掉 --- frontmatter ---
  const withoutFrontmatter = md.replace(/^---[\s\S]*?---\n?/, '')
  return cleanText(withoutFrontmatter)
}

/**
 * JSON 文档提取：
 * 1. 如果有 text / content / body 字段 → 直接用
 * 2. 如果是数组 → 提取每项的 text/content 字段并拼接
 * 3. 否则 → JSON.stringify 后当文本用
 */
function extractFromJson(raw) {
  let data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    throw new Error('JSON 解析失败：' + e.message)
  }

  if (typeof data === 'string') return data

  if (Array.isArray(data)) {
    return data
      .map(item => item?.text || item?.content || item?.body || JSON.stringify(item))
      .join('\n\n')
  }

  if (data.text)    return String(data.text)
  if (data.content) return String(data.content)
  if (data.body)    return String(data.body)

  // 兜底：格式化输出
  return JSON.stringify(data, null, 2)
}
```

### 4.2 为什么要专门处理 JSON

许多知识库文档以 JSON 存储（FAQ 列表、API 文档导出等），如果直接当字符串切分，会把花括号和引号混入 chunk，污染向量质量。提取 `text` 字段是最常见的清理手段。

---

## 五、复用 Week 10 的 Chunking 工具

Week 10 实现了一个支持滑动窗口和 Markdown 语义切分的工具。这里直接复用它：

```js
// server/services/chunker.js
// （直接复用或引用 Week 10 的实现）

/**
 * 滑动窗口切分
 */
export function slidingWindowChunk(text, chunkSize = 800, overlap = 160) {
  if (overlap >= chunkSize) throw new Error('overlap 必须小于 chunkSize')

  const step   = chunkSize - overlap
  const chunks = []

  for (let i = 0; i < text.length; i += step) {
    const chunk = text.slice(i, i + chunkSize).trim()
    if (chunk) chunks.push(chunk)
    if (i + chunkSize >= text.length) break
  }

  return chunks
}

/**
 * Markdown 语义切分：按标题 + 段落分组，再做长度约束
 */
export function markdownChunk(md, maxChunkSize = 1000) {
  const blocks = md
    .split(/\n(?=#{1,6}\s)|\n{2,}/)
    .map(b => b.trim())
    .filter(Boolean)

  const chunks = []
  let buffer   = ''

  for (const block of blocks) {
    if (buffer.length + block.length > maxChunkSize && buffer.length > 0) {
      chunks.push(buffer.trim())
      buffer = ''
    }
    buffer += (buffer ? '\n\n' : '') + block
  }

  if (buffer.trim()) chunks.push(buffer.trim())

  return chunks
}

/**
 * 根据文件类型选择切分策略
 */
export function chunkDocument(text, ext, options = {}) {
  const { chunkSize = 800, overlap = 160 } = options

  if (ext === '.md') {
    return markdownChunk(text, chunkSize)
  }

  return slidingWindowChunk(text, chunkSize, overlap)
}
```

---

## 六、上传路由

### 6.1 路由实现

```js
// server/routes/upload.js
import express from 'express'
import path from 'path'
import fs from 'fs/promises'
import { upload } from '../middleware/upload.js'
import { readDocument } from '../services/document-reader.js'
import { chunkDocument } from '../services/chunker.js'

const router = express.Router()

/**
 * POST /api/upload
 * 接收单个或多个文件，返回 chunk 预览
 */
router.post(
  '/upload',
  upload.array('document', 10), // 字段名和 Step 78 前端 formData.append('document', ...) 对应
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '没有收到文件' })
    }

    const results = []

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase()
      let text, chunks

      try {
        text   = await readDocument(file.path, file.originalname)
        chunks = chunkDocument(text, ext)
      } catch (err) {
        // 单个文件失败不影响其他文件
        results.push({
          filename:   file.originalname,
          ok:         false,
          error:      err.message
        })
        // 清理临时文件
        await fs.unlink(file.path).catch(() => {})
        continue
      }

      results.push({
        filename:   file.originalname,
        ok:         true,
        chunkCount: chunks.length,
        charCount:  text.length,
        preview:    chunks.slice(0, 2).map(c => c.slice(0, 120) + (c.length > 120 ? '…' : ''))
      })

      // 临时文件暂时保留，Step 80 会读取并建 embedding
      // 正式产品里应记录 file.path → filename 的映射，供后续使用
    }

    res.json({ ok: true, results })
  }
)

export default router
```

### 6.2 挂载到主服务

```js
// server/index.js（节选）
import uploadRouter from './routes/upload.js'

app.use('/api', uploadRouter)
```

### 6.3 multer 错误处理

multer 的错误（文件过大、类型不对）不会自动走 Express 的错误中间件，需要显式捕获：

```js
// server/middleware/upload-error.js
export function handleUploadError(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件超过 5 MB 限制' })
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: '单次最多上传 10 个文件' })
  }
  if (err.message?.startsWith('不支持的文件类型')) {
    return res.status(400).json({ error: err.message })
  }
  next(err)
}
```

在 `server/index.js` 中放在路由之后：

```js
import { handleUploadError } from './middleware/upload-error.js'

app.use('/api', uploadRouter)
app.use(handleUploadError) // 放最后
```

---

## 七、测试路由

### 7.1 用 curl 快速测试

```bash
# 上传单个文件
curl -X POST http://localhost:3001/api/upload \
  -F "document=@/path/to/your/doc.txt"

# 上传多个文件
curl -X POST http://localhost:3001/api/upload \
  -F "document=@/path/to/doc1.txt" \
  -F "document=@/path/to/doc2.md"
```

期望返回：

```json
{
  "ok": true,
  "results": [
    {
      "filename": "doc.txt",
      "ok": true,
      "chunkCount": 8,
      "charCount": 5243,
      "preview": [
        "这是第一个 chunk 的前 120 个字符…",
        "这是第二个 chunk 的前 120 个字符…"
      ]
    }
  ]
}
```

### 7.2 验证错误场景

```bash
# 上传不支持的文件类型
curl -X POST http://localhost:3001/api/upload \
  -F "document=@/path/to/file.pdf"
# 期望：400 { "error": "不支持的文件类型：.pdf" }

# 上传超过 5 MB 的文件（创造大文件）
dd if=/dev/zero bs=1M count=6 | tr '\0' 'A' > /tmp/big.txt
curl -X POST http://localhost:3001/api/upload \
  -F "document=@/tmp/big.txt"
# 期望：413 { "error": "文件超过 5 MB 限制" }
```

---

## 八、临时文件清理策略

这一节先暂时保留 `uploads/` 目录下的文件，Step 80 会读取并建 embedding。真实产品中，要在以下时机清理：

```js
// 选项 A：处理完立即删除（embedding 完成后）
await fs.unlink(file.path)

// 选项 B：定时清理（适合批量异步场景）
// 用 node-cron 或 setInterval 定期删除超过 24 小时的文件
import cron from 'node-cron'
cron.schedule('0 * * * *', async () => {
  const files = await fs.readdir('./uploads')
  const now   = Date.now()
  for (const f of files) {
    const fp   = `./uploads/${f}`
    const stat = await fs.stat(fp)
    if (now - stat.mtimeMs > 24 * 3600 * 1000) {
      await fs.unlink(fp)
    }
  }
})
```

---

## 小结

1. multer 的 `diskStorage` + `fileFilter` 是文件上传的最小安全配置，文件类型和大小都应在服务端校验。
2. 按文件扩展名分派不同读取逻辑，能显著提升 chunk 质量——特别是 JSON 文档需要提取 `text` 字段。
3. chunking 工具直接复用 Week 10 的实现，路由层只负责协调，不内联业务逻辑。
4. multer 的错误需要单独的错误中间件捕获，不能靠 Express 默认处理。
5. 临时文件要有明确的清理策略，避免磁盘积累。
