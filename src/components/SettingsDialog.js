import { useEffect, useState } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, Stack, TextField, Typography } from '@mui/material';
import IgnoredScreenshotsDialog from './IgnoredScreenshotsDialog';

export default function SettingsDialog({ open, onClose }) {
  const [settings, setSettings] = useState({
    default_screens_per_row: 3,
    screens_load_per_item: 12,
    random_images: 60,
    database_file: '',
    requested_database_file: '',
  });
  const [migrationResult, setMigrationResult] = useState(null);
  const [ignoredDialogOpen, setIgnoredDialogOpen] = useState(false);

  useEffect(() => {
    if (open) {
      window.electronAPI.getAppSettings().then((loadedSettings) => {
        setSettings((prev) => ({ ...prev, ...loadedSettings }));
      });
      setMigrationResult(null);
    }
  }, [open]);

  const handleChange = (key) => (e) => {
    const value = parseInt(e.target.value, 10);
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
      alert(result.message || 'Screenshot migration could not be started.');
      return;
    }

    alert(
      `Screenshot migration complete.\n\nFolder: ${result.folder}\nScanned: ${result.scanned}\nMatched to media items: ${result.matched}\nInserted into database: ${result.inserted}\nUnmatched: ${result.unmatched.length}`
    );
  };

  return (
    <>
      <Dialog open={open} onClose={onClose}>
        <DialogTitle>App Settings</DialogTitle>
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
