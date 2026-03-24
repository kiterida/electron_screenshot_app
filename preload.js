// preload.js

const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('electronAPI', {
  selectScreenshotFolder: () => ipcRenderer.invoke('select-screenshot-folder'),
  getScreenshotFolder: (videoPath) => ipcRenderer.invoke('get-screenshot-folder', videoPath),
  openVideoDialog: () => ipcRenderer.send('open-video-dialog'),
  onVideoSelected: (callback) => ipcRenderer.on('video-selected', (event, path) => callback(path)),
  saveScreenshot: (filePath, buffer) => ipcRenderer.invoke('save-screenshot', { filePath, buffer }),
  addMediaItem: (item) => ipcRenderer.invoke('add-media-item', item),
  getOrCreateMediaItem: (filePath) => ipcRenderer.invoke('get-or-create-media-item', filePath),
  insertScreenshot: (payload) => ipcRenderer.invoke('insert-screenshot', payload),
  getMediaItems: () => ipcRenderer.invoke('get-media-items'),
  getScreenshotsForMediaItem: (mediaItemId, limit) => ipcRenderer.invoke('get-screenshots-for-media-item', mediaItemId, limit),
  getRandomUnseenScreenshots: (limit) => ipcRenderer.invoke('get-random-unseen-screenshots', limit),
  getIgnoredScreenshots: () => ipcRenderer.invoke('get-ignored-screenshots'),
  migrateScreenshotsFromFolder: () => ipcRenderer.invoke('migrate-screenshots-from-folder'),
  markScreenshotDisplayed: (screenshotIds) => ipcRenderer.invoke('mark-screenshot-displayed', screenshotIds),
  ignoreScreenshot: (screenshotId, ignored = 1) => ipcRenderer.invoke('ignore-screenshot', screenshotId, ignored),
  getMediaItemForScreenshot: (screenshotId) => ipcRenderer.invoke('get-media-item-for-screenshot', screenshotId),
  readScreenshots: (folder, name, imageCount) => ipcRenderer.invoke('read-screenshots', folder, name, imageCount),
  showContextMenu: (payload) => ipcRenderer.send('show-context-menu', payload),
  onContextCommand: (callback) => ipcRenderer.on('context-menu-command', (event, data) => callback(data)),
  deleteMediaItem: (id) => ipcRenderer.invoke('delete-media-item', id),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
   getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  updateAppSetting: (key, value) => ipcRenderer.send('update-app-setting', { key, value }),
  getDatabasePath: () => ipcRenderer.invoke('get-database-path'),
  selectExistingDatabaseFile: () => ipcRenderer.invoke('select-existing-database-file'),
  createDatabaseFile: () => ipcRenderer.invoke('create-database-file'),
  openScreenshotFolder: (filePath) => ipcRenderer.send('open-screenshot-folder', filePath),
  openFileLocation: (filePath) => ipcRenderer.send('open-file-location', filePath),
  searchMediaItems: (query) => ipcRenderer.invoke('search-media-items', query),
  getMediaItemByName: (name) => ipcRenderer.invoke('get-media-item-by-name', name),
  getAllMediaItems: () => ipcRenderer.invoke('get-all-media-items'),
  getDisplayedScreenshotPaths: () => ipcRenderer.invoke('get-displayed-screenshot-paths'),
  markDisplayedScreenshots: (paths) => ipcRenderer.invoke('mark-displayed-screenshots', paths),
  clearDisplayedScreenshots: () => ipcRenderer.invoke('clear-displayed-screenshots'),
  getIgnoredRandomScreenshotPaths: () => ipcRenderer.invoke('get-ignored-random-screenshot-paths'),
  ignoreRandomScreenshot: (path) => ipcRenderer.invoke('ignore-random-screenshot', path),

});
