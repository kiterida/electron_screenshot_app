import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { DataGrid } from '@mui/x-data-grid';

export default function MediaTableDialog({ open, onClose }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (open) {
      window.electronAPI.getAllMediaItems().then((data) => {
        const formattedRows = data.map((item, index) => ({
          id: index,
          ...item,
        }));
        setRows(formattedRows);
      });
    }
  }, [open]);

  // Auto-generate columns based on keys in first row
  const columns =
    rows.length > 0
      ? Object.keys(rows[0])
          .filter((key) => key !== 'id')
          .map((key) => ({
            field: key,
            headerName: key.replace(/_/g, ' ').toUpperCase(),
            width: 200,
            flex: 1,
          }))
      : [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle>
        Media Items
        <IconButton
          aria-label="close"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent style={{ height: '600px' }}>
        <DataGrid
          rows={rows}
          columns={[{ field: 'id', headerName: 'ID', width: 70 }, ...columns]}
          pageSize={25}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </DialogContent>
    </Dialog>
  );
}
