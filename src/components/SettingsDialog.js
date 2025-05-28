import { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, TextField } from '@mui/material';

export default function SettingsDialog({ open, onClose }) {
  const [settings, setSettings] = useState({
    default_screens_per_row: 3,
    screens_load_per_item: 12,
  });

  useEffect(() => {
    if (open) {
      window.electronAPI.getAppSettings().then((loadedSettings) => {
        setSettings((prev) => ({ ...prev, ...loadedSettings }));
      });
    }
  }, [open]);

  const handleChange = (key) => (e) => {
    const value = parseInt(e.target.value, 10);
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    window.electronAPI.updateAppSetting(key, value);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>App Settings</DialogTitle>
      <DialogContent>
        <TextField
          label="Default Screenshots Per Row"
          type="number"
          fullWidth
          margin="dense"
          value={settings.default_screens_per_row || ''}
          onChange={handleChange('default_screens_per_row')}
        />
        <TextField
          label="Screenshots to Load Per Media Item"
          type="number"
          fullWidth
          margin="dense"
          value={settings.screens_load_per_item || ''}
          onChange={handleChange('screens_load_per_item')}
        />
      </DialogContent>
    </Dialog>
  );
}
