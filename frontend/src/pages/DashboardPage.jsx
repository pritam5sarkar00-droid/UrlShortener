import { useEffect, useState, useCallback } from 'react';
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Stack,
  FormControlLabel,
  Switch,
  Snackbar,
} from '@mui/material';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { useRealtimeClicks } from '../hooks/useRealtimeClicks.js';
import { CreateLinkForm } from '../components/CreateLinkForm.jsx';
import { LinksTable } from '../components/LinksTable.jsx';
import { ClicksChart } from '../components/ClicksChart.jsx';
import { LiveBadge } from '../components/LiveBadge.jsx';

export function DashboardPage() {
  const { token, user } = useAuth();
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const loadLinks = useCallback(async () => {
    try {
      const data = await api.listLinks(token);
      setLinks(data.links);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // Update the specific link's click count in place as events arrive - no
  // refetch needed, so this scales fine even with many links on screen.
  // The delete handlers cover the SAME account acting from another tab or
  // device - e.g. deleting a link on your phone updates this dashboard too,
  // live, without a manual refresh.
  const { connected: liveConnected } = useRealtimeClicks(token, {
    onClick: useCallback((shortCode, clickCount) => {
      setLinks((prev) => prev.map((l) => (l.shortCode === shortCode ? { ...l, clickCount } : l)));
    }, []),
    onDeleted: useCallback((shortCode) => {
      setLinks((prev) => prev.map((l) => (l.shortCode === shortCode ? { ...l, isActive: false } : l)));
    }, []),
    onPermanentlyDeleted: useCallback((shortCode) => {
      setLinks((prev) => prev.filter((l) => l.shortCode !== shortCode));
    }, []),
    // Background enrichment (title/category/AI summary) finishes well after
    // the create response and this page's own post-create refetch, so
    // without this the row would only ever pick up those fields on a
    // manual reload - and only if enrichment had already finished by then.
    onEnriched: useCallback((payload) => {
      setLinks((prev) =>
        prev.map((l) =>
          l.shortCode === payload.shortCode
            ? {
                ...l,
                title: payload.title,
                category: payload.category,
                summary: payload.summary,
                keyTopics: payload.keyTopics,
                readingTimeMinutes: payload.readingTimeMinutes,
              }
            : l
        )
      );
    }, []),
  });

  async function handleDelete(code) {
    try {
      await api.deleteLink(token, code);
      setLinks((prev) =>
        prev.map((l) => (l.shortCode === code ? { ...l, isActive: false } : l))
      );
      setSuccessMessage('Link deleted');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handlePermanentDelete(code) {
    try {
      await api.permanentDeleteLink(token, code);
      setLinks((prev) => prev.filter((l) => l.shortCode !== code));
      setSuccessMessage('Link permanently deleted');
    } catch (err) {
      setError(err.message);
    }
  }

  // Deleted links are kept (soft delete, so click history is never lost -
  // see the backend design notes), but hidden from view by default since
  // "delete" should visibly remove something. The toggle below is the
  // escape hatch for anyone who wants to see what they've removed.
  const inactiveCount = links.filter((l) => !l.isActive).length;
  const activeLinks = links.filter((l) => l.isActive);
  const visibleLinks = showInactive ? links : activeLinks;

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 6 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Your links
        </Typography>
        <LiveBadge connected={liveConnected} />
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {user?.email}
      </Typography>

      <CreateLinkForm onCreated={loadLinks} links={links} />

      {error && (
        <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ mt: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <>
            {inactiveCount > 0 && (
              <FormControlLabel
                sx={{ mb: 1 }}
                control={
                  <Switch
                    size="small"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                  />
                }
                label={
                  <Typography variant="body2" color="text.secondary">
                    Show {inactiveCount} deleted link{inactiveCount === 1 ? '' : 's'}
                  </Typography>
                }
              />
            )}
            <LinksTable links={visibleLinks} onDelete={handleDelete} onPermanentDelete={handlePermanentDelete} />
            <ClicksChart links={activeLinks} />
          </>
        )}
      </Box>

      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        message={successMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Container>
  );
}
