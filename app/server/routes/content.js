import express from 'express'
import contentScanner from '../services/content-scanner.js'

const router = express.Router()

router.get('/structure', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true'
    const structure = await contentScanner.getContentStructure(forceRefresh)
    res.json(structure)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/week/:weekId/step/:stepId', async (req, res) => {
  try {
    const { weekId, stepId } = req.params
    const detail = await contentScanner.getStepDetail(weekId, stepId)
    res.json(detail)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get('/code', async (req, res) => {
  try {
    const { path: filePath } = req.query
    if (!filePath) {
      return res.status(400).json({ error: 'path parameter required' })
    }
    const content = await contentScanner.getCodeContent(filePath)
    res.json({ content })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
