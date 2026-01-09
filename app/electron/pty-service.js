import * as pty from 'node-pty'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 判断是否为打包后的生产环境
function isPackaged() {
  // 在打包后的应用中，app.isPackaged 为 true
  // 但我们在主进程之外，所以检查路径特征
  // 打包后 __dirname 会在 app.asar 中
  return __dirname.includes('app.asar')
}

// 根据环境确定内容目录路径
function getContentRoot() {
  if (isPackaged() && process.resourcesPath) {
    // 生产环境：使用 extraResources 中的 content
    return path.join(process.resourcesPath, 'content')
  }
  // 开发环境：使用相对路径 (app/electron -> app/content)
  return path.join(__dirname, '../content')
}

class PtyService {
  constructor() {
    this.terminals = new Map()
  }

  create(id) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const cwd = getContentRoot()

    console.log('[PtyService] Creating PTY with shell:', shell, 'cwd:', cwd)

    try {
      const terminal = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
      })

      // 监听 PTY 退出事件
      terminal.onExit(({ exitCode, signal }) => {
        console.log('[PtyService] PTY exited with code:', exitCode, 'signal:', signal)
        this.terminals.delete(id)
      })

      this.terminals.set(id, terminal)
      console.log('[PtyService] PTY created successfully, pid:', terminal.pid)

      return terminal
    } catch (error) {
      console.error('[PtyService] Failed to create PTY:', error)
      throw error
    }
  }

  write(id, data) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      try {
        terminal.write(data)
      } catch (e) {
        console.warn('[PtyService] Write failed:', e.message)
      }
    } else {
      console.warn('[PtyService] Terminal not found for id:', id)
    }
  }

  resize(id, cols, rows) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      try {
        terminal.resize(cols, rows)
      } catch (e) {
        console.warn('[PtyService] Resize failed:', e.message)
      }
    }
  }

  destroy(id) {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.kill()
      this.terminals.delete(id)
    }
  }

  destroyAll() {
    for (const [, terminal] of this.terminals) {
      terminal.kill()
    }
    this.terminals.clear()
  }
}

export default new PtyService()
