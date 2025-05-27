const { ipcMain, dialog } = require('electron');
const { getSetting, setSetting, initDatabase } = require('./db');
const { ensureScreenshotFolder } = require('./image');

function registerIpcHandlers() {
    initDatabase();

    ipcMain.handle('select-screenshot-folder', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (!result.canceled && result.filePaths[0]) {
            setSetting('screenshot_folder', result.filePaths[0]);
            return result.filePaths[0];
        }
        return null;
    });

    ipcMain.handle('get-screenshot-folder', async (_event, videoPath) => {
        return ensureScreenshotFolder(videoPath);
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'webm'] }],
        });
        if (!result.canceled) return result.filePaths;
        return null;
    });

    ipcMain.handle('select-video-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv'] }
            ]
        });
        if (!result.canceled && result.filePaths.length > 0) {
            return result.filePaths[0]; // return the selected file path
        }
        return null;
    });

}

module.exports = { registerIpcHandlers };
