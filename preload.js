// preload.js

const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  selectScreenshotFolder: () => ipcRenderer.invoke('select-screenshot-folder'),
  getScreenshotFolder: (videoPath) => ipcRenderer.invoke('get-screenshot-folder', videoPath),
  openVideoDialog: () => ipcRenderer.send('open-video-dialog'),
  onVideoSelected: (callback) => ipcRenderer.on('video-selected', (event, path) => callback(path)),
  saveScreenshot: (filePath, buffer) => ipcRenderer.invoke('save-screenshot', { filePath, buffer }),
  addMediaItem: (item) => ipcRenderer.invoke('add-media-item', item),
  getMediaItems: () => ipcRenderer.invoke('get-media-items'),
  readScreenshots: (folder, name, imageCount) => ipcRenderer.invoke('read-screenshots', folder, name, imageCount),
   showContextMenu: () => ipcRenderer.send('show-context-menu'),
  onContextCommand: (callback) => ipcRenderer.on('context-menu-command', (event, command) => callback(command))

});
