// App.js

import React, { useRef, useState, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import AutoAwesomeMotionOutlinedIcon from '@mui/icons-material/AutoAwesomeMotionOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import LibraryAddOutlinedIcon from '@mui/icons-material/LibraryAddOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import VolumeOffOutlinedIcon from '@mui/icons-material/VolumeOffOutlined';
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined';
import SettingsDialog from './components/SettingsDialog';
import SearchDialog from './components/SearchDialog';
import MediaTableDialog from './components/MediaTableDialog';
import MediaListsDialog from './components/MediaListsDialog';

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
  const mediaLoadSequenceRef = useRef(0);
  const autoGenerateCancelRequestedRef = useRef(false);
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
  const [topMediaItem, setTopMediaItem] = useState(null);
  const [isSelectingTopScreens, setIsSelectingTopScreens] = useState(false);
  const [selectedTopScreenSlot, setSelectedTopScreenSlot] = useState(null);
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
  const [isAutoGeneratingScreens, setIsAutoGeneratingScreens] = useState(false);
  const [autoGenerateConfigOpen, setAutoGenerateConfigOpen] = useState(false);
  const [autoGenerateIntervalInput, setAutoGenerateIntervalInput] = useState('10');
  const [autoGenerateProgress, setAutoGenerateProgress] = useState({
    current: 0,
    total: 0,
  });
  const [showVideoPlayer, setShowVideoPlayer] = useState(true);
  const [mediaLists, setMediaLists] = useState([]);
  const [selectedMediaListId, setSelectedMediaListId] = useState('');
  const [activeAddToListId, setActiveAddToListId] = useState('');
  const [mediaListsDialogOpen, setMediaListsDialogOpen] = useState(false);
  const [listActionMessage, setListActionMessage] = useState('');
  const [snackbarState, setSnackbarState] = useState({
    open: false,
    message: '',
    severity: 'info',
  });
  const showRandomImages = appSettings.enable_random_images_on_startup !== 0;
  const autoGenerateIntervalSeconds = Math.max(1, parseInt(appSettings.auto_generate_interval_seconds, 10) || 10);
  const selectedMediaList = mediaLists.find((list) => Number(list.id) === Number(selectedMediaListId)) || null;
  const activeAddToList = mediaLists.find((list) => Number(list.id) === Number(activeAddToListId)) || null;

  const mapScreenshotRecord = (record) => ({
    id: record.id,
    name: record.file_name,
    path: record.file_path,
    timestampSeconds: record.timestamp_seconds,
  });

  const showSnackbar = (message, severity = 'info') => {
    setSnackbarState({
      open: true,
      message,
      severity,
    });
  };

  const openAutoGenerateConfig = () => {
    setAutoGenerateIntervalInput(String(autoGenerateIntervalSeconds));
    setAutoGenerateConfigOpen(true);
  };

  const saveAutoGenerateConfig = () => {
    const nextInterval = Math.max(1, parseInt(autoGenerateIntervalInput, 10) || 10);
    window.electronAPI.updateAppSetting('auto_generate_interval_seconds', nextInterval);
    setAppSettings((prev) => ({ ...prev, auto_generate_interval_seconds: nextInterval }));
    setAutoGenerateIntervalInput(String(nextInterval));
    setAutoGenerateConfigOpen(false);
    showSnackbar(`Auto generate interval set to every ${nextInterval} seconds.`, 'success');
  };

  const parseMediaImageList = (imageListValue) => {
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
  };

  const orderScreenshotsByImageList = (screenshotRows, imageListValue) => {
    const preferredIds = parseMediaImageList(imageListValue).filter(Boolean);
    if (preferredIds.length === 0 || !Array.isArray(screenshotRows) || screenshotRows.length === 0) {
      return screenshotRows;
    }

    const screenshotMap = new Map(screenshotRows.map((row) => [Number(row.id), row]));
    const ordered = [];
    const usedIds = new Set();

    preferredIds.forEach((id) => {
      const row = screenshotMap.get(id);
      if (row && !usedIds.has(id)) {
        ordered.push(row);
        usedIds.add(id);
      }
    });

    screenshotRows.forEach((row) => {
      const id = Number(row.id);
      if (!usedIds.has(id)) {
        ordered.push(row);
      }
    });

    return ordered;
  };

  const getTopScreenSlots = () => {
    const selectedIds = parseMediaImageList(topMediaItem?.image_list);
    const screenshotMap = new Map(topMediaItemScreenshots.map((row) => [Number(row.id), row]));

    return Array.from({ length: 8 }, (_, index) => {
      const screenshotId = selectedIds[index];
      return screenshotId ? screenshotMap.get(Number(screenshotId)) || null : null;
    });
  };

  const refreshRandomResults = async () => {
    const settings = await window.electronAPI.getAppSettings();
    const shouldShowRandomImages = settings.enable_random_images_on_startup !== 0;
    const previousSequence = randomLoadSequenceRef.current;

    if (previousSequence) {
      window.electronAPI.cancelRandomScreenshotStream(previousSequence);
    }

    if (!shouldShowRandomImages) {
      randomLoadSequenceRef.current = 0;
      setRandomResults([]);
      setRandomLoading(false);
      setRandomStartupComplete(true);
      return;
    }

    const randomImagesCount = Math.max(1, parseInt(settings.random_images, 10) || 60);
    const loadSequence = Date.now();
    randomLoadSequenceRef.current = loadSequence;
    setRandomResults([]);
    setRandomLoading(true);
    window.electronAPI.startRandomScreenshotStream({ requestId: loadSequence, limit: randomImagesCount });
  };


  const loadSettings = async () => {
    const settings = await window.electronAPI.getAppSettings();
    console.log("loadSettings:", settings);
    setAppSettings(settings);
    return settings;
  };

  const refreshStartupMediaItems = async (settingsOverride) => {
    const settings = settingsOverride || await window.electronAPI.getAppSettings();
    const startupMediaList = settings.startup_media_list || 'all';
    const startupSelectedListId =
      typeof startupMediaList === 'string' && startupMediaList.startsWith('list:')
        ? startupMediaList.split(':')[1] || ''
        : '';

    setAppSettings(settings);
    setScreenshotsPerRow(settings.default_screens_per_row);
    setSelectedMediaListId(startupSelectedListId);
    setActiveAddToListId('');
    setMediaItemsLoading(true);
    mediaLoadSequenceRef.current = Date.now();
    setMediaItems([]);

    try {
      const items = await loadStartupMediaItems(settings);
      await loadAndEnrichMediaItems(items, settings, { progressive: true, batchSize: 8 });
    } finally {
      setMediaItemsLoading(false);
    }
  };

  const refreshSelectedMediaListItems = async (selectedListId, options = {}) => {
    const settings = options.settingsOverride || await window.electronAPI.getAppSettings();
    const showEntireLibrary = options.showEntireLibrary === true;
    setAppSettings(settings);
    setScreenshotsPerRow(settings.default_screens_per_row);
    setMediaItemsLoading(true);
    mediaLoadSequenceRef.current = Date.now();
    setMediaItems([]);

    try {
      let items = [];

      if (showEntireLibrary || !selectedListId) {
        items = await window.electronAPI.getMediaItems();
      } else {
        items = await window.electronAPI.getMediaItemsForList(selectedListId);
      }

      await loadAndEnrichMediaItems(items, settings, { progressive: true, batchSize: 8 });
    } finally {
      setMediaItemsLoading(false);
    }
  };

  const refreshMediaLists = async (preferredSelectedListId, preferredActiveAddToListId) => {
    const lists = await window.electronAPI.getMediaLists();
    setMediaLists(lists);

    setSelectedMediaListId((currentSelectedListId) => {
      const preferred = preferredSelectedListId || currentSelectedListId;
      if (preferred && lists.some((list) => Number(list.id) === Number(preferred))) {
        return preferred;
      }

      return '';
    });

    setActiveAddToListId((currentActiveId) => {
      const preferred = preferredActiveAddToListId || currentActiveId;
      if (preferred && lists.some((list) => Number(list.id) === Number(preferred))) {
        return preferred;
      }

      return '';
    });
  };

  // Call this after dialog closes
  const handleSettingsChanged = async () => {
    const settings = await loadSettings();
    await refreshRandomResults();
    await refreshStartupMediaItems(settings);
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
      await refreshMediaLists();
    };
    fetch();
  }, []);



  const handleSearchResults = async (searchResults) => {
    if (searchResults && searchResults.length > 0) {
      const settings = await window.electronAPI.getAppSettings();
      setMediaItemsLoading(true);
      try {
        await loadAndEnrichMediaItems(searchResults, settings, { progressive: true, batchSize: 8 });
      } finally {
        setMediaItemsLoading(false);
      }
    } else {
      mediaLoadSequenceRef.current = Date.now();
      setMediaItems([]); // or show "No results"
    }
  };


  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      if (e.key === 'Escape') {
        if (isSelectingTopScreens) {
          e.preventDefault();
          setIsSelectingTopScreens(false);
          setSelectedTopScreenSlot(null);
          return;
        }

        if (topMediaItemScreenshots.length > 0) {
          e.preventDefault();
          setTopMediaItemScreenshots([]);
          setTopMediaItemName('');
          setTopMediaItem(null);
          setSelectedTopScreenSlot(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSelectingTopScreens, topMediaItemScreenshots.length]);

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

  const enrichMediaItem = async (item, settings) => {
    const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(
      item.id,
      settings.screens_load_per_item
    );

    return {
      ...item,
      screenshots: screenshotRows.map(mapScreenshotRecord),
    };
  };

  const loadAndEnrichMediaItems = async (items, settings, options = {}) => {
    const { progressive = false, batchSize = 8 } = options;

    if (!progressive) {
      return Promise.all(items.map((item) => enrichMediaItem(item, settings)));
    }

    const loadSequence = Date.now();
    mediaLoadSequenceRef.current = loadSequence;
    setMediaItems([]);

    const enrichedItems = [];

    for (let index = 0; index < items.length; index += batchSize) {
      if (mediaLoadSequenceRef.current !== loadSequence) {
        return [];
      }

      const batch = items.slice(index, index + batchSize);
      const enrichedBatch = await Promise.all(batch.map((item) => enrichMediaItem(item, settings)));

      if (mediaLoadSequenceRef.current !== loadSequence) {
        return [];
      }

      enrichedItems.push(...enrichedBatch);
      setMediaItems((prev) => [...prev, ...enrichedBatch]);

      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return enrichedItems;
  };

  const syncMediaItemImageListState = (updatedMediaItem) => {
    if (!updatedMediaItem?.id) {
      return;
    }

    setTopMediaItem((prev) => {
      if (!prev || Number(prev.id) !== Number(updatedMediaItem.id)) {
        return prev;
      }

      return { ...prev, ...updatedMediaItem };
    });

    setTopMediaItemScreenshots((prev) => orderScreenshotsByImageList([...prev], updatedMediaItem.image_list));

    setMediaItems((prev) =>
      prev.map((item) => {
        if (Number(item.id) !== Number(updatedMediaItem.id)) {
          return item;
        }

        return {
          ...item,
          ...updatedMediaItem,
          screenshots: orderScreenshotsByImageList([...(item.screenshots || [])], updatedMediaItem.image_list),
        };
      })
    );

    if (Number(currentMediaItemId) === Number(updatedMediaItem.id)) {
      setScreenshots((prev) => orderScreenshotsByImageList([...prev], updatedMediaItem.image_list));
    }
  };

  const loadStartupMediaItems = async (settings) => {
    const startupMediaList = settings.startup_media_list || 'all';

    if (startupMediaList === 'none') {
      return [];
    }

    if (typeof startupMediaList === 'string' && startupMediaList.startsWith('list:')) {
      const listId = startupMediaList.split(':')[1];
      if (!listId) {
        return [];
      }

      return window.electronAPI.getMediaItemsForList(listId);
    }

    return window.electronAPI.getMediaItems();
  };

  const showMediaItemScreenshotsAtTop = async (mediaItemId) => {
    if (!mediaItemId) {
      return;
    }

    const mediaItem = await window.electronAPI.getMediaItemById(mediaItemId);
    const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(mediaItemId, 5000);

    setTopMediaItem(mediaItem);
    setTopMediaItemName(mediaItem?.name || mediaItem?.file_name || 'Media Item');
    setTopMediaItemScreenshots(
      screenshotRows.map((row) => ({
        ...row,
        mediaItem,
      }))
    );

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeTopMediaItemScreenshots = () => {
    setTopMediaItemScreenshots([]);
    setTopMediaItemName('');
    setTopMediaItem(null);
    setIsSelectingTopScreens(false);
    setSelectedTopScreenSlot(null);
  };

  const saveTopScreenSlots = async (nextIds) => {
    if (!topMediaItem?.id) {
      return;
    }

    const updatedMediaItem = await window.electronAPI.updateMediaItemImageList({
      mediaItemId: topMediaItem.id,
      imageList: nextIds,
    });

    syncMediaItemImageListState(updatedMediaItem);
  };

  const handleTopScreenshotSelected = async (screenshotId) => {
    if (!isSelectingTopScreens || !topMediaItem?.id) {
      return false;
    }

    const nextIds = [...parseMediaImageList(topMediaItem.image_list)];
    const targetIndex =
      selectedTopScreenSlot != null
        ? selectedTopScreenSlot
        : nextIds.findIndex((value) => !value);

    if (targetIndex === -1) {
      showSnackbar('All 8 slots are full. Click a slot first if you want to replace one.', 'warning');
      return true;
    }

    nextIds[targetIndex] = Number(screenshotId);
    await saveTopScreenSlots(nextIds);

    if (selectedTopScreenSlot != null) {
      setSelectedTopScreenSlot(null);
    }

    return true;
  };

  const clearTopScreenSlot = async (slotIndex) => {
    const nextIds = [...parseMediaImageList(topMediaItem?.image_list)];
    nextIds[slotIndex] = null;
    await saveTopScreenSlots(nextIds);
    setSelectedTopScreenSlot(slotIndex);
  };

  useEffect(() => {
      const loadApp = async () => {
        if (!randomStartupComplete) {
          return;
        }
      await refreshStartupMediaItems();
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
    window.electronAPI.onVideoSelected((path) => {
      setVideoPath(path);
    });
  }, []);

  const addToDatabase = async () => {
    if (!videoPath) return;
    const mediaItem = await window.electronAPI.getOrCreateMediaItem(videoPath);
    setCurrentMediaItemId(mediaItem?.id || null);
    showSnackbar('Media item added to database!', 'success');
  };

  const addMediaItemToActiveList = async (mediaItemId, mediaName = 'media item') => {
    if (!activeAddToListId) {
      return false;
    }

    if (!mediaItemId) {
      showSnackbar('This screenshot does not have a parent media item to add.', 'warning');
      return true;
    }

    await window.electronAPI.addMediaItemToList({
      listId: activeAddToListId,
      mediaItemId,
    });
    await refreshMediaLists(selectedMediaListId, activeAddToListId);
    setListActionMessage(`Added ${mediaName} to "${activeAddToList?.name || 'Selected List'}".`);
    return true;
  };

  const handleScreenshotInteraction = async ({
    mediaItemId,
    mediaName,
    onDefault,
  }) => {
    const handledByListMode = await addMediaItemToActiveList(mediaItemId, mediaName);
    if (handledByListMode) {
      return;
    }

    if (onDefault) {
      await onDefault();
    }
  };

  const openMediaFile = (path) => {
    setVideoPath(path);
  };

  useEffect(() => {
    if (videoPath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [videoPath]);

  useEffect(() => {
    let cancelled = false;

    const syncLoadedVideoState = async () => {
      if (!videoPath) {
        setCurrentMediaItemId(null);
        setScreenshots([]);
        return;
      }

      const mediaItem = await window.electronAPI.getMediaItemByFilePath(videoPath);

      if (cancelled) {
        return;
      }

      setCurrentMediaItemId(mediaItem?.id || null);

      if (mediaItem?.id) {
        const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(mediaItem.id, 100);

        if (cancelled) {
          return;
        }

        setScreenshots(screenshotRows.map(mapScreenshotRecord));
      } else {
        setScreenshots([]);
      }
    };

    syncLoadedVideoState();

    return () => {
      cancelled = true;
    };
  }, [videoPath]);

  const handleOpen = () => {
    if (isAutoGeneratingScreens) {
      showSnackbar('Please wait for auto generate screenshots to finish before opening another video.', 'warning');
      return;
    }

    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }
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

  const seekVideoToTime = (video, seconds) => {
    if (!video) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const handleSeeked = () => {
        cleanup();
        resolve();
      };

      const handleError = () => {
        cleanup();
        reject(new Error('Failed to seek video for screenshot generation.'));
      };

      const cleanup = () => {
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('error', handleError);
      };

      video.addEventListener('seeked', handleSeeked, { once: true });
      video.addEventListener('error', handleError, { once: true });
      video.currentTime = seconds;
    });
  };

  const autoGenerateScreens = async () => {
    const video = videoRef.current;
    if (!video || !videoPath || isAutoGeneratingScreens) {
      return;
    }

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      showSnackbar('Please wait for the video metadata to finish loading before generating screenshots.', 'warning');
      return;
    }

    setIsAutoGeneratingScreens(true);
    autoGenerateCancelRequestedRef.current = false;
    setAutoGenerateProgress({
      current: 0,
      total: Math.max(1, Math.ceil(video.duration / autoGenerateIntervalSeconds)),
    });

    const originalTime = video.currentTime;
    const wasPaused = video.paused;

    try {
      video.pause();

      const rootFolder = await window.electronAPI.getScreenshotFolder(videoPath);
      const autoFolder = `${rootFolder}/Auto_Generated_Screenshots`;
      const mediaItem = await window.electronAPI.getOrCreateMediaItem(videoPath);
      const ctx = canvasRef.current.getContext('2d');
      const originalFilename = videoPath.split(/[\\/]/).pop();
      const baseName = originalFilename.replace(/\.(mp4|mov|avi|mpg|mkv|webm)$/i, '');
      const generatedScreenshots = [];

      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;

      let completedCount = 0;

      for (let seconds = 0; seconds < video.duration; seconds += autoGenerateIntervalSeconds) {
        if (autoGenerateCancelRequestedRef.current) {
          break;
        }

        await seekVideoToTime(video, seconds);

        if (autoGenerateCancelRequestedRef.current) {
          break;
        }

        ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

        const timestamp = formatTime(seconds);
        const name = `${baseName}_${timestamp}.jpeg`;
        const filePath = `${autoFolder}/${name}`;
        const buffer = canvasRef.current.toDataURL('image/jpeg', 1);

        await window.electronAPI.saveScreenshot(filePath, buffer);
        const screenshotRow = await window.electronAPI.insertScreenshot({
          mediaItemId: mediaItem.id,
          screenshotPath: filePath,
          timestampSeconds: seconds,
        });

        generatedScreenshots.push(mapScreenshotRecord(screenshotRow));
        completedCount += 1;
        const nextCompletedCount = completedCount;
        setAutoGenerateProgress((prev) => ({
          ...prev,
          current: nextCompletedCount,
        }));
      }

      setCurrentMediaItemId(mediaItem?.id || null);
      setScreenshots((prev) => {
        const merged = new Map(prev.map((shot) => [shot.id, shot]));
        generatedScreenshots.forEach((shot) => {
          merged.set(shot.id, shot);
        });
        return Array.from(merged.values()).sort((a, b) => a.timestampSeconds - b.timestampSeconds);
      });

      if (autoGenerateCancelRequestedRef.current) {
        showSnackbar(`Auto generate cancelled after ${generatedScreenshots.length} screenshot${generatedScreenshots.length === 1 ? '' : 's'}.`, 'info');
      } else {
        showSnackbar(`Generated ${generatedScreenshots.length} screenshots in Auto_Generated_Screenshots.`, 'success');
      }
    } catch (error) {
      console.error('autoGenerateScreens failed:', error);
      showSnackbar('Failed to auto generate screenshots.', 'error');
    } finally {
      try {
        await seekVideoToTime(video, originalTime);
      } catch (seekBackError) {
        console.warn('Failed to restore original video position after auto generation:', seekBackError);
      }

      if (!wasPaused) {
        video.play().catch(() => {});
      }

      setIsAutoGeneratingScreens(false);
      setAutoGenerateProgress({ current: 0, total: 0 });
      autoGenerateCancelRequestedRef.current = false;
    }
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

  useEffect(() => {
    window.electronAPI.onVideoPlayerVisibilityChanged((isVisible) => {
      setShowVideoPlayer(Boolean(isVisible));
    });
  }, []);



  return (
    <div style={{ padding: 2 }}>
      <div
        style={{
          marginBottom: 12,
          padding: 12,
          border: '1px solid #d6dbe3',
          borderRadius: 14,
          background: '#f8fafc',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <strong>Media Lists</strong>
        <select
          value={selectedMediaListId}
          onChange={async (e) => {
            const nextListId = e.target.value;
            setSelectedMediaListId(nextListId);
            setListActionMessage('');

            if (activeAddToListId && activeAddToListId !== nextListId) {
              setActiveAddToListId('');
            }

            await refreshSelectedMediaListItems(nextListId, {
              showEntireLibrary: activeAddToListId === nextListId && Boolean(nextListId),
            });
          }}
          style={{ minWidth: 220, padding: '8px 10px' }}
        >
          <option value="">All Library Items</option>
          {mediaLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name} ({list.item_count || 0})
            </option>
          ))}
        </select>
        <button onClick={() => setMediaListsDialogOpen(true)}>Manage Lists</button>
        {selectedMediaListId && (
          <button
            onClick={async () => {
              const nextActiveState = activeAddToListId === selectedMediaListId ? '' : selectedMediaListId;
              setActiveAddToListId(nextActiveState);
              setListActionMessage('');

              await refreshSelectedMediaListItems(selectedMediaListId, {
                showEntireLibrary: Boolean(nextActiveState),
              });
            }}
          >
            {activeAddToListId === selectedMediaListId ? 'Stop Adding to List' : 'Add to List'}
          </button>
        )}
        <span style={{ color: '#475569', fontSize: 13 }}>
          {activeAddToList
            ? `Add mode is active for "${activeAddToList.name}". The full library is shown so screenshot clicks can add parent media items to this list.`
            : selectedMediaList
              ? `Viewing "${selectedMediaList.name}". Click "Add to List" if you want screenshot clicks to add items into this list.`
              : 'Select a list to display only that list, or leave it on All Library Items.'}
        </span>
        {listActionMessage && (
          <span style={{ color: '#166534', fontSize: 13 }}>{listActionMessage}</span>
        )}
      </div>
      {videoPath && showVideoPlayer && (
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
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
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
            <Tooltip title="Hide Video Player">
              <IconButton
                onClick={() => {
                  setShowVideoPlayer(false);
                  window.electronAPI.setVideoPlayerVisibility(false);
                }}
                sx={{
                  color: '#334155',
                  backgroundColor: 'rgba(255,255,255,0.78)',
                  border: '1px solid rgba(148, 163, 184, 0.3)',
                  '&:hover': {
                    backgroundColor: '#fff',
                  },
                }}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
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

            <Stack
              direction="row"
              spacing={1.25}
              useFlexGap
              flexWrap="wrap"
              sx={{ mt: 1.75, alignItems: 'center' }}
            >
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddPhotoAlternateOutlinedIcon />}
                onClick={takeScreenshot}
              >
                Take Screenshot
              </Button>
              <ButtonGroup variant="contained" color="secondary" disabled={!videoPath}>
                <Button
                  startIcon={<AutoAwesomeMotionOutlinedIcon />}
                  onClick={autoGenerateScreens}
                  disabled={isAutoGeneratingScreens || !videoPath}
                >
                  {isAutoGeneratingScreens ? 'Generating Screens...' : 'Auto Generate Screens'}
                </Button>
                <Tooltip title={`Configure interval (${autoGenerateIntervalSeconds}s)`}>
                  <span>
                    <Button
                      onClick={openAutoGenerateConfig}
                      disabled={isAutoGeneratingScreens || !videoPath}
                      sx={{ minWidth: 44, px: 1.25 }}
                    >
                      <TuneIcon fontSize="small" />
                    </Button>
                  </span>
                </Tooltip>
              </ButtonGroup>
              <Button
                variant={currentMediaItemId ? 'outlined' : 'contained'}
                color={currentMediaItemId ? 'success' : 'inherit'}
                startIcon={<LibraryAddOutlinedIcon />}
                onClick={addToDatabase}
                disabled={Boolean(currentMediaItemId)}
              >
                {currentMediaItemId ? 'Already in Database' : 'Add to Database'}
              </Button>
              <Chip
                color={autoPlayOnScreenshotClick ? 'success' : 'default'}
                label={autoPlayOnScreenshotClick ? 'Autoplay On' : 'Autoplay Off'}
                onClick={() => setAutoPlayOnScreenshotClick(!autoPlayOnScreenshotClick)}
                clickable
                variant={autoPlayOnScreenshotClick ? 'filled' : 'outlined'}
              />
              <ButtonGroup variant="outlined" color="inherit">
                <Button onClick={goBackTenSeconds} startIcon={<ChevronLeftIcon />}>
                  10s
                </Button>
                <Button onClick={stepBack}>
                  <ChevronLeftIcon fontSize="small" />
                </Button>
                <Button onClick={stepForward}>
                  <ChevronRightIcon fontSize="small" />
                </Button>
                <Button onClick={goForwardTenSeconds} endIcon={<ChevronRightIcon />}>
                  10s
                </Button>
              </ButtonGroup>
              <Button
                variant="outlined"
                color={isMuted ? 'warning' : 'success'}
                startIcon={isMuted ? <VolumeOffOutlinedIcon /> : <VolumeUpOutlinedIcon />}
                onClick={toggleMute}
              >
                {isMuted ? 'Unmute' : 'Mute'}
              </Button>
            </Stack>

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
                      onClick={() =>
                        handleScreenshotInteraction({
                          mediaItemId: currentMediaItemId,
                          mediaName: currentVideoName || shot.name,
                          onDefault: async () => seekToScreenshot(shot),
                        })
                      }
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
      <MediaListsDialog
        open={mediaListsDialogOpen}
        onClose={() => setMediaListsDialogOpen(false)}
        lists={mediaLists}
        activeListId={activeAddToListId}
        onSetActiveList={(listId) => {
          setActiveAddToListId(listId);
          setListActionMessage('');
        }}
        onListsChanged={refreshMediaLists}
        showSnackbar={showSnackbar}
      />
      {topMediaItemScreenshots.length > 0 && (
        <div style={{ border: '6px solid #ccc', margin: 0, padding: 0, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, gap: 10, flexWrap: 'wrap' }}>
            <strong>{topMediaItemName} Screenshots ({topMediaItemScreenshots.length})</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setIsSelectingTopScreens((prev) => {
                    const next = !prev;
                    setSelectedTopScreenSlot(null);
                    return next;
                  });
                }}
              >
                {isSelectingTopScreens ? 'Done Selecting Top 8' : 'Select Top 8 Screens'}
              </button>
              <button
                onClick={closeTopMediaItemScreenshots}
              >
                Clear
              </button>
            </div>
          </div>
          {isSelectingTopScreens && (
            <div
              style={{
                position: 'sticky',
                top: 8,
                zIndex: 3,
                margin: '0 8px 8px',
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(255,255,255,0.96)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Top 8 Screens</div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                Click a slot to target it, then click one of the screenshots below. Empty slots fill in order by default.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: 10 }}>
                {getTopScreenSlots().map((slotShot, index) => (
                  <div
                    key={`top-slot-${index}`}
                    onClick={() => setSelectedTopScreenSlot((prev) => (prev === index ? null : index))}
                    style={{
                      position: 'relative',
                      border: selectedTopScreenSlot === index ? '2px solid #2563eb' : '1px dashed #94a3b8',
                      borderRadius: 10,
                      padding: 6,
                      minHeight: 92,
                      background: selectedTopScreenSlot === index ? '#eff6ff' : '#f8fafc',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                      Slot {index + 1}
                    </div>
                    {slotShot ? (
                      <>
                        <img
                          src={`file://${slotShot.file_path || slotShot.path}`}
                          alt={slotShot.file_name || slotShot.name || `slot-${index + 1}`}
                          style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 8, display: 'block' }}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            clearTopScreenSlot(index);
                          }}
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            border: 'none',
                            background: '#dc2626',
                            color: '#fff',
                            cursor: 'pointer',
                            lineHeight: 1,
                          }}
                          aria-label={`Clear slot ${index + 1}`}
                        >
                          x
                        </button>
                      </>
                    ) : (
                      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
                        Empty
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
                <img
                  src={`file://${screenshotPath}`}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                  onClick={async () => {
                    const handledByTopSelector = await handleTopScreenshotSelected(id);
                    if (handledByTopSelector) {
                      return;
                    }

                    handleScreenshotInteraction({
                      mediaItemId: mediaItem?.id,
                      mediaName: mediaItem?.name || mediaItem?.file_name || 'media item',
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {showRandomImages && (
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
          <img
            src={`file://${screenshotPath}`}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
            onClick={() =>
              handleScreenshotInteraction({
                mediaItemId: mediaItem?.id,
                mediaName: mediaItem?.name || mediaItem?.file_name || 'media item',
              })
            }
          />
          </div>
        
      ))}
      </div>
        </div>
      )}
      {mediaItemsLoading && (
        <div style={{ padding: '8px 4px', color: '#475569', fontSize: 14 }}>
          Media items are loading...
        </div>
      )}
      <SettingsDialog open={settingsOpen} onClose={handleSettingsChanged} showSnackbar={showSnackbar} />
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
                     setCurrentMediaItemId(item.id);
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
                      onClick={() =>
                        handleScreenshotInteraction({
                          mediaItemId: item.id,
                          mediaName: item.name || item.file_name,
                          onDefault: async () => {
                            setVideoPath(item.file_name);
                            setCurrentMediaItemId(item.id);
                            const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(item.id, 1000);
                            setScreenshots(screenshotRows.map(mapScreenshotRecord));
                            setTimeout(() => {
                              if (videoRef.current) {
                                videoRef.current.currentTime = seconds;
                                videoRef.current.play();
                              }
                            }, 100);
                          },
                        })
                      }
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
          disabled={isAutoGeneratingScreens}
          style={{
            position: 'fixed',
            left: 16,
            bottom: 16,
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            background: isAutoGeneratingScreens ? '#94a3b8' : '#1976d2',
            color: '#fff',
            fontSize: 32,
            lineHeight: 1,
            cursor: isAutoGeneratingScreens ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            zIndex: 1000,
            opacity: isAutoGeneratingScreens ? 0.7 : 1,
          }}
          aria-label="Open Video"
        >
          +
        </button>
      </Tooltip>
      {isAutoGeneratingScreens && autoGenerateProgress.total > 0 && (
        <Paper
          elevation={10}
          sx={{
            position: 'fixed',
            right: 20,
            bottom: 88,
            width: { xs: 'calc(100vw - 32px)', sm: 320 },
            maxWidth: 360,
            p: 1.5,
            borderRadius: 2,
            zIndex: 1400,
          }}
        >
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Auto Generating Screenshots
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {Math.round((autoGenerateProgress.current / autoGenerateProgress.total) * 100)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={(autoGenerateProgress.current / autoGenerateProgress.total) * 100}
              sx={{ height: 8, borderRadius: 999 }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {autoGenerateProgress.current} of {autoGenerateProgress.total} screenshots saved
              </Typography>
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={() => {
                  autoGenerateCancelRequestedRef.current = true;
                }}
                sx={{
                  minWidth: 56,
                  px: 1,
                  py: 0.25,
                  fontSize: '0.7rem',
                  lineHeight: 1.2,
                }}
              >
                Cancel
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}
      <Snackbar
        open={snackbarState.open}
        autoHideDuration={4000}
        onClose={() => setSnackbarState((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbarState((prev) => ({ ...prev, open: false }))}
          severity={snackbarState.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbarState.message}
        </Alert>
      </Snackbar>
      <Dialog open={autoGenerateConfigOpen} onClose={() => setAutoGenerateConfigOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Auto Generate Screenshots</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Choose how many seconds apart each auto-generated screenshot should be taken.
            </Typography>
            <TextField
              label="Seconds Between Screenshots"
              type="number"
              value={autoGenerateIntervalInput}
              onChange={(e) => setAutoGenerateIntervalInput(e.target.value)}
              inputProps={{ min: 1, step: 1 }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAutoGenerateConfigOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveAutoGenerateConfig}>
            Save
          </Button>
        </DialogActions>
      </Dialog>



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
