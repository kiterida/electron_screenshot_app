// App.js

import React, { useRef, useState, useEffect } from 'react';
import { Tooltip } from '@mui/material';
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
  const randomLoadSequenceRef = useRef(0);
  const [videoPath, setVideoPath] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [hoveredScreenshot, setHoveredScreenshot] = useState(null);
  const [showItemName, setShowItemName] = useState(false);
  const [playOnHover, setPlayOnHover] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // New state for audio toggle
  const [showSearch, setShowSearch] = useState(false);
  const [randomResults, setRandomResults] = useState([]);
  const [randomLoading, setRandomLoading] = useState(false);
  const [topMediaItemScreenshots, setTopMediaItemScreenshots] = useState([]);
  const [topMediaItemName, setTopMediaItemName] = useState('');
  const [openMediaTable, setOpenMediaTable] = useState(false);
  const [randomStartupComplete, setRandomStartupComplete] = useState(false);
  const [mediaItemsLoading, setMediaItemsLoading] = useState(false);

  const [screenshotsPerRow, setScreenshotsPerRow] = useState(4);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const minScreenshotsPerRow = 1;
  const maxScreenshotsPerRow = 10;

  const [appSettings, setAppSettings] = useState({});
  const [autoPlayOnScreenshotClick, setAutoPlayOnScreenshotClick] = useState(true);
  const [currentMediaItemId, setCurrentMediaItemId] = useState(null);

  const mapScreenshotRecord = (record) => ({
    id: record.id,
    name: record.file_name,
    path: record.file_path,
    timestampSeconds: record.timestamp_seconds,
  });

  const refreshRandomResults = async () => {
    const settings = await window.electronAPI.getAppSettings();
    const randomImagesCount = Math.max(1, parseInt(settings.random_images, 10) || 60);
    const loadSequence = Date.now();
    const previousSequence = randomLoadSequenceRef.current;
    randomLoadSequenceRef.current = loadSequence;
    setRandomResults([]);
    setRandomLoading(true);
    if (previousSequence) {
      window.electronAPI.cancelRandomScreenshotStream(previousSequence);
    }
    window.electronAPI.startRandomScreenshotStream({ requestId: loadSequence, limit: randomImagesCount });
  };


  const loadSettings = async () => {
    const settings = await window.electronAPI.getAppSettings();
    console.log("loadSettings:", settings);
    setAppSettings(settings);
  };

  // Call this after dialog closes
  const handleSettingsChanged = () => {
    loadSettings();
    refreshRandomResults();
    setSettingsOpen(false);
  };

  const recordDisplayedScreenshots = async (screenshotIds) => {
    if (!screenshotIds || screenshotIds.length === 0) {
      return;
    }

    await window.electronAPI.markScreenshotDisplayed(screenshotIds);
  };

  const loadRandomScreenshotsWithMedia = async () => {
    try {
      const settings = await window.electronAPI.getAppSettings();
      const randomImagesCount = Math.max(1, parseInt(settings.random_images, 10) || 60);
      const selectedResults = await window.electronAPI.getRandomUnseenScreenshots(randomImagesCount);

      console.log(
        `loadRandomScreenshotsWithMedia: ${selectedResults.length} selected from SQLite, target count ${randomImagesCount}.`
      );

      recordDisplayedScreenshots(selectedResults.map((result) => result.id)).catch((recordError) => {
        console.error('recordDisplayedScreenshots failed:', recordError);
      });

      return selectedResults;
    } catch (error) {
      console.error('loadRandomScreenshotsWithMedia failed:', error);
      return [];
    }
  };

  useEffect(() => {
    const handleItem = (data) => {
      if (data.requestId !== randomLoadSequenceRef.current) {
        return;
      }

      const image = new Image();
      image.onload = () => {
        if (data.requestId !== randomLoadSequenceRef.current) {
          return;
        }
        setRandomResults((prev) => [...prev, data.item]);
      };
      image.onerror = () => {
        if (data.requestId !== randomLoadSequenceRef.current) {
          return;
        }
        setRandomResults((prev) => [...prev, data.item]);
      };
      image.src = `file://${data.item.file_path}`;

      recordDisplayedScreenshots([data.item.id]).catch((recordError) => {
        console.error('recordDisplayedScreenshots failed:', recordError);
      });
    };

    const handleComplete = (data) => {
      if (data.requestId !== randomLoadSequenceRef.current) {
        return;
      }

      setRandomStartupComplete(true);
      setRandomLoading(false);
      console.log(`Random screenshot stream complete: ${data.count} item(s).`);
    };

    const handleError = (data) => {
      if (data.requestId !== randomLoadSequenceRef.current) {
        return;
      }

      setRandomStartupComplete(true);
      setRandomLoading(false);
      console.error('Random screenshot stream failed:', data.message);
    };

    window.electronAPI.onRandomScreenshotStreamItem(handleItem);
    window.electronAPI.onRandomScreenshotStreamComplete(handleComplete);
    window.electronAPI.onRandomScreenshotStreamError(handleError);
  }, []);

  useEffect(() => {
    const fetch = async () => {
      await refreshRandomResults();
    };
    fetch();
  }, []);



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
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(
          item.id,
          settings.screens_load_per_item
        );
        return {
          ...item,
          screenshots: screenshotRows.map(mapScreenshotRecord),
        };
      })
    );
    return enrichedItems;
  };

  const showMediaItemScreenshotsAtTop = async (mediaItemId) => {
    if (!mediaItemId) {
      return;
    }

    const mediaItem = await window.electronAPI.getMediaItemById(mediaItemId);
    const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(mediaItemId, 5000);

    setTopMediaItemName(mediaItem?.name || mediaItem?.file_name || 'Media Item');
    setTopMediaItemScreenshots(
      screenshotRows.map((row) => ({
        ...row,
        mediaItem,
      }))
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const loadApp = async () => {
      if (!randomStartupComplete) {
        return;
      }

      setMediaItemsLoading(true);
      const settings = await window.electronAPI.getAppSettings();
      setAppSettings(settings);
      setScreenshotsPerRow(settings.default_screens_per_row);

      const items = await window.electronAPI.getMediaItems();
      const enrichedItems = await loadAndEnrichMediaItems(items, settings);
      setMediaItems(enrichedItems);
      setMediaItemsLoading(false);
    };

    loadApp();
  }, [randomStartupComplete]);


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
      const mediaItem = await window.electronAPI.getOrCreateMediaItem(path);
      setCurrentMediaItemId(mediaItem?.id || null);
      const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(mediaItem.id, 100);
      setScreenshots(screenshotRows.map(mapScreenshotRecord));
    });
  }, []);

  const addToDatabase = async () => {
    if (!videoPath) return;
    const mediaItem = await window.electronAPI.getOrCreateMediaItem(videoPath);
    setCurrentMediaItemId(mediaItem?.id || null);
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

  useEffect(() => {
    if (videoPath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [videoPath]);

  const handleOpen = () => {
    window.electronAPI.openVideoDialog();
  };

  const currentVideoName = videoPath ? videoPath.split(/[\\/]/).pop() : '';

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
    const mediaItem = await window.electronAPI.getOrCreateMediaItem(videoPath);
    const screenshotRow = await window.electronAPI.insertScreenshot({
      mediaItemId: mediaItem.id,
      screenshotPath: filePath,
      timestampSeconds: video.currentTime,
    });
    setScreenshots((prev) => [...prev, mapScreenshotRecord(screenshotRow)]);
  };

  const seekToScreenshot = (shot) => {
    const seconds = Number.isFinite(shot.timestampSeconds)
      ? shot.timestampSeconds
      : 0;
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
      } else if (data.command === 'ignore-from-random-selection') {
        if (!data.screenshotId) {
          console.warn('ignore-from-random-selection: missing screenshotId');
          return;
        }
        await window.electronAPI.ignoreScreenshot(data.screenshotId, 1);
        setRandomResults((prev) =>
          prev.filter((item) => item.id !== data.screenshotId)
        );
        await refreshRandomResults();
      } else if (data.command === 'show-all-screenshots-for-media-item') {
        await showMediaItemScreenshotsAtTop(data.mediaItemId);
      }
    });
  }, []);

  useEffect(() => {
    const handleOpenMediaTable = () => setOpenMediaTable(true);
    window.electronAPI.onOpenMediaTable(handleOpenMediaTable);
  }, []);



  return (
    <div style={{ padding: 2 }}>
      {videoPath && (
        <div
          style={{
            marginBottom: 12,
            border: '1px solid #d6dbe3',
            borderRadius: 18,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
          }}
        >
          <div
            style={{
              padding: '16px 18px 10px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
              background: 'rgba(255, 255, 255, 0.72)',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>
              {currentVideoName || 'Selected Video'}
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: 13,
                color: '#475569',
                wordBreak: 'break-all',
              }}
            >
              {videoPath}
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <div
              style={{
                width: '100%',
                borderRadius: 16,
                overflow: 'hidden',
                background: '#020617',
              }}
            >
              <video
                ref={videoRef}
                src={`file://${videoPath}`}
                controls
                muted={isMuted}
                style={{
                  width: '100%',
                  maxHeight: '72vh',
                  display: 'block',
                  background: '#000',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 10,
                marginTop: 14,
              }}
            >
              <button onClick={takeScreenshot}>Take Screenshot</button>
              <button onClick={addToDatabase} disabled={Boolean(currentMediaItemId)}>
                {currentMediaItemId ? 'Already in Database' : 'Add to Database'}
              </button>
              <button onClick={() => setAutoPlayOnScreenshotClick(!autoPlayOnScreenshotClick)}>
                {autoPlayOnScreenshotClick ? 'Turn Autoplay off' : 'Turn Autoplay On'}
              </button>
              <button onClick={stepBack}>&lt;</button>
              <button onClick={stepForward}>&gt;</button>
              <button onClick={goBackTenSeconds}>&lt; 10s</button>
              <button onClick={goForwardTenSeconds}>10s &gt;</button>
              <button onClick={toggleMute}>{isMuted ? 'Unmute' : 'Mute'}</button>
            </div>

            <div style={{ marginTop: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <h3 style={{ margin: 0 }}>Screenshots ({screenshots.length})</h3>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                  Click a screenshot to seek the video
                </span>
              </div>
              <div
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  padding: 8,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.68)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {screenshots.map((shot, idx) => (
                    <img
                      key={idx}
                      src={`file://${shot.path}`}
                      style={{
                        width: 160,
                        height: 90,
                        objectFit: 'cover',
                        borderRadius: 10,
                        cursor: 'pointer',
                        boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
                      }}
                      onClick={() => seekToScreenshot(shot)}
                      alt={shot.name}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <MediaTableDialog open={openMediaTable} onClose={() => setOpenMediaTable(false)} />
      {topMediaItemScreenshots.length > 0 && (
        <div style={{ border: '6px solid #ccc', margin: 0, padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8 }}>
            <strong>{topMediaItemName} Screenshots ({topMediaItemScreenshots.length})</strong>
            <button
              onClick={() => {
                setTopMediaItemScreenshots([]);
                setTopMediaItemName('');
              }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
            {topMediaItemScreenshots.map(({ id, file_path: screenshotPath, mediaItem }, i) => (
              <div
                key={`top-media-${id}-${i}`}
                style={{ flex: '1 0 auto', height: 'auto', maxWidth: `calc(100% / ${screenshotsPerRow})`, objectFit: 'contain', cursor: 'pointer' }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  window.electronAPI.showContextMenu({
                    screenshotId: id,
                    screenshotPath,
                    mediaItemId: mediaItem?.id,
                    filePath: mediaItem?.file_name,
                  });
                }}
              >
                <img src={`file://${screenshotPath}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ border: '6px solid #ccc', margin: 0, padding: 0 }}>
         {randomLoading && randomResults.length === 0 && (
          <div style={{ padding: 12, color: '#475569' }}>
            Loading random screenshots...
          </div>
         )}
         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
      {randomResults.map(({ id, file_path: screenshotPath, mediaItem }, i) => (
       
       
          <div
            key={i}
            style={{ flex: '1 0 auto', height: 'auto', maxWidth: `calc(100% / ${screenshotsPerRow})`, objectFit: 'contain', cursor: 'pointer' }}
            onContextMenu={(e) => {
              e.preventDefault();
              window.electronAPI.showContextMenu({
                screenshotId: id,
                screenshotPath,
                mediaItemId: mediaItem?.id,
                filePath: mediaItem?.file_name,
              });
            }}
          >
          <img src={`file://${screenshotPath}`} alt=""  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }} />
          </div>
        
      ))}
      </div>
        </div>
      {mediaItemsLoading && (
        <div style={{ padding: '8px 4px', color: '#475569', fontSize: 14 }}>
          Random screenshots loaded. Media items are now being loaded...
        </div>
      )}
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
                window.electronAPI.showContextMenu({
                  mediaItemId: item.id,
                  filePath: item.file_name,
                  screenshotId: item.screenshots[0]?.id,
                  screenshotPath: item.screenshots[0]?.path,
                });
              }}
            >
              {showItemName && (
                <h4
                  style={{ cursor: 'pointer' }}
                  onClick={async () => {
                    setVideoPath(item.file_name);
                    const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(item.id, 100);
                    setScreenshots(screenshotRows.map(mapScreenshotRecord));
                  }}
                >
                  {item.name}
                </h4>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                {item.screenshots.map((shot, i) => {
                  const seconds = Number.isFinite(shot.timestampSeconds) ? shot.timestampSeconds : 0;
                  return (
                    <div
                      key={i}
                      style={{ flex: '1 0 auto', height: 'auto', maxWidth: `calc(100% / ${screenshotsPerRow})`, objectFit: 'contain', cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredScreenshot({ video: item.file_name, time: seconds, index: `${idx}-${i}` })}
                      onMouseLeave={() => setHoveredScreenshot(null)}
                      onClick={async () => {
                        setVideoPath(item.file_name);
                        const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(item.id, 1000);
                        setScreenshots(screenshotRows.map(mapScreenshotRecord));
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
                          src={`file://${shot.path}`}
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

      <Tooltip title="Open Video">
        <button
          onClick={handleOpen}
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            background: '#1976d2',
            color: '#fff',
            fontSize: 32,
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            zIndex: 1000,
          }}
          aria-label="Open Video"
        >
          +
        </button>
      </Tooltip>



      {false && videoPath && (
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
                  onClick={() => seekToScreenshot(shot)}
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
