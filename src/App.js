// App.js

import React, { useRef, useState, useEffect } from 'react';
import SettingsDialog from './components/SettingsDialog';

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
  const [hoveredScreenshot, setHoveredScreenshot] = useState(null);
  const [showItemName, setShowItemName] = useState(false);
  const [playOnHover, setPlayOnHover] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // New state for audio toggle

  const [screenshotsPerRow, setScreenshotsPerRow] = useState(4);
   const [settingsOpen, setSettingsOpen] = useState(false);
  const minScreenshotsPerRow = 1;
  const maxScreenshotsPerRow = 10;

  const [appSettings, setAppSettings] = useState({});


const loadSettings = async () => {
  const settings = await window.electronAPI.getAppSettings();
  console.log("loadSettings:", settings);
  setAppSettings(settings);
};

// Call this after dialog closes
const handleSettingsChanged = () => {
  loadSettings();
  setSettingsOpen(false);
};

 useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setScreenshotsPerRow(prev => {
          let newVal = prev;
          if (e.deltaY < 0 && prev < 10) newVal = prev + 1;
          if (e.deltaY > 0 && prev > 1) newVal = prev - 1;
          return newVal;
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

 useEffect(() => {
  const loadApp = async () => {
    // 1. Load settings first and await completion
    const settings = await window.electronAPI.getAppSettings();
    setAppSettings(settings); // You may need to define this state
    setScreenshotsPerRow(settings.default_screens_per_row);

    // 2. Now load media items
    const items = await window.electronAPI.getMediaItems();
    const folder = await window.electronAPI.getScreenshotFolder();
    
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const screenshots = await window.electronAPI.readScreenshots(
          folder,
          item.name,
          settings.screens_load_per_item // Use updated setting
        );
        return {
          ...item,
          screenshots: screenshots
            .slice(0, settings.screens_load_per_item) // Also use setting here
            .map(name => `${folder}/${name}`)
        };
      })
    );

    setMediaItems(enrichedItems);
  };

  loadApp();
}, []);


  useEffect(() => {
    window.electronAPI.onVideoSelected(async (path) => {
      setVideoPath(path);
      const folder = await window.electronAPI.getScreenshotFolder(path);
      const name = path.split(/[\\/]/).pop();
      const images = await window.electronAPI.readScreenshots(folder, name, 100);
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

  const stepBack = () => {
  const video = videoRef.current;
  if (video) {
    const frameDuration = 1 / 30; // assuming 30fps
    video.currentTime = Math.max(0, video.currentTime - frameDuration);
  }
};

const stepForward = () => {
  const video = videoRef.current;
  if (video) {
    const frameDuration = 1 / 30; // assuming 30fps
    video.currentTime = Math.min(video.duration, video.currentTime + frameDuration);
  }
};

const toggleMute = () => {
  const video = videoRef.current;
  if (video) {
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }
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
    const name = `${videoPath.split(/[\\/]/).pop().split('.')[0]}_${timestamp}.jpeg`;
    const buffer = canvasRef.current.toDataURL('image/jpeg', 0.85); // JPEG encoding

    const filePath = `${folder}/${name}`;
    await window.electronAPI.saveScreenshot(filePath, buffer);
    setScreenshots((prev) => [...prev, { name, path: filePath }]);
  };

  const seekToScreenshot = (filename) => {
    const parts = filename.split('_').pop().replace('.jpeg', '').split('-');
    const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
    videoRef.current.currentTime = seconds;
    videoRef.current.play();
  };

  const getTimeFromFilename = (filename) => {
    const parts = filename.split('_').pop().replace('.jpeg', '').split('-');
    return (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
  };

//   useEffect(() => {
//   const handleContextMenu = (e) => {
//     e.preventDefault();
//     window.electronAPI.showContextMenu();
//   };

//   window.addEventListener('contextmenu', handleContextMenu);
  
//   return () => {
//     window.removeEventListener('contextmenu', handleContextMenu);
//   };
// }, []);

useEffect(() => {
  window.electronAPI.onContextCommand(async (data) => {
    if (data.command === 'enable-hover') {
      setPlayOnHover(true);
    } else if (data.command === 'disable-hover') {
      setPlayOnHover(false);
    } else if (data.command === 'delete-item') {
      const confirmed = window.confirm('Are you sure you want to delete this item?');
      if (confirmed) {
        await window.electronAPI.deleteMediaItem(data.id);
        setMediaItems((prev) => prev.filter(item => item.id !== data.id));
      }
    } else if (data.command == "open-settings-window") {
        setSettingsOpen(true);
    }
  });
}, []);



  return (
    <div style={{ padding: 2 }}>
       <SettingsDialog open={settingsOpen} onClose={handleSettingsChanged} />
      {mediaItems.length > 0 && (
        <>
          {mediaItems.map((item, idx) => (
            <div key={idx} style={{ border: '1px solid #ccc', margin: 0, padding: 0 }} 
             onContextMenu={(e) => {
              e.preventDefault();
              window.electronAPI.showContextMenu(item.id); // Pass mediaItemId to main
            }}
            >
              {showItemName && (
                <h4
                  style={{ cursor: 'pointer' }}
                  onClick={async () => {
                    setVideoPath(item.file_name);
                    const folder = await window.electronAPI.getScreenshotFolder(item.file_name);
                    const name = item.file_name.split(/[\\/]/).pop();
                    const images = await window.electronAPI.readScreenshots(folder, name, 100);
                    setScreenshots(images.map((img) => ({ name: img, path: `${folder}/${img}` })));
                  }}
                >
                  {item.name}
                </h4>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                {item.screenshots.map((img, i) => {
                  const parts = img.split('_').pop().replace('.jpeg', '').split('-');
                  const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
                  return (
                    <div
                      key={i}
                      style={{ flex: '1 0 auto', height: 'auto', maxWidth: `calc(100% / ${screenshotsPerRow})`, objectFit: 'contain', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredScreenshot({ video: item.file_name, time: seconds, index: `${idx}-${i}` })}
                      onMouseLeave={() => setHoveredScreenshot(null)}
                      onClick={async () => {
                        setVideoPath(item.file_name);
                        const folder = await window.electronAPI.getScreenshotFolder(item.file_name);
                        const name = item.file_name.split(/[\\/]/).pop();
                        const images = await window.electronAPI.readScreenshots(folder, name, 1000);
                        setScreenshots(images.map((img) => ({ name: img, path: `${folder}/${img}` })));
                        setTimeout(() => {
                          if (videoRef.current) {
                            videoRef.current.currentTime = seconds;
                            videoRef.current.play();
                          }
                        }, 100);
                      }}
                    >
                      {( playOnHover && hoveredScreenshot?.index === `${idx}-${i}`) ? (
                        <video
                          src={`file://${item.file_name}`}
                          style={{ width: '100%', height: '100%' }}
                          autoPlay
                          muted
                          loop
                          onLoadedMetadata={(e) => {
                            e.currentTarget.currentTime = seconds;
                          }}
                        />
                      ) : (
                        <img
                          src={`file://${img}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                          alt={`screenshot-${i}`}
                        />
                      )}
                    </div>
                  );
                })}
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
            muted={isMuted}
            style={{ width: '100%', marginTop: 20 }}
          />
          <button onClick={takeScreenshot}>📸 Take Screenshot</button>
          <button onClick={addToDatabase}>➕ Add to Database</button>
               <div style={{ marginTop: 10 }}>
  <button onClick={stepBack}>&lt;</button>
  <button onClick={stepForward}>&gt;</button>
  <button onClick={toggleMute}>
    {isMuted ? '🔇 Unmute' : '🔊 Mute'}
  </button>
</div>

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
