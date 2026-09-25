import { useEffect, useState } from 'react';
import { Box, Button, Checkbox, Dialog, DialogTitle, DialogContent, FormControlLabel, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import IgnoredScreenshotsDialog from './IgnoredScreenshotsDialog';

export default function SettingsDialog({ open, onClose, showSnackbar }) {
  const driveLetterOptions = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const [settings, setSettings] = useState({
    default_screens_per_row: 3,
    screens_load_per_item: 12,
    random_images: 60,
    enable_random_images_on_startup: 1,
    startup_media_list: 'all',
    database_file: '',
    requested_database_file: '',
    items_per_page: 25,
  });
  const [migrationResult, setMigrationResult] = useState(null);
  const [ignoredDialogOpen, setIgnoredDialogOpen] = useState(false);
  const [mediaLists, setMediaLists] = useState([]);
  const [fromDriveLetter, setFromDriveLetter] = useState('E');
  const [toDriveLetter, setToDriveLetter] = useState('T');
  const [driveLetterUpdateResult, setDriveLetterUpdateResult] = useState(null);

  useEffect(() => {
    if (open) {
      window.electronAPI.getAppSettings().then((loadedSettings) => {
        setSettings((prev) => ({ ...prev, ...loadedSettings }));
      });
      window.electronAPI.getMediaLists().then((lists) => {
        setMediaLists(lists);
      });
      setMigrationResult(null);
      setDriveLetterUpdateResult(null);
    }
  }, [open]);

  const handleChange = (key) => (e) => {
    const value = parseInt(e.target.value, 10);
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    window.electronAPI.updateAppSetting(key, value);
  };

  const handleCheckboxChange = (key) => (e) => {
    const value = e.target.checked ? 1 : 0;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    window.electronAPI.updateAppSetting(key, value);
  };

  const handleSelectChange = (key) => (e) => {
    const value = e.target.value;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    window.electronAPI.updateAppSetting(key, value);
  };

  const handleSelectExistingDatabaseFile = async () => {
    const databaseFile = await window.electronAPI.selectExistingDatabaseFile();
    if (!databaseFile) {
      return;
    }

    setSettings((prev) => ({ ...prev, database_file: databaseFile }));
    window.location.reload();
  };

  const handleCreateDatabaseFile = async () => {
    const databaseFile = await window.electronAPI.createDatabaseFile();
    if (!databaseFile) {
      return;
    }

    setSettings((prev) => ({ ...prev, database_file: databaseFile }));
    window.location.reload();
  };

  const handleSelectScreenshotFolder = async () => {
    const screenshotFolder = await window.electronAPI.selectScreenshotFolder();
    if (!screenshotFolder) {
      return;
    }

    window.location.reload();
  };

  const handleMigrateScreenshots = async () => {
    const result = await window.electronAPI.migrateScreenshotsFromFolder();
    setMigrationResult(result);

    if (!result.ok) {
      showSnackbar?.(result.message || 'Screenshot migration could not be started.', 'error');
      return;
    }

    showSnackbar?.(
      `Migration complete. Scanned ${result.scanned}, matched ${result.matched}, inserted ${result.inserted}, unmatched ${result.unmatched.length}.`,
      'success'
    );
  };

  const handleUpdateDriveLetters = async () => {
    if (fromDriveLetter === toDriveLetter) {
      showSnackbar?.('Choose different source and destination drive letters.', 'warning');
      return;
    }

    const confirmed = window.confirm(
      `Update all media item paths that start with ${fromDriveLetter}: to use ${toDriveLetter}: instead?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const result = await window.electronAPI.updateMediaItemDriveLetters({
        fromDriveLetter,
        toDriveLetter,
      });

      setDriveLetterUpdateResult(result);
      showSnackbar?.(
        `Drive letter update complete. Updated ${result.updated} of ${result.scanned} matching media item path(s).`,
        'success'
      );
    } catch (error) {
      console.error('handleUpdateDriveLetters failed:', error);
      showSnackbar?.(error?.message || 'Failed to update media item drive letters.', 'error');
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>
          App Settings
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ minWidth: 420, pt: 1 }}>
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
            <TextField
              label="Random Images"
              type="number"
              fullWidth
              margin="dense"
              value={settings.random_images || ''}
              onChange={handleChange('random_images')}
            />
            <TextField
              label="Items Per Page"
              type="number"
              fullWidth
              margin="dense"
              value={settings.items_per_page || ''}
              onChange={handleChange('items_per_page')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(settings.enable_random_images_on_startup)}
                  onChange={handleCheckboxChange('enable_random_images_on_startup')}
                />
              }
              label="Show random images on startup"
            />
            <TextField
              select
              label="Main List To Load At Startup"
              fullWidth
              margin="dense"
              value={settings.startup_media_list || 'all'}
              onChange={handleSelectChange('startup_media_list')}
            >
              <MenuItem value="all">All (Default)</MenuItem>
              <MenuItem value="none">None - Don't load any list at startup</MenuItem>
              {mediaLists.map((list) => (
                <MenuItem key={list.id} value={`list:${list.id}`}>
                  {list.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="SQLite Database File"
              fullWidth
              margin="dense"
              value={settings.database_file || settings.requested_database_file || ''}
              InputProps={{ readOnly: true }}
            />
            <Button variant="outlined" onClick={handleSelectExistingDatabaseFile}>
              Select Existing Database
            </Button>
            <Button variant="outlined" onClick={handleCreateDatabaseFile}>
              Create New Database
            </Button>
            <Button variant="outlined" onClick={handleSelectScreenshotFolder}>
              Set Screenshot Folder
            </Button>
            <Button variant="outlined" onClick={handleMigrateScreenshots}>
              Migrate Existing Screenshots
            </Button>
            <Button variant="outlined" onClick={() => window.electronAPI.openMediaTable()}>
              Open Media Table
            </Button>
            <Button variant="outlined" onClick={() => setIgnoredDialogOpen(true)}>
              View Ignored Random Screenshots
            </Button>
            <Box
              sx={{
                border: '1px solid #ddd',
                borderRadius: 1.5,
                p: 2,
                backgroundColor: '#fafafa',
              }}
            >
              <Stack spacing={1.5}>
                <Typography variant="subtitle2">
                  Update Media Item Drive Letters
                </Typography>
                <Stack direction="row" spacing={1.5}>
                  <TextField
                    select
                    label="From Drive"
                    fullWidth
                    value={fromDriveLetter}
                    onChange={(e) => setFromDriveLetter(e.target.value)}
                  >
                    {driveLetterOptions.map((letter) => (
                      <MenuItem key={`from-drive-${letter}`} value={letter}>
                        {letter}:
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    label="To Drive"
                    fullWidth
                    value={toDriveLetter}
                    onChange={(e) => setToDriveLetter(e.target.value)}
                  >
                    {driveLetterOptions.map((letter) => (
                      <MenuItem key={`to-drive-${letter}`} value={letter}>
                        {letter}:
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                <Button
                  variant="contained"
                  onClick={handleUpdateDriveLetters}
                  disabled={fromDriveLetter === toDriveLetter}
                >
                  Update Drive Letters
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Example: change all media item paths from {fromDriveLetter}:\ to {toDriveLetter}:\ while keeping the rest of each path unchanged.
                </Typography>
                {driveLetterUpdateResult && (
                  <Typography variant="body2" color="text.secondary">
                    Last update: scanned {driveLetterUpdateResult.scanned}, updated {driveLetterUpdateResult.updated}.
                  </Typography>
                )}
              </Stack>
            </Box>
            <Typography variant="body2" color="text.secondary">
              If no database exists yet, select an existing SQLite database or create a new one here.
            </Typography>
            {migrationResult?.ok && (
              <>
                <Typography variant="body2" color="text.secondary">
                  Last migration: scanned {migrationResult.scanned}, matched {migrationResult.matched}, inserted {migrationResult.inserted}, unmatched {migrationResult.unmatched.length}.
                </Typography>
                {migrationResult.unmatched.length > 0 ? (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 2,
                    }}
                  >
                    {migrationResult.unmatched.map((item) => (
                      <Box
                        key={item.file_path}
                        onClick={() => window.electronAPI.openFileLocation(item.file_path)}
                        sx={{
                          border: '1px solid #ddd',
                          borderRadius: 1,
                          p: 1,
                          cursor: 'pointer',
                          backgroundColor: '#fff',
                        }}
                      >
                        <Box
                          component="img"
                          src={`file://${item.file_path}`}
                          alt={item.file_name}
                          sx={{
                            width: '100%',
                            height: 140,
                            objectFit: 'cover',
                            borderRadius: 1,
                            backgroundColor: '#f5f5f5',
                            mb: 1,
                          }}
                        />
                        <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                          {item.file_name}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <TextField
                    label="Unmatched Screenshots"
                    fullWidth
                    margin="dense"
                    value="All scanned screenshots were matched to media items."
                    InputProps={{ readOnly: true }}
                  />
                )}
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>
      <IgnoredScreenshotsDialog open={ignoredDialogOpen} onClose={() => setIgnoredDialogOpen(false)} />
    </>
  );
}
