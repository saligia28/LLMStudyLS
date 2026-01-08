const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  terminal: {
    create: () => ipcRenderer.invoke('terminal:create'),
    write: data => ipcRenderer.send('terminal:write', data),
    resize: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
    destroy: id => ipcRenderer.invoke('terminal:destroy', id),
    onData: callback => {
      const handler = (_event, data) => callback(data)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
  },

  platform: process.platform,
})
