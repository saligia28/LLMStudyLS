import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import ptyService from './pty-service.js'
import 'dotenv/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV !== 'production'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    mainWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
  })

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${process.env.WINDOW_SERVER_PORT}`)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupIPC() {
  let currentTerminalId = null

  ipcMain.handle('terminal:create', async _event => {
    const id = Date.now().toString()
    currentTerminalId = id
    console.log('[Main] Creating terminal with id:', id)

    const terminal = ptyService.create(id)

    terminal.onData(data => {
      console.log('[Main] PTY data:', data.substring(0, 50))
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', data)
      }
    })

    return id
  })

  ipcMain.on('terminal:write', (_event, data) => {
    console.log('[Main] terminal:write received, currentTerminalId:', currentTerminalId, 'data:', data)
    if (currentTerminalId) {
      ptyService.write(currentTerminalId, data)
    } else {
      console.warn('[Main] No terminal id, cannot write')
    }
  })

  ipcMain.on('terminal:resize', (_event, cols, rows) => {
    if (currentTerminalId) {
      ptyService.resize(currentTerminalId, cols, rows)
    }
  })

  ipcMain.handle('terminal:destroy', async (_event, id) => {
    console.log('[Main] Destroying terminal:', id || currentTerminalId)
    ptyService.destroy(id || currentTerminalId)
    if (id === currentTerminalId) {
      currentTerminalId = null
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  setupIPC()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 清理所有 PTY
  ptyService.destroyAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 确保退出前清理所有 PTY
  ptyService.destroyAll()
})
