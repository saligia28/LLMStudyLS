import * as pty from 'node-pty'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class PtyService {
  constructor() {
    this.terminal = new Map()
  }

  create(id) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'zsh'

    const cwd = path.join(__dirname, '../../content')

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

    this.terminal.set(id, terminal)
    return terminal
  }

  write(id, data) {
    const terminal = this.terminal.get(id)
    if (terminal) {
      terminal.write(data)
    }
  }

  resize(id, cols, rows) {
    const terminal = this.terminal.get(id)
    if (terminal) {
      terminal.resize(cols, rows)
    }
  }

  destroy(id) {
    const terminal = this.terminal.get(id)
    if (terminal) {
      terminal.kill()
      this.terminal.delete(id)
    }
  }

  destroyAll() {
    for (const [_id, terminal] of this.terminal) {
      terminal.kill()
    }
    this.terminal.clear()
  }
}

export default new PtyService()
