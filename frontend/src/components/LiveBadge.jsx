import { Box, Chip } from '@mui/material';
import { tokens } from '../theme.js';

// The one place the "Signal" half of the Signal & Ink concept actually
// animates - a soft pulsing glow, used nowhere else in the app. It's tied
// directly to the real Socket.io connection status (see useRealtimeClicks),
// not decorative: when this pulses, live updates are genuinely flowing.
export function LiveBadge({ connected }) {
  return (
    <Chip
      size="small"
      variant={connected ? 'filled' : 'outlined'}
      label={connected ? 'Live' : 'Offline'}
      icon={
        connected ? (
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: '#fff',
              animation: 'shorty-pulse 1.8s ease-in-out infinite',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              '@keyframes shorty-pulse': {
                '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,255,255,0.55)' },
                '50%': { boxShadow: '0 0 0 4px rgba(255,255,255,0)' },
              },
            }}
          />
        ) : undefined
      }
      sx={{
        height: 22,
        fontSize: 11,
        fontWeight: 700,
        ...(connected && { bgcolor: tokens.amber, color: '#1a1200' }),
      }}
    />
  );
}
