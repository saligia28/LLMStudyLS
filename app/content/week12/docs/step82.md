# Step 82: 应用落地｜实现带引用回答

## 学习目标

这一节把 Step 74 的"来源引用"能力完整落地到前端，形成从 chunk metadata 到 UI 展示的完整链路。

完成后你应该能：

1. 在 LLM 回答中生成结构化的引用标记
2. 从回答文本中解析引用编号
3. 在前端高亮展示引用，并支持点击跳转到原始内容
4. 处理引用解析失败的兜底逻辑

---

## 一、引用的完整流程

```text
Chunk 入库时携带 metadata
  ↓
检索时返回 chunk + metadata（来源文件名、页码等）
  ↓
Prompt 中告知 LLM 用 [来源N] 格式引用
  ↓
LLM 回答中包含 [来源1]、[来源2] 标记
  ↓
前端解析标记 → 高亮 + 展开原文
```

---

## 二、Prompt 中的引用指令

```js
function buildPromptWithCitation(question, retrievedChunks) {
  const contextParts = retrievedChunks.map((chunk, i) => {
    const source = chunk.metadata?.source || `文档${i + 1}`
    const page   = chunk.metadata?.page   ? `第${chunk.metadata.page}页` : ''
    const label  = [source, page].filter(Boolean).join(' ')
    return `[来源${i + 1}: ${label}]\n${chunk.text}`
  })

  const context = contextParts.join('\n\n---\n\n')

  const system = `你是一个严谨的文档问答助手。
规则：
1. 只基于下方提供的文档内容回答。
2. 每个关键陈述后面用 [来源N] 格式标注引用编号（N 对应文档块编号）。
3. 如果文档中没有相关信息，回答"文档中未提及此内容"。
4. 不要编造文档中没有的内容。

示例格式：
PagedAttention 是一种显存分页管理技术 [来源1]，它能将 KV cache 切分为固定大小的页 [来源2]。`

  const user = `文档内容：\n${context}\n\n问题：${question}`

  return { system, user }
}
```

---

## 三、解析回答中的引用

```js
/**
 * 从答案文本中提取引用编号
 * 输入: "RAG 是检索增强生成 [来源1]，由 Meta 提出 [来源2]。"
 * 输出: { text: "...", citations: [1, 2] }
 */
function parseAnswerWithCitations(answerText) {
  const citationPattern = /\[来源(\d+)\]/g
  const citations = new Set()
  let match

  while ((match = citationPattern.exec(answerText)) !== null) {
    citations.add(parseInt(match[1]))
  }

  return {
    text: answerText,
    citations: Array.from(citations).sort((a, b) => a - b),
  }
}

// 将答案文本中的引用标记转换为 HTML
function renderAnswerWithCitationLinks(answerText) {
  return answerText.replace(
    /\[来源(\d+)\]/g,
    (match, num) => `<sup class="citation-ref" data-source="${num}">[${num}]</sup>`
  )
}
```

---

## 四、前端引用展示

```js
// 在答案消息下方展示可展开的引用面板
function renderCitationPanel(sources, citedNums) {
  // 只展示实际被引用的来源
  const cited = sources.filter(s => citedNums.includes(s.index))
  if (cited.length === 0) return ''

  const items = cited.map(s => `
    <div class="citation-item" id="citation-${s.index}">
      <div class="citation-header">
        <span class="citation-num">[${s.index}]</span>
        <span class="citation-source">${s.source}</span>
        ${s.page ? `<span class="citation-page">第${s.page}页</span>` : ''}
        <span class="citation-score">相关度 ${(s.score * 100).toFixed(0)}%</span>
        <button class="toggle-btn" onclick="toggleCitation(${s.index})">展开</button>
      </div>
      <div class="citation-content" id="citation-content-${s.index}" style="display:none">
        ${escapeHtml(s.text)}
      </div>
    </div>
  `).join('')

  return `
    <div class="citation-panel">
      <div class="citation-title">引用来源</div>
      ${items}
    </div>
  `
}

function toggleCitation(index) {
  const content = document.getElementById(`citation-content-${index}`)
  const btn = document.querySelector(`#citation-${index} .toggle-btn`)
  if (content.style.display === 'none') {
    content.style.display = 'block'
    btn.textContent = '收起'
  } else {
    content.style.display = 'none'
    btn.textContent = '展开'
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
```

```css
.citation-panel {
  margin-top: 12px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  overflow: hidden;
}

.citation-title {
  padding: 6px 12px;
  background: #fafafa;
  font-size: 12px;
  color: #666;
  font-weight: 500;
  border-bottom: 1px solid #e8e8e8;
}

.citation-item {
  border-bottom: 1px solid #f0f0f0;
}

.citation-item:last-child {
  border-bottom: none;
}

.citation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.citation-num {
  font-weight: bold;
  color: #1677ff;
}

.citation-source {
  flex: 1;
  color: #333;
}

.citation-page, .citation-score {
  color: #999;
  font-size: 12px;
}

.toggle-btn {
  padding: 2px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}

.citation-content {
  padding: 8px 12px;
  background: #f9f9f9;
  font-size: 13px;
  color: #444;
  line-height: 1.7;
  border-top: 1px solid #f0f0f0;
  white-space: pre-wrap;
}

.citation-ref {
  color: #1677ff;
  cursor: pointer;
  font-size: 11px;
  vertical-align: super;
}

.citation-ref:hover {
  text-decoration: underline;
}
```

---

## 五、点击引用跳转到来源

```js
// 点击答案中的 [N] 跳转到对应引用面板
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('citation-ref')) {
    const sourceNum = e.target.dataset.source
    const citationEl = document.getElementById(`citation-${sourceNum}`)
    if (citationEl) {
      citationEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // 自动展开
      const content = document.getElementById(`citation-content-${sourceNum}`)
      const btn = citationEl.querySelector('.toggle-btn')
      if (content.style.display === 'none') {
        content.style.display = 'block'
        btn.textContent = '收起'
      }
    }
  }
})
```

---

## 六、完整的答案渲染函数

```js
function renderAssistantMessage(answer, sources) {
  const { text, citations } = parseAnswerWithCitations(answer)
  const htmlAnswer = renderAnswerWithCitationLinks(text)
  const citationPanel = renderCitationPanel(sources, citations)

  const messageDiv = document.createElement('div')
  messageDiv.className = 'message assistant'
  messageDiv.innerHTML = htmlAnswer + citationPanel

  chatHistory.appendChild(messageDiv)
  chatHistory.scrollTop = chatHistory.scrollHeight
}
```

---

## 七、小结

1. 引用的核心是 **Prompt 约束 + 解析标记 + UI 展示** 三步缺一不可。
2. 用 `[来源N]` 这种简单格式比 Markdown 引用格式更容易解析和渲染。
3. 引用面板默认折叠，点击展开原文，减少视觉噪声。
4. 点击答案内引用数字可跳转到引用面板，提升可操作性。
5. 引用可信度（相似度分数）展示给用户，有助于判断答案可靠性。
