# Step 78: 应用落地｜构建上传文档界面

## 学习目标

这一节开始进入 Week 12 的核心任务：**把 RAG Pipeline 做成一个真实可用的 web 应用**。第一步是构建文档上传界面——用户通过这里把本地文件送进系统。

完成后你应该能：

1. 写出支持点击和拖拽上传的 HTML + CSS 表单
2. 用 fetch API 发送 `multipart/form-data` 请求并展示上传进度
3. 在前端做文件类型和大小校验，拒绝不合规文件
4. 给用户清晰的状态反馈：等待、上传中、成功、失败

> 上传界面是整个产品的入口。入口体验好，用户才愿意继续走下去。

---

## 一、产品全貌先看一眼

在开始写代码之前，先把 Week 12 要做的完整产品结构过一遍：

```text
用户浏览器
  ├── 上传界面 (Step 78)
  │     └── 拖拽 / 点击选文件 → POST /api/upload
  │
  ├── 问答界面 (Step 81-82)
  │     └── 输入问题 → GET /api/ask?q=... → 流式回答 + 引用
  │
  └── 状态展示
        └── 当前已索引文档列表、chunk 数量

Express 后端
  ├── POST /api/upload   (Step 79-80)
  │     └── multer → 读文件 → chunk → embedding → 存储
  │
  ├── GET  /api/ask      (Step 81-82)
  │     └── 查向量 → 组 prompt → SSE 流式回答
  │
  └── GET  /api/health
        └── 心跳检查，返回已索引文件数
```

本节只做前端上传部分。后端接口 `POST /api/upload` 会在 Step 79 实现，这里先用 mock 来联调。

---

## 二、HTML 结构

### 2.1 最小可用结构

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>文档问答 · 上传</title>
  <link rel="stylesheet" href="upload.css" />
</head>
<body>
  <div class="app">
    <header class="app-header">
      <h1>文档问答助手</h1>
      <p class="subtitle">上传文档，然后向它提问</p>
    </header>

    <main class="upload-area" id="dropZone">
      <div class="drop-icon">📄</div>
      <p class="drop-hint">将文件拖到此处，或</p>
      <label class="btn-select" for="fileInput">选择文件</label>
      <input
        type="file"
        id="fileInput"
        accept=".txt,.md,.json"
        multiple
        hidden
      />
      <p class="file-tip">支持 TXT、Markdown、JSON，单文件不超过 5 MB</p>
    </main>

    <!-- 文件列表 -->
    <section class="file-list" id="fileList" hidden>
      <h2>待上传文件</h2>
      <ul id="fileItems"></ul>
      <button class="btn-upload" id="uploadBtn">开始上传</button>
    </section>

    <!-- 上传结果 -->
    <section class="result-area" id="resultArea" hidden>
      <div class="result-icon success-icon">✅</div>
      <p id="resultMsg"></p>
      <button class="btn-link" id="goAsk">去提问 →</button>
    </section>
  </div>

  <script src="upload.js"></script>
</body>
</html>
```

### 2.2 关键元素说明

| 元素 | 作用 |
|------|------|
| `#dropZone` | 拖拽目标区域，监听 `dragover` / `drop` 事件 |
| `#fileInput` | 隐藏的原生 `<input type="file">`，点击 label 触发 |
| `#fileItems` | 渲染选中文件列表及每项的上传进度 |
| `#uploadBtn` | 触发批量上传逻辑 |
| `#resultArea` | 上传完成后展示结果摘要 |

---

## 三、CSS 样式

### 3.1 拖拽区域

```css
/* upload.css */

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f5f7fa;
  color: #1a1a1a;
}

.app {
  max-width: 680px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.app-header {
  text-align: center;
  margin-bottom: 2rem;
}

.app-header h1 {
  font-size: 1.8rem;
  margin: 0 0 0.4rem;
}

.subtitle {
  color: #666;
  margin: 0;
}

/* 上传区域 */
.upload-area {
  border: 2px dashed #bbb;
  border-radius: 12px;
  padding: 3rem 2rem;
  text-align: center;
  background: #fff;
  transition: border-color 0.2s, background 0.2s;
  cursor: pointer;
}

.upload-area.drag-over {
  border-color: #4a6cf7;
  background: #eef1ff;
}

.drop-icon {
  font-size: 3rem;
  line-height: 1;
  margin-bottom: 1rem;
}

.drop-hint {
  color: #555;
  margin: 0 0 0.75rem;
}

.file-tip {
  font-size: 0.8rem;
  color: #999;
  margin: 0.75rem 0 0;
}

/* 按钮 */
.btn-select {
  display: inline-block;
  padding: 0.5rem 1.25rem;
  background: #4a6cf7;
  color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background 0.15s;
}

.btn-select:hover {
  background: #3a5ce5;
}

.btn-upload {
  display: block;
  width: 100%;
  padding: 0.75rem;
  margin-top: 1rem;
  background: #22c55e;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-upload:hover {
  background: #16a34a;
}

.btn-upload:disabled {
  background: #86efac;
  cursor: not-allowed;
}

/* 文件列表 */
.file-list {
  margin-top: 1.5rem;
  background: #fff;
  border-radius: 12px;
  padding: 1.25rem;
}

.file-list h2 {
  font-size: 1rem;
  margin: 0 0 1rem;
  color: #444;
}

.file-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 单个文件项 */
.file-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.file-name {
  font-size: 0.9rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-size {
  font-size: 0.78rem;
  color: #888;
}

.file-status {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: #e5e7eb;
  color: #555;
  white-space: nowrap;
}

.file-status.uploading { background: #dbeafe; color: #1d4ed8; }
.file-status.done      { background: #dcfce7; color: #166534; }
.file-status.error     { background: #fee2e2; color: #991b1b; }

/* 进度条 */
.progress-bar-wrap {
  grid-column: 1 / -1;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #4a6cf7;
  transition: width 0.2s;
}

/* 结果区 */
.result-area {
  margin-top: 1.5rem;
  text-align: center;
  background: #fff;
  border-radius: 12px;
  padding: 2rem;
}

.result-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.btn-link {
  background: none;
  border: none;
  color: #4a6cf7;
  cursor: pointer;
  font-size: 1rem;
  margin-top: 0.75rem;
  text-decoration: underline;
}
```

---

## 四、JavaScript 逻辑

### 4.1 文件校验

```js
// upload.js

const ALLOWED_TYPES = new Set(['.txt', '.md', '.json'])
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

/**
 * 校验单个文件，返回 { valid: boolean, reason?: string }
 */
function validateFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase()

  if (!ALLOWED_TYPES.has(ext)) {
    return { valid: false, reason: `不支持的文件类型：${ext}` }
  }

  if (file.size > MAX_SIZE_BYTES) {
    return { valid: false, reason: `文件过大（${formatBytes(file.size)}），上限 5 MB` }
  }

  return { valid: true }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
```

### 4.2 拖拽与文件选择

```js
const dropZone   = document.getElementById('dropZone')
const fileInput  = document.getElementById('fileInput')
const fileList   = document.getElementById('fileList')
const fileItems  = document.getElementById('fileItems')
const uploadBtn  = document.getElementById('uploadBtn')
const resultArea = document.getElementById('resultArea')
const resultMsg  = document.getElementById('resultMsg')

// 已选文件集合，key 是文件名，避免重复添加
const selectedFiles = new Map()

// 拖拽进入：高亮
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over')
})

// 拖拽放下：收集文件
dropZone.addEventListener('drop', (e) => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  handleFiles([...e.dataTransfer.files])
})

// 点击 label → input → 选文件
fileInput.addEventListener('change', () => {
  handleFiles([...fileInput.files])
  fileInput.value = '' // 允许重复选同名文件
})

function handleFiles(files) {
  const errors = []

  files.forEach((file) => {
    const check = validateFile(file)
    if (!check.valid) {
      errors.push(`${file.name}：${check.reason}`)
      return
    }
    if (!selectedFiles.has(file.name)) {
      selectedFiles.set(file.name, file)
    }
  })

  if (errors.length > 0) {
    alert('以下文件无法添加：\n' + errors.join('\n'))
  }

  renderFileList()
}
```

### 4.3 渲染文件列表

```js
function renderFileList() {
  fileItems.innerHTML = ''

  if (selectedFiles.size === 0) {
    fileList.hidden = true
    return
  }

  fileList.hidden = false

  selectedFiles.forEach((file, name) => {
    const li = document.createElement('li')
    li.className = 'file-item'
    li.dataset.name = name
    li.innerHTML = `
      <span class="file-name" title="${name}">${name}</span>
      <span class="file-size">${formatBytes(file.size)}</span>
      <span class="file-status" id="status-${CSS.escape(name)}">待上传</span>
      <div class="progress-bar-wrap" id="progress-wrap-${CSS.escape(name)}" style="display:none">
        <div class="progress-bar" id="progress-${CSS.escape(name)}" style="width:0%"></div>
      </div>
    `
    fileItems.appendChild(li)
  })
}
```

### 4.4 上传单个文件（带进度）

```js
/**
 * 用 XMLHttpRequest 上传单个文件，支持进度回调
 * fetch API 目前不支持上传进度，需要用 XHR
 */
function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('document', file)

    const xhr = new XMLHttpRequest()

    // 上传进度事件
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100)
        updateFileProgress(file.name, pct)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText))
      } else {
        let errMsg = `HTTP ${xhr.status}`
        try {
          const body = JSON.parse(xhr.responseText)
          errMsg = body.error || errMsg
        } catch (_) {}
        reject(new Error(errMsg))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('网络错误，请检查连接'))
    })

    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  })
}

function updateFileProgress(name, pct) {
  const key = CSS.escape(name)
  const statusEl = document.getElementById(`status-${key}`)
  const wrapEl   = document.getElementById(`progress-wrap-${key}`)
  const barEl    = document.getElementById(`progress-${key}`)

  if (statusEl) {
    statusEl.textContent = `上传中 ${pct}%`
    statusEl.className = 'file-status uploading'
  }
  if (wrapEl) wrapEl.style.display = 'block'
  if (barEl)  barEl.style.width = pct + '%'
}

function setFileStatus(name, status, text) {
  const key = CSS.escape(name)
  const statusEl = document.getElementById(`status-${key}`)
  if (statusEl) {
    statusEl.textContent = text
    statusEl.className = `file-status ${status}`
  }
}
```

### 4.5 批量上传入口

```js
uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.size === 0) return

  uploadBtn.disabled = true
  uploadBtn.textContent = '上传中...'

  const results = { success: 0, fail: 0 }

  // 逐个上传（避免并发过多占带宽）
  for (const [name, file] of selectedFiles.entries()) {
    try {
      setFileStatus(name, 'uploading', '上传中...')
      const res = await uploadFile(file)
      setFileStatus(name, 'done', `完成 · ${res.chunkCount ?? 0} chunks`)
      results.success++
    } catch (err) {
      setFileStatus(name, 'error', `失败：${err.message}`)
      results.fail++
    }
  }

  uploadBtn.disabled = false
  uploadBtn.textContent = '重新上传'

  // 展示结果摘要
  resultArea.hidden = false
  resultMsg.textContent =
    `上传完成：${results.success} 个成功` +
    (results.fail > 0 ? `，${results.fail} 个失败` : '')
})

document.getElementById('goAsk').addEventListener('click', () => {
  window.location.href = '/ask.html'
})
```

---

## 五、与 Express 后端对接

Step 79 会实现真正的 `/api/upload` 路由。在那之前，你可以用下面的 mock 路由快速验证前端流程：

```js
// server/routes/upload-mock.js
import express from 'express'
const router = express.Router()

router.post('/upload', (req, res) => {
  // 模拟 1.5 秒处理延迟
  setTimeout(() => {
    res.json({
      ok: true,
      filename: 'sample.txt',
      chunkCount: 12
    })
  }, 1500)
})

export default router
```

在 `server/index.js` 挂载：

```js
import uploadMock from './routes/upload-mock.js'
app.use('/api', uploadMock)
```

---

## 六、验证步骤

完成后按以下顺序验证：

1. 打开页面，拖入一个 `.txt` 文件 → 文件列表出现，显示文件名和大小
2. 拖入一个 `.exe` 文件 → 弹出错误提示，文件不被添加
3. 点击"开始上传" → 进度条从 0% 动到 100%，状态变为"完成"
4. 故意让 mock 返回 500 → 状态变为"失败：HTTP 500"
5. 点击"去提问" → 跳转到问答页（下一节实现）

---

## 小结

1. 拖拽上传的核心是监听 `dragover` + `drop` 事件，并调用 `e.preventDefault()` 阻止浏览器默认行为。
2. 上传进度必须使用 XHR 的 `upload.progress` 事件，fetch API 目前不支持。
3. 文件校验要在前端做一次（快速反馈），后端还要再做一次（安全保障）。
4. 将文件状态和进度抽成独立函数，便于批量上传时单独控制每个文件的 UI。
