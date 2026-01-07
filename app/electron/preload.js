const { contextBridge, ipcRender } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  terminal: {
    create: () => ipcRender.invoke('terminal:create'),
    write: data => ipcRender.send('terminal:write', data),
    resize: (cols, rows) => ipcRender.send('terminal:resize', cols, rows),
    destroy: id => ipcRender.invoke('terminal:destroy', id),
    onData: callback => {
      const handler = (_event, data) => callback(data)
      ipcRender.on('terminal:data', handler)
      return () => ipcRender.removeListener('terminal:data', handler)
    },
  },

  platform: process.platform,
})
