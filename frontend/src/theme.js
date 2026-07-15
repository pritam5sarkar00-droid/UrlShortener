import { createTheme } from '@mui/material/styles';

// "Signal & Ink" - see PROJECT design notes. Warm amber is reserved
// strictly for liveness/activity signals (the Live badge, real-time
// updates); everything else in the UI stays in the cool ink/sapphire range
// so the one warm accent keeps meaning something.
export const tokens = {
  sapphire: '#4147D5',
  sapphireLight: '#6B70E8',
  amber: '#F2A93B', // reserved exclusively for the Live/activity signal - referenced directly, never through palette.warning
  ochre: '#B08B2E', // muted, distinct from amber - used for the "expired" status specifically
  teal: '#3FB68B',
  danger: '#E5484D',
  ink: '#0E1116',
  inkSurface: '#161B22',
  inkSurfaceRaised: '#1D2430',
  inkBorder: '#2A3341',
  paper: '#F5F6F8',
  paperSurface: '#FFFFFF',
  paperBorder: '#E4E6EC',
};

const fontDisplay = '"Space Grotesk", "Inter", "Segoe UI", sans-serif';
const fontBody = '"Inter", "Segoe UI", system-ui, sans-serif';
export const fontMono = '"JetBrains Mono", "Fira Code", Menlo, monospace';

export function getTheme(mode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: { main: isDark ? tokens.sapphireLight : tokens.sapphire },
      success: { main: tokens.teal },
      warning: { main: tokens.ochre },
      error: { main: tokens.danger },
      background: {
        default: isDark ? tokens.ink : tokens.paper,
        paper: isDark ? tokens.inkSurface : tokens.paperSurface,
      },
      divider: isDark ? tokens.inkBorder : tokens.paperBorder,
      text: isDark
        ? { primary: '#EDEEF2', secondary: '#9AA1AE' }
        : { primary: '#14161A', secondary: '#5B6270' },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: fontBody,
      h1: { fontFamily: fontDisplay }, h2: { fontFamily: fontDisplay },
      h3: { fontFamily: fontDisplay }, h4: { fontFamily: fontDisplay },
      h5: { fontFamily: fontDisplay, fontWeight: 700 },
      h6: { fontFamily: fontDisplay, fontWeight: 600 },
      button: { fontFamily: fontDisplay, fontWeight: 600, textTransform: 'none' },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, paddingTop: 9, paddingBottom: 9 },
          contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${isDark ? tokens.inkBorder : tokens.paperBorder}`,
          },
        },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? tokens.ink : tokens.paper,
            backgroundImage: 'none',
          },
        },
      },
    },
  });
}
