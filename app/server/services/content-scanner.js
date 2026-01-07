import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONTENT_ROOT = path.join(__dirname, '../../../content')

class ContentScanner {
  constructor() {
    this.cache = null
    this.lastScanTime = null
  }

  async getContentStructure(forceRefresh = false) {
    if (!forceRefresh && this.cache && Date.now() - this.lastScanTime < 5 * 60 * 1000) {
      return this.cache
    }

    const config = await this.readConfig()
    const weeks = []

    for (const weekConfig of config.weeks) {
      if (!weekConfig.enable) continue

      const weekData = await this.scanWeek(weekConfig.id)
      if (weekData) {
        weeks.push(weekData)
      }
    }

    weeks.sort((a, b) => (a.order || 0) - (b.order || 0))

    this.cache = {
      ...config,
      weeks,
      scannerAt: new Date().toISOString(),
    }
    this.lastScanTime = Date.now()

    return this.cache
  }

  async readConfig() {
    const configPath = path.join(CONTENT_ROOT, 'content.config.json')
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      return { title: 'LLM学习', autoScan: true, weeks: await this.autoDetectWeeks() }
    }
  }

  async autoDetectWeeks() {
    const entries = await fs.readdir(CONTENT_ROOT, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && e.name.startsWith('week'))
      .map(e => ({ id: e.name, enable: true }))
      .sort((a, b) => {
        const numA = parseInt(a.id.replace('week', ''))
        const numB = parseInt(b.id.replace('week', ''))
        return numA - numB
      })
  }

  async scanWeek(weekId) {
    const weekPath = path.join(CONTENT_ROOT, weekId)

    try {
      await fs.access(weekPath)
    } catch {
      return null
    }

    let weekConfig
    try {
      const configContent = await fs.readFile(path.join(weekPath, 'week.json'), 'utf-8')
      weekConfig = JSON.parse(configContent)
    } catch {
      weekConfig = await this.autoScanWeek(weekId, weekPath)
    }

    const validSteps = []
    for (const step of weekConfig.steps || []) {
      const docPath = path.join(weekPath, 'docs', step.docFile)
      try {
        await fs.access(docPath)
        validSteps.push({
          ...step,
          weekId,
          docPath,
        })
      } catch {
        console.warn(`文档不存在:${docPath}`)
      }
    }

    return {
      ...weekConfig,
      steps: validSteps,
      path: weekPath,
    }
  }

  async autoScanWeek(weekId, weekPath) {
    const docsPath = path.join(weekPath, 'docs')
    const codePath = path.join(weekPath, 'code')

    let docFiles = []
    try {
      const files = await fs.readdir(docsPath)
      docFiles = files.filter(f => f.endsWith('.md').sort())
    } catch {
      console.warn('docs 目录不存在')
    }

    const steps = docFiles.map((file, index) => {
      const id = file.replace('.md', '')
      return {
        id,
        title: `Step${index + 1}`,
        docFile: file,
        codeDir: id.replace('step', 'test'),
      }
    })

    return {
      id: weekId,
      title: weekId.replace('week', 'Week'),
      steps,
    }
  }

  async getStepDetail(weekId, stepId) {
    const weekPath = path.join(CONTENT_ROOT, weekId)
    const structure = await this.getContentStructure()

    const week = structure.weeks.find(w => w.id === weekId)
    if (!week) throw new Error(`Week not found: ${weekId}`)

    const step = week.steps.find(s => s.id === stepId)
    if (!step) throw new Error(`Step not found:${stepId}`)

    const docPath = path.join(weekPath, 'docs', step.docFile)
    const docContent = await fs.readFile(docPath, 'utf-8')

    let codeFiles = []
    if (step.codeDir) {
      const codeDirPath = path.join(weekPath, 'code', step.codeDir)
      try {
        const files = await fs.readdir(codeDirPath)
        codeFiles = files
          .filter(f => f.endsWith('.js'))
          .map(f => ({
            name: f,
            path: path.join(codeDirPath, f),
          }))
      } catch {
        console.warn('目录不穿在')
      }
    } else if (step.codeFiles) {
      codeFiles = step.codeFiles.map(f => ({
        name: f,
        path: path.join(weekPath, 'codex', f),
      }))
    }

    return {
      ...step,
      weekId,
      docContent,
      codeFiles,
    }
  }

  async getCodeContent(filePath) {
    const normalizedPath = path.normalize(filePath)
    if (!normalizedPath.startsWith(CONTENT_ROOT)) {
      throw new Error('Access denied: path outside content directory')
    }

    return await fs.readFile(filePath, 'utf-8')
  }
}

export default new ContentScanner()
