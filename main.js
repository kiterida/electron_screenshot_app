// main.js
const { convertPngToJpegInDirectory } = require('./convertScreenshotsToJpeg');


const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;

function getDbPath() {
  if (isDev) {
    // In development, use local folder
    return path.join(__dirname, 'app_settings.db');
  } else {
    // In production, use directory where EXE is located
    return path.join(path.dirname(process.execPath), 'app_settings.db');
  }
}


const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
let currentDbPath;
let requestedDbPath = null;

function getDbConfigPath() {
  return path.join(app.getPath('userData'), 'db-config.json');
}

function getDefaultDbPath() {
  return path.join(app.getPath('userData'), 'app_settings.db');
}

function readStoredDbPath() {
  const configPath = getDbConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config.dbPath || null;
  } catch (error) {
    console.warn('Failed to read database config:', error);
    return null;
  }
}

function persistDbPath(dbPath) {
  fs.writeFileSync(getDbConfigPath(), JSON.stringify({ dbPath }, null, 2));
}

function ensureDatabaseSchema(database) {
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      tags TEXT,
      file_name TEXT,
      image_list TEXT
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      timestamp_seconds REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_ignored INTEGER NOT NULL DEFAULT 0,
      has_been_displayed INTEGER NOT NULL DEFAULT 0,
      last_displayed_at TEXT,
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
    )
  `).run();

  database.prepare(`
    CREATE INDEX IF NOT EXISTS idx_screenshots_media_item_id
    ON screenshots (media_item_id)
  `).run();

  database.prepare(`
    CREATE INDEX IF NOT EXISTS idx_screenshots_random_pool
    ON screenshots (is_ignored, has_been_displayed)
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS displayed_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screenshot_path TEXT NOT NULL UNIQUE,
      displayed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS ignored_random_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      screenshot_path TEXT NOT NULL UNIQUE,
      ignored_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

function normalizeScreenshotPath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function normalizeFilePath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function getMediaBaseName(filePathOrName) {
  return path.basename(filePathOrName).replace(/\.(mp4|mov|avi|mpg|mkv|webm)$/i, '');
}

function getScreenshotMediaKey(fileName) {
  const match = fileName.match(/^(.*)_\d{2}-\d{2}-\d{2}\.(png|jpe?g)$/i);
  return match ? match[1] : null;
}

function parseTimestampFromScreenshotFileName(fileName) {
  const match = fileName.match(/_(\d{2})-(\d{2})-(\d{2})\.(png|jpe?g)$/i);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds] = match;
  return (Number(hours) * 3600) + (Number(minutes) * 60) + Number(seconds);
}

function buildScreenshotRowWithMedia(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.screenshot_id,
    media_item_id: row.media_item_id,
    file_name: row.screenshot_file_name,
    file_path: row.screenshot_file_path,
    timestamp_seconds: row.timestamp_seconds,
    created_at: row.created_at,
    is_ignored: row.is_ignored,
    has_been_displayed: row.has_been_displayed,
    last_displayed_at: row.last_displayed_at,
    mediaItem: row.media_id ? {
      id: row.media_id,
      name: row.media_name,
      tags: row.media_tags,
      file_name: row.media_file_name,
      image_list: row.media_image_list,
    } : null,
  };
}

function syncLegacyScreenshotState() {
  db.prepare(`
    UPDATE screenshots
    SET is_ignored = 1
    WHERE file_path IN (
      SELECT screenshot_path FROM ignored_random_screenshots
    )
  `).run();

  db.prepare(`
    UPDATE screenshots
    SET has_been_displayed = 1,
        last_displayed_at = COALESCE(last_displayed_at, CURRENT_TIMESTAMP)
    WHERE file_path IN (
      SELECT screenshot_path FROM displayed_screenshots
    )
  `).run();
}

function getOrCreateMediaItem(filePath) {
  const normalizedFilePath = normalizeFilePath(filePath);
  const mediaName = path.basename(normalizedFilePath);

  let mediaItem = db.prepare(`
    SELECT * FROM media_items
    WHERE file_name = ?
    LIMIT 1
  `).get(normalizedFilePath);

  if (mediaItem) {
    return mediaItem;
  }

  mediaItem = db.prepare(`
    SELECT * FROM media_items
    WHERE name = ?
    LIMIT 1
  `).get(mediaName);

  if (mediaItem) {
    db.prepare(`
      UPDATE media_items
      SET file_name = COALESCE(NULLIF(file_name, ''), ?)
      WHERE id = ?
    `).run(normalizedFilePath, mediaItem.id);

    return db.prepare('SELECT * FROM media_items WHERE id = ?').get(mediaItem.id);
  }

  const result = db.prepare(`
    INSERT INTO media_items (name, tags, file_name, image_list)
    VALUES (?, ?, ?, ?)
  `).run(mediaName, '', normalizedFilePath, JSON.stringify([]));

  return db.prepare('SELECT * FROM media_items WHERE id = ?').get(result.lastInsertRowid);
}

function insertScreenshot(mediaItemId, screenshotPath, timestampSeconds) {
  const normalizedPath = normalizeScreenshotPath(screenshotPath);
  const screenshotFileName = path.basename(normalizedPath);
  const parsedTimestamp = Number.isFinite(timestampSeconds)
    ? timestampSeconds
    : parseTimestampFromScreenshotFileName(screenshotFileName);

  db.prepare(`
    INSERT INTO screenshots (
      media_item_id,
      file_name,
      file_path,
      timestamp_seconds
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(file_path) DO UPDATE SET
      media_item_id = excluded.media_item_id,
      file_name = excluded.file_name,
      timestamp_seconds = COALESCE(excluded.timestamp_seconds, screenshots.timestamp_seconds)
  `).run(mediaItemId, screenshotFileName, normalizedPath, parsedTimestamp);

  syncLegacyScreenshotState();

  return db.prepare(`
    SELECT * FROM screenshots
    WHERE file_path = ?
  `).get(normalizedPath);
}

function syncScreenshotsFromFolder(folder) {
  if (!folder || !fs.existsSync(folder)) {
    return {
      inserted: 0,
      matched: 0,
      scanned: 0,
      unmatched: [],
    };
  }

  const mediaItems = db.prepare('SELECT id, name, file_name FROM media_items').all();
  if (mediaItems.length === 0) {
    return {
      inserted: 0,
      matched: 0,
      scanned: 0,
      unmatched: [],
    };
  }

    const insertMany = db.transaction((imageFiles) => {
      let inserted = 0;
      let matched = 0;
      const unmatched = [];

      for (const screenshotFileName of imageFiles) {
        const mediaKey = getScreenshotMediaKey(screenshotFileName);
        if (!mediaKey) {
        unmatched.push({
          file_name: screenshotFileName,
          file_path: normalizeScreenshotPath(path.join(folder, screenshotFileName)),
        });
          continue;
        }

      const likePattern = `%${mediaKey}%`;
      const mediaItem = db.prepare(`
        SELECT *
        FROM media_items
        WHERE name LIKE ?
           OR file_name LIKE ?
        ORDER BY
          CASE
            WHEN name = ? THEN 0
            WHEN file_name LIKE ? THEN 1
            ELSE 2
          END,
          LENGTH(name),
          id
        LIMIT 1
      `).get(
        likePattern,
        likePattern,
        mediaKey,
        `%${mediaKey}.%`
      );

      if (!mediaItem) {
        unmatched.push({
          file_name: screenshotFileName,
          file_path: normalizeScreenshotPath(path.join(folder, screenshotFileName)),
        });
        continue;
      }

      matched += 1;

      const screenshotPath = normalizeScreenshotPath(path.join(folder, screenshotFileName));
      const timestampSeconds = parseTimestampFromScreenshotFileName(screenshotFileName);

      const result = db.prepare(`
        INSERT OR IGNORE INTO screenshots (
          media_item_id,
          file_name,
          file_path,
          timestamp_seconds
        )
        VALUES (?, ?, ?, ?)
      `).run(mediaItem.id, screenshotFileName, screenshotPath, timestampSeconds);

      inserted += result.changes;
    }

    return {
      inserted,
      matched,
      unmatched,
    };
  });

  const imageFiles = fs.readdirSync(folder)
    .filter((fileName) => /\.(png|jpe?g)$/i.test(fileName));

  const result = insertMany(imageFiles);
  syncLegacyScreenshotState();
  return {
    inserted: result.inserted,
    matched: result.matched,
    scanned: imageFiles.length,
    unmatched: result.unmatched,
  };
}

function getScreenshotsForMediaItem(mediaItemId, limit = 100) {
  return db.prepare(`
    SELECT *
    FROM screenshots
    WHERE media_item_id = ?
    ORDER BY COALESCE(timestamp_seconds, 0), id
    LIMIT ?
  `).all(mediaItemId, limit);
}

function getRandomUnseenScreenshots(limit) {
  const screenshotFolder = getSetting('screenshot_folder');
  syncScreenshotsFromFolder(screenshotFolder);

  const randomQuery = `
    SELECT
      s.id AS screenshot_id,
      s.media_item_id,
      s.file_name AS screenshot_file_name,
      s.file_path AS screenshot_file_path,
      s.timestamp_seconds,
      s.created_at,
      s.is_ignored,
      s.has_been_displayed,
      s.last_displayed_at,
      m.id AS media_id,
      m.name AS media_name,
      m.tags AS media_tags,
      m.file_name AS media_file_name,
      m.image_list AS media_image_list
    FROM screenshots s
    INNER JOIN media_items m ON m.id = s.media_item_id
    WHERE s.is_ignored = 0
      AND s.has_been_displayed = 0
    ORDER BY RANDOM()
    LIMIT ?
  `;

  let rows = db.prepare(randomQuery).all(limit);

  if (rows.length === 0) {
    db.prepare(`
      UPDATE screenshots
      SET has_been_displayed = 0,
          last_displayed_at = NULL
      WHERE is_ignored = 0
    `).run();

    rows = db.prepare(randomQuery).all(limit);
  }

  return rows.map(buildScreenshotRowWithMedia);
}

function markScreenshotDisplayed(screenshotIds = []) {
  if (!Array.isArray(screenshotIds) || screenshotIds.length === 0) {
    return 0;
  }

  const updateOne = db.prepare(`
    UPDATE screenshots
    SET has_been_displayed = 1,
        last_displayed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const updateMany = db.transaction((ids) => {
    let updated = 0;
    for (const screenshotId of ids) {
      updated += updateOne.run(screenshotId).changes;
    }
    return updated;
  });

  return updateMany(screenshotIds);
}

function ignoreScreenshot(screenshotId, ignored = 1) {
  return db.prepare(`
    UPDATE screenshots
    SET is_ignored = ?
    WHERE id = ?
  `).run(ignored ? 1 : 0, screenshotId).changes;
}

function getMediaItemForScreenshot(screenshotId) {
  return db.prepare(`
    SELECT
      m.*
    FROM screenshots s
    INNER JOIN media_items m ON m.id = s.media_item_id
    WHERE s.id = ?
  `).get(screenshotId);
}

function getIgnoredScreenshots() {
  const screenshotFolder = getSetting('screenshot_folder');
  syncScreenshotsFromFolder(screenshotFolder);

  const rows = db.prepare(`
    SELECT
      s.id AS screenshot_id,
      s.media_item_id,
      s.file_name AS screenshot_file_name,
      s.file_path AS screenshot_file_path,
      s.timestamp_seconds,
      s.created_at,
      s.is_ignored,
      s.has_been_displayed,
      s.last_displayed_at,
      m.id AS media_id,
      m.name AS media_name,
      m.tags AS media_tags,
      m.file_name AS media_file_name,
      m.image_list AS media_image_list
    FROM screenshots s
    INNER JOIN media_items m ON m.id = s.media_item_id
    WHERE s.is_ignored = 1
    ORDER BY s.created_at DESC, s.id DESC
  `).all();

  return rows.map(buildScreenshotRowWithMedia);
}

function getDisplayedScreenshotPaths() {
  const rows = db.prepare('SELECT screenshot_path FROM displayed_screenshots').all();
  return rows.map((row) => row.screenshot_path);
}

function markDisplayedScreenshots(screenshotPaths = []) {
  if (!Array.isArray(screenshotPaths) || screenshotPaths.length === 0) {
    return 0;
  }

  const insertScreenshot = db.prepare(`
    INSERT OR IGNORE INTO displayed_screenshots (screenshot_path)
    VALUES (?)
  `);

  const insertMany = db.transaction((pathsToInsert) => {
    let inserted = 0;
    for (const screenshotPath of pathsToInsert) {
      const normalizedPath = normalizeScreenshotPath(screenshotPath);
      const result = insertScreenshot.run(normalizedPath);
      inserted += result.changes;
    }
    return inserted;
  });

  return insertMany(screenshotPaths);
}

function clearDisplayedScreenshots() {
  const result = db.prepare('DELETE FROM displayed_screenshots').run();
  return result.changes;
}

function getIgnoredRandomScreenshotPaths() {
  const rows = db.prepare('SELECT screenshot_path FROM ignored_random_screenshots').all();
  return rows.map((row) => row.screenshot_path);
}

function ignoreRandomScreenshot(screenshotPath) {
  if (!screenshotPath) {
    return 0;
  }

  const normalizedPath = normalizeScreenshotPath(screenshotPath);
  const result = db.prepare(`
    INSERT OR IGNORE INTO ignored_random_screenshots (screenshot_path)
    VALUES (?)
  `).run(normalizedPath);

  return result.changes;
}

function closeDatabase() {
  if (!db) {
    return;
  }

  try {
    db.pragma('wal_checkpoint(FULL)');
  } catch (error) {
    console.warn('Failed to checkpoint database before closing:', error);
  }

  db.close();
  db = null;
}

function initDatabase(dbPath = readStoredDbPath() || getDefaultDbPath()) {
  const dbExists = fs.existsSync(dbPath);
  requestedDbPath = dbPath;

  closeDatabase();

  db = new Database(dbExists ? dbPath : ':memory:');
  ensureDatabaseSchema(db);
  currentDbPath = dbExists ? dbPath : null;

  if (dbExists && dbPath !== getDefaultDbPath()) {
    persistDbPath(dbPath);
  }

  return currentDbPath;
}

function setDatabasePath(nextDbPath) {
  const resolvedPath = path.resolve(nextDbPath);
  const previousDbPath = currentDbPath || readStoredDbPath() || getDefaultDbPath();
  const shouldCopyExistingDb = !fs.existsSync(resolvedPath) && fs.existsSync(previousDbPath) && previousDbPath !== resolvedPath;

  closeDatabase();
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  if (shouldCopyExistingDb) {
    fs.copyFileSync(previousDbPath, resolvedPath);
  }

  persistDbPath(resolvedPath);
  initDatabase(resolvedPath);

  return currentDbPath;
}

// Load all settings
ipcMain.handle('get-app-settings', () => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const settings = { database_file: currentDbPath || '', requested_database_file: requestedDbPath || '' };
  rows.forEach(row => {
    const parsedValue = parseInt(row.value, 10);
    settings[row.key] = Number.isNaN(parsedValue) ? row.value : parsedValue;
  });
  return settings;
});

ipcMain.handle('get-database-path', () => currentDbPath);

ipcMain.handle('select-existing-database-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Existing SQLite Database File',
    properties: ['openFile'],
    defaultPath: currentDbPath || requestedDbPath || getDefaultDbPath(),
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return setDatabasePath(result.filePaths[0]);
});

ipcMain.handle('create-database-file', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Create SQLite Database File',
    defaultPath: currentDbPath || requestedDbPath || getDefaultDbPath(),
    filters: [
      { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  return setDatabasePath(result.filePath);
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
  return getOrCreateMediaItem(fileName || name);
});

ipcMain.handle('get-media-items', async () => {
  return db.prepare('SELECT * FROM media_items').all();
});

ipcMain.handle('get-or-create-media-item', async (event, filePath) => {
  try {
    const mediaItem = getOrCreateMediaItem(filePath);
    console.log('get-or-create-media-item:', mediaItem);
    return mediaItem;
  } catch (error) {
    console.error('Failed to get or create media item:', error);
    throw error;
  }
});

ipcMain.handle('insert-screenshot', async (event, { mediaItemId, screenshotPath, timestampSeconds }) => {
  try {
    const screenshot = insertScreenshot(mediaItemId, screenshotPath, timestampSeconds);
    console.log('insert-screenshot:', screenshot);
    return screenshot;
  } catch (error) {
    console.error('Failed to insert screenshot:', error);
    throw error;
  }
});

ipcMain.handle('get-screenshots-for-media-item', async (event, mediaItemId, limit = 100) => {
  try {
    const screenshotFolder = getSetting('screenshot_folder');
    syncScreenshotsFromFolder(screenshotFolder);
    return getScreenshotsForMediaItem(mediaItemId, limit);
  } catch (error) {
    console.error('Failed to load screenshots for media item:', error);
    throw error;
  }
});

ipcMain.handle('get-random-unseen-screenshots', async (event, limit = 60) => {
  try {
    const screenshots = getRandomUnseenScreenshots(limit);
    console.log(`Loaded ${screenshots.length} random unseen screenshot(s).`);
    return screenshots;
  } catch (error) {
    console.error('Failed to load random unseen screenshots:', error);
    throw error;
  }
});

ipcMain.handle('migrate-screenshots-from-folder', async () => {
  try {
    const screenshotFolder = getSetting('screenshot_folder');
    if (!screenshotFolder) {
      return {
        ok: false,
        message: 'Screenshot folder is not configured.',
        inserted: 0,
        matched: 0,
        scanned: 0,
      };
    }

    const result = syncScreenshotsFromFolder(screenshotFolder);
    console.log('migrate-screenshots-from-folder:', { folder: screenshotFolder, ...result });

    return {
      ok: true,
      folder: screenshotFolder,
      ...result,
    };
  } catch (error) {
    console.error('Failed to migrate screenshots from folder:', error);
    throw error;
  }
});

ipcMain.handle('mark-screenshot-displayed', async (event, screenshotIds) => {
  try {
    const updated = markScreenshotDisplayed(screenshotIds);
    console.log(`Marked ${updated} screenshot(s) as displayed.`);
    return updated;
  } catch (error) {
    console.error('Failed to mark screenshots as displayed:', error);
    throw error;
  }
});

ipcMain.handle('ignore-screenshot', async (event, screenshotId, ignored = 1) => {
  try {
    const updated = ignoreScreenshot(screenshotId, ignored);
    console.log(`Updated ignore state for screenshot ${screenshotId}. Rows changed: ${updated}.`);
    return updated;
  } catch (error) {
    console.error('Failed to update screenshot ignore state:', error);
    throw error;
  }
});

ipcMain.handle('get-media-item-for-screenshot', async (event, screenshotId) => {
  try {
    return getMediaItemForScreenshot(screenshotId);
  } catch (error) {
    console.error('Failed to load media item for screenshot:', error);
    throw error;
  }
});

ipcMain.handle('get-media-item-by-id', async (event, mediaItemId) => {
  try {
    return db.prepare('SELECT * FROM media_items WHERE id = ?').get(mediaItemId);
  } catch (error) {
    console.error('Failed to load media item by id:', error);
    throw error;
  }
});

ipcMain.handle('get-ignored-screenshots', async () => {
  try {
    const screenshots = getIgnoredScreenshots();
    console.log(`Loaded ${screenshots.length} ignored screenshot(s).`);
    return screenshots;
  } catch (error) {
    console.error('Failed to load ignored screenshots:', error);
    throw error;
  }
});

// ipcMain.handle('read-screenshots', async (event, folder, name, imageCount) => {
//   if (!fs.existsSync(folder)) return [];
//   const all = fs.readdirSync(folder);
//   return all
//     .filter(f => f.startsWith(name.split('.')[0]) && /\.(png|jpe?g)$/.test(f))
//     .sort()
//     .slice(0, imageCount); // first 6 screenshots
// });

ipcMain.handle('read-screenshots', async (event, folder, videoFilename, imageCount) => {
  if (!fs.existsSync(folder)) return [];

  const all = fs.readdirSync(folder);

  // Remove only the final video extension (preserve full filename up to it)
  const baseName = videoFilename.replace(/\.(mp4|mov|avi|mpg|mkv|webm)$/i, '');

  return all
    .filter(f => f.startsWith(baseName) && /\.(png|jpe?g)$/i.test(f))
    .sort()
    .slice(0, imageCount);
});


ipcMain.handle('delete-media-item', async (event, id) => {
  db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
  return true;
});

ipcMain.on('open-screenshot-folder', (event, filePath) => {
  console.log('open-screenshot-folder', filePath);
  if (filePath) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.on('open-file-location', (event, filePath) => {
   if (filePath) {
    if (process.platform === 'win32') {
      execFile('explorer.exe', ['/select,', path.normalize(filePath)], (error) => {
        if (error) {
          console.warn('Failed to reveal file with explorer.exe, falling back to shell.showItemInFolder:', error);
          shell.showItemInFolder(filePath);
        }
      });
      return;
    }

    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('search-media-items', async (event, query) => {
  const stmt = db.prepare(`
    SELECT * FROM media_items
    WHERE name LIKE ?
  `);
  return stmt.all(`%${query}%`);
});

ipcMain.handle('get-media-item-by-name', (event, name) => {
  const stmt = db.prepare('SELECT * FROM media_items WHERE name LIKE ?');
  const likePattern = `%${name}%`;
  return stmt.get(likePattern);
});

ipcMain.handle('get-displayed-screenshot-paths', () => {
  try {
    const screenshotPaths = getDisplayedScreenshotPaths();
    console.log(`Loaded ${screenshotPaths.length} displayed screenshot path(s) from SQLite.`);
    return screenshotPaths;
  } catch (error) {
    console.error('Failed to read displayed screenshots from SQLite:', error);
    throw error;
  }
});

ipcMain.handle('mark-displayed-screenshots', (event, screenshotPaths) => {
  try {
    const inserted = markDisplayedScreenshots(screenshotPaths);
    console.log(`Recorded ${inserted} displayed screenshot(s) in SQLite.`);
    return inserted;
  } catch (error) {
    console.error('Failed to record displayed screenshots in SQLite:', error);
    throw error;
  }
});

ipcMain.handle('clear-displayed-screenshots', () => {
  try {
    const cleared = clearDisplayedScreenshots();
    console.log(`Cleared ${cleared} displayed screenshot tracking record(s).`);
    return cleared;
  } catch (error) {
    console.error('Failed to clear displayed screenshot tracking table:', error);
    throw error;
  }
});

ipcMain.handle('get-ignored-random-screenshot-paths', () => {
  try {
    const screenshotPaths = getIgnoredRandomScreenshotPaths();
    console.log(`Loaded ${screenshotPaths.length} ignored random screenshot path(s) from SQLite.`);
    return screenshotPaths;
  } catch (error) {
    console.error('Failed to read ignored random screenshots from SQLite:', error);
    throw error;
  }
});

ipcMain.handle('ignore-random-screenshot', (event, screenshotPath) => {
  try {
    const normalizedPath = normalizeScreenshotPath(screenshotPath);
    const screenshot = db.prepare('SELECT id FROM screenshots WHERE file_path = ?').get(normalizedPath);
    if (!screenshot) {
      const inserted = ignoreRandomScreenshot(screenshotPath);
      console.log(`Ignored legacy random screenshot path saved. Inserted rows: ${inserted}.`);
      return inserted;
    }

    return ignoreScreenshot(screenshot.id, 1);
  } catch (error) {
    console.error('Failed to save ignored random screenshot path:', error);
    throw error;
  }
});


ipcMain.handle('get-all-media-items', async () => {
  const rows = db.prepare('SELECT * FROM media_items').all();
  return rows;
});





ipcMain.on('show-context-menu', (event, payload = {}) => {
  const screenshotId = payload.screenshotId || null;
  const screenshotPath = payload.screenshotPath || null;
  let mediaItemId = payload.mediaItemId || null;
  let filePath = payload.filePath || null;

  if (screenshotId && (!mediaItemId || !filePath)) {
    const mediaItem = getMediaItemForScreenshot(screenshotId);
    if (mediaItem) {
      mediaItemId = mediaItem.id;
      filePath = mediaItem.file_name;
    }
  }

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
    {
      label: 'Open File Location',
      enabled: Boolean(filePath),
      click: () => {
        event.sender.send('context-menu-command', { command: 'open-file-location', path: filePath});
      }
    },
    {
  label: 'Open Screenshot Folder',
  enabled: Boolean(screenshotPath),
  click: () => {
    event.sender.send('context-menu-command', { command: 'open-screenshot-folder', path: screenshotPath });
  }
}
,
    {
      label: 'Ignore from Random Selection',
      enabled: Boolean(screenshotId || screenshotPath),
      click: () => {
        event.sender.send('context-menu-command', { command: 'ignore-from-random-selection', screenshotId, screenshotPath });
      }
    },
    {
      label: 'Show All Screenshots For This Media Item',
      enabled: Boolean(mediaItemId),
      click: () => {
        event.sender.send('context-menu-command', {
          command: 'show-all-screenshots-for-media-item',
          mediaItemId,
        });
      }
    },
    { type: 'separator' },
    {
      label: 'Delete Item',
      enabled: Boolean(mediaItemId),
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
let mainWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
}

async function promptForDatabasePath() {
  const choice = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Select Existing Database', 'Create New Database', 'Quit'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: 'Database Required',
    message: 'No SQLite database was found.',
    detail: 'Select an existing database or create a new one before the app starts.',
  });

  if (choice.response === 0) {
    const result = await dialog.showOpenDialog({
      title: 'Select Existing SQLite Database File',
      properties: ['openFile'],
      defaultPath: requestedDbPath || getDefaultDbPath(),
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    return result.canceled ? null : result.filePaths[0];
  }

  if (choice.response === 1) {
    const result = await dialog.showSaveDialog({
      title: 'Create SQLite Database File',
      defaultPath: requestedDbPath || getDefaultDbPath(),
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    return result.canceled ? null : result.filePath;
  }

  return false;
}

async function ensureDatabaseReady() {
  const initialDbPath = readStoredDbPath() || getDefaultDbPath();
  requestedDbPath = initialDbPath;

  if (fs.existsSync(initialDbPath)) {
    initDatabase(initialDbPath);
    return true;
  }

  while (true) {
    const selectedPath = await promptForDatabasePath();

    if (selectedPath === false) {
      return false;
    }

    if (!selectedPath) {
      continue;
    }

    setDatabasePath(selectedPath);
    return true;
  }
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 300,
    parent: BrowserWindow.getFocusedWindow() || mainWindow,
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
}

ipcMain.on('open-settings-window', () => {
  openSettingsWindow();
});

ipcMain.on('open-media-table', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-media-table');
  } else {
    event.sender.send('open-media-table');
  }
});





app.whenReady().then(async () => {
  const databaseReady = await ensureDatabaseReady();
  if (!databaseReady) {
    app.quit();
    return;
  }

  createMainWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});

