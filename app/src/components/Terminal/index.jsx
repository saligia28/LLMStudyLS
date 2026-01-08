import React, { useEffect, useRef, useCallback } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

function Terminal() {
  const containerRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const cleanupRef = useRef(null)

  const initTerminal = useCallback(async () => {
    if (!containerRef.current || xtermRef.current) return

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selection: '#264f78',
      },
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.open(containerRef.current)

    setTimeout(() => fitAddon.fit(), 100)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    if (window.electronAPI?.terminal) {
      await window.electronAPI.terminal.create()

      cleanupRef.current = window.electronAPI.terminal.onData(data => {
        xterm.write(data)
      })

      xterm.onData(data => {
        window.electronAPI.terminal.write(data)
      })
    } else {
      xterm.writeln('\\x1b[33m终端功能需要在 Electron 环境中运行\\x1b[0m')
      xterm.writeln('')
    }
  }, [])

  useEffect(() => {
    /* --------------------------------
     1️⃣ 初始化终端（可能会在内部创建 xterm、fitAddon，并把清理函数存到 cleanupRef）
     -------------------------------- */
    initTerminal()

    /* --------------------------------
     2️⃣ 为窗口 resize 注册事件监听器
        该函数会在窗口尺寸改变时让终端重新适配大小
     -------------------------------- */

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
      }
    }

    window.addEventListener('resize', handleResize)

    /* --------------------------------
     3️⃣ 清理函数（在卸载或依赖变化前调用）
        - 移除 resize 监听
        - 调用 initTerminal 返回的清理函数（如果有）
        - 释放 xterm 实例
     -------------------------------- */
    return () => {
      window.removeEventListener('resize', handleResize)
      if (cleanupRef.current) {
        cleanupRef.current()
      }
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [initTerminal])

  return <div ref={containerRef} className="tw-w-full tw-h-full" />
}

export default Terminal
