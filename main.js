// main.js
const { convertPngToJpegInDirectory } = require('./convertScreenshotsToJpeg');


const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { execFile } = require('child_process');

const isDev = !app.isPackaged;
const ffmpegExecutable = 'C:\\ffmpeg\\bin\\ffmpeg.exe';

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
const activeRandomScreenshotStreams = new Map();

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
    CREATE TABLE IF NOT EXISTS exported_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      media_item_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL UNIQUE,
      start_seconds REAL,
      end_seconds REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
    )
  `).run();

  database.prepare(`
    CREATE INDEX IF NOT EXISTS idx_exported_videos_media_item_id
    ON exported_videos (media_item_id)
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

  database.prepare(`
    CREATE TABLE IF NOT EXISTS media_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  database.prepare(`
    CREATE TABLE IF NOT EXISTS media_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      list_id INTEGER NOT NULL,
      media_item_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(list_id, media_item_id),
      FOREIGN KEY (list_id) REFERENCES media_lists(id) ON DELETE CASCADE,
      FOREIGN KEY (media_item_id) REFERENCES media_items(id) ON DELETE CASCADE
    )
  `).run();

  database.prepare(`
    CREATE INDEX IF NOT EXISTS idx_media_list_items_list_id
    ON media_list_items (list_id)
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

  const createdMediaItem = db.prepare('SELECT * FROM media_items WHERE id = ?').get(result.lastInsertRowid);
  const newList = ensureMediaList('New');
  addMediaItemToList(newList.id, createdMediaItem.id);

  return createdMediaItem;
}

function getMediaItemByFilePath(filePath) {
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

  return null;
}

function getMediaLists() {
  return db.prepare(`
    SELECT
      ml.id,
      ml.name,
      ml.created_at,
      COUNT(mli.id) AS item_count
    FROM media_lists ml
    LEFT JOIN media_list_items mli ON mli.list_id = ml.id
    GROUP BY ml.id
    ORDER BY LOWER(ml.name) ASC
  `).all();
}

function parseMediaImageList(imageListValue) {
  if (!imageListValue) {
    return Array(8).fill(null);
  }

  try {
    const parsed = JSON.parse(imageListValue);
    if (!Array.isArray(parsed)) {
      return Array(8).fill(null);
    }

    const normalized = parsed.slice(0, 8).map((value) => {
      if (value == null) {
        return null;
      }

      const parsedValue = Number(value);
      return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
    });

    while (normalized.length < 8) {
      normalized.push(null);
    }

    return normalized;
  } catch (error) {
    return Array(8).fill(null);
  }
}

function orderScreenshotsByMediaImageList(screenshots, imageListValue) {
  const preferredIds = parseMediaImageList(imageListValue).filter(Boolean);
  if (preferredIds.length === 0 || !Array.isArray(screenshots) || screenshots.length === 0) {
    return screenshots;
  }

  const screenshotMap = new Map(screenshots.map((screenshot) => [Number(screenshot.id), screenshot]));
  const ordered = [];
  const usedIds = new Set();

  preferredIds.forEach((id) => {
    const screenshot = screenshotMap.get(id);
    if (screenshot && !usedIds.has(id)) {
      ordered.push(screenshot);
      usedIds.add(id);
    }
  });

  screenshots.forEach((screenshot) => {
    const id = Number(screenshot.id);
    if (!usedIds.has(id)) {
      ordered.push(screenshot);
    }
  });

  return ordered;
}

function updateMediaItemImageList(mediaItemId, imageList) {
  const sanitized = Array.isArray(imageList)
    ? imageList.slice(0, 8).map((value) => {
        if (value == null) {
          return null;
        }

        const parsedValue = Number(value);
        return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
      })
    : [];

  db.prepare(`
    UPDATE media_items
    SET image_list = ?
    WHERE id = ?
  `).run(JSON.stringify(sanitized), mediaItemId);

  return db.prepare('SELECT * FROM media_items WHERE id = ?').get(mediaItemId);
}

function deleteMediaItem(mediaItemId) {
  const normalizedMediaItemId = Number(mediaItemId);
  if (!Number.isInteger(normalizedMediaItemId) || normalizedMediaItemId <= 0) {
    throw new Error('A valid media item is required.');
  }

  const screenshots = db.prepare(`
    SELECT id, file_path
    FROM screenshots
    WHERE media_item_id = ?
  `).all(normalizedMediaItemId);

  const deleteTransaction = db.transaction(() => {
    db.prepare('DELETE FROM screenshots WHERE media_item_id = ?').run(normalizedMediaItemId);
    db.prepare('DELETE FROM media_items WHERE id = ?').run(normalizedMediaItemId);
  });

  deleteTransaction();

  screenshots.forEach((row) => {
    try {
      if (row.file_path && fs.existsSync(row.file_path)) {
        fs.unlinkSync(row.file_path);
      }
    } catch (error) {
      console.warn(`Failed to delete screenshot file: ${row.file_path}`, error);
    }
  });

  return {
    deletedMediaItemId: normalizedMediaItemId,
    deletedScreenshotCount: screenshots.length,
  };
}

function deleteUnselectedScreenshotsForMediaItem(mediaItemId, keepScreenshotIds = []) {
  const normalizedMediaItemId = Number(mediaItemId);
  if (!Number.isInteger(normalizedMediaItemId) || normalizedMediaItemId <= 0) {
    throw new Error('A valid media item is required.');
  }

  const keepIds = Array.isArray(keepScreenshotIds)
    ? keepScreenshotIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  const screenshots = db.prepare(`
    SELECT id, file_path
    FROM screenshots
    WHERE media_item_id = ?
  `).all(normalizedMediaItemId);

  const keepIdSet = new Set(keepIds);
  const screenshotsToDelete = screenshots.filter((row) => !keepIdSet.has(Number(row.id)));

  const deleteScreenshot = db.prepare(`
    DELETE FROM screenshots
    WHERE id = ? AND media_item_id = ?
  `);

  const transaction = db.transaction((rows) => {
    rows.forEach((row) => {
      deleteScreenshot.run(row.id, normalizedMediaItemId);
    });
  });

  transaction(screenshotsToDelete);

  screenshotsToDelete.forEach((row) => {
    try {
      if (row.file_path && fs.existsSync(row.file_path)) {
        fs.unlinkSync(row.file_path);
      }
    } catch (error) {
      console.warn(`Failed to delete screenshot file: ${row.file_path}`, error);
    }
  });

  const existingKeepIds = new Set(
    db.prepare(`
      SELECT id
      FROM screenshots
      WHERE media_item_id = ?
    `).all(normalizedMediaItemId).map((row) => Number(row.id))
  );

  const existingMediaItem = db.prepare('SELECT * FROM media_items WHERE id = ?').get(normalizedMediaItemId);
  const nextImageList = parseMediaImageList(existingMediaItem?.image_list).map((id) => (
    id && existingKeepIds.has(Number(id)) ? Number(id) : null
  ));
  const updatedMediaItem = updateMediaItemImageList(normalizedMediaItemId, nextImageList);

  return {
    deletedCount: screenshotsToDelete.length,
    deletedScreenshotIds: screenshotsToDelete.map((row) => Number(row.id)),
    updatedMediaItem,
  };
}

function ensureMediaList(name) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('List name is required.');
  }

  let mediaList = db.prepare(`
    SELECT *
    FROM media_lists
    WHERE name = ?
    LIMIT 1
  `).get(trimmedName);

  if (mediaList) {
    return mediaList;
  }

  const result = db.prepare(`
    INSERT INTO media_lists (name)
    VALUES (?)
  `).run(trimmedName);

  return db.prepare('SELECT * FROM media_lists WHERE id = ?').get(result.lastInsertRowid);
}

function createMediaList(name) {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    throw new Error('List name is required.');
  }

  const result = db.prepare(`
    INSERT INTO media_lists (name)
    VALUES (?)
  `).run(trimmedName);

  return db.prepare('SELECT * FROM media_lists WHERE id = ?').get(result.lastInsertRowid);
}

function deleteMediaList(listId) {
  return db.prepare('DELETE FROM media_lists WHERE id = ?').run(listId).changes;
}

function addMediaItemToList(listId, mediaItemId) {
  db.prepare(`
    INSERT OR IGNORE INTO media_list_items (list_id, media_item_id)
    VALUES (?, ?)
  `).run(listId, mediaItemId);

  return db.prepare(`
    SELECT
      ml.id,
      ml.name,
      COUNT(mli.id) AS item_count
    FROM media_lists ml
    LEFT JOIN media_list_items mli ON mli.list_id = ml.id
    WHERE ml.id = ?
    GROUP BY ml.id
  `).get(listId);
}

function removeMediaItemFromList(listId, mediaItemId) {
  return db.prepare(`
    DELETE FROM media_list_items
    WHERE list_id = ? AND media_item_id = ?
  `).run(listId, mediaItemId).changes;
}

function getMediaItemsForList(listId) {
  return db.prepare(`
    SELECT
      m.*,
      mli.created_at AS added_to_list_at
    FROM media_list_items mli
    INNER JOIN media_items m ON m.id = mli.media_item_id
    WHERE mli.list_id = ?
    ORDER BY mli.created_at DESC, m.id DESC
  `).all(listId);
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
  const screenshots = db.prepare(`
    SELECT *
    FROM screenshots
    WHERE media_item_id = ?
    ORDER BY COALESCE(timestamp_seconds, 0), id
  `).all(mediaItemId);

  const mediaItem = db.prepare(`
    SELECT image_list
    FROM media_items
    WHERE id = ?
  `).get(mediaItemId);

  return orderScreenshotsByMediaImageList(screenshots, mediaItem?.image_list).slice(0, limit);
}

function getScreenshotWithMediaById(screenshotId) {
  const row = db.prepare(`
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
    WHERE s.id = ?
  `).get(screenshotId);

  return buildScreenshotRowWithMedia(row);
}

function getRandomUnseenScreenshotIds(limit) {
  const screenshotCount = db.prepare('SELECT COUNT(*) AS count FROM screenshots').get().count;
  if (screenshotCount === 0) {
    const screenshotFolder = getSetting('screenshot_folder');
    syncScreenshotsFromFolder(screenshotFolder);
  }

  let ids = db.prepare(`
    SELECT id
    FROM screenshots
    WHERE is_ignored = 0
      AND has_been_displayed = 0
  `).all().map((row) => row.id);

  if (ids.length === 0) {
    db.prepare(`
      UPDATE screenshots
      SET has_been_displayed = 0,
          last_displayed_at = NULL
      WHERE is_ignored = 0
    `).run();

    ids = db.prepare(`
      SELECT id
      FROM screenshots
      WHERE is_ignored = 0
        AND has_been_displayed = 0
    `).all().map((row) => row.id);
  }

  for (let index = ids.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[randomIndex]] = [ids[randomIndex], ids[index]];
  }

  return ids.slice(0, limit);
}

function getRandomUnseenScreenshots(limit) {
  const ids = getRandomUnseenScreenshotIds(limit);
  return ids
    .map((id) => getScreenshotWithMediaById(id))
    .filter(Boolean);
}

function streamRandomUnseenScreenshots(webContents, requestId, limit) {
  const screenshotIds = getRandomUnseenScreenshotIds(limit);
  activeRandomScreenshotStreams.set(requestId, true);

  const sendNext = (index) => {
    if (!activeRandomScreenshotStreams.get(requestId)) {
      activeRandomScreenshotStreams.delete(requestId);
      return;
    }

    if (index >= screenshotIds.length) {
      webContents.send('random-screenshot-stream-complete', { requestId, count: screenshotIds.length });
      activeRandomScreenshotStreams.delete(requestId);
      return;
    }

    const item = getScreenshotWithMediaById(screenshotIds[index]);
    if (item) {
      webContents.send('random-screenshot-stream-item', { requestId, item, index });
    }

    setTimeout(() => sendNext(index + 1), 15);
  };

  setTimeout(() => sendNext(0), 0);
  return screenshotIds.length;
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

function resolveScreenshotFolder(videoPath) {
  let folder = getSetting('screenshot_folder');
  if (!folder && videoPath) {
    const fallback = path.join(path.dirname(videoPath), 'screenshots');
    fs.mkdirSync(fallback, { recursive: true });
    folder = fallback;
  }

  return folder;
}

function insertExportedVideo(mediaItemId, filePath, startSeconds, endSeconds) {
  const normalizedPath = normalizeFilePath(filePath);
  const fileName = path.basename(normalizedPath);

  db.prepare(`
    INSERT OR IGNORE INTO exported_videos (
      media_item_id,
      file_name,
      file_path,
      start_seconds,
      end_seconds
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(mediaItemId, fileName, normalizedPath, startSeconds, endSeconds);

  return db.prepare(`
    SELECT *
    FROM exported_videos
    WHERE file_path = ?
  `).get(normalizedPath);
}

function getExportedVideosForMediaItem(mediaItemId) {
  return db.prepare(`
    SELECT *
    FROM exported_videos
    WHERE media_item_id = ?
    ORDER BY start_seconds ASC, end_seconds ASC, id ASC
  `).all(mediaItemId);
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
  return resolveScreenshotFolder(videoPath);
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
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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

ipcMain.handle('get-media-item-by-file-path', async (event, filePath) => {
  try {
    return getMediaItemByFilePath(filePath);
  } catch (error) {
    console.error('Failed to get media item by file path:', error);
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

ipcMain.handle('get-exported-videos-for-media-item', async (event, mediaItemId) => {
  try {
    return getExportedVideosForMediaItem(mediaItemId);
  } catch (error) {
    console.error('Failed to load exported videos for media item:', error);
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

ipcMain.on('start-random-screenshot-stream', async (event, { requestId, limit = 60 }) => {
  try {
    const count = streamRandomUnseenScreenshots(event.sender, requestId, limit);
    console.log(`Started random screenshot stream ${requestId} with ${count} item(s).`);
  } catch (error) {
    console.error('Failed to start random screenshot stream:', error);
    event.sender.send('random-screenshot-stream-error', {
      requestId,
      message: error.message || 'Unknown error',
    });
  }
});

ipcMain.on('cancel-random-screenshot-stream', (event, requestId) => {
  activeRandomScreenshotStreams.delete(requestId);
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
  try {
    return deleteMediaItem(id);
  } catch (error) {
    console.error('Failed to delete media item:', error);
    throw error;
  }
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

ipcMain.handle('get-media-lists', async () => {
  try {
    return getMediaLists();
  } catch (error) {
    console.error('Failed to load media lists:', error);
    throw error;
  }
});

ipcMain.handle('create-media-list', async (event, name) => {
  try {
    return createMediaList(name);
  } catch (error) {
    console.error('Failed to create media list:', error);
    throw error;
  }
});

ipcMain.handle('delete-media-list', async (event, listId) => {
  try {
    return deleteMediaList(listId);
  } catch (error) {
    console.error('Failed to delete media list:', error);
    throw error;
  }
});

ipcMain.handle('add-media-item-to-list', async (event, { listId, mediaItemId }) => {
  try {
    return addMediaItemToList(listId, mediaItemId);
  } catch (error) {
    console.error('Failed to add media item to list:', error);
    throw error;
  }
});

ipcMain.handle('remove-media-item-from-list', async (event, { listId, mediaItemId }) => {
  try {
    return removeMediaItemFromList(listId, mediaItemId);
  } catch (error) {
    console.error('Failed to remove media item from list:', error);
    throw error;
  }
});

ipcMain.handle('get-media-items-for-list', async (event, listId) => {
  try {
    return getMediaItemsForList(listId);
  } catch (error) {
    console.error('Failed to load media items for list:', error);
    throw error;
  }
});

ipcMain.handle('update-media-item-image-list', async (event, { mediaItemId, imageList }) => {
  try {
    return updateMediaItemImageList(mediaItemId, imageList);
  } catch (error) {
    console.error('Failed to update media item image list:', error);
    throw error;
  }
});

ipcMain.handle('delete-unselected-screenshots-for-media-item', async (event, { mediaItemId, keepScreenshotIds }) => {
  try {
    return deleteUnselectedScreenshotsForMediaItem(mediaItemId, keepScreenshotIds);
  } catch (error) {
    console.error('Failed to delete unselected screenshots for media item:', error);
    throw error;
  }
});





ipcMain.on('show-context-menu', (event, payload = {}) => {
  const screenshotId = payload.screenshotId || null;
  const screenshotPath = payload.screenshotPath || null;
  let mediaItemId = payload.mediaItemId || null;
  let filePath = payload.filePath || null;
  const currentListId = payload.currentListId || null;
  const currentListName = payload.currentListName || null;

  if (screenshotId && (!mediaItemId || !filePath)) {
    const mediaItem = getMediaItemForScreenshot(screenshotId);
    if (mediaItem) {
      mediaItemId = mediaItem.id;
      filePath = mediaItem.file_name;
    }
  }

  const allLists = getMediaLists();
  const eligibleTargetLists = allLists.filter((list) => Number(list.id) !== Number(currentListId));
  const buildListActionSubmenu = (command) => {
    if (!mediaItemId) {
      return [{ label: 'No media item available', enabled: false }];
    }

    const targetLists = command === 'move-media-item-to-list'
      ? (currentListId ? eligibleTargetLists : [])
      : allLists;

    if (command === 'move-media-item-to-list' && !currentListId) {
      return [{ label: 'Select a list view first', enabled: false }];
    }

    if (targetLists.length === 0) {
      return [{ label: 'No other lists available', enabled: false }];
    }

    return targetLists.map((list) => ({
      label: `${list.name} (${list.item_count || 0})`,
      click: () => {
        event.sender.send('context-menu-command', {
          command,
          mediaItemId,
          targetListId: list.id,
          targetListName: list.name,
          currentListId,
          currentListName,
        });
      },
    }));
  };

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
    {
      label: 'Move to List',
      submenu: buildListActionSubmenu('move-media-item-to-list'),
    },
    {
      label: 'Add to List',
      submenu: buildListActionSubmenu('add-media-item-to-list'),
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

let mainWindow = null;
let isVideoPlayerVisible = true;

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

function createApplicationMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            {
              label: 'Settings',
              accelerator: 'Cmd+,',
              click: () => openSettingsWindow(),
            },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        }]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: process.platform === 'darwin' ? 'Cmd+,' : 'Ctrl+,',
          click: () => openSettingsWindow(),
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          id: 'toggle-video-player',
          label: 'Show Video Player',
          type: 'checkbox',
          checked: isVideoPlayerVisible,
          click: (menuItem) => {
            isVideoPlayerVisible = menuItem.checked;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('video-player-visibility-changed', isVideoPlayerVisible);
            }
          },
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'windowMenu',
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function syncVideoPlayerMenuItem() {
  const menu = Menu.getApplicationMenu();
  if (!menu) {
    return;
  }

  const menuItem = menu.getMenuItemById('toggle-video-player');
  if (menuItem) {
    menuItem.checked = isVideoPlayerVisible;
  }
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    mainWindow.webContents.send('context-menu-command', { command: 'open-settings-window' });
  }
}

async function exportVideoRange({ inputPath, mediaItemId, startSeconds, endSeconds }) {
  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('The source video could not be found.');
  }

  const resolvedStart = Number(startSeconds);
  const resolvedEnd = Number(endSeconds);

  if (!Number.isFinite(resolvedStart) || !Number.isFinite(resolvedEnd) || resolvedEnd <= resolvedStart) {
    throw new Error('A valid In/Out range is required before exporting.');
  }

  const formatRangeForFilename = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}-${minutes}-${secs}`;
  };

  const parsedPath = path.parse(inputPath);
  const rangeLabel = `${formatRangeForFilename(resolvedStart)}_to_${formatRangeForFilename(resolvedEnd)}`;
  const screenshotFolder = resolveScreenshotFolder(inputPath);
  if (!screenshotFolder) {
    throw new Error('A screenshot folder is required before exporting video ranges.');
  }

  const exportFolder = path.join(screenshotFolder, 'video_exports');
  fs.mkdirSync(exportFolder, { recursive: true });

  const fileExtension = parsedPath.ext || '.mp4';
  let outputPath = path.join(exportFolder, `${parsedPath.name}_${rangeLabel}${fileExtension}`);
  let duplicateIndex = 2;

  while (fs.existsSync(outputPath)) {
    outputPath = path.join(exportFolder, `${parsedPath.name}_${rangeLabel}_${duplicateIndex}${fileExtension}`);
    duplicateIndex += 1;
  }

  await new Promise((resolve, reject) => {
    execFile(
      ffmpegExecutable,
      [
        '-y',
        '-ss',
        resolvedStart.toString(),
        '-to',
        resolvedEnd.toString(),
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        outputPath,
      ],
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || stdout || error.message));
          return;
        }

        resolve();
      }
    );
  });

  const exportedVideo = insertExportedVideo(mediaItemId, outputPath, resolvedStart, resolvedEnd);

  return {
    canceled: false,
    outputPath,
    exportedVideo,
  };
}

ipcMain.on('open-settings-window', () => {
  openSettingsWindow();
});

ipcMain.on('set-video-player-visibility', (event, isVisible) => {
  isVideoPlayerVisible = Boolean(isVisible);
  syncVideoPlayerMenuItem();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('video-player-visibility-changed', isVideoPlayerVisible);
  } else {
    event.sender.send('video-player-visibility-changed', isVideoPlayerVisible);
  }
});

ipcMain.handle('export-video-range', async (event, payload) => {
  try {
    return await exportVideoRange(payload);
  } catch (error) {
    console.error('Failed to export video range:', error);
    throw error;
  }
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

  createApplicationMenu();
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

