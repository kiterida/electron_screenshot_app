const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFile, execFileSync } = require('node:child_process');

test('sequence export deletion keeps files for link-only and retains records on file errors', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.sequence-delete-test-'));
  const file = path.join(root, 'export.mp4');
  const database = new (require('better-sqlite3'))(':memory:');
  try {
    const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    database.exec('CREATE TABLE media_items (id INTEGER PRIMARY KEY); INSERT INTO media_items VALUES (1), (2);');
    database.exec(source.match(/database\.exec\(`([\s\S]*?CREATE TABLE IF NOT EXISTS exported_sequences[\s\S]*?)`\);/)[1]);
    const context = vm.createContext({ fs, db: database });
    vm.runInContext(source.slice(source.indexOf('function deleteExportedSequence('), source.indexOf('function getVideoExportSequences(')), context);
    const insert = () => {
      database.prepare('INSERT INTO exported_sequences (id, name, file_name, file_path, clip_count) VALUES (1, ?, ?, ?, 2)').run('Test', 'export.mp4', file);
      database.exec('INSERT INTO exported_sequence_media_items VALUES (1, 1), (2, 1)');
    };
    fs.writeFileSync(file, 'test fixture');
    insert();
    context.deleteExportedSequence({ id: 1, deleteFile: false });
    assert.ok(fs.existsSync(file));
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM exported_sequence_media_items').get().n, 0);
    insert();
    context.fs = { unlinkSync: () => { throw Object.assign(new Error('File locked'), { code: 'EPERM' }); } };
    assert.throws(() => context.deleteExportedSequence({ id: 1, deleteFile: true }), /entry was kept/);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM exported_sequences').get().n, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM exported_sequence_media_items').get().n, 2);
    context.fs = fs;
    context.deleteExportedSequence({ id: 1, deleteFile: true });
    assert.equal(fs.existsSync(file), false);
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM exported_sequences').get().n, 0);
    insert();
    context.deleteExportedSequence({ id: 1, deleteFile: true }); // Already missing file.
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM exported_sequences').get().n, 0);
    assert.throws(() => context.deleteExportedSequence({ id: 1, deleteFile: 'yes' }), /Invalid/);
  } finally {
    database.close();
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(root);
  }
});

test('sequence export joins ordered clips, handles silent clips, and cleans up', async () => {
  const root = fs.mkdtempSync(path.join(__dirname, '.sequence-test-'));
  const ffmpegExecutable = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
  const ffprobe = 'C:\\ffmpeg\\bin\\ffprobe.exe';
  const first = path.join(root, "first ' clip.mp4");
  const second = path.join(root, 'second.mp4');
  let outputs = [];
  const database = new (require('better-sqlite3'))(':memory:');
  try {
    execFileSync(ffmpegExecutable, ['-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=160x120:r=30:d=0.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', first], { windowsHide: true });
    execFileSync(ffmpegExecutable, ['-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=120x160:r=24:d=0.5', '-c:v', 'libx264', second], { windowsHide: true });
    const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    database.exec('CREATE TABLE media_items (id INTEGER PRIMARY KEY); INSERT INTO media_items VALUES (10), (20); CREATE TABLE exported_videos (id INTEGER PRIMARY KEY, file_path TEXT, media_item_id INTEGER);');
    database.prepare('INSERT INTO exported_videos VALUES (?, ?, ?)').run(1, first, 10);
    database.prepare('INSERT INTO exported_videos VALUES (?, ?, ?)').run(2, second, 20);
    const schema = source.match(/database\.exec\(`([\s\S]*?CREATE TABLE IF NOT EXISTS exported_sequences[\s\S]*?)`\);/)[1];
    database.exec(schema);
    database.exec(schema); // Existing databases can reopen safely.
    const context = vm.createContext({ fs, path, execFile, ffmpegExecutable, console, setTimeout, clearTimeout,
      getSetting: () => root,
      db: database,
    });
    vm.runInContext(source.slice(source.indexOf('function getExportedSequencesForMediaItem('), source.indexOf('function getVideoExportSequences(')), context);
    vm.runInContext(source.slice(source.indexOf('function runSequenceTool('), source.indexOf("ipcMain.handle('export-video-sequence'")), context);
    database.exec(`CREATE TABLE video_export_sequences (id INTEGER PRIMARY KEY, name TEXT UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE video_export_sequence_items (sequence_id INTEGER, position INTEGER, exported_video_id INTEGER);
      INSERT INTO video_export_sequences (id, name) VALUES (1, 'Legacy');
      INSERT INTO video_export_sequence_items VALUES (1, 0, 1);`);
    context.database = database;
    const migrationStart = source.indexOf("  if (!database.prepare('PRAGMA table_info(video_export_sequence_items)')");
    const migration = source.slice(migrationStart, source.indexOf('\n  }', migrationStart) + 4);
    vm.runInContext(migration, context);
    vm.runInContext(migration, context);
    vm.runInContext(source.slice(source.indexOf('function getVideoExportSequenceById('), source.indexOf('function deleteVideoExportSequence(')), context);
    assert.equal(context.getVideoExportSequenceById(1).clips[0].playback_speed, 1);
    const saved = context.saveVideoExportSequence({ name: 'Speeds', exportedVideoIds: [1, 1], playbackSpeeds: [0.5, 0.8] });
    assert.deepEqual(Array.from(saved.clips, (clip) => clip.playback_speed), [0.5, 0.8]);
    assert.throws(() => context.saveVideoExportSequence({ name: 'Bad', exportedVideoIds: [1], playbackSpeeds: [0] }), /slot speed/);
    await assert.rejects(context.exportVideoSequence({ exportedVideoIds: [1], playbackSpeeds: [NaN] }), /slot speed/);
    await assert.rejects(context.exportVideoSequence({ exportedVideoIds: [] }), /Add clips/);
    await assert.rejects(context.exportVideoSequence({ exportedVideoIds: [999] }), /missing/);
    const result = await context.exportVideoSequence({ exportedVideoIds: [2, 1, 2], playbackSpeeds: [0.5, 0.8, 2], name: '../test:name' });
    outputs.push(result.outputPath);
    assert.equal(context.getExportedSequencesForMediaItem(10)[0].file_path, result.outputPath);
    assert.equal(context.getExportedSequencesForMediaItem(20)[0].clip_count, 3);
    assert.equal(context.getExportedSequencesForMediaItem(999).length, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM exported_sequence_media_items').get().count, 2);
    assert.equal(path.dirname(result.outputPath), path.join(root, 'exported_sequences'));
    const metadata = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', result.outputPath], { encoding: 'utf8', windowsHide: true }));
    assert.equal(metadata.streams.find((s) => s.codec_type === 'video').width, 120);
    assert.ok(metadata.streams.some((s) => s.codec_type === 'audio'));
    assert.ok(Number(metadata.format.duration) >= 1.875 && Number(metadata.format.duration) < 2.1, `Unexpected duration: ${metadata.format.duration}`);
    for (const [time, channel] of [['0.2', 2], ['1.2', 0], ['1.8', 2]]) {
      const pixel = execFileSync(ffmpegExecutable, ['-v', 'error', '-ss', time, '-i', result.outputPath, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { windowsHide: true });
      assert.ok(pixel[channel] > 150, `Unexpected clip color at ${time}`);
    }
    assert.deepEqual(fs.readdirSync(path.join(root, 'exported_sequences')), [path.basename(result.outputPath)]);
    for (const speed of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2]) {
      const speedResult = await context.exportVideoSequence({ exportedVideoIds: [1, 2], playbackSpeeds: [speed, speed], name: `Speed ${speed}` });
      outputs.push(speedResult.outputPath);
      const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', speedResult.outputPath], { encoding: 'utf8', windowsHide: true }));
      assert.ok(Math.abs(Number(probe.format.duration) - 1 / speed) < 0.25, `Wrong duration at speed ${speed}: ${probe.format.duration}`);
    }
    execFileSync(ffmpegExecutable, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-c:a', 'aac', first], { windowsHide: true });
    for (const speeds of [[1, 0.5], [0.5, 1], [1, 0.5, 0.8, 1]]) {
      const mixed = await context.exportVideoSequence({ exportedVideoIds: speeds.map(() => 1), playbackSpeeds: speeds, name: 'Mixed speeds' });
      outputs.push(mixed.outputPath);
      const probe = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_format', '-of', 'json', mixed.outputPath], { encoding: 'utf8', windowsHide: true }));
      const expected = speeds.reduce((total, speed) => total + 8 / speed, 0);
      assert.ok(Math.abs(Number(probe.format.duration) - expected) < 0.3, `Mixed speeds ${speeds}: ${probe.format.duration}, expected ${expected}`);
    }
    fs.writeFileSync(second, 'invalid video');
    await assert.rejects(context.exportVideoSequence({ exportedVideoIds: [1, 2] }));
    assert.deepEqual(fs.readdirSync(path.join(root, 'exported_sequences')).sort(), outputs.map((file) => path.basename(file)).sort());
  } finally {
    database.close();
    for (const file of [first, second, ...outputs]) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    const exportFolder = path.join(root, 'exported_sequences');
    if (fs.existsSync(exportFolder)) fs.rmdirSync(exportFolder);
    fs.rmdirSync(root);
  }
});
