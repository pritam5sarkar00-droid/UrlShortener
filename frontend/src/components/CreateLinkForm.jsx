import { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Stack,
  Alert,
  Paper,
  Typography,
  IconButton,
  Divider,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { QrCodeDialog } from './QrCodeDialog.jsx';
import { fontMono } from '../theme.js';

export function CreateLinkForm({ onCreated, links }) {
  const { token, user } = useAuth();
  const [longUrl, setLongUrl] = useState('');
  const [customAlias, setCustomAlias] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // If the link just shown here gets deleted elsewhere on the page (the
  // table below, or a real-time event from another tab/device), stop
  // showing it as if it still works. Checking specifically for isActive
  // === false (not just "missing from the list") avoids a false clear
  // right after creation: a brand new link is never inactive, only an
  // actual deletion ever makes that transition, so this can't race against
  // the dashboard's own refetch.
  useEffect(() => {
    if (!result || !links) return;
    const match = links.find((l) => l.shortCode === result.shortCode);
    if (match && match.isActive === false) {
      setResult(null);
    }
  }, [links, result]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    setSubmitting(true);
    try {
      const payload = { longUrl };
      if (user && customAlias.trim()) payload.customAlias = customAlias.trim();
      if (user && expiresInDays) payload.expiresInDays = Number(expiresInDays);

      const data = await api.createLink(token, payload);
      setResult(data);
      setLongUrl('');
      setCustomAlias('');
      setExpiresInDays('');
      onCreated?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result.shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 3.5 }, borderRadius: 3 }}>
      <Box component="form" onSubmit={handleSubmit}>
        <Stack spacing={2.25}>
          <TextField
            label="Paste a long URL"
            placeholder="https://example.com/a/very/long/path"
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
            required
            fullWidth
            type="url"
          />

          {user ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Custom alias (optional)"
                placeholder="my-brand"
                value={customAlias}
                onChange={(e) => setCustomAlias(e.target.value)}
                fullWidth
                helperText="3-20 letters, numbers, _ or -"
                slotProps={{ input: { sx: { fontFamily: fontMono, fontSize: 14 } } }}
              />
              <TextField
                label="Expires in (days)"
                placeholder="365"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                type="number"
                fullWidth
              />
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Sign up to pick a custom alias and manage your links later.
            </Typography>
          )}

          <Button type="submit" variant="contained" size="large" disabled={submitting}>
            {submitting ? 'Shortening...' : 'Shorten'}
          </Button>

          {error && <Alert severity="error">{error}</Alert>}

          {result && (
            <Paper
              variant="outlined"
              sx={{
                borderRadius: 2.5,
                overflow: 'hidden',
                borderColor: 'success.main',
                borderStyle: 'dashed',
              }}
            >
              <Box sx={{ px: 2.25, py: 1.75 }}>
                <Stack direction="row" alignItems="center" spacing={1.25}>
                  <Typography
                    component="a"
                    href={result.shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      fontFamily: fontMono,
                      fontWeight: 600,
                      fontSize: 15,
                      color: 'text.primary',
                      textDecoration: 'none',
                      flexGrow: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {result.shortUrl}
                  </Typography>
                  <IconButton size="small" onClick={handleCopy} aria-label="copy">
                    {copied ? (
                      <CheckRoundedIcon fontSize="small" color="success" />
                    ) : (
                      <ContentCopyIcon fontSize="small" />
                    )}
                  </IconButton>
                  <IconButton size="small" onClick={() => setQrOpen(true)} aria-label="qr code">
                    <QrCode2Icon fontSize="small" />
                  </IconButton>
                </Stack>
              </Box>
              <Divider sx={{ borderStyle: 'dashed' }} />
              <Box sx={{ px: 2.25, py: 0.75, bgcolor: 'action.hover' }}>
                <Typography variant="caption" color="text.secondary">
                  Ready to share - your link is live
                </Typography>
              </Box>
            </Paper>
          )}
        </Stack>
      </Box>
      {result && (
        <QrCodeDialog
          open={qrOpen}
          onClose={() => setQrOpen(false)}
          url={result.shortUrl}
          label={result.shortCode}
        />
      )}
    </Paper>
  );
}
