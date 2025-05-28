// main.js
const { convertPngToJpegInDirectory } = require('./convertScreenshotsToJpeg');


const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'app_settings.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      tags TEXT,
      file_name TEXT,
      image_list TEXT
    )
  `).run();
}

// Load all settings
ipcMain.handle('get-app-settings', () => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = {};
  rows.forEach(row => {
    settings[row.key] = parseInt(row.value, 10); // Or JSON.parse if more complex
  });
  return settings;
});

// Update single setting
ipcMain.on('update-app-setting', (event, { key, value }) => {
  db.prepare(`
    INSERT INTO app_settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value.toString());
});

function getSetting(key) {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

ipcMain.handle('select-screenshot-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (!result.canceled && result.filePaths[0]) {
    setSetting('screenshot_folder', result.filePaths[0]);
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('get-screenshot-folder', async (event, videoPath) => {
  let folder = getSetting('screenshot_folder');
  if (!folder && videoPath) {
    const fallback = path.join(path.dirname(videoPath), 'screenshots');
    fs.mkdirSync(fallback, { recursive: true });
    folder = fallback;
  }
  
  return folder;
});

ipcMain.on('open-video-dialog', async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'mov'] },
    ],
  });

  if (!result.canceled && result.filePaths.length > 0) {
    event.reply('video-selected', result.filePaths[0]);
  }
});

ipcMain.handle('save-screenshot', async (event, { filePath, buffer }) => {
  const data = Buffer.from(buffer.split(',')[1], 'base64');
  fs.writeFileSync(filePath, data);
  return true;
});

ipcMain.handle('add-media-item', async (event, { name, fileName }) => {
  db.prepare(`
    INSERT INTO media_items (name, tags, file_name, image_list)
    VALUES (?, ?, ?, ?)
  `).run(name, '', fileName, JSON.stringify([]));
  return true;
});

ipcMain.handle('get-media-items', async () => {
  return db.prepare('SELECT * FROM media_items').all();
});

ipcMain.handle('read-screenshots', async (event, folder, name, imageCount) => {
  if (!fs.existsSync(folder)) return [];
  const all = fs.readdirSync(folder);
  return all
    .filter(f => f.startsWith(name.split('.')[0]) && /\.(png|jpe?g)$/.test(f))
    .sort()
    .slice(0, imageCount); // first 6 screenshots
});

ipcMain.handle('delete-media-item', async (event, id) => {
  db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
  return true;
});


ipcMain.on('show-context-menu', (event, mediaItemId) => {
  const template = [
     {
      label: 'Play on Hover',
      submenu: [
        {
          label: 'Enable',
          click: () => {
            event.sender.send('context-menu-command', { command: 'enable-hover' });
          }
        },
        {
          label: 'Disable',
          click: () => {
            event.sender.send('context-menu-command', { command: 'disable-hover' });
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Delete Item',
      click: () => {
        event.sender.send('context-menu-command', { command: 'delete-item', id: mediaItemId });
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        event.sender.send('context-menu-command', { command: 'open-settings-window' });
      }
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

let settingsWindow = null;

ipcMain.on('open-settings-window', () => {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 300,
    parent: BrowserWindow.getFocusedWindow(),
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'build', 'settings.html'));

  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
});





app.whenReady().then(() => {
  initDatabase();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  enableRemoteModule: false,
  nodeIntegration: false,
}
  });
  win.loadFile(path.join(__dirname, 'build', 'index.html'));
});

