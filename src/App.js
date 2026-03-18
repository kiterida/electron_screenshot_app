// App.js

import React, { useRef, useState, useEffect } from 'react';
import SettingsDialog from './components/SettingsDialog';
import SearchDialog from './components/SearchDialog';
import MediaTableDialog from './components/MediaTableDialog';

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
  const [showSearch, setShowSearch] = useState(false);
  const [randomResults, setRandomResults] = useState([]);
  const [openMediaTable, setOpenMediaTable] = useState(false);

  const [screenshotsPerRow, setScreenshotsPerRow] = useState(4);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const minScreenshotsPerRow = 1;
  const maxScreenshotsPerRow = 10;

  const [appSettings, setAppSettings] = useState({});
  const [autoPlayOnScreenshotClick, setAutoPlayOnScreenshotClick] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const results = await loadRandomScreenshotsWithMedia();
      setRandomResults(results);
    };
    fetch();
  }, []);


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

  const loadRandomScreenshotsWithMedia = async () => {
    const folder = await window.electronAPI.getScreenshotFolder();
    const allScreenshots = await window.electronAPI.readScreenshots(folder, '', 1000);

    if (!allScreenshots || allScreenshots.length === 0) return [];

    // Step 1: Shuffle and pick 6
    const shuffled = [...allScreenshots].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 60);

    // Step 2: Remove timestamp to get media name and query DB
    const results = await Promise.all(
      selected.map(async (fileName) => {
        // Remove "_HH-MM-SS.jpeg" or "_HH-MM-SS.jpg"
        const mediaName = fileName.replace(/_\d{2}-\d{2}-\d{2}\.jpe?g$/i, '');

        console.log("mediaName: ", mediaName);
        const mediaItem = await window.electronAPI.getMediaItemByName(mediaName);

        return {
          screenshotPath: `${folder}/${fileName}`,
          mediaItem,
          fileName,
        };
      })
    );

    return results.filter(Boolean); // remove any nulls
  };



  const handleSearchResults = async (searchResults) => {
    if (searchResults && searchResults.length > 0) {
      const settings = await window.electronAPI.getAppSettings();
      const enrichedItems = await loadAndEnrichMediaItems(searchResults, settings);
      setMediaItems(enrichedItems);
    } else {
      setMediaItems([]); // or show "No results"
    }
  };


  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const loadAndEnrichMediaItems = async (items, settings) => {
    const folder = await window.electronAPI.getScreenshotFolder();
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const screenshots = await window.electronAPI.readScreenshots(
          folder,
          item.name,
          settings.screens_load_per_item
        );
        return {
          ...item,
          screenshots: screenshots
            .slice(0, settings.screens_load_per_item)
            .map((name) => `${folder}/${name}`)
        };
      })
    );
    return enrichedItems;
  };

  useEffect(() => {
    const loadApp = async () => {
      const settings = await window.electronAPI.getAppSettings();
      setAppSettings(settings);
      setScreenshotsPerRow(settings.default_screens_per_row);

      const items = await window.electronAPI.getMediaItems();
      const enrichedItems = await loadAndEnrichMediaItems(items, settings);
      setMediaItems(enrichedItems);
    };

    loadApp();
  }, []);


  // useEffect(() => {
  //   const loadApp = async () => {
  //     // 1. Load settings first and await completion
  //     const settings = await window.electronAPI.getAppSettings();
  //     setAppSettings(settings); // You may need to define this state
  //     setScreenshotsPerRow(settings.default_screens_per_row);

  //     // 2. Now load media items
  //     const items = await window.electronAPI.getMediaItems();
  //     const folder = await window.electronAPI.getScreenshotFolder();

  //     const enrichedItems = await Promise.all(
  //       items.map(async (item) => {
  //         const screenshots = await window.electronAPI.readScreenshots(
  //           folder,
  //           item.name,
  //           settings.screens_load_per_item // Use updated setting
  //         );
  //         return {
  //           ...item,
  //           screenshots: screenshots
  //             .slice(0, settings.screens_load_per_item) // Also use setting here
  //             .map(name => `${folder}/${name}`)
  //         };
  //       })
  //     );

  //     setMediaItems(enrichedItems);
  //   };

  //   loadApp();
  // }, []);


  useEffect(() => {
    window.electronAPI.onVideoSelected(async (path) => {
      setVideoPath(path);
      const folder = await window.electronAPI.getScreenshotFolder(path);
      const name = path.split(/[\\/]/).pop();
      console.log("read screenshots for: ", name);
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
      console.log("setForward");
      video.currentTime = Math.min(video.duration, video.currentTime + frameDuration);
    }
  };

  const goForwardTenSeconds = () => {
    console.log("calling function");
    const video = videoRef.current;
    if (video) {
      console.log("goForwardTenSeconds");
      video.currentTime = Math.min(video.duration, video.currentTime + 10);
    }
  }

  const goBackTenSeconds = () => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, video.currentTime - 10);
    }
  }

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

    console.log("videoPath: ", videoPath);
    const folder = await window.electronAPI.getScreenshotFolder(videoPath);
    const ctx = canvasRef.current.getContext('2d');
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    const timestamp = formatTime(video.currentTime);
    //const name = `${videoPath.split(/[\\/]/).pop().split('.')[0]}_${timestamp}.jpeg`;

    const originalFilename = videoPath.split(/[\\/]/).pop(); // Extract filename from path
    const baseName = originalFilename.replace(/\.(mp4|mov|avi|mpg|mkv|webm)$/i, ''); // Remove only the final video extension
    const name = `${baseName}_${timestamp}.jpeg`;

    const buffer = canvasRef.current.toDataURL('image/jpeg', 1); // JPEG encoding

    console.log("screenshot name: ", name);

    const filePath = `${folder}/${name}`;
    await window.electronAPI.saveScreenshot(filePath, buffer);
    setScreenshots((prev) => [...prev, { name, path: filePath }]);
  };

  const seekToScreenshot = (filename) => {
    const parts = filename.split('_').pop().replace('.jpeg', '').split('-');
    const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
    videoRef.current.currentTime = seconds;
    if (autoPlayOnScreenshotClick)
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
      } else if (data.command == "open-screenshot-folder") {
        await window.electronAPI.openScreenshotFolder(data.path);
      } else if (data.command == "open-file-location") {
        await window.electronAPI.openFileLocation(data.path);
      }
    });
  }, []);



  return (
    <div style={{ padding: 2 }}>
      <button onClick={() => setOpenMediaTable(true)}>Open Media Table</button>
      <MediaTableDialog open={openMediaTable} onClose={() => setOpenMediaTable(false)} />
      <div style={{ border: '6px solid #ccc', margin: 0, padding: 0 }}>
         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
      {randomResults.map(({ screenshotPath, mediaItem }, i) => (
       
        
          <div key={i} style={{ flex: '1 0 auto', height: 'auto', maxWidth: `calc(100% / ${screenshotsPerRow})`, objectFit: 'contain', cursor: 'pointer' }}>
          <img src={`file://${screenshotPath}`} alt=""  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
          </div>
        
      ))}
      </div>
        </div>
      <SettingsDialog open={settingsOpen} onClose={handleSettingsChanged} />
      <SearchDialog
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSearchResults={handleSearchResults}
      />
      {mediaItems.length > 0 && (
        <>
          {mediaItems.map((item, idx) => (
            <div key={idx} style={{ border: '6px solid #ccc', margin: 0, padding: 0 }}
              onContextMenu={(e) => {
                e.preventDefault();
                console.log("onContextMenu: item = ", item);
                console.log("screenshots[0]: ", item.screenshots[0])
                window.electronAPI.showContextMenu(item.id, item.file_name, item.screenshots[0]); // Pass mediaItemId to main
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
                      {(playOnHover && hoveredScreenshot?.index === `${idx}-${i}`) ? (
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
          <div
            style={{
              resize: 'both',
              overflow: 'auto',
              width: '640px', // Set initial size
              maxWidth: '100%',
              minHeight: 'auto',
              border: '1px solid #ccc',
              padding: '8px',
              display: 'inline-block',
            }}
          >
            <video
              ref={videoRef}
              src={`file://${videoPath}`}
              controls
              muted={isMuted}
              style={{ width: '100%', height: 'auto' }}
            />
          </div>

          <button onClick={takeScreenshot}>📸 Take Screenshot</button>
          <button onClick={addToDatabase}>➕ Add to Database</button>

          <div style={{ marginTop: 10 }}>
            <button onClick={() => setAutoPlayOnScreenshotClick(!autoPlayOnScreenshotClick)}>{autoPlayOnScreenshotClick ? "Turn Autoplay off" : "Turn Autoplay On"}</button>
            <button onClick={stepBack}>&lt;</button>
            <button onClick={stepForward}>&gt;</button>
            <button onClick={goBackTenSeconds}>&lt; 10s</button>
            <button onClick={goForwardTenSeconds}>10s &gt;</button>
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
