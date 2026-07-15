import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Tooltip,
  Typography,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { QrCodeDialog } from './QrCodeDialog.jsx';
import { fontMono } from '../theme.js';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '');

export function LinksTable({ links, onDelete, onPermanentDelete }) {
  const [qrTarget, setQrTarget] = useState(null); // { url, label } | null
  const [confirmCode, setConfirmCode] = useState(null); // shortCode | null
  const [confirmPermanentCode, setConfirmPermanentCode] = useState(null); // shortCode | null

  function handleConfirmDelete() {
    onDelete(confirmCode);
    setConfirmCode(null);
  }

  function handleConfirmPermanentDelete() {
    onPermanentDelete(confirmPermanentCode);
    setConfirmPermanentCode(null);
  }

  if (links.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No links yet - create one above.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Short link</TableCell>
            <TableCell>Destination</TableCell>
            <TableCell>Category</TableCell>
            <TableCell align="right">Clicks</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">Created</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {links.map((link) => {
            const shortUrl = `${API_BASE}/${link.shortCode}`;
            // A link can be expired before the daily cron gets around to
            // flipping is_active - the backend computes isExpired directly
            // from expires_at, so the dashboard reflects reality immediately
            // rather than waiting up to 24h for the sweep to catch up.
            const isDead = !link.isActive || link.isExpired;
            const statusLabel = !link.isActive ? 'deleted' : link.isExpired ? 'expired' : 'active';
            const statusColor = !link.isActive ? 'default' : link.isExpired ? 'warning' : 'success';
            return (
              <TableRow key={link.shortCode} hover>
                <TableCell>
                  <Typography
                    component="a"
                    href={shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="body2"
                    sx={{
                      fontFamily: fontMono,
                      fontWeight: 600,
                      textDecoration: isDead ? 'line-through' : 'none',
                      color: isDead ? 'text.disabled' : 'inherit',
                      pointerEvents: isDead ? 'none' : 'auto',
                    }}
                  >
                    /{link.shortCode}
                  </Typography>
                  <IconButton size="small" onClick={() => navigator.clipboard.writeText(shortUrl)} disabled={isDead}>
                    <ContentCopyIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </TableCell>
                <TableCell sx={{ maxWidth: 260 }}>
                  {link.title && (
                    <Tooltip title={link.summary || ''} disableHoverListener={!link.summary}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {link.title}
                      </Typography>
                    </Tooltip>
                  )}
                  <Tooltip title={link.longUrl}>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {link.longUrl}
                    </Typography>
                  </Tooltip>
                  {link.readingTimeMinutes && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {link.readingTimeMinutes} min read
                    </Typography>
                  )}
                  {link.keyTopics?.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                      {link.keyTopics.map((topic, idx) => (
                        <Chip key={`${topic}-${idx}`} label={topic} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5, fontSize: 10, height: 18 }} />
                      ))}
                    </Box>
                  )}
                </TableCell>
                <TableCell>
                  {link.category && (
                    <Chip size="small" label={link.category} variant="outlined" sx={{ mr: 0.5 }} />
                  )}
                </TableCell>
                <TableCell align="right">{link.clickCount}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={statusLabel}
                    color={statusColor}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="caption" color="text.secondary">
                    {new Date(link.createdAt).toLocaleDateString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={() => setQrTarget({ url: shortUrl, label: link.shortCode })}
                    aria-label="qr code"
                    disabled={isDead}
                  >
                    <QrCode2Icon fontSize="small" />
                  </IconButton>
                  {link.isActive ? (
                    <IconButton size="small" onClick={() => setConfirmCode(link.shortCode)} aria-label="delete">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  ) : (
                    <Tooltip title="Permanently delete">
                      <IconButton
                        size="small"
                        onClick={() => setConfirmPermanentCode(link.shortCode)}
                        aria-label="permanently delete"
                        color="error"
                      >
                        <DeleteForeverIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <QrCodeDialog
        open={!!qrTarget}
        onClose={() => setQrTarget(null)}
        url={qrTarget?.url}
        label={qrTarget?.label}
      />
      <Dialog open={!!confirmCode} onClose={() => setConfirmCode(null)}>
        <DialogTitle>Delete this link?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>/{confirmCode}</strong> will stop redirecting immediately. Its click
            history is kept and the link can be viewed later under "Show deleted links."
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCode(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!confirmPermanentCode} onClose={() => setConfirmPermanentCode(null)}>
        <DialogTitle>Permanently delete this link?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>/{confirmPermanentCode}</strong> and its click history will be removed
            for good. This cannot be undone - there is no way to recover it afterward.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPermanentCode(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleConfirmPermanentDelete}>
            Delete forever
          </Button>
        </DialogActions>
      </Dialog>
    </TableContainer>
  );
}
