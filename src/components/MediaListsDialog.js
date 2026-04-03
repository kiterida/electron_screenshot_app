import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { DataGrid } from '@mui/x-data-grid';

export default function MediaListsDialog({
  open,
  onClose,
  lists,
  activeListId,
  onSetActiveList,
  onListsChanged,
  showSnackbar,
}) {
  const [newListName, setNewListName] = useState('');
  const [selectedListId, setSelectedListId] = useState(activeListId || '');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const selectedListIdRef = useRef(selectedListId);
  const activeListIdRef = useRef(activeListId);
  const openRef = useRef(open);
  const onListsChangedRef = useRef(onListsChanged);
  const showSnackbarRef = useRef(showSnackbar);

  const loadRowsForList = async (listId) => {
    if (!listId) {
      setRows([]);
      return;
    }

    setLoadingRows(true);
    try {
      const items = await window.electronAPI.getMediaItemsForList(listId);
      const itemsWithPreviews = await Promise.all(
        items.map(async (item) => {
          const screenshots = await window.electronAPI.getScreenshotsForMediaItem(item.id, 4);
          return {
            ...item,
            id: item.id,
            screenshots: screenshots.slice(0, 4),
          };
        })
      );

      if (Number(selectedListIdRef.current) === Number(listId)) {
        setRows(itemsWithPreviews);
      }
    } finally {
      if (Number(selectedListIdRef.current) === Number(listId)) {
        setLoadingRows(false);
      }
    }
  };

  useEffect(() => {
    selectedListIdRef.current = selectedListId;
  }, [selectedListId]);

  useEffect(() => {
    activeListIdRef.current = activeListId;
  }, [activeListId]);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    onListsChangedRef.current = onListsChanged;
  }, [onListsChanged]);

  useEffect(() => {
    showSnackbarRef.current = showSnackbar;
  }, [showSnackbar]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedListId(activeListId || '');
  }, [open, activeListId]);

  useEffect(() => {
    if (!open || !selectedListId) {
      setRows([]);
      return;
    }

    loadRowsForList(selectedListId);
  }, [open, selectedListId, lists]);

  useEffect(() => {
    window.electronAPI.onContextCommand(async (data) => {
      if (!openRef.current) {
        return;
      }

      if (data.command !== 'move-media-item-to-list' && data.command !== 'add-media-item-to-list') {
        return;
      }

      const currentListId = selectedListIdRef.current;
      if (!currentListId || Number(data.currentListId) !== Number(currentListId)) {
        return;
      }

      try {
        await window.electronAPI.addMediaItemToList({
          listId: data.targetListId,
          mediaItemId: data.mediaItemId,
        });

        if (data.command === 'move-media-item-to-list') {
          await window.electronAPI.removeMediaItemFromList({
            listId: currentListId,
            mediaItemId: data.mediaItemId,
          });
        }

        await onListsChangedRef.current?.(currentListId, activeListIdRef.current);
        await loadRowsForList(currentListId);
        showSnackbarRef.current?.(
          data.command === 'move-media-item-to-list'
            ? `Moved item to "${data.targetListName}".`
            : `Added item to "${data.targetListName}".`,
          'success'
        );
      } catch (error) {
        console.error('List context menu action failed:', error);
        showSnackbarRef.current?.(error?.message || 'Failed to update media list.', 'error');
      }
    });
  }, []);

  const openListPreviewContextMenu = (event, row, shot = null) => {
    event.preventDefault();
    event.stopPropagation();
    const currentList = lists.find((list) => Number(list.id) === Number(selectedListId));
    window.electronAPI.showContextMenu({
      screenshotId: shot?.id || row.screenshots?.[0]?.id || null,
      screenshotPath: shot?.file_path || row.screenshots?.[0]?.file_path || null,
      mediaItemId: row.id,
      filePath: row.file_name,
      currentListId: selectedListId,
      currentListName: currentList?.name || '',
    });
  };

  const columns = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'added_to_list_at', headerName: 'Added', width: 180 },
      {
        field: 'mediaItem',
        headerName: 'Media Item',
        flex: 1,
        minWidth: 520,
        sortable: false,
        renderCell: (params) => (
          <Box
            sx={{ py: 1, width: '100%' }}
            onContextMenu={(event) => openListPreviewContextMenu(event, params.row)}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {params.row.name || 'Untitled media item'}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: 'block',
                mb: 1,
                wordBreak: 'break-all',
              }}
            >
              {params.row.file_name}
            </Typography>
            <Stack
              direction="row"
              spacing={1}
              onContextMenu={(event) => openListPreviewContextMenu(event, params.row)}
            >
              {(params.row.screenshots || []).map((shot) => (
                <Box
                  key={shot.id || shot.file_path}
                  component="img"
                  src={`file://${shot.file_path}`}
                  alt={shot.file_name || 'Screenshot preview'}
                  onContextMenu={(event) => openListPreviewContextMenu(event, params.row, shot)}
                  sx={{
                    width: 96,
                    height: 54,
                    objectFit: 'cover',
                    borderRadius: 1,
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    backgroundColor: '#e2e8f0',
                  }}
                />
              ))}
              {(params.row.screenshots || []).length === 0 && (
                <Typography variant="caption" color="text.secondary">
                  No screenshots available.
                </Typography>
              )}
            </Stack>
          </Box>
        ),
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 120,
        sortable: false,
        renderCell: (params) => (
          <Button
            color="error"
            size="small"
            onClick={async () => {
              await window.electronAPI.removeMediaItemFromList({
                listId: selectedListId,
                mediaItemId: params.row.id,
              });
              await onListsChanged();
            }}
          >
            Remove
          </Button>
        ),
      },
    ],
    [lists, onListsChanged, selectedListId]
  );

  const handleCreateList = async () => {
    const trimmed = newListName.trim();
    if (!trimmed) {
      return;
    }

    try {
      const created = await window.electronAPI.createMediaList(trimmed);
      setNewListName('');
      setSelectedListId(created.id);
      onSetActiveList(created.id);
      await onListsChanged(created.id);
    } catch (error) {
      console.error('handleCreateList failed:', error);
      showSnackbar?.(error?.message || 'Failed to create list.', 'error');
    }
  };

  const handleDeleteList = async () => {
    if (!selectedListId) {
      return;
    }

    const list = lists.find((item) => item.id === selectedListId);
    const confirmed = window.confirm(`Delete list "${list?.name || 'Selected List'}"?`);
    if (!confirmed) {
      return;
    }

    await window.electronAPI.deleteMediaList(selectedListId);
    if (activeListId === selectedListId) {
      onSetActiveList('');
    }
    setSelectedListId('');
    await onListsChanged();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        Media Lists
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <TextField
              label="New List Name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              fullWidth
            />
            <Button variant="contained" onClick={handleCreateList}>
              Create List
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
            <TextField
              select
              label="Selected List"
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              fullWidth
            >
              {lists.length === 0 ? (
                <MenuItem value="" disabled>
                  No lists yet
                </MenuItem>
              ) : (
                lists.map((list) => (
                  <MenuItem key={list.id} value={list.id}>
                    {list.name} ({list.item_count || 0})
                  </MenuItem>
                ))
              )}
            </TextField>
            <Button
              variant={selectedListId && Number(selectedListId) === Number(activeListId) ? 'contained' : 'outlined'}
              onClick={() => onSetActiveList(selectedListId || '')}
              disabled={!selectedListId}
            >
              {selectedListId && Number(selectedListId) === Number(activeListId) ? 'Add Mode Target' : 'Set Add Target'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={handleDeleteList}
              disabled={!selectedListId}
            >
              Delete List
            </Button>
          </Stack>

          {selectedListId ? (
            <Box sx={{ height: 520 }}>
              <DataGrid
                rows={rows}
                columns={columns}
                loading={loadingRows}
                getRowHeight={() => 120}
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25, page: 0 },
                  },
                }}
                sx={{
                  '& .MuiDataGrid-cell': {
                    alignItems: 'flex-start',
                  },
                }}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select a list to inspect its media items. Set an add target if you want screenshot clicks in the app to add parent media items to that list.
            </Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
