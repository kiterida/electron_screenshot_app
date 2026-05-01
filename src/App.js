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
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Slider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AutoAwesomeMotionOutlinedIcon from '@mui/icons-material/AutoAwesomeMotionOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import InputIcon from '@mui/icons-material/Input';
import LastPageIcon from '@mui/icons-material/LastPage';
import LibraryAddOutlinedIcon from '@mui/icons-material/LibraryAddOutlined';
import OutputIcon from '@mui/icons-material/Output';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
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

function sortExportedVideosByRange(videos) {
  return [...videos].sort((a, b) => {
    const startDiff = (a.start_seconds ?? 0) - (b.start_seconds ?? 0);
    if (startDiff !== 0) {
      return startDiff;
    }

    const endDiff = (a.end_seconds ?? 0) - (b.end_seconds ?? 0);
    if (endDiff !== 0) {
      return endDiff;
    }

    return (a.id ?? 0) - (b.id ?? 0);
  });
}

const MIN_SEQUENCE_SLOTS = 3;

function getSequenceDisplaySlotCount(clips) {
  return Math.max(MIN_SEQUENCE_SLOTS, clips.length + 1);
}

function App() {
  const videoRef = useRef();
  const canvasRef = useRef(document.createElement('canvas'));
  const randomLoadSequenceRef = useRef(0);
  const mediaLoadSequenceRef = useRef(0);
  const autoGenerateCancelRequestedRef = useRef(false);
  const pendingSeekTimeRef = useRef(null);
  const selectedMediaListIdRef = useRef('');
  const activeAddToListIdRef = useRef('');
  const exportedVideosGridRef = useRef(null);
  const sequenceAutoPlayPendingRef = useRef(false);
  const [videoPath, setVideoPath] = useState(null);
  const [screenshots, setScreenshots] = useState([]);
  const [exportedVideos, setExportedVideos] = useState([]);
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
  const [isManagingTopScreenshots, setIsManagingTopScreenshots] = useState(false);
  const [managedTopScreenshotIds, setManagedTopScreenshotIds] = useState([]);
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
  const [autoGenerateInPoint, setAutoGenerateInPoint] = useState(null);
  const [autoGenerateOutPoint, setAutoGenerateOutPoint] = useState(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);
  const [showVideoPlayer, setShowVideoPlayer] = useState(true);
  const [mediaDetailTab, setMediaDetailTab] = useState('screenshots');
  const [exportedVideosPerRow, setExportedVideosPerRow] = useState(4);
  const [exportedVideosGridWidth, setExportedVideosGridWidth] = useState(0);
  const [isBuildSequenceMode, setIsBuildSequenceMode] = useState(false);
  const [isSequenceBuilderMinimized, setIsSequenceBuilderMinimized] = useState(false);
  const [sequenceClips, setSequenceClips] = useState([]);
  const [saveLoadDialogOpen, setSaveLoadDialogOpen] = useState(false);
  const [savedSequences, setSavedSequences] = useState([]);
  const [sequenceNameInput, setSequenceNameInput] = useState('');
  const [selectedSavedSequenceId, setSelectedSavedSequenceId] = useState(null);
  const [sequencePlaybackIndex, setSequencePlaybackIndex] = useState(null);
  const [selectedSequenceSlomoRate, setSelectedSequenceSlomoRate] = useState(0.5);
  const [activeSequencePlaybackRate, setActiveSequencePlaybackRate] = useState(1);
  const [slomoMenuAnchorEl, setSlomoMenuAnchorEl] = useState(null);
  const [isPlayerDropActive, setIsPlayerDropActive] = useState(false);
  const [droppedExportParentMediaItemId, setDroppedExportParentMediaItemId] = useState(null);
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
  const currentMediaItemIdRef = useRef(null);
  const showRandomImages = appSettings.enable_random_images_on_startup !== 0;
  const autoGenerateIntervalSeconds = Math.max(1, parseInt(appSettings.auto_generate_interval_seconds, 10) || 10);
  const selectedMediaList = mediaLists.find((list) => Number(list.id) === Number(selectedMediaListId)) || null;
  const activeAddToList = mediaLists.find((list) => Number(list.id) === Number(activeAddToListId)) || null;
  const exportedVideoGridGap = 10;
  const exportedVideoDetailsHeight = 56;
  const exportedVideoVisibleRows = Math.min(3, Math.max(1, Math.ceil(exportedVideos.length / exportedVideosPerRow)));
  const exportedVideoCardWidth =
    exportedVideosGridWidth > 0
      ? Math.max(0, (exportedVideosGridWidth - exportedVideoGridGap * (exportedVideosPerRow - 1)) / exportedVideosPerRow)
      : 0;
  const exportedVideosPanelHeight =
    exportedVideoCardWidth > 0
      ? exportedVideoVisibleRows * (exportedVideoCardWidth * (9 / 16) + exportedVideoDetailsHeight) +
        (exportedVideoVisibleRows - 1) * exportedVideoGridGap
      : 'auto';
  const activeSequenceClip =
    sequencePlaybackIndex != null && sequencePlaybackIndex >= 0 && sequencePlaybackIndex < sequenceClips.length
      ? sequenceClips[sequencePlaybackIndex]
      : null;
  const isSequencePlaybackActive = Boolean(activeSequenceClip);
  const playerSourcePath = activeSequenceClip?.file_path || videoPath;
  const playerSourceName = activeSequenceClip?.file_name || (videoPath ? videoPath.split(/[\\/]/).pop() : '');
  const sequenceDisplaySlotCount = getSequenceDisplaySlotCount(sequenceClips);
  const slomoMenuOpen = Boolean(slomoMenuAnchorEl);
  const slomoRateOptions = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];

  useEffect(() => {
    selectedMediaListIdRef.current = selectedMediaListId;
  }, [selectedMediaListId]);

  useEffect(() => {
    activeAddToListIdRef.current = activeAddToListId;
  }, [activeAddToListId]);

  useEffect(() => {
    const gridElement = exportedVideosGridRef.current;
    if (!gridElement || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateGridWidth = () => {
      setExportedVideosGridWidth(gridElement.clientWidth);
    };

    updateGridWidth();

    const observer = new ResizeObserver(() => {
      updateGridWidth();
    });

    observer.observe(gridElement);

    return () => {
      observer.disconnect();
    };
  }, [mediaDetailTab]);

  useEffect(() => {
    currentMediaItemIdRef.current = currentMediaItemId;
  }, [currentMediaItemId]);

  useEffect(() => {
    if (sequencePlaybackIndex != null && sequencePlaybackIndex >= sequenceClips.length) {
      stopSequencePlayback();
    }
  }, [sequencePlaybackIndex, sequenceClips.length]);

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

  const stopSequencePlayback = () => {
    sequenceAutoPlayPendingRef.current = false;
    setActiveSequencePlaybackRate(1);
    setSequencePlaybackIndex(null);
  };

  const refreshSavedSequences = async () => {
    const sequences = await window.electronAPI.getVideoExportSequences();
    setSavedSequences(Array.isArray(sequences) ? sequences : []);
    return sequences;
  };

  const openSequenceSaveLoadDialog = async () => {
    await refreshSavedSequences();
    setSaveLoadDialogOpen(true);
  };

  const addClipToSequence = (clip, targetIndex = sequenceClips.length) => {
    if (!clip?.id) {
      return;
    }

    setSequenceClips((prev) => {
      const next = [...prev];
      const normalizedIndex = Math.max(0, Math.min(targetIndex, next.length));

      if (normalizedIndex >= next.length) {
        next.push(clip);
      } else {
        next[normalizedIndex] = clip;
      }

      return next;
    });
  };

  const removeSequenceClipAt = (slotIndex) => {
    setSequenceClips((prev) => prev.filter((_clip, index) => index !== slotIndex));
  };

  const clearSequenceBuilder = () => {
    stopSequencePlayback();
    setSequenceClips([]);
    setSequenceNameInput('');
    setSelectedSavedSequenceId(null);
    setIsSequenceBuilderMinimized(false);
  };

  const closeSequenceBuilder = () => {
    setIsBuildSequenceMode(false);
    setIsSequenceBuilderMinimized(false);
    setSaveLoadDialogOpen(false);
    setSlomoMenuAnchorEl(null);
  };

  const playSequenceFromStart = () => {
    if (sequenceClips.length === 0) {
      showSnackbar('Add at least one exported clip to the sequence first.', 'warning');
      return;
    }

    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }

    sequenceAutoPlayPendingRef.current = true;
    setIsSequenceBuilderMinimized(true);
    setSequencePlaybackIndex(0);
    setCurrentVideoTime(0);
  };

  const applySequencePlaybackRate = (rate) => {
    const normalizedRate = Number(rate) > 0 ? Number(rate) : 1;
    setActiveSequencePlaybackRate(normalizedRate);

    if (videoRef.current) {
      videoRef.current.playbackRate = normalizedRate;
    }
  };

  const handleSlomoButtonClick = () => {
    if (!isSequencePlaybackActive) {
      return;
    }

    applySequencePlaybackRate(selectedSequenceSlomoRate);
  };

  const loadExportedVideoIntoPlayer = (clip) => {
    if (!clip?.file_path) {
      return;
    }

    stopSequencePlayback();
    setIsPlayerDropActive(false);

    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }

    setVideoPath(clip.file_path);
    setCurrentMediaItemId(clip.media_item_id || null);
    setDroppedExportParentMediaItemId(clip.media_item_id || null);
    setMediaDetailTab('exports');
    setCurrentVideoTime(0);
    clearInOutPoints();
    showSnackbar(`Loaded exported clip "${clip.file_name}" into the main player.`, 'success');
  };

  const handleSelectSlomoRate = (rate) => {
    setSelectedSequenceSlomoRate(rate);
    setSlomoMenuAnchorEl(null);

    if (isSequencePlaybackActive) {
      applySequencePlaybackRate(rate);
    }
  };

  const jumpToSequenceClip = (nextIndex, options = {}) => {
    const { autoPlay = true, minimize = false } = options;

    if (sequenceClips.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(nextIndex, sequenceClips.length - 1));

    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }

    if (minimize) {
      setIsSequenceBuilderMinimized(true);
    }

    sequenceAutoPlayPendingRef.current = autoPlay;
    setSequencePlaybackIndex(boundedIndex);
    setCurrentVideoTime(0);
  };

  const playPreviousSequenceClip = () => {
    if (sequenceClips.length === 0) {
      return;
    }

    const currentIndex = sequencePlaybackIndex == null ? 0 : sequencePlaybackIndex;
    jumpToSequenceClip(currentIndex - 1, { autoPlay: true, minimize: true });
  };

  const playNextSequenceClip = () => {
    if (sequenceClips.length === 0) {
      return;
    }

    const currentIndex = sequencePlaybackIndex == null ? -1 : sequencePlaybackIndex;
    jumpToSequenceClip(currentIndex + 1, { autoPlay: true, minimize: true });
  };

  const restartSequencePlayback = () => {
    if (sequenceClips.length === 0) {
      return;
    }

    jumpToSequenceClip(0, { autoPlay: true, minimize: true });
  };

  const saveCurrentSequence = async () => {
    const trimmedName = sequenceNameInput.trim();
    if (!trimmedName) {
      showSnackbar('Enter a sequence name before saving.', 'warning');
      return;
    }

    if (sequenceClips.length === 0) {
      showSnackbar('Add at least one clip before saving a sequence.', 'warning');
      return;
    }

    try {
      const savedSequence = await window.electronAPI.saveVideoExportSequence({
        sequenceId: selectedSavedSequenceId,
        name: trimmedName,
        exportedVideoIds: sequenceClips.map((clip) => clip.id),
      });

      setSelectedSavedSequenceId(savedSequence?.id || null);
      setSequenceNameInput(savedSequence?.name || trimmedName);
      await refreshSavedSequences();
      showSnackbar(`Saved sequence "${savedSequence?.name || trimmedName}".`, 'success');
    } catch (error) {
      console.error('saveCurrentSequence failed:', error);
      showSnackbar(error?.message || 'Failed to save sequence.', 'error');
    }
  };

  const loadSavedSequence = async (sequenceId) => {
    try {
      const loadedSequence = await window.electronAPI.getVideoExportSequenceById(sequenceId);
      if (!loadedSequence) {
        showSnackbar('That saved sequence could not be found.', 'warning');
        return;
      }

      stopSequencePlayback();
      setSequenceClips(Array.isArray(loadedSequence.clips) ? loadedSequence.clips : []);
      setSequenceNameInput(loadedSequence.name || '');
      setSelectedSavedSequenceId(loadedSequence.id || null);
      setIsBuildSequenceMode(true);
      setIsSequenceBuilderMinimized(false);
      setSaveLoadDialogOpen(false);
      showSnackbar(`Loaded sequence "${loadedSequence.name}".`, 'success');
    } catch (error) {
      console.error('loadSavedSequence failed:', error);
      showSnackbar('Failed to load sequence.', 'error');
    }
  };

  const deleteSavedSequence = async (sequenceId) => {
    try {
      await window.electronAPI.deleteVideoExportSequence(sequenceId);
      if (Number(selectedSavedSequenceId) === Number(sequenceId)) {
        setSelectedSavedSequenceId(null);
      }
      await refreshSavedSequences();
      showSnackbar('Deleted saved sequence.', 'success');
    } catch (error) {
      console.error('deleteSavedSequence failed:', error);
      showSnackbar('Failed to delete saved sequence.', 'error');
    }
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

  const getDefaultManagedTopScreenshotIds = () => {
    const preferredIds = parseMediaImageList(topMediaItem?.image_list).filter(Boolean);
    if (preferredIds.length > 0) {
      return preferredIds.map((id) => Number(id));
    }

    return topMediaItemScreenshots.slice(0, 8).map((row) => Number(row.id));
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

  const openMediaItem = async (item, seekSeconds = null) => {
    stopSequencePlayback();
    setDroppedExportParentMediaItemId(null);

    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }

    setMediaDetailTab('screenshots');
    setVideoPath(item.file_name);
    setCurrentMediaItemId(item.id);
    const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(item.id, 1000);
    setScreenshots(screenshotRows.map(mapScreenshotRecord));

    if (Number.isFinite(seekSeconds)) {
      requestVideoPlayerSeek(seekSeconds);
    }
  };

  const getActiveMediaItemForCurrentVideo = async () => {
    if (!videoPath) {
      return null;
    }

    if (currentMediaItemIdRef.current) {
      const existingMediaItem = await window.electronAPI.getMediaItemById(currentMediaItemIdRef.current);
      if (existingMediaItem?.file_name === videoPath) {
        return existingMediaItem;
      }
    }

    return window.electronAPI.getOrCreateMediaItem(videoPath);
  };


  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
        return;
      }

      if (e.key === 'Escape') {
        if (isBuildSequenceMode) {
          e.preventDefault();
          closeSequenceBuilder();
          return;
        }

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
  }, [isBuildSequenceMode, isSelectingTopScreens, topMediaItemScreenshots.length]);

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
    setIsManagingTopScreenshots(false);
    setManagedTopScreenshotIds([]);
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
    setIsManagingTopScreenshots(false);
    setManagedTopScreenshotIds([]);
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

  const toggleManageTopScreenshots = () => {
    setIsManagingTopScreenshots((prev) => {
      const next = !prev;
      if (next) {
        setIsSelectingTopScreens(false);
        setSelectedTopScreenSlot(null);
        setManagedTopScreenshotIds(getDefaultManagedTopScreenshotIds());
      } else {
        setManagedTopScreenshotIds([]);
      }
      return next;
    });
  };

  const toggleManagedTopScreenshot = (screenshotId) => {
    const normalizedId = Number(screenshotId);
    setManagedTopScreenshotIds((prev) => (
      prev.includes(normalizedId)
        ? prev.filter((id) => id !== normalizedId)
        : [...prev, normalizedId]
    ));
  };

  const deleteUnselectedTopScreenshots = async () => {
    if (!topMediaItem?.id) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${Math.max(topMediaItemScreenshots.length - managedTopScreenshotIds.length, 0)} unselected screenshot(s) from "${topMediaItemName}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteUnselectedScreenshotsForMediaItem({
        mediaItemId: topMediaItem.id,
        keepScreenshotIds: managedTopScreenshotIds,
      });

      if (result?.updatedMediaItem) {
        syncMediaItemImageListState(result.updatedMediaItem);
        setTopMediaItem(result.updatedMediaItem);
      }

      const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(topMediaItem.id, 5000);
      setTopMediaItemScreenshots(
        screenshotRows.map((row) => ({
          ...row,
          mediaItem: result?.updatedMediaItem || topMediaItem,
        }))
      );
      setManagedTopScreenshotIds([]);
      setIsManagingTopScreenshots(false);

      showSnackbar(`Deleted ${result?.deletedCount || 0} unselected screenshot(s).`, 'success');
    } catch (error) {
      console.error('deleteUnselectedTopScreenshots failed:', error);
      showSnackbar('Failed to delete unselected screenshots.', 'error');
    }
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
      stopSequencePlayback();
      setDroppedExportParentMediaItemId(null);
      setVideoPath(path);
    });
  }, []);

  const addToDatabase = async () => {
    if (!videoPath) return;
    const mediaItem = await window.electronAPI.getOrCreateMediaItem(videoPath);
    setCurrentMediaItemId(mediaItem?.id || null);
    setDroppedExportParentMediaItemId(null);
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
    stopSequencePlayback();
    setDroppedExportParentMediaItemId(null);
    setVideoPath(path);
  };

  useEffect(() => {
    if (videoPath) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [videoPath]);

  useEffect(() => {
    clearInOutPoints();
  }, [videoPath]);

  useEffect(() => {
    let cancelled = false;

    const syncLoadedVideoState = async () => {
      if (!videoPath) {
        setCurrentMediaItemId(null);
        setDroppedExportParentMediaItemId(null);
        setScreenshots([]);
        setExportedVideos([]);
        return;
      }

      let mediaItem = null;
      const preferredMediaItemId = currentMediaItemIdRef.current;
      const fallbackParentMediaItemId = droppedExportParentMediaItemId;

      if (preferredMediaItemId) {
        const preferredMediaItem = await window.electronAPI.getMediaItemById(preferredMediaItemId);
        if (preferredMediaItem?.file_name === videoPath) {
          mediaItem = preferredMediaItem;
        }
      }

      if (!mediaItem) {
        mediaItem = await window.electronAPI.getMediaItemByFilePath(videoPath);
      }

      if (!mediaItem && fallbackParentMediaItemId) {
        mediaItem = await window.electronAPI.getMediaItemById(fallbackParentMediaItemId);
      }

      if (cancelled) {
        return;
      }

      setCurrentMediaItemId(mediaItem?.id || null);

      if (mediaItem?.id) {
        const screenshotRows = await window.electronAPI.getScreenshotsForMediaItem(mediaItem.id, 100);
        const exportedVideoRows = await window.electronAPI.getExportedVideosForMediaItem(mediaItem.id);

        if (cancelled) {
          return;
        }

        setScreenshots(screenshotRows.map(mapScreenshotRecord));
        setExportedVideos(sortExportedVideosByRange(exportedVideoRows));
      } else {
        setScreenshots([]);
        setExportedVideos([]);
      }
    };

    syncLoadedVideoState();

    return () => {
      cancelled = true;
    };
  }, [videoPath, currentMediaItemId, droppedExportParentMediaItemId]);

  const handleOpen = () => {
    stopSequencePlayback();
    setDroppedExportParentMediaItemId(null);

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

  const formatPlaybackTime = (seconds) => {
    if (!Number.isFinite(seconds)) {
      return '--:--:--';
    }

    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${secs}`;
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

  const setCurrentInPoint = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.currentTime)) {
      return;
    }

    const nextInPoint = Math.max(0, video.currentTime);
    if (autoGenerateOutPoint != null && nextInPoint >= autoGenerateOutPoint) {
      showSnackbar('The In point must be before the Out point.', 'warning');
      return;
    }

    setAutoGenerateInPoint(nextInPoint);
  };

  const setCurrentOutPoint = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.currentTime)) {
      return;
    }

    const nextOutPoint = Math.max(0, video.currentTime);
    if (autoGenerateInPoint != null && nextOutPoint <= autoGenerateInPoint) {
      showSnackbar('The Out point must be after the In point.', 'warning');
      return;
    }

    setAutoGenerateOutPoint(nextOutPoint);
  };

  const clearInOutPoints = () => {
    setAutoGenerateInPoint(null);
    setAutoGenerateOutPoint(null);
  };

  const jumpToInPoint = () => {
    if (autoGenerateInPoint == null || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = autoGenerateInPoint;
  };

  const jumpToOutPoint = () => {
    if (autoGenerateOutPoint == null || !videoRef.current) {
      return;
    }

    videoRef.current.currentTime = autoGenerateOutPoint;
  };

  const exportSelectedRange = async () => {
    if (!videoPath) {
      return;
    }

    if (autoGenerateInPoint == null || autoGenerateOutPoint == null || autoGenerateOutPoint <= autoGenerateInPoint) {
      showSnackbar('Please set a valid In and Out point before exporting.', 'warning');
      return;
    }

    try {
      const mediaItem = currentMediaItemId
        ? { id: currentMediaItemId }
        : droppedExportParentMediaItemId
          ? { id: droppedExportParentMediaItemId }
          : await window.electronAPI.getOrCreateMediaItem(videoPath);

      setCurrentMediaItemId(mediaItem?.id || null);
      const result = await window.electronAPI.exportVideoRange({
        inputPath: videoPath,
        mediaItemId: mediaItem.id,
        startSeconds: autoGenerateInPoint,
        endSeconds: autoGenerateOutPoint,
      });

      if (result?.canceled) {
        return;
      }

      if (result?.exportedVideo) {
        setExportedVideos((prev) =>
          sortExportedVideosByRange([
            result.exportedVideo,
            ...prev.filter((item) => item.id !== result.exportedVideo.id),
          ])
        );
        setMediaDetailTab('exports');
      }

      showSnackbar(`Exported selected range to ${result.outputPath}`, 'success');
    } catch (error) {
      console.error('exportSelectedRange failed:', error);
      showSnackbar('Failed to export the selected video range.', 'error');
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
    const mediaItem = await getActiveMediaItemForCurrentVideo();
    const screenshotRow = await window.electronAPI.insertScreenshot({
      mediaItemId: mediaItem.id,
      screenshotPath: filePath,
      timestampSeconds: video.currentTime,
    });
    setCurrentMediaItemId(mediaItem?.id || null);
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

    const generationStart = autoGenerateInPoint != null ? autoGenerateInPoint : 0;
    const generationEnd = autoGenerateOutPoint != null ? Math.min(autoGenerateOutPoint, video.duration) : video.duration;

    if (generationEnd <= generationStart) {
      showSnackbar('Please set a valid In/Out range before auto generating screenshots.', 'warning');
      return;
    }

    setIsAutoGeneratingScreens(true);
    autoGenerateCancelRequestedRef.current = false;
    setAutoGenerateProgress({
      current: 0,
      total: Math.max(1, Math.floor((generationEnd - generationStart) / autoGenerateIntervalSeconds) + 1),
    });

    const originalTime = video.currentTime;
    const wasPaused = video.paused;

    try {
      video.pause();

      const rootFolder = await window.electronAPI.getScreenshotFolder(videoPath);
      const autoFolder = `${rootFolder}/Auto_Generated_Screenshots`;
      const mediaItem = await getActiveMediaItemForCurrentVideo();
      const ctx = canvasRef.current.getContext('2d');
      const originalFilename = videoPath.split(/[\\/]/).pop();
      const baseName = originalFilename.replace(/\.(mp4|mov|avi|mpg|mkv|webm)$/i, '');
      const generatedScreenshots = [];

      canvasRef.current.width = video.videoWidth;
      canvasRef.current.height = video.videoHeight;

      let completedCount = 0;

      for (let seconds = generationStart; seconds < generationEnd; seconds += autoGenerateIntervalSeconds) {
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
    if (!showVideoPlayer || !videoRef.current) {
      requestVideoPlayerSeek(seconds);
      return;
    }
    videoRef.current.currentTime = seconds;
    if (autoPlayOnScreenshotClick) {
      videoRef.current.play().catch(() => {});
    }
  };

  const requestVideoPlayerSeek = (seconds) => {
    pendingSeekTimeRef.current = Number.isFinite(seconds) ? seconds : 0;
    if (!showVideoPlayer) {
      setShowVideoPlayer(true);
      window.electronAPI.setVideoPlayerVisibility(true);
    }
  };

  const openItemContextMenu = ({ screenshotId, screenshotPath, mediaItemId, filePath }) => {
    window.electronAPI.showContextMenu({
      screenshotId,
      screenshotPath,
      mediaItemId,
      filePath,
      currentListId: selectedMediaListId,
      currentListName: selectedMediaList?.name || '',
    });
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
      } else if (data.command === 'create-section') {
        const createdSection = await window.electronAPI.createMediaSection(data.mediaItemId);
        const currentSelectedListId = selectedMediaListIdRef.current;
        const currentActiveAddToListId = activeAddToListIdRef.current;

        await refreshMediaLists(currentSelectedListId, currentActiveAddToListId);

        if (currentSelectedListId) {
          await refreshSelectedMediaListItems(currentSelectedListId, {
            showEntireLibrary: currentActiveAddToListId === currentSelectedListId && Boolean(currentSelectedListId),
          });
        } else {
          const settings = await window.electronAPI.getAppSettings();
          await refreshSelectedMediaListItems('', {
            settingsOverride: settings,
            showEntireLibrary: true,
          });
        }

        showSnackbar(`Created "${createdSection.name}".`, 'success');
      } else if (data.command === 'move-media-item-to-list' || data.command === 'add-media-item-to-list') {
        await window.electronAPI.addMediaItemToList({
          listId: data.targetListId,
          mediaItemId: data.mediaItemId,
        });

        if (data.command === 'move-media-item-to-list' && data.currentListId) {
          await window.electronAPI.removeMediaItemFromList({
            listId: data.currentListId,
            mediaItemId: data.mediaItemId,
          });
        }

        const currentSelectedListId = selectedMediaListIdRef.current;
        const currentActiveAddToListId = activeAddToListIdRef.current;

        await refreshMediaLists(data.currentListId || currentSelectedListId, currentActiveAddToListId);

        if (currentSelectedListId) {
          await refreshSelectedMediaListItems(currentSelectedListId, {
            showEntireLibrary: currentActiveAddToListId === currentSelectedListId && Boolean(currentSelectedListId),
          });
        }

        setMediaItems((prev) =>
          data.command === 'move-media-item-to-list' && data.currentListId && Number(data.currentListId) === Number(currentSelectedListId)
            ? prev.filter((item) => Number(item.id) !== Number(data.mediaItemId))
            : prev
        );

        showSnackbar(
          data.command === 'move-media-item-to-list'
            ? `Moved item to "${data.targetListName}".`
            : `Added item to "${data.targetListName}".`,
          'success'
        );
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

  useEffect(() => {
    if (!showVideoPlayer || !videoRef.current || pendingSeekTimeRef.current == null) {
      return;
    }

    const seconds = pendingSeekTimeRef.current;
    pendingSeekTimeRef.current = null;
    videoRef.current.currentTime = seconds;
    if (autoPlayOnScreenshotClick) {
      videoRef.current.play().catch(() => {});
    }
  }, [showVideoPlayer, videoPath, autoPlayOnScreenshotClick]);



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
      {playerSourcePath && showVideoPlayer && (
        <div
          onDragOver={(event) => {
            const transferTypes = Array.from(event.dataTransfer?.types || []);
            if (!transferTypes.includes('application/x-exported-video-file-path')) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            if (!isPlayerDropActive) {
              setIsPlayerDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setIsPlayerDropActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsPlayerDropActive(false);

            const droppedClipId = Number(event.dataTransfer.getData('application/x-exported-video-id'));
            const droppedClipPath = event.dataTransfer.getData('application/x-exported-video-file-path');
            const droppedClip = exportedVideos.find((item) => Number(item.id) === droppedClipId);

            if (droppedClip) {
              loadExportedVideoIntoPlayer(droppedClip);
              return;
            }

            if (droppedClipPath) {
              loadExportedVideoIntoPlayer({
                file_path: droppedClipPath,
                file_name: droppedClipPath.split(/[\\/]/).pop(),
              });
            }
          }}
          style={{
            marginBottom: 12,
            border: '1px solid #d6dbe3',
            borderRadius: 18,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%)',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
            position: 'relative',
          }}
        >
          {isPlayerDropActive && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 4,
                border: '3px dashed #2563eb',
                background: 'rgba(219, 234, 254, 0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                color: '#1d4ed8',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              Drop exported video here to edit it in the main player
            </div>
          )}
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
                {playerSourceName || 'Selected Video'}
              </div>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 13,
                  color: '#475569',
                  wordBreak: 'break-all',
                }}
              >
                {playerSourcePath}
              </div>
              {isSequencePlaybackActive && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                  Sequence playback {sequencePlaybackIndex + 1} of {sequenceClips.length}
                </div>
              )}
            </div>
            <Tooltip title="Hide Video Player">
              <IconButton
                onClick={() => {
                  stopSequencePlayback();
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
                src={`file://${playerSourcePath}`}
                controls
                muted={isMuted}
                onTimeUpdate={(e) => setCurrentVideoTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => {
                  setCurrentVideoTime(e.currentTarget.currentTime || 0);
                  e.currentTarget.playbackRate = isSequencePlaybackActive ? activeSequencePlaybackRate : 1;

                  if (sequenceAutoPlayPendingRef.current) {
                    sequenceAutoPlayPendingRef.current = false;
                    e.currentTarget.play().catch(() => {});
                  }
                }}
                onEnded={() => {
                  if (!isSequencePlaybackActive) {
                    return;
                  }

                  if (sequencePlaybackIndex < sequenceClips.length - 1) {
                    sequenceAutoPlayPendingRef.current = true;
                    setSequencePlaybackIndex((prev) => (prev == null ? prev : prev + 1));
                    return;
                  }

                  stopSequencePlayback();
                  showSnackbar('Sequence playback finished.', 'success');
                }}
                style={{
                  width: '100%',
                  maxHeight: '72vh',
                  display: 'block',
                  background: '#000',
                }}
              />
            </div>
            <Box
              sx={{
                mt: 1.25,
                p: 1.25,
                borderRadius: 2,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                color: '#e2e8f0',
              }}
            >
              <Box
                sx={{
                  position: 'relative',
                  height: 10,
                  borderRadius: 999,
                  backgroundColor: 'rgba(148, 163, 184, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    position: 'absolute',
                    left: `${((autoGenerateInPoint != null ? autoGenerateInPoint : 0) / Math.max(videoRef.current?.duration || 0, 1)) * 100}%`,
                    width: `${(((autoGenerateOutPoint != null ? autoGenerateOutPoint : videoRef.current?.duration || 0) - (autoGenerateInPoint != null ? autoGenerateInPoint : 0)) / Math.max(videoRef.current?.duration || 0, 1)) * 100}%`,
                    top: 0,
                    bottom: 0,
                    background: 'linear-gradient(90deg, rgba(34,197,94,0.85), rgba(14,165,233,0.85))',
                  }}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    left: `${(currentVideoTime / Math.max(videoRef.current?.duration || 0, 1)) * 100}%`,
                    top: -3,
                    width: 2,
                    height: 16,
                    backgroundColor: '#fff',
                    boxShadow: '0 0 0 2px rgba(255,255,255,0.18)',
                    transform: 'translateX(-1px)',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75, fontSize: 12, color: '#cbd5e1' }}>
                <span>In: {formatPlaybackTime(autoGenerateInPoint != null ? autoGenerateInPoint : 0)}</span>
                <span>Current: {formatPlaybackTime(currentVideoTime)}</span>
                <span>Out: {formatPlaybackTime(autoGenerateOutPoint != null ? autoGenerateOutPoint : videoRef.current?.duration)}</span>
              </Box>
            </Box>

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
                disabled={isSequencePlaybackActive}
              >
                Take Screenshot
              </Button>
              <ButtonGroup variant="contained" color="secondary" disabled={!videoPath || isSequencePlaybackActive}>
                <Button
                  startIcon={<AutoAwesomeMotionOutlinedIcon />}
                  onClick={autoGenerateScreens}
                  disabled={isAutoGeneratingScreens || !videoPath || isSequencePlaybackActive}
                >
                  {isAutoGeneratingScreens ? 'Generating Screens...' : 'Auto Generate Screens'}
                </Button>
                <Tooltip title={`Configure interval (${autoGenerateIntervalSeconds}s)`}>
                  <span>
                    <Button
                      onClick={openAutoGenerateConfig}
                      disabled={isAutoGeneratingScreens || !videoPath || isSequencePlaybackActive}
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
                disabled={Boolean(currentMediaItemId) || isSequencePlaybackActive}
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
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Tooltip title="Mark In">
                  <span>
                    <IconButton size="small" color="primary" onClick={setCurrentInPoint} disabled={isSequencePlaybackActive}>
                      <InputIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Jump To In">
                  <span>
                    <IconButton size="small" color="primary" onClick={jumpToInPoint} disabled={autoGenerateInPoint == null}>
                      <FirstPageIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Mark Out">
                  <span>
                    <IconButton size="small" color="secondary" onClick={setCurrentOutPoint} disabled={isSequencePlaybackActive}>
                      <OutputIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Jump To Out">
                  <span>
                    <IconButton size="small" color="secondary" onClick={jumpToOutPoint} disabled={autoGenerateOutPoint == null}>
                      <LastPageIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Clear In/Out Range">
                  <span>
                    <IconButton
                      size="small"
                      color="inherit"
                      onClick={clearInOutPoints}
                      disabled={(autoGenerateInPoint == null && autoGenerateOutPoint == null) || isSequencePlaybackActive}
                    >
                      <RestartAltIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Export Selected Range">
                  <span>
                    <IconButton
                      size="small"
                      color="success"
                      onClick={exportSelectedRange}
                      disabled={
                        isSequencePlaybackActive ||
                        autoGenerateInPoint == null ||
                        autoGenerateOutPoint == null ||
                        autoGenerateOutPoint <= autoGenerateInPoint
                      }
                    >
                      <SaveAltIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              {(autoGenerateInPoint != null || autoGenerateOutPoint != null) && (
                <Chip
                  size="small"
                  variant="outlined"
                  color="secondary"
                  label={`${formatPlaybackTime(autoGenerateInPoint != null ? autoGenerateInPoint : 0)} - ${formatPlaybackTime(autoGenerateOutPoint != null ? autoGenerateOutPoint : videoRef.current?.duration)}`}
                />
              )}
            </Stack>

            <div style={{ marginTop: 18 }}>
              <Box
                sx={{
                  borderRadius: 2,
                  background: 'rgba(255,255,255,0.68)',
                  border: '1px solid rgba(148, 163, 184, 0.25)',
                  overflow: 'hidden',
                }}
              >
                <Tabs
                  value={mediaDetailTab}
                  onChange={(_event, nextValue) => setMediaDetailTab(nextValue)}
                  sx={{ px: 1, borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}
                >
                  <Tab value="screenshots" label={`Screenshots (${screenshots.length})`} />
                  <Tab value="exports" label={`Video Exports (${exportedVideos.length})`} />
                </Tabs>
                <Box sx={{ p: 1.25 }}>
                  {mediaDetailTab === 'screenshots' && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                          Screenshots
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Click a screenshot to seek the video
                        </Typography>
                      </Box>
                      <Box sx={{ maxHeight: 260, overflowY: 'auto', p: 0.5 }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
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
                        </Box>
                      </Box>
                    </>
                  )}
                  {mediaDetailTab === 'exports' && (
                    <>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.25, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            Video Exports
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            Exported clips from this media item
                          </Typography>
                        </Box>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ width: { xs: '100%', sm: 'auto' }, alignItems: { xs: 'stretch', sm: 'center' } }}>
                          <Button
                            variant={isBuildSequenceMode ? 'contained' : 'outlined'}
                            color="secondary"
                            onClick={() => {
                              setIsBuildSequenceMode((prev) => {
                                const nextValue = !prev;
                                if (!nextValue) {
                                  setIsSequenceBuilderMinimized(false);
                                }
                                return nextValue;
                              });
                            }}
                          >
                            Build Sequence
                          </Button>
                          <Box sx={{ minWidth: 220, width: { xs: '100%', sm: 260 } }}>
                            <Typography variant="caption" sx={{ color: '#475569', display: 'block', mb: 0.25 }}>
                              Clips per row: {exportedVideosPerRow}
                            </Typography>
                            <Slider
                              value={exportedVideosPerRow}
                              onChange={(_event, value) => setExportedVideosPerRow(value)}
                              min={2}
                              max={8}
                              step={1}
                              marks
                              size="small"
                              valueLabelDisplay="auto"
                              aria-label="Adjust exported videos per row"
                            />
                          </Box>
                        </Stack>
                      </Box>
                      {exportedVideos.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          No exported clips yet.
                        </Typography>
                      ) : (
                        <Box sx={{ height: exportedVideosPanelHeight, overflowY: 'auto', p: 0.5 }}>
                          <Box
                            ref={exportedVideosGridRef}
                            sx={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 1.25,
                              alignContent: 'flex-start',
                            }}
                          >
                            {exportedVideos.map((clip) => (
                              <Box
                                key={clip.id}
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData('application/x-exported-video-id', String(clip.id));
                                  event.dataTransfer.setData('application/x-exported-video-file-path', clip.file_path || '');
                                  event.dataTransfer.effectAllowed = 'copy';
                                }}
                                sx={{
                                  flex: `1 1 calc((100% - ${(exportedVideosPerRow - 1) * 10}px) / ${exportedVideosPerRow})`,
                                  maxWidth: `calc((100% - ${(exportedVideosPerRow - 1) * 10}px) / ${exportedVideosPerRow})`,
                                  minWidth: 0,
                                  borderRadius: 2,
                                  overflow: 'hidden',
                                  backgroundColor: '#fff',
                                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
                                  cursor: 'grab',
                                }}
                              >
                                <video
                                  src={`file://${clip.file_path}`}
                                  controls
                                  muted
                                  defaultMuted
                                  style={{
                                    width: '100%',
                                    height: 'auto',
                                    aspectRatio: '16 / 9',
                                    display: 'block',
                                    background: '#000',
                                  }}
                                />
                                <Box sx={{ p: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                                    {clip.file_name}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {formatPlaybackTime(clip.start_seconds)} - {formatPlaybackTime(clip.end_seconds)}
                                  </Typography>
                                  {isBuildSequenceMode && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: '#2563eb' }}>
                                      Drag into the sequence tray below
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      )}
                    </>
                  )}
                </Box>
              </Box>
            </div>
          </div>
        </div>
      )}

      {isBuildSequenceMode && mediaDetailTab === 'exports' && (
        <Paper
          elevation={12}
          sx={{
            position: 'fixed',
            left: '50%',
            top: isSequenceBuilderMinimized ? 16 : 'auto',
            bottom: isSequenceBuilderMinimized ? 'auto' : 24,
            transform: 'translateX(-50%)',
            width: isSequenceBuilderMinimized ? 'min(760px, calc(100vw - 24px))' : 'min(1080px, calc(100vw - 32px))',
            maxHeight: isSequenceBuilderMinimized ? 'none' : '42vh',
            overflow: isSequenceBuilderMinimized ? 'hidden' : 'auto',
            p: 1.5,
            borderRadius: 3,
            zIndex: saveLoadDialogOpen ? 1200 : 1450,
            pointerEvents: saveLoadDialogOpen ? 'none' : 'auto',
            background: 'rgba(255,255,255,0.98)',
            border: '1px solid rgba(148, 163, 184, 0.28)',
          }}
        >
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Sequence Builder
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  {isSequenceBuilderMinimized
                    ? `Minimized while playing. ${sequenceClips.length} clip${sequenceClips.length === 1 ? '' : 's'} in sequence.`
                    : 'Drag exported clips into the slots. A new empty slot appears as you fill them.'}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={closeSequenceBuilder}
                sx={{
                  color: '#475569',
                  border: '1px solid rgba(148, 163, 184, 0.28)',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {isSequenceBuilderMinimized ? (
                <>
                  <Button variant="outlined" onClick={playPreviousSequenceClip} disabled={sequenceClips.length === 0 || sequencePlaybackIndex == null || sequencePlaybackIndex <= 0}>
                    {'<'}
                  </Button>
                  <Button variant="outlined" onClick={playNextSequenceClip} disabled={sequenceClips.length === 0 || sequencePlaybackIndex == null || sequencePlaybackIndex >= sequenceClips.length - 1}>
                    {'>'}
                  </Button>
                  <ButtonGroup variant="outlined">
                    <Button onClick={handleSlomoButtonClick} disabled={!isSequencePlaybackActive}>
                      Slomo
                    </Button>
                    <Button
                      size="small"
                      onClick={(event) => setSlomoMenuAnchorEl(event.currentTarget)}
                      disabled={sequenceClips.length === 0}
                      aria-label="Choose slow motion speed"
                    >
                      <ArrowDropDownIcon fontSize="small" />
                    </Button>
                  </ButtonGroup>
                  <Button variant="outlined" onClick={restartSequencePlayback} disabled={sequenceClips.length === 0}>
                    Restart
                  </Button>
                  <Button variant="contained" onClick={() => setIsSequenceBuilderMinimized(false)}>
                    Restore Builder
                  </Button>
                  <Button variant="text" color="inherit" onClick={closeSequenceBuilder}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="contained" onClick={playSequenceFromStart} disabled={sequenceClips.length === 0}>
                    Play Sequence
                  </Button>
                  <Button variant="outlined" onClick={openSequenceSaveLoadDialog}>
                    Save/Load
                  </Button>
                  <Button variant="text" color="inherit" onClick={() => setIsSequenceBuilderMinimized(true)} disabled={sequenceClips.length === 0}>
                    Minimize
                  </Button>
                  <Button variant="text" color="inherit" onClick={clearSequenceBuilder} disabled={sequenceClips.length === 0}>
                    Clear
                  </Button>
                </>
              )}
            </Stack>
          </Stack>

          {!isSequenceBuilderMinimized && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
              {Array.from({ length: sequenceDisplaySlotCount }, (_value, slotIndex) => {
                const clip = sequenceClips[slotIndex] || null;

                return (
                  <Box
                    key={`sequence-slot-${slotIndex}`}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const droppedClipId = Number(event.dataTransfer.getData('application/x-exported-video-id'));
                      const droppedClip = exportedVideos.find((item) => Number(item.id) === droppedClipId);
                      if (!droppedClip) {
                        return;
                      }
                      addClipToSequence(droppedClip, slotIndex);
                    }}
                    sx={{
                      minHeight: 178,
                      borderRadius: 2,
                      border: clip ? '1px solid rgba(59, 130, 246, 0.28)' : '2px dashed rgba(148, 163, 184, 0.55)',
                      background: clip ? 'rgba(239, 246, 255, 0.65)' : 'rgba(248, 250, 252, 0.95)',
                      overflow: 'hidden',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1, py: 0.75, borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155' }}>
                        Slot {slotIndex + 1}
                      </Typography>
                      {clip && (
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => removeSequenceClipAt(slotIndex)}
                          sx={{ minWidth: 0, px: 1, fontSize: '0.75rem' }}
                        >
                          Remove
                        </Button>
                      )}
                    </Box>

                    {clip ? (
                      <Box>
                        <video
                          src={`file://${clip.file_path}`}
                          controls
                          muted
                          defaultMuted
                          style={{
                            width: '100%',
                            aspectRatio: '16 / 9',
                            display: 'block',
                            background: '#000',
                          }}
                        />
                        <Box sx={{ p: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                            {clip.file_name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatPlaybackTime(clip.start_seconds)} - {formatPlaybackTime(clip.end_seconds)}
                          </Typography>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ minHeight: 132, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                        Drop an exported clip here
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </Paper>
      )}

      <Dialog
        open={saveLoadDialogOpen}
        onClose={() => setSaveLoadDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        ModalProps={{
          sx: {
            zIndex: 1600,
          },
        }}
        PaperProps={{
          sx: {
            zIndex: 1601,
          },
        }}
        BackdropProps={{
          sx: {
            zIndex: 1590,
          },
        }}
      >
        <DialogTitle>Save or Load Sequence</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Sequence Name"
              value={sequenceNameInput}
              onChange={(event) => {
                setSequenceNameInput(event.target.value);
                setSelectedSavedSequenceId(null);
              }}
              fullWidth
            />
            <Button variant="contained" onClick={saveCurrentSequence} disabled={sequenceClips.length === 0}>
              Save Current Sequence
            </Button>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Saved Sequences
              </Typography>
              {savedSequences.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  No saved sequences yet.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {savedSequences.map((sequence) => (
                    <Box
                      key={sequence.id}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 1,
                        p: 1.25,
                        borderRadius: 2,
                        border: '1px solid rgba(148, 163, 184, 0.26)',
                        background: Number(sequence.id) === Number(selectedSavedSequenceId) ? 'rgba(239, 246, 255, 0.9)' : '#fff',
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {sequence.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {sequence.item_count || 0} clip{Number(sequence.item_count) === 1 ? '' : 's'}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setSequenceNameInput(sequence.name || '');
                            setSelectedSavedSequenceId(sequence.id);
                            loadSavedSequence(sequence.id);
                          }}
                        >
                          Load
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => deleteSavedSequence(sequence.id)}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveLoadDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={slomoMenuAnchorEl}
        open={slomoMenuOpen}
        onClose={() => setSlomoMenuAnchorEl(null)}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        disablePortal={false}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              zIndex: 1800,
            },
          },
        }}
      >
        {slomoRateOptions.map((rate) => (
          <MenuItem
            key={`slomo-rate-${rate}`}
            selected={selectedSequenceSlomoRate === rate}
            onClick={() => handleSelectSlomoRate(rate)}
          >
            {Math.round(rate * 100)}%
          </MenuItem>
        ))}
      </Menu>

      <MediaTableDialog open={openMediaTable} onClose={() => setOpenMediaTable(false)} />
      {mediaListsDialogOpen && (
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
      )}
      {topMediaItemScreenshots.length > 0 && (
        <div style={{ border: '6px solid #ccc', margin: 0, padding: 0, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, gap: 10, flexWrap: 'wrap' }}>
            <strong>{topMediaItemName} Screenshots ({topMediaItemScreenshots.length})</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setIsManagingTopScreenshots(false);
                  setManagedTopScreenshotIds([]);
                  setIsSelectingTopScreens((prev) => {
                    const next = !prev;
                    setSelectedTopScreenSlot(null);
                    return next;
                  });
                }}
              >
                {isSelectingTopScreens ? 'Done Selecting Top 8' : 'Select Top 8 Screens'}
              </button>
              <button onClick={toggleManageTopScreenshots}>
                {isManagingTopScreenshots ? 'Done Managing Screenshots' : 'Manage Screenshots'}
              </button>
              <button
                onClick={closeTopMediaItemScreenshots}
              >
                Clear
              </button>
            </div>
          </div>
          {isManagingTopScreenshots && (
            <div
              style={{
                position: 'sticky',
                top: 8,
                left: 8,
                zIndex: 4,
                margin: '0 8px 8px',
                width: 'fit-content',
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(255,255,255,0.97)',
                boxShadow: '0 10px 28px rgba(15, 23, 42, 0.12)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Manage Screenshots</div>
              <div style={{ fontSize: 13, color: '#475569', marginBottom: 10 }}>
                {managedTopScreenshotIds.length} selected
              </div>
              <button onClick={deleteUnselectedTopScreenshots}>
                Delete Unselected
              </button>
            </div>
          )}
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
                style={{
                  flex: '1 0 auto',
                  height: 'auto',
                  maxWidth: `calc(100% / ${screenshotsPerRow})`,
                  objectFit: 'contain',
                  cursor: 'pointer',
                  position: 'relative',
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openItemContextMenu({
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
                    if (isManagingTopScreenshots) {
                      toggleManagedTopScreenshot(id);
                      return;
                    }

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
                {isManagingTopScreenshots && (
                  <>
                    <div
                      style={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={managedTopScreenshotIds.includes(Number(id))}
                        readOnly
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        border: managedTopScreenshotIds.includes(Number(id))
                          ? '3px solid rgba(37, 99, 235, 0.9)'
                          : '3px solid rgba(148, 163, 184, 0.55)',
                        boxSizing: 'border-box',
                        pointerEvents: 'none',
                      }}
                    />
                  </>
                )}
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
              openItemContextMenu({
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
                openItemContextMenu({
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
                   onClick={() => openMediaItem(item)}
                >
                  {item.name}
                </h4>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                {item.screenshots.length === 0 && (
                  <div
                    style={{
                      flex: '1 0 auto',
                      maxWidth: `calc(100% / ${screenshotsPerRow})`,
                      minHeight: 180,
                      padding: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                      border: '1px dashed #64748b',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                    onClick={() =>
                      handleScreenshotInteraction({
                        mediaItemId: item.id,
                        mediaName: item.name || item.file_name,
                        onDefault: async () => {
                          await openMediaItem(item);
                        },
                      })
                    }
                  >
                    <div style={{ textAlign: 'center', color: '#334155' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                        No screenshots yet
                      </div>
                      <div style={{ fontSize: 13 }}>
                        Click to open {item.name || item.file_name}
                      </div>
                    </div>
                  </div>
                )}
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
                            await openMediaItem(item, seconds);
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
