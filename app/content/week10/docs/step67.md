# Step 67: Chunking｜加入元数据（文档名、页码）

## 学习目标

这一节要解决的是：**chunk 不能只会“被检索”，还要能“被解释”**。

完成后你应该能：

1. 设计 chunk 的 metadata 结构
2. 让文档名、页码、section、段落等信息跟着 chunk 一起存下来
3. 在检索结果里快速定位来源
4. 理解 metadata 为什么会直接影响调试、回溯和 rerank

> 如果 chunk 是“最小检索单元”，那 metadata 就是它的身份证。没有身份证，chunk 被召回后你只知道“像是相关”，却不知道“它到底来自哪里、属于哪一段、是不是重复内容”。

---

## 一、为什么 metadata 这么重要

Chunk 的 value 不只在文本本身，更在“文本 + 来源信息”。

### metadata 能解决什么

1. **可追溯**：回答时能回到原文的具体页码、章节和段落。
2. **可过滤**：只看某本书、某个文档、某一节的 chunk。
3. **可调试**：知道是哪个文档源、哪一页、哪一段出了问题。
4. **可去重**：当多个 chunk 内容很像时，metadata 帮你判断它们是不是同源重复。
5. **可评价**：实验时可以按文档维度统计召回情况。

### 一个典型的 metadata 结构

| 字段 | 作用 |
| --- | --- |
| `docName` | 文档名，最基本的来源标识 |
| `docId` | 文档唯一 ID，适合系统内部引用 |
| `page` | 页码，尤其适合 PDF / 扫描文档 |
| `section` | 所属章节标题 |
| `paragraphIndex` | 在章节内的段落顺序 |
| `chunkIndex` | 当前文档中的 chunk 顺序 |
| `startOffset` / `endOffset` | 原文位置，便于精确回放 |
| `sourceType` | markdown / pdf / html / code |
| `tokenCount` | 方便做成本和实验统计 |

---

## 二、metadata 不是越多越好

metadata 的目标是“够用且稳定”，不是把所有信息都塞进去。

### 推荐原则

1. **稳定优先**：优先存不会轻易变的字段，比如文档名、页码、章节。
2. **检索优先**：优先存后面检索、过滤、回放会用到的字段。
3. **调试优先**：优先存能帮助你定位问题的字段。

### 一个实用模板

```js
function buildChunkMetadata({
  docId,
  docName,
  page,
  sectionPath = [],
  paragraphIndex,
  chunkIndex,
  tokenCount,
  startOffset,
  endOffset,
}) {
  return {
    docId,
    docName,
    page,
    sectionPath,
    paragraphIndex,
    chunkIndex,
    tokenCount,
    span: { startOffset, endOffset },
  }
}
```

这个结构有两个好处：

- `sectionPath` 可以表示多级标题，比如 `Week10 > Step67 > 元数据设计`
- `span` 可以以后直接回到原文位置，不需要重新猜

---

## 三、如何给 chunk 注入 metadata

最稳妥的方式，是在切分时一起构建。

```js
function attachMetadata(chunks, baseMeta) {
  return chunks.map((chunk, index) => ({
    id: `${baseMeta.docId}-${index + 1}`,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
    metadata: buildChunkMetadata({
      ...baseMeta,
      chunkIndex: index + 1,
      tokenCount: chunk.tokenCount,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
    }),
  }))
}
```

### 一个示例输入

```js
const baseMeta = {
  docId: 'chunking-guide-001',
  docName: 'week10-chunking.md',
  page: 12,
  sectionPath: ['Chunking', 'Metadata'],
  paragraphIndex: 3,
}
```

### 一个示例输出

```js
{
  id: 'chunking-guide-001-4',
  text: '...chunk 文本...',
  tokenCount: 386,
  metadata: {
    docId: 'chunking-guide-001',
    docName: 'week10-chunking.md',
    page: 12,
    sectionPath: ['Chunking', 'Metadata'],
    paragraphIndex: 3,
    chunkIndex: 4,
    tokenCount: 386,
    span: { startOffset: 8120, endOffset: 9648 }
  }
}
```

---

## 四、metadata 如何影响检索

检索不只是“相似度最高就行”，还常常需要“先筛再排”。

### 1. 过滤

比如你只想在某一本手册里找答案，可以先按 `docId` 或 `docName` 过滤。

```js
function filterByDoc(chunks, docId) {
  return chunks.filter(chunk => chunk.metadata.docId === docId)
}
```

### 2. 排序与去重

如果两个 chunk 来自同一页同一段，且文本高度相似，就可以在 rerank 前先去掉一个。

```js
function dedupeBySource(chunks) {
  const seen = new Set()
  const result = []

  for (const chunk of chunks) {
    const key = `${chunk.metadata.docId}:${chunk.metadata.page}:${chunk.metadata.chunkIndex}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(chunk)
  }

  return result
}
```

### 3. 回溯

当 LLM 回答“这条结论来自哪里”时，metadata 可以直接给你：

- 来自哪本资料
- 第几页
- 哪个 section
- 哪个 chunk

这比让模型自己猜来源可靠得多。

---

## 五、metadata 和 chunk 质量是互相配合的

metadata 不是 chunking 的附属品，而是 chunking 设计的一部分。

### 一个常见误区

只切文本，不设计 metadata，最后会出现：

- 检索到很多看起来相关的 chunk
- 却不知道它们是否来自同一部分
- 回答时无法引用来源
- 调试时无法复现实验结果

### 更好的做法

```text
切分策略负责“内容是否完整”
metadata 负责“来源是否清楚”
两者一起，chunk 才能进入可用状态
```

---

## 六、小结

Chunking 的最终目标不是做出“很多块文本”，而是做出“每一块都能被解释、过滤、回放、评价”的检索单元。

如果说 Step 66 解决的是“怎么切”，那么 Step 67 解决的就是“切完之后，怎么让这些块不再匿名”。
