import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'

function Terminal() {
  const containerRef = useRef(null)
  const xtermRef = useRef(null)
  const fitAddonRef = useRef(null)
  const cleanupRef = useRef(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    // 防止重复初始化
    if (initializedRef.current || !containerRef.current) return
    initializedRef.current = true

    const container = containerRef.current

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
    xterm.open(container)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // 延迟 fit，确保容器有尺寸
    const fitTerminal = () => {
      try {
        if (container.offsetWidth > 0 && container.offsetHeight > 0) {
          fitAddon.fit()
        }
      } catch (e) {
        console.warn('Terminal fit error:', e)
      }
    }

    setTimeout(fitTerminal, 150)

    // 初始化 PTY
    const initPty = async () => {
      if (window.electronAPI?.terminal) {
        try {
          await window.electronAPI.terminal.create()

          cleanupRef.current = window.electronAPI.terminal.onData(data => {
            if (xtermRef.current) {
              xtermRef.current.write(data)
            }
          })

          xterm.onData(data => {
            window.electronAPI.terminal.write(data)
          })
        } catch (e) {
          console.error('PTY init error:', e)
        }
      } else {
        xterm.writeln('\x1b[33m终端功能需要在 Electron 环境中运行\x1b[0m')
        xterm.writeln('')
      }
    }

    initPty()

    // resize 处理
    const handleResize = () => {
      fitTerminal()
    }

    window.addEventListener('resize', handleResize)

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize)
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
      fitAddonRef.current = null
      initializedRef.current = false
    }
  }, [])

  return <div ref={containerRef} className="tw-w-full tw-h-full" />
}

export default Terminal
