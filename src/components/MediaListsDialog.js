import React, { useEffect, useMemo, useState } from 'react';
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
}) {
  const [newListName, setNewListName] = useState('');
  const [selectedListId, setSelectedListId] = useState(activeListId || '');
  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);

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

    let cancelled = false;

    const loadRows = async () => {
      setLoadingRows(true);
      try {
        const items = await window.electronAPI.getMediaItemsForList(selectedListId);
        if (!cancelled) {
          setRows(items.map((item) => ({ ...item, id: item.id })));
        }
      } finally {
        if (!cancelled) {
          setLoadingRows(false);
        }
      }
    };

    loadRows();

    return () => {
      cancelled = true;
    };
  }, [open, selectedListId, lists]);

  const columns = useMemo(
    () => [
      { field: 'id', headerName: 'ID', width: 80 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 180 },
      { field: 'file_name', headerName: 'File Path', flex: 1.4, minWidth: 240 },
      { field: 'added_to_list_at', headerName: 'Added', width: 180 },
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
    [onListsChanged, selectedListId]
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
      alert(error?.message || 'Failed to create list.');
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
              {selectedListId && Number(selectedListId) === Number(activeListId) ? 'Active List' : 'Set Active'}
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
                pageSizeOptions={[10, 25, 50, 100]}
                initialState={{
                  pagination: {
                    paginationModel: { pageSize: 25, page: 0 },
                  },
                }}
              />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Select a list to inspect its media items. Set an active list to add parent media items by clicking screenshots in the app.
            </Typography>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
