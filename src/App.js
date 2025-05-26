import React, { useRef, useState, useEffect } from 'react';

function formatTime(seconds) {
  const pad = (n) => (n < 10 ? '0' + n : n);
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return `${pad(h)}-${pad(m)}-${pad(s)}`;
}

function App() {
  const videoRef = useRef();
  const canvasRef = useRef(document.createElement('canvas'));
  const [videoPath, setVideoPath] = useState(null);
  const [screenshots, setScreenshots] = useState([]);

 useEffect(() => {
  window.electronAPI.onVideoSelected((path) => {
    setVideoPath(path);
  });
}, []);

const handleOpen = () => {
  window.electronAPI.openVideoDialog();
};



  const takeScreenshot = async () => {
    const video = videoRef.current;
    if (!video) return;

    const folder = await window.electronAPI.getScreenshotFolder(videoPath);
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    const timestamp = formatTime(video.currentTime);
    const name = `${videoPath.split(/[\\/]/).pop().split('.')[0]}_${timestamp}.png`;
    const buffer = canvasRef.current.toDataURL('image/png');

    const filePath = `${folder}/${name}`;

    await window.electronAPI.saveScreenshot(filePath, buffer);
    setScreenshots((prev) => [...prev, { name, path: filePath }]);
    };

  const seekToScreenshot = (filename) => {
    const parts = filename.split('_').pop().replace('.png', '').split('-');
    const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
    videoRef.current.currentTime = seconds;
    videoRef.current.play();
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Video Screenshot Tool</h1>
      <button onClick={handleOpen}>Open Video</button>
      <button onClick={() => window.electronAPI.selectScreenshotFolder()}>Set Screenshot Folder</button>

      {videoPath && (
        <>
          <video
            ref={videoRef}
            src={`file://${videoPath}`}
            controls
            style={{ width: '100%', marginTop: 20 }}
          />
          <button onClick={takeScreenshot}>📸 Take Screenshot</button>

          <div style={{ marginTop: 20 }}>
            <h3>Screenshots</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap' }}>
              {screenshots.map((shot, idx) => (
                <img
                  key={idx}
                  src={`file://${shot.path}`}
                  style={{ width: 160, margin: 5, cursor: 'pointer' }}
                  onClick={() => seekToScreenshot(shot.name)}
                  alt={shot.name}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;
