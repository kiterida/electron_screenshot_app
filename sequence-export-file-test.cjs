// Run with Electron's Node runtime: electron.exe sequence-export-file-test.cjs <video>
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFile, execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');

async function main() {
  const input = path.resolve(process.argv[2]);
  const speeds = process.argv[3] ? process.argv[3].split(',').map(Number) : [1, 0.5];
  const root = fs.mkdtempSync(path.join(__dirname, '.sequence-file-test-'));
  const database = new Database(':memory:');
  try {
    const source = fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8');
    database.exec('CREATE TABLE media_items (id INTEGER PRIMARY KEY); INSERT INTO media_items VALUES (1); CREATE TABLE exported_videos (id INTEGER PRIMARY KEY, file_path TEXT, media_item_id INTEGER);');
    database.prepare('INSERT INTO exported_videos VALUES (1, ?, 1)').run(input);
    database.exec(source.match(/database\.exec\(`([\s\S]*?CREATE TABLE IF NOT EXISTS exported_sequences[\s\S]*?)`\);/)[1]);
    const context = vm.createContext({ fs, path, execFile, console, setTimeout, clearTimeout,
      ffmpegExecutable: 'C:\\ffmpeg\\bin\\ffmpeg.exe', db: database, getSetting: () => root });
    vm.runInContext(source.slice(source.indexOf('function runSequenceTool('), source.indexOf("ipcMain.handle('export-video-sequence'")), context);
    const probe = (file) => JSON.parse(execFileSync('C:\\ffmpeg\\bin\\ffprobe.exe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', windowsHide: true }));
    const inputMetadata = probe(input);
    const inputDuration = Number(inputMetadata.streams.find((stream) => stream.codec_type === 'video').duration);
    let lastLabel = '';
    const started = Date.now();
    const result = await context.exportVideoSequence({ exportedVideoIds: speeds.map(() => 1), playbackSpeeds: speeds, name: `Real video ${speeds.map((speed) => speed * 100).join(' then ')} percent` }, (progress) => {
      const label = progress.stage === 'clip' ? `Clip ${progress.clip}/${progress.total}: ${Math.floor(progress.percent / 10) * 10}%` : progress.stage;
      if (label !== lastLabel) { console.log(label); lastLabel = label; }
    });
    const metadata = probe(result.outputPath);
    const expected = speeds.reduce((total, speed) => total + inputDuration / speed, 0);
    assert.ok(Math.abs(Number(metadata.format.duration) - expected) < 0.5, `Expected ${expected}, got ${metadata.format.duration}`);
    for (const stream of metadata.streams) {
      if (stream.codec_type === 'audio' || stream.codec_type === 'video') {
        assert.ok(Math.abs(Number(stream.duration) - expected) < 0.5, `${stream.codec_type} duration mismatch: ${stream.duration}`);
      }
    }
    await context.runSequenceTool('C:\\ffmpeg\\bin\\ffmpeg.exe', ['-v', 'error', '-xerror', '-i', result.outputPath, '-f', 'null', '-'], () => {});
    console.log(JSON.stringify({ outputPath: result.outputPath, expectedDuration: expected, actualDuration: metadata.format.duration, elapsedSeconds: (Date.now() - started) / 1000, fullDecode: 'passed' }));
  } finally { database.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
