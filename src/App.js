// App.js

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

  const [mediaItems, setMediaItems] = useState([]);
 

  useEffect(() => {
    const loadMediaItems = async () => {
      const items = await window.electronAPI.getMediaItems();
      const folder = await window.electronAPI.getScreenshotFolder();

      // Read directory contents from main process instead of using Node.js fs here
      const enrichedItems = await Promise.all(
        items.map(async (item) => {
          const screenshots = await window.electronAPI.readScreenshots(folder, item.name);
          return {
            ...item,
            screenshots: screenshots.map(name => `${folder}/${name}`)
          };
        })
      );

      setMediaItems(enrichedItems);
    };

    loadMediaItems();
  }, []);

    useEffect(() => {
    window.electronAPI.onVideoSelected(async (path) => {
      setVideoPath(path);
      const folder = await window.electronAPI.getScreenshotFolder(path);
      const name = path.split(/[\\/]/).pop();
      const images = await window.electronAPI.readScreenshots(folder, name);
      setScreenshots(images.map((img) => ({ name: img, path: `${folder}/${img}` })));
    });
  }, []);



const addToDatabase = async () => {
  if (!videoPath) return;
  const name = videoPath.split(/[\\/]/).pop();
  await window.electronAPI.addMediaItem({ name, fileName: videoPath });
  alert('Media item added to database!');
};

const openMediaFile = (path) => {
  setVideoPath(path);
};

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
      {mediaItems.length > 0 && (
        <>
          <h2>Saved Media Items</h2>
          {mediaItems.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid #ccc', margin: 10, padding: 10 }}>
              <h4
                style={{ cursor: 'pointer' }}
                onClick={() => setVideoPath(item.file_name)}
              >
                {item.name}
              </h4>
              <div style={{ display: 'flex', gap: 5 }}>
                {item.screenshots.map((img, i) => (
                  <img
                    key={i}
                    src={`file://${img}`}
                    style={{ width: 100 }}
                    alt={`screenshot-${i}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

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
          <button onClick={addToDatabase}>➕ Add to Database</button>

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
