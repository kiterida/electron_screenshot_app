// SearchDialog.js
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  InputAdornment,
  TextField
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export default function SearchDialog({ open, onClose, onSearchResults }) {
  const [query, setQuery] = useState('');

  const handleKeyPress = async (e) => {
    if (e.key === 'Enter' && query.trim()) {
      const results = await window.electronAPI.searchMediaItems(query);
      onSearchResults(results);
      onClose();
    }
  };

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Search Media Items</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          placeholder="Search..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={handleKeyPress}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            )
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
