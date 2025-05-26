const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  selectScreenshotFolder: () => ipcRenderer.invoke('select-screenshot-folder'),
  getScreenshotFolder: (videoPath) => ipcRenderer.invoke('get-screenshot-folder', videoPath),
  openVideoDialog: () => ipcRenderer.send('open-video-dialog'),
  onVideoSelected: (callback) => ipcRenderer.on('video-selected', (event, path) => callback(path)),
  saveScreenshot: (filePath, buffer) => ipcRenderer.invoke('save-screenshot', { filePath, buffer }),

});
