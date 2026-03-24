import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

export default function IgnoredScreenshotsDialog({ open, onClose }) {
  const [screenshots, setScreenshots] = useState([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const loadIgnoredScreenshots = async () => {
      const rows = await window.electronAPI.getIgnoredScreenshots();
      setScreenshots(rows);
    };

    loadIgnoredScreenshots();
  }, [open]);

  const handleRemoveFromIgnoreList = async (screenshotId) => {
    await window.electronAPI.ignoreScreenshot(screenshotId, 0);
    setScreenshots((prev) => prev.filter((shot) => shot.id !== screenshotId));
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        Ignored Random Screenshots ({screenshots.length})
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {screenshots.length === 0 ? (
          <Typography color="text.secondary">
            No screenshots are currently ignored from random selection.
          </Typography>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 2,
            }}
          >
            {screenshots.map((shot) => (
              <Stack
                key={shot.id}
                spacing={1}
                sx={{
                  border: '1px solid #ddd',
                  borderRadius: 1,
                  p: 1.5,
                  backgroundColor: '#fff',
                }}
              >
                <Box
                  component="img"
                  src={`file://${shot.file_path}`}
                  alt={shot.file_name}
                  sx={{
                    width: '100%',
                    height: 180,
                    objectFit: 'cover',
                    borderRadius: 1,
                    backgroundColor: '#f5f5f5',
                  }}
                />
                <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                  {shot.file_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {shot.mediaItem?.name || shot.mediaItem?.file_name || 'No linked media item'}
                </Typography>
                <Button variant="outlined" onClick={() => handleRemoveFromIgnoreList(shot.id)}>
                  Remove From Ignore List
                </Button>
              </Stack>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
