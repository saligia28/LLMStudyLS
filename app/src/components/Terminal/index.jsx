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
  const terminalIdRef = useRef(null)

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

    // 延迟 fit 以确保容器尺寸正确
    setTimeout(() => fitAddon.fit(), 100)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // 创建 PTY 终端
    if (window.electronAPI?.terminal) {
      const id = await window.electronAPI.terminal.create()
      terminalIdRef.current = id

      // 先注册监听终端输出
      cleanupRef.current = window.electronAPI.terminal.onData(data => {
        xterm.write(data)
      })

      // 监听用户输入
      xterm.onData(data => {
        window.electronAPI.terminal.write(data)
      })

      // 注册完成后，发送换行触发提示符显示
      setTimeout(() => {
        window.electronAPI.terminal.write('\n')
      }, 100)

      // 同步初始尺寸
      setTimeout(() => {
        if (fitAddonRef.current && window.electronAPI?.terminal) {
          const { cols, rows } = fitAddonRef.current.proposeDimensions() || { cols: 80, rows: 24 }
          window.electronAPI.terminal.resize(cols, rows)
        }
      }, 150)
    } else {
      // 非 Electron 环境的提示
      xterm.writeln('\\x1b[33m终端功能需要在 Electron 环境中运行\\x1b[0m')
      xterm.writeln('')
    }
  }, [])

  useEffect(() => {
    initTerminal()

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        // 同步 resize 到 PTY
        if (window.electronAPI?.terminal) {
          const { cols, rows } = fitAddonRef.current.proposeDimensions() || { cols: 80, rows: 24 }
          window.electronAPI.terminal.resize(cols, rows)
        }
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (cleanupRef.current) {
        cleanupRef.current()
      }
      // 销毁 PTY
      if (terminalIdRef.current && window.electronAPI?.terminal) {
        window.electronAPI.terminal.destroy(terminalIdRef.current)
        terminalIdRef.current = null
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
