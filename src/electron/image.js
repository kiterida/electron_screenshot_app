// src/electron/image.js
function formatTime(seconds) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return `${pad(h)}-${pad(m)}-${pad(s)}`;
}

async function takeScreenshot(videoElement, videoPath) {
  if (!videoElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject('Failed to create blob');
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const timestamp = formatTime(videoElement.currentTime);
      const baseName = videoPath.split(/[\\/]/).pop().split('.')[0];
      const filename = `${baseName}_${timestamp}.png`;

      try {
        const filePath = await window.electronAPI.saveScreenshot(buffer, filename);
        resolve({ name: filename, path: filePath });
      } catch (e) {
        reject(e);
      }
    }, 'image/png');
  });
}

export { formatTime, takeScreenshot };
